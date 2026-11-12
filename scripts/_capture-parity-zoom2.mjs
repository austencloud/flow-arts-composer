// Zoom into the render column of the parity page for detailed comparison
import { chromium } from "playwright-core";

const url = process.argv[2] ?? "http://localhost:5173/test/codex-parity";
const out = process.argv[3] ?? "C:/tka-platform/static/test/parity-zoom2.png";
const section = process.argv[4] ?? "render-sheet1-top";
const waitMs = Number(process.argv[5] ?? 14000);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1800, height: 1200 },
    deviceScaleFactor: 4,  // High DPI for zoomed crops
  });
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(waitMs);

  // Coordinates in CSS pixels (viewport 1800px wide)
  // Book column: x ~220-440, Render column: x ~450-670
  const regions = {
    "render-sheet1-top": { x: 449, y: 35, width: 220, height: 200 },  // Type 1 A-L
    "render-sheet1-bottom": { x: 449, y: 200, width: 220, height: 115 }, // Type 1 M-V, Type 2
    "render-sheet2": { x: 449, y: 325, width: 220, height: 290 },
    "book-sheet1-top": { x: 218, y: 35, width: 220, height: 200 },
    "book-sheet1-bottom": { x: 218, y: 200, width: 220, height: 115 },
    "book-sheet2": { x: 218, y: 325, width: 220, height: 290 },
    "side-by-side-type1": { x: 218, y: 60, width: 452, height: 110 },
    "side-by-side-type2": { x: 218, y: 205, width: 452, height: 105 },
    "side-by-side-type3": { x: 218, y: 345, width: 452, height: 100 },
    "side-by-side-type46": { x: 218, y: 430, width: 452, height: 180 },
  };

  const clip = regions[section] ?? regions["render-sheet1-top"];
  await page.screenshot({ path: out, clip });
  console.log("saved", out, "section:", section);
} finally {
  await browser.close();
}
