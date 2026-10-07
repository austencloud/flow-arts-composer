---
status: active
value: null
effort: null
remaining: "Verify the YR0L inline player in the named Inbox conversation, including pause, focus, and full-view navigation."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Inbox Inline Sequence Player

**Date:** 2026-08-13  
**Status:** Approved

## Outcome

A TKA sequence link in a message renders as an in-place, playable sequence
preview. The preview is useful without leaving the conversation, while a
separate action still opens the canonical full viewer.

## Ownership

- `InlineAnimationPlayer.svelte` remains the owner of compact 2D sequence
  playback.
- `SequenceViewerShell.svelte` remains the owner of the full viewer.
- `SequenceMessageCard.svelte` owns message metadata, route resolution, and the
  surrounding attachment card.
- `SequenceMessagePreview.svelte` is an inbox presentation that composes the
  existing player. It does not implement rendering or playback itself.

Relationship: compose the existing player and full viewer, with narrow
extensions to `InlineAnimationPlayer` for its canvas-owned corner control,
hover-affordance selection, and offscreen playback gate.

## Interaction

1. The card reserves a square preview stage immediately, so async loading does
   not move the message timestamp or neighboring messages.
2. At rest, the stage shows a static poster and a 44px `Play preview` button.
   No message animation starts on its own.
3. When the user activates Play, the existing inline player mounts in place and
   starts. Touch users can tap the stage. Pointer and keyboard users get one
   canvas-owned corner control without a competing center hover badge.
4. Playback pauses when the card leaves the visible scroll area. Returning to
   the card does not restart motion without another user action.
5. `Open sequence` is a separate button below the stage. It closes the inbox
   and routes to the canonical sequence viewer.
6. Reduced-motion users receive the same user-initiated control. Nothing moves
   before activation.

## Loading and Failure

- Sequence metadata and the player chunk begin loading only when the card is
  near the viewport.
- A stored thumbnail may be used as the poster, but playback never depends on
  that image existing.
- While sequence data resolves, the reserved poster displays a compact loading
  status.
- If the sequence cannot be resolved, the card keeps its metadata and full-view
  action. The stage reports that the preview is unavailable without marking the
  whole attachment deleted.
- A failed player chunk exposes an in-place retry button.

## Layout

- The card fills the message bubble up to a compact ceiling rather than using a
  phone frame.
- The live stage is square because the production 2D renderer is square.
- Metadata remains below the stage, with the full-view action in a distinct
  footer row.
- Essential labels stay at 14px or larger; supplementary metadata stays at
  12px or larger; all controls keep 44px targets.

## Verification

- Resolve and play the exact `YR0L` link in the Sky Guys Quest conversation.
- Confirm play, pause, offscreen pause, full-view navigation, keyboard focus,
  and failure recovery.
- Confirm no nested interactive controls and no layout shift between poster,
  loading, and live player.
- Run focused unit/component tests, Svelte checks, and formatting checks.
- Inspect 1920×1080, 2560×1440, 3840×2160, 1440×900, 820×1180,
  960×412, and 375×667 viewports.
