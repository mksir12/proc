// api/proxy.js
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  const target = req.query.url;

  if (!target) {
    return res.status(400).send('Missing `url` query parameter.');
  }

  try {
    const response = await fetch(target, {
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
        'Accept': '*/*',
        'Referer': target,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return res.status(response.status)
                .send(`HTTP error! Status: ${response.status} – ${body}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const html = await response.text();
      const $ = cheerio.load(html);

      $('meta[http-equiv="Content-Security-Policy"]').remove();
      $('script[integrity], link[integrity]').removeAttr('integrity');

      const rewriteAttr = (el, attr) => {
        const val = $(el).attr(attr);
        if (val) {
          try {
            const absolute = new URL(val, target).toString();
            $(el).attr(attr, `/api/proxy?url=${encodeURIComponent(absolute)}`);
          } catch {}
        }
      };

      $('[src]').each((_, el) => rewriteAttr(el, 'src'));
      $('[srcset]').each((_, el) => {
        const srcset = $(el).attr('srcset') || '';
        const rewritten = srcset.split(',').map(pair => {
          const [url, desc] = pair.trim().split(/\s+/);
          try {
            const abs = new URL(url, target).toString();
            return `/api/proxy?url=${encodeURIComponent(abs)}${desc ? ' ' + desc : ''}`;
          } catch {
            return pair;
          }
        }).join(', ');
        $(el).attr('srcset', rewritten);
      });
      $('[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && !href.match(/^(javascript:|mailto:|#)/)) {
          rewriteAttr(el, 'href');
        }
      });

      $('style').each((_, el) => {
        const updated = ($(el).html() || '').replace(/url\((['"]?)([^'")]+)\1\)/g,
          (_, q, url) => {
            try {
              const abs = new URL(url, target).toString();
              return `url(${q}/api/proxy?url=${encodeURIComponent(abs)}${q})`;
            } catch {
              return '';
            }
          });
        $(el).html(updated);
      });
      $('[style]').each((_, el) => {
        const style = $(el).attr('style') || '';
        const updated = style.replace(/url\((['"]?)([^'")]+)\1\)/g,
          (_, q, url) => {
            try {
              const abs = new URL(url, target).toString();
              return `url(${q}/api/proxy?url=${encodeURIComponent(abs)}${q})`;
            } catch {
              return '';
            }
          });
        $(el).attr('style', updated);
      });

      $('head').prepend(`<script>(function(){
        const base='${target}';
        const toProxy=u=>{try{return'/api/proxy?url='+encodeURIComponent(new URL(u,base).toString())}catch{return u}};
        const f=window.fetch;
        window.fetch=(r,i)=>{if(typeof r==='string')r=toProxy(r);else if(r instanceof Request)r=new Request(toProxy(r.url),r);return f(r,i)};
        const o=XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open=function(m,u,...a){try{u=toProxy(u)}catch{};return o.call(this,m,u,...a)};
      })();</script>`);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.header('Access-Control-Allow-Origin', '*');
      return res.send($.html());

    } else {
      const buf = Buffer.from(await response.arrayBuffer());
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': buf.length,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(buf);
    }

  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).send('Proxy error: ' + err.message);
  }
}
