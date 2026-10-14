# Component Test Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a real-browser component-test layer (vitest-browser-svelte) that catches the wiring/reactivity/interaction/a11y bugs the existing jsdom logic suite cannot, starting with the shared interactive primitives.

**Architecture:** A second Vitest project running in Playwright Chromium, configured separately from the existing jsdom suite so the 378 logic tests stay byte-for-byte unchanged. Component tests are colocated `*.svelte.test.ts` files; they `render()` a component, drive it with real browser events, and assert on roles/ARIA + emitted callbacks, plus an axe accessibility check via a shared helper. Rolled out in four phases: P0 scaffold + one proof test, P1 the shared primitives + the orientation-bug proof case, P2 a11y hardening, P3 breadth + promote the CI job to a required gate.

**Tech Stack:** Vitest 4, `vitest-browser-svelte@^2.1.1`, `@vitest/browser-playwright` (Vitest 4 provider), `playwright` (Chromium), `axe-core`, `@sveltejs/vite-plugin-svelte`.

**Spec:** `docs/superpowers/specs/2026-06-29-component-test-layer-design.md`

**Conventions enforced by this plan:**
- Commits use an explicit pathspec (`git commit -- <paths>`) per `.claude/rules/commit-only-your-own-changes.md` — the shared index may hold other agents' work.
- Never run full `npm run check`/`build` in the inner loop; the feedback tool here is `npm run test:components`.
- Work happens on `main` (no branches/worktrees, per global rule).

---

## File Structure

**Create:**
- `tests/config/vitest.components.config.ts` — the browser Vitest project (compiles `.svelte`, runs in Playwright Chromium, globs `src/**/*.svelte.{test,spec}.ts`).
- `tests/helpers/component-a11y.ts` — `expectNoA11yViolations()` axe helper (AAA ruleset, color-contrast disabled in isolation — see Task 6).
- `src/lib/shared/browse/components/filter-chips/FilterChipBase.svelte.test.ts` — toggle + dropdown-attr tests (also the P0 proof).
- `src/lib/shared/3d/components/controls/SegmentedControl.svelte.test.ts` — single-select group tests.
- `src/lib/features/create/shared/components/sequence-actions/PropOrientationControl.svelte.test.ts` — orientation control tests + the bug proof case.

**Modify:**
- `package.json` — add devDeps + `test:components` / `test:components:ci` scripts.
- `tests/config/vitest.config.ts` — add one exclude glob so the jsdom project never claims a `*.svelte.test.ts`.
- `.github/workflows/web-ci.yml` — add a non-blocking `component-tests` job (P0); flip to required in P3.

---

## Phase P0 — Scaffold + one passing proof test

### Task 1: Add dependencies

**Files:**
- Modify: `package.json` (devDependencies)

- [ ] **Step 1: Install the browser-test toolchain**

Run:
```bash
pnpm add -D vitest-browser-svelte @vitest/browser-playwright playwright axe-core
```
Expected: `package.json` devDependencies gain `vitest-browser-svelte`, `@vitest/browser-playwright`, `playwright`, `axe-core`. (`vitest`, `@vitest/browser`, `@sveltejs/vite-plugin-svelte` are already present.)

- [ ] **Step 2: Install the Chromium browser binary**

Run:
```bash
pnpm exec playwright install chromium
```
Expected: Chromium downloads to the Playwright cache. On Linux CI this is `--with-deps` (handled in Task 5); locally on Windows the bare install is sufficient.

- [ ] **Step 3: Commit**

```bash
git commit -m "build: add vitest-browser-svelte + playwright provider + axe-core for component tests" -- package.json pnpm-lock.yaml
```

---

### Task 2: Create the browser Vitest project config

**Files:**
- Create: `tests/config/vitest.components.config.ts`

- [ ] **Step 1: Write the config**

Mirrors the alias setup of `tests/config/vitest.config.ts` (so `$lib`/`$shared`/`$app/*` resolve and the existing SvelteKit stubs are reused), but swaps jsdom for a real Chromium browser project and uses `svelte()` (compiler only — no SvelteKit routing/SSR) instead of `sveltekit()`.

```ts
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

export default defineConfig({
  plugins: [svelte()],

  resolve: {
    conditions: ["browser"],
    alias: {
      $lib: path.resolve(projectRoot, "src/lib"),
      $shared: path.resolve(projectRoot, "src/lib/shared"),
      "$test-helpers": path.resolve(projectRoot, "tests/helpers"),
      "$app/environment": path.resolve(projectRoot, "tests/setup/stubs/app-environment.ts"),
      "$app/navigation": path.resolve(projectRoot, "tests/setup/stubs/app-navigation.ts"),
      "$app/stores": path.resolve(projectRoot, "tests/setup/stubs/app-stores.ts"),
    },
  },

  test: {
    name: "components",
    include: ["src/**/*.svelte.{test,spec}.ts"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({}),
      instances: [{ browser: "chromium" }],
    },
  },
});
```

- [ ] **Step 2: Add the npm scripts**

In `package.json` `scripts`, directly after the `"test:ci"` line (currently line ~53), add:

```json
    "test:components": "vitest --config tests/config/vitest.components.config.ts",
    "test:components:ci": "vitest run --config tests/config/vitest.components.config.ts",
```

- [ ] **Step 3: Commit**

```bash
git commit -m "test(components): add browser Vitest project config + scripts" -- tests/config/vitest.components.config.ts package.json
```

---

### Task 3: Guard the jsdom project against component tests

**Files:**
- Modify: `tests/config/vitest.config.ts:27-36` (the `exclude` array)

- [ ] **Step 1: Confirm no existing file already uses the reserved naming**

Run:
```bash
git ls-files "src/**/*.svelte.test.ts" "src/**/*.svelte.spec.ts" "tests/**/*.svelte.test.ts"
```
Expected: empty output. (If any file is listed, STOP — the `.svelte.test.ts` convention collides with existing files; report before continuing.)

- [ ] **Step 2: Add the exclude glob**

In `tests/config/vitest.config.ts`, inside `test.exclude`, add a final entry so the jsdom project never picks up a browser-project test even if one lands inside an `__tests__/` folder:

```ts
    exclude: [
      "legacy_app/**/*",
      "**/node_modules/**/*",
      "tests/e2e/**/*",
      "tests/screenshots/**/*",
      "tests/integration/**/*",
      // Component tests run in the browser project (vitest.components.config.ts),
      // never under jsdom.
      "**/*.svelte.{test,spec}.{js,ts}",
    ],
```

- [ ] **Step 3: Verify the jsdom suite is unaffected**

Run:
```bash
npm run test:ci 2>&1 | tail -20
```
Expected: the same 378 tests pass; no count change (the exclude matches nothing today, confirmed in Step 1).

- [ ] **Step 4: Commit**

```bash
git commit -m "test: exclude *.svelte.test.ts from the jsdom project" -- tests/config/vitest.config.ts
```

---

### Task 4: Write the first proof test (FilterChipBase toggle)

`FilterChipBase` in `mode="toggle"` renders `role="switch"` with `aria-pressed={active}` and an accessible name from `aria-label="{label}"`. It is a controlled component: clicking fires `onclick`; the `active` state only changes when the parent passes a new `active` prop. The test asserts the emitted click and that the rendered ARIA reflects the controlled prop.

**Files:**
- Create: `src/lib/shared/browse/components/filter-chips/FilterChipBase.svelte.test.ts`
- Reference: `src/lib/shared/browse/components/filter-chips/FilterChipBase.svelte`

- [ ] **Step 1: Write the test**

```ts
import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, it, expect, vi } from "vitest";
import FilterChipBase from "./FilterChipBase.svelte";

describe("FilterChipBase (toggle mode)", () => {
  it("exposes aria-pressed reflecting `active` on the toggle button", async () => {
    render(FilterChipBase, { label: "Loops", mode: "toggle", active: false });
    const chip = page.getByRole("button", { name: "Loops" });
    await expect.element(chip).toBeVisible();
    await expect.element(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("fires onclick when activated, and reflects the new active prop on rerender", async () => {
    const onclick = vi.fn();
    const screen = render(FilterChipBase, {
      label: "Loops",
      mode: "toggle",
      active: false,
      onclick,
    });

    await page.getByRole("button", { name: "Loops" }).click();
    expect(onclick).toHaveBeenCalledOnce();

    // Controlled component: parent flips `active` → ARIA must follow.
    await screen.rerender({ label: "Loops", mode: "toggle", active: true, onclick });
    await expect
      .element(page.getByRole("button", { name: "Loops" }))
      .toHaveAttribute("aria-pressed", "true");
  });
});
```

- [ ] **Step 2: Run the proof test**

Run:
```bash
npm run test:components -- --run FilterChipBase
```
Expected: Chromium launches headless; **2 tests pass**. This is the end-to-end proof that the layer works against a real component. (If the provider errors with "browser not installed", re-run `pnpm exec playwright install chromium`.)

- [ ] **Step 3: Commit**

```bash
git commit -m "test(components): FilterChipBase toggle proof test" -- src/lib/shared/browse/components/filter-chips/FilterChipBase.svelte.test.ts
```

---

### Task 5: Wire the non-blocking CI job

**Files:**
- Modify: `.github/workflows/web-ci.yml` (append a second job)

- [ ] **Step 1: Add the `component-tests` job**

Append after the `validate` job (the file currently ends at the `Build` step, line ~51). Mirrors `validate`'s setup (pnpm, Node 24, install, `.env`, build workspace packages — components import `@tka/*` workspace packages), then installs Chromium and runs the browser suite. `continue-on-error: true` makes it non-blocking during P0–P1.

```yaml
  component-tests:
    name: Component Tests (browser)
    runs-on: ubuntu-latest
    continue-on-error: true # non-blocking until P3 (see plan)

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Create .env from .env.example
        run: cp .env.example .env

      - name: Build workspace packages
        run: pnpm run build:packages

      - name: Install Playwright Chromium
        run: pnpm exec playwright install --with-deps chromium

      - name: Component tests (Vitest browser mode)
        run: pnpm run test:components:ci
```

- [ ] **Step 2: Validate the workflow YAML locally**

Run:
```bash
node -e "const y=require('fs').readFileSync('.github/workflows/web-ci.yml','utf8'); console.log(y.includes('component-tests')?'job present':'MISSING')"
```
Expected: `job present`. (Full CI verification happens on push — non-blocking, so a red here cannot break the build.)

- [ ] **Step 3: Commit**

```bash
git commit -m "ci: add non-blocking component-tests job (browser mode)" -- .github/workflows/web-ci.yml
```

**P0 done:** the layer runs end-to-end on one component, locally and in CI, with the jsdom suite untouched.

---

## Phase P1 — Shared primitives + a11y + the bug proof case

### Task 6: Add the accessibility helper

Isolated component tests lack the full app theme cascade, which makes axe's `color-contrast` rule unreliable (computed colors resolve against missing CSS variables). The helper therefore runs the WCAG **AAA** ruleset but disables `color-contrast`, which is validated in-app / by the `accessibility-auditor` agent against the real theme. Everything else axe checks in isolation (roles, names, ARIA validity, labels, structure) is reliable.

**Files:**
- Create: `tests/helpers/component-a11y.ts`

- [ ] **Step 1: Write the helper**

```ts
import axe from "axe-core";

const AAA_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag2aaa",
  "best-practice",
];

/**
 * Assert the rendered subtree has no axe accessibility violations (WCAG AAA).
 * `color-contrast` is disabled because isolated component tests lack the app's
 * theme variables; contrast is validated in-app / by the accessibility-auditor.
 * Pass `{ soft: true }` to log violations without failing (only while
 * remediating a known-dirty primitive).
 */
export async function expectNoA11yViolations(
  container: Element = document.body,
  opts: { soft?: boolean } = {}
): Promise<void> {
  const results = await axe.run(container, {
    runOnly: { type: "tag", values: AAA_TAGS },
    rules: { "color-contrast": { enabled: false } },
  });
  if (results.violations.length === 0) return;

  const summary = results.violations
    .map(
      (v) =>
        `${v.id} (${v.impact ?? "n/a"}): ${v.nodes.length} node(s) — ${v.help}`
    )
    .join("\n");

  if (opts.soft) {
    console.warn(
      `[a11y soft] ${results.violations.length} violation(s):\n${summary}`
    );
    return;
  }
  throw new Error(
    `a11y violations (${results.violations.length}):\n${summary}`
  );
}
```

- [ ] **Step 2: Smoke-check the helper compiles and runs against the existing proof test component**

Add a temporary assertion to the FilterChipBase test (remove after this step): add `import { expectNoA11yViolations } from "$test-helpers/component-a11y";` at the top, and in the first test, after the visibility assertion, add `await expectNoA11yViolations();` (the `$test-helpers` alias was added to the components config in Task 2 — no fragile relative paths). Run:
```bash
npm run test:components -- --run FilterChipBase
```
Expected: still passes (no violations on a single labelled switch). Then **revert the temporary line** — the real assertions are added per-primitive in Tasks 7–9.

- [ ] **Step 3: Commit**

```bash
git commit -m "test(components): add AAA axe a11y helper" -- tests/helpers/component-a11y.ts
```

---

### Task 7: SegmentedControl tests (single-select group)

`SegmentedControl` renders one `<button>` per option with `aria-label={option.label}` and `aria-pressed={value === option.value}`; clicking calls `onchange(value)`. Controlled: the active segment only moves when `value` changes. The a11y helper is imported via the `$test-helpers` alias (Task 2).

**Files:**
- Create: `src/lib/shared/3d/components/controls/SegmentedControl.svelte.test.ts`
- Reference: `src/lib/shared/3d/components/controls/SegmentedControl.svelte`

- [ ] **Step 1: Write the tests**

```ts
import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, it, expect, vi } from "vitest";
import SegmentedControl from "./SegmentedControl.svelte";
import { expectNoA11yViolations } from "$test-helpers/component-a11y";

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
];

describe("SegmentedControl", () => {
  it("marks exactly the selected option as pressed", async () => {
    render(SegmentedControl, { options: OPTIONS, value: "a", onchange: vi.fn() });
    await expect
      .element(page.getByRole("button", { name: "Alpha" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(page.getByRole("button", { name: "Beta" }))
      .toHaveAttribute("aria-pressed", "false");
  });

  it("calls onchange with the clicked value and moves the indicator on rerender", async () => {
    const onchange = vi.fn();
    const screen = render(SegmentedControl, {
      options: OPTIONS,
      value: "a",
      onchange,
    });

    await page.getByRole("button", { name: "Beta" }).click();
    expect(onchange).toHaveBeenCalledWith("b");

    await screen.rerender({ options: OPTIONS, value: "b", onchange });
    await expect
      .element(page.getByRole("button", { name: "Beta" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(page.getByRole("button", { name: "Alpha" }))
      .toHaveAttribute("aria-pressed", "false");
  });

  it("has no AAA a11y violations", async () => {
    render(SegmentedControl, { options: OPTIONS, value: "a", onchange: vi.fn() });
    await expectNoA11yViolations();
  });
});
```

- [ ] **Step 2: Run**

Run:
```bash
npm run test:components -- --run SegmentedControl
```
Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git commit -m "test(components): SegmentedControl single-select + a11y" -- src/lib/shared/3d/components/controls/SegmentedControl.svelte.test.ts
```

---

### Task 8: FilterChipBase dropdown-mode tests + a11y

Extends the P0 proof file with `mode="dropdown"` ARIA assertions (the chip exposes `aria-haspopup="listbox"` + `aria-expanded`) and an a11y check. The portalled popover body requires a children `Snippet`; passing snippets to `render()` is out of scope here — the popover-content interaction is exercised at the `PropOrientationControl` level (Task 9), which owns its popover internally. The a11y helper is imported via the `$test-helpers` alias (Task 2).

**Files:**
- Modify: `src/lib/shared/browse/components/filter-chips/FilterChipBase.svelte.test.ts`

- [ ] **Step 1: Append a dropdown describe block + a11y test**

```ts
import { expectNoA11yViolations } from "$test-helpers/component-a11y";

describe("FilterChipBase (dropdown mode)", () => {
  it("exposes listbox popup semantics with aria-expanded", async () => {
    const screen = render(FilterChipBase, {
      label: "Sort",
      mode: "dropdown",
      expanded: false,
    });
    const chip = page.getByRole("button", { name: "Sort" });
    await expect.element(chip).toHaveAttribute("aria-haspopup", "listbox");
    await expect.element(chip).toHaveAttribute("aria-expanded", "false");

    await screen.rerender({ label: "Sort", mode: "dropdown", expanded: true });
    await expect
      .element(page.getByRole("button", { name: "Sort" }))
      .toHaveAttribute("aria-expanded", "true");
  });

  it("has no AAA a11y violations in toggle mode", async () => {
    render(FilterChipBase, { label: "Loops", mode: "toggle", active: true });
    await expectNoA11yViolations();
  });
});
```

- [ ] **Step 2: Run**

Run:
```bash
npm run test:components -- --run FilterChipBase
```
Expected: the original 2 + these 2 = 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git commit -m "test(components): FilterChipBase dropdown semantics + a11y" -- src/lib/shared/browse/components/filter-chips/FilterChipBase.svelte.test.ts
```

---

### Task 9: PropOrientationControl tests + the orientation-bug proof case

`PropOrientationControl` (the control from the 2026-06-28 bug): props `color` (`"blue"|"red"`), `orientation` (string), `onOrientationChange(value)`. Normal view shows three buttons — `Previous {color} orientation`, `Select {color} orientation` (the display, label text "In"/"Out"/"CW"/"CCW"), `Next {color} orientation`. Clicking the display opens a popover grid of `Set {color} orientation to {label}` buttons. Cardinal cycle order is `in → counter → out → clock`. It is controlled — the display only changes when the `orientation` prop changes.

The **proof case** for the bug: changing this control emits exactly the picked orientation and nothing else, and the displayed value tracks the controlled prop. Combined with the existing pure-function guard `customize-start-end-options.test.ts` (which proves a single-field change never resets the other fields), the full cross-field reset bug is covered: emission correctness here + merge correctness there.

The a11y helper is imported via the `$test-helpers` alias (Task 2).

**Files:**
- Create: `src/lib/features/create/shared/components/sequence-actions/PropOrientationControl.svelte.test.ts`
- Reference: `src/lib/features/create/shared/components/sequence-actions/PropOrientationControl.svelte`

- [ ] **Step 1: Write the tests**

```ts
import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, it, expect, vi } from "vitest";
import PropOrientationControl from "./PropOrientationControl.svelte";
import { expectNoA11yViolations } from "$test-helpers/component-a11y";

describe("PropOrientationControl", () => {
  it("shows the current orientation label", async () => {
    render(PropOrientationControl, {
      color: "blue",
      orientation: "in",
      onOrientationChange: vi.fn(),
    });
    await expect.element(page.getByText("In")).toBeVisible();
  });

  it("emits exactly the picked orientation from the popover (the bug's control)", async () => {
    const onOrientationChange = vi.fn();
    render(PropOrientationControl, {
      color: "blue",
      orientation: "in",
      onOrientationChange,
    });

    await page.getByRole("button", { name: "Select blue orientation" }).click();
    await page
      .getByRole("button", { name: "Set blue orientation to Out" })
      .click();

    expect(onOrientationChange).toHaveBeenCalledTimes(1);
    expect(onOrientationChange).toHaveBeenCalledWith("out");
  });

  it("cycles to the next cardinal orientation (in → counter)", async () => {
    const onOrientationChange = vi.fn();
    render(PropOrientationControl, {
      color: "red",
      orientation: "in",
      onOrientationChange,
    });
    await page.getByRole("button", { name: "Next red orientation" }).click();
    expect(onOrientationChange).toHaveBeenCalledWith("counter");
  });

  it("tracks the controlled orientation prop on rerender", async () => {
    const screen = render(PropOrientationControl, {
      color: "blue",
      orientation: "in",
      onOrientationChange: vi.fn(),
    });
    await expect.element(page.getByText("In")).toBeVisible();

    await screen.rerender({
      color: "blue",
      orientation: "out",
      onOrientationChange: vi.fn(),
    });
    await expect.element(page.getByText("Out")).toBeVisible();
  });

  it("has no AAA a11y violations", async () => {
    render(PropOrientationControl, {
      color: "blue",
      orientation: "in",
      onOrientationChange: vi.fn(),
    });
    await expectNoA11yViolations();
  });
});
```

- [ ] **Step 2: Run**

Run:
```bash
npm run test:components -- --run PropOrientationControl
```
Expected: 5 tests pass. (If the a11y test fails on a structural rule — e.g. an icon-only button lacking a name — that is a real finding: fix the component or, if remediation is deferred, change that single assertion to `await expectNoA11yViolations(document.body, { soft: true })` and note it for P2.)

- [ ] **Step 3: Run the whole component suite + confirm jsdom suite still green**

Run:
```bash
npm run test:components:ci 2>&1 | tail -15
npm run test:ci 2>&1 | tail -5
```
Expected: all component tests pass; the 378 jsdom tests still pass.

- [ ] **Step 4: Commit**

```bash
git commit -m "test(components): PropOrientationControl + orientation-bug proof case" -- src/lib/features/create/shared/components/sequence-actions/PropOrientationControl.svelte.test.ts
```

**P1 done:** the three shared interactive primitives are covered, each with an a11y assertion, and the orientation bug is guarded at the component boundary.

---

## Phase P2 — Accessibility hardening

### Task 10: Remove soft flags + confirm AAA-clean

**Files:**
- Modify: any `*.svelte.test.ts` that used `{ soft: true }` in P1

- [ ] **Step 1: Find any soft a11y assertions**

Run:
```bash
git grep -n "soft: true" -- "src/**/*.svelte.test.ts"
```
Expected: ideally empty. For each match, fix the underlying component a11y issue (add a missing accessible name, role, or label), then remove the `{ soft: true }` argument.

- [ ] **Step 2: Run the full component suite**

Run:
```bash
npm run test:components:ci 2>&1 | tail -15
```
Expected: all tests pass with hard a11y assertions (no `soft`).

- [ ] **Step 3: Commit (only if changes were made)**

```bash
git commit -m "test(components): harden a11y assertions to AAA (remove soft flags)" -- <the files you changed>
```

If Step 1 was empty and no component needed fixing, P2 is already satisfied — record that and move on.

---

## Phase P3 — Breadth + promote the CI gate

P3 is the ongoing-adoption phase. It does not enumerate every component (that would never converge); it establishes the pattern and the gate-promotion criterion.

### Task 11: Document the authoring convention

**Files:**
- Create: `docs/reference/component-testing.md`

- [ ] **Step 1: Write the convention doc**

Capture, with a worked example copied from `SegmentedControl.svelte.test.ts`: colocate `Foo.svelte.test.ts` next to `Foo.svelte`; `render()` + `page.getByRole(...)` + `expect.element(...)`; controlled components assert the spy on interaction and the DOM after `rerender`; portalled content uses `findBy*` against the document body; every primitive gets `expectNoA11yViolations()`; run with `npm run test:components`. State that component tests are for one component in a real browser — routing/persistence/multi-page belong to E2E (Playwright), and pure logic stays in the jsdom suite.

- [ ] **Step 2: Commit**

```bash
git commit -m "docs: component testing authoring convention" -- docs/reference/component-testing.md
```

### Task 12: Cover the next interactive components

Pick the next-highest-traffic interactive primitives/controls and add a `*.svelte.test.ts` for each, following the convention doc. Concrete starting targets (each its own write-test → run → commit cycle, like Tasks 7–9):
- A toggle/segmented control that drives a user-visible preference (e.g. a settings tab control under `src/lib/shared/settings/components/`).
- One feature-level interactive control that emits a callback and has clear ARIA (e.g. a control under `src/lib/shared/sequence-viewer/components/`).

- [ ] **Step 1:** For each target: read the component, write the test (roles/ARIA + emitted callback + `expectNoA11yViolations()`), run `npm run test:components -- --run <Name>`, commit with an explicit pathspec.

### Task 13: Promote the CI job to a required gate

**Files:**
- Modify: `.github/workflows/web-ci.yml` (the `component-tests` job)

- [ ] **Step 1: Confirm stability**

The component suite must have passed on `main` across at least 5 consecutive CI runs with no flakes. Verify in the Actions history before proceeding.

- [ ] **Step 2: Remove the non-blocking flag**

Delete the `continue-on-error: true` line from the `component-tests` job so a component-test failure blocks the build.

- [ ] **Step 3: Commit**

```bash
git commit -m "ci: make component-tests a required gate" -- .github/workflows/web-ci.yml
```

**P3 done:** component testing is the documented default for new interactive components, and the suite gates CI.

---

## Self-Review

**Spec coverage:**
- §4.1 deps → Task 1. §4.2 config → Task 2. §4.3 jsdom exclude → Task 3. §4.4 scripts → Task 2. §4.5 conventions → Tasks 4,7,8,9,11. §5 a11y helper → Task 6. §6 a11y ramp (soft→hard) → Tasks 6,9,10. §7 CI (non-blocking→required) → Tasks 5,13. §8 phases P0–P3 → Tasks 1–13. §9 proof case → Task 9. §11 chip-toggle dropped (external) → noted in plan header + File Structure. All spec sections map to a task.
- One spec deviation, deliberate: §8 P1 listed `@austencloud/chip-toggle` as a target; dropped because it is an external package this repo does not own (covered transitively where consumed). Recorded here.

**Placeholder scan:** No "TBD"/"TODO"/"handle edge cases"/"similar to Task N". Every code step contains full code; every run step states the expected result. Task 12 intentionally parameterizes targets (the breadth phase) but specifies the exact per-target procedure and concrete starting directories — not a placeholder.

**Type/name consistency:** Component props match the read source — `FilterChipBase` (`label`,`mode`,`active`,`expanded`,`onclick`; `role="switch"` only in toggle mode), `SegmentedControl` (`options`,`value`,`onchange`; `aria-label`=label, `aria-pressed`), `PropOrientationControl` (`color`,`orientation`,`onOrientationChange`; aria-labels `Select/Next/Previous {color} orientation`, `Set {color} orientation to {label}`; cardinal cycle `in→counter`). Helper name `expectNoA11yViolations` and signature `(container?, { soft? })` are identical across Tasks 6–10. Scripts `test:components` / `test:components:ci` consistent across Tasks 2,5,9,10. Config path `tests/config/vitest.components.config.ts` consistent throughout.
