---
status: active
value: null
effort: null
remaining: "Verify long-press cancellation, message selection, keyboard focus, and action sheet geometry on mobile."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Mobile Message Actions

**Status:** Approved for implementation on 2026-08-21

## Outcome

Holding a message in a person-to-person conversation opens a viewport-anchored
action sheet. The sheet owns touch reactions and message commands. Selecting
part of the message is a separate, explicit mode inside that sheet, so the app
never has to guess whether a hold means selection or message actions.

## Existing owners

- `MessageActions.svelte` owns per-message gestures and action behavior.
- `Drawer.svelte` owns modal sheet placement, dismissal, focus trapping, and
  nested drawer stacking.
- `RichMessageText.svelte` owns conversation message text rendering.
- `inbox-state.svelte.ts` owns reply and edit targets.
- `Messenger` owns reaction, edit, and delete persistence.

This work composes those owners. `MessageActionSheet.svelte` is a touch
presentation for existing actions, not a second message-action implementation.

## Interaction contract

### Touch and constrained layouts

- Holding any non-deleted, delivered message opens the message action sheet.
- Moving at least 10px before the hold completes cancels the hold so vertical
  scrolling and swipe-to-reply keep working.
- The selected bubble remains identifiable behind a dimmed backdrop.
- The sheet contains a capped message preview, the reaction row, Reply, Copy,
  Select text, and the actions available for that message and user.
- Copy copies the complete message text.
- Select text changes the same sheet into a full-height selection mode. Message
  actions no longer intercept gestures in this mode. Double-tapping a word and
  dragging the native handles selects part of the text.
- The sheet closes from its Close button, backdrop, downward dismissal gesture,
  or Escape. Focus returns to the message action trigger.
- A long press never activates a link or attachment after the sheet opens.

### Pointer and keyboard layouts

- Dragging across message text keeps native text selection.
- Right-clicking selectable text keeps the native edit menu.
- Right-clicking the surrounding bubble or activating its action trigger opens
  the compact desktop menu.
- The compact menu and mobile sheet call the same action handlers.

## Presentation contract

- The action sheet is fixed to the viewport through `Drawer`, never positioned
  from the held message's coordinates.
- Reactions remain a single row of 44px minimum touch targets.
- Primary actions use labeled 44px minimum buttons. Delete stays last and uses
  the semantic error color.
- Long messages are capped in the action preview so every action remains
  visible. Selection mode provides the scrollable full message.
- The bottom sheet accounts for constrained height, dynamic viewport units,
  and the device safe area.
- Reduced-motion users receive the same state changes without entrance or
  stagger animation.

## Accessibility contract

- The sheet is a labeled modal dialog with trapped focus and inert background
  content.
- Opening moves focus to the sheet heading. Closing restores focus to the
  invoking message action trigger.
- Every action has a text label. Emoji buttons name the reaction they apply.
- The visible Close button, backdrop, swipe dismissal, and Escape provide
  independent exit paths.
- The action trigger remains keyboard and assistive-technology accessible, so
  the hold gesture is a shortcut rather than the only route.

## Verification

- Component tests cover holding selectable message copy, movement cancellation,
  post-hold click suppression, action routing, and selection-mode transitions.
- Static checks cover Svelte and TypeScript integration.
- Browser verification covers a clean console, focus restoration, viewport
  containment, and frames at 1920x1080, 2560x1440, 3840x2160, 1440x900,
  820x1180, 960x412, and 375x667.
