---
name: screenshots
description: Use when checking layout across devices, debugging responsive issues, or capturing pre-release screenshots
---

<!-- generated from .claude by scripts/sync-codex-skills.mjs; do not edit directly -->

# Browser Screenshots

Inspect responsive layouts with the repo-approved browser surface. Never run the
standalone Playwright screenshot pipeline.

## Permission gate

- Treat an explicit request to capture or test a page as permission for the
  read-only inspection needed by that request.
- Before navigating, clicking, typing, or filling, confirm that the user gave
  explicit permission in the current conversation. If they did not, ask once
  and stop before the interactive action.
- Never inspect cookies, local storage, passwords, or browser profiles.

## Workflow

1. Load and follow the available browser-control skill before browser work.
2. Reuse the server at `https://localhost:5173`. If it is down or stuck,
   restart it with `pm2 restart tka-dev`; never start a second one on 5173.
3. Read the selected browser's complete runtime documentation before invoking
   its viewport, navigation, inspection, or screenshot APIs.
4. Capture only the requested routes and viewport families. Prefer the smallest
   useful set: one narrow phone, one wide phone, one tablet, and one desktop.
5. Check visible layout, console errors, overflow, touch targets, and text size.
6. Report the exact route and viewport for every finding. A screenshot proves
   appearance only; use DOM or runtime evidence for behavior claims.

## Invocation examples

- `$screenshots compose/arrange`: inspect Arrange at representative widths.
- `$screenshots --public landing`: inspect the public landing route.
- `$screenshots browse`: inspect the Browse module routes requested by the user.

If the required browser surface is unavailable, stop and report that blocker.
Do not fall back to standalone Playwright or a shell-driven browser.
