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

    const contentType = response.headers.get("content-type") || "";
    const baseType = contentType.split(";")[0].trim();

    // Serve RAW content for non-HTML (images, js, css, etc.)
    if (!baseType.includes("text/html")) {
      const buffer = Buffer.from(await response.arrayBuffer());
      res.setHeader("Content-Type", baseType || "application/octet-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.status(200).send(buffer);
    }

    // If HTML, rewrite it
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

    // Rewrite src, href, and poster
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

    // Rewrite inline style attributes
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

    // Remove CSP and integrity for compatibility
    $('meta[http-equiv="Content-Security-Policy"]').remove();
    $('script[integrity], link[integrity]').removeAttr('integrity');

    // ✅ Inject override JS for fetch and XHR
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

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).send($.html());

  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).send("Proxy error: " + err.message);
  }
}
