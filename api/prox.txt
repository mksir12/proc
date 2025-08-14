import HttpsProxyAgent from 'https-proxy-agent';

const PROXY_LIST_URL = 'https://github.com/zloi-user/hideip.me/raw/refs/heads/master/https.txt';

let proxies = [];

// Load proxy list once (on cold start)
async function loadProxies() {
  if (proxies.length > 0) return proxies;

  try {
    const res = await fetch(PROXY_LIST_URL);
    const text = await res.text();
    proxies = text.split(/\r?\n/).filter(Boolean); // Remove empty lines
    console.log(`Loaded ${proxies.length} proxies`);
  } catch (err) {
    console.error('Failed to load proxy list:', err);
  }
  return proxies;
}

// Pick a random proxy from the list
function getRandomProxy() {
  if (!proxies.length) return null;
  const idx = Math.floor(Math.random() * proxies.length);
  return proxies[idx];
}

export default async function handler(req, res) {
  const url = req.query.url;
  if (!url) return res.status(400).send("Missing `url` query param.");

  await loadProxies();
  const proxy = getRandomProxy();

  try {
    const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;

    const response = await fetch(url, {
      headers: {
        'User-Agent': req.headers['user-agent'] ||
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
        'Accept': '*/*',
      },
      agent, // route through proxy
    });

    const contentType = response.headers.get('content-type') || 'text/plain';
    const buffer = Buffer.from(await response.arrayBuffer());

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).end(buffer);
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).send('Proxy error: ' + err.message);
  }
}
