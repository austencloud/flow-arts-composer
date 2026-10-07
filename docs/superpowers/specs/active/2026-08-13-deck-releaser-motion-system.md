---
status: active
value: null
effort: null
remaining: "Verify reduced-motion bypass and Compose-to-Review transitions in the current Deck Releaser."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Deck Releaser Motion System

## Problem

The Gallery drill-down communicates each filter change by moving the affected
results. The releaser shell then hard-cuts between Compose, Review, released
decks, and the Browse/Print rail. The interaction language changes at the exact
moment the user needs confirmation that the selected recipe became a deck.

## Motion contract

- Large state changes move in the direction of the workflow: Compose → Review
  → Release advances; Back, Reuse recipe, and Compose another deck retreat.
- Source changes morph the command surface and board in place instead of
  pretending they are new pages.
- Browse/Print swaps stay contained to the side rail.
- Opening another generated or released deck settles the Review content in
  place without moving the surrounding shell.
- Buttons respond with a short lift and press. Selection rows settle into their
  active state instead of only changing border color.
- Loading motion reports real work. Decorative spinners and spatial movement
  stop under `prefers-reduced-motion`.
- Gallery pane collapse runs through the Gallery results morph. The live layout
  snaps to its final geometry between captures, while the browser moves the
  before and after frames with transforms. No grid, flex, width, or margin
  property is tweened.
- The Gallery search field expands over the toolbar from a fixed 44px anchor.
  Opening search does not move adjacent controls.
- LOOP, Transform, Prop, and Start Position use `BaseModal`. The native dialog
  owns the backdrop, Escape, focus containment, focus restoration, and motion.
- Generated and released deck actions keep a 44px interaction target through
  both their default and delete-confirmation states.

## Architecture

`deck-releaser-motion.ts` is the single owner for feature-level state
transitions. It wraps existing state mutations in named same-document View
Transitions and uses the shared timing tokens. The Gallery results morph,
segmented-control indicator, BaseModal, and print renderer keep their existing
owners.

The transition is progressive enhancement. If the API is unavailable, already
busy, throws, or reduced motion is requested, the state mutation runs once and
immediately. Product behavior never waits on animation.

Gallery keeps its existing `results-morph.ts` owner. `GallerySplitPane` adds
names only while the pane collapse or expansion is active, so ordinary result
filtering does not capture the surrounding workspace. Editor height allocation
updates without a CSS layout transition; its existing content crossfade carries
the visible state change.

## Verification

- Unit tests prove reduced-motion bypass, one-time mutation, and transition
  class cleanup.
- The Compose → Review → Release, source switch, Browse/Print, Back, and released
  deck selection paths are exercised in the running app.
- Motion is inspected at 375×667, 820×1180, 960×412, 1440×900, 1920×1080,
  2560×1440, and 3840×2160 without document overflow or shifting shell chrome.
