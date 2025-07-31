export default async function handler(req, res) {
  const target = req.query.url;

  if (!target) {
    return res.status(400).send("Missing `url` query param.");
  }

  try {
    const response = await fetch(target, {
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
        'Referer': target, // Some hosts require a referer
      }
    });

    if (!response.ok) {
      return res.status(500).send("Failed to fetch the target URL.");
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Access-Control-Allow-Origin", "*"); // CORS for browsers
    res.setHeader("X-Powered-By", "JerryCoder-Proxy");

    return res.send(buffer);
  } catch (err) {
    return res.status(500).send("Proxy error: " + err.message);
  }
}
