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
- (2026-10-11, project "ΩΛ-XJ", 412 by 915) The track header column (eye
  and lock, no names) is 111 of the 412 pixels on every row. The main track
  is 65 tall and each other layer 52, so four rows fill the timeline area.
  Short text clips read "A N" and "A I".
- (2026-10-11, same project, 2560 by 1350) The portrait preview is 462 by
  821 inside a 1246-wide area, so about 780 pixels beside it are empty. Its
  size is bound by height: under it sit the transport, a 64-tall tool row
  and a 280-tall timeline.
- The timeline fits the whole project once when it mounts
  (`fitPixelsPerSecond` in `PostTimeline.svelte`) but never refits when its
  width changes, so a window or panel resize leaves the project filling
  part of the width or running off it.
- (2026-10-11, walkthrough in `/test/post-studio?sequence=ΩΛ-XJ`, nothing
  saved) Selecting a video clip adds a keyframe strip ("Position · 6
  keyframes") above the timeline, which pushes the main track below the
  timeline's bottom edge (its label at 1317, the timeline ending at 1306),
  so the clip just selected leaves view. Selecting a clip leaves the
  playhead where it was: with the playhead at 0:00, selecting the
  "Mirror me!" text shows its settings while the preview shows a moment
  before that text appears.
- (2026-10-11, same walkthrough, 707 by 772) The portrait preview is 108 by
  192, a quarter of the height. There is no side panel; the 64-tall tool
  row and an open keyframe lane push the timeline past the bottom edge, so
  the main track is cut off.
- (2026-10-11, same walkthrough, 412 by 915) Selecting a video clip turns
  the row into 15 tools (Deselect, Split, Trim, Crop, Speed, Volume,
  Layout, Position, Border, Fade, Effects, Beats, Rename, Duplicate,
  Delete), of which 5 fit on screen; a title clip has 8. The keyframe strip
  shrinks the preview from 169 by 301 to 113 by 202. Its "Clip actions"
  button holds one item, "Remove all keyframes", which the more-actions
  menu also has. Split is greyed with no reason given, because the
  playhead sits at the clip's start. Add, Canvas, a clip's tool and Export
  each open in place of the row and push the timeline down: the editor
  scrolls (962 to 1063 tall in 899) and the main track leaves the screen.

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
Austen confirmed the Fold inner layout on 2026-10-11: the panel sits beside
a portrait preview (about 420 by 450) and the timeline keeps the full width
below, so the preview grows to about 224 by 398 from 108 by 192.

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
- **Phone.** The row uses the same groups as the tabs above (Austen,
  2026-10-11): back arrow first, then Split, Sync moves for a video clip,
  the selection's tabs, then Duplicate and Delete. A video clip's row reads
  Split, Sync moves, Trim, Frame, Speed, Sound, Look, Transition, Duplicate,
  Delete: 10 buttons instead of 15, still scrolling sideways like CapCut
  when they don't fit. A button opens its group as a sheet over the
  timeline, with the group's panels as pill tabs inside (Frame holds crop,
  layout, position, border and fade) and a check button to close. Rename
  goes: tapping the name in the sheet header renames in place.
- **Split, every tier.** Split never greys out. With the playhead at a
  clip's edge, as it is right after selecting, pressing Split shows a short
  note by the toolbar, "Slide the playhead into the clip to split it", and
  changes nothing (Austen, 2026-10-11). S on a keyboard does the same.

## 4. Timeline

- Desktop and medium keep the track headers (name, visibility, lock) in a
  fixed column on the left.
- Phone has no fixed header column (Austen, 2026-10-11). Each track's header
  (name, hide, lock) sits in the empty space before 0:00 that the centered
  playhead leaves, and scrolls away with the clips once the playhead moves
  into the video (CapCut). Clips get the full width while editing.
- Phone row heights: the main track is 64 tall with its thumbnail strip;
  every other layer is a 40-tall row (Austen, 2026-10-11). Four tracks take
  about 190 instead of 300, and the space goes to the preview. More tracks
  scroll inside the timeline.
- Main-track clips show a thumbnail strip with the name over it. A clip too
  narrow for its name shows the thumbnail alone and its full name when
  selected or hovered, never a one-letter stub.
- A layer clip (text, animation, card) too short for its name lets the name
  run past its end in secondary text when the track is empty up to the next
  clip, and shows only its kind icon when another clip is in the way
  (Austen, 2026-10-11). The selected clip's full name also shows in the
  toolbar or details header. Never a one-letter stub.
- Phone and medium keep the playhead fixed at the center; the timeline
  slides under it while playing or dragging. Pinch zooms. Holding a clip
  picks it up; the main track shrinks to tiles while it moves (CapCut), and
  the order animates through the keyed-list owner. A + at the end of the
  main track opens the Videos tab.
- Desktop keeps a free playhead: click the ruler to seek, drag clips with the
  mouse, zoom controls at the right of the tool row.
- Desktop and medium give height to the preview first (Austen,
  2026-10-11). The timeline opens just tall enough for its tracks (ruler
  plus rows; about 210 for a four-track project), and the tool row joins
  the timeline's top edge as a 40-tall strip. On a 2560 by 1350 window a
  portrait preview grows from 821 to about 925 tall; at 1920 by 1080 from
  about 550 to 655. Dragging the timeline's top edge gives it more room,
  and Studio remembers that height on the device.
- Zoom on open (Austen, 2026-10-11). Desktop and medium fit the whole
  project and keep refitting when the timeline's width changes, until the
  person zooms by hand; after that their zoom stays. Fit returns to the
  refitting state. Phone opens at about 10 seconds across the timeline
  (CapCut), since fitting a long project into the half after a centered
  playhead leaves clips a pixel or two per second. Pinch zooms, and the
  pinched zoom is remembered per project on the device.
- A video clip whose landings are tapped shows tick marks at each landing.
- Selecting a clip whose time range does not hold the playhead moves the
  playhead to the clip's start, so the preview shows what is being edited;
  a playhead already inside the clip stays (Austen, 2026-10-11). Only the
  playhead moves, so undo history is unchanged.
- A selected clip shows its keyframes as small diamonds on the clip itself,
  at each keyframe's time (CapCut). There is no separate keyframe strip, so
  selecting never changes the timeline's height or pushes a track out of
  view (Austen, 2026-10-11).
- Keyframes are added from a diamond button beside the time in the play
  row, shown while a clip is selected (Austen, 2026-10-11, for the phone;
  desktop and medium use the same button in their transport so keyframes
  work one way everywhere). Pressing it adds a keyframe at the playhead on
  the channel the K key keys today (`keyframeChannelFor`: the open Frame
  part's crop, position or fade, else crop for a video and position for
  anything else). The diamond fills in when the playhead sits on a
  keyframe, and pressing it then removes that one. Removing all of a clip's
  keyframes lives in the Frame group. The "Clip actions" button goes; the
  more-actions menu keeps its own Remove all keyframes.

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
