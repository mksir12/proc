import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  const target = req.query.url;
  if (!target) {
    return res.status(400).send("Missing `url` query param.");
  }

  try {
    const response = await fetch(target, {
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
        'Referer': target,
      },
    });

    if (!response.ok) {
      return res.status(500).send(`Failed to fetch ${target}: ${response.status}`);
    }

    const rawContentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentType = rawContentType.split(';')[0].trim(); // sanitize

    if (contentType.includes('text/html')) {
      const html = await response.text();
      const $ = cheerio.load(html);

      // Clean up HTML (remove CSP, fix asset paths)
      $('meta[http-equiv="Content-Security-Policy"]').remove();
      $('script[integrity], link[integrity]').removeAttr('integrity');

      const rewrite = (url) => {
        try {
          const absolute = new URL(url, target).toString();
          return `/api/proxy?url=${encodeURIComponent(absolute)}`;
        } catch {
          return url;
        }
      };

      $('[src]').each((_, el) => {
        const src = $(el).attr('src');
        if (src) $(el).attr('src', rewrite(src));
      });

      $('[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (
          href &&
          !href.startsWith('javascript:') &&
          !href.startsWith('mailto:') &&
          !href.startsWith('#')
        ) {
          $(el).attr('href', rewrite(href));
        }
      });

      $('[srcset]').each((_, el) => {
        const srcset = $(el).attr('srcset');
        if (srcset) {
          const updated = srcset.split(',').map(part => {
            const [url, size] = part.trim().split(/\s+/);
            return `${rewrite(url)}${size ? ' ' + size : ''}`;
          }).join(', ');
          $(el).attr('srcset', updated);
        }
      });

      $('[style]').each((_, el) => {
        const style = $(el).attr('style');
        if (style) {
          const updated = style.replace(/url\((['"]?)([^'")]+)\1\)/g, (_, q, u) => {
            return `url(${q}${rewrite(u)}${q})`;
          });
          $(el).attr('style', updated);
        }
      });

      $('style').each((_, el) => {
        const style = $(el).html();
        if (style) {
          const updated = style.replace(/url\((['"]?)([^'")]+)\1\)/g, (_, q, u) => {
            return `url(${q}${rewrite(u)}${q})`;
          });
          $(el).html(updated);
        }
      });

      // Inject fetch override to make dynamic calls proxy-safe
      $('head').prepend(`
        <script>
          (() => {
            const base = '${target}';
            function toProxy(url) {
              try {
                return '/api/proxy?url=' + encodeURIComponent(new URL(url, base).toString());
              } catch { return url; }
            }

            const _fetch = window.fetch;
            window.fetch = function(input, init) {
              if (typeof input === 'string') {
                input = toProxy(input);
              } else if (input instanceof Request) {
                input = new Request(toProxy(input.url), input);
              }
              return _fetch(input, init);
            };

            const _open = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url, ...args) {
              return _open.call(this, method, toProxy(url), ...args);
            };
          })();
        </script>
      `);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(200).send($.html());
    }

    // Non-HTML (image, JSON, CSS, JS, fonts, etc.)
    const buffer = Buffer.from(await response.arrayBuffer());

    res.writeHead(200, {
      'Content-Type': contentType || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    });

    return res.end(buffer);

  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).send("Proxy error: " + err.message);
  }
}
