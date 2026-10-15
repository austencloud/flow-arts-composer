# Personal Museum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `personal-museum` module — a separate, signed-in-only walkable 3D gallery where a user's own sequences hang on the walls, curated three ways (auto-fill from Favorites, a manual panel, in-world placement), persisted per user.

**Architecture:** A new feature module under `src/lib/features/personal-museum/`. It reuses the existing museum render path (`buildMuseumGrid` → `MuseumGrid` → `DimensionFlipProof`/`Museum3DScene`) by feeding it a small fixed personal room graph, then overriding each built exhibit's `sequenceId` with the result of a pure `resolveSlotSequence` reducer. Persistence is a single Firestore doc per user (`users/{uid}/personal-museum/main`). Auto-fill is derived at render time from the existing Favorites collection — never written.

**Tech Stack:** Svelte 5 runes, Threlte/Three.js (via existing museum components), Firebase Firestore, Vitest. Module registration via the app's `ModuleId` union + `ModuleRenderer` loader registry.

**Spec:** `docs/superpowers/specs/active/2026-06-21-personal-museum-design.md`

**Conventions used below:**
- Tests colocate at `src/lib/features/personal-museum/**/__tests__/<module>.test.ts` (matched by vitest `include`).
- Run one test file: `npm run test:ci -- <path-to-test>`
- Commit scope: every commit uses an explicit pathspec (`git commit -m "..." -- <files>`) per `.claude/rules/commit-only-your-own-changes.md`. The shared index may hold other agents' work.
- All work on `main` (no branches/worktrees — global rule).

---

### Task 1: Domain model + Firestore path helpers

**Files:**
- Create: `src/lib/features/personal-museum/domain/personal-museum-types.ts`
- Modify: `src/lib/shared/library/data/firestore-paths.ts` (append after line 102, the public-paths block)

- [ ] **Step 1: Create the domain types**

`src/lib/features/personal-museum/domain/personal-museum-types.ts`:

```typescript
/**
 * Personal Museum domain types.
 *
 * A single Firestore doc per user holds explicit wall placements. Slots with
 * no explicit placement are auto-filled at render time from the user's
 * Favorites (derived, never persisted) — see resolveSlotSequence.
 */

/** Stable id of a wall exhibit slot in the personal room graph (the ExhibitSegment.refId). */
export type SlotId = string;

export interface PersonalMuseumPlacement {
  /** References users/{uid}/sequences/{id}. */
  sequenceId: string;
  /** Epoch ms when assigned (for display/sort; not load-bearing). */
  assignedAt: number;
}

export interface PersonalMuseumDoc {
  /** === uid. Present day one so public sharing is additive later. */
  ownerId: string;
  /** false in MVP; flips when "others visit" ships. */
  isPublic: boolean;
  /** Firestore serverTimestamp on write; number (epoch ms) after read-back. */
  updatedAt: number;
  /** slotId -> explicit placement. Absent slot => auto-fill. */
  placements: Record<SlotId, PersonalMuseumPlacement>;
}

/** Factory for a fresh, empty personal museum doc. */
export function emptyPersonalMuseumDoc(ownerId: string, now: number): PersonalMuseumDoc {
  return { ownerId, isPublic: false, updatedAt: now, placements: {} };
}
```

- [ ] **Step 2: Add Firestore path helpers**

Append to `src/lib/shared/library/data/firestore-paths.ts` after line 102 (after `getPublicSequencePath`):

```typescript
// ============================================================================
// PERSONAL MUSEUM PATHS
// ============================================================================

/**
 * Path to a user's personal-museum collection.
 * @example "users/abc123/personal-museum"
 */
export function getPersonalMuseumPath(userId: string): string {
  return `users/${userId}/personal-museum`;
}

/**
 * Path to the single personal-museum doc for a user.
 * @example "users/abc123/personal-museum/main"
 */
export function getPersonalMuseumDocPath(userId: string): string {
  return `users/${userId}/personal-museum/main`;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/features/personal-museum/domain/personal-museum-types.ts src/lib/shared/library/data/firestore-paths.ts
git commit -m "feat(personal-museum): domain types + firestore path helpers" -- src/lib/features/personal-museum/domain/personal-museum-types.ts src/lib/shared/library/data/firestore-paths.ts
```

---

### Task 2: `resolveSlotSequence` pure reducer (the curation core)

This is the single source of truth shared by the 3D scene and the panels. Pure function → fully unit-tested.

**Files:**
- Create: `src/lib/features/personal-museum/domain/resolve-slot-sequence.ts`
- Test: `src/lib/features/personal-museum/domain/__tests__/resolve-slot-sequence.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/features/personal-museum/domain/__tests__/resolve-slot-sequence.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { resolveSlotSequence } from "../resolve-slot-sequence";
import type { PersonalMuseumPlacement } from "../personal-museum-types";

const p = (sequenceId: string): PersonalMuseumPlacement => ({ sequenceId, assignedAt: 0 });

describe("resolveSlotSequence", () => {
  const slots = ["s1", "s2", "s3"];

  it("uses an explicit placement when its sequence still exists", () => {
    const out = resolveSlotSequence(slots, { s2: p("seqB") }, [], new Set(["seqB"]));
    expect(out.s2).toBe("seqB");
  });

  it("auto-fills unassigned slots from favorites in slot order, newest-first", () => {
    const out = resolveSlotSequence(slots, {}, ["favA", "favB"], new Set(["favA", "favB"]));
    expect(out).toEqual({ s1: "favA", s2: "favB", s3: null });
  });

  it("explicit placements win over auto-fill and are not duplicated by favorites", () => {
    const out = resolveSlotSequence(
      slots,
      { s1: p("favB") },
      ["favA", "favB"],
      new Set(["favA", "favB"]),
    );
    // s1 explicitly favB; favB must not also auto-fill s2; favA fills next free slot.
    expect(out).toEqual({ s1: "favB", s2: "favA", s3: null });
  });

  it("treats a placement referencing a deleted sequence as empty, then auto-fills it", () => {
    const out = resolveSlotSequence(
      slots,
      { s1: p("ghost") },
      ["favA"],
      new Set(["favA"]), // 'ghost' not in available set
    );
    expect(out).toEqual({ s1: "favA", s2: null, s3: null });
  });

  it("returns null for every slot when there is nothing to show", () => {
    const out = resolveSlotSequence(slots, {}, [], new Set());
    expect(out).toEqual({ s1: null, s2: null, s3: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:ci -- src/lib/features/personal-museum/domain/__tests__/resolve-slot-sequence.test.ts`
Expected: FAIL — "Failed to resolve import" / `resolveSlotSequence is not a function`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/features/personal-museum/domain/resolve-slot-sequence.ts`:

```typescript
import type { PersonalMuseumPlacement, SlotId } from "./personal-museum-types";

/**
 * Resolve which sequence (if any) hangs in each wall slot.
 *
 * Rules:
 *  1. An explicit placement wins, but only if its sequence still exists.
 *  2. Slots without a (valid) explicit placement auto-fill from favorites,
 *     newest-first, in slot order.
 *  3. A sequence already placed explicitly is never also auto-filled.
 *  4. Anything left over is null (empty frame).
 *
 * Pure and deterministic — same inputs, same output.
 */
export function resolveSlotSequence(
  slotIds: SlotId[],
  placements: Record<SlotId, PersonalMuseumPlacement>,
  favoritesOrdered: string[],
  availableIds: ReadonlySet<string>,
): Record<SlotId, string | null> {
  const result: Record<SlotId, string | null> = {};
  const used = new Set<string>();
  const autoFillSlots: SlotId[] = [];

  // Pass 1: honor valid explicit placements.
  for (const slot of slotIds) {
    const placed = placements[slot];
    if (placed && availableIds.has(placed.sequenceId)) {
      result[slot] = placed.sequenceId;
      used.add(placed.sequenceId);
    } else {
      autoFillSlots.push(slot);
    }
  }

  // Pass 2: auto-fill remaining slots from favorites, skipping already-used.
  const queue = favoritesOrdered.filter((id) => availableIds.has(id) && !used.has(id));
  let qi = 0;
  for (const slot of autoFillSlots) {
    result[slot] = qi < queue.length ? queue[qi++] : null;
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:ci -- src/lib/features/personal-museum/domain/__tests__/resolve-slot-sequence.test.ts`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/personal-museum/domain/resolve-slot-sequence.ts src/lib/features/personal-museum/domain/__tests__/resolve-slot-sequence.test.ts
git commit -m "feat(personal-museum): resolveSlotSequence reducer + tests" -- src/lib/features/personal-museum/domain/resolve-slot-sequence.ts src/lib/features/personal-museum/domain/__tests__/resolve-slot-sequence.test.ts
```

---

### Task 3: Personal room graph (1 fixed room)

A small room authored exactly like `MUSEUM_ROOMS` entries. Slot ids are the `ExhibitSegment.refId` values — these become `SlotId`s. ~10 exhibit slots across four walls.

**Files:**
- Create: `src/lib/features/personal-museum/data/personal-museum-room-graph.ts`
- Test: `src/lib/features/personal-museum/data/__tests__/personal-museum-room-graph.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/features/personal-museum/data/__tests__/personal-museum-room-graph.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  PERSONAL_MUSEUM_ROOMS,
  PERSONAL_MUSEUM_EDGES,
  PERSONAL_MUSEUM_SLOT_IDS,
} from "../personal-museum-room-graph";

describe("personal museum room graph", () => {
  it("defines exactly one room and no edges (single-room MVP)", () => {
    expect(PERSONAL_MUSEUM_ROOMS).toHaveLength(1);
    expect(PERSONAL_MUSEUM_EDGES).toHaveLength(0);
  });

  it("exposes 8-12 exhibit slot ids, all unique", () => {
    const ids = PERSONAL_MUSEUM_SLOT_IDS;
    expect(ids.length).toBeGreaterThanOrEqual(8);
    expect(ids.length).toBeLessThanOrEqual(12);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("derives slot ids from the room's exhibit wall segments", () => {
    const room = PERSONAL_MUSEUM_ROOMS[0];
    const exhibitRefIds = Object.values(room.walls)
      .flatMap((w) => w.segments)
      .filter((s): s is Extract<typeof s, { type: "exhibit" }> => s.type === "exhibit")
      .map((s) => s.refId);
    expect([...PERSONAL_MUSEUM_SLOT_IDS].sort()).toEqual([...exhibitRefIds].sort());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:ci -- src/lib/features/personal-museum/data/__tests__/personal-museum-room-graph.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the room graph**

`src/lib/features/personal-museum/data/personal-museum-room-graph.ts`:

```typescript
/**
 * Personal Museum room graph — a single fixed gallery room.
 *
 * Authored like MUSEUM_ROOMS (src/lib/features/museum/data/museum-room-graph.ts).
 * Each "exhibit" wall segment's refId is a stable SlotId consumed by
 * resolveSlotSequence. Exactly one room, no edges, for the MVP.
 */

import type { RoomNode, RoomEdge, GridConfig } from "../../museum/domain/layout-types";
import type { WallDefinition } from "../../museum/domain/wall-segment-types";

const gallery: RoomNode = {
  id: "personal-gallery",
  name: "My Gallery",
  material: "marble",
  theme: "gallery",
  minInteriorWidth: 18,
  minInteriorHeight: 18,
  description: "Your personal gallery. The sequences you love, hung on the walls.",
  walls: {
    north: {
      segments: [
        { type: "gap", minTiles: 3 },
        { type: "exhibit", refId: "slot-n1", size: "standard", facing: "south" },
        { type: "gap", minTiles: 3 },
        { type: "exhibit", refId: "slot-n2", size: "standard", facing: "south" },
        { type: "gap", minTiles: 3 },
        { type: "exhibit", refId: "slot-n3", size: "standard", facing: "south" },
        { type: "gap", minTiles: 3 },
      ],
      minMargin: 2,
    },
    south: {
      segments: [
        { type: "gap", minTiles: 4 },
        { type: "exhibit", refId: "slot-s1", size: "standard", facing: "north" },
        { type: "gap", minTiles: 3 },
        { type: "exhibit", refId: "slot-s2", size: "standard", facing: "north" },
        { type: "gap", minTiles: 4 },
      ],
      minMargin: 2,
    } satisfies WallDefinition,
    east: {
      segments: [
        { type: "gap", minTiles: 3 },
        { type: "exhibit", refId: "slot-e1", size: "standard", facing: "west" },
        { type: "gap", minTiles: 3 },
        { type: "exhibit", refId: "slot-e2", size: "standard", facing: "west" },
        { type: "gap", minTiles: 3 },
      ],
      minMargin: 2,
    },
    west: {
      segments: [
        { type: "gap", minTiles: 3 },
        { type: "exhibit", refId: "slot-w1", size: "standard", facing: "east" },
        { type: "gap", minTiles: 3 },
        { type: "exhibit", refId: "slot-w2", size: "standard", facing: "east" },
        { type: "gap", minTiles: 3 },
      ],
      minMargin: 2,
    },
  },
  furniture: [
    { role: "bench", offsetX: 0, offsetY: 0, rotationY: 0 },
    { role: "plant", offsetX: -0.4, offsetY: -0.4 },
    { role: "plant", offsetX: 0.4, offsetY: 0.4 },
  ],
};

export const PERSONAL_MUSEUM_ROOMS: RoomNode[] = [gallery];
export const PERSONAL_MUSEUM_EDGES: RoomEdge[] = [];

/** Grid config mirrors the museum's defaults; tuned later if the room feels off. */
export const PERSONAL_MUSEUM_GRID_CONFIG: GridConfig = {
  cellWidth: 40,
  cellHeight: 40,
  padding: 4,
};

/** All exhibit slot ids, in wall+segment order (north, south, east, west). */
export const PERSONAL_MUSEUM_SLOT_IDS: string[] = (["north", "south", "east", "west"] as const)
  .flatMap((wall) => gallery.walls[wall].segments)
  .filter((s): s is Extract<typeof s, { type: "exhibit" }> => s.type === "exhibit")
  .map((s) => s.refId);
```

> Note: confirm `PERSONAL_MUSEUM_GRID_CONFIG` values against the real `GRID_CONFIG` exported near `MUSEUM_EDGES` in `src/lib/features/museum/data/museum-room-graph.ts`. If that file exports a `GRID_CONFIG`, import and reuse it instead of redeclaring — adjust this file and delete the local literal.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:ci -- src/lib/features/personal-museum/data/__tests__/personal-museum-room-graph.test.ts`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/personal-museum/data/personal-museum-room-graph.ts src/lib/features/personal-museum/data/__tests__/personal-museum-room-graph.test.ts
git commit -m "feat(personal-museum): single-room graph + slot ids" -- src/lib/features/personal-museum/data/personal-museum-room-graph.ts src/lib/features/personal-museum/data/__tests__/personal-museum-room-graph.test.ts
```

---

### Task 4: Personal museum repository (Firestore CRUD)

Mirrors the read/write/subscribe pattern in `collection-manager.ts`. One doc, simple mutations.

**Files:**
- Create: `src/lib/features/personal-museum/services/personal-museum-repository.ts`
- Test: `src/lib/features/personal-museum/services/__tests__/personal-museum-repository.test.ts`

- [ ] **Step 1: Write the failing test (pure mutation helpers)**

The Firestore I/O is thin; the testable logic is the placement mutations. Extract them as pure helpers and test those.

`src/lib/features/personal-museum/services/__tests__/personal-museum-repository.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { applyAssign, applyClear } from "../personal-museum-repository";
import { emptyPersonalMuseumDoc } from "../../domain/personal-museum-types";

describe("personal-museum placement mutations", () => {
  it("applyAssign sets a placement and bumps updatedAt", () => {
    const doc = emptyPersonalMuseumDoc("u1", 100);
    const next = applyAssign(doc, "slot-n1", "seqA", 200);
    expect(next.placements["slot-n1"]).toEqual({ sequenceId: "seqA", assignedAt: 200 });
    expect(next.updatedAt).toBe(200);
    // original untouched (no mutation)
    expect(doc.placements["slot-n1"]).toBeUndefined();
  });

  it("applyAssign overwrites an existing slot", () => {
    const doc = applyAssign(emptyPersonalMuseumDoc("u1", 0), "slot-n1", "seqA", 1);
    const next = applyAssign(doc, "slot-n1", "seqB", 2);
    expect(next.placements["slot-n1"].sequenceId).toBe("seqB");
  });

  it("applyClear removes a placement and bumps updatedAt", () => {
    const doc = applyAssign(emptyPersonalMuseumDoc("u1", 0), "slot-n1", "seqA", 1);
    const next = applyClear(doc, "slot-n1", 5);
    expect(next.placements["slot-n1"]).toBeUndefined();
    expect(next.updatedAt).toBe(5);
  });

  it("applyClear on an empty slot is a no-op clone", () => {
    const doc = emptyPersonalMuseumDoc("u1", 0);
    const next = applyClear(doc, "slot-z9", 5);
    expect(next.placements).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:ci -- src/lib/features/personal-museum/services/__tests__/personal-museum-repository.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the repository**

`src/lib/features/personal-museum/services/personal-museum-repository.ts`:

```typescript
/**
 * Personal Museum repository.
 *
 * One Firestore doc per user: users/{uid}/personal-museum/main.
 * Pure mutation helpers (applyAssign/applyClear) hold the logic and are unit
 * tested; the async methods wrap them with Firestore I/O following the
 * collection-manager.ts pattern.
 */

import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { getFirestoreInstance } from "$lib/shared/library/services/firestore-instance";
import { getPersonalMuseumDocPath } from "$lib/shared/library/data/firestore-paths";
import { getEffectiveUserId } from "$lib/shared/auth/state/auth-state.svelte";
import {
  emptyPersonalMuseumDoc,
  type PersonalMuseumDoc,
} from "../domain/personal-museum-types";

// ── Pure mutation helpers (unit tested) ──

export function applyAssign(
  docData: PersonalMuseumDoc,
  slotId: string,
  sequenceId: string,
  now: number,
): PersonalMuseumDoc {
  return {
    ...docData,
    updatedAt: now,
    placements: {
      ...docData.placements,
      [slotId]: { sequenceId, assignedAt: now },
    },
  };
}

export function applyClear(
  docData: PersonalMuseumDoc,
  slotId: string,
  now: number,
): PersonalMuseumDoc {
  const placements = { ...docData.placements };
  delete placements[slotId];
  return { ...docData, updatedAt: now, placements };
}

// ── Firestore I/O ──

function requireUserId(): string {
  const uid = getEffectiveUserId();
  if (!uid) throw new Error("personal-museum: not authenticated");
  return uid;
}

/** Read the user's doc, returning a fresh empty doc if none exists yet. */
export async function loadPersonalMuseum(): Promise<PersonalMuseumDoc> {
  const uid = requireUserId();
  const firestore = await getFirestoreInstance();
  const ref = doc(firestore, getPersonalMuseumDocPath(uid));
  const snap = await getDoc(ref);
  if (!snap.exists()) return emptyPersonalMuseumDoc(uid, Date.now());
  return snap.data() as PersonalMuseumDoc;
}

/** Persist the full doc (merge:false — the doc is small and we own it). */
async function writePersonalMuseum(docData: PersonalMuseumDoc): Promise<void> {
  const uid = requireUserId();
  const firestore = await getFirestoreInstance();
  const ref = doc(firestore, getPersonalMuseumDocPath(uid));
  await setDoc(ref, { ...docData, ownerId: uid, updatedAt: serverTimestamp() });
}

export async function assignPlacement(
  current: PersonalMuseumDoc,
  slotId: string,
  sequenceId: string,
): Promise<PersonalMuseumDoc> {
  const next = applyAssign(current, slotId, sequenceId, Date.now());
  await writePersonalMuseum(next);
  return next;
}

export async function clearPlacement(
  current: PersonalMuseumDoc,
  slotId: string,
): Promise<PersonalMuseumDoc> {
  const next = applyClear(current, slotId, Date.now());
  await writePersonalMuseum(next);
  return next;
}

/** Subscribe to live changes; returns an unsubscribe fn. */
export async function subscribePersonalMuseum(
  onChange: (docData: PersonalMuseumDoc) => void,
): Promise<() => void> {
  const uid = requireUserId();
  const firestore = await getFirestoreInstance();
  const ref = doc(firestore, getPersonalMuseumDocPath(uid));
  return onSnapshot(ref, (snap) => {
    onChange(snap.exists() ? (snap.data() as PersonalMuseumDoc) : emptyPersonalMuseumDoc(uid, Date.now()));
  });
}
```

> Note: confirm the exact import paths for `getFirestoreInstance` and `getEffectiveUserId` before running — grep:
> `grep -rn "export.*getFirestoreInstance" src/lib` and `grep -rn "export function getEffectiveUserId" src/lib/shared/auth`.
> Adjust the two import lines to the real paths. `getEffectiveUserId` is confirmed in `src/lib/shared/auth/state/auth-state.svelte.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:ci -- src/lib/features/personal-museum/services/__tests__/personal-museum-repository.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/personal-museum/services/personal-museum-repository.ts src/lib/features/personal-museum/services/__tests__/personal-museum-repository.test.ts
git commit -m "feat(personal-museum): firestore repository + pure mutation helpers" -- src/lib/features/personal-museum/services/personal-museum-repository.ts src/lib/features/personal-museum/services/__tests__/personal-museum-repository.test.ts
```

---

### Task 5: Reactive state factory

Holds the live doc, the favorites-ordered id list, the user's available-id set, and exposes the resolved slot→sequence map. Follows the project's `*.svelte.ts` factory + context pattern (see `state-management` skill).

**Files:**
- Create: `src/lib/features/personal-museum/state/personal-museum-state.svelte.ts`
- Test: `src/lib/features/personal-museum/state/__tests__/personal-museum-state.test.ts`

- [ ] **Step 1: Write the failing test (resolution wiring, repository mocked)**

`src/lib/features/personal-museum/state/__tests__/personal-museum-state.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../services/personal-museum-repository", () => ({
  loadPersonalMuseum: vi.fn(async () => ({
    ownerId: "u1",
    isPublic: false,
    updatedAt: 0,
    placements: { "slot-n1": { sequenceId: "seqX", assignedAt: 1 } },
  })),
  subscribePersonalMuseum: vi.fn(async () => () => {}),
  assignPlacement: vi.fn(),
  clearPlacement: vi.fn(),
}));

import { createPersonalMuseumState } from "../personal-museum-state.svelte";

describe("createPersonalMuseumState", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves explicit placement first, then auto-fills the rest from favorites", async () => {
    const state = createPersonalMuseumState({
      slotIds: ["slot-n1", "slot-n2", "slot-n3"],
    });
    state.setFavorites([
      { id: "seqX", updatedAt: 9 },
      { id: "favA", updatedAt: 8 },
    ]);
    await state.init();

    const resolved = state.resolvedSlots;
    expect(resolved["slot-n1"]).toBe("seqX"); // explicit
    expect(resolved["slot-n2"]).toBe("favA"); // auto-fill (seqX not duplicated)
    expect(resolved["slot-n3"]).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:ci -- src/lib/features/personal-museum/state/__tests__/personal-museum-state.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the state factory**

`src/lib/features/personal-museum/state/personal-museum-state.svelte.ts`:

```typescript
import { resolveSlotSequence } from "../domain/resolve-slot-sequence";
import {
  emptyPersonalMuseumDoc,
  type PersonalMuseumDoc,
  type SlotId,
} from "../domain/personal-museum-types";
import {
  loadPersonalMuseum,
  subscribePersonalMuseum,
  assignPlacement,
  clearPlacement,
} from "../services/personal-museum-repository";

/** Minimal shape we need from a favorited sequence: id + sort key. */
export interface FavoriteRef {
  id: string;
  updatedAt: number;
}

export interface PersonalMuseumStateOptions {
  slotIds: SlotId[];
}

export function createPersonalMuseumState(opts: PersonalMuseumStateOptions) {
  let docData = $state<PersonalMuseumDoc>(emptyPersonalMuseumDoc("", 0));
  let favorites = $state<FavoriteRef[]>([]);
  let unsubscribe: (() => void) | null = null;

  // newest-first favorite ids
  const favoritesOrdered = $derived(
    [...favorites].sort((a, b) => b.updatedAt - a.updatedAt).map((f) => f.id),
  );
  // every sequence the user owns that could legally hang (favorites are a subset of library;
  // for MVP availability == favorites + any explicitly placed id we can still see)
  const availableIds = $derived(
    new Set<string>([
      ...favorites.map((f) => f.id),
      ...Object.values(docData.placements).map((p) => p.sequenceId),
    ]),
  );

  const resolvedSlots = $derived(
    resolveSlotSequence(opts.slotIds, docData.placements, favoritesOrdered, availableIds),
  );

  return {
    get doc() { return docData; },
    get resolvedSlots() { return resolvedSlots; },
    get favoritesOrdered() { return favoritesOrdered; },

    setFavorites(refs: FavoriteRef[]) { favorites = refs; },

    async init() {
      docData = await loadPersonalMuseum();
      unsubscribe = await subscribePersonalMuseum((d) => { docData = d; });
    },

    async assign(slotId: SlotId, sequenceId: string) {
      docData = await assignPlacement(docData, slotId, sequenceId);
    },
    async clear(slotId: SlotId) {
      docData = await clearPlacement(docData, slotId);
    },

    dispose() { unsubscribe?.(); unsubscribe = null; },
  };
}

export type PersonalMuseumState = ReturnType<typeof createPersonalMuseumState>;
```

> Note: `availableIds` for MVP is favorites ∪ currently-placed ids. If you later want manual assignment from the *whole* library (not just favorites), feed the full library id set into `setFavorites`/a new setter — the reducer already handles it. Keep MVP scoped to favorites + placed.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:ci -- src/lib/features/personal-museum/state/__tests__/personal-museum-state.test.ts`
Expected: PASS (1 passed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/personal-museum/state/personal-museum-state.svelte.ts src/lib/features/personal-museum/state/__tests__/personal-museum-state.test.ts
git commit -m "feat(personal-museum): reactive state factory wiring the reducer" -- src/lib/features/personal-museum/state/personal-museum-state.svelte.ts src/lib/features/personal-museum/state/__tests__/personal-museum-state.test.ts
```

---

### Task 6: Grid builder with sequence override

Build the personal grid from the room graph, then override each `ExhibitDefinition.sequenceId` with the resolved slot map (the exhibit's `id`/`refId` is the `SlotId`).

**Files:**
- Create: `src/lib/features/personal-museum/services/build-personal-grid.ts`
- Test: `src/lib/features/personal-museum/services/__tests__/build-personal-grid.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/features/personal-museum/services/__tests__/build-personal-grid.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { applySequenceOverrides } from "../build-personal-grid";
import type { ExhibitDefinition } from "../../../museum/domain/museum-grid-types";

const ex = (id: string, sequenceId?: string): ExhibitDefinition => ({
  id, tileX: 0, tileY: 0, size: "standard", sequenceId,
});

describe("applySequenceOverrides", () => {
  it("sets sequenceId from the resolved map keyed by exhibit id", () => {
    const exhibits = [ex("slot-n1"), ex("slot-n2")];
    const out = applySequenceOverrides(exhibits, { "slot-n1": "seqA", "slot-n2": null });
    expect(out[0].sequenceId).toBe("seqA");
    expect(out[1].sequenceId).toBeUndefined(); // null => empty frame, no sequence
  });

  it("does not mutate the input exhibits", () => {
    const exhibits = [ex("slot-n1")];
    applySequenceOverrides(exhibits, { "slot-n1": "seqA" });
    expect(exhibits[0].sequenceId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:ci -- src/lib/features/personal-museum/services/__tests__/build-personal-grid.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the builder wrapper**

`src/lib/features/personal-museum/services/build-personal-grid.ts`:

```typescript
import { buildMuseumGrid } from "../../museum/services/museum-grid-builder";
import type { MuseumGrid, ExhibitDefinition } from "../../museum/domain/museum-grid-types";
import {
  PERSONAL_MUSEUM_ROOMS,
  PERSONAL_MUSEUM_EDGES,
  PERSONAL_MUSEUM_GRID_CONFIG,
} from "../data/personal-museum-room-graph";

/** Set each exhibit's sequenceId from the resolved slot map (exhibit.id === SlotId). */
export function applySequenceOverrides(
  exhibits: ExhibitDefinition[],
  resolved: Record<string, string | null>,
): ExhibitDefinition[] {
  return exhibits.map((ex) => {
    const seq = resolved[ex.id];
    return seq ? { ...ex, sequenceId: seq } : { ...ex, sequenceId: undefined };
  });
}

/** Build the personal grid and overlay the resolved sequences. */
export function buildPersonalGrid(resolved: Record<string, string | null>): MuseumGrid {
  const { grid } = buildMuseumGrid(
    PERSONAL_MUSEUM_ROOMS,
    PERSONAL_MUSEUM_EDGES,
    PERSONAL_MUSEUM_GRID_CONFIG,
  );
  return { ...grid, exhibits: applySequenceOverrides(grid.exhibits, resolved) };
}
```

> Note: confirm `buildMuseumGrid` returns `{ grid, validation }` (it does per `museum-grid-builder.ts:38`). If the result field is named differently, adjust the destructure.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:ci -- src/lib/features/personal-museum/services/__tests__/build-personal-grid.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/personal-museum/services/build-personal-grid.ts src/lib/features/personal-museum/services/__tests__/build-personal-grid.test.ts
git commit -m "feat(personal-museum): grid builder with resolved-sequence override" -- src/lib/features/personal-museum/services/build-personal-grid.ts src/lib/features/personal-museum/services/__tests__/build-personal-grid.test.ts
```

---

### Task 7: Verify how the 3D scene renders an exhibit's sequence (integration spike)

Before building the module host, confirm exactly how `Museum3DScene`/`DimensionFlipProof` turns an `ExhibitDefinition.sequenceId` into a rendered plaque pictograph, and where the sequence DATA comes from (the official museum uses `MUSEUM_EXHIBIT_SEQUENCES`). The personal museum must feed the user's `LibrarySequence` data into that same resolver.

**Files:**
- Read only (no code change): trace the seam.

- [ ] **Step 1: Trace the exhibit→pictograph path**

Run these and read the hits:

```bash
grep -rn "MUSEUM_EXHIBIT_SEQUENCES\|exhibit.sequenceId\|sequenceId" src/lib/features/museum/components/game/
grep -rn "getSequenceData\|sequenceData\|stepData\|PlaqueContent" src/lib/features/museum/components/game/MuseumPlaque3D.svelte
grep -rn "generator\|generatePlaque\|OffscreenCanvas" src/lib/features/museum/components/game/
```

- [ ] **Step 2: Write findings into the module host task**

Document, in a comment at the top of `PersonalMuseumModule.svelte` (Task 8), the exact prop/lookup the scene uses to resolve a sequenceId → plaque, and how user `LibrarySequence` data is supplied (e.g. a sequence-data map prop, a context, or a generator callback). If the scene reads a hardcoded `MUSEUM_EXHIBIT_SEQUENCES` map with no injection seam, add the smallest injection point: a prop on `DimensionFlipProof`/`Museum3DScene` that supplies a `Map<sequenceId, SequenceData>`; default it to the museum's existing map so the official museum is unchanged. Capture the chosen approach here:

```
EXHIBIT SEQUENCE RESOLUTION (fill in during spike):
  - Scene resolves sequenceId via: __________
  - User sequence data supplied through: __________
  - Injection seam added (if any): __________
```

- [ ] **Step 3: Commit findings (if a seam prop was added)**

If you added an injection prop to a museum component, commit just that change with its own message:

```bash
git commit -m "feat(museum): inject sequence-data map for reuse by personal museum" -- <changed museum files>
```

Otherwise no commit — proceed to Task 8.

---

### Task 8: Module host + registration

The `PersonalMuseumModule.svelte` mounts the build flow (mirroring `MuseumModule.svelte:173-192,356-368`), gates on auth, loads favorites, and feeds the resolved grid into the reused 3D scene. Register the module id + loader.

**Files:**
- Create: `src/lib/features/personal-museum/PersonalMuseumModule.svelte`
- Modify: `src/lib/shared/navigation/domain/types.ts` (add `"personal-museum"` to `ModuleId`, after `"museum"` ~line 71)
- Modify: `src/lib/shared/modules/ModuleRenderer.svelte` (add loader ~line 142-224; optionally add to `KEEP_ALIVE_MODULES` line 72)
- Modify: `src/lib/shared/navigation/config/module-definitions.ts` (add sidebar/nav entry — match the museum entry's shape)

- [ ] **Step 1: Register the module id**

In `src/lib/shared/navigation/domain/types.ts`, add to the `ModuleId` union after `"museum"`:

```typescript
  | "museum"
  | "personal-museum"
```

- [ ] **Step 2: Add the loader**

In `src/lib/shared/modules/ModuleRenderer.svelte` `moduleLoaders` (after the `museum:` line):

```typescript
    "personal-museum": () =>
      import("../../features/personal-museum/PersonalMuseumModule.svelte"),
```

And (3D is heavy) add to keep-alive at line 72:

```typescript
const KEEP_ALIVE_MODULES = ["museum", "personal-museum"];
```

- [ ] **Step 3: Add the nav/sidebar entry**

Open `src/lib/shared/navigation/config/module-definitions.ts`, find the `museum` entry, and add a sibling `personal-museum` entry copying its shape (id, label "My Museum", icon, group/order). Use the exact field names present on the museum entry — do not invent fields.

- [ ] **Step 4: Write the module host**

`src/lib/features/personal-museum/PersonalMuseumModule.svelte`:

```svelte
<script lang="ts">
  // EXHIBIT SEQUENCE RESOLUTION (from Task 7):
  //   - Scene resolves sequenceId via: <fill in>
  //   - User sequence data supplied through: <fill in>
  import { getEffectiveUserId } from "$lib/shared/auth/state/auth-state.svelte";
  import { getFavorites } from "$lib/shared/library/services/collection-manager";
  import { createPersonalMuseumState } from "./state/personal-museum-state.svelte";
  import { buildPersonalGrid } from "./services/build-personal-grid";
  import { PERSONAL_MUSEUM_SLOT_IDS } from "./data/personal-museum-room-graph";
  import PersonalMuseumAssignPanel from "./components/PersonalMuseumAssignPanel.svelte";
  import PersonalMuseumInWorldPicker from "./components/PersonalMuseumInWorldPicker.svelte";

  const uid = $derived(getEffectiveUserId());
  const state = createPersonalMuseumState({ slotIds: PERSONAL_MUSEUM_SLOT_IDS });

  let ready = $state(false);
  let visible = $state(true);

  $effect(() => {
    if (!uid) return;
    let alive = true;
    (async () => {
      // Favorites: LibrarySequence[] in updatedAt-desc order.
      const favs = await getFavorites();
      if (!alive) return;
      state.setFavorites(favs.map((f) => ({ id: f.id, updatedAt: f.updatedAt ?? 0 })));
      await state.init();
      ready = true;
    })();
    return () => { alive = false; state.dispose(); };
  });

  const grid = $derived(ready ? buildPersonalGrid(state.resolvedSlots) : null);
</script>

{#if !uid}
  <div class="gate">
    <p>Sign in to build your personal museum.</p>
  </div>
{:else if grid}
  {#await import("../museum/components/game/DimensionFlipProof.svelte") then { default: DimensionFlipProof }}
    <DimensionFlipProof {grid} {visible} startInFps={true} />
  {/await}
  <PersonalMuseumAssignPanel {state} slotIds={PERSONAL_MUSEUM_SLOT_IDS} />
  <PersonalMuseumInWorldPicker {state} />
{:else}
  <div class="loading">Loading your museum…</div>
{/if}

<style>
  .gate, .loading {
    display: grid;
    place-items: center;
    block-size: 100%;
    color: var(--color-text-secondary, #aaa);
  }
</style>
```

> Note: match the exact `DimensionFlipProof` props the official museum passes (`grid`, `visible`, `onAllLoaded`, `onLoadProgress`, `onBuildStage`, `startInFps`, `onWingChange`). Wire the callbacks you need; the museum host (`MuseumModule.svelte:356`) is the reference. Confirm `getFavorites` import path and that `LibrarySequence` has an `id` + `updatedAt` field (it does — `library-sequence.ts`).

- [ ] **Step 5: Verify it compiles + renders**

Run: `npm run check:fast`
Expected: no new type errors in `personal-museum/` or the modified shared files.

Then load the module in the running dev server (port 5173). Navigate to the new "My Museum" nav entry. Per verification rules, capture proof (DevTools screenshot or DOM query that the 3D canvas mounted) — do not claim it renders without evidence.

- [ ] **Step 6: Commit**

```bash
git add src/lib/features/personal-museum/PersonalMuseumModule.svelte src/lib/shared/navigation/domain/types.ts src/lib/shared/modules/ModuleRenderer.svelte src/lib/shared/navigation/config/module-definitions.ts
git commit -m "feat(personal-museum): module host + registration" -- src/lib/features/personal-museum/PersonalMuseumModule.svelte src/lib/shared/navigation/domain/types.ts src/lib/shared/modules/ModuleRenderer.svelte src/lib/shared/navigation/config/module-definitions.ts
```

---

### Task 9: Manual assignment panel

Out-of-world list: pick a slot, pick a favorited/library sequence, assign or clear. Reuses existing primitives — do NOT hand-roll buttons/chips (see `never-hand-roll.md`, `chip-primitives.md`, `no-checkboxes.md`).

**Files:**
- Create: `src/lib/features/personal-museum/components/PersonalMuseumAssignPanel.svelte`

- [ ] **Step 1: Discover existing primitives first**

```bash
grep -rn "SequenceData\|pictograph" src/lib/shared/pictograph/**/PictographRenderer* 2>/dev/null | head
grep -rln "FilterChipBase\|SegmentedControl" src/lib/shared/browse/components/filter-chips src/lib/shared/3d/components/controls
```

Use `PictographRenderer` for sequence thumbnails (per `feedback_reuse_pictograph_renderer`), `SegmentedControl`/`FilterChipBase` for any selection bar. Report which you'll reuse before writing.

- [ ] **Step 2: Write the panel**

Build a panel that:
- lists `PERSONAL_MUSEUM_SLOT_IDS`, showing the currently-resolved sequence per slot (`state.resolvedSlots[slot]`), distinguishing explicit (`state.doc.placements[slot]`) from auto-filled;
- lists `state.favoritesOrdered` as assignable thumbnails (render via `PictographRenderer`);
- on "assign": `await state.assign(slotId, sequenceId)`; on "clear": `await state.clear(slotId)`;
- uses `<button>` + toggle-indicator only (no `<input type="checkbox">`).

Keep it under ~150 lines; if it grows, split the slot-list and the sequence-picker into two child components. Match `styling` skill tokens (44px targets, container queries, transparent backgrounds).

- [ ] **Step 3: Verify no checkboxes / no hand-rolled chips**

```bash
grep -nE 'type="checkbox"|type=\{"checkbox"\}|class="chip"|class="pill"' src/lib/features/personal-museum/components/PersonalMuseumAssignPanel.svelte
```

Expected: no matches.

- [ ] **Step 4: Verify in browser + commit**

Run `npm run check:fast`; load the panel on :5173, assign a sequence to a slot, confirm it appears on the wall (the live `onSnapshot` updates `state.doc` → `resolvedSlots` → `grid`). Capture proof. Then:

```bash
git commit -m "feat(personal-museum): manual assignment panel" -- src/lib/features/personal-museum/components/PersonalMuseumAssignPanel.svelte
```

---

### Task 10: In-world picker overlay

Walk to a frame, press E, pick a sequence to hang there. Reuses the museum's existing raycast/"E" interaction (found in Task 7's scene trace).

**Files:**
- Create: `src/lib/features/personal-museum/components/PersonalMuseumInWorldPicker.svelte`

- [ ] **Step 1: Find the interaction event**

From Task 7, identify how the scene signals "player pressed E while looking at exhibit X" (a callback prop, a context event, or a store). Grep:

```bash
grep -rn "onInteract\|'KeyE'\|\"e\"\|raycast\|focusedExhibit\|interact" src/lib/features/museum/components/game/
```

- [ ] **Step 2: Write the overlay**

An overlay that:
- subscribes to the scene's "interact with slot X" signal (the exact seam from Step 1);
- opens a sequence picker (reuse the same picker child from Task 9 — extract it to `components/SequencePicker.svelte` if not already, DRY);
- on pick: `await state.assign(focusedSlotId, sequenceId)`; offers "clear" if the slot is explicitly placed;
- closes on Escape / selection.

If the scene exposes no per-exhibit interaction seam, add the minimal callback prop to `DimensionFlipProof`/`Museum3DScene` (`onExhibitInteract?: (refId: string) => void`), defaulted off so the official museum is unaffected, and commit that museum change separately (explicit pathspec).

- [ ] **Step 3: Verify + commit**

`npm run check:fast`; on :5173 walk to a frame, press E, assign a sequence, confirm it hangs. Capture proof.

```bash
git commit -m "feat(personal-museum): in-world placement picker" -- src/lib/features/personal-museum/components/PersonalMuseumInWorldPicker.svelte
```

---

### Task 11: Full gate check

- [ ] **Step 1: Run the full suite + type check**

```bash
npm run check > /tmp/pm-check.log 2>&1
grep -niE "error|personal-museum" /tmp/pm-check.log | head -40
npm run test:ci -- src/lib/features/personal-museum
```

Expected: check green (no new errors); all `personal-museum` unit tests pass.

- [ ] **Step 2: Manual UAT on :5173**

Verify the three curation modes against the live module, capturing evidence for each:
1. Favorite a sequence elsewhere → it appears in an empty slot (auto-fill).
2. Assign via panel → overrides that slot; clear → returns to auto-fill.
3. Walk + E in-world → assigns the targeted slot.

- [ ] **Step 3: Final commit (only if leftover changes are yours)**

```bash
git status --short
# commit only personal-museum / the shared seams you touched, explicit pathspec
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Separate `/my-museum` (as a module, not a route — corrected from spec after discovering the module-based SPA) → Task 8. ✅
- 1 fixed room, 8-12 slots → Task 3. ✅
- Single Firestore doc + placements → Tasks 1, 4. ✅
- Three curation modes on shared `resolveSlotSequence` → Tasks 2 (reducer), 5 (state), 9 (manual), 10 (in-world); auto-fill derived → Task 5. ✅
- Reuse Museum3DScene/kit/plaque/grid-builder → Tasks 6, 7, 8. ✅
- firestore-paths helpers → Task 1. ✅
- Deferred (social/premium/multi-room/custom plaque text) → not built, noted in spec. ✅

**Open seam (honest):** the exact sequenceId→plaque resolution inside the 3D scene is verified in Task 7 (integration spike) rather than assumed, because the official museum uses a pre-baked `MUSEUM_EXHIBIT_SEQUENCES` map and the injection point for user data must be confirmed against real code. Tasks 8/10 reference its concrete output. This is a verify-then-wire step, not a placeholder.

**Type consistency:** `SlotId`, `PersonalMuseumPlacement`, `PersonalMuseumDoc`, `resolveSlotSequence`, `applyAssign/applyClear`, `createPersonalMuseumState`, `buildPersonalGrid`, `applySequenceOverrides` names are used identically across tasks. `buildMuseumGrid(rooms, edges, config)` and `ExhibitDefinition` match the verified source signatures.

**Placeholder scan:** no TBD/TODO in code steps; every code step shows complete code. The three "Note:" callouts ask the implementer to confirm an import path / reuse an existing export against grep — these are verification guards, not missing content.

---

## REVISION 2026-06-21 — "both" mode (after Task 7 spike)

Task 7 (integration spike) ran and found the original rendering assumption wrong:
museum wall plaques are **text-only** and sequences are shown as **animated
performers**, not framed pictographs. User chose **both**: each slot shows an
animated performer AND a framed pictograph on its wall plaque. Tasks 1–6 (data +
logic: types, reducer, repository, state, room-graph scaffold, grid-override
helper) are unaffected — a slot is still a slot. Tasks 3 and 6 get reworked for
paired performer+exhibit slots; Tasks 8–13 below replace the old 8–11.

Confirmed seams (verbatim from spike):
- Grid builder maps `room.performers[]` → `grid.performers[]` with
  `id = placement.refId`, `sequenceId` from `ROOM_CONTENT` (undefined for us →
  we override), `autoPlay` default false (`museum-grid-builder.ts:236-260`).
- `PerformerPlacement = { offsetX, offsetY, facing, refId }`
  (`layout-types.ts:17`).
- Performer sequence resolution: `MuseumPerformerStation3D.svelte:91-118` does
  `MUSEUM_EXHIBIT_SEQUENCES[id] ?? getBrowseLoader().loadFullSequenceData(id)`.
  The browse loader resolves public sequences only → private library sequences
  need injection.
- Plaque text built at `museum-geometry-builder.ts:333-357` from
  `exhibitDef.plaque`; rendered by `plaque-texture-generator.ts:generateCanvas`
  (sync, text-only). Pictograph path:
  `Canvas2DDirectRenderer.renderPictograph(step, {size, visibility})` (async) →
  `createImageBitmap` → `ctx.drawImage` onto the plaque canvas.

### Task R3: Rework personal room graph — paired slots

**Files:** Modify `src/lib/features/personal-museum/data/personal-museum-room-graph.ts` + its test.

- [ ] Reduce to **6 paired slots** (`slot-1`..`slot-6`) to avoid crowding 6
  performers in one room. For EACH slot id, add BOTH:
  - a wall `exhibit` segment with `refId: "slot-N"` (distribute across walls), and
  - a `performers` entry on the `RoomNode` `{ offsetX, offsetY, facing, refId: "slot-N" }`
    with distinct offsets spread around room center (e.g. a 2×3 grid of offsets
    in [-0.35, 0.35]). Add `minInteriorWidth/Height` large enough (~22) for 6
    performers + walkways.
- [ ] Update `PERSONAL_MUSEUM_SLOT_IDS` to derive from the exhibit segments
  (now 6) — keep the existing derivation; the test's 8–12 bound becomes
  `>= 6 && <= 12`. Add an assertion that every slot id has a matching performer
  `refId` (exhibit/performer pairing invariant).
- [ ] Tests pass (`npm run test:ci -- .../personal-museum-room-graph.test.ts`),
  `npx tsc --noEmit -p tsconfig.json 2>&1 | grep personal-museum` clean. Commit
  (explicit pathspec) `feat(personal-museum): pair performer+exhibit slots`.

### Task R6: Rework build-personal-grid — override performers + exhibits

**Files:** Modify `src/lib/features/personal-museum/services/build-personal-grid.ts` + test.

- [ ] Add `applyPerformerOverrides(performers, resolved)`: for each
  `PerformerDefinition`, set `sequenceId = resolved[p.id] ?? undefined` and
  `autoPlay = resolved[p.id] ? true : false` (immutable map, no input mutation).
- [ ] Extend `applySequenceOverrides` for exhibits to ALSO set the plaque title:
  accept a `slotMeta: Record<string, { name: string }>` and set
  `plaque = resolved[ex.id] ? { title: slotMeta[ex.id]?.name ?? ex.id, body: "" } : ex.plaque`.
- [ ] `buildPersonalGrid(resolved, slotMeta)` returns the grid with BOTH
  `exhibits` and `performers` overridden.
- [ ] Add tests for `applyPerformerOverrides` (sets sequenceId + autoPlay true on
  placed, undefined/false on empty; no mutation). Tests pass, tsc clean, commit
  `feat(personal-museum): override performers + plaque titles in personal grid`.

### Task 8: Performer data injection seam (museum components, backward-compatible)

**Files:** Modify `src/lib/features/museum/components/game/Museum3DScene.svelte`,
`MuseumPerformerStation3D.svelte`, and the `DimensionFlipProof.svelte` pass-through.

- [ ] Add optional prop `userSequenceData?: Map<string, SequenceData>` to
  `Museum3DScene` Props (default undefined) and thread it through
  `DimensionFlipProof` to each `<MuseumPerformerStation3D>` as
  `userSequenceDataMap={...}`.
- [ ] In `MuseumPerformerStation3D.svelte` add the same optional prop and change
  the resolve line (~96) to
  `props.userSequenceDataMap?.get(id) ?? MUSEUM_EXHIBIT_SEQUENCES[id] ?? null`,
  and when that hits, `buildSequenceData`/`loadSequence` as today. Official
  museum passes nothing → identical behavior.
- [ ] Verify the official museum still renders (load :5173 museum, capture proof
  per verification rules). `npx tsc ... | grep -E "museum"` no NEW errors.
- [ ] Commit each museum file change with explicit pathspec,
  `feat(museum): optional userSequenceData injection for reuse`.

### Task 9: Plaque pictograph compositing

**Files:** Create `src/lib/features/personal-museum/services/plaque-pictograph.ts`;
modify `plaque-texture-generator.ts` to accept an optional pre-rendered bitmap.

- [ ] `plaque-pictograph.ts`: `async renderFirstStepBitmap(sequence: SequenceData):
  Promise<ImageBitmap | null>` — take `sequence.steps[0]` (guard empty), call
  `Canvas2DDirectRenderer.renderPictograph(step, { size: 256, visibility: {...} })`,
  `createImageBitmap(canvas)`. Reuse the existing `canvas2DDirectRenderer`
  singleton (grep its export). Do NOT hand-roll pictograph SVG.
- [ ] Extend `generateCanvas(content, size, cacheKey?, pictograph?: ImageBitmap)`
  — when `pictograph` provided, `ctx.drawImage` it into a reserved region of the
  plaque (above the body text). Keep the existing text-only path unchanged when
  omitted (default undefined → official museum identical).
- [ ] Thread the bitmap from the personal grid to `MuseumPlaque3D`'s `generator`
  call: simplest seam is a `Map<refId, ImageBitmap>` the personal host supplies
  and the plaque render reads by `refId`. Confirm the exact wiring against
  `Museum3DScene.svelte:1155` (the `generator={generatePlaqueCanvas}` site) and
  add a per-refId bitmap lookup, default empty (official museum draws no
  pictograph).
- [ ] Verify on :5173: a personal plaque shows a pictograph; an official plaque
  does not. Capture proof. tsc clean. Commit with explicit pathspecs.

### Task 10: Module host + registration

**Files:** Create `src/lib/features/personal-museum/PersonalMuseumModule.svelte`;
modify `src/lib/shared/navigation/domain/types.ts` (add `"personal-museum"` to
`ModuleId`), `src/lib/shared/modules/ModuleRenderer.svelte` (loader +
`KEEP_ALIVE_MODULES`), `src/lib/shared/navigation/config/module-definitions.ts`
(nav entry, label "My Museum", copy the museum entry's shape).

- [ ] Host flow (gate on `getEffectiveUserId()`; if null, sign-in prompt):
  1. `const favs = await getFavorites()` (LibrarySequence[], updatedAt desc);
     `state.setFavorites(favs.map(f => ({ id: f.id, updatedAt: f.updatedAt ?? 0 })))`;
     `await state.init()`.
  2. For each resolved sequenceId, fetch full `SequenceData` from the user's
     library (`libraryRepository.getSequence(id)` — grep its singleton export),
     building: `userSequenceData: Map<id, SequenceData>`, `slotMeta: Record<slotId,
     {name}>` (name = derived word / sequence.name), and `pictographBitmaps:
     Map<refId, ImageBitmap>` via `renderFirstStepBitmap`.
  3. `grid = buildPersonalGrid(state.resolvedSlots, slotMeta)`.
  4. Mount `DimensionFlipProof` with `{grid}`, `startInFps`, `userSequenceData`,
     and the pictograph bitmap map; render `PersonalMuseumAssignPanel` +
     `PersonalMuseumInWorldPicker`.
- [ ] Register module (3 edits above). Add to `KEEP_ALIVE_MODULES` (heavy 3D).
- [ ] `npm run check:fast`; load "My Museum" on :5173, confirm the 3D canvas
  mounts with a performer + a pictograph plaque. Capture proof. Commit each file
  with explicit pathspec.

### Task 11: Manual assignment panel

(unchanged from the original Task 9 — reuse `PictographRenderer` for thumbnails,
`SegmentedControl`/`FilterChipBase` for any bar, `<button>`+toggle only, no
checkboxes/raw chips; grep-verify the diff. `state.assign/clear`. Live
`onSnapshot` updates the grid.) Commit `feat(personal-museum): manual assignment
panel`.

### Task 12: In-world picker overlay

(unchanged from the original Task 10 — subscribe to the scene's focused-exhibit /
"E" interaction seam: `DimensionFlipProof.svelte:343-368` sets `focusedExhibit`
and `focusedPerformer` on E. Expose it to the personal host via the minimal
prop/callback if not already; open the shared sequence picker; `state.assign`.)
Commit `feat(personal-museum): in-world placement picker`.

### Task 13: Full gate check

Run `npm run check` once into a log; `npm run test:ci -- src/lib/features/personal-museum`;
manual UAT of all three curation modes + both renderings (performer animates,
plaque shows name + pictograph) on :5173 with evidence per task. Final commit of
any remaining own changes (explicit pathspec).
