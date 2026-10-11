# Studio project library: one fixed screen

Status: Austen handed this project over on 2026-10-10 ("take the wheel") after
approving the editor layout. The editor redesign waits for the video editor
move; this library stays in TKA (`src/lib/features/post/`) and does not touch
`PostModule.svelte` or the editor.

## Goal

The library is the first screen of Studio. It should answer two questions at a
glance: what can I open, and how do I start something new. It fills the
module's box on every screen without scrolling the page; only the project grid
moves.

## Evidence from the current library (2026-10-10, Austen's local data)

- Starting a project has two entry points: a "New project" button in the
  header and three large tiles (Tutorial video, Software showcase, Sequence
  arrangement) that take most of the first screen.
- One kind has three names: the tile says "Tutorial video", the filter says
  "Sequence videos" and the card says "Sequence video".
- The page scrolls as a whole. Search, sort and filters leave the screen as
  soon as the grid is browsed.
- A sync failure for one project fills a page banner: "The source sequence for
  post-draft-storage-fixture is unavailable. This post was kept on this
  device." The banner does not say which card it means and stays until a
  refresh.
- Three software showcases are all titled "Generate" (folders
  `generate-vertical`, `generate-desktop`, `generate-promo`). The cards cannot
  be told apart without opening them.
- Every cover carries a caption ("Source preview", "Playing source clip",
  "Source sequence") that says nothing the cover does not.
- Filter and sort are hand-rolled buttons; `chip-primitives.md` gives
  exactly-one choices to `SegmentedControl`.

## 1. Frame

`StudioProjectLibrary` fills its host (`height: 100%`) as a grid of fixed rows
and one scrolling area. The host in `PostModule.svelte` already gives it the
full height (`.project-list { height: 100%; overflow-y: auto }`), so its own
scroll never starts and `PostModule.svelte` does not change.

Fixed rows, top to bottom:

1. **Header.** "Your projects" with the total count (tabular figures), and the
   start group: three pill buttons, Tutorial, Showcase and Arrangement, each
   with its icon and a plus. Each opens `StudioProjectCreate` with that intent.
   The separate "New project" button, the eyebrow and the intro sentence go.
2. **Tools.** Kind filter as a `SegmentedControl` (All, Tutorials, Showcases,
   Arrangements, each with its count), search field, and sort as a
   `SegmentedControl` (Recent, Name).

Scrolling area (`overflow-y: auto`, `min-height: 0`, `overscroll-behavior:
contain`), in order: the list-level alert and notices, the project grid or
empty state, the From Compose section (`StudioArrangements`), and the storage
note that is now the footer.

## 2. Composition by container width

The library keeps its `studio-library` inline-size container. Thresholds stay
where they are (500 and 850, plus 2000 for six columns) so nothing else moves.

| Container width | Header | Tools |
| --- | --- | --- |
| Above 850 | Title left, start pills right, one row | Filter left; search and sort right, one row |
| 501 to 850 (Fold inner, tablet) | Title left, start pills right, one row | Search and sort on one row; filter on its own row |
| 500 and below (phones, Fold cover) | Title on its own row; the three start buttons share one row in equal columns, icon above label | Search and sort on one row; filter on its own row in equal columns |

Padding becomes `clamp(16px, 3vw, 48px)`, so a phone keeps a 16px gutter. The
grid keeps `auto-fill` columns and the 2000px six-column rule.

## 3. One name per kind

| Kind | Start button | Filter | Card label |
| --- | --- | --- | --- |
| tutorial | Tutorial | Tutorials | Tutorial |
| showcase | Showcase | Showcases | Showcase |
| arrangement | Arrangement | Arrangements | Arrangement |

`StudioProjectCreate`'s own intent cards keep their longer descriptions; this
change only renames the library's labels.

## 4. Problems belong to their card

`PostProjectChoice` gains an optional `problem` (one short sentence).
`listSyncedPostProjects` collects per-project failures by sequence id instead
of pushing them into the page error:

| Failure | Card sentence |
| --- | --- |
| Source sequence missing on upload | "Its source sequence is missing, so it stays on this device." |
| Upload threw for another reason | "It could not sync, so it stays on this device." (cause goes to `console.warn`) |
| Device draft not imported (missing source or unreadable draft) | "A copy from before sign-in could not be added to your account." |

After the list is built, each problem attaches to the choice with its id. A
problem whose id has no choice (the project is not in the list at all) stays in
the page error with its current wording, so nothing is lost. List-level
failures (cloud listing, browser storage unreadable) stay page errors.

`StudioLibraryEntry` carries `problem` through. The card shows a display-only
badge, "Not synced" with a warning icon, beside its kind label, and the
sentence as one line under the details. The badge is not a button. Opening and
copying still work.

## 5. Telling same-named projects apart

`studioLibraryEntries` adds `subtitle` when two or more entries of the same
kind share a title (case-insensitive, trimmed). For a software showcase the
subtitle is its folder name with the title's slug prefix removed and the first
letter capitalized ("generate-vertical" under "Generate" becomes "Vertical");
when the folder does not start with that prefix, the whole folder name. Other
projects get no subtitle; their details line already shows format and clip
count. The card shows the subtitle under the title in the secondary text style.

## 6. Covers

The cover caption (`.preview-label`) goes. The duration badge, the hover and
focus preview, and the unavailable states ("Loading preview…", "Empty
timeline", "Preview unavailable") stay. Composition-accurate covers wait for
the editor move.

## Motion

- The list-level alert and notices enter and leave with `growFade`.
- Grid cards reflow on filter, search and sort with `animate:flip={{ duration:
  flipDuration() }}`; the grid gets `position: relative`. The key stays
  `entry.id + ":" + entry.updatedAt`, so a newer save still reloads its cover.
- `SegmentedControl` owns its own indicator motion.
- The count uses tabular figures so a changing number does not shift the row.

## Units

| File | Change |
| --- | --- |
| `services/post-workspace-projects.ts` | `problem?: string` on `PostProjectChoice` |
| `services/post-account-projects.ts` | per-project problems attach to choices |
| `components/studio-library-entry.ts` | carries `problem`, computes `subtitle`, exports `studioKindLabels` |
| `components/StudioProjectLibrary.svelte` | frame, start pills, `SegmentedControl` filter and sort, flip grid |
| `components/StudioProjectCard.svelte` | labels from `studioKindLabels`, subtitle, problem badge, no cover caption |

## Tests

- `studio-library-entry`: subtitle for colliding showcase titles, none for
  unique titles, whole-slug fallback, `problem` carried through.
- `post-account-cloud`: a local project whose source is missing appears in the
  list with its `problem` set and the page `error` null; a cloud listing
  failure still sets `error`.

## Verification

At 375x667, 412x915 (Fold cover), 707x772 (Fold inner), 823x600, 820x1180,
1440x900, 1920x1080, 2560x1440 and 3840x2160, plus 200% zoom at 1440x900, on
`/post` with Austen's local data:

- The document and the library root have `scrollHeight` equal to
  `clientHeight`; only the grid area scrolls.
- The header, start buttons, filter, search and sort are on screen and fully
  visible; nothing overflows horizontally.
- The three Generate cards show Vertical, Desktop and Promo.
- The fixture project shows its Not synced badge and no page banner appears
  for it.
