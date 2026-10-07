---
status: active
value: 4
effort: XS
remaining: "Implementation is complete. Remaining: verify focus, keyboard, reply, and edit flows on the target iPhone without viewport zoom."
depends_on: "external: target iPhone device verification"
plan_path: ""
tags: ["inbox", "ios", "mobile", "accessibility", "css"]
last_triaged: 2026-10-07
work_state: verification
---

# Inbox iPhone Focus Zoom: Design Spec

## Field report

Cheech reported that tapping the Inbox message field on an iPhone zoomed the
whole interface. The keyboard interaction changed the page scale instead of
leaving the conversation and composer at their normal size.

## Proven cause

`src/lib/shared/inbox/components/messages/MessageComposer.svelte` renders one
`textarea` for new messages and edits. Its scoped style is:

```css
textarea {
  font-size: var(--font-size-sm);
}
```

`--font-size-sm` resolves to `0.875rem`, which is 14px at the app's normal root
size. iPhone WebKit may enlarge a page when a focused form control has small
computed text. The field is therefore below the app's own known iOS-safe floor.

The repository already handles the same problem:

- `AdminSearchBox.svelte` uses `var(--font-size-base)` on mobile with the comment
  `Prevent zoom on iOS`, then returns to `var(--font-size-sm)` for larger
  desktop layouts.
- `InAppEscapeControls.svelte` gives its manual field a 16px minimum for iOS.
- The public glossary search field uses the same 16px floor.

No evidence points to the Inbox drawer, keyboard scrolling code, or a missing
viewport meta tag as the initiating cause.

## Outcome

Focusing the message textarea on an iPhone opens the keyboard without changing
the page scale. The conversation header, messages, attachment control, and Send
button remain in the same visual coordinate system.

Desktop pointer layouts may retain the current compact 14px composer text.

## CSS design

Keep the change inside `MessageComposer.svelte`:

```css
textarea {
  font-size: var(--font-size-base);
}

@media (min-width: 480px) and (hover: hover) and (pointer: fine) {
  textarea {
    font-size: var(--font-size-sm);
  }
}
```

This is mobile-first and uses existing typography tokens. The desktop override
requires both room and a fine, hovering pointer. A width-only override would
restore 14px on an iPhone in horizontal orientation, recreating the same focus
behavior.

The rule applies to new-message and edit mode because both use the same
textarea. Reply mode and attachment mode also share it.

## Reuse decision

Reuse the 16px mobile form-control policy already present in
`AdminSearchBox.svelte` and `InAppEscapeControls.svelte`. No component, utility
class, JavaScript viewport manager, or package is needed.

Internal searches for `Prevent zoom on iOS`, `font-size-base`, and form controls
below 16px found an exact in-repo pattern. External browser evidence confirms
that focus zoom is WebKit behavior and that actual device behavior can differ
from a resized desktop viewport.

## Explicit non-goals

Do not:

- add `maximum-scale=1` or `user-scalable=no`;
- disable pinch zoom;
- change the global viewport meta tag;
- call `scrollIntoView()` on focus;
- add Visual Viewport resize compensation;
- use `touch-action` as a focus-zoom workaround;
- change composer height, padding, grid columns, or keyboard shortcuts.

Disabling user zoom would trade one nuisance for an accessibility regression.
Visual Viewport work would target keyboard panning, which is a separate WebKit
behavior and is not needed for this field report unless device proof reveals a
second defect after the font fix.

## Acceptance criteria

- On an iPhone, tapping the empty composer opens the keyboard without page
  magnification.
- The computed textarea font size on a coarse-pointer device is at least 16px.
- The Send button stays visible and tappable after focus.
- Sending a message returns the conversation to the same page scale.
- Reply, edit, and attachment-caption modes behave the same way.
- Rotating the iPhone before focusing does not restore the 14px rule.
- Pinch zoom remains available to the user.
- A desktop device with a fine pointer and at least 480px of width may retain
  the existing 14px typography.

## Verification

This defect is visible when broken, so a unit test that asserts a CSS string
would only mirror the implementation. The proof belongs on the device.

After the edit:

1. run the project's Svelte and TypeScript check;
2. open an Inbox conversation on an iPhone in portrait orientation;
3. focus, type, send, blur, reply, and edit;
4. repeat in horizontal orientation;
5. confirm manual pinch zoom still works;
6. repeat in the installed app or Home Screen context used by Cheech.

Apple states that Responsive Design Mode is an approximation and that the
on-screen keyboard and form fields may behave differently on a device.
Simulator or physical-device proof is required. A desktop narrow-window
screenshot is useful for layout review but cannot close this issue.

## Expected file change

- Edit
  `src/lib/shared/inbox/components/messages/MessageComposer.svelte`.

No new test file, token, global stylesheet, viewport setting, or dependency.

## Browser research

- [WebKit bug 285380](https://bugs.webkit.org/show_bug.cgi?id=285380) records
  iOS auto-zoom beginning when a form field receives focus and the resulting
  page and modal usability problems.
- [Apple: Responsive Design Mode](https://developer.apple.com/documentation/safari-developer-tools/responsive-design-mode)
  says viewport presets do not reproduce every device behavior, including the
  keyboard and form-field behavior.
- [WebKit bug 311821](https://bugs.webkit.org/show_bug.cgi?id=311821) is a
  separate current keyboard and visual-viewport issue. Its presence is why this
  spec keeps scope on the proven font-size trigger and requires a real iPhone
  pass afterward.
