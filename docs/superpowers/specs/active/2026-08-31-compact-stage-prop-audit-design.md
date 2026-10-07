---
status: active
value: null
effort: null
work_state: unverified
remaining: Run the opposite-point landing audit and compare measured fan placements against the gate in this design.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Fan Opposite-Point Landing Audit

## Goal

Test the proposed replacement for Big Fan against its authored spatial
contract. With the fan oriented IN from one strict hand point, its far edge must
land on the opposite strict hand point.

## Ownership

- `/test/prop-size-audit` remains the visual owner for true 950-unit prop-scale
  comparisons.
- `GridSvg.svelte` and its production grid asset remain the visual owner of grid
  geometry. The gate shows only the strict animation points from that shared
  grid. Normal pictograph points remain hidden.
- The authored animated Fan and Big Fan assets remain the silhouette owners.
- The audit composes those owners and does not change production rendering.

## Comparison math

The authored Fan span is 300 units, the Big Fan span is 600 units, and opposite
strict hand points are 300 units apart on the full grid. The audit preserves
that exact landing across one blend:

- `0`: 200% Fan on a 100% grid.
- `0.5`: 150% Fan on a 75% grid.
- `1`: 100% Fan on a 50% grid.

At every value, half the scaled fan span equals twice the scaled hand orbit.
Landing error therefore remains zero. The 150% / 75% midpoint is the proposed
default because it meets between the existing size and grid extremes.

Point size, labels, and controls stay constant. The compact proposal scales the
shared grid's spatial anchors around its center, then counter-scales its point
marks so the diagram remains legible. The slider follows the pointer directly
and carries no easing.

## Gate

The page presents one Fan contract:

1. Authored Big Fan on the full strict animation grid.
2. Authored Fan at 150% on a 75% strict animation grid.
3. A direct blend scrubber that keeps the inward landing exact.
4. Prop scale, grid scale, and landing error measurements.

The opposite target point is emphasized in both cards. The fan is rotated IN at
the east hand point so its left edge can be compared directly to that target.

## Non-goals

- No production prop type is removed or renamed.
- No saved sequence is migrated.
- No renderer, arrow, effect, or trail geometry changes in this gate.
- No claim is made yet about Big Club, Big Staff, or other Big variants.

Production work begins only after this exact Fan landing is visually approved.
