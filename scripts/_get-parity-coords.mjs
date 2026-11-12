import { chromium } from "playwright-core";
const url = process.argv[2] ?? "http://localhost:5173/test/codex-parity";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(8000);
  const coords = await page.evaluate(() => {
    const cols = document.querySelectorAll(".col");
    const pairs = document.querySelectorAll(".pair");
    return {
      cols: Array.from(cols).slice(0, 4).map((c) => {
        const r = c.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      }),
      pairs: Array.from(pairs).slice(0, 2).map((p) => {
        const r = p.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      }),
    };
  });
  console.log(JSON.stringify(coords, null, 2));
} finally {
  await browser.close();
}
