export default async function handler(req, res) {
  const videos = [
    "https://jerryapi.vercel.app/naruto/1.mp4",
    "https://i.imgur.com/sIhrW6W.mp4",
    "https://jerryapi.vercel.app/naruto/2.mp4",
    "https://i.imgur.com/iEGMsr.mp4",
    "https://jerryapi.vercel.app/naruto/3.mp4",
];

  const working = [];
  const broken = [];

  // Check videos in parallel for speed
  const checks = await Promise.all(
    videos.map(async (url) => {
      try {
        const response = await fetch(url, { method: "HEAD" });
        if (response.ok && response.headers.get("content-type")?.includes("video")) {
          working.push(url);
        } else {
          broken.push({ url, status: response.status });
        }
      } catch (err) {
        broken.push({ url, status: "ERROR" });
      }
    })
  );

  // JSON format (if ?format=json)
  if (req.query?.format === "json") {
    return res.status(200).json({
      total: videos.length,
      working: { count: working.length, urls: working },
      broken: { count: broken.length, urls: broken }
    });
  }

  // Plain text output with quotes + commas
  let output = `📊 TOTAL: ${videos.length}\n✅ WORKING: ${working.length}\n❌ BROKEN: ${broken.length}\n\n`;

  if (working.length > 0) {
    output += "✅ WORKING:\n";
    output += working.map(u => `"${u}",`).join("\n") + "\n\n";
  }
  if (broken.length > 0) {
    output += "❌ BROKEN:\n";
    output += broken.map(b => `"${b.url}", ${b.status}`).join("\n") + "\n";
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.status(200).send(output.trim());
}
