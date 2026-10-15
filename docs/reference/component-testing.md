# Component Testing

How to write a browser component test for an interactive Svelte 5 component.

This is the **component layer** of the test pyramid: one component rendered in Playwright Chromium through Vitest browser mode and driven with real events. The jsdom logic suite uses `tests/config/vitest.config.ts`. `package.json` also declares `test:e2e`, which runs Vitest with `tests/config/vitest.e2e.config.ts` under the Firebase Auth emulator; that command alone does not establish a whole-app Playwright suite.

Use a component test when the risk is in the **wiring**: reactivity, ARIA/roles, emitted callbacks, focus, interaction. Use a logic test (jsdom) for pure state/formatters/services. Use E2E for multi-page/persistence flows.

## Quick start

Component tests are colocated next to the component and named `Foo.svelte.test.ts`. The `.svelte.` segment compiles runes in the test file and routes it to the browser project (the jsdom project explicitly excludes `**/*.svelte.test.ts`).

> **Naming footgun:** the `.svelte.test.ts` suffix routes a file to the browser project unconditionally. This repo's state convention is `xxx.svelte.ts` (rune modules), so a _logic_ test for one of those must **not** be named `xxx.svelte.test.ts` — it would be force-run in headless Chromium (slow, no DOM). Put rune-module logic tests in `__tests__/xxx.test.ts` (no `.svelte.` suffix); reserve `*.svelte.test.ts` for component renders.

```bash
# watch a single component while iterating
pnpm run test:components -- --run FilterChipBase
# whole component suite (what CI runs)
pnpm run test:components:ci
```

Tooling: `vitest-browser-svelte` (render), `@vitest/browser-playwright` (Chromium), `axe-core` (a11y). Config: `tests/config/vitest.components.config.ts`.

## Worked example (copy this shape)

From `src/lib/shared/ui/components/SegmentedControl.svelte.test.ts`:

```ts
import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser"; // NOT "@vitest/browser/context" (deprecated)
import { describe, it, expect, vi } from "vitest";
import SegmentedControl from "./SegmentedControl.svelte";
import { expectNoA11yViolations } from "$test-helpers/component-a11y";

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];

describe("SegmentedControl", () => {
  it("calls onchange with the clicked value and moves the indicator on rerender", async () => {
    const onchange = vi.fn();
    const screen = render(SegmentedControl, {
      options: OPTIONS,
      value: "a",
      onchange,
    });

    await page.getByRole("button", { name: "Beta" }).click();
    expect(onchange).toHaveBeenCalledWith("b"); // assert the EMIT on interaction

    await screen.rerender({ options: OPTIONS, value: "b", onchange }); // parent applies new state
    await expect
      .element(page.getByRole("button", { name: "Beta" }))
      .toHaveAttribute("aria-pressed", "true"); // assert the DOM after rerender
  });

  it("has no AAA a11y violations", async () => {
    render(SegmentedControl, {
      options: OPTIONS,
      value: "a",
      onchange: vi.fn(),
    });
    await expectNoA11yViolations();
  });
});
```

## Conventions

- **Imports:** `render` from `vitest-browser-svelte`; `page` from `vitest/browser`; matchers/`vi` from `vitest`; the a11y helper from `$test-helpers/component-a11y`.
- **Props:** `render(Component, propsObject)`. Get a `screen` back; `screen.rerender(newProps)` re-renders with new props.
- **Query by role + accessible name** (`page.getByRole("button", { name: "Beta" })`) — resilient and a11y-aligned. Avoid class/test-id selectors.
- **Assertions auto-retry:** `await expect.element(locator).toBeVisible()` / `.toHaveAttribute(...)` retries until satisfied — no manual `waitFor`/`act`. For an out-of-band rune-state mutation made directly in the test, call `flushSync()` before a synchronous assertion.
- **Controlled components** (most TKA primitives): clicking fires the callback; the visible state only changes when the parent passes a new prop. So assert the **spy** on interaction, then `rerender` with the new value and assert the **DOM**. Don't expect a click alone to flip the rendered state.
- **Callbacks:** pass `vi.fn()` spies as props; assert call count + args (`toHaveBeenCalledWith`, `toHaveBeenCalledTimes`).
- **Toggles / segmented / chips:** assert `aria-pressed` / `aria-checked` + active class, not internal state. A toggle is a `<button aria-pressed>` (per [no-checkboxes.md](../../.claude/rules/no-checkboxes.md)), never `role="switch"` unless it also sets `aria-checked`, and never `<input type=checkbox>`.

## Portalled / floating content (popovers, overlays, tooltips)

Portalled panels render OUTSIDE the component's own subtree, so a locator scoped to the component won't find them. Query the document body, and use async `findBy*` (floating-UI positions on a microtask/rAF — a sync `getBy*` can fire before the panel mounts):

```ts
import { within } from "vitest/browser";
await page.getByRole("button", { name: "Filter" }).click(); // in-component trigger
const body = within(document.body);
const option = await body.findByRole("option", { name: "Smooth" }); // portal escapes the component
await option.click();
```

(A component that owns its popover internally — like `PropOrientationControl` — can be exercised entirely through `page` without this; the body-scoping is for portalled/teleported content.)

## Accessibility

Every primitive gets `await expectNoA11yViolations()` — runs axe with the WCAG **AAA** ruleset. Two rules are disabled because they are meaningless in component isolation, not because we ignore them:

- `color-contrast` — isolated components lack the app's theme-variable cascade, so computed colors are unreliable. Contrast is validated in-app / by the `accessibility-auditor` agent.
- `region` — isolated components have no page landmarks.

While remediating a component with a pre-existing violation, you may pass `{ soft: true }` to log without failing — but that is a temporary state; the goal is a hard assertion. (The layer's first run already caught and fixed a real one: `FilterChipBase` had `role="switch"` + `aria-pressed`, invalid ARIA — now a plain toggle button.)

## CI

The `component-tests` job in `.github/workflows/web-ci.yml` installs Chromium and runs `test:components:ci`. It is **non-blocking** (`continue-on-error: true`) until the suite is proven stable across several green runs on `main`, then the flag is removed to make it a required gate. The jsdom `validate` job is unaffected.

## What NOT to put here

- Pure logic (state factories, reducers, formatters, services) → jsdom suite (`tests/unit/**`, `src/**/__tests__/**`).
- Routing, persistence, multi-page, real Firebase → E2E (Playwright), a separate layer.
- A bespoke `renderComponent()` wrapper — `render()` is the unit; the only shared helper is `expectNoA11yViolations`.

## Reference files

- Config: `tests/config/vitest.components.config.ts`
- a11y helper: `tests/helpers/component-a11y.ts`
- Examples: `FilterChipBase.svelte.test.ts`, `SegmentedControl.svelte.test.ts`, `PropOrientationControl.svelte.test.ts`
- Design + plan: `docs/superpowers/specs/shipped/2026-06-29-component-test-layer-design.md`, `docs/superpowers/plans/shipped/2026-06-29-component-test-layer.md`
