# Guide example pools

One `<page>.pool.json` per guide page that has refreshable example pools -
`permutations.pool.json` is the pilot (Mirrored / Rotated / Swapped slots).
Every pool JSON is a **verbatim copy** of a curated slate that lives with a
spec:

- Pilot data: `docs/superpowers/specs/2026-07-16-guide-example-pools-pilot-data.json`
- Parent design + lifecycle: `docs/superpowers/specs/2026-07-16-guide-example-pools-design.md`
- Full rollout (every page, the adapter factory, wave plan): `docs/superpowers/specs/2026-07-16-guide-example-pools-rollout.md`

## Schema (same for every page)

Top level: `createdAt`, `page`, `note`, `generationDefaults` (`constraintPreset`,
`level`, `gridMode`, `tool`), `slots`. `slots` is keyed by a slot id chosen per
page (e.g. `mirrored`, `bblf`, `type2-alpha-gamma`); each slot has a
`defaultEntry` (describes entry 0, which lives in the page's `.content.ts` file,
not here) and `candidates[]`. Each candidate: `word`, `loopType`, optional
`period`, optional `label` (explicit display label, for compound
classifications like "Swapped & Mirrored" that can't be derived from
`loopType`/`period` alone), `prose`, `verified[]`, `steps[]`.

Each candidate's steps use `step` keys (nomenclature: a **step** is one
pictograph in a sequence - never "beat"). Step data is captured verbatim from
MCP `generate_sequence` responses; prose is verified against those exact
instances.

## The adapter

`pool-adapter.ts` exports a factory, `buildPools(pool)`, that turns any page's
pool JSON into `{ pools: Record<string, PoolEntry[]>, flagged: FlaggedEntry[] }`.
It uses the same canonical primitives the hand-authored content uses
(`createMotionData`, `getGridPlacementFromLocations`, `bakeReversals`) so a
pooled example renders byte-for-byte like an authored one. A candidate that
fails to adapt (unmapped letter, non-inverting position) is excluded from its
slot and recorded in `flagged` - one bad candidate never breaks the page.

A new page gets a thin module:

```ts
import json from "./<page>.pool.json";
export const pools = buildPools(json).pools;
```

`permutations.pool.json` keeps going through the same factory, but
`pool-adapter.ts` also re-exports `mirroredPool` / `rotatedPool` /
`swappedPool` / `rawSlots` / `flaggedEntries` as thin wrappers, so
`permutations.content.ts` (and its tests) didn't need to change when the
factory was extracted.

Grid mode defaults to diamond for every candidate; a pool can opt into a
different mode via `generationDefaults.gridMode` (none of the guide's slots do
today - diamond is the only mode in active use).

`tests/unit/guide-example-pool-adapter.test.ts` sweeps every `*.pool.json` in
this directory automatically, so a new page pool file is covered without
touching the test.

Curation flow: Austen curates (keep / cut / edit) by seeing animation + prose
+ step strip together on the live page. Cuts happen after his pass - update the
source spec JSON first, then re-copy it here.
