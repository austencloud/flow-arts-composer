---
status: active
value: null
effort: null
work_state: unverified
remaining: Verify inspector profile thresholds and no-reflow viewer transitions at the specified viewport sizes.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Sequence Viewer Inspector Layout Pass

**Status:** Approved by Austen's direct request
**Date:** 2026-09-01

## Problem

The sequence viewer gives every desktop inspector the same wide-screen width.
That was intentional for the effects workspace, which needs enough room to
recompose its studies, but it makes Card settings grow from 560px to 800px and
then 1000px even though its controls are short chip rows. At a wide viewport or
with DevTools docked, Card settings occupy roughly a third of the workspace and
leave obvious dead space. The inspector seam is also fixed even though the
canonical `PanelGroup` already owns pointer and keyboard resizing.

Baseline source and runtime evidence:

- `SequenceViewerShell.svelte` sets `--export-sidebar-width` to 560px, 800px at
  1680px, and 1000px at 2600px.
- `ViewerWorkspacePanels.svelte` supplies that value as `fixedSize` and disables
  the stage's resize handle.
- The supplied 3840×2160 screenshot shows Card settings using the effects width.
- The production route exposes no separator between the stage and Card settings;
  the only "Resize sidebar" control belongs to the left content rail.

## Ownership

This change extends existing owners. It does not add another panel system.

- `SequenceViewerShell.svelte` keeps responsive composition and profile-specific
  width tokens.
- `ViewerWorkspacePanels.svelte` keeps stage/inspector panel definitions.
- `PanelGroup.svelte` keeps drag, keyboard resizing, constraints, direct-motion
  behavior, and reduced-motion behavior.
- `viewer-shell-model.ts` keeps the testable profile bounds and narrow-layout
  arithmetic.
- `ExportImagePanel.svelte` keeps Card control structure and wrapping.

## Decision

1. Card gets a compact responsive default: `clamp(480px, 28vw, 640px)`.
   Effects retain their existing 560/800/1000px composition tiers. Art uses the
   compact base threshold but keeps its own resize bounds.
2. Desktop sidebars become resizable through `PanelGroup` with an 8px seam.
   Card is constrained to 420–840px, Motion to 520–1200px, and Art to
   440–1000px. The stage always keeps at least 600px.
3. Card and Art may use the side-by-side layout at 1268px with the default rail;
   Motion continues to require 1348px. Narrower workspaces use the existing
   stacked/bottom presentation.
4. The default inspector remains composed at its final width while opening, so
   the shipped no-reflow transition contract survives. On the first pointer or
   keyboard resize, the inspector becomes fluid and follows the seam directly.
5. The separator exposes an accurate percentage and a human-readable accessible
   name. Arrow keys resize by 16px; Shift+Arrow uses the existing 48px step.

## Responsive Contract

- 375×667 and 960×412 mobile-capability layouts retain the bottom ControlDock.
- 820×1180 and other narrow desktop-capability layouts stack when the stage and
  inspector minimums do not fit.
- 1440×900 starts Card at 480px and leaves the remaining width to the preview.
- 1920×1080 grows Card proportionally without inheriting the 800px effects tier.
- 2560×1440 and 3840×2160 cap Card at 640px; added space belongs to the artifact.
- Browser zoom and a docked DevTools pane are treated as available CSS viewport,
  not as evidence that controls should grow.

## Motion and Accessibility

Opening, closing, and stacked recomposition continue through `PanelGroup` and
its canonical transitions. Pointer dragging disables interpolation so the seam
tracks the hand. Reduced motion keeps the existing immediate final state.
Keyboard resizing begins from rendered pixel widths, avoiding the first-key
snap caused by stale 1:1 flex defaults.

## Verification

- Unit-test profile thresholds and bounds.
- Keep the viewer transition orchestration contract green.
- Run the scoped Svelte check and focused unit tests.
- Inspect the live Card panel at 375×667, 960×412, 820×1180, 1440×900,
  1920×1080, 2560×1440, and 3840×2160, plus 200% browser zoom.
- Measure stage, inspector, separator, root font size, horizontal overflow, and
  pointer/keyboard resize endpoints. Exercise opening and resizing with full
  and reduced motion.
