---
status: active
value: 2
effort: S
remaining: "Verify Inspect Panel Redesign — Live Pictograph + Tier-Aware Adjustment Editing against the current Inspect Panel Redesign — Live Pictograph + Tier-Aware Adjustment Editing runtime and acceptance criteria before resuming implementation. Prior recorded remainder: 'Shipped, relocated to a footer dock; 4-tier picker narrowed to 2 and Default became editable, both undocumented'"
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Inspect Panel Redesign — Live Pictograph + Tier-Aware Adjustment Editing

**Queue evidence (2026-10-07):** An inspect surface shipped in a footer dock; picker and Default editing differ from this design. See frontmatter for the remaining work.

> **DRIFT WARNING — 2026-08-02.** Shipped, relocated to a footer dock; 4-tier picker narrowed to 2 and Default became editable, both undocumented
>
> Status lines below predate this check and are left intact deliberately.
> This banner is the current state. Source: `docs/superpowers/handoffs/2026-07-25-spec-triage-ledger.md`.


**Date:** 2026-05-28
**Original status (historical):** Design approved, ready for planning
**Scope:** `PictographInspectModal` and its sub-components (admin-only Step Editor inspect panel)

---

## Problem

The current inspect panel (`PictographInspectModal`) is a three-column read-out (Basic Info | Blue Motion | Red Motion) styled like a backend terminal: monospace, sub-12px text, dense glyphs. Two concrete failures:

1. **No live pictograph.** When editing Special JSON coordinates, there is no pictograph in the modal, so the user cannot see the arrow move as they adjust. WASD editing already works in code (`PipelineTraceSection`, `editTarget="special-json"`) but feels broken because there is no visual feedback.
2. **Readability.** Terminal aesthetic, tiny type, and cryptic tier rows fail the AAA-readability bar Austen holds for every surface (self or user).

A third friction: choosing *which* tier you are editing (Global / Special JSON / Prop Geometry / Default) is not obvious — the tier rows are subtly clickable only in edit mode.

## Goals

1. Live pictograph in the panel; clicking an arrow selects it for editing and the arrow visibly moves on every WASD press.
2. Collapsible detail sections so the panel is not information overload. All collapsed on open; clicking an arrow auto-expands that motion's section.
3. An explicit, readable **tier picker**: pick whether you're editing Global, Special JSON, or Prop Geometry adjustments. Default shown read-only.
4. AAA readability and 2026 styling, driven entirely by the existing theme-token system — no hardcoded colors, no terminal feel.

## Non-Goals

- No change to the arrow-positioning pipeline math or the cascading tier resolution.
- No change to WASD coordinate space — edits stay in **base-space** (matches the global override mechanic, per Austen's explicit ask).
- No redesign of the upstream `StepEditorPanel` (the non-modal step editor). This is the inspect modal only.

---

## Reuse Inventory (Never-Hand-Roll)

Everything needed already exists; this is a **restructure + wiring + restyle**, not new infrastructure.

| Need | Existing asset | Action |
|---|---|---|
| Live pictograph with clickable arrows | `PictographContainer` + `ArrowSvg` (`arrowsClickable` prop) | Reuse — already used by `StepEditorPanel:429` |
| Arrow click → selection | `selectedArrowState.selectArrow()` (`ArrowSvg:435`) | Reuse — already fires on click |
| Collapsible section | `CollapsibleSection.svelte` (admin/feature-flags) | **Extend** with controlled `open`/`onToggle` |
| WASD + numeric edit, global & special-json | `PipelineTraceSection.svelte` | Extend with prop-geometry target; restyle |
| Live feedback on edit | `pictographPreparer.clearCache()` + `globalAdjustmentVersion.increment()` already called per keypress (`PipelineTraceSection:351,366`) | Reuse — pictograph re-renders for free |
| Diagnostics per tier | `arrowAdjustmentCalculator.getDiagnostics()` | Reuse |
| Global edits | `getGlobalAdjustmentRepository()` (local + save + delete) | Reuse |
| Special JSON edits | `getSpecialOverrideRepository()` (local + save + delete) | Reuse |
| Prop geometry edits | `PropGeometryAdjustmentRepository` (`saveAdjustment`, `getAdjustmentCascading`) | **Extend** — see gap below |
| Theme tokens | `--theme-*`, `--semantic-*`, `--prop-*`, `--font-size-*` | Apply throughout |

### Prop-Geometry Parity Gap (the meatier sub-task)

Global and Special JSON repos support the full live-edit cycle: an in-memory `saveLocal` (for instant WASD preview before persisting), `save` (persist), and `delete`. The `PropGeometryAdjustmentRepository` currently exposes only `saveAdjustment` (persists immediately) and `getAdjustmentCascading`. To make Prop Geometry a live-WASD, revertable target with the same UX, it needs:

1. **Local mutation methods on the repo** — `saveAdjustmentLocal(input)` and `deleteAdjustmentLocal(key)` that update in-memory state without a Firestore write. The underlying `PropGeometryAdjustmentState` already exposes `setAdjustment`/`removeAdjustment` (used by the realtime subscription), so these wrap existing state methods.
2. **A delete-persist path** — `deleteAdjustment(key)`. Verify `PropGeometryAdjustmentPersister` has a delete; add if missing.
3. **A key generator from arrow context** — build the `PropGeometryKey` (gridMode, propType, otherPropType, positionType, endOrientation, otherEndOrientation, motionType, turns, arrowColor) from the selected arrow's `MotionData` + `PictographData`. The diagnostics already compute the prop-geometry tier value, so the key-construction logic exists in the calculation layer and should be extracted/reused, not re-derived.

Prop Geometry ships with **full parity** to Global and Special JSON — live WASD preview, persist, and revert. No phasing, no "coming soon" stub. The tier is a first-class editable target on day one.

---

## Design

### Layout — two regions

The modal widens (pictograph needs room). `max-width` grows from `1200px` toward ~`1320px`; `.columns` grid is replaced by a two-region flex/grid:

- **Left rail (~40%, sticky):** live `<PictographContainer pictographData={calculatedData} arrowsClickable disableTransitions />`. Sticky so it stays visible while the right column scrolls. On narrow widths (< ~720px) it stacks above the accordion.
- **Right column (scrolling, `themed-scrollbar`):** the accordion.

Header (`InspectModalHeader` — Copy AI / Copy JSON / close) is unchanged structurally; restyled with tokens.

### Accordion — collapsible sections

Three sections, **all collapsed on open**:

1. **Basic Info** — current `BasicInfoColumn` content (beat, letter, grid mode, positions, reversals, lookup keys).
2. **Blue Motion** — current `MotionColumn` (color="blue"): motion data rows + arrow placement + the tier picker / editor (`PipelineTraceSection`).
3. **Red Motion** — same for red.

Each wrapped in the extended `CollapsibleSection`. The inspect panel owns each section's open state so it can drive expansion programmatically.

**Auto-expand on arrow click:** clicking the blue arrow in the pictograph → `selectedArrowState` updates → the panel (a) expands the Blue Motion section, (b) enters edit mode on its `PipelineTraceSection`. Clicking the red arrow does the same for red. Clicking empty pictograph space clears selection (matches `StepEditorPanel:422`) and may collapse, or leave sections as-is (leave as-is — less jarring).

### Tier picker — explicit and readable

Inside each motion section, when in edit mode, the four tiers render as **full cards** (not dense rows), each ≥44px tall:

- **Global Override**, **Special JSON**, **Prop Geometry** — selectable edit targets. Each shows: an identity dot, the tier name (16px, 600), a sub-line (e.g. "Layer 2 · staff", "staff"), and its current value or "Not set" (right-aligned, tabular-nums).
- **Default** — dashed border, dimmed, "Computed floor · read-only", value shown. Not selectable.
- The **active/winning** tier (what currently renders) is marked plainly (e.g. "Active tier — this is what renders now") rather than a bare star icon.
- The **selected edit target** gets a solid accent border + filled "EDITING" pill.

Below the picker: a `base → rotated` value strip in plain language-sized type.

### Editor

When a tier is selected:

- Large X / Y readouts (label + value, ~24px, tabular-nums) in token-styled fields. These remain editable numeric inputs (existing `bind:value` + `onchange`).
- A keycap-styled `W A S D` hint line: "WASD to move · Shift ×4 · Ctrl+Shift ×40 · live preview in pictograph". (Increments: 5 / 20 / 200, matching `PipelineTraceSection:246-248`.)
- **Revert / Save** buttons, full hit-target (≥44px), tier-appropriate (Special JSON & Prop Geometry "Revert"; Global "Delete").
- Unsaved state surfaced with `--semantic-warning`.

### Theme mapping (no hardcoded colors)

| Element | Token |
|---|---|
| Modal / panel surface | `--theme-panel-bg` |
| Section + tier cards | `--theme-card-bg` |
| Borders | `--theme-stroke`, hover `--theme-stroke-strong` |
| Body text / dim | `--theme-text`, dim via `--theme-text-dim` or opacity |
| **Selected tier border, EDITING pill, Save** | **`--theme-accent`** (adopts the user's chosen theme) |
| Global tier dot | `--semantic-success` |
| Prop Geometry tier dot | `--semantic-info` |
| Special JSON tier dot | `--theme-accent` (it is the common active tier; reads as "the thing you're tuning") |
| Default tier dot | neutral `--theme-text-dim` |
| Unsaved indicator | `--semantic-warning` |
| Revert / Delete | `--semantic-error` |
| Blue / Red motion headers | `--prop-blue` / `--prop-red` |
| Type sizes | `--font-size-sm` / `--font-size-min` (body, 14px), `--font-size-compact` (metadata, 12px min); large readouts via scoped styles. Never below 12px. |

Semantic and prop tokens are Layer-3 constants — using them for tier identity is theme-system-compliant (they are designed not to shift with background). All surface/text/stroke chrome adapts to the user's theme.

---

## Components Touched

| File | Change |
|---|---|
| `PictographInspectModal.svelte` | Relayout to two regions; add live `PictographContainer`; own per-section open state; wire `selectedArrowState` → auto-expand + edit-mode; theme tokens. Keep existing calculation/diagnostics logic. |
| `MotionColumn.svelte` | Render inside collapsible; controlled open; restyle to tokens + AAA type scale; drop monospace terminal look. |
| `BasicInfoColumn.svelte` | Render inside collapsible; restyle to tokens. |
| `PipelineTraceSection.svelte` | Add **prop-geometry** as a third editable target; tier picker as readable cards; controlled "edit mode" driven by parent; restyle to tokens. |
| `CollapsibleSection.svelte` | Extend: optional controlled `open` + `onToggle` (bindable); keep `defaultOpen` for uncontrolled callers. Backward-compatible. |
| `PropGeometryAdjustmentRepository.ts` (+ state/persister) | Add `saveAdjustmentLocal`, `deleteAdjustmentLocal`, `deleteAdjustment`; reuse state `setAdjustment`/`removeAdjustment`. |
| Prop-geometry key generation | Extract/reuse key-construction from the calculation layer for use by the editor. |

No new files anticipated beyond possibly a small key-generator module if extraction warrants it.

---

## Edge Cases & Risks

- **Arrow click while a different section is open:** clicking red while blue is expanded should expand red and enter red edit mode; blue may stay open (multiple sections open is fine — the accordion is not exclusive). Confirm during impl that two open editors don't both capture WASD. `PictographInspectModal:296` delegates WASD blue-first then red; selection should scope WASD to the selected color's section only. Adjust delegation to route by `selectedArrowState` color.
- **No motion for a color:** section shows existing empty state; not selectable.
- **Prop-geometry parity:** required in full — live preview, save, revert. Verify the persister delete path and key generator early in planning since they are the only genuinely new code.
- **Sticky pictograph on short viewports:** ensure it doesn't overlap the header; cap its height with the grid.
- **Theme-token fallbacks:** every `var(--theme-*)` keeps a sensible fallback (the modal currently has no theme context guarantee). Verify the modal sits inside a theme-providing tree; if not, set the theme vars at the modal root.
- **Admin gate:** the modal is admin-only already; prop-geometry save is admin-gated in the repo. Consistent.

## Success Criteria

1. Opening the inspect panel shows a live pictograph + three collapsed sections, all readable at arm's length (no sub-12px text, no monospace chrome).
2. Clicking an arrow expands that motion's section and enters edit mode on it.
3. Selecting Global / Special JSON / Prop Geometry and pressing WASD moves the arrow in the live pictograph on every keypress.
4. Save persists to the correct tier repo; Revert/Delete works per tier; Default is read-only.
5. All colors derive from the active theme; switching themes restyles the panel chrome.
