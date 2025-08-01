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

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/html')) {
      const html = await response.text();
      const $ = cheerio.load(html);

      // Strip CSP, integrity attributes
      $('meta[http-equiv="Content-Security-Policy"]').remove();
      $('script[integrity], link[integrity]').removeAttr('integrity');

      // Rewrite src, srcset, href, inline styles, <style> urls
      const rewriteUrl = urlStr => {
        try {
          const abs = new URL(urlStr, target).toString();
          return `/api/proxy?url=${encodeURIComponent(abs)}`;
        } catch {
          return urlStr;
        }
      };

      $('[src]').each((_, el) => {
        const v = $(el).attr('src');
        if (v) $(el).attr('src', rewriteUrl(v));
      });

      $('[srcset]').each((_, el) => {
        const ss = $(el).attr('srcset');
        if (ss) {
          const newss = ss.split(',').map(p => {
            const [u, d] = p.trim().split(/\s+/);
            return `${rewriteUrl(u)}${d ? ' ' + d : ''}`;
          }).join(', ');
          $(el).attr('srcset', newss);
        }
      });

      $('[href]').each((_, el) => {
        const v = $(el).attr('href');
        if (v && !v.startsWith('javascript:') && !v.startsWith('mailto:') && !v.startsWith('#')) {
          $(el).attr('href', rewriteUrl(v));
        }
      });

      $('[style]').each((_, el) => {
        const s = $(el).attr('style');
        if (s) {
          const fixed = s.replace(/url\((['"]?)([^'")]+)\1\)/g, (m, q, u) => {
            return `url(${q}${rewriteUrl(u)}${q})`;
          });
          $(el).attr('style', fixed);
        }
      });

      $('style').each((_, el) => {
        let css = $(el).html() || '';
        css = css.replace(/url\((['"]?)([^'")]+)\1\)/g, (m, q, u) => {
          return `url(${q}${rewriteUrl(u)}${q})`;
        });
        $(el).html(css);
      });

      // Inject fetch/XHR override inside <head>
      $('head').prepend(`
        <script>
        (() => {
          const base = '${target}';
          function toProxy(url) {
            try {
              return '/api/proxy?url=' + encodeURIComponent(new URL(url, base).toString());
            } catch {
              return url;
            }
          }
          const _fetch = window.fetch;
          window.fetch = function(r, init) {
            if (typeof r === 'string') r = toProxy(r);
            else if (r instanceof Request) r = new Request(toProxy(r.url), r);
            return _fetch(r, init);
          };
          const o = XMLHttpRequest.prototype.open;
          XMLHttpRequest.prototype.open = function(m, u, ...rest) {
            return o.call(this, m, toProxy(u), ...rest);
          };
        })();
        </script>
      `);

      res.setHeader('Content-Type', 'text/html; charset=utf‑8');
      res.setHeader('Cache‑Control', 'no‑cache');
      res.setHeader('Access‑Control‑Allow‑Origin', '*');
      return res.status(200).send($.html());
    }

    // Non‑HTML (images/css/js/json)
    const buf = Buffer.from(await response.arrayBuffer());
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache‑Control': 'no‑cache',
      'Access‑Control‑Allow‑Origin': '*',
    });
    return res.end(buf);

  } catch (err) {
    console.error('Proxy error', err);
    return res.status(500).send(`Proxy error: ${err.message}`);
  }
}
