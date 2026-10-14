# Max Turn Intensity Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a "Max Turn Intensity" (`≤N`) browse filter, computed client-side from the pool, so it works in the gallery, the drill, and (for free) Smart Collections.

**Architecture:** New `BrowseFilterType.MAX_TURN_INTENSITY`. A memoized `getSequenceMaxTurn` reads per-motion turns off hydrated steps (`step.motions.blue/red.turns`, floats ignored); `filterByMaxTurnIntensity` is a ceiling predicate. The engine exposes `availableMaxTurnIntensities` (pool-derived, like `availableLengths`). Chip + drill mirror the Length filter. No smart-collection change — the filter flows through the existing filter-agnostic serialization.

**Tech Stack:** Svelte 5 runes, vitest.

**Spec:** `docs/superpowers/specs/active/2026-07-06-max-turn-intensity-filter-design.md`

**Key facts (verified):**
- Step motion access: `step.motions.blue.turns` / `step.motions.red.turns`, type `number | "fl"` (`step-data.ts:24-36`, `motion-data.ts`). Skip `step.isBlank`.
- Turns are in the community pool: solo-prop turns hydrate onto motions via `step-deriver.ts:95`.
- Ceiling semantics: match iff `maxNumericTurn(seq) ≤ N`; `"fl"` never disqualifies; no-turn sequences (max 0) satisfy every ceiling.
- One-per-type filter (engine keys it `String(type)` by default — no `addFilter` change).

---

## File structure

**Create:**
- `src/lib/shared/browse/components/filter-chips/MaxTurnIntensityFilterChip.svelte` — cloned from `LengthFilterChip.svelte`.
- `tests/unit/browse/max-turn-intensity-filter.test.ts`

**Modify:**
- `src/lib/shared/persistence/domain/enums/filtering-enums.ts` — enum value.
- `src/lib/shared/browse/services/browse-filter.ts` — `getSequenceMaxTurn` + `filterByMaxTurnIntensity` + dispatch case.
- `src/lib/shared/browse/engine/types.ts` — `availableMaxTurnIntensities` on the `BrowseEngine` interface.
- `src/lib/shared/browse/engine/create-browse-engine.svelte.ts` — the `$derived` + getter.
- `src/lib/shared/browse/components/BrowseFilterBar.svelte` — derived + handler + render.
- `src/lib/features/browse/gallery-home/GalleryDrill.svelte` — section + values + mini-tile + drill screen.
- `messages/en.json` — i18n keys.

---

## Task 1: Filter predicate + memoized max-turn helper (TDD)

**Files:**
- Modify: `src/lib/shared/persistence/domain/enums/filtering-enums.ts:36`
- Modify: `src/lib/shared/browse/services/browse-filter.ts`
- Test: `tests/unit/browse/max-turn-intensity-filter.test.ts`

- [ ] **Step 1: Add the enum value**

In `filtering-enums.ts`, add after the `COLLECTION` entry (line 36), inside `BrowseFilterType`:

```ts
  /** Filter by a turn-intensity CEILING: a sequence matches "≤ N turns" when no
   * motion's numeric turns exceed N. "fl" (float) always passes. One-per-type. */
  MAX_TURN_INTENSITY = "max_turn_intensity",
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/browse/max-turn-intensity-filter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { applyFilter, getSequenceMaxTurn } from "$lib/shared/browse/services/browse-filter";
import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

// Minimal step shape the filter reads: motions.blue/red.turns + isBlank.
function step(blueTurns: number | "fl", redTurns: number | "fl", isBlank = false) {
  return {
    isBlank,
    motions: {
      blue: { turns: blueTurns },
      red: { turns: redTurns },
    },
  };
}

function seq(id: string, steps: ReturnType<typeof step>[]): SequenceData {
  return { id, word: id, steps } as unknown as SequenceData;
}

describe("getSequenceMaxTurn", () => {
  it("is the max numeric turn across steps and hands; floats and blanks ignored", () => {
    expect(getSequenceMaxTurn(seq("a", [step(0, 1), step(0.5, 2)]))).toBe(2);
    expect(getSequenceMaxTurn(seq("b", [step("fl", "fl")]))).toBe(0); // all float → 0
    expect(getSequenceMaxTurn(seq("c", [step(0, 0)]))).toBe(0);
    expect(getSequenceMaxTurn(seq("d", [step(3, 0, true)]))).toBe(0); // blank step skipped
    expect(getSequenceMaxTurn(seq("e", [step(1, "fl")]))).toBe(1);
  });
});

describe("filterByMaxTurnIntensity (ceiling ≤ N)", () => {
  const pool = [
    seq("zero", [step(0, 0)]),
    seq("half", [step(0.5, 0)]),
    seq("one", [step(1, 0.5)]),
    seq("floaty", [step("fl", "fl")]),
    seq("two", [step(2, 1)]),
  ];

  it("≤1 includes zero/half/one/floaty, excludes two", () => {
    const ids = applyFilter(pool, BrowseFilterType.MAX_TURN_INTENSITY, 1).map((s) => s.id).sort();
    expect(ids).toEqual(["floaty", "half", "one", "zero"]);
  });

  it("≤2 includes everything", () => {
    expect(applyFilter(pool, BrowseFilterType.MAX_TURN_INTENSITY, 2)).toHaveLength(5);
  });

  it("≤0.5 excludes one and two", () => {
    const ids = applyFilter(pool, BrowseFilterType.MAX_TURN_INTENSITY, 0.5).map((s) => s.id).sort();
    expect(ids).toEqual(["floaty", "half", "zero"]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/browse/max-turn-intensity-filter.test.ts`
Expected: FAIL — `getSequenceMaxTurn` not exported.

- [ ] **Step 4: Implement the helper + predicate + dispatch in `browse-filter.ts`**

Add the dispatch case in `applyFilter`'s switch, after the `COLLECTION` case (line 99):

```ts
    case BrowseFilterType.MAX_TURN_INTENSITY:
      return filterByMaxTurnIntensity(sequences, filterValue);
```

Add the helper + predicate. Put them next to the TnD block (after `filterByTnDFamily`, ~line 597) so the memoization pattern sits with its sibling:

```ts
// ============================================================================
// Max turn intensity filtering (ceiling)
// ============================================================================

// Max numeric turn is pure over immutable steps — memoize per sequence object,
// same rationale as the TnD-family cache (counts recompute far more often than
// the pool reloads).
const maxTurnCache = new WeakMap<SequenceData, number>();

/**
 * The largest NUMERIC turn on any motion of any non-blank step (both hands).
 * "fl" (float) has no numeric turn count and is ignored; a sequence with no
 * numeric turns returns 0. This is the value a "≤ N" ceiling filter compares.
 */
export function getSequenceMaxTurn(seq: SequenceData): number {
  const cached = maxTurnCache.get(seq);
  if (cached !== undefined) return cached;

  let max = 0;
  for (const step of seq.steps ?? []) {
    if (step.isBlank) continue;
    for (const motion of [step.motions?.blue, step.motions?.red]) {
      const t = motion?.turns;
      if (typeof t === "number" && t > max) max = t;
    }
  }
  maxTurnCache.set(seq, max);
  return max;
}

/** Ceiling filter: keep sequences whose heaviest numeric turn is ≤ the value. */
function filterByMaxTurnIntensity(
  sequences: SequenceData[],
  filterValue: BrowseFilterValue
): SequenceData[] {
  const ceiling =
    typeof filterValue === "number" ? filterValue : parseFloat(String(filterValue));
  if (isNaN(ceiling)) return sequences;
  return sequences.filter((seq) => getSequenceMaxTurn(seq) <= ceiling);
}
```

(Note: no `getFilterOptions` case — the chip and drill read pool-derived ceilings via the engine, not `getFilterOptions`. Do NOT add one.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/browse/max-turn-intensity-filter.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/shared/persistence/domain/enums/filtering-enums.ts src/lib/shared/browse/services/browse-filter.ts tests/unit/browse/max-turn-intensity-filter.test.ts
git commit -m "feat(browse): max-turn-intensity ceiling filter + memoized getSequenceMaxTurn

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- src/lib/shared/persistence/domain/enums/filtering-enums.ts src/lib/shared/browse/services/browse-filter.ts tests/unit/browse/max-turn-intensity-filter.test.ts
```

---

## Task 2: Engine exposes `availableMaxTurnIntensities`

**Files:**
- Modify: `src/lib/shared/browse/engine/types.ts`
- Modify: `src/lib/shared/browse/engine/create-browse-engine.svelte.ts`

- [ ] **Step 1: Add to the `BrowseEngine` interface**

In `types.ts`, next to `availableLengths` (line 222), add:

```ts
	/** Distinct turn-intensity CEILINGS present in allSequences (each > 0),
	 * ascending — the pool-derived options for the Max Turn Intensity filter. */
	readonly availableMaxTurnIntensities: readonly number[];
```

- [ ] **Step 2: Add the derived + getter in the factory**

In `create-browse-engine.svelte.ts`, import `getSequenceMaxTurn`. The existing import from `browse-filter` is `applyFilter as applyBrowseFilter` (line 34) — extend it:

```ts
import {
	applyFilter as applyBrowseFilter,
	getSequenceMaxTurn,
} from "$lib/shared/browse/services/browse-filter";
```

Add the derived next to `availableLengths` (after line 290):

```ts
	const availableMaxTurnIntensities = $derived.by(() => {
		const ceilings = new Set<number>();
		for (const seq of allSequences) {
			const m = getSequenceMaxTurn(seq);
			if (m > 0) ceilings.add(m);
		}
		return Array.from(ceilings).sort((a, b) => a - b);
	});
```

Add the getter next to the `availableLengths` getter (after line 598):

```ts
		get availableMaxTurnIntensities() {
			return availableMaxTurnIntensities;
		},
```

- [ ] **Step 3: Verify typecheck (capture once)**

Run: `npm run check:fast > /tmp/mti-check2.log 2>&1; grep -iE "create-browse-engine|engine/types" /tmp/mti-check2.log || echo "CLEAN (engine)"`
Expected: `CLEAN (engine)`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/shared/browse/engine/types.ts src/lib/shared/browse/engine/create-browse-engine.svelte.ts
git commit -m "feat(browse): engine exposes availableMaxTurnIntensities (pool-derived ceilings)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- src/lib/shared/browse/engine/types.ts src/lib/shared/browse/engine/create-browse-engine.svelte.ts
```

---

## Task 3: `MaxTurnIntensityFilterChip` (clone of LengthFilterChip)

**Files:**
- Create: `src/lib/shared/browse/components/filter-chips/MaxTurnIntensityFilterChip.svelte`

`LengthFilterChip.svelte` is the correct base: a pool-derived numeric single-select dropdown chip with `getFilteredCount` count previews. Read it first.

- [ ] **Step 1: Create the chip by cloning `LengthFilterChip.svelte` with these deltas**

Read `src/lib/shared/browse/components/filter-chips/LengthFilterChip.svelte` and copy it to `MaxTurnIntensityFilterChip.svelte`, changing:
- Props: `activeLength: number | null` → `activeIntensity: number | null`; `availableLengths: number[]` → `availableIntensities: number[]`.
- Filter type used in `getFilteredCount` / options: `BrowseFilterType.LENGTH` → `BrowseFilterType.MAX_TURN_INTENSITY`.
- Options list: built from `availableIntensities` (mirror how `availableLengths` builds the length options), plus the "All" reset. Value = the ceiling number.
- Labels: the chip label and each option render `≤{value}` (e.g. `≤1`, `≤1.5`) — NOT "{n} beats". Use a small helper `const fmt = (n: number) => \`≤${n}\`;` (turn counts can be halves, so don't force integers). The active chip label when a ceiling is picked is `≤{activeIntensity}`; when null, the i18n "Max turns" label (Task 7 key).
- Icon: use `fas fa-arrows-spin` (turn/rotation motif) instead of the length icon.
- `chipColor`: `"var(--semantic-warning)"` (distinct from Level's `--semantic-info` and Length's amber — pick a token not already used by an adjacent chip; confirm against `BrowseFilterBar` neighbors and adjust if it collides).

Keep the outside-click dropdown behavior, `FilterChipBase mode="dropdown"`, haptics, and the popover-option markup/CSS identical to `LengthFilterChip`.

- [ ] **Step 2: Verify typecheck (capture once)**

Run: `npm run check:fast > /tmp/mti-check3.log 2>&1; grep -iE "MaxTurnIntensityFilterChip" /tmp/mti-check3.log || echo "CLEAN (chip)"`
Expected: `CLEAN (chip)`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/shared/browse/components/filter-chips/MaxTurnIntensityFilterChip.svelte
git commit -m "feat(browse): MaxTurnIntensityFilterChip — pool-derived ≤N dropdown chip

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- src/lib/shared/browse/components/filter-chips/MaxTurnIntensityFilterChip.svelte
```

---

## Task 4: Wire the chip into `BrowseFilterBar`

**Files:**
- Modify: `src/lib/shared/browse/components/BrowseFilterBar.svelte`

- [ ] **Step 1: Import the chip**

Next to the `LengthFilterChip` import (line 13):

```ts
  import MaxTurnIntensityFilterChip from "$lib/shared/browse/components/filter-chips/MaxTurnIntensityFilterChip.svelte";
```

- [ ] **Step 2: Add the active-value derived**

Next to `activeLength` (after line 60):

```ts
  const activeMaxTurnIntensity = $derived.by(() => {
    const f = engine.activeFilters.get("max_turn_intensity");
    return f && !f.locked ? (f.value as number) : null;
  });
```

- [ ] **Step 3: Add the handler**

Next to `handleLengthSelect` (after line 97):

```ts
  function handleMaxTurnIntensitySelect(intensity: number | null) {
    hapticService?.trigger("selection");
    if (intensity == null) engine.removeFilter("max_turn_intensity");
    else
      engine.addFilter(
        BrowseFilterType.MAX_TURN_INTENSITY,
        intensity,
        `≤${intensity} turns`,
        "var(--semantic-warning)"
      );
  }
```

- [ ] **Step 4: Render the chip**

After the `LengthFilterChip` block (after line 192, inside the `{#if !chipsOnly}` → `{#if !isHandsMode}` region — turn intensity is prop-motion semantics, so gate it `!isHandsMode` like Level). Add:

```svelte
      <MaxTurnIntensityFilterChip
        activeIntensity={activeMaxTurnIntensity}
        availableIntensities={engine.availableMaxTurnIntensities as number[]}
        onSelect={handleMaxTurnIntensitySelect}
        getFilteredCount={engine.getFilteredCount.bind(engine)}
      />
```

Place it just before the closing of the `!isHandsMode`/selector region (adjacent to `LOOPFilterChip`). If `availableMaxTurnIntensities` is empty the chip should render nothing or an empty dropdown — mirror how `LengthFilterChip` handles an empty `availableLengths` (add a guard in the chip if Length doesn't already).

- [ ] **Step 5: Verify typecheck (capture once)**

Run: `npm run check:fast > /tmp/mti-check4.log 2>&1; grep -iE "BrowseFilterBar" /tmp/mti-check4.log || echo "CLEAN (bar)"`
Expected: `CLEAN (bar)`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/shared/browse/components/BrowseFilterBar.svelte
git commit -m "feat(browse): render Max Turn Intensity chip in the filter bar

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- src/lib/shared/browse/components/BrowseFilterBar.svelte
```

---

## Task 5: GalleryDrill section (drill screen + mini-tile)

**Files:**
- Modify: `src/lib/features/browse/gallery-home/GalleryDrill.svelte`

- [ ] **Step 1: Register the section**

Add `"max_turn_intensity"` to BOTH the `Section` union (after `"family"`, line 128) and the `SECTIONS` array (after `"family"`, line 139).

- [ ] **Step 2: Import the max-turn helper**

Add to the imports (next to `resolveStepCount` / the browse-filter/sorter imports):

```ts
  import { getSequenceMaxTurn } from "$lib/shared/browse/services/browse-filter";
```

- [ ] **Step 3: Add the values derived**

Next to `lengthValues` / `maxLengthCount` (after line 261):

```ts
  const maxTurnIntensityValues = $derived.by(() => {
    const ceilings = new Set<number>();
    for (const seq of pool) {
      const m = getSequenceMaxTurn(seq);
      if (m > 0) ceilings.add(m);
    }
    return [...ceilings]
      .sort((a, b) => a - b)
      .map((n) => ({
        value: n,
        label: `≤${n} turns`,
        count: getCount(BrowseFilterType.MAX_TURN_INTENSITY, n),
      }))
      .filter((v) => v.count > 0);
  });
  const maxTurnIntensityCount = $derived(
    Math.max(1, ...maxTurnIntensityValues.map((v) => v.count)),
  );
```

- [ ] **Step 4: Add the drill screen**

After the `{:else if section === "length"}` screen block ends (find the closing `</div></div>` of the length screen, ~line 745), add a sibling screen (mirror the length "monument" rows):

```svelte
      {:else if section === "max_turn_intensity"}
        <div class="drill-screen">
          {@render valueHead("Pick a max turn intensity")}
          <div class="value-list">
            {#each maxTurnIntensityValues as v (v.value)}
              <button
                class="length-row monument"
                type="button"
                onclick={() => onApply(BrowseFilterType.MAX_TURN_INTENSITY, v.value, v.label)}
              >
                <span class="value-numeral small">≤{v.value}</span>
                <span class="value-main">
                  <span class="value-label muted">max turns</span>
                  <span class="density-bar">
                    <span
                      class="density-fill"
                      style:width="{(v.count / maxTurnIntensityCount) * 100}%"
                    ></span>
                  </span>
                </span>
                <span class="value-count">{v.count}</span>
              </button>
            {/each}
          </div>
        </div>
```

- [ ] **Step 5: Add the chooser mini-tile**

In the `mini-grid` (near the letter/position mini-tiles, ~line 559+), add a tile gated on more than one value (dead-end guard, same as the others):

```svelte
              {#if maxTurnIntensityValues.length > 1}
                <button class="mini-tile" type="button" onclick={() => (section = "max_turn_intensity")}>
                  <span class="mini-art plate" aria-hidden="true">
                    <i class="fas fa-arrows-spin" aria-hidden="true"></i>
                  </span>
                  <span class="mini-main">
                    <span class="mini-title">Max turn intensity</span>
                    <span class="mini-sub">{maxTurnIntensityValues.length} levels</span>
                  </span>
                </button>
              {/if}
```

(Match the exact `mini-tile` markup of a neighboring tile — if `.mini-art.plate` expects different inner content, mirror a text/icon tile that already exists rather than forcing the glyph.)

- [ ] **Step 6: Verify typecheck (capture once)**

Run: `npm run check:fast > /tmp/mti-check5.log 2>&1; grep -iE "GalleryDrill" /tmp/mti-check5.log || echo "CLEAN (drill)"`
Expected: `CLEAN (drill)`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/features/browse/gallery-home/GalleryDrill.svelte
git commit -m "feat(browse): GalleryDrill Max Turn Intensity section + mini-tile

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- src/lib/features/browse/gallery-home/GalleryDrill.svelte
```

---

## Task 6: i18n keys

**Files:**
- Modify: `messages/en.json`

- [ ] **Step 1: Add keys**

If the `MaxTurnIntensityFilterChip` (Task 3) uses `t(...)` keys for its label / "All" option (mirroring `LengthFilterChip`), add the matching keys to `messages/en.json`. Grep the Length chip's keys first (`browse_chip_length`, `browse_all_lengths`, or similar) and add the turn-intensity analogs with the SAME naming scheme, e.g.:

```json
  "browse_chip_max_turns": "Max turns",
  "browse_all_turn_intensities": "Any turn intensity",
```

Use the exact key names the chip references. If the chip uses inline literals instead of `t(...)` (acceptable for `≤N` which needs no translation), skip this task and note it.

- [ ] **Step 2: Verify typecheck (capture once)**

Run: `npm run check:fast > /tmp/mti-check6.log 2>&1; grep -iE "i18n|en.json|MaxTurnIntensity" /tmp/mti-check6.log || echo "CLEAN (i18n)"`
Expected: `CLEAN (i18n)`.

- [ ] **Step 3: Commit**

```bash
git add messages/en.json
git commit -m "feat(browse): i18n keys for Max Turn Intensity chip

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- messages/en.json
```

---

## Task 7: Full verification

- [ ] **Step 1: Full typecheck (one cold run) + smart/browse grep**

Run: `npm run check > /tmp/mti-final.log 2>&1; echo "exit $?"; grep -niE "error" /tmp/mti-final.log | grep -iE "max_turn|MaxTurnIntensity|browse-filter|GalleryDrill|BrowseFilterBar|create-browse-engine" || echo "NO MTI-RELATED ERRORS"`
Expected: `NO MTI-RELATED ERRORS`. (Pre-existing unrelated errors — e.g. ArtSettingsPanel — are out of scope.)

- [ ] **Step 2: Run the predicate tests**

Run: `npx vitest run tests/unit/browse/max-turn-intensity-filter.test.ts`
Expected: PASS.

- [ ] **Step 3: Runtime acceptance (report, do not self-claim)**

This is also the guard that the pool truly carries turns. Tell Austen to check, with the route:
1. Gallery → the **Max turns** chip lists real `≤N` options with non-zero counts.
2. Picking `≤1` yields sequences whose heaviest turn is ≤1.
3. In a Smart Collection builder (New smart collection → Filters), the Max Turn Intensity section appears and a saved rule persists it.

If the chip shows NO options (all counts 0), the pool isn't exposing turns at runtime → invoke the spec's contingency (precompute `maxTurnIntensity` at publish + backfill). Report this rather than shipping a dead filter.

Link: [https://localhost:5173/browse](https://localhost:5173/browse)

---

## Self-review (against spec)

- Ceiling predicate + float-passes + memoization → Task 1 (with tests).
- Pool-derived ladder → Task 2 (`availableMaxTurnIntensities`) + Task 5 (drill values).
- Chip + drill + bar mirroring DIFFICULTY/LENGTH → Tasks 3-5.
- Smart Collections inherit free → no smart-collection task (verified: `buildFilterSpecFromEngine`/`applySpecToEngine`/`deriveSpecMembers` are filter-agnostic).
- Runtime acceptance = the turns-in-pool guard → Task 7 Step 3.
