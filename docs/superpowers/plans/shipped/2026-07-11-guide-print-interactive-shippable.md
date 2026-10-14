# Guide: Print + Interactive, Shippable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the finished Level-1 guide sendable — fix the Codex overlap, make the reader work phone-in-hand — and wire the physical-book companion (scan/QR → land in the guide with the held content animated in context, Codex as hub).

**Architecture:** Two phases on the EXISTING artboard reader (no Concepts-engine convergence — deferred). Phase 0 is visual/UX polish. Phase 1 adds a one-shot `guide-scan-intent` stash (mirroring `pending-scan-intent`), a `guide-content-index` letter→page/cell map built from the Codex sheets, and a non-destructive "See it in the Guide" action on the sequence viewer that reuses the guide's existing tap→animate path.

**Tech Stack:** SvelteKit 5 (runes), Vitest, existing shared primitives (`SelectionHit`, `GuideCompanion`, `SequenceViewerShell`, `ShortCodeManager`). Spec: `docs/superpowers/specs/2026-07-11-guide-print-interactive-shippable-design.md`.

**Verification note:** Live checks use the dev server on `https://localhost:5173` (HTTPS/2 — always `https`). If Chrome shows a cert interstitial, accept it once for that tab. Codex/mobile checks are visual (screenshot); the two new modules are unit-tested.

---

## File Structure

**Create:**
- `src/routes/(public)/guide/level-1/_data/guide-content-index.ts` — label→`{slug,cellKey}` map built from the Codex sheets + the `GUIDE_CODEX_SLUG` constant.
- `src/routes/(public)/guide/level-1/_data/guide-content-index.test.ts` — unit tests for the map.
- `src/routes/(public)/guide/level-1/_data/guide-scan-intent.ts` — one-shot intent stash/consume.
- `src/routes/(public)/guide/level-1/_data/guide-scan-intent.test.ts` — unit tests for the one-shot.

**Modify:**
- `src/routes/(public)/guide/codex/_components/CodexCell.svelte` — overflow clip (Task 1).
- `src/routes/(public)/guide/level-1/_components/GuideCompanion.svelte` — reduced-motion autoplay gate (Task 2).
- `src/routes/(public)/guide/level-1/_components/GuideReader.svelte` — mobile Contents sheet (Task 3), consume scan intent (Task 8).
- `src/lib/shared/selection/*.css` (the `.tka-seq-hit` stylesheet) — mobile min touch area (Task 4).
- `src/routes/(public)/guide/level-1/_components/GuideCodexPage.svelte` — trigger a codex cell by id (Task 8).
- `src/lib/shared/sequence-viewer/components/SequenceViewerShell.svelte` — optional "See in Guide" action prop (Task 9).
- `src/routes/q/[code]/QScanPage.svelte` — pass the action + build the intent (Task 9).

---

# Phase 0 — Shippable polish

## Task 1: Fix the Codex overlap

**Files:**
- Modify: `src/routes/(public)/guide/codex/_components/CodexCell.svelte` (`.picto` / `.codex-cell` style rules)

**Root cause (from the spec):** `.picto` has `aspect-ratio: 1; max-width: 64px` but **no overflow clip**, and `GuidePictograph` is rendered without `bordered`, so its own `overflow:hidden` clip is inactive. Any pictograph that resolves larger than its 64px box spills over neighbors.

- [ ] **Step 1: Verify the bug live (baseline)**

Navigate the dev browser to `https://localhost:5173/learn/guide/codex`. Screenshot. Confirm cells overlap (baseline). If they do NOT overlap in your environment, note it — the clip below is still correct hardening, but capture what you see.

- [ ] **Step 2: Add the clip to `.picto` and `.codex-cell`**

In `CodexCell.svelte`, change the `.picto` and `.codex-cell` rules to:

```css
  .codex-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    min-width: 0;
    overflow: hidden;
  }

  /* Reserve a square so the async pictograph swap never reflows neighbors.
     overflow:hidden clips any pictograph that resolves larger than its box so
     it can never spill into adjacent cells (no `bordered` clip on codex cells). */
  .picto {
    width: 100%;
    max-width: 64px;
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
```

- [ ] **Step 3: Verify live (reader + print)**

Reload `https://localhost:5173/learn/guide/codex`, screenshot — cells must sit inside their grid gaps, no overlap. Then load `https://localhost:5173/guide/level-1/print`, screenshot the codex sheets — same, and SHEET1/SHEET2 still break onto separate pages.

- [ ] **Step 4: If cells are still oversized after clipping**

The clip hides spill but if a pictograph is genuinely rendering at intrinsic size the cell looks empty/cropped. In that case the width isn't resolving before `aspect-ratio`. Add to `.picto :global(.guide-pictograph)`:

```css
  .picto :global(.guide-pictograph) {
    width: 100%;
    height: 100%;
    gap: 0;
  }
```

Reload and re-screenshot. Cells should show full, centered pictographs sized to the box.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run check:fast
git commit -m "fix(guide): clip codex cells so pictographs never overlap" -- src/routes/\(public\)/guide/codex/_components/CodexCell.svelte
```

---

## Task 2: Gate companion autoplay on reduced motion

**Files:**
- Modify: `src/routes/(public)/guide/level-1/_components/GuideCompanion.svelte` (the `InlineAnimationPlayer` invocation, `autoPlay={true}`)

- [ ] **Step 1: Read the invocation**

Open `GuideCompanion.svelte`, find `<InlineAnimationPlayer ... autoPlay={true} ... />`. Note the surrounding `<script>` imports.

- [ ] **Step 2: Add a reduced-motion signal**

In the `<script>`, add (near the other `$state`/`$derived`):

```ts
  // Respect the OS reduced-motion setting: don't auto-start playback for those
  // users — they get the player paused with a visible play control instead.
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
```

- [ ] **Step 3: Use it for autoPlay**

Change `autoPlay={true}` on `InlineAnimationPlayer` to:

```svelte
      autoPlay={!prefersReducedMotion}
```

- [ ] **Step 4: Verify**

In the browser, DevTools → Rendering → "Emulate CSS prefers-reduced-motion: reduce". Open a guide page, tap a pictograph — the companion opens but does NOT auto-play; a play control is present. Turn emulation off — it auto-plays as before.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run check:fast
git commit -m "fix(guide): don't autoplay the companion under prefers-reduced-motion" -- src/routes/\(public\)/guide/level-1/_components/GuideCompanion.svelte
```

---

## Task 3: Mobile Contents sheet (page navigation below 720px)

**Files:**
- Modify: `src/routes/(public)/guide/level-1/_components/GuideReader.svelte`
- Reuse: `src/routes/(public)/guide/level-1/_components/GuideTOC.svelte` (generated TOC), an existing sheet primitive

**Problem:** below a 720px container width `.reader-aside` is `display:none` — no TOC/page-jump on a phone, scroll-only.

- [ ] **Step 1: Pick the sheet primitive (do NOT hand-roll)**

Grep for an existing bottom-sheet/drawer to host the TOC:

```bash
grep -rl "isOpen" src/lib/shared/settings/components/tabs/prop-type/PropSelectionSheet.svelte src/lib/shared/components 2>/dev/null
grep -rln "class=\"sheet\"\|bottom-sheet\|role=\"dialog\"" src/lib/shared/components
```

Choose the closest `bind:isOpen` sheet (e.g. the pattern `PropSelectionSheet` uses). Record its import path + props. Reuse it — per `never-hand-roll.md` do not build a new sheet.

- [ ] **Step 2: Add the mobile Contents trigger + sheet state**

In `GuideReader.svelte` `<script>`, add:

```ts
  let tocSheetOpen = $state(false);
```

In the reader header markup (the area shown on mobile), add a Contents button, mobile-only, ≥44px:

```svelte
  {#if isMobile}
    <button
      type="button"
      class="reader-toc-trigger"
      onclick={() => (tocSheetOpen = true)}
      aria-haspopup="dialog"
      aria-expanded={tocSheetOpen}
    >
      <i class="fas fa-list-ul" aria-hidden="true"></i>
      <span>Contents</span>
    </button>
  {/if}
```

- [ ] **Step 3: Render the TOC inside the chosen sheet**

Below the reader shell markup, render the sheet with `GuideTOC` inside, wiring a row click to the existing `go(index)` scroll-to and closing the sheet:

```svelte
  <YourChosenSheet bind:isOpen={tocSheetOpen} title="Contents">
    <GuideTOC onNavigate={(index) => { go(index); tocSheetOpen = false; }} />
  </YourChosenSheet>
```

If `GuideTOC` does not already expose an `onNavigate` callback, add one: give it an optional `onNavigate?: (index: number) => void` prop and call it from each TOC row's click alongside its existing behavior. (Read `GuideTOC.svelte` first; it builds rows from the manifest via `bodyPagesByGroup()`.)

- [ ] **Step 4: Style the trigger (44px floor)**

```css
  .reader-toc-trigger {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
    padding: 0 14px;
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    color: var(--theme-text, #fff);
    font-weight: 600;
    cursor: pointer;
  }
```

- [ ] **Step 5: Verify on a phone width**

In the browser, DevTools device toolbar → iPhone width (≤720px container). Confirm the left nav is hidden, the Contents button shows, tapping it opens the sheet with the full TOC, tapping a row scrolls to that page and closes the sheet. Screenshot.

- [ ] **Step 6: Typecheck + commit**

```bash
npm run check:fast
git commit -m "feat(guide): mobile Contents sheet — page nav restored below 720px" -- src/routes/\(public\)/guide/level-1/_components/GuideReader.svelte src/routes/\(public\)/guide/level-1/_components/GuideTOC.svelte
```

---

## Task 4: Minimum touch area on pictograph hit targets

**Files:**
- Modify: the stylesheet defining `.tka-seq-hit` (grep for it under `src/lib/shared/selection/`)

**Problem:** `SelectionHit` renders a full-cover `.tka-seq-hit` button. On a phone the cell scales small, so the tap target drops below 44px.

- [ ] **Step 1: Locate the rule**

```bash
grep -rn "tka-seq-hit" src/lib/shared/selection
```

Open the file that styles `.tka-seq-hit` (likely `selection.css`). Confirm it's `position:absolute; inset:0` (full cover).

- [ ] **Step 2: Add a mobile minimum, centered**

Append a mobile rule that grows the button to at least 44px without moving its center:

```css
  @media (pointer: coarse) {
    .tka-seq-hit {
      min-width: var(--min-touch-target, 44px);
      min-height: var(--min-touch-target, 44px);
      /* keep the enlarged target centered on the cell */
      margin: auto;
    }
  }
```

- [ ] **Step 3: Verify no overlap in dense cells**

Live-check on a phone width: the sparse letter pages (BaseLetters) get a comfortable target; the DENSE codex boxes (3–4 cells abutting) must not produce overlapping hit regions that steal each other's taps. Tap several adjacent codex cells — each must open ITS letter. If dense cells overlap, scope the min-size rule to exclude the codex context: add a guarding class on the codex cell wrapper (e.g. `.codex-cell .tka-seq-hit { min-width: 0; min-height: 0; }`) so codex keeps visual-sized targets while chapter pages get the 44px floor.

- [ ] **Step 4: Typecheck + commit**

```bash
npm run check:fast
git commit -m "fix(guide): 44px minimum tap target for pictograph cells on touch" -- src/lib/shared/selection/selection.css
```

(Adjust the pathspec to the actual file grep found in Step 1.)

---

## Task 5: Land past front matter / Start-reading affordance

**Files:**
- Modify: `src/routes/(public)/guide/level-1/_components/GuideReader.svelte`

**Goal:** a deep link / scan lands directly on content (already true via `indexForSlug`); a plain first visit gets a one-tap way past the 5 front-matter pages.

- [ ] **Step 1: Confirm deep-link landing already skips front matter**

Navigate to `https://localhost:5173/learn/guide/the-grid`. Confirm the reader parks the scroller on "The Grid", not the cover. (It should, via `indexForSlug`.) If it does, no change is needed for the deep-link/scan case — note it and move to Step 2 for the no-deep-link case.

- [ ] **Step 2: Add a "Start reading" control on the cover**

In the cover front-matter region of the reader (or `GuideCover.svelte` if that's where the cover renders), add a button that scrolls to the first body page. The first body index is `FRONT_MATTER_COUNT` (from `guide-reader-nav.ts`). Import it and:

```svelte
  <button
    type="button"
    class="start-reading"
    onclick={() => go(FRONT_MATTER_COUNT)}
  >
    Start reading
  </button>
```

Style it as a real button (44px, `never-hand-roll` — reuse a button primitive if one fits; otherwise match `.reader-toc-trigger` styling from Task 3).

- [ ] **Step 3: Verify**

Fresh visit to `https://localhost:5173/learn/guide` (no slug). The cover shows a "Start reading" button; tapping it scrolls to "The Grid". Screenshot.

- [ ] **Step 4: Typecheck + commit**

```bash
npm run check:fast
git commit -m "feat(guide): Start-reading control skips front matter on first visit" -- src/routes/\(public\)/guide/level-1/_components/GuideReader.svelte
```

---

# Phase 1 — Physical ↔ digital bridge

## Task 6: `guide-content-index` — letter → page/cell map

**Files:**
- Create: `src/routes/(public)/guide/level-1/_data/guide-content-index.ts`
- Test: `src/routes/(public)/guide/level-1/_data/guide-content-index.test.ts`

**Source of truth:** the map is built FROM the Codex sheets (`codex/_data/codex-groups.ts` — `SHEET1`/`SHEET2`, each cell has `{ id, label }` where `label` is the human letter like `"A"`, `"Σ"`, `"W-"` and `id` is the codex cell id like `"A-0"`, `"Σ-0"`, `"W--0"`). So the index can never drift from what the codex renders.

- [ ] **Step 1: Write the failing test**

```ts
// guide-content-index.test.ts
import { describe, it, expect } from "vitest";
import { guideTargetForLetter, GUIDE_CODEX_SLUG } from "./guide-content-index";

describe("guide-content-index", () => {
  it("maps a Type 1 base letter to its codex cell", () => {
    expect(guideTargetForLetter("A")).toEqual({ slug: "codex", cellKey: "A-0" });
  });

  it("maps a Greek Type 2 letter to its codex cell", () => {
    expect(guideTargetForLetter("Σ")).toEqual({ slug: "codex", cellKey: "Σ-0" });
  });

  it("maps a dash (Type 3) letter to its double-dash codex id", () => {
    expect(guideTargetForLetter("W-")).toEqual({ slug: "codex", cellKey: "W--0" });
  });

  it("returns null for an unknown label", () => {
    expect(guideTargetForLetter("ZZ")).toBeNull();
  });

  it("exposes the codex hub slug", () => {
    expect(GUIDE_CODEX_SLUG).toBe("codex");
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run src/routes/\(public\)/guide/level-1/_data/guide-content-index.test.ts`
Expected: FAIL — module `./guide-content-index` not found.

- [ ] **Step 3: Implement the module**

```ts
// guide-content-index.ts
import { SHEET1, SHEET2, type CodexSheetDef } from "../../codex/_data/codex-groups";

/** The Codex page is the universal hub — the living index of all base letters. */
export const GUIDE_CODEX_SLUG = "codex";

export interface GuideContentTarget {
  /** Guide page slug (manifest id). */
  slug: string;
  /** Codex cell id to highlight/animate, when the content is a single letter. */
  cellKey?: string;
}

// label ("A", "Σ", "W-") → { slug: "codex", cellKey: <codex id> }, built from
// the Codex sheets so this can never drift from the letters the codex renders.
// Enriched later per chapter by repointing specific labels to their chapter page.
const LABEL_TO_TARGET: Map<string, GuideContentTarget> = new Map(
  [SHEET1, SHEET2].flatMap((sheet: CodexSheetDef) =>
    sheet.types.flatMap((type) =>
      type.boxes.flatMap((box) =>
        box.cells.map(
          (cell) =>
            [cell.label, { slug: GUIDE_CODEX_SLUG, cellKey: cell.id }] as const
        )
      )
    )
  )
);

/** Guide destination for a single base letter (label as shown on cards/codex). */
export function guideTargetForLetter(label: string): GuideContentTarget | null {
  return LABEL_TO_TARGET.get(label) ?? null;
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `npx vitest run src/routes/\(public\)/guide/level-1/_data/guide-content-index.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(guide): content index — base letter → codex page/cell" -- src/routes/\(public\)/guide/level-1/_data/guide-content-index.ts src/routes/\(public\)/guide/level-1/_data/guide-content-index.test.ts
```

---

## Task 7: `guide-scan-intent` — one-shot stash/consume

**Files:**
- Create: `src/routes/(public)/guide/level-1/_data/guide-scan-intent.ts`
- Test: `src/routes/(public)/guide/level-1/_data/guide-scan-intent.test.ts`

**Design note:** plain module-level `let` (not a `$state` rune) — the intent is set then consumed exactly once in `onMount` (non-reactive), so no rune is needed. This keeps it a plain `.ts` and avoids the `.svelte.ts` rune-test footgun. Mirrors `pending-scan-intent.svelte.ts` in shape.

- [ ] **Step 1: Confirm the `SequenceData` import path**

Open `src/lib/shared/qr/services/short-code-manager.ts` and read the return type of `resolveShortCode` — note the exact import path of `SequenceData`. Use that path in Step 3 (do not guess it).

- [ ] **Step 2: Write the failing test**

```ts
// guide-scan-intent.test.ts
import { describe, it, expect } from "vitest";
import { setGuideScanIntent, consumeGuideScanIntent } from "./guide-scan-intent";

describe("guide-scan-intent", () => {
  it("returns null when nothing is stashed", () => {
    expect(consumeGuideScanIntent()).toBeNull();
  });

  it("stashes and returns an intent", () => {
    setGuideScanIntent({ slug: "codex", cellKey: "A-0" });
    expect(consumeGuideScanIntent()).toEqual({ slug: "codex", cellKey: "A-0" });
  });

  it("is one-shot: a second consume returns null", () => {
    setGuideScanIntent({ slug: "codex", cellKey: "Σ-0" });
    expect(consumeGuideScanIntent()).toEqual({ slug: "codex", cellKey: "Σ-0" });
    expect(consumeGuideScanIntent()).toBeNull();
  });

  it("overwrites a prior unconsumed intent", () => {
    setGuideScanIntent({ slug: "codex", cellKey: "A-0" });
    setGuideScanIntent({ slug: "codex", cellKey: "B-0" });
    expect(consumeGuideScanIntent()).toEqual({ slug: "codex", cellKey: "B-0" });
  });
});
```

- [ ] **Step 3: Run it — verify it fails**

Run: `npx vitest run src/routes/\(public\)/guide/level-1/_data/guide-scan-intent.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the module**

```ts
// guide-scan-intent.ts
// One-shot handoff for "when the guide reader mounts, animate this content."
// Set by the sequence viewer's "See it in the Guide" action before navigating
// to /learn/guide/<slug>; consumed once by GuideReader.onMount. One-shot so a
// refresh doesn't re-fire the animation. Mirrors pending-scan-intent.
import type { SequenceData } from "$lib/shared/qr/services/short-code-manager"; // ← use the path confirmed in Step 1

export interface GuideScanIntent {
  /** Guide page slug to land on (from guide-content-index). */
  slug: string;
  /** Codex cell id to auto-animate, for single-letter content. */
  cellKey?: string;
  /** Full sequence to play in the companion, for multi-letter words. */
  sequence?: SequenceData;
}

let pendingIntent: GuideScanIntent | null = null;

/** Stash a request to auto-animate content when the guide reader mounts. */
export function setGuideScanIntent(intent: GuideScanIntent): void {
  pendingIntent = intent;
}

/** Read and clear the pending guide-scan intent (one-shot). */
export function consumeGuideScanIntent(): GuideScanIntent | null {
  const intent = pendingIntent;
  pendingIntent = null;
  return intent;
}
```

- [ ] **Step 5: Run the test — verify it passes**

Run: `npx vitest run src/routes/\(public\)/guide/level-1/_data/guide-scan-intent.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(guide): one-shot guide-scan-intent stash/consume" -- src/routes/\(public\)/guide/level-1/_data/guide-scan-intent.ts src/routes/\(public\)/guide/level-1/_data/guide-scan-intent.test.ts
```

---

## Task 8: Consume the intent in the reader + trigger a codex cell by id

**Files:**
- Modify: `src/routes/(public)/guide/level-1/_components/GuideReader.svelte`
- Modify: `src/routes/(public)/guide/level-1/_components/GuideCodexPage.svelte`

**Goal:** when the reader mounts with a stashed intent, reproduce exactly what a tap would do — either fire a specific codex cell (`cellKey`) or open the companion with a full `sequence`.

- [ ] **Step 1: Read the reader's mount + restore path**

In `GuideReader.svelte`, locate `onMount` and the existing companion-restore block (it calls `savedCompanion()` and, if present, `handleSequenceClick(saved)` after an `await tick()` + `requestAnimationFrame` guard). Also locate `handleSequenceClick(payload)` and the deep-link landing that uses `indexForSlug`. This is where the intent is consumed — after the scroller has parked on the slug.

- [ ] **Step 2: Expose a codex "trigger by id" the reader can call**

In `GuideCodexPage.svelte`, the reader branch already has `handleCellSelect(id)` which builds the strip and calls `emitSequence(...)`. Export a way to fire it by id from outside. Add, in its `<script>`, a registration into the shared guide-scan flow: on mount, register a callback keyed to this page so the reader can invoke `handleCellSelect(cellKey)` once. Simplest wiring — add to `guide-scan-intent.ts` an optional cell-trigger registry:

```ts
// append to guide-scan-intent.ts
let codexCellTrigger: ((id: string) => void) | null = null;
/** The Codex page registers how to animate a cell by id while it's mounted. */
export function registerCodexCellTrigger(fn: ((id: string) => void) | null): void {
  codexCellTrigger = fn;
}
export function fireCodexCell(id: string): boolean {
  if (!codexCellTrigger) return false;
  codexCellTrigger(id);
  return true;
}
```

In `GuideCodexPage.svelte`, register/unregister in the reader (non-print) branch:

```svelte
<script>
  // ...existing imports...
  import { onMount } from "svelte";
  import { registerCodexCellTrigger } from "../_data/guide-scan-intent";
  // ...
  onMount(() => {
    if (state) registerCodexCellTrigger((id) => handleCellSelect(id));
    return () => registerCodexCellTrigger(null);
  });
</script>
```

Add matching tests to `guide-scan-intent.test.ts` for the registry:

```ts
  it("fireCodexCell returns false with no trigger registered", () => {
    // import registerCodexCellTrigger, fireCodexCell at top of file
    registerCodexCellTrigger(null);
    expect(fireCodexCell("A-0")).toBe(false);
  });

  it("fireCodexCell calls the registered trigger and returns true", () => {
    let called = "";
    registerCodexCellTrigger((id) => (called = id));
    expect(fireCodexCell("A-0")).toBe(true);
    expect(called).toBe("A-0");
    registerCodexCellTrigger(null);
  });
```

Run: `npx vitest run src/routes/\(public\)/guide/level-1/_data/guide-scan-intent.test.ts` — expected PASS (6 tests).

- [ ] **Step 3: Consume the intent on reader mount**

In `GuideReader.svelte` `<script>`, import:

```ts
  import { consumeGuideScanIntent } from "../_data/guide-scan-intent";
  import { fireCodexCell } from "../_data/guide-scan-intent";
  import { stripToSequence } from "../_data/guide-sequence-adapter"; // if not already imported
```

In `onMount`, AFTER the deep-link slug landing and alongside the `savedCompanion()` restore, add:

```ts
    const scanIntent = consumeGuideScanIntent();
    if (scanIntent) {
      await tick();
      requestAnimationFrame(() => {
        if (scanIntent.cellKey && scanIntent.slug === "codex") {
          // Reproduce a codex cell tap once the codex page is mounted.
          fireCodexCell(scanIntent.cellKey);
        } else if (scanIntent.sequence) {
          // Multi-letter word: open the companion with the full sequence.
          handleSequenceClick({
            strip: [],
            word: scanIntent.sequence.word ?? "",
            key: `scan-${scanIntent.slug}`,
            sequence: scanIntent.sequence,
          });
        }
      });
    }
```

Note: read `handleSequenceClick`'s `GuideSequenceClick` payload type first. If it does not already accept a `sequence`, prefer the `cellKey` path only for v1 and open the companion for a raw sequence via the same mechanism the viewer uses. If `handleSequenceClick` needs a real `strip`, convert the sequence with the existing `stripToSequence`/adapter inverse, or land on codex without auto-animating the word (still a valid v1 — the user taps). Keep the word path minimal; the cell path is the primary flow.

- [ ] **Step 4: Verify with a manual intent (before scan wiring exists)**

Temporarily, in the browser console on any page, you can't call the module directly — instead verify via Task 9's real flow. For now, typecheck only.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run check
git commit -m "feat(guide): consume scan intent on reader mount — animate cell/word in context" -- src/routes/\(public\)/guide/level-1/_components/GuideReader.svelte src/routes/\(public\)/guide/level-1/_components/GuideCodexPage.svelte src/routes/\(public\)/guide/level-1/_data/guide-scan-intent.ts src/routes/\(public\)/guide/level-1/_data/guide-scan-intent.test.ts
```

---

## Task 9: "See it in the Guide" action on the sequence viewer

**Files:**
- Modify: `src/lib/shared/sequence-viewer/components/SequenceViewerShell.svelte` (new optional prop)
- Modify: `src/routes/q/[code]/QScanPage.svelte` (pass the prop, build the intent)

**Contract:** per `sequence-viewer-shell.md`, the host must NOT fork chrome. Expose the action as a new optional prop ON THE SHELL (the same seam pattern as `exportOverrides`). The shell contract test `tests/unit/sequence-viewer-shell-contract.test.ts` must stay green.

- [ ] **Step 1: Read the shell's action/overflow seam**

Open `SequenceViewerShell.svelte`. Find where header/overflow actions are declared (look for `exportOverrides` and the overflow menu). Identify the prop-driven action list you can extend.

- [ ] **Step 2: Add an optional `guideAction` prop**

In the shell's `$props()`:

```ts
    /** Optional "See it in the Guide" action — host supplies the handler; the
     *  shell renders it in the overflow menu. Omitted → not shown. */
    guideAction,
```

with type:

```ts
    guideAction?: { label: string; onSelect: () => void } | null;
```

Render it in the overflow menu next to the existing items (follow the exact markup the overflow menu uses for an item — reuse it, don't invent a new control):

```svelte
    {#if guideAction}
      <button type="button" class="overflow-item" onclick={guideAction.onSelect}>
        <i class="fas fa-book-open" aria-hidden="true"></i>
        {guideAction.label}
      </button>
    {/if}
```

(Match `overflow-item`'s real class/structure from the file.)

- [ ] **Step 3: Build the intent + navigate in `QScanPage`**

In `QScanPage.svelte` `<script>`, import:

```ts
  import { goto } from "$app/navigation";
  import { guideTargetForLetter, GUIDE_CODEX_SLUG } from "$lib/../routes/(public)/guide/level-1/_data/guide-content-index";
  import { setGuideScanIntent } from "$lib/../routes/(public)/guide/level-1/_data/guide-scan-intent";
```

(Use the correct alias — if `$lib` cannot reach the routes tree, import via a relative path from `QScanPage.svelte` to the guide `_data` modules. Confirm the resolvable path; both modules live under `src/routes/(public)/guide/level-1/_data/`.)

Add a handler that maps the resolved sequence to a guide target and navigates:

```ts
  function seeInGuide(): void {
    const seq = /* the resolved SequenceData this page already holds */;
    if (!seq) return;
    // Single base letter → its codex cell; else land on codex with the word.
    const label = seq.steps?.length === 1 ? (seq.word ?? "").trim() : "";
    const target = label ? guideTargetForLetter(label) : null;
    if (target?.cellKey) {
      setGuideScanIntent({ slug: target.slug, cellKey: target.cellKey });
      void goto(`/learn/guide/${target.slug}`);
    } else {
      setGuideScanIntent({ slug: GUIDE_CODEX_SLUG, sequence: seq });
      void goto(`/learn/guide/${GUIDE_CODEX_SLUG}`);
    }
  }
```

Read `QScanPage.svelte` first to bind `seq` to the actual resolved-sequence variable it already has (the one it feeds to `SequenceViewerShell`). Detecting "single base letter" may differ — if the sequence exposes a cleaner single-letter signal, use it; the `steps.length === 1` heuristic is the v1 fallback.

- [ ] **Step 4: Pass the action to the shell**

Where `QScanPage` renders `<SequenceViewerShell ... />`, add:

```svelte
    guideAction={{ label: "See it in the Guide", onSelect: seeInGuide }}
```

- [ ] **Step 5: Keep the shell contract test green**

Run: `npx vitest run tests/unit/sequence-viewer-shell-contract.test.ts`
Expected: PASS. If it fails because the host imports something it shouldn't, move the logic so the host only passes the `guideAction` prop (no chrome imports).

- [ ] **Step 6: Verify the full flow live**

Open a real scan URL, e.g. `https://localhost:5173/q/<a-known-code>`. In the viewer overflow menu, tap "See it in the Guide". Confirm it navigates to `/learn/guide/codex` and the matching letter cell animates in the companion (or, for a word, the companion opens with the sequence). Test on both desktop and a phone width (companion bottom sheet + cell scrolled into view). Screenshot both.

- [ ] **Step 7: Full check + commit**

```bash
npm run check
git commit -m "feat(guide): 'See it in the Guide' — scan → codex → animate in context" -- src/lib/shared/sequence-viewer/components/SequenceViewerShell.svelte src/routes/q/\[code\]/QScanPage.svelte
```

---

## Final verification (after all tasks)

- [ ] `npm run check` is green (one full cold run).
- [ ] Codex: no overlap in reader + `/print` (screenshots).
- [ ] Mobile: Contents sheet works below 720px; 44px tap targets; screenshots.
- [ ] Reduced motion: companion doesn't autoplay.
- [ ] `npx vitest run` for the two new `_data` test files — all green.
- [ ] `tests/unit/sequence-viewer-shell-contract.test.ts` green.
- [ ] Scan → "See it in the Guide" → codex → animate, on desktop and phone (screenshots).

---

## Notes for the executor

- **Commit only your own changes** — the working tree carries other agents' in-flight files. Every commit above uses an explicit pathspec; never a bare `git commit`.
- **Reduced-motion, 44px, no checkboxes, clickables-look-like-buttons** — design-system rules apply to every new control (the Contents trigger, Start-reading, the overflow item).
- **Never hand-roll** — reuse the existing sheet primitive (Task 3), the overflow-item markup (Task 9), button primitives (Task 5). Grep before building.
- **Deferred (not in this plan):** Concepts-engine convergence, per-chapter content→page enrichment beyond the codex hub, printed-in-book QR deep links. The content index and intent layer are built so those drop in later without touching the reader.
