import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  const target = req.query.url;
  if (!target) return res.status(400).send("Missing `url` query param.");

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
    const contentType = rawContentType.split(';')[0].trim();

    // If HTML, modify it
    if (contentType.includes('text/html')) {
      const html = await response.text();
      const $ = cheerio.load(html);

      const rewriteUrl = (url) => {
        try {
          const abs = new URL(url, target).toString();
          return `/api/proxy?url=${encodeURIComponent(abs)}`;
        } catch {
          return url;
        }
      };

      // Clean security headers
      $('meta[http-equiv="Content-Security-Policy"]').remove();
      $('script[integrity], link[integrity]').removeAttr('integrity');

      // Rewrite all resource URLs
      $('[src], [href], [poster]').each((_, el) => {
        const $el = $(el);
        const attr = $el.attr('src') ? 'src' : $el.attr('href') ? 'href' : 'poster';
        const val = $el.attr(attr);
        if (
          val &&
          !val.startsWith('javascript:') &&
          !val.startsWith('mailto:') &&
          !val.startsWith('#')
        ) {
          $el.attr(attr, rewriteUrl(val));
        }
      });

      // Rewrite inline style URLs
      $('[style]').each((_, el) => {
        const style = $(el).attr('style');
        if (style) {
          const updated = style.replace(/url\((['"]?)([^'")]+)\1\)/g, (_, q, u) =>
            `url(${q}${rewriteUrl(u)}${q})`
          );
          $(el).attr('style', updated);
        }
      });

      // Rewrite <style> blocks
      $('style').each((_, el) => {
        const css = $(el).html();
        if (css) {
          const updated = css.replace(/url\((['"]?)([^'")]+)\1\)/g, (_, q, u) =>
            `url(${q}${rewriteUrl(u)}${q})`
          );
          $(el).html(updated);
        }
      });

      // Inject JS override for fetch and XHR
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
            if (typeof input === 'string') input = toProxy(input);
            else if (input instanceof Request) input = new Request(toProxy(input.url), input);
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

    // For static assets (icons, css, js, fonts, etc.)
    const buffer = Buffer.from(await response.arrayBuffer());

    // Sanitize headers
    const safeContentType = /^[\x20-\x7E]+$/.test(contentType)
      ? contentType
      : 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': safeContentType,
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    });

    return res.end(buffer);

  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).send("Proxy error: " + err.message);
  }
}
