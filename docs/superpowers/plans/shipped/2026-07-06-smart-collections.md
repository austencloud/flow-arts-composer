# Smart Collections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add filter-defined, auto-updating "Smart Collections" to the Library — a collection whose members derive live from a saved browse-filter rule instead of a hand-picked list.

**Architecture:** Extend `LibraryCollection` with `kind` + `filterSpec` (Approach A from the spec). Members are never stored; a Smart Collection's detail view spins up an ephemeral `createBrowseEngine`, replays the saved filters via `engine.addFilter`, and renders `engine.sequences` through the shared `BrowsePanel`. All persistence, CRUD, subscriptions, rail, and card UI are the existing collections stack. Private-only in v1; `isPublic` stays dormant on the model.

**Tech Stack:** Svelte 5 runes, Firestore (`users/{uid}/collections/{id}`), the headless `BrowseEngine`, vitest.

**Spec:** `docs/superpowers/specs/active/2026-07-06-smart-collections-design.md`

**Critical constraint (Firestore):** Firestore forbids arrays-of-arrays. The engine's in-memory `activeFilters` serialize to `Array<[string, ActiveFilter]>` (array of tuples) for localStorage, but that shape CANNOT be written to Firestore. The stored `filterSpec.filters` MUST be an array of **objects** (`StoredSmartFilter[]`). This plan uses that shape end to end.

---

## File structure

**Create:**
- `src/lib/shared/browse/services/smart-filter-spec.ts` — pure serialization + derivation between a `BrowseEngine` and a `SmartFilterSpec`.
- `src/lib/features/browse/collections/components/SmartCollectionDetailView.svelte` — read-only live-derived detail view (rule chips + Edit rule + derived grid).
- `src/lib/features/browse/collections/components/SmartCollectionBuilderSheet.svelte` — create-from-scratch AND edit-rule sheet (drill + filter + preview + name).
- `src/lib/features/library/components/SmartCollectionSaveDialog.svelte` — name prompt that saves the current engine's filters as a Smart Collection.
- `tests/unit/library/smart-collection-model.test.ts`
- `tests/unit/browse/smart-filter-spec.test.ts`

**Modify:**
- `src/lib/shared/library/domain/models/collection.ts` — `kind`/`filterSpec` fields, `SmartFilterSpec`/`StoredSmartFilter` types, `isSmartCollection`, `createSmartCollectionModel`.
- `src/lib/shared/library/services/collection-firestore-mapper.ts` — read `kind`/`filterSpec` in `mapDocToCollection`.
- `src/lib/shared/library/services/collection-manager.ts` — `createSmartUserCollection`, `updateCollectionFilterSpec`, guard `removeSequenceFromCollection` against smart targets.
- `src/lib/features/library/state/collections-state.svelte.ts` — `createSmart`, `updateFilterSpec`, `toggle` guard.
- `src/lib/features/library/components/collection-picker/CollectionPickerContent.svelte` — exclude smart from the add-target list.
- `src/lib/features/browse/collections/components/CollectionCard.svelte` — smart badge.
- `src/lib/features/browse/collections/components/MyCollectionsPanel.svelte` — branch own smart collections to `SmartCollectionDetailView`; add "New smart collection" tile.
- `src/lib/shared/browse/components/BrowseFilterBar.svelte` — optional "Save as Smart Collection" button.
- `src/lib/shared/browse/components/BrowsePanel.svelte` — `onSaveSmart` passthrough.
- `src/lib/features/browse/shared/components/GalleryTab.svelte` — `onSaveSmart` passthrough.
- `src/lib/features/browse/shared/components/BrowseModule.svelte` — save dialog + `onSaveSmart` wiring (community pool).
- `src/lib/features/browse/collections/components/AllLibraryView.svelte` — save dialog + `onSaveSmart` wiring (my-library pool).

---

## Task 1: Data model — `kind`, `filterSpec`, factory, helper

**Files:**
- Modify: `src/lib/shared/library/domain/models/collection.ts`
- Test: `tests/unit/library/smart-collection-model.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/library/smart-collection-model.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  createSmartCollectionModel,
  isSmartCollection,
  type SmartFilterSpec,
  type LibraryCollection,
} from "$lib/shared/library/domain/models/collection";

const SPEC: SmartFilterSpec = {
  source: "community",
  filters: [
    { key: "difficulty", type: "difficulty", value: 2, label: "Level 2", chipColor: "var(--semantic-info)" },
  ],
  sortMethod: "alphabetical",
  sortDirection: "asc",
};

function manual(): LibraryCollection {
  return {
    id: "c1", name: "Manual", ownerId: "u1", sequenceIds: ["a"], sequenceCount: 1,
    isPublic: false, sortOrder: 0, createdAt: new Date(), updatedAt: new Date(),
  };
}

describe("smart collection model", () => {
  it("createSmartCollectionModel stamps kind + filterSpec, empty members", () => {
    const c = createSmartCollectionModel("Level 2s", "u1", SPEC);
    expect(c.kind).toBe("smart");
    expect(c.filterSpec).toEqual(SPEC);
    expect(c.sequenceIds).toEqual([]);
    expect(c.sequenceCount).toBe(0);
    expect(c.icon).toBe("fa-wand-magic-sparkles");
    expect(c.isPublic).toBe(false);
  });

  it("isSmartCollection true only for kind==='smart'", () => {
    const c = createSmartCollectionModel("x", "u1", SPEC);
    expect(isSmartCollection({ ...manual(), ...c, id: "c2" })).toBe(true);
    expect(isSmartCollection(manual())).toBe(false); // no kind → manual
    expect(isSmartCollection({ ...manual(), kind: "manual" })).toBe(false);
  });

  it("filters is an array of objects (Firestore-safe, no nested arrays)", () => {
    const c = createSmartCollectionModel("x", "u1", SPEC);
    expect(Array.isArray(c.filterSpec!.filters)).toBe(true);
    for (const f of c.filterSpec!.filters) {
      expect(Array.isArray(f)).toBe(false); // each entry is an object, not a tuple
      expect(typeof f.key).toBe("string");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/library/smart-collection-model.test.ts`
Expected: FAIL — `createSmartCollectionModel`, `isSmartCollection`, `SmartFilterSpec` not exported.

- [ ] **Step 3: Add types + fields + factory + helper to `collection.ts`**

Add these type exports near the top of the file, after the `SystemCollectionType` definition (after line 32):

```ts
/** A Smart Collection's rule targets one of these pools. */
export type SmartCollectionSource = "community" | "my-library";

/**
 * One saved filter, Firestore-safe. This is an OBJECT (not the engine's
 * `[key, ActiveFilter]` tuple) because Firestore forbids arrays-of-arrays.
 * `type` is the string value of BrowseFilterType; `value` mirrors
 * BrowseFilterValue (`string | number | boolean | string[] | null`).
 */
export interface StoredSmartFilter {
  /** Engine map key, e.g. "difficulty" or "loop_type:component:mirrored". */
  key: string;
  type: string;
  value: string | number | boolean | string[] | null;
  label: string;
  chipColor: string;
}

/** The saved rule that defines a Smart Collection's live membership. */
export interface SmartFilterSpec {
  source: SmartCollectionSource;
  /** Array of objects — never a nested array (Firestore constraint). */
  filters: StoredSmartFilter[];
  /** String value of BrowseSortMethod. */
  sortMethod: string;
  sortDirection: "asc" | "desc";
}
```

Add two fields to the `LibraryCollection` interface, immediately after the `deckMetadata` field (after line 108):

```ts
  /**
   * Membership model. Absent or "manual" = hand-picked `sequenceIds` list
   * (every collection before Smart Collections existed). "smart" = members
   * derive live from `filterSpec`; `sequenceIds` is unused.
   */
  readonly kind?: "manual" | "smart";

  /** The saved filter rule. Present iff kind === "smart". */
  readonly filterSpec?: SmartFilterSpec;
```

Add the helper immediately after `isFavoritesCollection` (after line 129):

```ts
/**
 * Check if a collection is a Smart Collection (rule-defined membership).
 */
export function isSmartCollection(collection: LibraryCollection): boolean {
  return collection.kind === "smart";
}
```

Add the factory immediately after `createCollection` (after line 167):

```ts
/**
 * Create a Smart Collection model (rule-defined membership). Members derive
 * live from `filterSpec`, so `sequenceIds`/`sequenceCount` start empty.
 * Defaults to the wand icon so it reads as auto-maintained in the rail.
 */
export function createSmartCollectionModel(
  name: string,
  ownerId: string,
  filterSpec: SmartFilterSpec,
  options: CreateCollectionOptions = {}
): Omit<LibraryCollection, "id"> {
  const now = new Date();

  return {
    name,
    ownerId,
    description: options.description,
    sequenceIds: [],
    sequenceCount: 0,
    coverImageUrl: options.coverImageUrl,
    color: options.color,
    icon: options.icon ?? "fa-wand-magic-sparkles",
    isPublic: options.isPublic ?? false,
    sortOrder: options.sortOrder ?? 0,
    kind: "smart",
    filterSpec,
    createdAt: now,
    updatedAt: now,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/library/smart-collection-model.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/library/domain/models/collection.ts tests/unit/library/smart-collection-model.test.ts
git commit -m "feat(collections): Smart Collection model — kind + filterSpec fields, factory, guard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- src/lib/shared/library/domain/models/collection.ts tests/unit/library/smart-collection-model.test.ts
```

---

## Task 2: Mapper reads `kind` + `filterSpec`

**Files:**
- Modify: `src/lib/shared/library/services/collection-firestore-mapper.ts:69-89`

- [ ] **Step 1: Add the two field reads to `mapDocToCollection`**

In `mapDocToCollection`, add two lines to the returned object, immediately after the `systemType: data["systemType"],` line (line 85):

```ts
    kind: data["kind"] ?? "manual",
    filterSpec: data["filterSpec"],
```

(Old docs have neither field → `kind` defaults to `"manual"`, `filterSpec` stays `undefined`. `isSmartCollection` treats both as manual.)

- [ ] **Step 2: Verify typecheck (capture once)**

Run: `npm run check:fast > /tmp/sc-check2.log 2>&1; grep -iE "collection-firestore-mapper|collection.ts" /tmp/sc-check2.log || echo "CLEAN (mapper)"`
Expected: `CLEAN (mapper)`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/shared/library/services/collection-firestore-mapper.ts
git commit -m "feat(collections): map kind + filterSpec off collection docs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- src/lib/shared/library/services/collection-firestore-mapper.ts
```

---

## Task 3: Manager — create/update smart, guard member ops

**Files:**
- Modify: `src/lib/shared/library/services/collection-manager.ts`

- [ ] **Step 1: Import the smart factory**

In the import from `collection` (lines 32-37), add `createSmartCollectionModel` and the `SmartFilterSpec` type. Change the block to:

```ts
import {
  createCollection,
  createSmartCollectionModel,
  createSystemCollection,
  isSystemCollection,
  SYSTEM_COLLECTION_IDS,
} from "$lib/shared/library/domain/models/collection";
import type { SmartFilterSpec } from "$lib/shared/library/domain/models/collection";
```

(The existing `import type { LibraryCollection, SystemCollectionType }` block above it stays.)

- [ ] **Step 2: Add `createSmartUserCollection` after `createUserCollection`**

Insert immediately after `createUserCollection` ends (after line 160):

```ts
/**
 * Create a Smart Collection (rule-defined membership). Mirrors
 * createUserCollection but stamps kind + filterSpec and no members. The
 * per-user cap is enforced by collections-state before this is called.
 */
export async function createSmartUserCollection(
  name: string,
  filterSpec: SmartFilterSpec
): Promise<LibraryCollection> {
  const firestore = await getFirestoreInstance();
  const userId = getAuthenticatedUserId();
  const collectionId = crypto.randomUUID();

  const newCollection = createSmartCollectionModel(name, userId, filterSpec, {
    sortOrder: Date.now(),
  });

  const docRef = doc(firestore, getUserCollectionPath(userId, collectionId));
  // Same undefined-stripping as createUserCollection (Firestore rejects
  // undefined field values). filterSpec is always defined here.
  const docData = Object.fromEntries(
    Object.entries({
      ...newCollection,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }).filter(([, value]) => value !== undefined)
  );
  try {
    await setDoc(docRef, docData);

    const userDocRef = doc(firestore, `users/${userId}`);
    await updateDoc(userDocRef, { lastActivityDate: serverTimestamp() });
  } catch (error) {
    console.error("[CollectionManager] Failed to create smart collection:", error);
    toast.error("Failed to create smart collection. Please try again.");
    throw new CollectionError(
      "Failed to create smart collection",
      "NETWORK",
      collectionId
    );
  }

  return { ...newCollection, id: collectionId };
}

/**
 * Replace a Smart Collection's saved rule (Edit rule). Only the filterSpec
 * and updatedAt change; membership re-derives on the next view.
 */
export async function updateCollectionFilterSpec(
  collectionId: string,
  filterSpec: SmartFilterSpec
): Promise<void> {
  const firestore = await getFirestoreInstance();
  const userId = getAuthenticatedUserId();
  const docRef = doc(firestore, getUserCollectionPath(userId, collectionId));
  try {
    await updateDoc(docRef, { filterSpec, updatedAt: serverTimestamp() });
  } catch (error) {
    console.error("[CollectionManager] Failed to update filter rule:", error);
    toast.error("Failed to update the rule. Please try again.");
    throw new CollectionError(
      "Failed to update filter rule",
      "NETWORK",
      collectionId
    );
  }
}
```

- [ ] **Step 3: Guard `removeSequenceFromCollection` against smart targets**

`removeSequenceFromCollection` already fetches `existing` (line 360). Add a guard immediately after the `if (!existing) { return; }` block (after line 364):

```ts
  if (existing.kind === "smart") {
    // Smart collections derive members from a rule; there is nothing to
    // hand-remove. The UI hides remove affordances — this is defense in depth.
    throw new CollectionError(
      "Cannot modify members of a smart collection",
      "INVALID_OPERATION",
      collectionId
    );
  }
```

(Note: `addSequenceToCollection` is not guarded at the manager layer because it performs no read; the state layer and picker exclusion in Tasks 5–6 prevent it there without an extra Firestore read.)

- [ ] **Step 4: Verify typecheck (capture once)**

Run: `npm run check:fast > /tmp/sc-check3.log 2>&1; grep -iE "collection-manager" /tmp/sc-check3.log || echo "CLEAN (manager)"`
Expected: `CLEAN (manager)`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/library/services/collection-manager.ts
git commit -m "feat(collections): manager create/update smart collections + member-op guard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- src/lib/shared/library/services/collection-manager.ts
```

---

## Task 4: Serialization helper (engine ↔ spec)

**Files:**
- Create: `src/lib/shared/browse/services/smart-filter-spec.ts`
- Test: `tests/unit/browse/smart-filter-spec.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/browse/smart-filter-spec.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveSpecMembers } from "$lib/shared/browse/services/smart-filter-spec";
import type { SmartFilterSpec } from "$lib/shared/library/domain/models/collection";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

function seq(id: string, level: number): SequenceData {
  // Minimal shape the difficulty filter reads (level field + fallback).
  return { id, word: id, level } as unknown as SequenceData;
}

describe("deriveSpecMembers", () => {
  it("filters a pool by the spec's stored filters (difficulty)", () => {
    const pool = [seq("a", 1), seq("b", 2), seq("c", 2), seq("d", 3)];
    const spec: SmartFilterSpec = {
      source: "community",
      filters: [
        { key: "difficulty", type: "difficulty", value: 2, label: "Level 2", chipColor: "#fff" },
      ],
      sortMethod: "alphabetical",
      sortDirection: "asc",
    };
    const result = deriveSpecMembers(pool, spec).map((s) => s.id).sort();
    expect(result).toEqual(["b", "c"]);
  });

  it("empty filters returns the whole pool", () => {
    const pool = [seq("a", 1), seq("b", 2)];
    const spec: SmartFilterSpec = {
      source: "community", filters: [], sortMethod: "alphabetical", sortDirection: "asc",
    };
    expect(deriveSpecMembers(pool, spec)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/browse/smart-filter-spec.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `smart-filter-spec.ts`**

```ts
/**
 * Smart Collection filter-spec serialization.
 *
 * Bridges the headless BrowseEngine and the Firestore-safe SmartFilterSpec.
 * The engine holds filters as an in-memory Map<string, ActiveFilter>; a
 * SmartFilterSpec stores them as an array of plain objects (Firestore forbids
 * arrays-of-arrays, so the engine's [key, ActiveFilter] tuple form can't be
 * persisted directly).
 */

import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
import type { BrowseSortMethod } from "$lib/shared/browse/domain/enums/browse-enums";
import { applyFilters } from "$lib/shared/browse/services/multi-filter";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { BrowseEngine, ActiveFilter } from "$lib/shared/browse/engine/types";
import type {
  SmartFilterSpec,
  StoredSmartFilter,
} from "$lib/shared/library/domain/models/collection";

/**
 * Serialize the engine's current NON-locked filters, source, and sort into a
 * Firestore-safe SmartFilterSpec.
 */
export function buildFilterSpecFromEngine(engine: BrowseEngine): SmartFilterSpec {
  const filters: StoredSmartFilter[] = [];
  for (const [key, f] of engine.activeFilters) {
    if (f.locked) continue;
    filters.push({
      key,
      type: String(f.type),
      value: f.value,
      label: f.label,
      chipColor: f.chipColor,
    });
  }
  return {
    source: engine.source,
    filters,
    sortMethod: String(engine.sortMethod),
    sortDirection: engine.sortDirection,
  };
}

/**
 * Replay a saved spec onto a fresh engine. Uses addFilter so composite loop /
 * TnD keys (which STACK) are reconstructed exactly, then applies the sort.
 * Call after creating the engine; the derived pipeline applies the filters
 * once the pool loads via initialize().
 */
export function applySpecToEngine(engine: BrowseEngine, spec: SmartFilterSpec): void {
  for (const f of spec.filters) {
    engine.addFilter(f.type as BrowseFilterType, f.value, f.label, f.chipColor);
  }
  engine.setSort(spec.sortMethod as BrowseSortMethod, spec.sortDirection);
}

/**
 * Pure derivation for tests and non-engine callers: filter a pool by a spec.
 * (The live detail view uses an engine; this mirrors its filter result.)
 */
export function deriveSpecMembers(
  pool: SequenceData[],
  spec: SmartFilterSpec
): SequenceData[] {
  const map = new Map<string, ActiveFilter>();
  for (const f of spec.filters) {
    map.set(f.key, {
      type: f.type as BrowseFilterType,
      value: f.value,
      label: f.label,
      chipColor: f.chipColor,
      locked: false,
    });
  }
  return applyFilters(pool, map);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/browse/smart-filter-spec.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/browse/services/smart-filter-spec.ts tests/unit/browse/smart-filter-spec.test.ts
git commit -m "feat(browse): smart-filter-spec — engine<->filterSpec serialization + derivation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- src/lib/shared/browse/services/smart-filter-spec.ts tests/unit/browse/smart-filter-spec.test.ts
```

---

## Task 5: State wrappers + toggle guard

**Files:**
- Modify: `src/lib/features/library/state/collections-state.svelte.ts`

- [ ] **Step 1: Import the smart manager functions + type**

In the import from `collection-manager` (lines 5-13), add `createSmartUserCollection` and `updateCollectionFilterSpec`:

```ts
import {
	subscribeToCollections,
	addSequenceToCollection,
	removeSequenceFromCollection,
	createUserCollection,
	createSmartUserCollection,
	updateCollectionFilterSpec,
	ensureSystemCollections,
	updateCollection,
	deleteCollection,
} from "$lib/shared/library/services/collection-manager";
```

Add the type import near the top (after line 4's `LibraryCollection` import):

```ts
import type { SmartFilterSpec } from "$lib/shared/library/domain/models/collection";
```

- [ ] **Step 2: Guard `toggle` against smart collections**

In `toggle`, immediately after `const c = this.collections.find((col) => col.id === collectionId); if (!c) return;` (after line 81), add:

```ts
		// Smart collections derive members from a rule — there's nothing to
		// hand-toggle. (The picker hides them, so this is belt-and-braces.)
		if (c.kind === "smart") return;
```

- [ ] **Step 3: Add `createSmart` + `updateFilterSpec` methods**

Insert after the `create` method (after line 120):

```ts
	/**
	 * Create a Smart Collection from a saved filter rule, guarding the per-user
	 * cap (same as `create`). Returns null when blocked or on failure.
	 */
	async createSmart(
		name: string,
		filterSpec: SmartFilterSpec,
	): Promise<LibraryCollection | null> {
		const trimmed = name.trim();
		if (!trimmed) return null;

		const userCount = this.collections.filter((c) => !c.systemType).length;
		if (userCount >= LIBRARY_LIMITS.MAX_COLLECTIONS_PER_USER) {
			toast.error(`Collection limit reached (${LIBRARY_LIMITS.MAX_COLLECTIONS_PER_USER} max).`);
			return null;
		}

		try {
			return await createSmartUserCollection(trimmed, filterSpec);
		} catch {
			return null; // manager already toasted
		}
	}

	/**
	 * Replace a Smart Collection's rule (Edit rule). Returns false on failure.
	 */
	async updateFilterSpec(
		collectionId: string,
		filterSpec: SmartFilterSpec,
	): Promise<boolean> {
		try {
			await updateCollectionFilterSpec(collectionId, filterSpec);
			return true;
		} catch {
			return false; // manager already toasted
		}
	}
```

- [ ] **Step 4: Verify typecheck (capture once)**

Run: `npm run check:fast > /tmp/sc-check5.log 2>&1; grep -iE "collections-state" /tmp/sc-check5.log || echo "CLEAN (state)"`
Expected: `CLEAN (state)`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/library/state/collections-state.svelte.ts
git commit -m "feat(collections): state createSmart/updateFilterSpec + toggle guard for smart

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- src/lib/features/library/state/collections-state.svelte.ts
```

---

## Task 6: Exclude smart from the add-to-collection picker

**Files:**
- Modify: `src/lib/features/library/components/collection-picker/CollectionPickerContent.svelte:44`

- [ ] **Step 1: Filter smart collections out of the picker list**

Change the `collections` derived (line 44) so smart collections never appear as add targets:

```ts
	// Smart collections derive members from a rule — you can't hand-file a
	// sequence into one, so they're never valid add targets here.
	const collections = $derived(
		collectionsState.collections.filter((c) => c.kind !== "smart"),
	);
```

- [ ] **Step 2: Verify typecheck (capture once)**

Run: `npm run check:fast > /tmp/sc-check6.log 2>&1; grep -iE "CollectionPickerContent" /tmp/sc-check6.log || echo "CLEAN (picker)"`
Expected: `CLEAN (picker)`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/features/library/components/collection-picker/CollectionPickerContent.svelte
git commit -m "feat(collections): exclude smart collections from add-to-collection picker

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- src/lib/features/library/components/collection-picker/CollectionPickerContent.svelte
```

---

## Task 7: Card smart badge

**Files:**
- Modify: `src/lib/features/browse/collections/components/CollectionCard.svelte`

- [ ] **Step 1: Add an `isSmart` derived**

After `const tileColor = ...` (line 47), add:

```ts
	const isSmart = $derived(collection.kind === "smart");
```

- [ ] **Step 2: Show the badge in the count line**

Replace the `tile-count` span (lines 203-206) with:

```svelte
				<span class="tile-count">
					{countLabel(collection.sequenceCount)}{#if isSmart}
						· <i class="fas fa-wand-magic-sparkles smart-badge" aria-hidden="true"></i> Smart{/if}{#if !isReadonly && collection.isPublic}
						· <i class="fas fa-globe public-globe" aria-hidden="true"></i> Public{/if}
				</span>
```

- [ ] **Step 3: Add the badge style**

Add next to the `.public-globe` rule (after line 329):

```css
	.smart-badge {
		font-size: 10px;
		color: color-mix(in srgb, var(--tile-color) 80%, white);
	}
```

- [ ] **Step 4: Verify typecheck (capture once)**

Run: `npm run check:fast > /tmp/sc-check7.log 2>&1; grep -iE "CollectionCard" /tmp/sc-check7.log || echo "CLEAN (card)"`
Expected: `CLEAN (card)`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/browse/collections/components/CollectionCard.svelte
git commit -m "feat(collections): smart badge on collection cards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- src/lib/features/browse/collections/components/CollectionCard.svelte
```

---

## Task 8: `SmartCollectionDetailView` (live-derived detail)

**Files:**
- Create: `src/lib/features/browse/collections/components/SmartCollectionDetailView.svelte`

Depends on Task 12's `SmartCollectionBuilderSheet` for the "Edit rule" button. Build this component now with the Edit-rule button wired to a local `editOpen` flag; the sheet import is added in Task 12 (the button is inert until then — note it in the commit).

- [ ] **Step 1: Create the component**

```svelte
<!--
SmartCollectionDetailView.svelte

A Smart Collection's detail view. Members are NOT stored — they derive live
from the saved filter rule. An ephemeral BrowseEngine loads the rule's target
pool (community or my-library), the saved filters are replayed onto it, and
the shared BrowsePanel renders the result. The rule shows as chips in the
header; "Edit rule" reopens the builder to change it.
-->
<script lang="ts">
	import { onMount } from "svelte";
	import type { LibraryCollection } from "$lib/shared/library/domain/models/collection";
	import { subscribeToCollection } from "$lib/shared/library/services/collection-manager";
	import { collectionsState } from "$lib/features/library/state/collections-state.svelte";
	import { createBrowseEngine } from "$lib/shared/browse/engine/create-browse-engine.svelte";
	import { applySpecToEngine } from "$lib/shared/browse/services/smart-filter-spec";
	import BrowsePanel from "$lib/shared/browse/components/BrowsePanel.svelte";
	import ContextMenu from "$lib/shared/components/context-menu/ContextMenu.svelte";
	import type {
		ContextMenuEntry,
		ContextMenuState,
	} from "$lib/shared/components/context-menu/context-menu-types";
	import ConfirmDialog from "$lib/shared/foundation/ui/ConfirmDialog.svelte";
	import SmartCollectionBuilderSheet from "./SmartCollectionBuilderSheet.svelte";

	let {
		collectionId,
		onBack,
		showBack = true,
	}: {
		collectionId: string;
		onBack: () => void;
		showBack?: boolean;
	} = $props();

	let collection = $state<LibraryCollection | null>(null);
	let firstSnapshotSeen = $state(false);

	const tileColor = $derived(collection?.color ?? "var(--theme-accent)");
	const spec = $derived(collection?.filterSpec ?? null);
	const sourceLabel = $derived(spec?.source === "my-library" ? "My Library" : "Community");

	// One ephemeral engine for this view; its source is fixed to the rule's pool.
	// Rebuilt filters live in the engine — a rule edit clears + re-applies them.
	let engine = $state<ReturnType<typeof createBrowseEngine> | null>(null);

	// Subscribe to the collection doc so a rule edit / rename / delete elsewhere
	// reflects here. A deleted (or non-smart) doc bails to the list.
	$effect(() => {
		const id = collectionId;
		firstSnapshotSeen = false;
		collection = null;

		const unsubscribe = subscribeToCollection(id, (col) => {
			firstSnapshotSeen = true;
			if (!col || col.kind !== "smart") {
				onBack();
				return;
			}
			collection = col;
		});
		return unsubscribe;
	});

	// Build the engine once the first spec is known; re-apply filters whenever
	// the rule changes. specSignature keys the effect so an Edit-rule write
	// re-derives without recreating the engine.
	const specSignature = $derived(spec ? JSON.stringify(spec) : "");
	onMount(() => {
		return () => engine?.destroy();
	});
	$effect(() => {
		const s = spec;
		void specSignature; // track
		if (!s) return;
		if (!engine) {
			engine = createBrowseEngine({
				persistKey: null,
				initialSource: s.source,
				sources: [s.source],
				minColumns: 2,
			});
			applySpecToEngine(engine, s);
			void engine.initialize();
		} else {
			engine.clearUserFilters();
			applySpecToEngine(engine, s);
		}
	});

	// ── Options menu (rename / edit rule / delete) ──────────────────────────
	let menuState: ContextMenuState = $state({ open: false });
	let renaming = $state(false);
	let renameValue = $state("");
	let deleteConfirmOpen = $state(false);
	let editOpen = $state(false);

	const menuItems: ContextMenuEntry[] = $derived.by(() => [
		{
			id: "rename",
			label: "Rename",
			icon: "fa-pen",
			action() {
				menuState = { open: false };
				renameValue = collection?.name ?? "";
				renaming = true;
			},
		},
		{ type: "separator" } as ContextMenuEntry,
		{
			id: "delete",
			label: "Delete collection",
			icon: "fa-trash",
			danger: true,
			action() {
				menuState = { open: false };
				deleteConfirmOpen = true;
			},
		},
	]);

	function handleOptions(e: MouseEvent) {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		menuState = { open: true, x: rect.right, y: rect.bottom + 4 };
	}

	async function commitRename() {
		const name = renameValue.trim();
		renaming = false;
		if (!collection || !name || name === collection.name) return;
		await collectionsState.rename(collectionId, name);
	}

	function handleRenameKeydown(e: KeyboardEvent) {
		if (e.key === "Enter") {
			e.preventDefault();
			void commitRename();
		} else if (e.key === "Escape") {
			e.preventDefault();
			renaming = false;
		}
	}

	async function performDelete() {
		deleteConfirmOpen = false;
		const ok = await collectionsState.remove(collectionId);
		if (ok) onBack();
	}
</script>

<div class="collection-detail" style="--tile-color: {tileColor};">
	<header class="detail-header">
		{#if showBack}
			<button type="button" class="back-btn" aria-label="Back to collections" onclick={onBack}>
				<i class="fas fa-arrow-left" aria-hidden="true"></i>
			</button>
		{/if}

		<span class="header-icon">
			<i class={`fas ${collection?.icon ?? "fa-wand-magic-sparkles"}`} aria-hidden="true"></i>
		</span>

		{#if renaming}
			<!-- svelte-ignore a11y_autofocus -->
			<input
				type="text"
				class="rename-field"
				aria-label="Collection name"
				bind:value={renameValue}
				onkeydown={handleRenameKeydown}
				onblur={() => void commitRename()}
				maxlength="60"
				autofocus
			/>
		{:else}
			<div class="header-text">
				<h2 class="header-name">{collection?.name ?? ""}</h2>
				<span class="header-count">
					Smart · {sourceLabel}{#if engine} · {engine.resultCount} now{/if}
				</span>
			</div>
		{/if}

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
	</header>

	{#if spec && spec.filters.length > 0}
		<div class="rule-chips" aria-label="Rule">
			{#each spec.filters as f (f.key)}
				<span class="rule-chip" style="--chip-color: {f.chipColor};">{f.label}</span>
			{/each}
		</div>
	{/if}

	<div class="detail-body">
		{#if engine}
			<BrowsePanel {engine} layout="compact" />
		{/if}
	</div>
</div>

<ContextMenu {menuState} items={menuItems} onClose={() => (menuState = { open: false })} />

<ConfirmDialog
	bind:isOpen={deleteConfirmOpen}
	title={`Delete "${collection?.name ?? "collection"}"?`}
	message="The rule goes away. The sequences it matched stay in the community library."
	confirmText="Delete"
	cancelText="Keep"
	variant="danger"
	onConfirm={performDelete}
	onCancel={() => (deleteConfirmOpen = false)}
/>

{#if editOpen && collection}
	<SmartCollectionBuilderSheet
		mode="edit"
		editCollectionId={collectionId}
		initialSpec={collection.filterSpec}
		onClose={() => (editOpen = false)}
	/>
{/if}

<style>
	.collection-detail {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	.detail-header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 12px;
		flex-shrink: 0;
	}

	.back-btn,
	.options-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		flex-shrink: 0;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		border-radius: 12px;
		color: var(--theme-text, white);
		cursor: pointer;
	}

	.header-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		flex-shrink: 0;
		border-radius: 11px;
		background: color-mix(in srgb, var(--tile-color) 20%, transparent);
		color: var(--tile-color);
		font-size: 16px;
	}

	.header-text {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}

	.header-name {
		margin: 0;
		font-size: clamp(16px, 2.4cqi, 20px);
		font-weight: 700;
		color: var(--theme-text, white);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.header-count {
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
		font-variant-numeric: tabular-nums;
	}

	.edit-btn {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 8px;
		height: 44px;
		padding: 0 16px;
		flex-shrink: 0;
		border: 1px solid color-mix(in srgb, var(--tile-color) 45%, transparent);
		border-radius: 12px;
		background: color-mix(in srgb, var(--tile-color) 18%, transparent);
		color: var(--theme-text, white);
		font-size: var(--font-size-sm, 14px);
		font-weight: 600;
		cursor: pointer;
	}

	.rename-field {
		flex: 1;
		min-width: 0;
		height: 44px;
		padding: 0 14px;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border: 1.5px solid color-mix(in srgb, var(--tile-color) 45%, transparent);
		border-radius: 12px;
		color: var(--theme-text, white);
		font-size: var(--font-size-sm, 14px);
		font-family: inherit;
	}

	.rule-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 0 12px 8px;
		flex-shrink: 0;
	}

	.rule-chip {
		display: inline-flex;
		align-items: center;
		padding: 4px 12px;
		min-height: 28px;
		background: color-mix(in srgb, var(--chip-color) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--chip-color) 30%, transparent);
		border-radius: 100px;
		color: var(--theme-text);
		font-size: var(--font-size-compact, 12px);
		font-weight: 500;
		white-space: nowrap;
	}

	.detail-body {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}
</style>
```

- [ ] **Step 2: Verify typecheck (capture once)**

Run: `npm run check:fast > /tmp/sc-check8.log 2>&1; grep -iE "SmartCollectionDetailView" /tmp/sc-check8.log || echo "CLEAN (smart-detail)"`
Expected: `CLEAN (smart-detail)`. (If `SmartCollectionBuilderSheet` is not yet created, this import errors — create Task 12's component first if executing out of order, or accept the single unresolved-import error until Task 12.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/features/browse/collections/components/SmartCollectionDetailView.svelte
git commit -m "feat(collections): SmartCollectionDetailView — live-derived members + rule chips

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- src/lib/features/browse/collections/components/SmartCollectionDetailView.svelte
```

---

## Task 9: Host branch + "New smart collection" tile

**Files:**
- Modify: `src/lib/features/browse/collections/components/MyCollectionsPanel.svelte`

Depends on Task 12's `SmartCollectionBuilderSheet` for the "New smart collection" tile. Build the branch now; wire the create sheet with a local flag (Task 12 adds the import + mount).

- [ ] **Step 1: Import `SmartCollectionDetailView`**

After the `CollectionDetailView` import (line 32), add:

```ts
	import SmartCollectionDetailView from "./SmartCollectionDetailView.svelte";
```

- [ ] **Step 2: Add a kind lookup + builder flag**

After the `collections` derived (after line 67), add:

```ts
	// Own smart collections render the live-derived view; everything else uses
	// the standard member grid. (Foreign collections are never smart in v1.)
	function isOwnSmart(id: string, ownerId: string | null): boolean {
		if (ownerId) return false;
		return collectionsState.collections.find((c) => c.id === id)?.kind === "smart";
	}

	// "New smart collection" opens the builder from scratch.
	let smartBuilderOpen = $state(false);
```

- [ ] **Step 3: Branch the split-view detail pane**

Replace the split-view detail block (lines 289-300) with:

```svelte
			{#if railSelection.id === "all" && !railSelection.ownerId}
				<AllLibraryView />
			{:else if isOwnSmart(railSelection.id, railSelection.ownerId)}
				<SmartCollectionDetailView
					collectionId={railSelection.id}
					onBack={backToList}
					showBack={false}
				/>
			{:else}
				<CollectionDetailView
					collectionId={railSelection.id}
					foreignOwnerId={railSelection.ownerId}
					ownerName={railSelection.ownerName}
					onBack={backToList}
					showBack={false}
				/>
			{/if}
```

- [ ] **Step 4: Branch the phone detail block**

Replace the phone detail block (lines 303-312) with:

```svelte
	{#if detail.id === "all" && !detail.ownerId}
		<AllLibraryView onBack={backToList} />
	{:else if isOwnSmart(detail.id, detail.ownerId)}
		<SmartCollectionDetailView collectionId={detail.id} onBack={backToList} />
	{:else}
		<CollectionDetailView
			collectionId={detail.id}
			foreignOwnerId={detail.ownerId}
			ownerName={detail.ownerName}
			onBack={backToList}
		/>
	{/if}
```

- [ ] **Step 5: Add the "New smart collection" tile**

In the `ownShelves` snippet, after the manual add-tile `{:else}...{/if}` block (after line 238), add a second tile:

```svelte
	<button type="button" class="add-tile smart" onclick={() => (smartBuilderOpen = true)}>
		<span class="add-icon">
			<i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
		</span>
		<span class="add-label">New smart collection</span>
	</button>
```

- [ ] **Step 6: Mount the builder sheet (added fully in Task 12)**

At the end of the template, after the final `{/if}` of the layout block (after line 349), add:

```svelte
{#if smartBuilderOpen}
	<SmartCollectionBuilderSheet mode="create" onClose={() => (smartBuilderOpen = false)} />
{/if}
```

And add its import after the `SmartCollectionDetailView` import:

```ts
	import SmartCollectionBuilderSheet from "./SmartCollectionBuilderSheet.svelte";
```

- [ ] **Step 7: Verify typecheck (capture once)**

Run: `npm run check:fast > /tmp/sc-check9.log 2>&1; grep -iE "MyCollectionsPanel" /tmp/sc-check9.log || echo "CLEAN (panel)"`
Expected: `CLEAN (panel)` (after Task 12 creates the builder; until then, one unresolved import).

- [ ] **Step 8: Commit**

```bash
git add src/lib/features/browse/collections/components/MyCollectionsPanel.svelte
git commit -m "feat(collections): route own smart collections to SmartCollectionDetailView + New smart tile

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- src/lib/features/browse/collections/components/MyCollectionsPanel.svelte
```

---

## Task 10: `SmartCollectionSaveDialog` (name prompt)

**Files:**
- Create: `src/lib/features/library/components/SmartCollectionSaveDialog.svelte`

- [ ] **Step 1: Create the component**

```svelte
<!--
SmartCollectionSaveDialog.svelte

Names and saves the CURRENT engine's active filters as a Smart Collection.
Given a live BrowseEngine, it snapshots {source, filters, sort} via
buildFilterSpecFromEngine on save. Reused by every browse host that offers a
"Save as Smart Collection" action (gallery = community pool, All library =
my-library pool).
-->
<script lang="ts">
	import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
	import DrawerHeader from "$lib/shared/foundation/ui/DrawerHeader.svelte";
	import type { BrowseEngine } from "$lib/shared/browse/engine/types";
	import { buildFilterSpecFromEngine } from "$lib/shared/browse/services/smart-filter-spec";
	import { collectionsState } from "$lib/features/library/state/collections-state.svelte";
	import { toast } from "$lib/shared/toast/state/toast-state.svelte";

	let {
		engine,
		show = $bindable(false),
	}: {
		engine: BrowseEngine;
		show?: boolean;
	} = $props();

	let name = $state("");
	let saving = $state(false);

	$effect(() => {
		// Reset the field each time the dialog opens.
		if (show) {
			name = "";
			saving = false;
		}
	});

	async function save() {
		const trimmed = name.trim();
		if (!trimmed || saving) return;
		saving = true;
		const spec = buildFilterSpecFromEngine(engine);
		const created = await collectionsState.createSmart(trimmed, spec);
		saving = false;
		if (created) {
			toast.success(`Smart collection "${created.name}" saved.`);
			show = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === "Enter") {
			e.preventDefault();
			void save();
		} else if (e.key === "Escape") {
			e.preventDefault();
			show = false;
		}
	}
</script>

<Drawer bind:isOpen={show} placement="bottom">
	<DrawerHeader title="Save as Smart Collection" onClose={() => (show = false)} />
	<div class="save-smart">
		<p class="hint">
			This saves your current filters as a rule. The collection stays up to
			date on its own — new matching sequences show up automatically.
		</p>
		<div class="row">
			<!-- svelte-ignore a11y_autofocus -->
			<input
				type="text"
				class="name-field"
				placeholder="Name this smart collection"
				aria-label="Smart collection name"
				bind:value={name}
				onkeydown={handleKeydown}
				maxlength="60"
				autofocus
			/>
			<button
				type="button"
				class="save-btn"
				onclick={save}
				disabled={!name.trim() || saving}
			>
				<i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
				<span>Save</span>
			</button>
		</div>
	</div>
</Drawer>

<style>
	.save-smart {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 16px;
		max-width: 520px;
		margin: 0 auto;
	}

	.hint {
		margin: 0;
		font-size: var(--font-size-sm, 14px);
		line-height: 1.5;
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
	}

	.row {
		display: flex;
		gap: 8px;
	}

	.name-field {
		flex: 1;
		min-width: 0;
		height: 44px;
		padding: 0 14px;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border: 1.5px solid color-mix(in srgb, var(--theme-accent) 45%, transparent);
		border-radius: 12px;
		color: var(--theme-text, white);
		font-size: var(--font-size-sm, 14px);
		font-family: inherit;
	}

	.name-field:focus {
		outline: none;
		border-color: color-mix(in srgb, var(--theme-accent) 70%, transparent);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-accent) 14%, transparent);
	}

	.save-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 44px;
		padding: 0 18px;
		flex-shrink: 0;
		border: 1px solid color-mix(in srgb, var(--theme-accent) 45%, transparent);
		border-radius: 12px;
		background: color-mix(in srgb, var(--theme-accent) 22%, transparent);
		color: var(--theme-text, white);
		font-size: var(--font-size-sm, 14px);
		font-weight: 600;
		cursor: pointer;
	}

	.save-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
```

- [ ] **Step 2: Verify typecheck (capture once)**

Run: `npm run check:fast > /tmp/sc-check10.log 2>&1; grep -iE "SmartCollectionSaveDialog" /tmp/sc-check10.log || echo "CLEAN (save-dialog)"`
Expected: `CLEAN (save-dialog)`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/features/library/components/SmartCollectionSaveDialog.svelte
git commit -m "feat(collections): SmartCollectionSaveDialog — name + save current filters as a rule

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- src/lib/features/library/components/SmartCollectionSaveDialog.svelte
```

---

## Task 11: Primary save wiring (filter bar → hosts)

**Files:**
- Modify: `src/lib/shared/browse/components/BrowseFilterBar.svelte`
- Modify: `src/lib/shared/browse/components/BrowsePanel.svelte`
- Modify: `src/lib/features/browse/shared/components/GalleryTab.svelte`
- Modify: `src/lib/features/browse/shared/components/BrowseModule.svelte`
- Modify: `src/lib/features/browse/collections/components/AllLibraryView.svelte`

- [ ] **Step 1: Add `onSaveSmart` to `BrowseFilterBar` Props**

Change the `Props` interface (lines 28-34) to add the callback, and destructure it (line 36):

```ts
  interface Props {
    engine: BrowseEngine;
    chipsOnly?: boolean;
    /** When provided AND filters are active, shows a "Save as Smart
     * Collection" action beside Clear all. Omitted by picker hosts. */
    onSaveSmart?: () => void;
  }

  let { engine, chipsOnly = false, onSaveSmart }: Props = $props();
```

- [ ] **Step 2: Render the Save button beside Clear all**

Immediately after the Clear-all `{#if}` block (after line 255, before the closing `</div>` of `.filter-chip-row`), add:

```svelte
    {#if onSaveSmart && engine.hasActiveFilters}
      <button
        class="save-smart-btn"
        type="button"
        onclick={(e) => {
          e.stopPropagation();
          onSaveSmart?.();
        }}
      >
        <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
        Save as Smart Collection
      </button>
    {/if}
```

Add the style next to `.clear-all-btn` (after line 394):

```css
  .save-smart-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px var(--spacing-md, 12px);
    min-height: 28px;
    background: color-mix(in srgb, var(--theme-accent) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--theme-accent) 40%, transparent);
    border-radius: 100px;
    color: var(--theme-text);
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .save-smart-btn:hover {
    background: color-mix(in srgb, var(--theme-accent) 24%, transparent);
  }
```

- [ ] **Step 3: Pass `onSaveSmart` through `BrowsePanel`**

Add to `BrowsePanel`'s `Props` interface (after `warming?: boolean;` at line 42):

```ts
    /** Passthrough to the filter bar's "Save as Smart Collection" action. */
    onSaveSmart?: () => void;
```

Destructure it (after `warming = false,` at line 60):

```ts
    onSaveSmart,
```

Pass it to `BrowseFilterBar` (line 240):

```svelte
  {#if showFilterBar}
    <BrowseFilterBar {engine} chipsOnly={!!onOpenFilters} {onSaveSmart} />
  {/if}
```

- [ ] **Step 4: Pass `onSaveSmart` through `GalleryTab`**

In `GalleryTab.svelte`, add `onSaveSmart?: () => void` to its `Props`/`$props()` destructure, and forward it on the `<BrowsePanel ... />` it renders (add `{onSaveSmart}` to that tag). (GalleryTab renders exactly one `<BrowsePanel>`; find it and add the attribute.)

- [ ] **Step 5: Wire the gallery host (`BrowseModule`)**

In `BrowseModule.svelte`:

Add the imports (near the other imports, after line 27):

```ts
  import SmartCollectionSaveDialog from "$lib/features/library/components/SmartCollectionSaveDialog.svelte";
```

Add state near the other `$state` declarations (e.g. after line 147):

```ts
  let smartSaveOpen = $state(false);
```

Where `GalleryTab` is rendered, add `onSaveSmart={() => (smartSaveOpen = true)}` to its attributes.

Add the dialog at the end of the template (top level of the component markup):

```svelte
<SmartCollectionSaveDialog {engine} bind:show={smartSaveOpen} />
```

- [ ] **Step 6: Wire the My-Library host (`AllLibraryView`)**

In `AllLibraryView.svelte` (which owns its own `createBrowseEngine` instance and renders a `<BrowsePanel>`):

Add the import:

```ts
	import SmartCollectionSaveDialog from "$lib/features/library/components/SmartCollectionSaveDialog.svelte";
```

Add state:

```ts
	let smartSaveOpen = $state(false);
```

Add `onSaveSmart={() => (smartSaveOpen = true)}` to its `<BrowsePanel>` (or to the `<GalleryFilterSheet>`/panel host as appropriate — the panel is the filter-bar owner), and mount the dialog with that view's engine variable:

```svelte
<SmartCollectionSaveDialog engine={/* this view's engine */} bind:show={smartSaveOpen} />
```

(Use whatever the local engine constant is named in `AllLibraryView`.)

- [ ] **Step 7: Full typecheck (capture once) + grep the touched files**

Run: `npm run check > /tmp/sc-check11.log 2>&1; grep -iE "BrowseFilterBar|BrowsePanel|GalleryTab|BrowseModule|AllLibraryView|SmartCollectionSaveDialog" /tmp/sc-check11.log || echo "CLEAN (wiring)"`
Expected: `CLEAN (wiring)`. Fix any errors in these files, then re-run once.

- [ ] **Step 8: Commit**

```bash
git add src/lib/shared/browse/components/BrowseFilterBar.svelte src/lib/shared/browse/components/BrowsePanel.svelte src/lib/features/browse/shared/components/GalleryTab.svelte src/lib/features/browse/shared/components/BrowseModule.svelte src/lib/features/browse/collections/components/AllLibraryView.svelte
git commit -m "feat(collections): Save as Smart Collection action wired through gallery + library

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- src/lib/shared/browse/components/BrowseFilterBar.svelte src/lib/shared/browse/components/BrowsePanel.svelte src/lib/features/browse/shared/components/GalleryTab.svelte src/lib/features/browse/shared/components/BrowseModule.svelte src/lib/features/browse/collections/components/AllLibraryView.svelte
```

---

## Task 12: `SmartCollectionBuilderSheet` (create-from-scratch + edit rule)

**Files:**
- Create: `src/lib/features/browse/collections/components/SmartCollectionBuilderSheet.svelte`

This is the secondary create path AND the Edit-rule surface (referenced by Tasks 8 and 9). It reuses the exact scaffold of `AddSequencesSheet` (Drawer + GalleryDrill + GalleryFilterSheet + BrowsePanel preview) — differing only in: no per-card selection, a source toggle, and a footer that names + saves a rule instead of toggling membership.

- [ ] **Step 1: Create the component**

```svelte
<!--
SmartCollectionBuilderSheet.svelte

Build (or edit) a Smart Collection's rule. Same drill → filter → preview
scaffold as AddSequencesSheet, but the preview grid is read-only and the
footer names + saves the rule (create) or updates it (edit). Reuses the shared
browse engine so every filter the gallery offers is available here for free.
-->
<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
	import { createBrowseEngine } from "$lib/shared/browse/engine/create-browse-engine.svelte";
	import BrowsePanel from "$lib/shared/browse/components/BrowsePanel.svelte";
	import GalleryDrill from "$lib/features/browse/gallery-home/GalleryDrill.svelte";
	import GalleryFilterSheet from "$lib/features/browse/gallery-home/GalleryFilterSheet.svelte";
	import { collectionsState } from "$lib/features/library/state/collections-state.svelte";
	import { browseScrollState } from "$lib/shared/browse/state/browse-scroll-state.svelte";
	import { responsiveLayoutManager } from "$lib/shared/create/services/responsive-layout-manager";
	import {
		applySpecToEngine,
		buildFilterSpecFromEngine,
	} from "$lib/shared/browse/services/smart-filter-spec";
	import type { SmartFilterSpec } from "$lib/shared/library/domain/models/collection";
	import { toast } from "$lib/shared/toast/state/toast-state.svelte";

	let {
		mode,
		editCollectionId,
		initialSpec,
		onClose,
	}: {
		mode: "create" | "edit";
		/** Required in edit mode: the collection whose rule is being changed. */
		editCollectionId?: string;
		/** Edit mode: seed the engine with the existing rule. */
		initialSpec?: SmartFilterSpec;
		onClose: () => void;
	} = $props();

	// Ephemeral engine — both sources available so the builder can target the
	// community pool or the user's own library.
	const engine = createBrowseEngine({
		persistKey: null,
		initialSource: initialSpec?.source ?? "community",
		minColumns: 2,
	});

	let drawerOpen = $state(false);
	let isSideBySide = $state(false);
	let layoutUnsubscribe: (() => void) | null = null;
	const placement = $derived(isSideBySide ? "right" : "bottom");

	let name = $state("");
	let saving = $state(false);

	onMount(() => {
		if (initialSpec) applySpecToEngine(engine, initialSpec);
		engine.initialize();

		isSideBySide = responsiveLayoutManager.shouldUseSideBySideLayout();
		layoutUnsubscribe = responsiveLayoutManager.onLayoutChange(() => {
			isSideBySide = responsiveLayoutManager.shouldUseSideBySideLayout();
		});

		browseScrollState.hideUI();
		requestAnimationFrame(() => (drawerOpen = true));

		return () => {
			engine.destroy();
			browseScrollState.showUI();
		};
	});

	onDestroy(() => layoutUnsubscribe?.());

	const CLOSE_ANIMATION_MS = 300;
	function requestClose() {
		if (!drawerOpen) return;
		drawerOpen = false;
		setTimeout(onClose, CLOSE_ANIMATION_MS);
	}

	// Two-stage flow like AddSequencesSheet: drill first, grid preview after.
	let view = $state<"drill" | "grid">(initialSpec ? "grid" : "drill");
	let filterSheetOpen = $state(false);

	function backToDrill() {
		engine.clearUserFilters();
		engine.setSearch("");
		view = "drill";
	}

	async function save() {
		const trimmed = name.trim();
		if (!engine.hasActiveFilters) {
			toast.error("Add at least one filter to define the rule.");
			return;
		}
		if (mode === "create" && !trimmed) {
			toast.error("Name your smart collection.");
			return;
		}
		if (saving) return;
		saving = true;
		const spec = buildFilterSpecFromEngine(engine);
		let ok = false;
		if (mode === "edit" && editCollectionId) {
			ok = await collectionsState.updateFilterSpec(editCollectionId, spec);
		} else {
			ok = !!(await collectionsState.createSmart(trimmed, spec));
		}
		saving = false;
		if (ok) {
			toast.success(mode === "edit" ? "Rule updated." : `Smart collection "${trimmed}" saved.`);
			requestClose();
		}
	}
</script>

<Drawer
	isOpen={drawerOpen}
	{placement}
	closeOnBackdrop={true}
	closeOnEscape={true}
	dismissible={true}
	showHandle={placement === "bottom"}
	ariaLabel={mode === "edit" ? "Edit rule" : "New smart collection"}
	class="smart-builder-drawer"
	onOpenChange={(open) => {
		if (!open) requestClose();
	}}
>
	<div class="sheet-content">
		<header class="panel-header">
			<div class="header-text">
				<h2 class="panel-title">
					{mode === "edit" ? "Edit rule" : "New smart collection"}
				</h2>
				<span class="panel-count">{engine.resultCount} match now</span>
			</div>
			{#if mode === "create"}
				<input
					type="text"
					class="name-field"
					placeholder="Name"
					aria-label="Smart collection name"
					bind:value={name}
					maxlength="60"
				/>
			{/if}
			<button
				type="button"
				class="save-btn"
				onclick={save}
				disabled={saving}
			>
				<i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
				<span>{mode === "edit" ? "Save rule" : "Save"}</span>
			</button>
		</header>

		<div class="panel-body">
			{#if view === "drill"}
				<div class="drill-host">
					<GalleryDrill
						pool={engine.allSequences}
						getCount={(type, value) => engine.getFilteredCount(type, value)}
						onApply={(type, value, label, color) => {
							engine.addFilter(type, value, label, color ?? "#6aa0ff");
							view = "grid";
						}}
						onShowAll={() => (view = "grid")}
						onSearch={(q) => {
							engine.setSearch(q);
							view = "grid";
						}}
					/>
				</div>
			{:else}
				<BrowsePanel
					{engine}
					layout="compact"
					showSourceToggle
					onBack={backToDrill}
					backLabel="Start here"
					hideToolbarSearch
					onOpenFilters={() => (filterSheetOpen = true)}
				/>
			{/if}
		</div>

		<GalleryFilterSheet
			{engine}
			bind:isOpen={filterSheetOpen}
			isMobile={placement === "bottom"}
		/>
	</div>
</Drawer>

<style>
	:global(.smart-builder-drawer[data-placement="bottom"]) {
		height: 92dvh;
		--sheet-max-height: 92dvh;
	}

	:global(.smart-builder-drawer[data-placement="right"]) {
		--sheet-width: min(760px, 94vw);
	}

	.sheet-content {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		overflow: hidden;
	}

	.panel-header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 16px 12px;
		border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		flex-shrink: 0;
	}

	.header-text {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}

	.panel-title {
		margin: 0;
		font-size: var(--font-size-lg, 18px);
		font-weight: 700;
		color: var(--theme-text, white);
		white-space: nowrap;
	}

	.panel-count {
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
		font-variant-numeric: tabular-nums;
	}

	.name-field {
		margin-left: auto;
		min-width: 0;
		max-width: 220px;
		height: 44px;
		padding: 0 14px;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
		border: 1.5px solid color-mix(in srgb, var(--theme-accent) 45%, transparent);
		border-radius: 12px;
		color: var(--theme-text, white);
		font-size: var(--font-size-sm, 14px);
		font-family: inherit;
	}

	.save-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 44px;
		padding: 0 18px;
		flex-shrink: 0;
		border: 1px solid color-mix(in srgb, var(--theme-accent) 45%, transparent);
		border-radius: 12px;
		background: color-mix(in srgb, var(--theme-accent) 22%, transparent);
		color: var(--theme-text, white);
		font-size: var(--font-size-sm, 14px);
		font-weight: 600;
		cursor: pointer;
	}

	/* When there's no name field (edit mode), the save button is the first
	   right-aligned control. */
	.panel-header > .save-btn:nth-child(2) {
		margin-left: auto;
	}

	.save-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.panel-body {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.panel-body > :global(*) {
		flex: 1;
		min-height: 0;
	}

	.drill-host {
		overflow-y: auto;
		padding: 12px;
	}
</style>
```

- [ ] **Step 2: Full typecheck (capture once)**

Run: `npm run check > /tmp/sc-check12.log 2>&1; grep -iE "SmartCollectionBuilderSheet|SmartCollectionDetailView|MyCollectionsPanel" /tmp/sc-check12.log || echo "CLEAN (builder)"`
Expected: `CLEAN (builder)`. This also resolves the deferred imports from Tasks 8 and 9.

- [ ] **Step 3: Commit**

```bash
git add src/lib/features/browse/collections/components/SmartCollectionBuilderSheet.svelte
git commit -m "feat(collections): SmartCollectionBuilderSheet — create-from-scratch + edit rule

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- src/lib/features/browse/collections/components/SmartCollectionBuilderSheet.svelte
```

---

## Task 13: Full verification pass

- [ ] **Step 1: Full typecheck (one cold run)**

Run: `npm run check > /tmp/sc-final.log 2>&1; grep -niE "error" /tmp/sc-final.log | grep -iE "smart|collection|browse-filter|browse-panel|gallery-tab|browse-module|all-library" || echo "NO SMART-RELATED ERRORS"`
Expected: `NO SMART-RELATED ERRORS`. (Pre-existing unrelated errors in the dirty tree — e.g. effects-panel — are out of scope; do not touch them.)

- [ ] **Step 2: Run the new unit tests**

Run: `npx vitest run tests/unit/library/smart-collection-model.test.ts tests/unit/browse/smart-filter-spec.test.ts`
Expected: PASS (5 tests total).

- [ ] **Step 3: Manual runtime verification (report, do not self-claim)**

The mechanism can't be fully proven without a browser. State to the user, with the dev route, exactly what to check:
1. Gallery: apply filters (e.g. Level 2 + a starting letter) → the filter bar shows **Save as Smart Collection** → click → name it → toast confirms.
2. Library: the new card shows the **wand + "Smart"** badge; opening it shows the rule chips + a live-derived grid.
3. Edit rule changes the members; the add-to-collection picker does NOT list the smart collection.

Link: [https://localhost:5173/browse](https://localhost:5173/browse)

---

## Self-review (completed against the spec)

- **Data model** (spec §Data model) → Task 1. Firestore nested-array hazard resolved via `StoredSmartFilter[]` object array (documented at top + Task 1 test asserts it).
- **Creation entry points** (spec §Components — primary + secondary) → primary Tasks 10–11 (filter bar → gallery + my-library hosts); secondary Task 12 (builder from rail).
- **Detail view branch** (spec §Detail view) → Tasks 8 (smart view) + 9 (host branch).
- **Auto-update** (spec §Auto-update) → Task 8 ephemeral engine re-derives per open; no stored membership.
- **Guardrails** (spec §Guardrails): picker exclusion (Task 6), member-op reject (Tasks 3 + 5), cap via `createSmart` (Task 5), ≥1 filter on save (Tasks 10 + 12). Deck-promotion guard and COLLECTION self-reference guard are NOT yet built — see "Deferred below".
- **Card visual** (spec §Card visual) → Task 7.
- **Testing** (spec §Testing) → Tasks 1, 4, 13.

### Deferred from v1 (tracked, not built here)

- **Deck promotion guard for smart collections** (spec Guardrail 4). Deck promotion lives in a separate deck-release surface not touched by this plan; when that surface is next edited, hide/guard promotion for `kind === "smart"`. No smart-collection code here exposes promotion, so nothing regresses in the interim.
- **COLLECTION-filter self-reference guard** (spec Guardrail 6). A smart rule can technically include the `COLLECTION` filter; guarding self-reference belongs in the builder's filter application. Low risk in v1 (the drill's Collections category is gated behind an `onOpenCollection` prop the builder doesn't pass, so a self-referencing collection filter isn't reachable from the builder UI). Add the explicit guard when the builder gains collection-filter entry.
- **Public/shared smart collections**, **computed filter types**, **my-library "Save" on other browse surfaces** — per spec Deferred section.
