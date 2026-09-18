# Generate Card Morph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/create/generate`, tapping Customize, LOOP or Setups grows that card into the bento stage (side-by-side layouts) or the full viewport (stacked layouts) through a View Transition, and X or Escape shrinks it back; the three drawers stop being mounted there.

**Architecture:** A `generate-card-morph.ts` service wraps `startMorph` and decides whether a transition can run. Card wrappers in `CardBasedSettingsContainer` claim `generate-card-<id>` while closed; a new `ExpandedCardStage` claims the same name while open and renders the right panel in the right destination. `GeneratePanel` supplies the stage through a snippet so the panel props stay where they are today. Panel state gains one derived `openGenerateCard` getter and a `closeGenerateCard()`.

**Tech Stack:** Svelte 5 runes, View Transitions API via `src/lib/shared/transitions/results-morph.ts` and `claimed-view-transition-name.ts`, Vitest (jsdom for state and services, browser project for `.svelte.test.ts`), the built-in browser for the seven-viewport check.

**Spec:** `docs/superpowers/specs/2026-09-17-generate-card-morph-design.md`

**Worktree:** `E:/worktrees/tka-platform/generate-card-morph` on branch `codex/generate-card-morph`, created from `main` with `git worktree add E:/worktrees/tka-platform/generate-card-morph -b codex/generate-card-morph main`, then `cmd /c mklink /J E:\worktrees\tka-platform\generate-card-morph\node_modules E:\tka-platform\node_modules`. Every command below runs from that worktree unless it says otherwise. Commit with explicit pathspecs only (`git commit -m "..." -- <paths>`), never `git add -A`.

**Amendment to the spec, decided during planning:** `modals/CustomizeDrawer.svelte` and `modals/LOOPDrawer.svelte` are NOT deleted. The public Composer demo (`src/routes/(public)/composer/_sections/GenerateSection.svelte`) composes its own card grid and mounts those two drawers; migrating the demo is a separate task. `GeneratePanel` stops mounting them. `PresetDrawer.svelte` is retired because `GeneratePanel` is its only host. Task 12 records this in the spec.

---

## File map

| File                                                                                                                        | Responsibility                                                         |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/lib/shared/create/state/panel-coordination-state.svelte.ts` (modify)                                                   | `openGenerateCard` getter, `closeGenerateCard()`                       |
| `tests/unit/create/generate-card-panel-state.test.ts` (create)                                                              | derivation and exclusivity                                             |
| `src/lib/features/create/generate/shared/services/generate-card-morph.ts` (create)                                          | host ids, names, `morphGenerateCard`, `lastGenerateCardMorphRan`       |
| `src/lib/features/create/generate/shared/services/generate-card-morph.test.ts` (create)                                     | plain vs morph decisions                                               |
| `src/lib/shared/transitions/view-transitions.css` (modify)                                                                  | `::view-transition-group(generate-card-*)` timing                      |
| `src/lib/features/create/generate/components/cards/CustomizeExpandedOverlay.svelte` (modify)                                | `entrance` passthrough                                                 |
| `src/lib/features/create/generate/components/cards/LOOPExpandedOverlay.svelte` (modify)                                     | `entrance` prop collapses its own scale entrance                       |
| `src/lib/features/create/generate/components/presets/SetupsPanel.svelte` (create)                                           | PresetDrawer content on `GenerationSettingsOverlay` chrome             |
| `src/lib/features/create/generate/components/presets/SetupsPanel.svelte.test.ts` (create, moved from PresetDrawer test)     | list behavior                                                          |
| `src/lib/features/create/generate/components/presets/PresetDrawer.svelte` + `.svelte.test.ts` + `__screenshots__/` (delete) | retired                                                                |
| `src/lib/features/create/generate/components/cards/ExpandedCardStage.svelte` (create)                                       | destination, claim, focus, Escape, panel switch                        |
| `src/lib/features/create/generate/components/cards/ExpandedCardStage.svelte.test.ts` (create)                               | renders per id, Escape, claim                                          |
| `src/lib/features/create/generate/components/CardBasedSettingsContainer.svelte` (modify)                                    | wrapper claims, `expandedCard` snippet slot, preset open through morph |
| `src/lib/features/create/generate/components/cards/CustomizeCard.svelte` (modify)                                           | open through morph                                                     |
| `src/lib/features/create/generate/components/cards/ConsolidatedLOOPCard.svelte` (modify)                                    | open through morph                                                     |
| `src/lib/features/create/generate/components/GeneratePanel.svelte` (modify)                                                 | drop drawer mounts, supply the stage                                   |
| `docs/architecture/canonical-capabilities.md` (modify)                                                                      | new motion route                                                       |
| `docs/superpowers/specs/2026-09-17-generate-card-morph-design.md` (modify)                                                  | the amendment above                                                    |

---

### Task 1: `openGenerateCard` in panel state

**Files:**

- Modify: `src/lib/shared/create/state/panel-coordination-state.svelte.ts` (interface near line 324, implementation near line 1059)
- Test: `tests/unit/create/generate-card-panel-state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/create/generate-card-panel-state.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { effect_root } from "svelte/internal/client";
import {
  createPanelCoordinationState,
  type PanelCoordinationState,
} from "$lib/shared/create/state/panel-coordination-state.svelte";
import { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function createState(): PanelCoordinationState {
  let state!: PanelCoordinationState;
  cleanup = effect_root(() => {
    state = createPanelCoordinationState();
  });
  return state;
}

const customizeProps = {
  constraintPreset: "smooth",
  handPathMode: "smooth",
  motionTypeFilter: null,
  startEndOptions: null,
  level: 2,
  gridMode: "diamond",
  isFreeformMode: true,
  onConstraintPresetChange: () => {},
  onHandPathModeChange: () => {},
  onMotionTypeFilterChange: () => {},
  onStartEndChange: null,
} as unknown as Parameters<PanelCoordinationState["openCustomizeOverlay"]>[0];

describe("openGenerateCard", () => {
  it("is null when nothing is open", () => {
    const state = createState();
    expect(state.openGenerateCard).toBeNull();
  });

  it("names the open card and switches when another opens", () => {
    const state = createState();

    state.openCustomizeOverlay(customizeProps);
    expect(state.openGenerateCard).toBe("customize");

    state.openLOOPPanel(LOOPType.MIRRORED, new Set(), () => {});
    expect(state.openGenerateCard).toBe("loop");
    expect(state.isCustomizeOverlayOpen).toBe(false);

    state.openPresetDrawer();
    expect(state.openGenerateCard).toBe("preset");
    expect(state.isLOOPPanelOpen).toBe(false);
  });

  it("closeGenerateCard closes whichever card is open", () => {
    const state = createState();

    state.openPresetDrawer();
    state.closeGenerateCard();
    expect(state.openGenerateCard).toBeNull();
    expect(state.isPresetDrawerOpen).toBe(false);

    state.openLOOPPanel(LOOPType.MIRRORED, new Set(), () => {});
    state.closeGenerateCard();
    expect(state.isLOOPPanelOpen).toBe(false);
    expect(state.loopOnChange).toBeNull();

    state.openCustomizeOverlay(customizeProps);
    state.closeGenerateCard();
    expect(state.isCustomizeOverlayOpen).toBe(false);
    expect(state.customizeOverlayProps).toBeNull();
  });

  it("closeGenerateCard is a no-op when nothing is open", () => {
    const state = createState();
    expect(() => state.closeGenerateCard()).not.toThrow();
    expect(state.openGenerateCard).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/generate-card-panel-state.test.ts`
Expected: FAIL, `state.openGenerateCard` is `undefined` and `closeGenerateCard is not a function`.

- [ ] **Step 3: Add the type and the getter**

In the `PanelCoordinationState` interface, after `get isAnyPanelOpen(): boolean;` (near line 324) add:

```ts
  /**
   * Which generate bento card is grown into its workspace, or null. At most
   * one of the three (later four) is open because every open… call runs
   * closeAllPanels first. ExpandedCardStage renders from this.
   */
  get openGenerateCard(): GenerateCardPanelId | null;
  /** Close whichever generate card is open. No-op when none is. */
  closeGenerateCard(): void;
```

Near the top of the file, next to the other exported types (after `CustomizeOverlayProps`), add:

```ts
/** The generate bento cards that grow into their workspace. */
export type GenerateCardPanelId = "customize" | "loop" | "preset";
```

In the returned object, after the `get isAnyPanelOpen()` getter (near line 1059), add:

```ts
    get openGenerateCard(): GenerateCardPanelId | null {
      if (isCustomizeOverlayOpen) return "customize";
      if (isLOOPPanelOpen) return "loop";
      if (isPresetDrawerOpen) return "preset";
      return null;
    },

    closeGenerateCard() {
      if (isCustomizeOverlayOpen) {
        this.closeCustomizeOverlay();
      } else if (isLOOPPanelOpen) {
        this.closeLOOPPanel();
      } else if (isPresetDrawerOpen) {
        this.closePresetDrawer();
      }
    },
```

`this` is the returned state object; the other methods (`closeCustomizeOverlay`, `closeLOOPPanel`, `closePresetDrawer`) are defined on it, so delegate instead of duplicating their teardown (Customize's `forgetCustomizeOverlay()` in particular).

- [ ] **Step 4: Run the test**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/generate-card-panel-state.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(create): openGenerateCard and closeGenerateCard on panel state" -- src/lib/shared/create/state/panel-coordination-state.svelte.ts tests/unit/create/generate-card-panel-state.test.ts
```

---

### Task 2: `generate-card-morph.ts` service

**Files:**

- Create: `src/lib/features/create/generate/shared/services/generate-card-morph.ts`
- Test: `src/lib/features/create/generate/shared/services/generate-card-morph.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/features/create/generate/shared/services/generate-card-morph.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const startMorph = vi.fn<(mutate: () => void) => ViewTransition | null>();
vi.mock("$lib/shared/transitions/results-morph", () => ({
  startMorph: (mutate: () => void) => startMorph(mutate),
}));

const claims = vi.fn<(name: string) => number>(() => 0);
vi.mock("$lib/shared/transitions/view-transition-name-registry", () => ({
  countViewTransitionNameClaims: (name: string) => claims(name),
}));

import {
  generateCardMorphName,
  lastGenerateCardMorphRan,
  morphGenerateCard,
} from "./generate-card-morph";

beforeEach(() => {
  startMorph.mockReset();
  claims.mockReset();
  claims.mockReturnValue(0);
});

describe("generateCardMorphName", () => {
  it("names the host cards and nothing else", () => {
    expect(generateCardMorphName("customize")).toBe("generate-card-customize");
    expect(generateCardMorphName("loop")).toBe("generate-card-loop");
    expect(generateCardMorphName("preset")).toBe("generate-card-preset");
    expect(generateCardMorphName("length")).toBe("");
    expect(generateCardMorphName("generate-button")).toBe("");
  });
});

describe("morphGenerateCard", () => {
  it("runs the mutation plainly when no card wrapper has claimed the name", () => {
    const mutate = vi.fn();
    const ran = morphGenerateCard("customize", mutate);
    expect(mutate).toHaveBeenCalledOnce();
    expect(startMorph).not.toHaveBeenCalled();
    expect(ran).toBe(false);
    expect(lastGenerateCardMorphRan()).toBe(false);
  });

  it("routes through startMorph when the name is claimed and reports whether a transition ran", () => {
    claims.mockReturnValue(1);
    const mutate = vi.fn();
    startMorph.mockImplementation((m) => {
      m();
      return {} as ViewTransition;
    });

    expect(morphGenerateCard("loop", mutate)).toBe(true);
    expect(startMorph).toHaveBeenCalledOnce();
    expect(mutate).toHaveBeenCalledOnce();
    expect(lastGenerateCardMorphRan()).toBe(true);

    startMorph.mockImplementation((m) => {
      m();
      return null;
    });
    expect(morphGenerateCard("loop", vi.fn())).toBe(false);
    expect(lastGenerateCardMorphRan()).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/create/generate/shared/services/generate-card-morph.test.ts`
Expected: FAIL, cannot resolve `./generate-card-morph`.

- [ ] **Step 3: Write the service**

```ts
// src/lib/features/create/generate/shared/services/generate-card-morph.ts
/**
 * The seam for "a generate bento card grows into its workspace".
 *
 * Customize, LOOP and Setups open through here. The card wrapper in
 * CardBasedSettingsContainer claims `generate-card-<id>` while the panel is
 * closed and ExpandedCardStage claims it while open, so wrapping the state
 * change in a same-document view transition makes the browser carry the card
 * from its grid slot to the stage (or the viewport) and back. See
 * docs/superpowers/specs/2026-09-17-generate-card-morph-design.md.
 *
 * `startMorph` already answers "can a transition run": no View Transitions
 * support, reduced motion, or one already in flight all fall back to a plain
 * mutation. This module adds one more: no wrapper has claimed the name, which
 * is the public Composer demo (its own grid, no claims), where a transition
 * would snapshot the page for nothing.
 */
import { startMorph } from "$lib/shared/transitions/results-morph";
import { countViewTransitionNameClaims } from "$lib/shared/transitions/view-transition-name-registry";

/** The cards that grow. Order is irrelevant; membership is the contract. */
export const GENERATE_CARD_MORPH_HOSTS = [
  "customize",
  "loop",
  "preset",
] as const;
export type GenerateCardMorphHost = (typeof GENERATE_CARD_MORPH_HOSTS)[number];

/**
 * The view-transition name a card id claims, or "" for cards that do not
 * grow. `claimedViewTransitionName` treats "" as "no claim", so callers can
 * pass this straight through for every card.
 */
export function generateCardMorphName(cardId: string): string {
  return (GENERATE_CARD_MORPH_HOSTS as readonly string[]).includes(cardId)
    ? `generate-card-${cardId}`
    : "";
}

let lastRan = false;

/**
 * Open or close `host` by running `mutate` inside the card morph when one can
 * run. Returns true when a transition is carrying the change, false when the
 * mutation applied plainly. ExpandedCardStage reads the same answer through
 * `lastGenerateCardMorphRan` to pick its entrance.
 */
export function morphGenerateCard(
  host: GenerateCardMorphHost,
  mutate: () => void
): boolean {
  if (countViewTransitionNameClaims(generateCardMorphName(host)) === 0) {
    mutate();
    lastRan = false;
    return false;
  }
  lastRan = startMorph(mutate) !== null;
  return lastRan;
}

/** Whether the most recent morphGenerateCard call ran as a transition. */
export function lastGenerateCardMorphRan(): boolean {
  return lastRan;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/features/create/generate/shared/services/generate-card-morph.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(create): generate-card-morph service over startMorph" -- src/lib/features/create/generate/shared/services/generate-card-morph.ts src/lib/features/create/generate/shared/services/generate-card-morph.test.ts
```

---

### Task 3: View transition timing for the card groups

**Files:**

- Modify: `src/lib/shared/transitions/view-transitions.css` (after the `learn-grid-stage` block, near line 62)

- [ ] **Step 1: Add the group rule**

After the `::view-transition-group(learn-grid-stage)` rule, add:

```css
/* A generate bento card growing into its workspace (Customize, LOOP, Setups,
   TnD). The card wrapper and the expanded stage share one name, so the group
   carries the box between the grid slot and the stage or viewport while the
   old card content cross-fades into the panel. Owner:
   features/create/generate/shared/services/generate-card-morph.ts. */
::view-transition-group(generate-card-customize),
::view-transition-group(generate-card-loop),
::view-transition-group(generate-card-preset),
::view-transition-group(generate-card-tnd) {
  animation-duration: var(--duration-dramatic);
  animation-timing-function: var(--ease-in-out);
}
```

`generate-card-tnd` is listed now so the companion TnD plan does not touch this file again.

- [ ] **Step 2: Verify the stylesheet still parses**

Run: `npx prettier --check src/lib/shared/transitions/view-transitions.css`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 3: Commit**

```bash
git commit -m "style(transitions): timing for the generate-card view transition groups" -- src/lib/shared/transitions/view-transitions.css
```

---

### Task 4: `entrance` passthrough on the Customize and LOOP overlays

**Files:**

- Modify: `src/lib/features/create/generate/components/cards/CustomizeExpandedOverlay.svelte` (props near line 62 to 104, the `<GenerationSettingsOverlay` mount near line 364)
- Modify: `src/lib/features/create/generate/components/cards/LOOPExpandedOverlay.svelte` (props near line 40 to 66, root `transition:scale` near line 515)

- [ ] **Step 1: Add the prop to CustomizeExpandedOverlay**

In the destructured `$props`, after `onClose,` add `entrance = "scale",` and in the type block after `onClose: () => void;` add:

```ts
    /** Forwarded to GenerationSettingsOverlay. "none" when a host transition
     *  is already carrying the panel in. */
    entrance?: "scale" | "none";
```

At the mount, add `{entrance}`:

```svelte
<GenerationSettingsOverlay
  title="Customize"
  closeLabel="Close customize panel"
  onClose={handleClose}
  {entrance}
>
```

- [ ] **Step 2: Add the same prop to LOOPExpandedOverlay**

LOOPExpandedOverlay draws its own chrome and scales itself in with a Svelte
`transition:scale` on its root. Under the morph that would double-animate, so
it takes the same `entrance` prop and collapses the scale to nothing when the
host says "none" (the same pattern `GenerationSettingsOverlay` uses).

In the `$props` destructuring add `entrance = "scale",` after `onClose,` and in
the type block after `onClose: () => void;` add:

```ts
    /** "none" when a host transition (the card morph) is already carrying the
     *  panel in; the root then skips its own scale entrance. */
    entrance?: "scale" | "none";
```

Change the root's transition to:

```svelte
transition:scale={{
  start: entrance === "none" ? 1 : 0.95,
  duration: entrance === "none" ? 0 : motionDuration(DURATION.emphasis),
  easing: quintOut,
}}
```

- [ ] **Step 3: Type-check the two files**

Run: `npm run check:fast`
Expected: no new errors mentioning `CustomizeExpandedOverlay.svelte` or `LOOPExpandedOverlay.svelte`. (The baseline may already contain unrelated errors; if the count is unclear, run the same command once in `E:/tka-platform` and compare. Never stash.)

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(create): entrance passthrough on the Customize and LOOP overlays" -- src/lib/features/create/generate/components/cards/CustomizeExpandedOverlay.svelte src/lib/features/create/generate/components/cards/LOOPExpandedOverlay.svelte
```

---

### Task 5: `SetupsPanel.svelte` from PresetDrawer

**Files:**

- Create: `src/lib/features/create/generate/components/presets/SetupsPanel.svelte`
- Create: `src/lib/features/create/generate/components/presets/SetupsPanel.svelte.test.ts`
- Delete: `src/lib/features/create/generate/components/presets/PresetDrawer.svelte`, `PresetDrawer.svelte.test.ts`, `__screenshots__/PresetDrawer.svelte.test.ts/`

- [ ] **Step 1: Move the test first**

`git mv src/lib/features/create/generate/components/presets/PresetDrawer.svelte.test.ts src/lib/features/create/generate/components/presets/SetupsPanel.svelte.test.ts`

Then edit the moved file:

- `import PresetDrawer from "./PresetDrawer.svelte";` becomes `import SetupsPanel from "./SetupsPanel.svelte";`
- `type PresetDrawerProps = ComponentProps<typeof PresetDrawer>;` becomes `type SetupsPanelProps = ComponentProps<typeof SetupsPanel>;` and every `PresetDrawerProps` becomes `SetupsPanelProps`.
- In `props()`, delete the `isOpen: true,` line (the panel has no `isOpen`; the stage decides whether it is mounted).
- Every `render(PresetDrawer, ...)` becomes `render(SetupsPanel, ...)`.
- `describe("PresetDrawer", ...)` becomes `describe("SetupsPanel", ...)`.
- Add one test at the end of the describe block:

```ts
it("closes from the panel chrome", async () => {
  const onClose = vi.fn();
  render(SetupsPanel, props(fakeState(), { onClose }));

  await page.getByRole("button", { name: "Close generator setups" }).click();

  expect(onClose).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config tests/config/vitest.components.config.ts src/lib/features/create/generate/components/presets/SetupsPanel.svelte.test.ts`
Expected: FAIL, cannot resolve `./SetupsPanel.svelte`.

- [ ] **Step 3: Create SetupsPanel.svelte**

`git mv src/lib/features/create/generate/components/presets/PresetDrawer.svelte src/lib/features/create/generate/components/presets/SetupsPanel.svelte`, then edit it as follows. Everything not mentioned stays byte for byte.

Header comment:

```svelte
<!--
  Generator setups, the grown Setups card.

  Saved setups are private workspace snapshots. Community Favorites are
  intentionally shared projections. ExpandedCardStage mounts this inside the
  bento stage or the full viewport; the chrome (title, X, accent surface) is
  GenerationSettingsOverlay, the same as Customize.
-->
```

Script imports: remove `Drawer`, `DrawerHeader` and `portal`; add
`import GenerationSettingsOverlay from "../cards/GenerationSettingsOverlay.svelte";`.

Props: remove `isOpen` from the destructuring and from the type; add `entrance = "scale"` and the type line `entrance?: "scale" | "none";` after `onClose`.

Template: replace the block from `<div use:portal>` through the closing `</div>` of `<Drawer>` (keep `<ConfirmDialog ... />` after it untouched) with:

```svelte
<GenerationSettingsOverlay
  title="Generator setups"
  closeLabel="Close generator setups"
  {onClose}
  {entrance}
>
  <div class="drawer-body">
    ... the existing <SegmentedControl> and both <div class="setup-panel"> blocks, unchanged ...
  </div>
</GenerationSettingsOverlay>
```

Styles: delete the four `:global(.drawer-content.preset-drawer-sheet…)` rules, the `:global(.drawer-overlay.preset-drawer-backdrop…)` rule, the `@media (max-width: 1023px)` block that only targets `.preset-drawer-sheet`, and the `.preset-drawer-content` rule. Change `.drawer-body`'s padding to `padding: 0 0 env(safe-area-inset-bottom, 0px);` (the overlay already pads 16px). Every other rule (`.setup-panel`, `.preview-banner`, `.empty-state`, `.save-button`, `.setup-list`, `.favorite-item`, and so on) stays.

Then delete the stale screenshots: `git rm -r src/lib/features/create/generate/components/presets/__screenshots__/PresetDrawer.svelte.test.ts` (if the directory exists; `ls` first).

- [ ] **Step 4: Run the test**

Run: `npx vitest run --config tests/config/vitest.components.config.ts src/lib/features/create/generate/components/presets/SetupsPanel.svelte.test.ts`
Expected: PASS (7 tests). If a visual snapshot assertion in the moved test fails because of the new chrome, update that snapshot with `-u` once and inspect the produced image before committing it.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/create/generate/components/presets/SetupsPanel.svelte src/lib/features/create/generate/components/presets/SetupsPanel.svelte.test.ts
git commit -m "refactor(create): SetupsPanel carries the PresetDrawer content" -- src/lib/features/create/generate/components/presets
```

(Whole-directory pathspec is fine here: the directory contains only this task's files; check `git status --short src/lib/features/create/generate/components/presets` first.)

---

### Task 6: `ExpandedCardStage.svelte`

**Files:**

- Create: `src/lib/features/create/generate/components/cards/ExpandedCardStage.svelte`
- Test: `src/lib/features/create/generate/components/cards/ExpandedCardStage.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/features/create/generate/components/cards/ExpandedCardStage.svelte.test.ts
import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { effect_root, flushSync } from "svelte/internal/client";
import type { ComponentProps } from "svelte";
import ExpandedCardStage from "./ExpandedCardStage.svelte";
import {
  createPanelCoordinationState,
  type PanelCoordinationState,
} from "$lib/shared/create/state/panel-coordination-state.svelte";
import { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";
import {
  countViewTransitionNameClaims,
  resetViewTransitionNameRegistry,
} from "$lib/shared/transitions/view-transition-name-registry";
import type { FavoriteState } from "../../state/favorite-state.svelte";

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  resetViewTransitionNameRegistry();
});

function createState(): PanelCoordinationState {
  let state!: PanelCoordinationState;
  cleanup = effect_root(() => {
    state = createPanelCoordinationState();
  });
  return state;
}

function fakeFavorites(): FavoriteState {
  return {
    setups: [],
    communityFavorites: [],
    sharedSetupId: null,
    activeSource: null,
    activeStatus: null,
    isLoadingSetups: false,
    isLoadingCommunity: false,
    setupsLoadError: null,
    communityLoadError: null,
    pendingAction: null,
    canSave: true,
    loadPersonal: vi.fn(async () => undefined),
    loadCommunity: vi.fn(async () => undefined),
    saveCurrentSetup: vi.fn(async () => true),
    renameSetup: vi.fn(async () => true),
    updateSetupFromCurrent: vi.fn(async () => true),
    shareSetup: vi.fn(async () => true),
    unshareSetup: vi.fn(async () => true),
    deleteSetup: vi.fn(async () => true),
    setActiveSource: vi.fn(),
  } as unknown as FavoriteState;
}

type Props = ComponentProps<typeof ExpandedCardStage>;

function props(
  panelState: PanelCoordinationState,
  isDesktopLayout = true
): Props {
  return {
    panelState,
    isDesktopLayout,
    loop: {
      rhythm: {
        rotationInterval: 2,
        inversionInterval: 2,
        inversionMode: "expand",
        reflectionAxis: "north-south",
      },
      sequenceLength: 8,
      onRhythmChange: vi.fn(),
      onLoopDisable: vi.fn(),
      onRequestSignup: vi.fn(),
    },
    setups: {
      favoriteState: fakeFavorites(),
      isSignedOut: false,
      isPreview: false,
      isAnonymous: false,
      onApply: vi.fn(),
      onRequestCommunityAccount: vi.fn(),
      onRequestShareAccount: vi.fn(),
      onRequestSignIn: vi.fn(),
    },
  };
}

describe("ExpandedCardStage", () => {
  it("renders nothing while no card is open", () => {
    const state = createState();
    const { container } = render(ExpandedCardStage, props(state));
    expect(container.querySelector(".expanded-card-stage")).toBeNull();
  });

  it("renders the Setups panel in the stage on side-by-side layouts", async () => {
    const state = createState();
    const { container } = render(ExpandedCardStage, props(state, true));

    state.openPresetDrawer();
    flushSync();

    const root = container.querySelector<HTMLElement>(".expanded-card-stage");
    expect(root).not.toBeNull();
    expect(root!.dataset.destination).toBe("stage");
    expect(countViewTransitionNameClaims("generate-card-preset")).toBe(1);
    await expect
      .element(page.getByRole("heading", { name: "Generator setups" }))
      .toBeVisible();
  });

  it("portals to the body on stacked layouts", () => {
    const state = createState();
    const { container } = render(ExpandedCardStage, props(state, false));

    state.openPresetDrawer();
    flushSync();

    expect(container.querySelector(".expanded-card-stage")).toBeNull();
    const root = document.body.querySelector<HTMLElement>(
      ":scope > .expanded-card-stage"
    );
    expect(root).not.toBeNull();
    expect(root!.dataset.destination).toBe("viewport");
  });

  it("renders the LOOP overlay for the loop card", async () => {
    const state = createState();
    render(ExpandedCardStage, props(state, true));

    state.openLOOPPanel(LOOPType.MIRRORED, new Set(), () => {});
    flushSync();

    await expect
      .element(page.getByRole("button", { name: "Close LOOP selection" }))
      .toBeVisible();
    expect(countViewTransitionNameClaims("generate-card-loop")).toBe(1);
  });

  it("closes on Escape and releases the claim", async () => {
    const state = createState();
    render(ExpandedCardStage, props(state, true));

    state.openPresetDrawer();
    flushSync();
    expect(state.openGenerateCard).toBe("preset");

    await page.keyboard.press("Escape");
    flushSync();

    expect(state.openGenerateCard).toBeNull();
    expect(countViewTransitionNameClaims("generate-card-preset")).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config tests/config/vitest.components.config.ts src/lib/features/create/generate/components/cards/ExpandedCardStage.svelte.test.ts`
Expected: FAIL, cannot resolve `./ExpandedCardStage.svelte`.

- [ ] **Step 3: Write the component**

```svelte
<!--
  ExpandedCardStage: the grown generate card.

  Renders whichever of Customize, LOOP and Setups is open (panelState.
  openGenerateCard) and claims that card's view-transition name, so the morph
  in generate-card-morph.ts carries the card wrapper's box here and back.

  Two destinations for one component:
  - side-by-side (isDesktopLayout): in place, absolute inside .card-grid-stage,
    which the container renders this into through its expandedCard snippet.
    The Level toolbar above the grid stays.
  - stacked: portaled to <body> and fixed to the viewport, bottom nav included.
    It cannot stay inside the settings container: `container-type: size`
    applies layout containment, which makes the container the containing
    block for fixed descendants.

  No backdrop, no outside-click dismissal: the workspace beside the grown card
  stays live. X and Escape close. Focus moves in on open and back to the card
  that opened it on close.
-->
<script lang="ts">
  import { tick } from "svelte";
  import { portal } from "../modals/portal";
  import { claimedViewTransitionName } from "$lib/shared/transitions/claimed-view-transition-name";
  import { reducedMotion } from "$lib/shared/transitions/motion";
  import type {
    GenerateCardPanelId,
    PanelCoordinationState,
  } from "$lib/shared/create/state/panel-coordination-state.svelte";
  import {
    generateCardMorphName,
    lastGenerateCardMorphRan,
    morphGenerateCard,
  } from "../../shared/services/generate-card-morph";
  import CustomizeExpandedOverlay from "./CustomizeExpandedOverlay.svelte";
  import LOOPExpandedOverlay from "./LOOPExpandedOverlay.svelte";
  import SetupsPanel from "../presets/SetupsPanel.svelte";
  import type { FavoriteState } from "../../state/favorite-state.svelte";
  import type { ActiveSetupSource } from "../../domain/models/favorite-config";
  import type { ReflectionAxis } from "@tka/sequence-engine/loop";
  import type { GuestLoopLockKind } from "$lib/shared/create/services/loop-guest-gate";

  type RhythmValue = {
    rotationInterval: 2 | 4;
    inversionInterval: 2 | 4;
    inversionMode: "expand" | "overlay";
    reflectionAxis: ReflectionAxis;
  };

  export interface LoopStageProps {
    rhythm?: RhythmValue;
    sequenceLength?: number;
    onRhythmChange?: (updates: Partial<RhythmValue>) => void;
    onLoopDisable?: () => void;
    guestMaxLength?: number;
    onRequestSignup?: (kind: GuestLoopLockKind) => void;
  }

  export interface SetupsStageProps {
    favoriteState: FavoriteState;
    isSignedOut: boolean;
    isPreview: boolean;
    isAnonymous: boolean;
    onApply: (source: ActiveSetupSource) => void;
    onRequestCommunityAccount: () => void;
    onRequestShareAccount: () => void;
    onRequestSignIn: () => void;
  }

  let {
    panelState,
    isDesktopLayout,
    loop,
    setups,
  }: {
    panelState: PanelCoordinationState;
    isDesktopLayout: boolean;
    loop: LoopStageProps;
    setups: SetupsStageProps;
  } = $props();

  const openCard = $derived(panelState.openGenerateCard);
  const destination = $derived(isDesktopLayout ? "stage" : "viewport");

  // Decided once per open. A transition (or reduced motion) is the entrance;
  // only a plain open on a browser without View Transitions scales in.
  let entrance = $state<"scale" | "none">("none");
  let root = $state<HTMLElement | null>(null);
  let openedFrom: GenerateCardPanelId | null = null;

  $effect(() => {
    const card = openCard;
    if (!card) return;
    openedFrom = card;
    entrance = lastGenerateCardMorphRan() || reducedMotion() ? "none" : "scale";
    void tick().then(() => root?.focus({ preventScroll: true }));
    return () => {
      // Runs when the card changes or closes. Return focus to the card that
      // opened us; it is still in the grid on both destinations.
      const wrapper = document.querySelector<HTMLElement>(
        `.card-wrapper[data-card-id="${card}"] button, .card-wrapper[data-card-id="${card}"] [tabindex]`
      );
      wrapper?.focus({ preventScroll: true });
    };
  });

  function close() {
    const card = openedFrom;
    if (!card) return;
    morphGenerateCard(card, () => panelState.closeGenerateCard());
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== "Escape" || event.defaultPrevented || !openCard) return;
    event.preventDefault();
    close();
  }

  const customize = $derived(panelState.customizeOverlayProps);
</script>

<svelte:window onkeydown={handleKeydown} />

{#snippet body()}
  {#if openCard === "customize" && customize}
    <CustomizeExpandedOverlay
      constraintPreset={customize.constraintPreset}
      handPathMode={customize.handPathMode}
      motionTypeFilter={customize.motionTypeFilter}
      handRelationship={customize.handRelationship}
      handRelationshipInverted={customize.handRelationshipInverted}
      onHandRelationshipChange={customize.onHandRelationshipChange}
      onHandRelationshipInvertedChange={customize.onHandRelationshipInvertedChange}
      matchHandTurns={customize.matchHandTurns}
      onMatchHandTurnsChange={customize.onMatchHandTurnsChange}
      startEndOptions={customize.startEndOptions}
      level={customize.level}
      gridMode={customize.gridMode}
      isFreeformMode={customize.isFreeformMode}
      styleBaseline={customize.styleBaseline}
      onConstraintPresetChange={customize.onConstraintPresetChange}
      onHandPathModeChange={customize.onHandPathModeChange}
      onMotionTypeFilterChange={customize.onMotionTypeFilterChange}
      onStartEndChange={customize.onStartEndChange}
      onResetAll={customize.onResetAll}
      onClose={close}
      {entrance}
    />
  {:else if openCard === "loop" && panelState.loopSelectedComponents && panelState.loopOnChange && panelState.loopCurrentType}
    <LOOPExpandedOverlay
      currentType={panelState.loopCurrentType}
      selectedComponents={panelState.loopSelectedComponents}
      onChange={panelState.loopOnChange}
      onClose={close}
      onLoopDisable={loop.onLoopDisable}
      rhythm={loop.rhythm}
      sequenceLength={loop.sequenceLength}
      onRhythmChange={loop.onRhythmChange}
      guestMaxLength={loop.guestMaxLength}
      onRequestSignup={loop.onRequestSignup}
      layout="responsive"
      {entrance}
    />
  {:else if openCard === "preset"}
    <SetupsPanel
      favoriteState={setups.favoriteState}
      isSignedOut={setups.isSignedOut}
      isPreview={setups.isPreview}
      isAnonymous={setups.isAnonymous}
      onApply={setups.onApply}
      onRequestCommunityAccount={setups.onRequestCommunityAccount}
      onRequestShareAccount={setups.onRequestShareAccount}
      onRequestSignIn={setups.onRequestSignIn}
      onClose={close}
      {entrance}
    />
  {/if}
{/snippet}

{#if openCard}
  {#key destination}
    {#if destination === "viewport"}
      <div
        class="expanded-card-stage"
        data-destination="viewport"
        data-card-id={openCard}
        tabindex="-1"
        bind:this={root}
        use:portal
        use:claimedViewTransitionName={{
          name: generateCardMorphName(openCard),
        }}
      >
        {@render body()}
      </div>
    {:else}
      <div
        class="expanded-card-stage"
        data-destination="stage"
        data-card-id={openCard}
        tabindex="-1"
        bind:this={root}
        use:claimedViewTransitionName={{
          name: generateCardMorphName(openCard),
        }}
      >
        {@render body()}
      </div>
    {/if}
  {/key}
{/if}

<style>
  .expanded-card-stage {
    outline: none;
    /* The panels inside are absolute inset 0 (GenerationSettingsOverlay and
       LOOPExpandedOverlay both are), so this box is what sets their size. */
  }

  .expanded-card-stage[data-destination="stage"] {
    position: absolute;
    inset: 0;
    z-index: 100;
  }

  .expanded-card-stage[data-destination="viewport"] {
    position: fixed;
    inset: 0;
    z-index: var(--z-drawer, 400);
    background: var(--theme-surface, #101018);
  }

  /* The overlay chrome rounds its corners and draws a border for the in-grid
     case. Edge to edge on the viewport. */
  .expanded-card-stage[data-destination="viewport"]
    > :global(.generation-settings-overlay),
  .expanded-card-stage[data-destination="viewport"]
    > :global(.loop-expanded-overlay) {
    border-radius: 0;
    border: none;
    padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  }
</style>
```

Notes for the implementer:

- `$props()` type annotations with `export interface` inside `<script lang="ts">` are allowed in Svelte 5 (module-level types are hoisted). If `svelte-check` objects, move the two interfaces to a sibling `expanded-card-stage-props.ts` and import them.
- `openedFrom` is a plain variable on purpose: `close()` must know the card even after `openCard` flips to null inside the transition's `flushSync`.
- The `{#key destination}` block remounts the root when the layout mode flips while a card is open, which moves it between the two destinations without leaking a portaled node.

- [ ] **Step 4: Run the test**

Run: `npx vitest run --config tests/config/vitest.components.config.ts src/lib/features/create/generate/components/cards/ExpandedCardStage.svelte.test.ts`
Expected: PASS (5 tests). The LOOP close label "Close LOOP selection" comes from `LoopOverlayHeader.svelte`.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(create): ExpandedCardStage hosts the grown generate card" -- src/lib/features/create/generate/components/cards/ExpandedCardStage.svelte src/lib/features/create/generate/components/cards/ExpandedCardStage.svelte.test.ts
```

---

### Task 7: Container: wrapper claims and the stage slot

**Files:**

- Modify: `src/lib/features/create/generate/components/CardBasedSettingsContainer.svelte` (imports near line 6 to 68, props near line 85 to 110, `handleOpenPresetDrawer` near line 548, template near line 667 to 760)

- [ ] **Step 1: Imports and props**

Add to the imports:

```ts
import type { Snippet } from "svelte";
import { claimedViewTransitionName } from "$lib/shared/transitions/claimed-view-transition-name";
import {
  generateCardMorphName,
  morphGenerateCard,
} from "../shared/services/generate-card-morph";
```

Add a prop `expandedCard` (optional snippet) to the destructuring and its type:

```ts
    expandedCard,
```

```ts
    /** The grown card, rendered inside the grid stage. GeneratePanel supplies
     *  ExpandedCardStage here so the panels keep their host's props. */
    expandedCard?: Snippet;
```

- [ ] **Step 2: Route the preset open through the morph**

Replace `handleOpenPresetDrawer`:

```ts
// Preset: open through the card morph (the stage renders from panel state).
function handleOpenPresetDrawer() {
  morphGenerateCard("preset", () => panelState.openPresetDrawer());
}
```

- [ ] **Step 3: Claim the name on each host wrapper and render the slot**

In the `{#each cards as card (card.id)}` wrapper `<div class="card-wrapper" ...>`, add after `style:grid-column=...`:

```svelte
use:claimedViewTransitionName={{
  name: generateCardMorphName(card.id),
  enabled: panelState.openGenerateCard !== card.id,
}}
```

After the closing `</div>` of `.card-grid` (still inside `.card-grid-stage`), add:

```svelte
{#if expandedCard}
  {@render expandedCard()}
{/if}
```

Add to the `.card-grid-stage` rule: `position: relative;` (the stage is the containing block for the in-place destination).

- [ ] **Step 4: Type-check and run the registry test**

Run: `npm run check:fast` (no new errors in this file) and `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/generator-card-registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(create): card wrappers claim their morph name; stage slot in the grid" -- src/lib/features/create/generate/components/CardBasedSettingsContainer.svelte
```

---

### Task 8: Customize and LOOP cards open through the morph

**Files:**

- Modify: `src/lib/features/create/generate/components/cards/CustomizeCard.svelte` (`handleClick` near line 122, `openOverlay` near line 127)
- Modify: `src/lib/features/create/generate/components/cards/ConsolidatedLOOPCard.svelte` (`handleClick` near line 142)

- [ ] **Step 1: CustomizeCard**

Add the import `import { morphGenerateCard } from "../../shared/services/generate-card-morph";`.

Change `handleClick` to:

```ts
function handleClick() {
  hapticService?.trigger("selection");
  morphGenerateCard("customize", openOverlay);
}
```

`openOverlay` itself stays as is; the HMR reopen in `onMount` keeps calling it plainly.

- [ ] **Step 2: ConsolidatedLOOPCard**

Add the same import (path `../../shared/services/generate-card-morph`). Change `handleClick`'s `panelState.openLOOPPanel(...)` call to:

```ts
morphGenerateCard("loop", () =>
  panelState.openLOOPPanel(
    currentLOOPType,
    selectedComponents,
    onLOOPTypeChange
  )
);
```

- [ ] **Step 3: Type-check**

Run: `npm run check:fast`
Expected: no new errors in either file.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(create): Customize and LOOP cards open through the card morph" -- src/lib/features/create/generate/components/cards/CustomizeCard.svelte src/lib/features/create/generate/components/cards/ConsolidatedLOOPCard.svelte
```

---

### Task 9: GeneratePanel supplies the stage and drops the drawers

**Files:**

- Modify: `src/lib/features/create/generate/components/GeneratePanel.svelte` (imports near line 29 to 33, container mount near line 327, drawer mounts near line 361 to 422)

- [ ] **Step 1: Imports**

Remove:

```ts
import LOOPDrawer from "./modals/LOOPDrawer.svelte";
import CustomizeDrawer from "./modals/CustomizeDrawer.svelte";
import PresetDrawer from "./presets/PresetDrawer.svelte";
```

Add:

```ts
import ExpandedCardStage from "./cards/ExpandedCardStage.svelte";
```

- [ ] **Step 2: Replace the three drawer mounts with a snippet on the container**

Delete the whole `{#if panelState} <LOOPDrawer …/> <CustomizeDrawer …/> <PresetDrawer …/> {/if}` block (and its leading comment). Then change the container mount to pass the stage as a snippet, moving every prop the drawers received into it:

```svelte
<CardBasedSettingsContainer
  config={configState.config}
  isFreeformMode={!hasWord}
  updateConfig={configState.updateConfig}
  resetConfig={configState.resetConfig}
  isGenerating={actionsState.isGenerating}
  onGenerateClicked={handleGenerate}
  {startEndState}
  {hasSettingsChanged}
  wordInputValue={spellModeState.inputWord}
  onWordInput={(v) => spellModeState.setInputWord(v)}
  onWordSubmit={() => handleGenerate(null)}
  {isMobile}
  isDesktopLayout={isDesktop}
  onOpenWordInput={() => spellModeState.openWordInput()}
  {favoriteState}
>
  {#snippet expandedCard()}
    {#if panelState}
      <ExpandedCardStage
        {panelState}
        isDesktopLayout={isDesktop}
        loop={{
          rhythm: {
            rotationInterval:
              configState.config.period === Period.QUARTERED ? 4 : 2,
            inversionInterval: configState.config.inversionInterval ?? 2,
            inversionMode: configState.config.inversionMode ?? "expand",
            reflectionAxis:
              configState.config.reflectionAxis ??
              (configState.config.loopType === LOOPType.FLIPPED
                ? "east-west"
                : "north-south"),
          },
          sequenceLength: configState.config.length,
          guestMaxLength: guestLoopMaxLength,
          onLoopDisable: () => {
            panelState.closeLOOPPanel();
            configState.updateConfig({ loopEnabled: false });
          },
          onRequestSignup: (kind) => {
            panelState.closeLOOPPanel();
            openLoopGateAuth(kind);
          },
          onRhythmChange: (u) =>
            configState.updateConfig({
              ...(u.rotationInterval
                ? {
                    period:
                      u.rotationInterval === 4
                        ? Period.QUARTERED
                        : Period.HALVED,
                  }
                : {}),
              ...(u.inversionInterval
                ? { inversionInterval: u.inversionInterval }
                : {}),
              ...(u.inversionMode ? { inversionMode: u.inversionMode } : {}),
              ...(u.reflectionAxis ? { reflectionAxis: u.reflectionAxis } : {}),
            }),
        }}
        setups={{
          favoriteState,
          isSignedOut,
          isPreview,
          isAnonymous: isAnonymousViewer,
          onApply: handleApplySource,
          onRequestCommunityAccount: () =>
            authDrawerState.show("signup", "community-setups"),
          onRequestShareAccount: () =>
            authDrawerState.show("signup", "share-setup"),
          onRequestSignIn: () => authDrawerState.show("signin", "saved-setups"),
        }}
      />
    {/if}
  {/snippet}
</CardBasedSettingsContainer>
```

The snippet is declared as a child of the component; Svelte 5 passes it as the `expandedCard` prop. The values (`guestLoopMaxLength`, `openLoopGateAuth`, `isSignedOut`, `isPreview`, `isAnonymousViewer`, `handleApplySource`) already exist in this file's script; do not rename them.

- [ ] **Step 3: Type-check and run the existing panel tests**

Run: `npm run check:fast` and `npx vitest run --config tests/config/vitest.config.ts tests/unit/create`
Expected: no new errors in `GeneratePanel.svelte`; the create unit suite passes.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(create): GeneratePanel mounts ExpandedCardStage instead of the three drawers" -- src/lib/features/create/generate/components/GeneratePanel.svelte
```

---

### Task 10: Browser verification (seven viewports)

Run from the worktree. Memory check first (`resource-budget.md`): at least 4096 MB available and no other `svelte-check` running.

- [ ] **Step 1: Start a task-owned dev server**

From `E:/worktrees/tka-platform/generate-card-morph`, in the background: `pnpm exec vite --port 5187 --host 127.0.0.1`. Wait for "ready". Never touch port 5173.

- [ ] **Step 2: Open the route in the built-in browser**

Navigate to `https://127.0.0.1:5187/create/generate` (accept the self-signed certificate warning the way the `verify` launch config does). Check `read_console_messages` for errors after load.

- [ ] **Step 3: For each viewport, open and close each card**

Viewports: 375x667, 960x412, 820x1180, 1440x900, 1920x1080, 2560x1440, 3840x2160 (`resize_window` with width and height).

For each: click Customize, screenshot, confirm `.expanded-card-stage[data-destination]` is `stage` on side-by-side layouts (1440 and up, and 960x412) and `viewport` on stacked ones (375x667, 820x1180) with `javascript_tool`: `document.querySelector('.expanded-card-stage')?.dataset.destination`. Press Escape, confirm it is gone. Repeat for LOOP and Setups. Take one mid-transition screenshot at 1920x1080 by clicking and screenshotting within ~150 ms (a `browser_batch` of click then screenshot).

Confirm with `javascript_tool` that no element carries a duplicate name while open:
`[...document.querySelectorAll('*')].filter(e => e.style.viewTransitionName?.startsWith('generate-card-')).map(e => e.style.viewTransitionName)` returns exactly one entry.

`read_console_messages` with `onlyErrors: true` after the sweep: no `InvalidStateError`, no Svelte errors.

- [ ] **Step 4: Reduced motion**

At 1920x1080, set the app's motion preference override with `javascript_tool`:
`document.documentElement.dataset.motionPreference = "reduce"` (this is what
`reducedMotion()` in `shared/transitions/motion.ts` reads first, ahead of the
media query). Click Customize: the stage must appear on the very next frame
(`document.querySelector('.expanded-card-stage')` non-null immediately after
the click in the same `browser_batch`) and `document.getAnimations().length`
must be 0. Press Escape, confirm it is gone. Then
`delete document.documentElement.dataset.motionPreference`.

- [ ] **Step 5: Interrupt**

At 1920x1080: `browser_batch` click Customize then click its X within the same batch. Then `document.querySelector('.expanded-card-stage')` is null and the wrapper for customize carries the name again (`document.querySelector('.card-wrapper[data-card-id="customize"]').style.viewTransitionName === 'generate-card-customize'`).

- [ ] **Step 6: Stop the server**

Kill the background vite process started in Step 1 before the turn ends. Save the screenshots under the scratchpad and list their paths in the task report.

---

### Task 11: Documentation

**Files:**

- Modify: `docs/architecture/canonical-capabilities.md` (append after the "Playback continuity" paragraph near line 100)
- Modify: `docs/superpowers/specs/2026-09-17-generate-card-morph-design.md` (the "Retired" subsection)

- [ ] **Step 1: Capability row**

Append:

```markdown
A card growing into its workspace (the Generate bento's Customize, LOOP,
Setups and TnD cards) routes through `startMorph` from
`shared/transitions/results-morph.ts` with names stamped by
`claimedViewTransitionName`; the feature seam is
`features/create/generate/shared/services/generate-card-morph.ts` and the
host is `ExpandedCardStage.svelte`. Searches: card morph, expand card, grow
card, bento expand, settings panel morph. Do not FLIP a card into a panel by
hand; claim the name on both ends and wrap the state change.
```

- [ ] **Step 2: Spec amendment**

Replace the "Retired" subsection body with:

```markdown
`presets/PresetDrawer.svelte` and the three `<…Drawer>` mounts in
`GeneratePanel.svelte`. `modals/CustomizeDrawer.svelte` and
`modals/LOOPDrawer.svelte` stay for now: the public Composer demo
(`src/routes/(public)/composer/_sections/GenerateSection.svelte`) composes its
own card grid and mounts them; migrating the demo to the morph is a
follow-up. `GenerationSettingsDrawer.svelte` and `modals/portal.ts` stay (Fuse
and the stacked destination use them).
```

- [ ] **Step 3: Prettier and commit**

Run: `npx prettier --write docs/architecture/canonical-capabilities.md docs/superpowers/specs/2026-09-17-generate-card-morph-design.md`

```bash
git commit -m "docs: card morph motion route and spec amendment" -- docs/architecture/canonical-capabilities.md docs/superpowers/specs/2026-09-17-generate-card-morph-design.md
```

(The spec file exists on `main` only after the `codex/tnd-morph-specs` branch merges. If it is absent in this worktree, skip Step 2 and note it; the amendment is applied on the specs branch instead.)

---

### Task 12: Gate and finish

- [ ] **Step 1: Full checks once**

Run in the worktree: `npm run check` (only one svelte-check machine-wide; check first), `npx vitest run --config tests/config/vitest.config.ts tests/unit/create src/lib/features/create/generate`, `npx vitest run --config tests/config/vitest.components.config.ts src/lib/features/create/generate`.
Expected: all pass; the svelte-check error count is not above the count on `main` (run the same command in `E:/tka-platform` once to compare if needed).

- [ ] **Step 2: Bring the branch current**

`git merge main` in the worktree (no rebase, no force). Resolve nothing by hand that is not yours; if a conflict lands in a file this plan did not touch, stop and report.

- [ ] **Step 3: Finish**

From `E:/tka-platform` (PowerShell, or `MSYS_NO_PATHCONV=1` in Git Bash), after the branch has been quiet for 30 minutes:

```
npm run wt:finish -- codex/generate-card-morph --route /create/generate
```

If a gate fails, leave the worktree and branch intact and report the exact output.
