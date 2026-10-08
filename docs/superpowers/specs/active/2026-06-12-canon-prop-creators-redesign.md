---
status: active
value: 2
effort: XS
remaining: "Verify Canon Prop + Browse Creators Redesign — Design against src/lib/shared/settings/services/firebase-settings-persister.ts before resuming implementation. Prior recorded remainder: '5 of 6 shipped; mobile title-row hide not done, and the panel was since redesigned'"
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Canon Prop + Browse Creators Redesign — Design

**Queue evidence (2026-10-07):** Five of six changes landed; mobile title-row behavior and later panel redesign need reconciliation. See frontmatter for the remaining work.

> **DRIFT WARNING — 2026-08-02.** 5 of 6 shipped; mobile title-row hide not done, and the panel was since redesigned
>
> Status lines below predate this check and are left intact deliberately.
> This banner is the current state. Source: `docs/superpowers/handoffs/2026-07-25-spec-triage-ledger.md`.


**Date:** 2026-06-12
**Original status (historical):** Approved direction (brainstormed with Austen 2026-06-12), ready for implementation plan
**Session:** "Redesign Browse Creators"

## Problem

The Browse Creators tab carries a prop filter chip row backed by `propsISpinWith`,
a field only 7 of 49 users have set (live Firestore query, 2026-06-12). The
onboarding step that fed it was cut 2026-06-04; the only remaining write path is
the My Props drawer buried in the account popover. Result: most chips return 0–1
creators, the row produces empty states, and the "favorite prop" concept feels
half-implemented.

Meanwhile, 47 of 49 users (96%) already have a prop selection synced to
Firestore at `users/{uid}/settings/preferences.bluePropType` — the prop they
render pictographs with. Zero users have mismatched blue/red hands. This is the
prop identity signal, and it requires no new UX to collect.

## Decision (brainstorm outcomes)

1. **Canon prop = settings prop, denormalized.** Every user gets an assigned
   prop derived from their most recently selected settings prop. No favorite-
   picker friction, ~96% coverage on day one.
2. **Hybrid precedence: explicit favorite wins.** Effective prop =
   `favoriteProp ?? activeProp ?? null`. The My Props drawer stays as the
   override mechanism; the 7 users who picked a favorite keep their choice.
3. **Remove the chip filter row; keep "Group by prop" sort.** 49 creators don't
   need filtering — most chips return ≤4 people even with full coverage. The
   existing sort-bar option covers "show me the fan spinners" without dead-end
   empty states. Chips can return when the population is ~10x.
4. **Remove the "Browse Creators" title row on mobile only.** It duplicates the
   bottom-nav tab label; mobile reclaims a full row of chrome. Desktop keeps it.
5. **Hide zero-count stats on creator cards.** "0 collections" as permanent card
   furniture reads as emptiness across the grid.

Accepted tradeoff: switching your render prop out of curiosity updates your
public badge (until you pin an explicit favorite). At this community size that
reads as "what I'm currently into," which is the point. Badge language is
**"spins with"**, never "favorite", when the value is inferred.

## Design

### 1. `activeProp` denormalization

- New optional field on `users/{uid}`: `activeProp: PropType` — the exact
  variant from settings (e.g. `staff_v2`), not collapsed. Consumers collapse
  via `getBasePropType()` (`prop-type-display-registry.ts:338`) when grouping.
- **Write path:** after a successful settings save in
  `FirebaseSettingsPersister.saveSettings()`
  (`src/lib/shared/settings/services/firebase-settings-persister.ts:76`),
  merge `{ activeProp: settings.bluePropType }` onto `users/{uid}`. Skip the
  write when the value hasn't changed (track last-written). The save is already
  debounced upstream, so write volume is bounded.
- Blue hand is the tiebreaker if hands ever mismatch (today: 0 of 47 users).
- **Backfill:** one-time admin script `scripts/backfill-active-prop.cjs` —
  read each `users/{uid}/settings/preferences.bluePropType`, write
  `activeProp` to the user doc. (The read query was already validated during
  this brainstorm.)
- **Model:** add `activeProp?: PropType` to `UserProfile` in
  `enhanced-user-profile.ts` and to the Firestore mapping used by the creators
  loader.
- **Effective-prop helper:** one shared function in
  `src/lib/shared/community/domain/` (e.g. `getEffectiveProp(user)`) returning
  `favoriteProp ?? activeProp ?? null`. All display sites use it — no
  site-local precedence logic.

### 2. Badge display

- `CreatorCard.svelte:140` — change the badge condition/source from
  `user.favoriteProp` to the effective prop. Tooltip: "Spins with {label}".
- `ProfileHeroSection.svelte` — when `propsISpinWith` is empty, fall back to
  showing the effective prop as a single "spins with" chip. Explicit
  favorite keeps its existing star treatment.

### 3. Group-by-prop sort

- `creators-data-state.svelte.ts` `sortBy === "favoriteProp"` branch: group by
  `getBasePropType(getEffectiveProp(user))`. Users with no prop group last
  (~2 users today). Sort-bar label "Group by prop" unchanged.

### 4. Chip row removal

- Delete `PropFilterChips.svelte` and its render block + import in
  `CreatorsPanel.svelte` (lines ~236–244).
- Remove `selectedPropFilters` state, `togglePropFilter`, and the `propFilter`
  plumbing from `creators-data-state.svelte.ts` and the
  `getUsersPaginated` query options — after grepping that nothing else consumes
  them.
- `creator-prop-filter.ts` service: keep `groupByFavoriteProp` (used by the
  sort, updated to effective prop); delete `queryByProp` / `filterByProps` if
  the chip row was their only consumer.
- Update/trim `tests/unit/prop-system/CreatorPropFilter.test.ts` accordingly.
- The Firestore composite index for `propsISpinWith array-contains` becomes
  unused; leave it (harmless) — note it in the commit message.

### 5. Mobile title row

- `CreatorsPanel.svelte`: hide `.creators-topbar` inside the existing
  `@media (max-width: 640px)` block. CSS-only change.

### 6. Zero-count stats

- `CreatorCard.svelte` stats row: render each count only when > 0. The row
  itself always remains (last-active is always present), so card heights stay
  uniform — required because `VirtualizedCreatorGrid` assumes consistent row
  heights (no-layout-shift rule).

## Out of scope

- Merging the sort control into the search row on mobile (declined in
  brainstorm — separate polish pass if wanted).
- Reviving sequence-level `intendedProp` (38/516 library docs, 0/460
  publicSequences carry it; the public index syncer drops the field). Separate
  problem.
- Any onboarding changes.

## Verification plan

- Backfill script output: per-user before/after counts (expect ~47 writes).
- Firestore re-query after backfill: users with effective prop ≥ 47/49.
- `npm run check` green; chip-row grep proves no orphaned imports.
- Screenshot of mobile creators tab: no title row, no chip row, badges visible
  on cards, no zero-count stats.
- Toggle settings prop on a test account → user doc `activeProp` updates →
  creator card badge follows (explicit-favorite account stays pinned).
