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

      // Remove CSP headers or tags
      $('meta[http-equiv="Content-Security-Policy"]').remove();

      // Rewrite all src attributes (img, script, etc.)
      $('[src]').each((_, el) => {
        const src = $(el).attr('src');
        if (src) {
          try {
            const absoluteUrl = new URL(src, target).toString();
            $(el).attr('src', `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`);
          } catch {
            // skip invalid URLs
          }
        }
      });

      // Rewrite all href attributes (a, link, etc.)
      $('[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (
          href &&
          !href.startsWith('http') &&
          !href.startsWith('#') &&
          !href.startsWith('mailto:') &&
          !href.startsWith('javascript:')
        ) {
          try {
            const absoluteUrl = new URL(href, target).toString();
            $(el).attr('href', `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`);
          } catch {
            // skip invalid URLs
          }
        } else if (href && href.startsWith('http')) {
          $(el).attr('href', `/api/proxy?url=${encodeURIComponent(href)}`);
        }
      });

      // Inject script to override fetch
      $('head').prepend(`
        <script>
          const originalFetch = window.fetch;
          window.fetch = function(resource, init) {
            try {
              if (typeof resource === 'string' && !resource.startsWith('http') && !resource.startsWith('/api/proxy')) {
                resource = '/api/proxy?url=' + encodeURIComponent(new URL(resource, location.href));
              }
            } catch (e) {}
            return originalFetch(resource, init);
          };
        </script>
      `);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('X-Powered-By', 'JerryCoder-Proxy');
      res.status(200).send($.html());

    } else {
      // Proxy non-HTML resources (scripts, images, CSS, etc.)
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
