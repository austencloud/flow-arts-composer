---
description: Use when checking layout across devices, debugging responsive issues, or capturing pre-release screenshots
---

# Multi-Device Screenshots

See how any page looks across 9 devices at once. For layout debugging and regression testing.

## Usage

- `/screenshots compose/arrange` - Capture the Arrange tab across all devices
- `/screenshots browse` - All Browse module tabs
- `/screenshots --public landing` - Just the landing page (no auth needed)
- `/screenshots --compare` - Diff against baselines

## How It Works

Run the Playwright pipeline and open the gallery:

```bash
npx tsx scripts/take-screenshots.ts [args]
```

The script handles auth, wizard dismissal, navigation, stabilization, capture, and gallery generation. Gallery auto-opens in the browser.

## Common Patterns

```bash
# Layout debugging: one module across all devices
npx tsx scripts/take-screenshots.ts compose--arrange

# Quick check: one module, phones only
npx tsx scripts/take-screenshots.ts --devices phone compose--arrange

# Pre-release: everything
npx tsx scripts/take-screenshots.ts

# Regression: compare against baselines
npx tsx scripts/take-screenshots.ts --compare

# Save baselines after a release
npx tsx scripts/take-screenshots.ts --update-baselines
```

## Flags

| Flag                 | Effect                                                      |
| -------------------- | ----------------------------------------------------------- |
| `--devices phone`    | Phone devices only (SE, 16 Pro, 16 Pro Max, S24, S24 Ultra) |
| `--devices tablet`   | Tablets only (iPad Mini, iPad Air)                          |
| `--devices desktop`  | Desktops only (HD 1366x768, FHD 1920x1080)                  |
| `--devices ipad-air` | Single specific device                                      |
| `--public`           | Public routes only, skip auth                               |
| `--compare`          | Pixel-diff against baselines                                |
| `--update-baselines` | Save current as reference screenshots                       |
| `--light`            | Light mode (default: dark)                                  |
| `--landscape`        | Include landscape captures                                  |

Route arguments match against module name, tab name, or label:
`compose`, `arrange`, `compose--arrange`, `browse--gallery` all work.

## Prerequisites

1. Dev server on port 5173 (pm2 `tka-dev`; if it is down, `pm2 restart tka-dev`, never `npm run dev`)
2. Playwright: `npx playwright install chromium` (one-time)
3. Auth credentials at `tests/screenshots/credentials.local.json`:
   ```json
   { "email": "tka-screenshot-bot@test.com", "password": "ScreenshotTest2026!" }
   ```

## Output

- `tests/screenshots/captures/` — PNGs named `{route}--{device}.png`
- `tests/screenshots/gallery.html` — Interactive gallery with filters

## Adding Routes

Edit `tests/screenshots/devices.ts`. The `waitSelector` is optional — if it doesn't match, the screenshot still captures (with a warning). Don't let selector maintenance block you from adding routes.

## Key Files

| File                                       | Purpose                                                   |
| ------------------------------------------ | --------------------------------------------------------- |
| `scripts/take-screenshots.ts`              | CLI entry point, arg parsing                              |
| `tests/screenshots/capture.spec.ts`        | Playwright spec: auth, navigation, stabilization, capture |
| `tests/screenshots/devices.ts`             | Device presets, route definitions, storage key validation |
| `tests/screenshots/generate-gallery.ts`    | HTML gallery generator                                    |
| `tests/screenshots/credentials.local.json` | Auth credentials (gitignored)                             |
