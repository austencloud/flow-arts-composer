// One-off page capture for visual debugging. Uses the already-installed
// playwright-core + cached chromium. Not part of the build.
//   node scripts/_capture-once.mjs <url> <outPng> [waitMs]
import { chromium } from "playwright-core";

const url = process.argv[2] ?? "http://127.0.0.1:5173/test/codex-parity";
const out = process.argv[3] ?? "/tmp/capture.png";
const waitMs = Number(process.argv[4] ?? 7000);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1700, height: 1100 },
    deviceScaleFactor: 2,
  });
  page.on("console", (m) => {
    if (m.type() === "error") console.log("PAGE ERROR:", m.text().slice(0, 200));
  });
  await page.goto(url, { waitUntil: "load", timeout: 120000 });
  // Let the async pictograph preparer populate arrows/props.
  await page.waitForTimeout(waitMs);
  await page.screenshot({ path: out, fullPage: true });
  console.log("saved", out);
} finally {
  await browser.close();
}
