# Flow Arts Composer on `@austencloud/motion` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, inline, in the `codex/motion-package` worktree. Steps use checkbox (`- [ ]`) syntax for tracking. Austen's agent budget (global CLAUDE.md) overrides subagent-driven execution: run tasks inline, dispatch an agent only for the parallel area rounds in Phase B, and never one agent per task.

**Goal:** The Flow Arts Composer takes its motion clock and shared owners from `@austencloud/motion`, the same package Ringmaster and the Cirque Aflame website already run on, and a coverage gate stops raw motion from coming back, starting with the front page.

**Architecture:** The Composer keeps its own import paths. `src/lib/shared/transitions/transitions.ts` and `motion.ts` become re-exports of the package plus the Composer-only helpers (PanelGroup's `flexPresence`, the perf-tuned `opaqueFade`, `createIntrinsicHeightMotion`, `createDestinationFade`, `standardEasing`). The Composer's own page-change system (named route morphs, `view-transitions.css`, results morphs, layout flip, dock slide, viewer dissolve) stays as it is: it is the richer original, and running the package's `installRouteMotion` beside it would put two callers on `document.startViewTransition`. The CSS clock comes from the package's `tokens.css`; `app.css` keeps the Composer's extra ease and composite tokens. A coverage test runs the package scanner over `src/` with a generated `NOT_YET` list that each round shrinks.

**Tech Stack:** Svelte 5, SvelteKit, pnpm 10, Vitest 4 (`tests/config/vitest.config.ts`, jsdom), `@austencloud/motion` 0.1.3 on npm (source `E:/shared-packages/packages/motion`).

---

## Facts this plan rests on (verified 2026-10-12)

- The package's `DURATION`, `STAGGER` and `SLIDE` values equal the Composer's (`transitions.ts` 1-34 vs `durations.ts`). Its `flyFade`, `popIn`, `reducedMotion`, `motionDuration`, `flipDuration`, `STEP_DRIFT_PX` and `Crossfade` were copied from the Composer through Ringmaster. The package `Crossfade` is the Composer's plus the 0.1.1 clipping fix and an inlined `focusFirstOrContainer`.
- The package `growFade` has no `easing` parameter. The Composer's does, and `StandardWorkspaceLayout.svelte:125` passes `standardEasing` so a panel keeps pace with a PanelGroup slide. Task 2 adds the parameter to the package; until 0.1.4 is installed the Composer keeps its local `growFade`.
- The package scanner (`@austencloud/motion/coverage`) over `src/` today: 3,488 findings in 1,206 files (raw duration 1,866; `transition: all` 970; raw easing 381; raw script duration 114; svelte/transition import 81; raw directive duration 76). Front page (`lib/shared/landing/` and `routes/+page.svelte`): 51 findings in 12 files.
- Importers: `shared/transitions/motion` 157 files, `shared/transitions/transitions` 138, `components/Crossfade.svelte` 98, `DualSourceCrossfade` 15, `utils/transitions.ts` 1.
- `pnpm install` must never run in a worktree whose `node_modules` is a junction to the primary (memory: pnpm-install-in-linked-worktree-breaks-primary). The dependency lands through the primary checkout with Austen's OK (Task 1).

## File map

| Path                                                             | Change                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `package.json`, `pnpm-lock.yaml`                                 | add `@austencloud/motion` (Task 1, primary checkout)                                              |
| `E:/shared-packages/packages/motion/src/transitions.ts` (+ test) | `growFade` takes `easing` (Task 2)                                                                |
| `src/lib/shared/transitions/transitions.ts`                      | re-export `DURATION`, `STAGGER`, `SLIDE` (Task 3)                                                 |
| `src/lib/shared/transitions/motion.ts`                           | re-export shared owners; keep Composer-only helpers (Task 3)                                      |
| `src/lib/shared/components/Crossfade.svelte`                     | deleted; importers take `Crossfade` from `#lib/shared/transitions/motion.js` (Task 3)             |
| `src/lib/shared/utils/transitions.ts`                            | deleted; its one importer moves to an owner (Task 3)                                              |
| `src/routes/+layout.svelte`                                      | imports `@austencloud/motion/css/tokens.css` (Task 4)                                             |
| `src/app.css`                                                    | drops the duplicate `--duration-*` block and the `--duration-2026-*` block; adds nothing (Task 4) |
| `src/lib/shared/transitions/motion-coverage.test.ts`             | the gate (Task 4)                                                                                 |
| `src/lib/shared/transitions/motion-not-yet.ts`                   | generated list of files still carrying raw motion (Task 4)                                        |
| `scripts/motion-not-yet.mjs`                                     | regenerates that list from the scanner (Task 4)                                                   |
| `scripts/motion-codemod.mjs`                                     | mechanical value swaps for the sweep (Task 7)                                                     |
| `docs/architecture/visual-design-canon.md` §9, `src/AGENTS.md`   | name the package as the owner source (Task 6)                                                     |
| `src/lib/shared/landing/**`, `src/routes/+page.svelte`           | front page on the clock (Task 5)                                                                  |

## Ground rules for every task

- Work in `E:/worktrees/tka-platform/motion-package` on `codex/motion-package`. Its `node_modules` is a junction to the primary; never run `pnpm install` there.
- Commit with explicit pathspecs only: `git commit -m "..." -- path/a path/b`.
- Durations come from `DURATION` or `--duration-*`; easing from `--ease-*` tokens or the owners. No raw milliseconds, `cubic-bezier` or `transition: all` outside `src/lib/shared/transitions/` and `src/app.css`.
- Reduced motion: every owner already collapses; hand-written Web Animations go through `motionDuration`.
- A visual change is watched in a real browser before it is called done (phone 412x915, Fold 707x720, desktop 1920x1080, and once with reduced motion on).

---

## Phase A: foundation and the front page

### Task 1: GATE. The dependency lands in the primary checkout

Needs Austen's yes in chat. The lock must be written by pnpm, and pnpm must not run in a linked worktree, so the two files are changed and committed in `E:/tka-platform` on `main`.

**Files:**

- Modify: `E:/tka-platform/package.json` (dependencies, next to `@austencloud/chip-toggle`)
- Modify: `E:/tka-platform/pnpm-lock.yaml`

- [ ] **Step 1: Resource gate**

Run (PowerShell): `(Get-Counter '\Memory\Available MBytes').CounterSamples[0].CookedValue`
Expected: a number above 4096.

- [ ] **Step 2: Add the dependency**

Run from `E:/tka-platform` (PowerShell):

```powershell
pnpm add @austencloud/motion@0.1.3 --save-exact=false
```

Expected: `package.json` gains `"@austencloud/motion": "^0.1.3"`, `pnpm-lock.yaml` gains a registry entry (`resolution: {integrity: sha512-...}`), `node_modules/@austencloud/motion/dist/index.js` exists. The 5173 server may re-optimize once; do not touch it.

- [ ] **Step 3: Check the lock resolves from the registry**

Run: `grep -n "austencloud/motion" E:/tka-platform/pnpm-lock.yaml | head`
Expected: entries with a version and `integrity`, no `link:` or `file:`.

- [ ] **Step 4: Commit only the two files on main**

```bash
cd E:/tka-platform
git status --short package.json pnpm-lock.yaml
git commit -m "build(deps): @austencloud/motion 0.1.3, the shared motion clock" -- package.json pnpm-lock.yaml
```

- [ ] **Step 5: Bring the worktree branch current**

```bash
cd E:/worktrees/tka-platform/motion-package
git merge main
node -e "import('@austencloud/motion').then(m => console.log(Object.keys(m).length))"
```

Expected: a number above 20 (the package resolves through the junction).

### Task 2: Package 0.1.4: `growFade` takes an easing

Runs in a shared-packages worktree. Publishing is a GATE (Austen's yes); until then the Composer keeps its local `growFade`.

**Files:**

- Create worktree: `E:/worktrees/shared-packages/motion-grow-easing` on `codex/motion-grow-easing` from `main`
- Modify: `packages/motion/src/transitions.ts` (growFade, lines 42-92)
- Modify: `packages/motion/src/transitions.test.ts`
- Modify: `packages/motion/package.json` (version 0.1.4), `packages/motion/README.md` (one line)

- [ ] **Step 1: Worktree**

```bash
cd E:/shared-packages
git worktree add E:/worktrees/shared-packages/motion-grow-easing -b codex/motion-grow-easing main
```

- [ ] **Step 2: Failing test**

Append to `packages/motion/src/transitions.test.ts`:

```ts
it("growFade takes an easing so it can pace a panel slide", () => {
  const node = document.createElement("div");
  const linear = (t: number) => t;
  const config = growFade(node, { easing: linear });
  expect(config.easing).toBe(linear);
  expect(growFade(node).easing).not.toBe(linear);
});
```

Run: `cd E:/worktrees/shared-packages/motion-grow-easing/packages/motion && npx vitest run src/transitions.test.ts`
Expected: FAIL (type error or `easing` is `cubicOut`).

- [ ] **Step 3: Implement**

In `transitions.ts`, extend `GrowFadeParams` and `growFade`:

```ts
interface GrowFadeParams {
	duration?: number;
	delay?: number;
	/** Which box dimension grows: "y" = height (list rows), "x" = width (inline chips). */
	axis?: 'x' | 'y';
	/** Extra drift-in offset in px along the cross feel (translateX). */
	x?: number;
	/** Defaults to cubicOut. Pass the panel's curve to keep pace with a panel slide. */
	easing?: (t: number) => number;
}

export function growFade(
	node: HTMLElement,
	{ duration = DURATION.normal, delay = 0, axis = 'y', x = 0, easing = cubicOut }: GrowFadeParams = {}
): TransitionConfig {
```

and in the returned config replace `easing: cubicOut,` with `easing,`.

- [ ] **Step 4: Run the package tests and check**

Run: `npx vitest run && npm run check`
Expected: all pass.

- [ ] **Step 5: Version, README, commit**

`package.json` version `0.1.4`. README owner table row for `growFade`: append "(`easing` to pace a panel slide)".

```bash
cd E:/worktrees/shared-packages/motion-grow-easing
git commit -m "feat(motion): growFade takes an easing so it can pace a panel slide" -- packages/motion/src/transitions.ts packages/motion/src/transitions.test.ts packages/motion/package.json packages/motion/README.md
```

- [ ] **Step 6: GATE. Publish 0.1.4 (Austen's yes), then bump the Composer**

```bash
cd E:/worktrees/shared-packages/motion-grow-easing/packages/motion && npm run build && npm publish --access public
```

After publish: Task 1 steps 2-5 again with `@0.1.4`, then in the Composer's `motion.ts` replace the local `growFade` with `export { growFade } from "@austencloud/motion";` and delete the local copy. Until then, Task 3 keeps the local `growFade`.

### Task 3: The Composer's transitions folder re-exports the package

**Files:**

- Modify: `src/lib/shared/transitions/transitions.ts`
- Modify: `src/lib/shared/transitions/motion.ts`
- Delete: `src/lib/shared/components/Crossfade.svelte`
- Modify: the 98 files importing `components/Crossfade.svelte` (import line only)
- Modify: `src/lib/shared/animation-engine/components/layers/SegmentedSequenceProgressBar.svelte`; delete `src/lib/shared/utils/transitions.ts`
- Test: `src/lib/shared/transitions/motion.test.ts` (new)

- [x] **Step 1: Failing test for the shim surface**

Create `src/lib/shared/transitions/motion.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as pkg from "@austencloud/motion";
import { DURATION, STAGGER, SLIDE, SLIDE_DISTANCE } from "./transitions";
import {
  Crossfade,
  arrive,
  flipDuration,
  flyFade,
  growFade,
  leave,
  motionDuration,
  opaqueFade,
  popIn,
  reducedMotion,
  STEP_DRIFT_PX,
} from "./motion";

describe("the Composer's motion surface is the shared package", () => {
  it("reads the clock from the package", () => {
    expect(DURATION).toBe(pkg.DURATION);
    expect(STAGGER).toBe(pkg.STAGGER);
    expect(SLIDE).toBe(pkg.SLIDE);
    expect(SLIDE_DISTANCE).toBe(pkg.SLIDE);
    expect(STEP_DRIFT_PX).toBe(pkg.STEP_DRIFT_PX);
  });

  it("re-exports the shared owners", () => {
    expect(flyFade).toBe(pkg.flyFade);
    expect(popIn).toBe(pkg.popIn);
    expect(arrive).toBe(pkg.arrive);
    expect(leave).toBe(pkg.leave);
    expect(reducedMotion).toBe(pkg.reducedMotion);
    expect(motionDuration).toBe(pkg.motionDuration);
    expect(flipDuration).toBe(pkg.flipDuration);
    expect(Crossfade).toBe(pkg.Crossfade);
  });

  it("keeps the Composer-only helpers", () => {
    expect(typeof growFade).toBe("function");
    expect(typeof opaqueFade).toBe("function");
  });
});
```

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/transitions/motion.test.ts`
Expected: FAIL (`arrive`, `leave`, `Crossfade` not exported; `DURATION` is a different object).

- [x] **Step 2: `transitions.ts` becomes a re-export**

Replace the whole file with:

```ts
// The motion clock lives in @austencloud/motion, shared with Ringmaster and
// the Cirque Aflame website. Feature code keeps importing this path.
export { DURATION, STAGGER, SLIDE } from "@austencloud/motion";
import { SLIDE } from "@austencloud/motion";

/** @deprecated Use SLIDE instead */
export const SLIDE_DISTANCE = SLIDE;
```

- [x] **Step 3: `motion.ts` re-exports the shared owners and keeps the rest**

Replace the import block and the shared helpers. The file's head becomes:

```ts
import { cubicInOut, cubicOut } from "svelte/easing";
import { fade, type TransitionConfig } from "svelte/transition";
import {
  DURATION,
  EASE_STANDARD,
  motionDuration,
  reducedMotion,
} from "@austencloud/motion";
import { cssCubicBezier } from "./ws-ease";

// Shared owners come from the package (same code Ringmaster and the website
// run). Rule: docs/architecture/visual-design-canon.md §9.
export {
  Crossfade,
  STEP_DRIFT_PX,
  arrive,
  flipDuration,
  flyFade,
  leave,
  motionDuration,
  popIn,
  reducedMotion,
} from "@austencloud/motion";

const STANDARD_MOTION_EASING = EASE_STANDARD;

/**
 * JS twin of `--ease-in-out`, the curve PanelGroup tracks move on. Give it to
 * a Svelte transition that has to move in step with a panel slide.
 */
export const standardEasing = cssCubicBezier(0.4, 0, 0.2, 1);
```

Delete the local `reducedMotion`, `motionDuration`, `STEP_DRIFT_PX`, `flipDuration`, `flyFade` and `popIn` definitions (lines 24-37, 85-90, 178-200 and 348-376 of the current file). Keep `createDestinationFade`, `createIntrinsicHeightMotion`, `flexPresence`, `growFade` (until Task 2 step 6) and `opaqueFade` unchanged.

- [x] **Step 4: Crossfade importers take the package component**

Run from the worktree (Git Bash):

```bash
grep -rl 'components/Crossfade.svelte' src --include=*.svelte --include=*.ts \
  | xargs sed -i -E 's#import Crossfade from "([^"]*)/components/Crossfade\.svelte";#import { Crossfade } from "#lib/shared/transitions/motion.js";#'
grep -rn 'components/Crossfade.svelte' src | grep -v "^src/lib/shared/components/Crossfade.svelte"
```

Expected: the second command prints nothing. If any importer used a relative path other than the pattern above, fix it by hand to the same import. Then `git rm src/lib/shared/components/Crossfade.svelte`. Check `DualSourceCrossfade.svelte` imports nothing from the deleted file (`grep -n Crossfade src/lib/shared/components/DualSourceCrossfade.svelte`).

- [x] **Step 5: Retire `utils/transitions.ts`**

In `SegmentedSequenceProgressBar.svelte`, replace its `utils/transitions` import and usage with the owner that matches (a fade becomes `opaqueFade`, a slide becomes `flyFade` with `y: SLIDE.md` or `growFade`). Then `git rm src/lib/shared/utils/transitions.ts`.

- [x] **Step 6: Tests and type pass**

Run:

```bash
npx vitest run --config tests/config/vitest.config.ts src/lib/shared/transitions
npm run check:fast
```

Expected: the shim test passes, `layout-flip.svelte.test.ts` still passes, no new type errors (compare the count against `main` if the baseline is not zero).

- [x] **Step 7: Commit**

```bash
git add src/lib/shared/transitions/transitions.ts src/lib/shared/transitions/motion.ts src/lib/shared/transitions/motion.test.ts
git add -u src   # only after `git status --short` shows nothing but Crossfade importers, the two deletions and the progress bar
git commit -m "refactor(motion): the Composer's owners come from @austencloud/motion" -- src/lib/shared/transitions src/lib/shared/components src/lib/shared/utils $(grep -rl 'transitions/motion.js' src --include=*.svelte --include=*.ts | tr '\n' ' ')
```

(If the pathspec list is unwieldy, commit in two: the transitions folder first, then `-- src/lib` after confirming with `git status --short` that every modified file is a Crossfade importer.)

### Task 4: Tokens from the package and the coverage gate

**Files:**

- Modify: `src/routes/+layout.svelte:25-32` (CSS imports)
- Modify: `src/app.css:285-290` (duplicate `--duration-*`), `src/app.css:682-685` (`--duration-2026-*`) and the 4 files using `--duration-2026-*`
- Create: `scripts/motion-not-yet.mjs`
- Create: `src/lib/shared/transitions/motion-not-yet.ts` (generated)
- Create: `src/lib/shared/transitions/motion-coverage.test.ts`

- [x] **Step 1: Package tokens load before app.css**

In `+layout.svelte`, above `import "../app.css";` add:

```ts
// The motion clock (durations, --ease-standard*, staggers), shared with
// Ringmaster and the website. app.css keeps the Composer's own ease and
// composite tokens on top of it.
import "@austencloud/motion/css/tokens.css";
```

In `app.css` delete the six `--duration-*` lines (285-290) and the `--duration-2026-*` block (682-685). Replace the four `--duration-2026-*` uses: `instant`→`--duration-instant`, `fast`→`--duration-fast`, `normal` (250)→`--duration-normal`, `slow` (400)→`--duration-dramatic`.

Run: `grep -rn "duration-2026" src` → nothing. `grep -n "^\s*--duration-" src/app.css` → nothing.

- [x] **Step 2: The NOT_YET generator**

Create `scripts/motion-not-yet.mjs`:

```js
// Regenerates src/lib/shared/transitions/motion-not-yet.ts: every file the
// shared motion scanner still flags. A round deletes its files from the list
// (or reruns this after fixing them); the coverage test fails on any other file.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanTree } from "@austencloud/motion/coverage";
import { SKIP } from "../src/lib/shared/transitions/motion-coverage-skip.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const findings = scanTree(path.join(ROOT, "src"), SKIP);
const files = [...new Set(findings.map((f) => f.file))].sort();
const out = path.join(ROOT, "src/lib/shared/transitions/motion-not-yet.ts");
writeFileSync(
  out,
  `// Generated by scripts/motion-not-yet.mjs. Files still carrying raw motion.\n` +
    `// Shrinks with every sweep round; never grows.\n` +
    `export const NOT_YET: ReadonlySet<string> = new Set([\n` +
    files.map((f) => `  ${JSON.stringify(f)},`).join("\n") +
    `\n]);\n`
);
console.log(`${files.length} files, ${findings.length} findings`);
```

Create `src/lib/shared/transitions/motion-coverage-skip.ts`:

```ts
/**
 * Paths the motion scanner never reads: the owners themselves and the token
 * source. Everything else in src/ is feature code and must use the owners.
 */
export const SKIP = (file: string): boolean =>
  file.startsWith("lib/shared/transitions/") || file === "app.css";
```

Run: `node scripts/motion-not-yet.mjs`
Expected: prints about `1206 files, 3488 findings` (the Crossfade and Task 1-3 changes shift it slightly) and writes the list.

- [x] **Step 3: The gate**

Create `src/lib/shared/transitions/motion-coverage.test.ts`:

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scanTree } from "@austencloud/motion/coverage";
import { SKIP } from "./motion-coverage-skip";
import { NOT_YET } from "./motion-not-yet";

const SRC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

describe("motion coverage", () => {
  it("no raw motion outside the files still waiting for an owner", () => {
    const findings = scanTree(SRC, (file) => SKIP(file) || NOT_YET.has(file));
    expect(findings.map((f) => `${f.file}: ${f.rule}: ${f.text}`)).toEqual([]);
  });

  it("the waiting list only shrinks", () => {
    const findings = scanTree(SRC, SKIP);
    const stillRaw = new Set(findings.map((f) => f.file));
    const clean = [...NOT_YET].filter((file) => !stillRaw.has(file));
    expect(clean, "remove these from motion-not-yet.ts").toEqual([]);
  });
});
```

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/transitions/motion-coverage.test.ts`
Expected: both pass (the second proves the list is exact).

- [x] **Step 4: Prove the gate bites**

Add `transition: all 0.3s ease;` to any clean component's style, rerun, expect one finding naming that file; revert.

- [x] **Step 5: Commit**

```bash
git commit -m "feat(motion): package tokens and a coverage gate with a shrinking waiting list" -- src/routes/+layout.svelte src/app.css scripts/motion-not-yet.mjs src/lib/shared/transitions/motion-coverage-skip.ts src/lib/shared/transitions/motion-not-yet.ts src/lib/shared/transitions/motion-coverage.test.ts <the four --duration-2026 files>
```

### Task 5: The front page on the clock

The 51 findings in `src/lib/shared/landing/**` and `src/routes/+page.svelte` (listing from the scanner, 2026-10-12). Remove each file from `motion-not-yet.ts` as it comes clean; the gate's second test tells you when a file is forgotten.

**Files:** `HomeHero.svelte`, `SequenceHeroDemo.svelte`, `UnderConstruction.svelte`, `styles/public-editorial.css`, `launchpad/LaunchpadGrid.svelte`, `launchpad/LaunchpadTile.svelte`, `MarketingChrome.svelte`, `NavDropdown.svelte`, `OpenChapter.svelte`, `PositionTrioGrid.svelte`, `SiteFooter.svelte`, `SiteHeader.svelte`, `FaqInterview.svelte`.

- [x] **Step 1: Hover and press feedback (the 160ms family)**

Every `transition: <props> 160ms ease` in `HomeHero`, `SequenceHeroDemo`, `UnderConstruction` and `public-editorial.css` becomes `var(--duration-fast) var(--ease-standard)` per property. Example, `HomeHero.svelte:192`:

```css
transition:
  transform var(--duration-fast) var(--ease-standard),
  box-shadow var(--duration-fast) var(--ease-standard),
  filter var(--duration-fast) var(--ease-standard);
```

Mapping used throughout the front page: `0.15s`/`150ms`/`160ms`/`180ms`/`0.18s`/`0.16s`→`--duration-fast`; `0.2s`/`200ms`/`0.25s`→`--duration-normal`; `0.28s`/`0.3s`/`0.32s`→`--duration-emphasis`; `0.35s`/`0.42s`/`0.5s`→`--duration-dramatic`; `ease`→`var(--ease-standard)`; `ease-out`→`var(--ease-standard-out)`; `cubic-bezier(0.16, 1, 0.3, 1)`→`var(--ease-out)`. `var(--duration-normal, 0.2s)` fallbacks lose the fallback (the tokens are global).

- [x] **Step 2: Launchpad tiles**

`LaunchpadTile.svelte` lines near 501 and the `0.3s/0.35s/0.5s` groups: hover lift and shadow on `--duration-emphasis`, the `translate 0.5s` reveal on `--duration-dramatic`, the opacity swap `180ms` on `--duration-fast`. `LaunchpadGrid.svelte`: `0.2s`→`--duration-normal`.

- [x] **Step 3: Site header and footer**

`SiteHeader.svelte:980` `transition: all 0.3s ease` → list the properties that change on that selector (read the hover/open rules) on `--duration-emphasis`. The menu reveal `animation: m-item-in 0.42s cubic-bezier(0.16,1,0.3,1) both` → `var(--duration-dramatic) var(--ease-out) both`; `animation-delay: calc(0.06s + var(--i) * 0.06s)` → `calc(var(--stagger-normal) + var(--i) * var(--stagger-normal))`; `grid-template-rows 0.28s` → `--duration-emphasis var(--ease-out)`; `acct-in 0.16s ease-out` → `var(--duration-fast) var(--ease-standard-out)`; `visibility 0s linear 0.3s` → `visibility 0s linear var(--duration-emphasis)`. `SiteFooter.svelte` and `NavDropdown.svelte`: per the mapping.

- [x] **Step 4: MarketingChrome's content fade**

Replace `import { fade } from "svelte/transition";` with `import { opaqueFade } from "#lib/shared/transitions/motion.js";` and the directive:

```svelte
in:opaqueFade|global={{
  duration: suppressContentFade ? 0 : DURATION.normal,
}}
```

(import `DURATION` from `#lib/shared/transitions/transitions.js`). `opaqueFade` already routes through `motionDuration`.

- [x] **Step 5: Gate and type pass**

Run: `node scripts/motion-not-yet.mjs && npx vitest run --config tests/config/vitest.config.ts src/lib/shared/transitions && npm run check:fast`
Expected: `motion-not-yet.ts` no longer lists any landing file, both gate tests pass.

- [x] **Step 6: Watch it**

Start a task-owned Vite server from the worktree on a free port (resource gate first), open `/` in the task browser at 412x915, 707x720, 1920x1080: hover a launchpad tile, open the mobile menu, open an account dropdown, navigate to `/about` and back. Then with `prefers-reduced-motion: reduce` emulated: every change is instant and nothing is hidden. Save screenshots under `docs/superpowers/plans/evidence/2026-10-12-composer-motion/`.

- [x] **Step 7: Commit**

```bash
git commit -m "feat(landing): the front page moves on the shared motion clock" -- src/lib/shared/landing src/routes/+page.svelte src/lib/shared/transitions/motion-not-yet.ts
```

### Task 6: Docs, then guarded integration

**Files:**

- Modify: `docs/architecture/visual-design-canon.md` §9 (one sentence: the clock and shared owners are `@austencloud/motion`, imported through `#lib/shared/transitions/*`; the gate is `motion-coverage.test.ts`)
- Modify: `src/AGENTS.md` line 42 row: add `src/lib/shared/transitions/motion-coverage.test.ts`
- Modify: `docs/architecture/crossfade-primitive.md` (Crossfade now from the package)

- [x] **Step 1: Docs edits and commit**

```bash
git commit -m "docs(motion): the shared package and its coverage gate" -- docs/architecture/visual-design-canon.md src/AGENTS.md docs/architecture/crossfade-primitive.md docs/superpowers/plans/2026-10-12-composer-motion-package.md
```

- [ ] **Step 2: Current with main, then finish**

```powershell
Set-Location E:/worktrees/tka-platform/motion-package; git merge main
Set-Location E:/tka-platform
npm run wt:finish -- codex/motion-package --route /
```

Expected: gate passes, merged to local `main`, worktree removed. Then open `https://localhost:5173/` and watch the front page once more on the primary server. Report "On main" with that link. Nothing is pushed.

---

## Phase B: the in-page sweep (after Austen's call on cost)

Counts from the scanner on 2026-10-12, by area (findings): create 346, sequence-viewer 229, lab 192, animation-engine 178, learn 177, 3d 112, feedback 107, landing-preview 102, shared/components 98, settings 90, store 82, tika 81, train 74, navigation 65, inbox 52, browse 48, onboarding 47, admin 46, festivals 44, background-builder 43, museum 40, pictograph 40, animation-panel 39, foundation 39, then a long tail.

### Task 7: The codemod does the mechanical share

**Files:**

- Create: `scripts/motion-codemod.mjs` (dry run by default; `--write` applies; `--only <prefix>` limits to an area)

The histogram says most raw values are a handful of numbers. The codemod rewrites, inside `<style>` blocks and `.css` files only, on `transition`, `transition-duration`, `transition-delay`, `animation`, `animation-duration`, `animation-delay` declarations:

| Raw                                                                  | Token                      |
| -------------------------------------------------------------------- | -------------------------- |
| `100ms`, `0.1s`, `120ms`, `0.12s`                                    | `var(--duration-instant)`  |
| `140ms`, `150ms`, `0.15s`, `160ms`, `0.16s`, `180ms`, `0.18s`        | `var(--duration-fast)`     |
| `200ms`, `0.2s`, `250ms`, `0.25s`                                    | `var(--duration-normal)`   |
| `280ms`, `300ms`, `0.3s`, `320ms`, `0.32s`                           | `var(--duration-emphasis)` |
| `350ms`, `0.35s`, `400ms`, `0.4s`, `420ms`, `0.42s`, `500ms`, `0.5s` | `var(--duration-dramatic)` |
| `cubic-bezier(0.4, 0, 0.2, 1)`                                       | `var(--ease-standard)`     |
| `cubic-bezier(0.16, 1, 0.3, 1)`                                      | `var(--ease-out)`          |
| `cubic-bezier(0.34, 1.56, 0.64, 1)`                                  | `var(--ease-spring)`       |
| `cubic-bezier(0.25, 0.1, 0.25, 1)`                                   | `var(--ease-smooth)`       |
| `ease` (bare keyword)                                                | `var(--ease-standard)`     |
| `ease-out`                                                           | `var(--ease-standard-out)` |
| `ease-in`                                                            | `var(--ease-standard-in)`  |
| `var(--duration-x, <raw>)`                                           | `var(--duration-x)`        |

It never touches `infinite` animations, `0s`, values above 500ms (scene-length and ambient motion get a human), `transition: all` (a human lists the properties), script code or directives. It prints a per-file diff in dry-run mode. After `--write` on an area, rerun `node scripts/motion-not-yet.mjs`; files that came fully clean drop off the list.

Acceptance: a unit test `scripts/motion-codemod.test.ts` feeds a fixture `<style>` with each row of the table and one `infinite` and one `transition: all` line, and expects exactly the table's rewrites.

### Task 8: Area rounds for the remainder

What the codemod cannot do: `transition: all` (970, property lists by hand), the 81 `svelte/transition` imports (to `flyFade`/`growFade`/`popIn`/`opaqueFade`/`Crossfade`), 114 script durations (`DURATION.*`), 76 directive durations, off-table values. Each round owns a list of top-level directories, runs the codemod on them first, fixes the rest by hand with the owner table, regenerates the waiting list, watches each changed surface in the browser (phone, Fold, desktop, reduced motion), commits with explicit pathspecs, and finishes through `wt:finish --route <a real route in that area>`.

Suggested rounds, largest first: (1) create + animation-engine + animation-panel; (2) sequence-viewer + pictograph + 3d; (3) learn + train + onboarding + museum; (4) lab + landing-preview + background-builder + feedback + admin + settings; (5) store + tika + navigation + inbox + browse + festivals + foundation + shared/components + the tail. Routes `/test/*` and `/dev/*` go last or stay on the list by Austen's call.

The whole-app gate (an empty waiting list) is the end state; the memory note for the project records which rounds are done.

## Self-review

- Spec coverage: clock (Tasks 1, 3, 4), owners (3), gate (4), front page (5), docs and integration (6), the sweep (7, 8), the package gap (2). Page changes stay on the Composer's system by design and are named as such in the Architecture note.
- Type consistency: `SKIP` is defined in `motion-coverage-skip.ts` and used by both the generator and the test; `NOT_YET` is a `ReadonlySet<string>`; `opaqueFade` keeps its current signature; `growFade`'s `easing` name matches the Composer's existing parameter.
- No placeholders: every code step shows its code; the only open values are Austen's gates (Tasks 1, 2 step 6, Phase B cost).

---

## Phase C: the Composer's route system becomes the package's (Austen, 2026-10-12: "use the most advanced system")

The Composer's page changes are named shared-element morphs (`runNamedRouteMorph`), a document-wide `view-transition-name` registry so a name claimed twice does not abort the transition, and a one-shot skip flag for a swipe-dismiss that already animated. The package has a content fade and a record morph (`installRouteMotion`). The Composer's pieces are the generic ones; its pair rules (`navigationMorphs`: launchpad tiles, browse to sequence, shop index to product) and its DEV morph probe stay app-side. After this phase every app calls one `installRouteMotion`, which decides per navigation between `none`, `fade`, `morph` (record box) and `named` (shared elements the app named), and the Composer's own `onNavigate` block is gone.

### Task C1: Package 0.2.0: named morphs, the name registry, the skip flag

Runs in `E:/worktrees/shared-packages/motion-grow-easing` after Task 2's commit (same branch; it carries 0.1.4's change too and is released as 0.2.0).

**Files:**

- Create: `packages/motion/src/named-route-morph.svelte.ts` (verbatim port of the Composer's `src/lib/shared/transitions/named-route-morph-state.svelte.ts`, package style: tabs, single quotes)
- Create: `packages/motion/src/view-transition-names.ts` (the Composer's `view-transition-name-registry.ts` and `claimed-view-transition-name.ts` in one module)
- Create: `packages/motion/src/skip-route-motion.svelte.ts` (the Composer's `sequence-drawer-state.svelte.ts`, renamed: `skipNextRouteMotion()`, `consumeSkipNextRouteMotion()`)
- Modify: `packages/motion/src/route-morph.ts` (`decideRouteMotion` gains `named` and `skipped` inputs and the `'named'` result)
- Modify: `packages/motion/src/route-motion.ts` (`installRouteMotion` options gain `morphs`, `isShallow`, `onTransition`)
- Create: `packages/motion/css/named-route-morph.css`
- Modify: `packages/motion/src/index.ts`, `README.md`, `package.json` (0.2.0)
- Tests: `named-route-morph.test.ts`, `view-transition-names.test.ts`, extend `route-morph.test.ts` and `route-motion.test.ts`

- [ ] **Step 1: `decideRouteMotion` learns `named` and `skipped`**

```ts
export type RouteMotion = "none" | "fade" | "morph" | "named";

export function decideRouteMotion(input: {
  fromPath: string | undefined;
  toPath: string | undefined;
  supported: boolean;
  reduced: boolean;
  /** A record box on the old page that should morph into the new one. */
  hasSource: boolean;
  /** The app named shared elements on both pages (its `morphs(from, to)` said yes). */
  named?: boolean;
  /** The page already animated its own exit (skipNextRouteMotion). */
  skipped?: boolean;
}): RouteMotion {
  if (!input.supported || input.reduced || input.skipped) return "none";
  if (!input.fromPath || !input.toPath || input.fromPath === input.toPath)
    return "none";
  if (input.named) return "named";
  return input.hasSource ? "morph" : "fade";
}
```

Tests in `route-morph.test.ts`: `named: true` wins over `hasSource: true`; `skipped: true` gives `'none'` even with `named: true`; reduced still gives `'none'`.

- [ ] **Step 2: `installRouteMotion` takes the app's rules**

```ts
export interface RouteMotionOptions {
  routes: RecordRoutes;
  onNavigate: (
    callback: (navigation: NavigationLike) => Promise<void> | undefined
  ) => void;
  /** True when both pages carry the same `view-transition-name`s (the app's pair rules). */
  morphs?: (from: NavigationLike["from"], to: NavigationLike["to"]) => boolean;
  /** True for a same-page URL write (SvelteKit shallow routing) that must not animate. */
  isShallow?: (navigation: NavigationLike) => boolean;
  /** Receives every started view transition; a dev probe can attach to it. */
  onTransition?: (
    transition: ViewTransition,
    navigation: NavigationLike
  ) => void;
}
```

`routeMotionHandler(options)`: returns early on `isShallow?.(navigation)`; reads `skipped: consumeSkipNextRouteMotion()` and `named: !!options.morphs?.(navigation.from, navigation.to)` into `decideRouteMotion`. For `'named'`:

```ts
return new Promise<void>((resolve) => {
  try {
    const transition = runNamedRouteMorph(() =>
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      })
    );
    options.onTransition?.(transition, navigation);
  } catch {
    // A startup failure must not strand the navigation; ownership is already released.
    resolve();
  }
});
```

For `'fade'` and `'morph'` the existing `runRouteTransition` path is unchanged, and `onTransition` is called with the transition it starts (add that return value to `runRouteTransition`).

- [ ] **Step 3: The three ported modules, verbatim**

Copy the Composer files named above, converting style only. Public names in `index.ts`:

```ts
export {
  NAMED_ROUTE_MORPH_CLASS,
  ignoreViewTransitionSkip,
  isNamedRouteMorphActive,
  runAfterNamedRouteMorph,
  runAfterNamedRouteMorphIdle,
  runNamedRouteMorph,
} from "./named-route-morph.svelte";
export {
  claimViewTransitionName,
  claimedViewTransitionName,
  countViewTransitionNameClaims,
  resetViewTransitionNameRegistry,
  type ClaimedViewTransitionNameParams,
  type NameGrantListener,
} from "./view-transition-names";
export {
  skipNextRouteMotion,
  consumeSkipNextRouteMotion,
} from "./skip-route-motion.svelte";
```

`css/named-route-morph.css`:

```css
/* A named route morph (src/named-route-morph.svelte.ts) captures only the
   elements the app named. The root is not snapshotted, so persistent chrome
   stays live, and the overlay is clear so the incoming page shows beneath. */
html.named-route-morph {
  view-transition-name: none;
}

html.named-route-morph::view-transition {
  background: transparent;
}
```

Tests (jsdom): the registry grants the first claimant and promotes the next on release; `claimedViewTransitionName` stamps and clears `style.viewTransitionName`; `runNamedRouteMorph` adds the root class, `isNamedRouteMorphActive()` is true until `finished` settles, callbacks queued with `runAfterNamedRouteMorph` run once after; a rejecting `ready` does not throw; the skip flag is consumed once.

- [ ] **Step 4: Check, build, README, version, commit**

README gains a "Named morphs" section: when to use `morphs` (the app names elements on both pages with `use:claimedViewTransitionName={{ name }}`), the CSS import, `skipNextRouteMotion()` before a `goto()` whose exit the page already animated, and `runAfterNamedRouteMorphIdle` for heavy work after a morph. Version `0.2.0`.

```bash
git commit -m "feat(motion): named route morphs, the view-transition-name registry and a skip flag, from the Flow Arts Composer" -- packages/motion/src packages/motion/css packages/motion/README.md packages/motion/package.json
```

- [ ] **Step 5: GATE. Ship 0.2.0 to the Composer**

Publish (`npm publish --access public` from `packages/motion`, Austen's yes) or pack (`npm pack` into `E:/tka-platform/vendor/austencloud-motion-0.2.0.tgz` with a `file:` range, the sidebar precedent). Either way the install runs in the primary (`pnpm add ...`), the two files are committed on `main`, and the task branch merges `main`.

### Task C2: The Composer calls `installRouteMotion`

Runs on `codex/motion-route-port` (a new worktree from `main` after Task 6 integrated).

**Files:**

- Modify: `src/routes/+layout.svelte` (the `onNavigate` block, lines 106-138, and the CSS imports)
- Modify to re-exports: `src/lib/shared/transitions/named-route-morph-state.svelte.ts`, `claimed-view-transition-name.ts`, `view-transition-name-registry.ts`, `sequence-drawer-state.svelte.ts`
- Modify: `src/lib/shared/transitions/motion.ts` (drop the local `growFade`, re-export the package's)
- Modify: `src/lib/shared/transitions/view-transitions.css` (remove the two `html.named-route-morph` rules now in the package CSS)
- Modify: `src/lib/shared/transitions/navigation-morphs.ts` (its `RouteLocation` type becomes the package's `NavigationLike['from']`)

- [ ] **Step 1: Shims**

Each of the four files becomes a re-export with the Composer's old names kept:

```ts
// named-route-morph-state.svelte.ts
export {
  NAMED_ROUTE_MORPH_CLASS,
  ignoreViewTransitionSkip,
  isNamedRouteMorphActive,
  runAfterNamedRouteMorph,
  runAfterNamedRouteMorphIdle,
  runNamedRouteMorph,
} from "@austencloud/motion";
// sequence-drawer-state.svelte.ts
export {
  skipNextRouteMotion as setSkipNextViewTransition,
  consumeSkipNextRouteMotion as consumeSkipNextViewTransition,
} from "@austencloud/motion";
```

and the registry and action files re-export their four names.

- [ ] **Step 2: The layout**

Replace the whole `onNavigate((navigation) => { ... })` block with:

```ts
installRouteMotion({
  routes: {},
  onNavigate,
  morphs: navigationMorphs,
  isShallow: isShallowGoto,
  onTransition: import.meta.env.DEV
    ? (transition, navigation) =>
        startMorphProbe(
          `${navigation.from?.url.pathname}→${navigation.to?.url.pathname}`
        ).attach(transition)
    : undefined,
});
```

Import `installRouteMotion` from `@austencloud/motion` and `@austencloud/motion/css/named-route-morph.css` next to the tokens import. Drop the now-unused imports (`reducedMotion`, `consumeSkipNextViewTransition`, `runNamedRouteMorph`). The probe's `cancel()` path is no longer reachable from the layout; keep `startMorphProbe` as is.

- [ ] **Step 3: Prove it**

`src/lib/shared/transitions/layout-flip.svelte.test.ts` and the package tests stay green; `npm run check:fast` adds no errors. In the browser (task server from the worktree): `/` to a launchpad tile's page morphs and back; `/browse` to a sequence page morphs; a swipe-dismiss on a sequence page runs no second transition; with reduced motion on, every change is a plain swap. Film the launchpad morph forward and back.

- [ ] **Step 4: Commit and finish**

```bash
git commit -m "feat(motion): the Composer's page changes run through installRouteMotion" -- src/routes/+layout.svelte src/lib/shared/transitions
cd E:/tka-platform && npm run wt:finish -- codex/motion-route-port --route /
```
