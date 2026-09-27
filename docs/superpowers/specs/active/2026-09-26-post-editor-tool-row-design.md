# Post Editor Tool Row

Date: 2026-09-26. Replaces the layout sections of
`2026-09-26-post-studio-timeline-editor-design.md` ("settings beside the
preview"). The project model, timeline, keyframes and export are unchanged.

## Why

Austen, on the first build: selecting a clip filled the right-hand column with
a long mix of text, chip rows, toggles and a speed dial, with no obvious way to
crop. Phone editors keep three things on screen: the preview, the timeline and
one row of labeled tool buttons. He chose "Row + panel beside preview": the
preview, the timeline, then one row of tools at the bottom that changes with
the selection. One tool opens at a time. On a phone the open tool takes the
row's place. On a wide screen it sits beside the preview, in the space the
tall video leaves, so it never covers the preview or the timeline. The long
settings list goes away.

## Research summary

- Phone editors (InShot, Instagram Edits, CapCut, VN, YouTube Create, Premiere
  on iPhone) all stack preview, timeline, then one scrolling row of icon +
  label buttons that changes with the selection. A tool opens a compact panel
  closed with a check mark. Crop is its own tool. VN offers easing presets;
  keyframe diamonds sit by the playhead or in the tool.
- Wide editors (CapCut desktop, Clipchamp, Canva, Premiere Pro) show a
  selection-driven side panel.
- Nielsen Norman Group,
  [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/):
  keep secondary controls one step away, at most two levels deep. Label icons.
- Material 3 [bottom sheets](https://m3.material.io/components/bottom-sheets/overview)
  become side sheets on wide windows; M3
  [toolbars](https://m3.material.io/components/toolbars/overview) hold the
  frequent actions.
- Apple HIG [toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars):
  frequent commands in a toolbar, scoped tasks in a sheet.

## Layout

Three presentations of the same parts. Wide mode is measured from the
editor's own box: at least 56rem wide, or landscape and at least 36rem wide.
A short landscape screen (a turned phone, a zoomed-in laptop) keeps the panel
beside the preview, where it cannot cover it. The viewer's narrow columns and
the share sheet behave like a phone.

**Phone.** Rows: top bar, stage, transport, timeline, dock. The stage takes
the height the other rows leave it, at least 12rem and never taller than a
full-width 9:16 frame, so the preview, the timeline and the row fit on one
screen down to the iPhone SE. The dock holds the tool row. Opening a panel
tool swaps the row for that tool's panel, with a check-mark Done button that
returns to the row. The preview keeps the height it had, and the panel fills
the room under it and scrolls inside. When that room is under 14rem, the
panel may take half the editor, which then scrolls under the dock.

**Wide.** Rows: stage row, transport, timeline, tool row. The stage row
centers the preview and a side column as one group; the preview's width comes
from the row height (9:16), so the column sits right beside the video. The
column holds the top bar with the panel under it. The panel always shows a
tool: the active tool when the selection has it, otherwise the selection's
default. There is no Done button. The stage row is at least 15rem; a shorter
window scrolls.

The dock and the wide tool row stay at the bottom of the scrolling editor, so
the tools are on screen at any height. Tools, panels and the dock swap with
`Crossfade` in swap mode at `DURATION.fast`: the old set fades out before the
new one fades in, so two sets of labels never overlap. Reduced motion makes
the swap instant.

**Viewer.** When the viewer shell offers its side inspector, the panel host is
reparented there (`reparentToInspector`); the editor stacks top bar, stage,
timeline and row. It behaves like wide.

**Beat tapping.** The stage shows `PostTimingStage` and the panel host shows
Back to editing plus `PostTimingPanel`. The top bar, timeline and row are
hidden.

## Tools

Rows depend on the selection. Panel tools open a panel; action tools act at
once. The first panel tool in a row is its default.

| Selection        | Row                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| Nothing (post)   | Videos, Add, Split, Tutorial, Look                                                                                  |
| Video clip       | Back, Split, Trim, Crop, Speed, Volume, Layout (main-track clips), Position, Fade, Beats, Rename, Duplicate, Delete |
| Animation        | Back, Split, Labels, Timing, Position, Fade, Rename, Duplicate, Delete                                              |
| Moves or mandala | Back, Split, Shows, Timing, Position, Fade, Rename, Duplicate, Delete                                               |
| Carousel         | Back, Split, Timing, Position, Fade, Rename, Duplicate, Delete                                                      |
| Text             | Back, Split, Text, Timing, Position, Fade, Rename, Duplicate, Delete                                                |
| Card             | Back, Split, Timing, Position, Fade, Rename, Duplicate, Delete                                                      |

The top bar holds Undo, Redo (the app's Ctrl+Z and Ctrl+Y targets) and
Export. Export deselects and opens the Export panel; it no longer renders on
the first press.

### Control grammar

One control style per kind of value, and no help paragraphs inside tools:

- An amount is a `ValueSlider`: a track with the value shown beside the name.
- A pick, including an on/off property, is a `SegmentedControl` with named
  options.
- An action is a `PanelButton`.
- A short status line (locked layer, playhead outside the item, silent post)
  may appear with the action that resolves it.

### Panels

| Tool     | Contents                                                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Videos   | `PostMediaPanel`, unchanged                                                                                                            |
| Add      | Buttons: video from this device, each saved video, animation, moves, mandala, carousel, text, card at the end                          |
| Look     | `AnimationPanel layout="sidebar"` (prop type and colors), unchanged                                                                    |
| Export   | `PostExportPanel` (sound, to-do list, render, download), unchanged                                                                     |
| Trim     | In and Out readouts, each with Set to playhead                                                                                         |
| Timing   | Overlays: Match clip or Own time; with own time, Start and End each with Set to playhead. Main-track card: Length with End at playhead |
| Crop     | Keyframes; Zoom and Rotation sliders; Fill or Show all and Normal or Mirrored, on one line when there is room; Reset                   |
| Speed    | Speed slider, 0.25× to 4×                                                                                                              |
| Volume   | Volume slider, 0 to 200%; a silent post shows a status with Use the videos' sound                                                      |
| Layout   | Dual view, Breakdown or Video only                                                                                                     |
| Position | Keyframes; the kind's placement presets (a button when there is only one)                                                              |
| Fade     | Keyframes; Opacity, Fade in and Fade out sliders                                                                                       |
| Labels   | Beat and letter: Shown or Hidden                                                                                                       |
| Shows    | Arrows, Mandala or Both in turn                                                                                                        |
| Text     | The words and Small, Medium or Large                                                                                                   |
| Rename   | The name field                                                                                                                         |

A locked layer's panel shows a status with Unlock layer and disables its
controls. Adding text opens its Text panel so the words can be typed at once.

### Keyframes

`PostKeyframeControls` (previous, diamond, next and the Curve chip) sits at
the top of Crop (framing), Position (box) and Fade (opacity). The K key keys
the channel of the tool on screen; with no animatable tool showing it keys
framing for a video and the box for anything else. When the playhead is
outside the item, those panels show a status with Go to clip, and animated
values are read-only as before.

### Crop on the preview

While Crop is on screen for a video, the canvas is in crop mode:

- A press anywhere on the frame pans the picture; no resize handles show and
  the press does not select another item.
- A rule-of-thirds grid shows on the clip's box.
- During a drag or a pinch the clip's whole source shows past the box, with a
  dim mask outside it (`PostStudioMediaLayer` gains `revealOverflow`, which
  draws the video at its fitted size instead of cropping it in place).
- Ctrl/Cmd + wheel and a two-finger pinch zoom, as before.
- Opening Crop from the row seeks into the clip when the playhead is outside
  it. Showing Crop as the wide default does not seek.

Outside crop mode, the drag rule stays: a video that fills the frame pans its
picture, anything else moves its box. The old Box/Picture switch and
`editor.previewDragTarget` are removed.

### Keys and focus

- Escape closes an open phone panel first, then clears the selection.
- Opening a phone panel moves focus into it; Done returns focus to the tool
  button that opened it. On wide, the row behaves like tabs and focus stays
  on the button.
- A range slider owns its arrows, Home and End; editor shortcuts still work
  while it has focus.
- When a pick on the timeline or the preview swaps the tools that hold focus,
  focus moves to their holder first, so Tab continues into the new tools.
- Delete, by key or tool, moves focus to the new row's first tool.
- Tap beats moves focus into the tapper's controls, and Back to editing
  returns it to the editor.

## Ownership (primitive discovery)

Searches: `slider`, `type="range"`, `role="slider"`, `ScrubbableNumber`,
`ParamSlider`, `toolbar`, `tool row`, `dock`, `bottom sheet`, `Crossfade`,
`previewDragTarget`.

| Capability              | Current owner                                              | Outcome                                                                                                 |
| ----------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Selection               | `editor.selectedItemId`, timeline and canvas               | keep                                                                                                    |
| Tool choice             | none (every setting shown at once)                         | create: `post-editor-tools.ts`, a pure model of rows, defaults and the shown tool                       |
| Pointer input (preview) | `PostEditorCanvas` box and picture drags                   | extend with `cropMode`; remove the Box/Picture switch                                                   |
| Keyboard input          | workspace `handleKey`                                      | extend: K follows the tool, Escape closes a phone panel, range inputs own their keys                    |
| Amount input            | `ScrubbableNumber`                                         | replace in the editor with new shared `ValueSlider`; `ScrubbableNumber` stays for dense tools elsewhere |
| Pick input              | mixed `FilterChipBase` toggles and `SegmentedControl`      | replace with `SegmentedControl` only                                                                    |
| Actions                 | `.post-editor-tool` buttons, `FilterChipBase` action chips | replace with the row's buttons and `PanelButton`                                                        |
| Motion                  | `Crossfade animateHeight` on the inspector                 | keep: `Crossfade` in swap mode for the dock, the side panel and the row                                 |
| Feedback                | hint paragraphs                                            | remove (Austen rejected them); keep short status lines with actions                                     |
| Responsive layout       | container queries at 56rem and 36rem                       | replace with measured wide mode (width, or landscape width) plus the viewer's external inspector        |
| Detail surfaces         | `PostSettingsPanel`, `PostItemSettings`                    | replace with `PostToolPanel` and `PostItemTool`                                                         |
| Add menu                | `PostEditorAddMenu` (bits-ui dropdown)                     | replace with the Add panel; its placement rules move to `post-editor-add.ts`                            |
| Typography and color    | theme tokens                                               | keep; tool labels 0.875rem, readouts tabular                                                            |

**`ValueSlider` decision.** Creating the labeled range slider with
`src/lib/shared/ui/components/ValueSlider.svelte` as owner. The closest
match, `ScrubbableNumber`, is a scrub-to-change number with no visible track,
built for dense desktop tools; a phone editor's amounts need a track and
thumb that show where the value sits and can be grabbed with a thumb.
`ParamSlider` (scene lab) and `PerformerPropSizeSlider` (3D) are feature-local
copies with no accessible value text. About 80 other files draw raw range
inputs; they are not migrated here.

## Verification

- Unit: `post-editor-tools.ts` (rows per selection, defaults, the shown tool,
  the K channel); existing post editor history and picture pan tests.
- Compile every changed `.svelte` file directly (svelte-check misses compile
  errors), then the lighter type check.
- Browser, from the task worktree on a free port: all seven viewport tiers and
  200% zoom; open and close a phone panel; switch tools on wide; crop drag with
  the reveal; K with Crop, Position and Fade; Escape order; reduced motion.
- `ui-bust` review with the VR-1 template (self-review, less independent).

## Follow-ups

- A shorter timeline on short laptops: its zoom row and the empty space under
  a few lanes could go to the preview.
- Export in the top bar shows no pressed state while its panel is open.
- The Tutorial tool's hint is long.
- Migrating the app's other range sliders to `ValueSlider`.
