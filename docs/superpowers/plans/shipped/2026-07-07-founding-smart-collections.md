# Founding Smart Collections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the three printed T&D decks (TKA 1/2/3) as read-only, public-by-construction "founding" smart collections in every user's Library, defined by browse-filter rules over the community pool.

**Architecture:** The canonical T&D alphabet already lives in the community browse pool (`extraCommunitySequences`). Stamp those sequences with a reserved author so a rule can fence them off from user content, then declare three config-defined smart collections (`AUTHOR + DIFFICULTY + MAX_TURN` rules) that resolve to exactly 19/57/95 sequences. Surface them as synthetic read-only rail cards routed through the existing `SmartCollectionDetailView`. No new collection kind, no Firestore docs, no seeding.

**Tech Stack:** SvelteKit, Svelte 5 runes, TypeScript, Vitest. Spec: `docs/superpowers/specs/active/2026-07-07-founding-smart-collections-design.md`.

**Deviation from spec (intentional):** founding ids use an **underscore** prefix `founding_tka-1`, NOT the colon form `founding:tka-1` shown in the spec. Reason: `MyCollectionsPanel` decodes a collection's nav `contextId` by splitting on `:` to separate foreign `ownerId:collectionId` (`MyCollectionsPanel.svelte:120`). A colon in the id would misroute the founding collection as a foreign one. Underscore matches the existing `system_favorites` convention.

**Pure derivation function name:** the spec references a "`filterPoolBySpec`"; the actual function is `deriveSpecMembers(pool, spec)` in `smart-filter-spec.ts:62`. This plan uses the real name.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/features/browse/gallery-home/canonical-tnd-pool.ts` | (modify) Export `CANONICAL_TND_AUTHOR`; stamp `author` on every generated pool sequence. |
| `src/lib/shared/library/domain/models/collection.ts` | (modify) Add `"founding"` to `SystemCollectionType`. |
| `src/lib/features/browse/collections/config/founding-collections.ts` | (create) The three founding definitions, the synthetic-collection adapter, and `isFoundingId` / `getFoundingCollection`. |
| `src/lib/features/browse/collections/components/SmartCollectionDetailView.svelte` | (modify) Founding branch: load config object instead of subscribing; skip count write-back; gate mutations. |
| `src/lib/features/browse/collections/components/MyCollectionsPanel.svelte` | (modify) Render founding rail cards; route founding ids to `SmartCollectionDetailView`. |
| `tests/unit/browse/founding-collections.test.ts` | (create) Count-check: each rule → 19/57/95 over the real canonical pool. |
| `tests/unit/browse/canonical-tnd-author.test.ts` | (create) The pool stamps `CANONICAL_TND_AUTHOR`. |

---

## Task 1: Stamp the canonical author on the T&D pool

**Files:**
- Modify: `src/lib/features/browse/gallery-home/canonical-tnd-pool.ts`
- Test: `tests/unit/browse/canonical-tnd-author.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/browse/canonical-tnd-author.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  loadCanonicalTnDSequences,
  CANONICAL_TND_AUTHOR,
} from "$lib/features/browse/gallery-home/canonical-tnd-pool";

describe("canonical T&D pool author stamp", () => {
  it("stamps every sequence with the reserved author", async () => {
    const pool = await loadCanonicalTnDSequences();
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((s) => s.author === CANONICAL_TND_AUTHOR)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/browse/canonical-tnd-author.test.ts`
Expected: FAIL — `CANONICAL_TND_AUTHOR` is not exported (import error) and/or `author` is undefined.

- [ ] **Step 3: Add the export and stamp the author**

In `src/lib/features/browse/gallery-home/canonical-tnd-pool.ts`, add the exported constant near the top (after the imports, before `TND_BIRTHDAY`):

```ts
/** Reserved author for the defined T&D alphabet, so it is filterable and
 *  isolatable from user-submitted community sequences. */
export const CANONICAL_TND_AUTHOR = "T&D Alphabet";
```

Then, in `resolvePool()`, add `author` to the `updateSequenceData` patch (the object currently sets `id`, `dateAdded`, `birthday`, `level`):

```ts
        out.push(
          updateSequenceData(seq, {
            id: `${matrix.seedId}__t_${safeTurn(pattern)}`,
            author: CANONICAL_TND_AUTHOR,
            dateAdded: TND_BIRTHDAY,
            birthday: TND_BIRTHDAY,
            level: calculateDifficultyLevel([...(seq.steps ?? [])]),
          }),
        );
```

If TypeScript reports that `author` is not an accepted key of `updateSequenceData`'s patch, confirm the field name on `SequenceData` (grep `author` in `src/lib/shared/foundation/domain/models/sequence-data.ts`) and use the exact field. `filterByAuthor` (`browse-filter.ts:433`) reads `seq.author`, so the field is `author`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/browse/canonical-tnd-author.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/browse/gallery-home/canonical-tnd-pool.ts tests/unit/browse/canonical-tnd-author.test.ts
git commit -m "feat(browse): stamp canonical author on T&D alphabet pool" -- src/lib/features/browse/gallery-home/canonical-tnd-pool.ts tests/unit/browse/canonical-tnd-author.test.ts
```

---

## Task 2: Widen `SystemCollectionType` with `"founding"`

**Files:**
- Modify: `src/lib/shared/library/domain/models/collection.ts:32`

This is a type-only change that unblocks Task 3's adapter (`systemType: "founding"`). No standalone test — Task 3's config test and `npm run check` cover it.

- [ ] **Step 1: Widen the union**

In `src/lib/shared/library/domain/models/collection.ts`, change line 32 from:

```ts
export type SystemCollectionType = "favorites";
```

to:

```ts
export type SystemCollectionType = "favorites" | "founding";
```

- [ ] **Step 2: Verify it typechecks in isolation**

Run: `npx vitest run tests/unit/browse/canonical-tnd-author.test.ts`
Expected: PASS (unaffected; confirms the module still compiles under the test transform). Full `npm run check` runs at the end of Task 6.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(library): add 'founding' system collection type" -- src/lib/shared/library/domain/models/collection.ts
```

---

## Task 3: Founding collections config module

**Files:**
- Create: `src/lib/features/browse/collections/config/founding-collections.ts`
- Test: `tests/unit/browse/founding-collections.test.ts` (config-shape assertions only in this task; the count-check is added in Task 4)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/browse/founding-collections.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  FOUNDING_SMART_COLLECTIONS,
  toSyntheticCollection,
  isFoundingId,
  getFoundingCollection,
} from "$lib/features/browse/collections/config/founding-collections";

describe("founding collections config", () => {
  it("declares exactly three founding collections with underscore ids", () => {
    expect(FOUNDING_SMART_COLLECTIONS.map((c) => c.id)).toEqual([
      "founding_tka-1",
      "founding_tka-2",
      "founding_tka-3",
    ]);
    for (const c of FOUNDING_SMART_COLLECTIONS) {
      expect(isFoundingId(c.id)).toBe(true);
      expect(c.id.includes(":")).toBe(false); // must not collide with foreign id decode
      expect(c.filterSpec.source).toBe("community");
      expect(c.filterSpec.filters.length).toBeGreaterThan(0);
    }
  });

  it("declares the expected cached counts", () => {
    expect(FOUNDING_SMART_COLLECTIONS.map((c) => c.sequenceCount)).toEqual([19, 57, 95]);
  });

  it("adapts to a read-only smart LibraryCollection", () => {
    const syn = toSyntheticCollection(FOUNDING_SMART_COLLECTIONS[1]!);
    expect(syn.kind).toBe("smart");
    expect(syn.systemType).toBe("founding");
    expect(syn.sequenceCount).toBe(57);
    expect(syn.filterSpec).toBe(FOUNDING_SMART_COLLECTIONS[1]!.filterSpec);
  });

  it("resolves a founding id back to its config", () => {
    expect(getFoundingCollection("founding_tka-3")?.name).toContain("TKA 3");
    expect(getFoundingCollection("nope")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/browse/founding-collections.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the config module**

Create `src/lib/features/browse/collections/config/founding-collections.ts`:

```ts
/**
 * Founding smart collections — the three printed T&D decks (TKA 1/2/3) as
 * read-only, config-defined rules over the community pool. Baked into the
 * client, so every user gets them automatically (public by construction).
 * See docs/superpowers/specs/active/2026-07-07-founding-smart-collections-design.md.
 */
import type {
  LibraryCollection,
  SmartFilterSpec,
} from "$lib/shared/library/domain/models/collection";
import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
import { CANONICAL_TND_AUTHOR } from "$lib/features/browse/gallery-home/canonical-tnd-pool";

export interface FoundingSmartCollection {
  /** Stable id, always prefixed "founding_" (underscore avoids the ":" used by
   *  the rail to decode foreign ownerId:collectionId nav ids). */
  id: string;
  name: string;
  description: string;
  /** FontAwesome class, e.g. "fa-graduation-cap". */
  icon: string;
  /** Cached member count for the rail card (variation count). */
  sequenceCount: number;
  filterSpec: SmartFilterSpec;
}

// Fences each rule to the canonical alphabet, excluding user community content.
const AUTHOR_FILTER = {
  key: "author",
  type: String(BrowseFilterType.AUTHOR),
  value: CANONICAL_TND_AUTHOR,
  label: CANONICAL_TND_AUTHOR,
  chipColor: "var(--semantic-info)",
};

// Turn ceiling ≤1 trims the fuller alphabet down to each deck's exact patterns.
const CEIL_1 = {
  key: "max_turn_intensity",
  type: String(BrowseFilterType.MAX_TURN_INTENSITY),
  value: 1,
  label: "≤1 turns",
  chipColor: "var(--semantic-success)",
};

// filterByDifficulty parseInt()s the value, so it MUST be a numeric string.
const diff = (level: 1 | 2 | 3, label: string) => ({
  key: "difficulty",
  type: String(BrowseFilterType.DIFFICULTY),
  value: String(level),
  label,
  chipColor: "var(--semantic-warning)",
});

export const FOUNDING_SMART_COLLECTIONS: FoundingSmartCollection[] = [
  {
    id: "founding_tka-1",
    name: "TKA 1: Learning Letters",
    description: "The 19 base T&D motions — no turns.",
    icon: "fa-graduation-cap",
    sequenceCount: 19,
    filterSpec: {
      source: "community",
      filters: [AUTHOR_FILTER, diff(1, "Level 1")],
      sortMethod: "level", // BrowseSortMethod.DIFFICULTY_LEVEL
      sortDirection: "asc",
    },
  },
  {
    id: "founding_tka-2",
    name: "TKA 2: Writing Words",
    description: "Whole-turn variations of the base motions.",
    icon: "fa-pen-nib",
    sequenceCount: 57,
    filterSpec: {
      source: "community",
      filters: [AUTHOR_FILTER, diff(2, "Level 2"), CEIL_1],
      sortMethod: "level",
      sortDirection: "asc",
    },
  },
  {
    id: "founding_tka-3",
    name: "TKA 3: Speaking Sentences",
    description: "Half-turn variations of the base motions.",
    icon: "fa-comments",
    sequenceCount: 95,
    filterSpec: {
      source: "community",
      filters: [AUTHOR_FILTER, diff(3, "Level 3"), CEIL_1],
      sortMethod: "level",
      sortDirection: "asc",
    },
  },
];

export function isFoundingId(id: string): boolean {
  return id.startsWith("founding_");
}

export function getFoundingCollection(
  id: string,
): FoundingSmartCollection | undefined {
  return FOUNDING_SMART_COLLECTIONS.find((c) => c.id === id);
}

/**
 * Adapt a founding definition to a read-only smart LibraryCollection for the
 * rail and detail view. Never persisted to Firestore.
 */
export function toSyntheticCollection(f: FoundingSmartCollection): LibraryCollection {
  return {
    id: f.id,
    name: f.name,
    description: f.description,
    ownerId: "system",
    sequenceIds: [],
    sequenceCount: f.sequenceCount,
    icon: f.icon,
    isPublic: true,
    sortOrder: -1000, // pinned above user collections (rendered explicitly, not sorted)
    kind: "smart",
    systemType: "founding",
    filterSpec: f.filterSpec,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}
```

If `npm run check` later reports missing required `LibraryCollection` fields, read the interface in `collection.ts` and add each missing required field with a sensible default (do NOT loosen the type). The fields above mirror the `allShelf` synthetic object in `MyCollectionsPanel.svelte:98-109`, which is a known-good template.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/browse/founding-collections.test.ts`
Expected: PASS (the config-shape describe block).

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/browse/collections/config/founding-collections.ts tests/unit/browse/founding-collections.test.ts
git commit -m "feat(collections): founding smart collections config + adapter" -- src/lib/features/browse/collections/config/founding-collections.ts tests/unit/browse/founding-collections.test.ts
```

---

## Task 4: Count-check — each rule resolves to exactly 19 / 57 / 95

**Files:**
- Modify: `tests/unit/browse/founding-collections.test.ts` (add the count-check describe block)

This is the correctness gate: it proves the rules reproduce the printed decks over the real, author-stamped canonical pool. Depends on Task 1 (author stamp) and Task 3 (config).

- [ ] **Step 1: Add the failing count-check test**

Append to `tests/unit/browse/founding-collections.test.ts`:

```ts
import { loadCanonicalTnDSequences } from "$lib/features/browse/gallery-home/canonical-tnd-pool";
import { deriveSpecMembers } from "$lib/shared/browse/services/smart-filter-spec";

describe("founding rules resolve to the printed deck counts", () => {
  it("TKA 1 → 19, TKA 2 → 57, TKA 3 → 95 over the canonical pool", async () => {
    const pool = [...(await loadCanonicalTnDSequences())];
    const counts = FOUNDING_SMART_COLLECTIONS.map(
      (c) => deriveSpecMembers(pool, c.filterSpec).length,
    );
    expect(counts).toEqual([19, 57, 95]);
  });

  it("each rule's declared sequenceCount matches its derived count", async () => {
    const pool = [...(await loadCanonicalTnDSequences())];
    for (const c of FOUNDING_SMART_COLLECTIONS) {
      expect(deriveSpecMembers(pool, c.filterSpec).length).toBe(c.sequenceCount);
    }
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/unit/browse/founding-collections.test.ts`
Expected: PASS if Task 1's author stamp and the difficulty/turn model hold.

**If it FAILS**, do NOT change the assertion to match the actual number. Diagnose:
- Log the derived counts and, for one deck, the distinct `level` and `getSequenceMaxTurn` values of its matches vs the full pool.
- Confirm `filterByDifficulty` is comparing `seq.level` (numeric) — the pool sets `level` via `calculateDifficultyLevel`, so a numeric-string filter value (`"2"`) must match. If levels are off (e.g. a whole-turn combo computing level 3), that is a real difficulty-calculator finding — surface it; the deck definition assumed whole→2 / half→3 (`canonical-tnd-pool.ts:66-68`).
- Confirm the `AUTHOR` filter is matching (Task 1 landed). Without it the counts will be far larger.
Report the discrepancy rather than silently retargeting the numbers.

- [ ] **Step 3: Commit**

```bash
git commit -m "test(collections): count-check founding rules to 19/57/95" -- tests/unit/browse/founding-collections.test.ts
```

---

## Task 5: Founding branch in `SmartCollectionDetailView`

**Files:**
- Modify: `src/lib/features/browse/collections/components/SmartCollectionDetailView.svelte`

Make the detail view render a founding collection from config (no Firestore subscribe), skip the self-heal count write-back, and hide mutations. There is no component test harness for this file in this task; correctness is verified by `npm run check` (Task 6) and manual runtime check.

- [ ] **Step 1: Import the founding config**

In the `<script>` block of `SmartCollectionDetailView.svelte`, add to the imports:

```ts
import {
  isFoundingId,
  getFoundingCollection,
  toSyntheticCollection,
} from "$lib/features/browse/collections/config/founding-collections";
```

- [ ] **Step 2: Branch the collection-loading effect**

Find the effect that subscribes to the collection doc (currently):

```ts
	$effect(() => {
		const id = collectionId;
		collection = null;

		const unsubscribe = subscribeToCollection(id, (col) => {
			if (!col || col.kind !== "smart") {
				onBack();
				return;
			}
			collection = col;
		});
		return unsubscribe;
	});
```

Replace it with a founding-aware version:

```ts
	$effect(() => {
		const id = collectionId;
		collection = null;

		// Founding collections are config-defined, not Firestore docs.
		if (isFoundingId(id)) {
			const founding = getFoundingCollection(id);
			if (!founding) {
				onBack();
				return;
			}
			collection = toSyntheticCollection(founding);
			return; // no subscription to tear down
		}

		const unsubscribe = subscribeToCollection(id, (col) => {
			if (!col || col.kind !== "smart") {
				onBack();
				return;
			}
			collection = col;
		});
		return unsubscribe;
	});
```

- [ ] **Step 3: Skip the count write-back for founding collections**

Find the self-heal effect added earlier (it calls `collectionsState.syncSmartCount`):

```ts
	$effect(() => {
		const eng = engine;
		const col = collection;
		if (!eng || !col || eng.isLoading) return;
		const live = eng.resultCount;
		if (live !== col.sequenceCount) {
			void collectionsState.syncSmartCount(col.id, live);
		}
	});
```

Add a founding guard so it never tries to write a non-existent doc:

```ts
	$effect(() => {
		const eng = engine;
		const col = collection;
		if (!eng || !col || eng.isLoading) return;
		if (isFoundingId(col.id)) return; // config-defined, nothing to write
		const live = eng.resultCount;
		if (live !== col.sequenceCount) {
			void collectionsState.syncSmartCount(col.id, live);
		}
	});
```

- [ ] **Step 4: Gate the mutating menu + Edit rule for founding collections**

Add a derived flag after `collection` is declared:

```ts
	const isFounding = $derived(!!collection && isFoundingId(collection.id));
```

In the header markup, wrap the **Edit rule** button and the **options** (kebab) button so they only render for non-founding collections. Find:

```svelte
		{#if collection && !renaming}
			<button type="button" class="edit-btn" onclick={() => (editOpen = true)}>
				<i class="fas fa-sliders" aria-hidden="true"></i>
				<span>Edit rule</span>
			</button>
			<button
				type="button"
				class="options-btn"
				aria-label="Collection options"
				onclick={handleOptions}
			>
				<i class="fas fa-ellipsis-vertical" aria-hidden="true"></i>
			</button>
		{/if}
```

and change the condition to:

```svelte
		{#if collection && !renaming && !isFounding}
```

(Founding collections show the header title + rule chips, but no Edit rule / options — the rule is platform-fixed. Rename is reached only via the options menu, so gating the menu also disables rename.)

- [ ] **Step 5: Verify build**

Run: `npm run check:fast`
Expected: No new errors in `SmartCollectionDetailView.svelte` or `founding-collections.ts`. (Pre-existing errors in unrelated files — practice-bar, water-rethink, video-export — are not introduced by this change; confirm none of the reported paths are the files this task touched.)

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(collections): render founding collections read-only in detail view" -- src/lib/features/browse/collections/components/SmartCollectionDetailView.svelte
```

---

## Task 6: Founding rail cards + routing in `MyCollectionsPanel`

**Files:**
- Modify: `src/lib/features/browse/collections/components/MyCollectionsPanel.svelte`

Render the three founding cards near the top of the rail/grid and route their ids to `SmartCollectionDetailView`.

- [ ] **Step 1: Import the config and build the synthetic cards**

In the `<script>` block of `MyCollectionsPanel.svelte`, add to the imports:

```ts
import {
  FOUNDING_SMART_COLLECTIONS,
  toSyntheticCollection,
  isFoundingId,
} from "$lib/features/browse/collections/config/founding-collections";
```

Below the imports (near the other module-level derivations, after `const collections = $derived(...)`), add a static list of synthetic founding cards:

```ts
	// Founding decks (TKA 1/2/3) — read-only, config-defined, shown to everyone.
	const foundingCards = FOUNDING_SMART_COLLECTIONS.map(toSyntheticCollection);
```

- [ ] **Step 2: Render founding cards in the `ownShelves` snippet**

In the `{#snippet ownShelves(sel)}` block, immediately AFTER the `allShelf` `<CollectionCard>` and BEFORE the `{#each collections ...}` block, insert:

```svelte
	{#each foundingCards as f (f.id)}
		<CollectionCard
			collection={f}
			readonly
			selected={!!sel && sel.id === f.id && !sel.ownerId}
			onOpen={() => openCollection(f.id, f.name)}
		/>
	{/each}
```

(`readonly` + `systemType: "founding"` means `CollectionCard` hides the kebab and shows the smart badge. `openCollection` writes the founding id as the nav `contextId`; because it has no `:`, the `detail` deriver treats it as an own-collection id.)

- [ ] **Step 3: Route founding ids to `SmartCollectionDetailView` (split layout)**

In the split-layout detail pane, find (around line 310):

```svelte
			{:else if isOwnSmart(railSelection.id, railSelection.ownerId)}
				{#key railSelection.id}
					<SmartCollectionDetailView
						collectionId={railSelection.id}
						onBack={backToList}
						showBack={false}
					/>
				{/key}
```

Change the condition to also match founding ids:

```svelte
			{:else if isOwnSmart(railSelection.id, railSelection.ownerId) || isFoundingId(railSelection.id)}
```

- [ ] **Step 4: Route founding ids to `SmartCollectionDetailView` (single-column layout)**

Find the non-split branch (around line 332):

```svelte
	{:else if isOwnSmart(detail.id, detail.ownerId)}
		{#key detail.id}
			<SmartCollectionDetailView collectionId={detail.id} onBack={backToList} />
		{/key}
```

Change the condition:

```svelte
	{:else if isOwnSmart(detail.id, detail.ownerId) || isFoundingId(detail.id)}
```

- [ ] **Step 5: Confirm the non-split list is already covered**

The single-column list renders its cards via `{@render ownShelves(null)}` (`MyCollectionsPanel.svelte:369`) — the exact snippet edited in Step 2. So the founding cards appear in the phone list automatically; **no extra edit is required.** Just verify line 369 still reads `{@render ownShelves(null)}` after your Step 2 edit (the edit is inside the snippet body, not its call sites).

Note (scope): the Library rail/list only renders for signed-in users (the signed-out branch shows a sign-in prompt), so founding decks appear for every **signed-in** user. Guest/signed-out visibility is out of scope for this plan.

- [ ] **Step 6: Run the full typecheck**

Run: `npm run check`
Expected: exit 0 with no new errors attributable to the touched files (`MyCollectionsPanel.svelte`, `SmartCollectionDetailView.svelte`, `founding-collections.ts`, `collection.ts`, `canonical-tnd-pool.ts`). Capture to a log and grep for those paths:

```bash
npm run check > /tmp/check-founding.log 2>&1; grep -iE "founding|MyCollectionsPanel|SmartCollectionDetailView|canonical-tnd-pool" /tmp/check-founding.log
```

Expected: no matches (no errors in our files). Pre-existing unrelated errors elsewhere are acceptable and out of scope.

- [ ] **Step 7: Run the unit tests**

Run: `npx vitest run tests/unit/browse/founding-collections.test.ts tests/unit/browse/canonical-tnd-author.test.ts`
Expected: all PASS (config shape, author stamp, counts 19/57/95).

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(collections): surface founding decks (TKA 1/2/3) in the Library rail" -- src/lib/features/browse/collections/components/MyCollectionsPanel.svelte
```

---

## Final verification (after all tasks)

- [ ] Full test + typecheck green: `npm run check` (exit 0 for our files) and `npx vitest run tests/unit/browse/founding-collections.test.ts tests/unit/browse/canonical-tnd-author.test.ts` (all pass).
- [ ] **Runtime acceptance (needs the browser — cannot self-verify):**
  1. Library rail shows **TKA 1 / TKA 2 / TKA 3** near the top, each read-only (no kebab).
  2. Rail counts read **19 / 57 / 95**.
  3. Opening each shows the read-only smart grid (no filter bar, no Edit rule, section rail present).
  4. `engine.resultCount` in the header reads 19 / 57 / 95 respectively.
  5. Tapping a card opens the sequence viewer.
  6. The founding decks are NOT offered in the add-to-collection picker and cannot be renamed/deleted/edited.
```
