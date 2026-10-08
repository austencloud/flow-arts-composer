---
status: active
value: null
effort: null
remaining: "Verify choreography indicator flags and card-front size ratio in current card and Create workspace."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Choreo Indicator Restoration

## Decision

Restore difficulty and LOOP classification to the Choreo Card front and the
Create workspace header. Keep the mandala focused on the sequence path rather
than embedding metadata in the artwork.

This revises only the level/LOOP demotion from the June 27 Create header
declutter spec. It does not restore the removed classification modals.

## Card front

- Reuse the shared canvas difficulty badge and LOOP icon renderers.
- Keep the established top-left difficulty and top-right LOOP positions.
- Render both at 48 px on the 822 by 1122 physical card composition. This is
  slightly smaller than the shared 54 px header default.
- Apply the smaller ratio only to 5:7 card mode and physical deck composition.
  Other exports retain their existing indicator size.

## Create workspace

- Add one stable 20 px metadata rail beneath the existing word label.
- Show a 20 px difficulty badge as soon as the sequence has its first step.
- Show 16 px LOOP icons when live detection identifies a LOOP.
- Keep fixed left and right slots so the level does not move when LOOP icons
  appear, and reserve the row from the empty state to prevent layout shift.
- Reuse `DifficultyBadge`, `LOOPIconStrip`, the canonical difficulty analyzer,
  and the existing live LOOP detector result.

## Verification

- Unit-test the card-front compose flags and the card-specific size ratio.
- Run focused TypeScript/Svelte checks for the touched surface.
- Load the checked-in 8-count LOOP sequence on `/test/choreo-indicators` and
  render both sides through `PrintPreviewPages` and `PrintCardRenderer`. Supply
  its existing short URL so the page needs no Firestore permissions. The review
  must show the production outer frame, current portrait 3×4 grid with a column
  start position, mandala, QR code, difficulty badge, and LOOP classification.
- Review the real card and workspace components at desktop, tablet, landscape
  phone, and narrow phone viewports.
