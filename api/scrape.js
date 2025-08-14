import chromium from "chrome-aws-lambda";
import puppeteer from "puppeteer-core";
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteerExtra.use(StealthPlugin());

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) return res.status(400).json({ error: "Missing url" });

  let browser = null;
  try {
    browser = await puppeteerExtra.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    // Set realistic headers
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
    });

    // Navigate
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    // Example: Get page title
    const title = await page.title();
    const content = await page.content();

    res.status(200).json({ title, content: content.substring(0, 1000) }); // first 1000 chars
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
}
