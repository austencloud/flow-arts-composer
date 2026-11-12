// Capture the parity page and crop a specific region for close comparison
import { chromium } from "playwright-core";

const url = process.argv[2] ?? "http://localhost:5173/test/codex-parity";
const out = process.argv[3] ?? "C:/tka-platform/static/test/parity-crop.png";
// x y w h in CSS pixels (viewport 1800px wide, scale 3x)
const [cx, cy, cw, ch] = (process.argv[4] ?? "185,25,645,290").split(",").map(Number);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1800, height: 1200 },
    deviceScaleFactor: 3,
  });
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(12000);
  await page.screenshot({ path: out, clip: { x: cx, y: cy, width: cw, height: ch } });
  console.log("saved", out);
} finally {
  await browser.close();
}
