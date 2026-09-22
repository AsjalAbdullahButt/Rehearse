import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const OUT_DIR = "screenshots";
await mkdir(OUT_DIR, { recursive: true });

const widths = [375, 768, 1440];
const themes = ["dark", "light"];

const browser = await chromium.launch();

for (const theme of themes) {
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(String(err)));

    await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });

    if (theme === "light") {
      await page.evaluate(() => {
        localStorage.setItem("theme", "light");
      });
      await page.reload({ waitUntil: "networkidle" });
    }

    await page.waitForTimeout(500);

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );

    await page.screenshot({ path: `${OUT_DIR}/${theme}-${width}-top.png` });

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.15));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT_DIR}/${theme}-${width}-mid1.png` });

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.55));
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT_DIR}/${theme}-${width}-mid2.png` });

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.75));
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT_DIR}/${theme}-${width}-mid3.png` });

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT_DIR}/${theme}-${width}-bottom.png`, fullPage: false });

    console.log(
      JSON.stringify({ theme, width, hasHorizontalScroll, errors: errors.slice(0, 5) }),
    );

    await page.close();
  }
}

await browser.close();
