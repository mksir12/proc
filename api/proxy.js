import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  const target = req.query.url;

  if (!target) {
    res.status(400).send("Missing `url` query param.");
    return;
  }

  try {
    const response = await fetch(target, {
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': '*/*',
        'Referer': target,
      }
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '[no response body]');
      res.status(response.status).send(`HTTP error! Status: ${response.status} - ${text}`);
      return;
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    if (contentType.includes('text/html')) {
      const html = await response.text();
      const $ = cheerio.load(html);

      // Remove restrictive headers/meta
      $('meta[http-equiv="Content-Security-Policy"]').remove();
      $('script[integrity], link[integrity]').removeAttr('integrity');

      // Rewrite src
      $('[src]').each((_, el) => {
        const src = $(el).attr('src');
        if (src) {
          try {
            const absolute = new URL(src, target).toString();
            $(el).attr('src', `/api/proxy?url=${encodeURIComponent(absolute)}`);
          } catch {}
        }
      });

      // Rewrite srcset
      $('[srcset]').each((_, el) => {
        const srcset = $(el).attr('srcset');
        if (srcset) {
          const rewritten = srcset
            .split(',')
            .map(part => {
              const [url, descriptor] = part.trim().split(/\s+/);
              try {
                const absolute = new URL(url, target).toString();
                return `/api/proxy?url=${encodeURIComponent(absolute)} ${descriptor || ''}`;
              } catch {
                return part;
              }
            })
            .join(', ');
          $(el).attr('srcset', rewritten);
        }
      });

      // Rewrite href
      $('[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (
          href &&
          !href.startsWith('javascript:') &&
          !href.startsWith('mailto:') &&
          !href.startsWith('#')
        ) {
          try {
            const absolute = new URL(href, target).toString();
            $(el).attr('href', `/api/proxy?url=${encodeURIComponent(absolute)}`);
          } catch {}
        }
      });

      // Inline styles
      $('[style]').each((_, el) => {
        const style = $(el).attr('style');
        if (style) {
          const updated = style.replace(/url\((['"]?)([^'")]+)\1\)/g, (_, quote, url) => {
            try {
              const absolute = new URL(url, target).toString();
              return `url(${quote}/api/proxy?url=${encodeURIComponent(absolute)}${quote})`;
            } catch {
              return _;
            }
          });
          $(el).attr('style', updated);
        }
      });

      // Style blocks
      $('style').each((_, el) => {
        const content = $(el).html();
        if (content) {
          const updated = content.replace(/url\((['"]?)([^'")]+)\1\)/g, (_, quote, url) => {
            try {
              const absolute = new URL(url, target).toString();
              return `url(${quote}/api/proxy?url=${encodeURIComponent(absolute)}${quote})`;
            } catch {
              return _;
            }
          });
          $(el).html(updated);
        }
      });

      // JS override
      $('head').prepend(`
        <script>
          (() => {
            const base = '${target}';
            const toProxy = u => {
              try {
                return '/api/proxy?url=' + encodeURIComponent(new URL(u, base).toString());
              } catch {
                return u;
              }
            };
            const origFetch = window.fetch;
            window.fetch = (r, i) => {
              if (typeof r === 'string') r = toProxy(r);
              else if (r instanceof Request) r = new Request(toProxy(r.url), r);
              return origFetch(r, i);
            };
            const origOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(m, u, ...a) {
              try { u = toProxy(u); } catch {}
              return origOpen.call(this, m, u, ...a);
            };
          })();
        </script>
      `);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(200).send($.html());

    } else {
      // Binary/static file (e.g. image, JS, CSS, etc.)
      const buffer = Buffer.from(await response.arrayBuffer());

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': buffer.length,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(buffer);
    }

  } catch (err) {
    console.error("Proxy Error:", err);
    res.status(500).send("Proxy error: " + (err?.message || 'Unknown error'));
  }
}
