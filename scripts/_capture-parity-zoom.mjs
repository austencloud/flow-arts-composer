// Crop and zoom specific sections of the parity page for comparison
import { chromium } from "playwright-core";

const url = process.argv[2] ?? "http://localhost:5173/test/codex-parity";
const out = process.argv[3] ?? "C:/tka-platform/static/test/parity-zoom.png";
// region: "type1-alpha", "type1-beta", "type2", "type3", "type4-6"
const region = process.argv[4] ?? "type1-alpha";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1800, height: 1200 },
    deviceScaleFactor: 3,
  });
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(10000);

  // Get full page screenshot then crop via clip
  const regions = {
    "book-sheet1": { x: 190, y: 25, width: 220, height: 290 },
    "render-sheet1": { x: 420, y: 25, width: 220, height: 290 },
    "book-sheet2": { x: 190, y: 325, width: 220, height: 290 },
    "render-sheet2": { x: 420, y: 325, width: 220, height: 290 },
  };

  const clip = regions[region] ?? regions["render-sheet1"];
  await page.screenshot({ path: out, clip });
  console.log("saved", out, "region:", region);
} finally {
  await browser.close();
}
