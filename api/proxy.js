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
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
        'Referer': target,
      }
    });

    if (!response.ok) {
      res.status(500).send("Failed to fetch the target URL.");
      return;
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    if (contentType.includes('text/html')) {
      const html = await response.text();
      const $ = cheerio.load(html);

      // Remove any strict CSP that might block scripts
      $('meta[http-equiv="Content-Security-Policy"]').remove();

      // Rewriting src attributes (img, script, etc.)
      $('[src]').each((_, el) => {
        const src = $(el).attr('src');
        if (src) {
          try {
            const absoluteUrl = new URL(src, target).toString();
            $(el).attr('src', `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`);
          } catch {}
        }
      });

      // Rewriting href attributes (a, link, etc.)
      $('[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (
          href &&
          !href.startsWith('javascript:') &&
          !href.startsWith('mailto:') &&
          !href.startsWith('#')
        ) {
          try {
            const absoluteUrl = new URL(href, target).toString();
            $(el).attr('href', `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`);
          } catch {}
        }
      });

      // Inject script to override fetch() and XMLHttpRequest
      $('head').prepend(`
        <script>
          (function() {
            const base = '${target}';

            function toProxyUrl(original) {
              try {
                const abs = new URL(original, base);
                return '/api/proxy?url=' + encodeURIComponent(abs.toString());
              } catch (e) {
                return original;
              }
            }

            const originalFetch = window.fetch;
            window.fetch = function(resource, init) {
              if (typeof resource === 'string') {
                resource = toProxyUrl(resource);
              } else if (resource instanceof Request) {
                const newUrl = toProxyUrl(resource.url);
                resource = new Request(newUrl, resource);
              }
              return originalFetch(resource, init);
            };

            const originalXhrOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url, ...args) {
              try {
                url = toProxyUrl(url);
              } catch {}
              return originalXhrOpen.call(this, method, url, ...args);
            };
          })();
        </script>
      `);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('X-Powered-By', 'JerryCoder-Proxy');
      res.status(200).send($.html());

    } else {
      // Proxy static resources (JS, CSS, JSON, etc.)
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("X-Powered-By", "JerryCoder-Proxy");
      res.status(200).send(buffer);
    }
  } catch (err) {
    res.status(500).send("Proxy error: " + err.message);
  }
}
