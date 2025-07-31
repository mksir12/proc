export default async function handler(req, res) {
  const target = req.query.url;

  if (!target) {
    res.status(400).send("Missing `url` query param.");
    return;
  }

  try {
    const response = await fetch(target);

    if (!response.ok) {
      res.status(500).send("Failed to fetch target image.");
      return;
    }

    // Stream image to client
    res.setHeader("Content-Type", response.headers.get("content-type") || "image/jpeg");
    res.setHeader("Cache-Control", "no-store");

    response.body.pipe(res); // node.js readable stream
  } catch (err) {
    res.status(500).send("Proxy error: " + err.message);
  }
}
