---
paths:
  - "src/**/*.svelte"
  - "src/**/*.css"
---

# Controls drill down, content may scroll

Austen set this on 2026-10-26 and 2026-10-27, after the Download video rail
showed an inner scroll bar. His words: "no scroll bars", with one limit
added the next day: "every once in a while a scroll might actually be the
appropriate thing if you're dealing with a long list of various things, such
as in the release notes."

## The rule

- **The page never scrolls.** Every screen is a fixed frame: a header, one
  content area that takes the remaining height, and the primary actions. The
  header, back button and main action stay on screen at every size.
- **Settings and controls never scroll.** When choices don't fit, split them:
  tabs where there is room, and drill-down boxes on phones and the Fold. Each
  box shows a one-line summary of its current values and opens its group as
  its own screen with a back arrow. Reference build: the Download video
  screen's File and Show panes in `PostShareSheet.svelte`.
- **Long content may scroll inside its own area.** Release notes, the
  library, a long saved list, a gallery or a log has no fixed length, and
  paging it would only add taps. Only that area moves. The frame around it,
  and any filters or controls above it, stay fixed.
- **A mixed screen splits the same way.** Filters and actions sit fixed and
  only the list under them scrolls.
- **A scrolling area uses a thin, themed bar that shows while it moves and
  fades when idle.** The global bar in `src/app.css` is thin and themed but
  always visible. The first content area that needs the fade builds it once
  as a shared primitive, and every later one reuses it.

## Checking

Measure before calling a screen done: the page's `scrollHeight` equals its
`clientHeight`, and no control container overflows, on desktop and on the
Fold's inner (707 by 772) and cover (412 by 915) screens. A content area
that scrolls is named in the report along with the reason it holds content
and not controls.
