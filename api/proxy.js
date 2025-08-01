export default async function handler(req, res) {
  const target = req.query.url;

  if (!target) {
    return res.status(400).send("Missing `url` query param.");
  }

  try {
    const imageRes = await fetch(target);

    if (!imageRes.ok) {
      return res.status(500).send("Failed to fetch target image.");
    }

    const arrayBuffer = await imageRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader("Content-Type", imageRes.headers.get("content-type") || "image/jpeg");
    res.setHeader("Cache-Control", "no-cache");
    res.send(buffer);
  } catch (err) {
    res.status(500).send("Proxy error: " + err.message);
  }
}
