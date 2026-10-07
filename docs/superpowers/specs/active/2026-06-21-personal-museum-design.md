---
status: active
value: 3
effort: S
remaining: 'Verify the mounted Task 11 assignment panel and Task 12 in-world picker locally. Then resolve the stale Tasks 11/12 comment; promote PRODUCTION_MODULES["personal-museum"] from false only through the applicable production-enable approval/release gate after acceptance proof.'
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: verification
---
# Personal Museum — Design Document

**Queue evidence (2026-10-07):** `PersonalMuseumModule.svelte` imports and mounts both Task 11 and Task 12 components (lines 30-31, 219-227), but `environment-features.ts:146` still disables the production module and calls them pending. This resolves the recorded implementation prerequisite, not the need for runtime acceptance proof or a production-flag decision.

> **DRIFT WARNING — 2026-08-02.** Entire data/service/state/component layer **and
> both hard rendering seams** built and tested (22 files under
> `src/lib/features/personal-museum/`, 3 test suites).
>
> **The ledger's "no `/my-museum` route, so unreachable" finding is REFUTED.**
> TKA is tab-based, not route-based, so the absence of a route means nothing.
> The module is fully wired: `module-definitions.ts:309` (`isMain: true`),
> the `ModuleRenderer.svelte:219` lazy-import map, and
> `ModuleRenderer.svelte:77` `KEEP_ALIVE_MODULES`. It is reachable in
> development today.
>
> The production gate remains:
> `environment-features.ts` → `PRODUCTION_MODULES["personal-museum"] = false`,
> with a stale *"WIP, Tasks 11/12 pending"* comment. Current source mounts
> both task components, so their runtime behavior needs verification before
> deciding whether to enable production access.
>
> Status lines below describe the original design approval. The 2026-07-25
> triage ledger is historical; the dated queue evidence above is current.


**Date:** 2026-06-21
**Status:** Implemented; local runtime verification and production-enable decision remain
**Original design status:** Approved
**Supersedes:** `docs/plans/archived/2026-02-20-web-museum-prototype-{design,impl}.md`
(the Realm-terrain approach; Realm dissolved, the tile-room museum shipped instead)

---

## Concept

A separate route — `/my-museum` — where a signed-in user walks a small 3D
gallery hung with their **own** sequences. Distinct from the official Kinetic
Archive museum (that stays authored, lore-driven, curated by Austen). This is a
lightweight, personal, museum-styled space that reuses the shipped walkable 3D
stack.

The recoverable kernel from the dead Web Museum Prototype plan was "a user
curates their own museum from sequences they like, others can visit." Everything
that plan needed for rendering now exists (tile-room museum). This spec targets
only the net-new: per-user curation + persistence, on a separate simplified
route.

---

## What already exists (reuse, do not rebuild)

| Need | Existing primitive | Path |
|---|---|---|
| 3D walk + kit walls + camera | `Museum3DScene`, kit GLB loader, `UnifiedCameraController` | `src/lib/features/museum/components/game/`, `museum-kit-glb.ts` |
| Framed sequence on a wall | `MuseumPlaque3D.svelte` (OffscreenCanvas pictograph + text texture) | `src/lib/features/museum/components/game/` |
| Grid build (graph → tiles → scene) | `museum-grid-builder.ts`, `museum-room-graph.ts` | `src/lib/features/museum/services/`, `.../data/` |
| Liked sequences | `system_favorites` collection (the like mechanism today) | `src/lib/shared/library/services/collection-manager.ts` |
| User's library sequences | `users/{uid}/sequences` (`LibrarySequence`) | `src/lib/shared/library/` |
| Firestore path + auth conventions | `firestore-paths.ts`, `getEffectiveUserId()` | `src/lib/shared/library/data/`, `src/lib/shared/auth/state/auth-state.svelte.ts` |
| Real-time subscription pattern | `onSnapshot()` map pattern | `collection-manager.ts:467` |
| In-world interaction | raycast "press E" prompt | museum 3D scene |

**New code is thin:** a personal room-graph (1 fixed room to start), a placement
schema + repository, one assignment panel, one in-world picker overlay, one
route. No new rendering engine.

---

## Data model — the shared substrate

Single Firestore doc per user:

```
users/{uid}/personal-museum/main
```

```typescript
interface PersonalMuseumDoc {
  ownerId: string;            // === uid; present day one so sharing is a later phase, not a migration
  isPublic: boolean;          // false in MVP; flips on when "others visit" ships
  updatedAt: Timestamp;
  placements: Record<SlotId, PersonalMuseumPlacement>;
}

interface PersonalMuseumPlacement {
  sequenceId: string;         // references users/{uid}/sequences/{id}
  assignedAt: number;
}

type SlotId = string;         // stable id of a wall exhibit slot in the personal room graph
```

Rationale for a single doc: 1 room ≈ 8–12 slots (expandable to ~3 rooms / a few
dozen slots) fits comfortably under the Firestore 1 MB doc limit and gives atomic
reads/writes + one `onSnapshot`. Promote to a subcollection only if a future
multi-room phase blows the budget.

New path helpers (add to `src/lib/shared/library/data/firestore-paths.ts`, matching
the existing pattern):

```typescript
export function getPersonalMuseumPath(userId: string): string {
  return `users/${userId}/personal-museum`;
}
export function getPersonalMuseumDocPath(userId: string): string {
  return `users/${userId}/personal-museum/main`;
}
```

---

## Curation — all three modes, one write path

All three entry points write the **same** `placements` map. They differ only in
UI surface.

1. **Auto-fill (default, zero curation).** Any slot with no explicit placement
   resolves, at render time, against the user's Favorites — newest-first, in slot
   order. A brand-new museum fills itself the moment the user favorites
   sequences. Auto-fill is a *derived* view, never written to Firestore.

2. **Manual assign panel (out-of-world).** A side panel lists the user's library
   / favorites; the user assigns a sequence to a chosen slot, swaps, or clears.
   Writes an explicit `PersonalMuseumPlacement` for that slot.

3. **In-world placement.** Walk to a wall frame, press E, pick a sequence from a
   picker overlay. Writes the same explicit placement for the raycast-targeted
   slot.

**Resolution rule:** explicit placement for a slot wins over auto-fill. Clearing
an explicit placement returns that slot to auto-fill. One reducer
(`resolveSlotSequence(slotId, placements, favoritesOrdered)`) is the single source
of truth, consumed by both the 3D scene and the panels.

---

## Rendering — "both" mode (revised 2026-06-21 after integration spike)

The spike (plan Task 7) found the original "framed pictographs on walls"
assumption did not match the engine: wall plaques are text-only
(`PlaqueContent = {title, subtitle, body, barter}`, drawn by
`plaque-texture-generator.ts:generateCanvas`), and sequences are visualized as
animated 3D performers (`MuseumPerformerStation3D` loops a `sequenceId`).

Decision (user, 2026-06-21): **both** — each curated slot shows an animated
performer of the sequence AND a framed pictograph on the wall plaque. Each
personal-museum **slot pairs** a performer station (`grid.performers[]`) with a
wall exhibit plaque (`grid.exhibits[]`) showing the sequence name + the
sequence's first-beat pictograph composited into the plaque texture.

Build path: personal room graph -> `buildMuseumGrid` -> override BOTH
`grid.performers[].sequenceId` and `grid.exhibits[].sequenceId`/`plaque` from
`resolveSlotSequence` -> `DimensionFlipProof`/`Museum3DScene`.

Two integration seams (both backward-compatible; official museum unchanged via
defaults):
- **Performer data injection** — optional `userSequenceData?: Map<string,
  SequenceData>` prop threaded `Museum3DScene` -> `MuseumPerformerStation3D`,
  checked before `MUSEUM_EXHIBIT_SEQUENCES` (the existing Firestore fallback
  resolves only public sequences, not private library docs).
- **Plaque pictograph** — pre-render the sequence's first step via
  `Canvas2DDirectRenderer.renderPictograph(step, {size, visibility})` ->
  `createImageBitmap`, pass the bitmap into an async plaque path that composites
  it into the plaque `OffscreenCanvas` alongside the text.

Start with **1 fixed room** (~8-12 paired slots); expandable to ~3 rooms later.

---

## Components / units

| Unit | Responsibility | Depends on |
|---|---|---|
| `personal-museum-room-graph.ts` (data) | 1-room (expandable) wall-segment graph with stable slot ids | room-graph types |
| `personal-museum-repository.ts` (service) | CRUD on the single doc; assign/clear/swap placement; `onSnapshot` subscribe | `firestore-paths`, `getEffectiveUserId` |
| `personal-museum-state.svelte.ts` (state) | reactive placements + favorites-ordered list; `resolveSlotSequence` reducer | repository, favorites reader |
| route `/my-museum` | mounts `MuseumModule`-style host pointed at the personal graph + state | museum components |
| `PersonalMuseumAssignPanel.svelte` | out-of-world list → slot assignment | state |
| `PersonalMuseumInWorldPicker.svelte` | raycast-slot picker overlay (E prompt) | existing raycast + state |

Each unit has one purpose, a clear interface, and is testable without the others
(`resolveSlotSequence` is a pure function; the repository is mockable behind its
interface).

---

## Error handling

- **Not signed in:** route shows a sign-in prompt (no anonymous personal museum
  in MVP). `getEffectiveUserId()` null → gate.
- **Placement references a deleted sequence:** `resolveSlotSequence` skips a
  `sequenceId` not present in the user's library, treating the slot as empty
  (then auto-fill may backfill). No crash, no broken plaque.
- **Firestore write failure:** surfaced via the existing repository error path;
  optimistic UI reverts on rejection.
- **Empty Favorites + no placements:** rooms render with empty frames
  (museum-styled placeholder), not an error.

---

## Testing

- **Unit:** `resolveSlotSequence` — explicit-wins, clear-returns-to-autofill,
  deleted-sequence-skip, favorites ordering, empty states. (Pure function → high
  value, eyes can't catch the resolution edge cases.)
- **Repository:** assign/clear/swap mutate the doc correctly; subscribe emits on
  change. (Against Firebase emulator or a mocked Firestore.)
- **Skip:** 3D rendering correctness (visual, verified by walking the route) —
  per project testing philosophy, don't unit-test what's obvious when broken.

---

## Scope

**MVP (this spec):**
- `/my-museum` route, gated to signed-in users
- 1 fixed room, ~8–12 exhibit slots
- All three curation modes on the shared placement schema
- Per-user persistence (single doc), auto-fill from Favorites

**Deferred (schema-ready, not built):**
- **Others visiting** a user's museum — needs a `publicPersonalMuseums`
  denormalized index + share via the existing shortcode (tka.run) system. The
  `isPublic` + `ownerId` fields exist from day one so this is additive.
- **Premium gating** — per the "play with everything, pay to take it home"
  philosophy; decide free-slot cap vs. Scribe-tier at that phase.
- **Multi-room expansion** (≤3 rooms) — add graph nodes/edges; builder already
  supports it.
- **Custom plaque text** per placement — add an optional `note` to
  `PersonalMuseumPlacement`.

---

## Decisions locked

1. **Separate route**, not a reskin of the official museum. The Kinetic Archive
   stays authored.
2. **Social visiting deferred** to a later phase; schema stays shareable.
3. **Start at 1 room**, prove the curation loop, then expand.
4. **Auto-fill is derived**, never persisted — keeps Favorites the single source
   of "liked," avoids a sync problem.
