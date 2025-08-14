import puppeteer from "puppeteer-core";
import chromium from "chrome-aws-lambda";

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).send("Error: No URL specified");

  let browser = null;
  try {
    browser = await chromium.puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    await page.goto(url, { waitUntil: "networkidle2" });
    const content = await page.content();

    res.setHeader("Content-Type", "text/html");
    res.status(200).send(content);

  } catch (err) {
    console.error(err);
    res.status(500).send("Scraping failed");
  } finally {
    if (browser) await browser.close();
  }
}
