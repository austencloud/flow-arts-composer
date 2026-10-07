---
status: backlog
value: 2
effort: S
remaining: Inspect the current per-variant prop picker and vestigial badge code to determine whether the popover half is superseded.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: unverified
---

# Prop Selection Redesign — Design Spec

> **DRIFT WARNING — 2026-08-02.** Visual half shipped verbatim; popover half abandoned for a flat per-variant grid. Vestigial badge code is dead
>
> Status lines below predate this check and are left intact deliberately.
> This banner is the current state. Source: `docs/superpowers/handoffs/2026-07-25-spec-triage-ledger.md`.


## Problem

The prop selection UI has multiple UX issues across all consumption points (settings panel, export sidebar, bottom drawer, QR page):

1. Two-step flow (category → bottom variant strip) feels clunky
2. Variant strip hides behind Download Animation button in export sidebar
3. Variant strip causes scrollbar overflow in narrow containers
4. Button colors/styles feel unpolished — too much empty space on 4K
5. Prop images show blue/red coloring that's misleading in a neutral picker context

## Design Decisions

### Prop Images
- White silhouettes via `filter: brightness(0) invert(1)` on all prop SVGs in the picker
- Neutral tint because actual color depends on blue/red hand assignment at runtime
- Opacity ramp: 0.45 default → 0.7 hover → 0.95 selected

### Button Treatment: Glass
- Background: `rgba(255, 255, 255, 0.025)` (near-transparent)
- Border: `1px solid rgba(255, 255, 255, 0.05)` (barely visible)
- Border-radius: `12px`
- Hover: `translateY(-1px)`, border brightens to `rgba(255, 255, 255, 0.1)`
- Active press: `scale(0.96)` with near-zero transition duration (tactile)
- Width: `79px`, aspect ratio maintained via height calc

### Selected State
- Background: `rgba(var(--theme-accent-rgb), 0.1)`
- Border: `rgba(var(--theme-accent-rgb), 0.4)`
- Outer glow: `0 0 16px rgba(var(--theme-accent-rgb), 0.12)`
- Accent-colored circle checkmark (top-right) with shadow `0 2px 8px rgba(accent, 0.4)`
- Label brightens and tints to accent color

### Layout
- Grouped by category with section labels
- Sections: Staves & Clubs, Curved, Novelty, Singles
- Section labels: 10px uppercase, centered, `rgba(255, 255, 255, 0.35)` opacity
- Section divider: `1px solid var(--theme-stroke)` (not on first section)
- Rows: flex-wrap, centered, 6px gap
- Grid padding: 12px

### Variant Handling: Floating Popover
- **Kill the bottom variant strip entirely**
- Multi-variant families show a badge circle (top-left, 14px) with variant count
- Tapping a multi-variant family opens a floating popover
- Popover uses Floating UI for smart positioning (flip, shift, arrow middleware)
- Popover renders via Svelte portal to avoid clipping by scroll containers
- Popover contains variant buttons in a horizontal row, same glass style
- Click-away or Escape dismisses
- Single-variant families select immediately (no popover)

### Colors: Theme-Token-Driven
- All colors reference CSS custom properties from the TKA theme system
- `--theme-accent` / `--theme-accent-rgb` for selection states
- `--theme-card-bg` / `--theme-card-hover-bg` for button backgrounds (overridden to glass values)
- `--theme-stroke` / `--theme-stroke-strong` for borders
- `--theme-text` / `--theme-text-dim` for labels
- Adapts automatically across all 10 TKA themes (Cosmic, Ocean, Forest, Blossom, Ember, etc.)

### Sizing Summary
| Property | Value |
|----------|-------|
| Button width | 79px |
| Button gap | 6px |
| Border radius | 12px |
| Grid padding | 12px |
| Image size | 55% of button width |
| Label font size | 10px (9px below 60px width) |
| Checkmark | 16px circle |
| Variant badge | 14px circle |

## Files Changed

### Modified
- `src/lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte` — glass button styles, remove variant strip, add popover trigger logic, sizing updates
- `src/lib/shared/settings/components/tabs/prop-type/PropTypeButton.svelte` — glass treatment, white image filter, checkmark with accent glow
- `src/lib/shared/pictograph/prop/components/PropCompositionPreview.svelte` — add `neutral` tint mode (white silhouette filter)

### New
- `src/lib/shared/settings/components/tabs/prop-type/VariantPopover.svelte` — Floating UI positioned popover with variant buttons, portal-mounted

### Untouched (inherit changes)
- `PropSelectionSheet.svelte` — wraps BentoPropGrid, gets new look automatically
- `PropTypeTab.svelte` — orchestrator, consumes BentoPropGrid
- `AnimationPanel.svelte` — inline BentoPropGrid, gets new look automatically
- All other consumption points

## Grep Evidence (existing primitives checked)

- Floating UI: not currently in `package.json` — need to install `@floating-ui/dom`
- Portal pattern: `Grep "portal"` found no existing Svelte portal utility — will use Svelte 5 `{#snippet}` + `document.body` mount pattern or `svelte-portal` package
- Popover pattern: existing popovers in codebase use absolute positioning within parent — this one needs portal due to scroll container clipping
