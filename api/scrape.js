export default async function handler(req, res) {
  const url = req.query.url;
  if (!url) return res.status(400).send("Missing URL");

  try {
    // Use built-in fetch (no node-fetch required)
    const response = await fetch(url, {
      headers: {
        'User-Agent': req.headers['user-agent'] || 
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
        'Accept': '*/*',
      },
    });

    const body = await response.text();

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).send(body);

  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).send("Proxy error: " + err.message);
  }
}
