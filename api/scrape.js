import * as cheerio from 'cheerio';
import HttpsProxyAgent from 'https-proxy-agent';

export default async function handler(req, res) {
  const target = req.query.url;
  if (!target) return res.status(400).send("Missing `url` query param.");

  // Optional: Add a proxy here if needed
  // const proxyAgent = new HttpsProxyAgent('http://username:password@proxyserver:port');

  const headers = {
    'User-Agent': req.headers['user-agent'] || 
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': target,
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
  };

  // Retry fetch function
  async function fetchWithRetry(url, options, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const resp = await fetch(url, options);
        if (resp.ok) return resp;
        console.log(`Attempt ${i + 1} failed with status ${resp.status}`);
      } catch (e) {
        console.log(`Attempt ${i + 1} fetch error: ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 500)); // wait 0.5s
    }
    throw new Error(`Failed to fetch ${url} after ${retries} retries`);
  }

  try {
    const response = await fetchWithRetry(target, {
      headers,
      // agent: proxyAgent // uncomment if using proxy
    });

    const rawContentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentType = rawContentType.split(';')[0].trim();

    const isSameOrigin = (url) => {
      try {
        const abs = new URL(url, target).toString();
        return abs.startsWith(new URL(target).origin);
      } catch {
        return false;
      }
    };

    const rewriteUrl = (url) => {
      try {
        const abs = new URL(url, target).toString();
        if (!abs.startsWith(new URL(target).origin)) return abs;
        return `/api/scarpe?url=${encodeURIComponent(abs)}`;
      } catch {
        return url;
      }
    };

    if (contentType.includes('text/html')) {
      const html = await response.text();
      const $ = cheerio.load(html);

      $('meta[http-equiv="Content-Security-Policy"]').remove();
      $('script[integrity], link[integrity]').removeAttr('integrity');

      $('[src], [href], [poster]').each((_, el) => {
        const $el = $(el);
        const attr = $el.attr('src') ? 'src' : $el.attr('href') ? 'href' : 'poster';
        const val = $el.attr(attr);
        if (val && !val.startsWith('javascript:') && !val.startsWith('mailto:') && !val.startsWith('#')) {
          $el.attr(attr, rewriteUrl(val));
        }
      });

      $('[style]').each((_, el) => {
        const style = $(el).attr('style');
        if (style) {
          const updated = style.replace(/url\((['"]?)([^'")]+)\1\)/g, (_, q, u) =>
            `url(${q}${rewriteUrl(u)}${q})`
          );
          $(el).attr('style', updated);
        }
      });

      $('style').each((_, el) => {
        const css = $(el).html();
        if (css) {
          const updated = css.replace(/url\((['"]?)([^'")]+)\1\)/g, (_, q, u) =>
            `url(${q}${rewriteUrl(u)}${q})`
          );
          $(el).html(updated);
        }
      });

      $('head').prepend(`
        <script>
          (() => {
            const base = '${target}';
            const origin = new URL(base).origin;

            function toProxy(url) {
              try {
                const abs = new URL(url, base).toString();
                if (!abs.startsWith(origin)) return abs;
                return '/api/proxy?url=' + encodeURIComponent(abs);
              } catch {
                return url;
              }
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

    // Non-HTML content
    const buffer = Buffer.from(await response.arrayBuffer());
    res.writeHead(200, {
      'Content-Type': /^[\x20-\x7E]+$/.test(contentType) ? contentType : 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    });
    return res.end(buffer);

  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).send("Proxy error: " + err.message);
  }
}
