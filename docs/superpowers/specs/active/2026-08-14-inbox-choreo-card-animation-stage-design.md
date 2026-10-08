---
status: active
value: null
effort: null
remaining: "Verify choreography card coordinator state transitions and explicit Play/retry behavior in the current Inbox."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Inbox Choreo Card and Animation Stage

**Date:** 2026-08-14
**Status:** Approved

## Outcome

A sequence message is a Choreo Card with an animation state, not a generic
media attachment with a title and metadata row. Sent sequence attachments and
pasted TKA sequence links resolve into the same stage.

Every sequence starts as its full Choreo Card, regardless of how it entered the
conversation. Only one explicitly selected animation may play at a time.

## Interaction contract

- The centered play button changes a Choreo Card into its animation and step
  carousel. The same control works with touch, mouse, and keyboard input.
- Selecting another message immediately pauses the old animation and returns
  it to its Choreo Card.
- No preview activates from visibility or pointer hover.
- Reduced motion keeps the same explicit Play action because motion is the
  sequence information being requested.
- The full viewer remains a separate `Open sequence` action.

## Ownership

`MessageThread.svelte` owns the selected preview id through a small inbox state
factory. It is the only component allowed to decide which message can play.

`SequenceMessagePreview.svelte` composes the existing `PropAwareThumbnail` and
`InlineAnimationPlayer` primitives inside one fixed square stage. Its live view
also reuses the shared `StepStrip` carousel from the profile `ArtifactTile`,
driven by the player's existing `onStepChange` callback. It owns only the local
card/live-presentation state.

The profile's `ArtifactTile.svelte` is the interaction reference. Its
profile-wide `LiveSlots` budget remains separate because an inbox thread has a
single playback slot and no multi-medium GPU budget.

## Presentation

- Remove the duplicate word, sequence name, author, music note, and step count
  below the stage. The Choreo Card already carries sequence identity.
- Keep the stage square so swapping card and animation never changes message
  height.
- The live state is the animation above the horizontal `StepStrip`. The active
  pictograph stays focused while neighboring steps slide past, matching the
  established profile presentation.
- Keep the centered icon-only play control.
- Allow sequence messages to use nearly the full message column while retaining
  the normal mobile gutter.

## Failure states

The card stays visible while the animation code and engine load. A failed
sequence resolution or player import replaces the stage with the existing
retryable error. No short preview or alternate renderer is used as fallback.

## Verification

- Unit-test the coordinator's empty, selection, transfer, invalidation, and
  reset transitions.
- Component-test explicit Play, card-first rendering, reduced motion, and retry
  behavior.
- Confirm sent and pasted-link fixtures render the same stage.
- Verify the inbox at 1920x1080, 2560x1440, 3840x2160, 1440x900, 820x1180,
  960x412, and 375x667.
- Exercise tap/click, keyboard focus, and transfer between two sequence
  messages. Confirm hover does not activate playback and no Create workspace
  highlight changes.
