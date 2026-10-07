---
status: active
value: null
effort: null
remaining: "Verify reply snapshot payload, attachment-only quote, legacy compatibility, and focus behavior in current Inbox."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Specific Message Replies

**Status:** Approved for implementation by the direct request on 2026-08-12

## Outcome

Messages can reply to one specific message without leaving the conversation's
linear timeline. The interaction must feel complete on touch, pointer, and
keyboard input, and the stored relationship must remain useful after reload.

## Existing owners

- `MessageActions.svelte` owns per-message actions and touch gestures.
- `inbox-state.svelte.ts` owns the active reply target.
- `MessageComposer.svelte` owns reply composition and send state.
- `Messenger` owns message reads and writes.
- `ReplyPreview.svelte` owns quoted-message presentation.

This work extends those owners. It does not add a second reply store or a
parallel messaging service.

## Interaction contract

- Swipe a message to the right on touch screens, use the visible reply action,
  or choose Reply from the action menu.
- Starting a reply keeps the current draft and moves focus to the composer.
- The composer shows who and what will be quoted. X and Escape cancel the
  reply without clearing the draft.
- Sent replies show a compact quote. Activating it locates the original,
  scrolls it into view, moves focus to it, and gives it a brief full-surface
  highlight.
- If the original sits outside the live message window, load a bounded context
  around it and offer a clear Return to latest action.
- A deleted original renders as unavailable. A missing original produces a
  direct error instead of silently doing nothing.
- Reduced-motion users get the same state changes without spring or pulse
  animation.

## Data contract

New replies store the original message ID, sender identity, full text snapshot,
and attachment type. Existing reply documents with a shorter text snapshot and
no sender ID remain readable.

Client-written replies must point to an existing, undeleted message in the same
conversation. Firestore rules compare the stored sender and text with that
message. The image finalization callable resolves the same canonical snapshot
on the server so it does not trust display data from the client.

## Verification

- Pure tests cover full-text snapshots, attachment-only quotes, and legacy
  previews.
- Component tests cover reply selection, focus, send payload, and cancellation.
- Firestore emulator tests accept canonical replies and reject forged or
  cross-message metadata.
- Function tests cover canonical reply construction for image messages.
- A static check covers TypeScript and Svelte integration.
- Browser checks cover accessible quote activation, the source highlight,
  swipe intent and reset, a clean console, and frames at 1920x1080,
  2560x1440, 3840x2160, 1440x900, 820x1180, 960x412, and 375x667.
