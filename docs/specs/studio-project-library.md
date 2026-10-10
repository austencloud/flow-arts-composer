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
sequence. Showcases can start blank, import footage from the device, or copy a
saved project. Importing footage opens it on the timeline; cancelling the file
picker creates nothing. A blank showcase can add footage, images and text later.
Arrangements ask for their first sequence only after that intent is selected.

Source-free showcases store `sourceKind: "none"` and a title in the project.
The existing `sequenceId` field remains the opaque project storage identity;
it does not imply a source sequence exists. Legacy projects without the marker
still require their real sequence. Source-free projects skip sequence loading,
sequence-only tools and sequence render preparation. Their edits, independent
copies, drafts and exports use the same timeline and media pipeline.

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
snapshots; missing sources do not trigger a public-library download. Device-local
video files need relinking after a reload or on another device; project edits
are saved, but device-local video bytes are not stored with them.

## Source-free showcase verification, 2026-10-10

Thirteen focused suites passed with 88 tests covering project loading, account
and draft storage, independent copies, arrangements, and editor state. A later
regression check passed seven tests across two suites, including preserving the
destination's source identity when importing an older backup. The full Svelte
check reported zero errors and warnings before final integration.

An isolated browser created a blank showcase, saved and reopened it, made an
independent copy, and imported footage directly into a new showcase. A saved
footage project reopened and accepted its original file without loading a
sequence. It exported a playable 1080×1920 MP4 lasting 1.73 seconds. Independent
playback of the downloaded file confirmed its dimensions and duration.

The showcase choices were inspected at 375×667, 960×412, 820×1180, 1440×900,
1920×1080, 2560×1440 and 3840×2160 CSS pixels without horizontal overflow.
Evidence and logs: `E:/tmp/studio-source-free-20261010/`. Browser checks used
isolated storage and blocked external requests; live cloud round trips and
real 200% browser zoom were not exercised.
