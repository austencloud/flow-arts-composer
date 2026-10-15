# VTG Deck Browser: Dual-Axis Grouping

**Date:** 2026-03-26
**Status:** Approved (design phase)

## Problem

The VTG deck browser currently shows 7 rows organized by timing ratio (1:1, 2:1, 3:1...). If a user wants to see all Split-Same variations across ratios, they must open each deck individually. Users need to browse either by **family** (elemental grouping) or by **ratio** (timing/turn grouping), depending on their goal.

## Design

### Toggle: Family | Ratio

A pill-style toggle at the top of the VTG collection view switches between two card-grid layouts. **Family is the default/primary view.**

### Family View (Primary)

A 3x2 grid of themed cards, one per VTG family:

| Card | Family | Element | Accent Color |
|------|--------|---------|-------------|
| 1 | Split-Same | Water | #63b7cd |
| 2 | Tog-Same | Earth | #75A874 |
| 3 | Quarter-Same | Sun | #ffde17 |
| 4 | Split-Opp | Fire | #f2673a |
| 5 | Tog-Opp | Air | #78b7e3 |
| 6 | Quarter-Opp | Moon | #6a4199 |

Each card displays:
- **Elemental SVG icon** from `static/images/elements/{element}.svg` (48px, drop shadow)
- **Family name** in element accent color (17px, bold)
- **Element name** as uppercase subtitle (12px, muted)
- **Footer**: ratio count + sequence count
- **Card background**: subtle gradient tinted to element color
- **Card border**: element color at 35% opacity
- **Hover**: lift 4px + intensified glow shadow

Tapping a family card navigates to a flat list of all sequences for that family across all ratios, with light section headers per ratio (1:1, 3:1, 5:1...).

**Cross-deck loading:** The family drill-down loads sequences from multiple decks. Implementation: parallel `DeckLoader.loadDeckSequences()` calls for all VTG decks, then filter each deck's sequences to the selected family. The deck list is already loaded at the collection level, so we know which deck IDs to fetch.

**Breadcrumb:** Collections > VTG > {Family Name} (e.g. "Split-Same (Water)")

### Ratio View

Cards grouped by TKA level in rows:

**Row 1 (Level 1):** Single centered card
- 1:1 (0 turns)

**Row 2 (Level 2 — whole turns):** Three cards
- 3:1 (1 turn), 5:1 (2 turns), 7:1 (3 turns)

**Row 3 (Level 3 — half-turn components):** Three cards
- 2:1 (0.5 turns), 4:1 (1.5 turns), 6:1 (2.5 turns)

Each ratio card displays:
- **Level badge** (28px circle, canonical gradient from `difficulty-styles.ts`)
- **Ratio number** large and bold (32px)
- **Turn count** as subtitle
- **Footer**: family count + sequence count
- **Card theme**: tinted to match level gradient color (blue L1, silver L2, gold L3)

### Level-to-Ratio Mapping

| Ratio | Turns | Level | Why |
|-------|-------|-------|-----|
| 1:1 | 0 | 1 | Zero turns = foundation |
| 3:1 | 1 | 2 | Whole turn |
| 5:1 | 2 | 2 | Whole turns |
| 7:1 | 3 | 2 | Whole turns |
| 2:1 | 0.5 | 3 | Half turn |
| 4:1 | 1.5 | 3 | Half-turn component |
| 6:1 | 2.5 | 3 | Half-turn component |

L1 = 0 turns, L2 = whole turns, L3 = half turns. This follows the TKA level system where complexity grows outward from zero.

### Elemental-to-VTG Mapping

Source: `src/lib/shared/pictograph/shared/domain/utils/vtg-calculator.ts`

| VTG Family | Element | SVG Asset |
|-----------|---------|-----------|
| Split-Same (SS) | Water | water.svg |
| Tog-Same (TS) | Earth | earth.svg |
| Quarter-Same (QS) | Sun | sun.svg |
| Split-Opp (SO) | Fire | fire.svg |
| Tog-Opp (TO) | Air | air.svg |
| Quarter-Opp (QO) | Moon | moon.svg |

Note: The elemental model is a separate classification system from VTG. VTG's creator Noel Yee does not endorse it. It is displayed here as a visual aid and navigation tool, not as canonical VTG taxonomy.

## Architecture

### Data Requirements

**No new Firestore data needed for family grouping.** The family view aggregates across existing decks:
- Each deck already has `families: DeckFamily[]` with `id` matching the family names
- The view groups existing data differently, not new data

**Deck interface extension needed.** The Firestore documents contain `vtgRatio` and `turns` fields (written by the seed script), but the TypeScript `Deck` interface in `domain/models/Deck.ts` doesn't declare them. Add:
```typescript
readonly vtgRatio?: string;   // "1:1", "2:1", etc.
readonly turns?: number;       // 0, 0.5, 1, 1.5, 2, 2.5, 3
```

**New deck needed:** 6:1 ratio (2.5 turns) does not currently exist in Firestore. The seed script (`seed-vtg-turn-decks.cjs`) intentionally skips it "per VTG convention." However, the user has explicitly decided to include 6:1 — TKA extends beyond VTG convention, and 6:1 completes the L3 row (2:1, 4:1, 6:1). Add a 6:1 entry to `TURN_VARIANTS` and seed it.

### Components

**Modified:**
- `DeckBrowser.svelte` — When `selectedCollection === "VTG"` and no deck is selected, render `VtgCollectionView` instead of the default deck row list. Toggle only appears in this context.
- `Deck.ts` — Add optional `vtgRatio` and `turns` fields to the interface
- `DeckRow.svelte` — Kept for non-VTG collections (LOOPs, etc.)

**New:**
- `VtgCollectionView.svelte` — Orchestrator that owns the toggle and delegates to the active grid
- `VtgFamilyCard.svelte` — Single family card with elemental theming
- `VtgRatioCard.svelte` — Single ratio card with level theming
- `VtgFamilyGrid.svelte` — 3x2 grid of family cards
- `VtgRatioGrid.svelte` — 1-3-3 row layout of ratio cards

### Elemental Theme Config

New config file mapping family IDs to visual properties:

```typescript
// src/lib/features/choreo-card/domain/elemental-theme.ts
interface ElementalTheme {
  familyId: string;       // "split-same"
  element: string;        // "water"
  accentColor: string;    // "#63b7cd"
  svgPath: string;        // "/images/elements/water.svg"
}
```

Located in `domain/` alongside other models and constants, consistent with project structure.

### State

Toggle state (`"family" | "ratio"`) stored in the deck browser's local state factory. Persisted per-session (not to Firebase). Family is the default.

### Navigation Flow

```
VTG Collection
  ├─ [Family toggle active - DEFAULT]
  │   └─ 6 family cards (Water, Earth, Sun, Fire, Air, Moon)
  │       └─ Tap → flat sequence list for that family across all ratios
  │           └─ Light section headers per ratio (1:1, 3:1, 5:1...)
  │
  └─ [Ratio toggle active]
      └─ 7 ratio cards in 1-3-3 layout
          └─ Tap → existing deck interior (grouped by family)
```

## Styling

- Cards use `var(--theme-card-bg)` as base, with element/level color overlays
- Borders use element/level color at 35% opacity
- Hover: `transform: translateY(-4px)` + intensified `box-shadow`
- Level badges use canonical gradients from `difficulty-styles.ts`
- Font sizes respect typography system: card titles at `--font-size-min` (14px+), subtitles at `--font-size-compact` (12px)
- Mobile: grid collapses to 2 columns, then 1 column on narrow screens

## Out of Scope

- 0:1 ratio (float-float) — excluded from deck browser. Only 6 sequences (one per family, no rotation variants). Theoretical analysis at `docs/archive/swarm-2026-10-14/reference/float-float-naming-analysis.md`
- Elemental glyph visibility toggle in pictographs
- Cross-collection family browsing (LOOPs don't have VTG families)
- Drag-to-reorder cards
