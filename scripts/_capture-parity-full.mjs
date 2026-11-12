// Get the parity page at full width showing both book and render columns
import { chromium } from "playwright-core";

const url = process.argv[2] ?? "http://localhost:5173/test/codex-parity";
const out = process.argv[3] ?? "C:/tka-platform/static/test/parity-full.png";
const waitMs = Number(process.argv[4] ?? 12000);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1800, height: 1200 },
    deviceScaleFactor: 2,
  });
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(waitMs);

  // Get actual scroll width
  const { scrollWidth, scrollHeight } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  console.log("page size:", scrollWidth, "x", scrollHeight);

  // Resize viewport to match content width so screenshot captures both columns
  await page.setViewportSize({ width: Math.min(scrollWidth, 2200), height: 1200 });
  await page.waitForTimeout(1000);

  await page.screenshot({ path: out, fullPage: true });
  console.log("saved", out);
} finally {
  await browser.close();
}
