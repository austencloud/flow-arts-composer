# Studio project library

## Brief

For Austen and returning Studio users choosing an edit or making the next video.
The library must identify a project's contents before opening the editor, and
ask what to create before offering a sequence browser. Recurring tutorials,
software showcases, and sequence arrangements share one library.

Success: recognizable real previews, visible duration and format, an accessible
creation flow, independent copies that leave the source intact, and no editor
or running animation per library card. Existing account isolation, drafts,
feature folders, imports, and URLs retain their owners.

## Composition decision

Compared using the existing three tutorial drafts and Generate feature videos:

- A: compact rows with a large selected-project inspector. Efficient for long
  libraries, but hides most previews behind another selection and repeats the
  current problem for the projects that are not selected.
- B: a full-width gallery of actual project covers with title, duration, format,
  and contents directly below. A small creation band exposes the three intents;
  search and filters keep growing collections manageable.

Choose B. Recognition across the collection matters more than maximizing rows.
Cards represent separate saved artifacts. The canonical sequence thumbnail
renderer supplies sequence artwork; media previews play only on deliberate
hover/focus, one at a time, respecting reduced motion. BaseModal owns creation
focus, dismissal and scrolling. The project page owns its single scroll area.

## Creation

Tutorials can reuse a saved edit as an independent copy or start from another
sequence. Showcases can copy a saved feature video, including its media, or
start with an explicitly selected source sequence. Arrangements ask for their
first sequence only after that intent is selected. This change does not invent
a source sequence to bypass the editor's existing source requirement.

## Review

Visual rubric VR-1, dated 2026-09-21. Calibration status: NOT CALIBRATED.
Research ledger checked 2026-09-21; no refresh required for this review.
Opus consultation attempted 2026-10-10; weekly usage limit prevented a response.
No Claude endorsement is implied. An independent reviewer passed the observed
responsive states after correcting the sparse ultrawide layout.

## Verification, 2026-10-10

Six focused Vitest suites passed: 51 tests covering previews, independent
copies, feature duplication, account storage and draft isolation.

The isolated browser exercised intent selection before browsing, cancellation
back to the selected intent, search and type filters, one active hover preview,
reduced motion, tutorial copies, feature-folder copies with independent media,
long names, empty and no-match states, and retry after a project-list failure.
Original projects remained unchanged. Missing archived sources remained local
unavailable previews. Both functional runs reported zero page errors.

Layout was inspected at 375×667, 960×412, 820×1180, 1440×900, 1920×1080,
2560×1440 and 3840×2160 CSS pixels. No horizontal overflow was detected.
Browser evidence and logs: `E:/tmp/studio-project-library-20261010/`.
The browser used isolated project/media copies and blocked external requests;
it did not verify a live account's cloud round trip. Real 200% browser zoom
was not exercised.

Previews show source artwork or source media, labelled accordingly. They are
not renders of the finished composition. Background cards use saved sequence
snapshots; missing sources do not trigger a public-library download. A fresh
showcase still needs an explicit source because the current editor requires
one. Reusing a saved showcase avoids that selection. Device-local video files
may need relinking on another device.
