# Post Studio Crop Editor

Status: approved by the request of 2026-09-27 ("do some deep research on what
the most intuitive cropping patterns are and see if you can give the whole crop
system another high tier pass"). Review label: self-review, less independent.

## Problem

Crop opens a side panel and leaves the picture where it was: a small slot inside
the 9:16 post preview. Measured on the test route with the DCKΨ- take in the top
half of the frame:

| Viewport  | Crop window on screen | Room the rest of the editor takes |
| --------- | --------------------- | --------------------------------- |
| 375×667   | 108×96 px             | panel 385 px of 667               |
| 1440×900  | 223×198 px            | timeline 280 px, tool row, panel  |

The window you frame through is about the size of a thumbnail. Austen's point
is that other editors give crop its own screen for the clip.

## What other editors do

Sources were read on 2026-09-27; anything a source did not state is marked
unverified.

**A dedicated crop screen with explicit Done.** Apple Photos puts Crop in a
mode inside Edit, with Reset and Done, a straighten dial (±45°), a 90° rotate
button and a horizontal flip
([Apple](https://support.apple.com/guide/iphone/crop-rotate-flip-straighten-photos-videos-iph0f3ebb1dd/ios),
[iDownloadBlog](https://www.idownloadblog.com/2019/07/15/crop-video-ios-13/)).
Google Photos has a Crop tab with a ±45° tilt bar, a 90° rotate button, Auto
straighten, Mirror and Reset; its April 2026 update fixed a preview that shrank
while the handles were dragged and added animated re-fits
([Google](https://support.google.com/photos/answer/10729480),
[9to5Google](https://9to5google.com/2026/04/14/google-photos-android-crop-tool-updates/)).
InShot's Crop tool has its own Done or Save
([InShot tutorial](https://inshotapps.com/how-to-crop-video-in-inshot/)).

**Timeline editors often crop in place.** CapCut desktop overlays the crop box
on the normal preview with the timeline still visible
([CapCut](https://www.capcut.com/resource/how-to-crop-video-in-capcut-pc)).
LumaFusion's Frame & Fit is a tab of a clip editor opened by double-tapping the
clip; the timeline stays underneath, and there is no Cancel/Done
([LumaFusion reference guide](https://luma-touch.com/wp-content/uploads/2018/07/LumaFusion-Reference-Guide.pdf),
[current manual](https://lumatouch.clickhelp.co)). Instagram Reels crops by
pinching the live clip. Adobe Premiere for iPhone keeps crop in the clip's
toolbar ([Adobe](https://helpx.adobe.com/premiere/mobile/manage-clips/change-the-aspect-ratio-of-clips.html)).

So a separate crop screen is the single-asset convention, and in timeline
editors it is common but not universal. Austen's experience of it is itself the
product requirement here, and NN/g's guidance on modes supports one when the
mode is unmistakable and has explicit exits
([NN/g, Modes](https://www.nngroup.com/articles/modes/),
[NN/g, Cancel vs. Close](https://www.nngroup.com/articles/cancel-vs-close/)).

**Animation belongs to the framing.** CapCut, InShot, VN and Instagram Edits
keyframe position, scale and rotation, not the crop box
([CapCut keyframes](https://www.capcut.com/resource/how-to-add-keyframes-in-capcut),
[VN](https://vlognow.me/blog/features/keyframe-control/)). LumaFusion and
Premiere for iPhone (April 2026) can also keyframe the crop
([LumaFusion cropping](https://lumatouch.clickhelp.co/articles/#!lumafusion-reference-guide-publication/cropping),
[Adobe release notes](https://helpx.adobe.com/premiere/mobile/whats-new/release-notes.html)).
Post Studio's framing (zoom, pan, turn) is keyframed today and stays so; the
window is the slot, whose own position is the Position tool's keyframed box.
That matches CapCut's split of canvas, crop and transform without adding a
fourth concept.

**Two ways to move.** Mobile editors move the picture under a fixed frame
(Apple Photos pinch, Instagram, CapCut mobile, react-easy-crop); desktop tools
drag a box over a fixed picture (Google Photos, CapCut desktop,
react-image-crop). Apple Photos combines them: drag a corner to crop closer, and
on release the crop re-fits the view and the picture grows to match.

**Accessibility and feel.** WCAG 2.2 asks for a non-drag way to do every drag
(2.5.7) and for targets of at least 24 px (2.5.8)
([2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html),
[2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)).
Keyboard croppers use arrows, Shift for larger steps and +/- for zoom
([Ark UI](https://ark-ui.com/docs/components/image-cropper)). Announce the
result when a gesture settles, not on every pixel
([Soueidan](https://www.sarasoueidan.com/blog/accessible-notifications-with-aria-live-regions-part-1/)).
Honor the in-app reduced-motion setting as well as the OS one; Liferay's
cropper once honored only the OS one
([Liferay PR 8957](https://github.com/liferay-content-management/liferay-portal/pull/8957)).
Dim what the crop leaves out rather than hiding it
([NN/g, Direct Manipulation](https://www.nngroup.com/articles/direct-manipulation-analysis/)).
Pintura's crop is the cited benchmark for never exposing empty corners when
rotating or zooming ([Pintura](https://pqina.nl/pintura/docs/v8/api/plugins/crop/)).

## Compositions compared

All three use the same content: the DCKΨ- take in the top-half slot.

- **A. Crop screen (recommended).** Crop takes over the stage. The slot's window
  is fitted large in the middle of the stage with the whole picture around it,
  dimmed. The timeline and tool row step aside; a time bar for the clip sits
  under the stage; the crop controls fill the panel; the top bar carries Undo,
  Redo, Reset, Cancel and Done. Largest window, clearest mode, and the picture
  outside the slot stays visible.
- **B. Zoomed frame.** Keep the normal layout but zoom the post preview until the
  slot fills it. The timeline stays for keyframes, but the window is still
  limited by the preview's height and the neighbouring items crowd it.
- **C. In place, polished.** Today's layout with better handles and auto-cover.
  Cheapest, and it keeps the thumbnail-sized window Austen called out.

A wins on the defect itself (window size) and on the research. It gives up the
full timeline while cropping; the clip time bar with keyframe marks and the
keyframe controls cover the framing work, which is the only timeline work the
crop needs.

## The crop screen

### Entering and leaving

- Crop in the tool row opens the screen for the selected clip. The playhead
  moves inside the clip if it was outside, as today.
- **Done** keeps the changes as one undo step. **Cancel** puts the clip back as
  it was when the screen opened. Enter is Done and Escape is Cancel, unless a
  drag is in progress (Escape then cancels the drag only) or a popover is open.
- Leaving any other way (another layout, the editor closing) keeps the changes,
  as Done would.
- The screen returns to whichever tool panel was open before it.

### Stage

- The editor's stage shows only the selected clip. The slot's window is centred
  and fitted: as large as the stage allows while the whole picture around it
  still fits, but never smaller than 60% of the largest window the stage could
  hold. The fit is worked out when the screen opens and when the stage or slot
  changes size, never during a gesture, so the window does not shrink under the
  finger (the Google Photos bug).
- Outside the window the picture stays visible under a 55% dark scrim. The
  window has a 2 px accent border, thirds lines (faint at rest, clear during a
  gesture) and four L-shaped corner handles with 44 px hit areas.
- Everything else in the post is hidden but stays mounted.

### Gestures

- **Drag** anywhere on the stage moves the picture; the picture follows the
  finger. In Fill, the picture cannot be dragged past an edge that would open a
  gap in the window. Past the limit it follows with resistance and springs back
  on release (no resistance under reduced motion).
- **Pinch** zooms about the point between the fingers and moves with them.
- **Ctrl or Cmd + scroll** (and a trackpad pinch) zooms about the pointer. A plain
  scroll moves the picture.
- **Corner handles** crop closer or wider with the slot's shape kept. While
  dragging, the window frame moves over a still picture. On release the window
  animates back to its fitted size and the picture grows or shrinks to match, so
  what was inside the dragged frame is what now fills the slot. Handles stop at
  the picture's edge in Fill and at the zoom limits (50% to 400%).

### Panel

In order:

1. Keyframe controls for the framing channel (previous, add/remove, next, curve),
   as today.
2. **Straighten**, a slider from −45° to 45°.
3. **Zoom**, a slider from 50% to 400%.
4. **Rotate 90°** (counter-clockwise, like Photos), **Mirror** (a toggle chip) and
   **Fill / Show all**.
5. A one-line hint: drag to move, pinch or Ctrl+scroll to zoom, corners to crop
   closer.

Reset sits in the top bar. It returns the clip to Fill, no mirror, no zoom, pan
or turn, and no framing keyframes, and it can be undone.

On a phone the panel docks below the time bar and scrolls inside itself; the
stage keeps at least half the height below the top bar.

### Time bar

The transport's place under the stage holds play/pause and a scrubber limited to
the clip, with a diamond mark at each framing keyframe. Playback in the crop
screen loops the clip. The scrubber is a native range input, so arrow keys step
a frame.

### Keyboard

On the stage (the window is focusable and labelled):

- Arrows move the picture; Shift moves it further.
- + and − zoom about the centre.
- Enter is Done, Escape is Cancel.

Anywhere in the crop screen: Space plays, K adds or removes a framing keyframe,
Ctrl+Z and Ctrl+Y undo and redo inside the crop. Split, Delete, Duplicate and
timeline zoom are off.

An `aria-live="polite"` line announces zoom, turn and whether the window is
filled when a gesture settles.

## Geometry

The math is pure and lives in `post-crop-geometry.ts`, tested on its own.

- **Pan under rotation.** Pan is a ±0.5 share of how far the picture overflows
  the slot. Today the overflow ignores rotation, so after a 90° turn the pan
  runs along the wrong axis and can open gaps. The overflow is now measured on
  the turned picture's bounding box:
  `bboxW = w·|cos θ| + h·|sin θ|`, `bboxH = w·|sin θ| + h·|cos θ|`, times zoom,
  minus the slot. At 0° and 180° nothing changes. `resolvePanOffset` owns this,
  so the preview and the export stay identical.
- **Coverage.** In Fill, the slot is covered when all four slot corners, taken
  into the picture's own frame (`R(−θ)(corner − T)`), lie within half the
  picture's size. Each corner and axis gives a linear bound, so the largest
  allowed move and the smallest covering zoom have closed forms.
- **Turning without gaps.** Straighten and Rotate 90° turn the picture about the
  window's centre and scale zoom by `cf(θ₂)/cf(θ₁)`, where
  `cf(θ) = max((W·|cos θ| + H·|sin θ|)/w, (W·|sin θ| + H·|cos θ|)/h)` is the
  zoom that covers the slot at angle θ with the picture centred. Straightening
  back returns the original zoom. The move is then clamped into coverage. Show
  all skips the zoom change.
- **Zoom about a point** `a`: `T' = a − k(a − T)` with `k = z'/z`, then pan is
  `T'` over the new overflow.
- **Corner release.** A dragged window of scale ρ and centre `c` becomes
  `z' = z/ρ` and `T' = (T − c)/ρ`. The settle animation runs the stage content
  from `translate(c) scale(ρ)` to identity.
- **Rotation split.** Stored rotation `r` becomes quarter turns
  `q = sign(r)·floor((|r| + 45 − ε)/90)` and straighten `r − 90q` in [−45, 45].

## Undo

A crop session in `post-editor-state` keeps history honest:

- `beginSession()` records the project, the undo list and the redo list, and
  stops a slider change from joining an edit made before the session.
- During the session, Undo and Redo stay inside the session's own steps.
- `endSession(true)` (Done) folds the session into one undo step, or into none
  when nothing changed. `endSession(false)` (Cancel) restores the project and
  both lists exactly.
- A drag in progress ends with the session: Done keeps it, Cancel drops it.

## Motion

- Entering and leaving: `createLayoutMotion` flies the clip's region and the
  crop frame between their slot in the post and the crop window (280 ms, the
  layout clock). Panels swap through the workspace's existing `Crossfade`.
- Corner release: the settle described above, 280 ms, cancelled if a new gesture
  starts.
- Edge spring-back: 200 ms.
- Every duration goes through `motionDuration()`, which honors both the OS
  setting and `data-motion-preference`. Drags follow the pointer with no easing.

## Owners

- `post-crop-geometry.ts` (new, pure): window fit, rotated overflow, coverage,
  turning, anchored zoom, corner release, rotation split.
- `media-fit.ts`: `resolvePanOffset` takes the rotation.
- `post-picture-pan-drag.ts`: rotation-aware overflow; pinch and wheel zoom about
  a point.
- `post-editor-state.svelte.ts`: the session.
- `ValueSlider.svelte`: optional marks on the track, for the first time bar.
  Nothing uses them since the crop timeline replaced it.
- `PostEditorTopBar.svelte`: an optional trailing slot in place of Export.
- `PostEditorCanvas.svelte`: the crop stage, gestures and handles.
- `PostCropTimeline.svelte` (new, replaced the first `PostCropTimebar`): the
  clip's own timeline, with beat and frame stepping, a Beats row from the
  take's tapped timing (`post-crop-steps.ts`), and a Crop keyframe row whose
  keys drag, snap to a beat or the playhead, and delete.
- `PostItemTool.svelte`: the crop panel.
- `PostEditorWorkspace.svelte`: the mode, keys, session and layout.
- `VideoCropEditor.svelte` (landing preview admin) is a separate legacy editor
  and is not changed here.

Rejected: `svelte-easy-crop`. It stores a crop rectangle, which would duplicate
the keyframed framing that the preview and export already share.

## Verification

- Unit tests: geometry (fit, overflow at 0°/90°/straighten, coverage bounds,
  turning round-trip, anchored zoom keeps the anchor, corner release keeps the
  dragged content), `resolvePanOffset` with rotation, session undo (Done folds to
  one step, Cancel restores, no-change Done leaves history alone, undo stays in
  the session).
- Browser: the seven-viewport matrix and 200% zoom on `/test/post-studio` with
  the DCKΨ- take; enter, pan, pinch (touch emulation), corner crop and settle,
  straighten and rotate without gaps, Cancel restores, Done is one undo step,
  keyframe marks follow edits, reduced motion reaches end states at once.

## Out of scope

- A crop rectangle separate from the slot (freeform aspect). The slot's shape
  comes from Position and Layout.
- Ken Burns start/end presets.
- Migrating `VideoCropEditor.svelte`.
