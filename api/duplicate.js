export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    res.setHeader("Content-Type", "text/plain");
    return res.status(400).send("❌ No URLs provided");
  }

  const urls = Array.isArray(url) ? url : url.split(",");
  const decodedUrls = urls.map(u => decodeURIComponent(u));

  const total = decodedUrls.length;
  const seen = new Set(), unique = [], duplicates = [];

  for (const u of decodedUrls) {
    if (seen.has(u)) duplicates.push(u);
    else { seen.add(u); unique.push(u); }
  }

  let output = `📊 TOTAL: ${total}\n♻️ DUPLICATES: ${duplicates.length}\n✅ UNIQUE: ${unique.length}\n\n`;
  if (unique.length > 0) {
    output += "✅ CLEANED LINKS:\n" + unique.map(u => `"${u}",`).join("\n") + "\n";
  }
  if (duplicates.length > 0) {
    output += "\n❌ DUPLICATES REMOVED:\n" + duplicates.map(u => `"${u}",`).join("\n") + "\n";
  }

  res.setHeader("Content-Type", "text/plain");
  res.status(200).send(output.trim());
}
