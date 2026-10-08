---
status: backlog
value: 2
effort: M
remaining: Current source has no cover-pool baker, poolKeysForProduct, or loop-cover-pool module; implement the baker and draw/shuffle storage flow.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: ready
---

# LOOP Cover Pool — pre-rendered draw-and-shuffle illusion

**Date:** 2026-07-14
**Status:** Design (approved in brainstorm; pending spec review)
**Branch:** `shop-perf-refan`

## Goal

Make the LOOP configurator fan feel like it endlessly generates fresh decks,
while actually serving instant pre-rendered card fronts drawn at random from a
baked pool. A buyer changing difficulty (or, later, dials) sees a new hand dealt
every time — never a spinner, never a shimmer, never a repeat within a session.

## Non-goals / scope guards

- **Preview illusion ONLY.** The pool feeds the fan's display. It is NOT the
  print source: fulfillment still generates the real 54-card deck at print time.
  No coupling to the order doc, no `sequenceIds` persistence, no
  confirm-what-you-see contract. (That is a separate roadmap item —
  `project_shop_preview_phase`.)
- **No schema change to `orders`.** This is cosmetic product data.
- **The Deck Architect custom space is out of scope** for v1. It keeps the live
  `loopPreviewCards` path. The pool covers the 3 packs + the variety hand. The
  pool service is written so the Architect can adopt it later without a rewrite.

## Decisions (from brainstorm 2026-07-14)

| Decision | Choice |
|---|---|
| Pool purpose | Preview illusion only |
| Pool size per key | **40** sequences (trimmed from 60; fresh-draw-of-6 keeps it endless-feeling) |
| Prop coverage | **All 5** shop props (staff, club, fan, triad, buugeng) |
| Draw trigger | Reshuffle on every pack/dial change |
| Reshuffle feel | Fresh every time (re-selecting a pack re-draws) |
| Storage target | Firebase Storage (reuse `cover-baker.ts`) |

## Architecture

Four units, each with one responsibility:

1. **Pool key** — pure function. `(flavor, level, stepCount) → poolKey` string.
   The same triple that already decides a hand in `loop-preview-cards.ts`.
2. **Bake pass** (`cover-pool-baker.ts`) — admin-triggered. Enumerates the
   product's pool keys, samples 40 real sequences per key, renders each front ×
   5 props through the existing `renderCoverFront`, uploads PNGs to Storage,
   writes a manifest doc per key.
3. **Manifest data** (`cover-pools` Firestore collection) — one doc per pool
   key holding the 40 baked entries and their per-prop URLs. Public-readable.
4. **Draw service** (`loop-cover-pool.ts`) — client. Loads the manifest(s) for
   the current selection, draws 6 at random, reshuffles on change. Returns
   `CoverCard[]` with `propImageUrls` populated so `DeckFanCover` serves the
   baked fast path.

### Data flow

```
ADMIN BAKE (one-click, resumable)
  poolKeys(product)                       # which (flavor,level,steps) to fill
    → for each key: sample 40 sequences   # catalog page @ L1, live-gen @ L2+
      → for each prop (×5):
          renderCoverFront(card, {prop})  # existing pipeline, admin browser
          → upload shop-pool/{key}/{i}-{prop}.png (immutable)
      → write cover-pools/{key} manifest doc

RUNTIME (public, signed-out)
  select pack / change dial
    → loopCoverPool.draw(keys, 6)         # random, reshuffle each change
      → CoverCard[] { sequence?, propImageUrls }
        → DeckFanCover → bakedCoverUrl(prop) → <img>   # instant, no pipeline
```

## Detail

### Pool key + key set

`poolKey(flavor, level, steps)` → e.g. `"rotated|1|8"`. Deterministic, prop-
independent (the prop is a dimension inside the manifest, not the key), so one
manifest doc serves all 5 props.

The **key set** for a product is derived, not hand-listed:
- Each pack's `previewHand` slice contributes its `(flavor, level, steps)`.
- The 7-flavor `VARIETY_POOL` at the levels the variety fan uses (L1, plus the
  L2 rotated "bite") contributes its keys.
- De-duplicated. Expected ~15–20 distinct keys.

A `poolKeysForProduct(...)` pure function returns this set — the bake and the
draw service share it, so they can never drift out of sync.

### Bake pass — `services/cover-pool-baker.ts`

Mirrors `cover-baker.ts` structure (prop-outer loop so the composition worker
seeds once per prop; sequential renders inside; progress callback; skip already-
baked). Differences:
- Source sequences per key: `loadCatalogSequencesPage(catalogId, 40)` when an
  exact catalog exists (L1), else `generateHand(dials, 40)` (reuse
  `loop-preview-cards.ts`' live generator, extracted to a shared export).
- Storage path: `shop-pool/{poolKey}/{index}-{prop}.png` (poolKey is filename-
  safe: `|` → `_`). Immutable `cache-control`.
- Writes `cover-pools/{poolKey}` manifest instead of mutating a product doc.
- Resumable: an entry with all 5 prop URLs present is skipped.

Admin surface: a `BakePoolButton.svelte` beside the existing `BakeCoversButton`
on `/shop` (admin-only), same progress chrome. Reuses `countUnbaked`-style
counting against the manifest.

### Manifest doc shape (`cover-pools/{poolKey}`)

```ts
interface CoverPoolEntry {
  sequenceId: string;
  word: string;
  accentColor?: string;      // carried from the flavor SKU cover for frame identity
  darkComplement?: string;
  tintOpacity?: number;
  footerCenter?: string;
  propImageUrls: Partial<Record<PropType, string>>;  // staff…buugeng
}
interface CoverPoolDoc {
  key: string;               // "rotated|1|8"
  flavor: string;
  level: number;
  steps: number;
  entries: CoverPoolEntry[]; // ≤ 40
  bakedAt: number;
}
```

~40 entries × 5 URLs ≈ 36 KB — well under Firestore's 1 MB doc cap (product
docs would exceed it at pool scale, which is why the pool is its own
collection). Public read via a `cover-pools` rules match (same posture as
`products`).

### Draw service — `services/loop-cover-pool.ts`

```ts
// Loads + session-caches manifest docs; draws a random hand, reshuffling each
// call. Returns null on any miss so the caller falls back to live generation.
loadPool(key): Promise<CoverPoolDoc | null>          // cached per key
drawHand(keys: string[], n: number): Promise<CoverCard[] | null>
```

- `drawHand` loads the needed manifests, flattens their entries, draws `n`
  distinct at random (Fisher–Yates over indices), maps each to a `CoverCard`
  with `propImageUrls`. Fresh randomness every call → reshuffle-on-change.
- Session cache keyed by pool key (the manifest, not the draw) so re-draws are
  network-free.
- Randomness note: `Math.random` is fine here (cosmetic shuffle, not the
  workflow-script constraint).

### Integration into the configurator

In `LoopDeckConfiguratorPage.svelte`, the existing preview `$effect` gains a
pool-first branch:

1. Compute the pool keys for the current selection (pack recipe or variety).
2. `loopCoverPool.drawHand(keys, FAN_SIZE)`.
3. On a hit → set `previewCards`, bump `settledFanKey` (the deal still fires;
   now it deals baked cards → instant + clean).
4. On `null` → the existing `loopPreviewCards(...)` live path, unchanged.

The Tier-1 module cache in `DeckFanCover` already makes re-deals flicker-free;
with baked URLs the very first deal of every selection is also instant.

### Error handling

- Manifest load failure / signed-out Firestore denial → `drawHand` returns
  `null` → live fallback. Never blocks the fan.
- Bake render failure for one (card, prop) → recorded in progress errors, entry
  written without that prop URL; `bakedCoverUrl` falls back to live for that
  prop only.
- Missing pool key (new flavor added, not yet baked) → `null` → live fallback.

### Testing

- **Unit — `poolKey` / `poolKeysForProduct`:** deterministic key strings; key
  set derived from a fixture pack + variety pool matches expected de-duped set.
- **Unit — `drawHand`:** given a stub manifest of 40 entries, returns 6 distinct
  `CoverCard`s with `propImageUrls`; two successive calls differ (reshuffle);
  returns `null` when a key is missing.
- **Unit — filename safety:** `poolKey` → storage segment round-trips, no `/`.
- **Manual (admin):** run the pool bake on staging, confirm manifests written,
  confirm the fan serves `<img>` (no pipeline) via DevTools network (PNG from
  `shop-pool/`, not a canvas).

## Cost

40 × ~18 keys × 5 props ≈ **3,600 PNGs, ~0.9–1.4 GB** Firebase Storage. One
admin bake pass ~15–30 min (3-lane throttle). Immutable + CDN-cached after, so
runtime egress is one cold fetch per image then edge hits. Tunable: pool size
and key set are both single constants.

## Open follow-ups (not v1)

- Deck Architect adopting `loopCoverPool` for its custom space (bigger key set,
  or on-the-fly live gen + async bake).
- Re-point uploads to R2 if egress cost warrants (bake writes through one
  `uploadCover(path, blob)` seam to make this a one-file change).
- Tap-a-card-to-regenerate and a shuffle button (deferred draw triggers).
