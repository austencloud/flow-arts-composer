# Studio editor layout: CapCut pattern on every screen

Status: design approved by Austen on 2026-10-10 (sections 1 and 2 approved
one by one, then "take the wheel" for the rest; sections 3 to 6 use the
recommended options). Sequencing against the video editor extraction is
recorded under "Sequencing" below.

## Goal

Studio makes finished videos: tutorials from sequences, showcases from
footage, and arrangements. Putting clips in order is the job that takes the
most time. The editor must work equally well on a desktop monitor and on a
phone, including both Z Fold6 screens, and it keeps a real multi-track
timeline on every screen. CapCut and InShot are the models.

## Evidence from the current editor (2026-10-10, project "1.0 promo rough cut")

- At 2560 by 1350 CSS pixels the portrait preview is 462 by 816, the side
  panel is 1200 wide (half the screen) and its Videos list is 3 times taller
  than the panel, and the timeline is 280 tall for four tracks.
- At 1024 by 768 the preview is about a quarter of the width; opening Add
  shrinks it further and it rendered blank white.
- The Videos panel lists 13 recordings, 10 of them unused, each with Tap
  beats, Add clip and Remove buttons.
- Add mixes 12 sources, layouts and one-off actions in one scrolling grid.
- Timeline clip names truncate to one or two letters ("C...", "Ca...").
- Save state shows twice: an autosave status and a Save button.
- `post-editor-tools.ts` already gives each selection its own tool row, and a
  phone already opens one tool's panel in place of the row. That model stays;
  this design changes where the row and panels sit at each size.

## 1. Layout tiers

The tier comes from the editor's own box, not the device. One pure function
decides it from the box size and the project's aspect ratio, and the editor
root carries the result as `data-tier`.

| Tier | Editor width | Composition |
| --- | --- | --- |
| Desktop | 1280 and up | Media panel left, player center with transport under it, details panel right, full-width timeline at the bottom with its tool row on top. Panel edges resize by drag. |
| Medium | 600 to 1279 | Preview with one panel. The panel shows media when nothing is selected and the selection's details otherwise. Timeline always visible below, toolbar at the bottom. |
| Phone | under 600 | Preview on top, then play, time, undo and redo, then the timeline with a fixed center playhead, then the toolbar. Media and details open as a sheet over the timeline and toolbar, never over the preview. |

Medium places its panel beside the preview or below it, whichever leaves the
larger preview. A portrait project on the Fold inner screen (707 by 772)
gets the panel beside it; a landscape project on a tall window gets it
below. The thresholds are starting values, checked at the verification sizes.

Every tier is a fixed frame. The page never scrolls. Only the media grid,
the details panel body and the timeline scroll inside their own areas.

### Header

Back to Projects, the project title, the autosave status, the more-actions
button and Export. The separate Save button goes; the editor already saves on
its own and Ctrl+S still saves at once. Export opens its own screen instead
of a side panel. Redesigning the export screen itself is a later pass.

## 2. Media panel

Six pill tabs: Videos, Sequence, Text, Cards, Audio, Templates. On a phone,
each toolbar button opens the sheet on its tab.

- **Videos.** "Video from this device" first, then a thumbnail grid of every
  recording in the project including the sequence's saved videos, in two
  groups: "In this video" and "Not used yet". Each thumbnail shows its length
  and a sync mark when its landings are tapped. Pressing a thumbnail plays it
  in the player with start and end marks, so a part of a long recording can
  be added. The + on a thumbnail adds it at the playhead; desktop can also
  drag it onto a track. Remove lives in that preview, not on every row.
- **Sequence.** Live tiles for Animation, Picture in picture, Mandala,
  Carousel and Arrangement from the project's sequence. New arrangement opens
  the arrangement editor on its own screen, as today.
- **Text.** Text and Titles, each shown as a sample.
- **Cards.** Choreo card (goes at the end) and the opening tunnel hook (goes
  at the start). One already in the edit shows Remove instead of +.
- **Audio.** The current track with Replace and Remove.
- **Templates.** The Tutorial layout and the ΩΛ-XJ template, each with its
  existing one-line hint and an Apply button. Applying is one undo step.

Layout choices (split screen, beside the footage, inset) are properties of
the selected clip in its details, never items to add.

Project settings (ratio and background from Canvas, animation defaults from
Look) show in the desktop details panel when nothing is selected. Medium and
phone open them from a Project button in the toolbar.

## 3. Clip details and the toolbar

The details panel header shows the selection's name, which renames in place.
Under it, the selection's panel tools appear as pill tabs, grouped so no
selection has more than six. Each group stacks the existing panels it holds.

| Selection | Tabs |
| --- | --- |
| Video | Trim; Frame (crop, layout, position, border, fade); Speed; Sound (volume); Look (effects); Transition |
| Animation | Look (appearance); Sequence; Speed (tunnel hook only); Frame (crop when it has a backdrop, position, fade); Timing; Transition |
| Opening tunnel | Look (appearance); Speed; Frame (crop when it has a backdrop) |
| Picture in picture | Look (appearance); Shows; Sequence; Timing; Frame (position, fade); Transition |
| Arrangement | Arrangement; Timing; Frame (position, fade) |
| Card | Look (appearance); Sequence; Timing; Frame (position, fade); Transition |
| Text | Text; Timing; Frame (position, fade) |
| Titles | Titles; Timing; Frame (position, fade) |
| Carousel | Timing; Frame (position, fade); Transition |
| Image | Look (QR images only); Timing; Frame (position, fade); Transition |
| Music | Music |

- **Desktop.** Split, Duplicate and Delete move to the timeline tool row,
  beside Undo and Redo, with S, Ctrl+D and Delete unchanged. A video clip's
  details carry a Sync moves button. Clicking empty timeline clears the
  selection and the panel returns to project settings.
- **Medium.** The panel shows the same tabs as desktop. The bottom toolbar
  holds Split, Duplicate, Delete and Sync moves for a selection, and the
  media and Project buttons when nothing is selected.
- **Phone.** Today's row stays: back arrow first, horizontal scroll like
  CapCut, most used first. Sync moves sits right after Split for a video
  clip. A tool opens its panel as a sheet over the timeline with a check
  button to close.

## 4. Timeline

- Track headers (name, visibility, lock) stay on the left; phone shrinks them
  to icons.
- Main-track clips show a thumbnail strip with the name over it. A clip too
  narrow for its name shows the thumbnail alone and its full name when
  selected or hovered, never a one-letter stub.
- Phone and medium keep the playhead fixed at the center; the timeline
  slides under it while playing or dragging. Pinch zooms. Holding a clip
  picks it up; the main track shrinks to tiles while it moves (CapCut), and
  the order animates through the keyed-list owner. A + at the end of the
  main track opens the Videos tab.
- Desktop keeps a free playhead: click the ruler to seek, drag clips with the
  mouse, zoom controls at the right of the tool row.
- A video clip whose landings are tapped shows tick marks at each landing.

## 5. Sync moves screen

The existing timing mode (`editor.mode = "timing"`) becomes its own screen
in every tier: header with Back, the clip's name and "Sync moves"; the
video as large as fits; the existing tap logic and summary text
(`timing-summary.ts`); a large Tap button (Space on a keyboard), play,
restart and Done. Done returns to the editor with the clip still selected and
its ticks on the timeline. Entry points: Sync moves on a selected video clip,
and the sync mark on a Videos thumbnail.

## 6. Motion and stability

Panels entering and leaving go through `PanelGroup.svelte`; tab and panel
swaps through `Crossfade`; the main track reorder through `animate:flip`
with `flipDuration()`; tier changes through `createLayoutMotion()`. Status
text keeps a ghost-sized width. No raw durations or easing in feature code.

## Units

- `editor-tier.ts`: pure. Box size and project aspect in; tier and medium
  panel placement out. Unit tested at every verification size.
- `post-editor-tools.ts`: gains `toolGroups(selection)` returning the tabs in
  section 3 from the existing `toolRow`. Unit tested per selection kind.
- `PostEditorFrame.svelte`: the three compositions as grid areas keyed by
  `data-tier`; slots for header, media, player, details, timeline, toolbar.
- `PostMediaPanel` (reworked) with one component per tab.
- `PostDetailsPanel.svelte`: header plus grouped tabs, hosting the existing
  tool panels unchanged.
- Timeline: center-playhead scrolling and hold-to-drag as a mode of the
  existing `timeline/` components, chosen by tier.
- `PostSyncScreen.svelte`: the timing mode's screen.

`PostEditorWorkspace.svelte` (4,120 lines on 2026-10-10) loses its layout
markup to the frame and keeps the state wiring.

## Verification

- Unit tests for the tier function and the tool groups.
- In a real browser, at 375x667, 960x412, 820x1180, 1440x900, 1920x1080,
  2560x1440 and 3840x2160, plus the Fold cover (412x915) and inner screens
  (707x772 portrait, 823x600 landscape) and 200% zoom: no page scroll
  (`scrollHeight` equals `clientHeight` on the document and the editor root),
  preview area recorded, each tab and sheet opened, a clip reordered by
  hold-and-drag on a touch viewport, the sync screen opened and closed.
- An export of a real project still matches the preview after the move.

## Out of scope

The project library page, the export screen's contents, the arrangement
editor's internals, and the "Opening project" stall (its own task).

## Sequencing

The video editor extraction (`codex/video-editor`, step 2 of
`2026-10-07-video-editor-extraction-design.md` in shared-packages) is moving
this editor's state and then its UI into `@austencloud/video-editor` for
Ringmaster. Step 2B moves the UI files this design rewrites. Building both at
once in separate branches guarantees heavy conflicts in
`PostEditorWorkspace.svelte`, and redesigning during the move breaks the
extraction's verbatim-move parity checks.

Decided by Austen on 2026-10-10: the redesign waits for the move. Once step
2B lands (`docs/superpowers/plans/2026-10-10-video-editor-step-2b-ui.md` in
the shared-packages worktree; its plan holds "no restyle" until the move is
done), this design is built in `@austencloud/video-editor` so Studio and
Ringmaster both get it. The units above then live in the package's
`src/ui/`, and the TKA-specific parts arrive through the plugin: the
Sequence, Cards and Templates tabs through `ui.addItems`, the Sync moves
screen through `ui.modes` (the timing mode stays in tka's `builder/`), and
the grouped tabs from the plugin's `ui.toolRow`. Step 3 (Ringmaster) and
this redesign touch the same files, so the extraction's controller orders
them. The Studio project library stays in tka and is redesigned separately.
