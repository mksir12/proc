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

    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    if (!response.ok) {
      return res.status(500).send("Failed to fetch the target URL.");
    }

    if (contentType.includes('text/html')) {
      const html = await response.text();
      const $ = cheerio.load(html);

      $('meta[http-equiv="Content-Security-Policy"]').remove();
      $('script[integrity], link[integrity]').removeAttr('integrity');

      // src
      $('[src]').each((_, el) => {
        const src = $(el).attr('src');
        if (src) {
          try {
            const abs = new URL(src, target).toString();
            $(el).attr('src', `/api/proxy?url=${encodeURIComponent(abs)}`);
          } catch {}
        }
      });

      // srcset
      $('[srcset]').each((_, el) => {
        const srcset = $(el).attr('srcset');
        if (srcset) {
          const rewritten = srcset
            .split(',')
            .map(part => {
              const [url, descriptor] = part.trim().split(/\s+/);
              try {
                const abs = new URL(url, target).toString();
                return `/api/proxy?url=${encodeURIComponent(abs)} ${descriptor || ''}`;
              } catch {
                return part;
              }
            })
            .join(', ');
          $(el).attr('srcset', rewritten);
        }
      });

      // href
      $('[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (
          href &&
          !href.startsWith('javascript:') &&
          !href.startsWith('mailto:') &&
          !href.startsWith('#')
        ) {
          try {
            const abs = new URL(href, target).toString();
            $(el).attr('href', `/api/proxy?url=${encodeURIComponent(abs)}`);
          } catch {}
        }
      });

      // inline style
      $('[style]').each((_, el) => {
        const style = $(el).attr('style');
        if (style) {
          const updated = style.replace(/url\((['"]?)([^'")]+)\1\)/g, (_, q, u) => {
            try {
              const abs = new URL(u, target).toString();
              return `url(${q}/api/proxy?url=${encodeURIComponent(abs)}${q})`;
            } catch {
              return _;
            }
          });
          $(el).attr('style', updated);
        }
      });

      // <style> tags
      $('style').each((_, el) => {
        const style = $(el).html();
        if (style) {
          const updated = style.replace(/url\((['"]?)([^'")]+)\1\)/g, (_, q, u) => {
            try {
              const abs = new URL(u, target).toString();
              return `url(${q}/api/proxy?url=${encodeURIComponent(abs)}${q})`;
            } catch {
              return _;
            }
          });
          $(el).html(updated);
        }
      });

      // Inject JS override
      $('head').prepend(`
        <script>
          (() => {
            const base = '${target}';

            function toProxy(url) {
              try {
                const abs = new URL(url, base);
                return '/api/proxy?url=' + encodeURIComponent(abs.toString());
              } catch {
                return url;
              }
            }

            const origFetch = window.fetch;
            window.fetch = function(resource, init) {
              if (typeof resource === 'string') {
                resource = toProxy(resource);
              } else if (resource instanceof Request) {
                const newUrl = toProxy(resource.url);
                resource = new Request(newUrl, resource);
              }
              return origFetch(resource, init);
            };

            const origXhrOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url, ...rest) {
              url = toProxy(url);
              return origXhrOpen.call(this, method, url, ...rest);
            };
          })();
        </script>
      `);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('X-Powered-By', 'JerryCoder-Proxy');
      return res.status(200).send($.html());
    } else {
      const buffer = Buffer.from(await response.arrayBuffer());
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'X-Powered-By': 'JerryCoder-Proxy',
      });
      return res.end(buffer);
    }
  } catch (e) {
    return res.status(500).send("Proxy error: " + e.message);
  }
}
