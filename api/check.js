export default async function handler(req, res) {
  const urlsParam = req.query?.url;
  if (!urlsParam) {
    return res.status(400).send("❌ Please provide ?url= links (comma-separated).");
  }

  const videos = urlsParam.split(",").map(decodeURIComponent).filter(Boolean);

  const working = [];
  const broken = [];

  await Promise.all(
    videos.map(async (url) => {
      try {
        const response = await fetch(url, { method: "HEAD" });
        const contentType = response.headers.get("content-type") || "";
        if (response.ok && contentType.includes("video")) {
          working.push(url);
        } else {
          broken.push({ url, status: response.status });
        }
      } catch (err) {
        broken.push({ url, status: "ERROR" });
      }
    })
  );

  if (req.query?.format === "json") {
    return res.status(200).json({
      total: videos.length,
      working: { count: working.length, urls: working },
      broken: { count: broken.length, urls: broken },
    });
  }

  let output = `📊 TOTAL: ${videos.length}\n✅ WORKING: ${working.length}\n❌ BROKEN: ${broken.length}\n\n`;
  if (working.length > 0) {
    output += "✅ WORKING:\n" + working.map(u => `"${u}",`).join("\n") + "\n\n";
  }
  if (broken.length > 0) {
    output += "❌ BROKEN:\n" + broken.map(b => `"${b.url}", ${b.status}`).join("\n") + "\n";
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.status(200).send(output.trim());
}
