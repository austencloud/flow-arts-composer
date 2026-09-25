# Post Studio Tutorial Builder

Date: 2026-09-24. Owner surface: Post Studio
(`src/lib/shared/share/components/post-studio/`) on the media-composition model
(`src/lib/shared/media-composition/`). Supersedes the UI and timing parts of
`2026-09-24-post-studio-breakdown-design.md`; that file stays as history.

## Why

Austen makes 90–130 s vertical tutorials (DCKΨ- now, ΩΛ-XJ next) in InShot:

1. A full-speed take on top with the app animation below (trails, beat number,
   letter, element icon), with the tempo matched by hand.
2. A slow take, full frame, with handwritten captions ("Practice with me!",
   "Watch hands closely", "Go slower to learn faster", "Now repeat 100x").
3. Optionally the sequence card with its QR code, held.

Matching the tempo by hand is the part he calls "really annoying". The first
Post Studio breakdown build (Codex, 2026-09-24) added a slow-section strip,
but a review of main found 27 confirmed defects. The largest are:

- The strip's animation square and carousel show different moves for about
  91% of every beat, because one reads the move in flight and the other the
  pose just landed.
- A tap run that stops partway through a pass is thrown away with a false
  error.
- A typed BPM never reaches the tap editor, which spaces at 60 BPM.
- Nothing fits rough taps to a BPM.
- A stored BPM grid silently overrides newer taps.
- Mapping hides behind three conditional buttons.
- The inspector rail is a long stack organised by layer, not by the job.
- Split and Breakdown are exclusive, so the three-part tutorial can't be built.

This design keeps the pure evaluator, the painter contract, the zod schemas,
region motion and the arrival convention. It replaces the timing model, the
post model the UI edits, and the whole UI.

## Two ways Austen uses it

- **Build from takes.** Pick a full-speed take and a slow take, map each once,
  and arrange acts: full speed split with the animation, then the slow take
  full frame with the strip and captions, then the card.
- **Add to an edit.** Pick an already-edited video, such as the InShot export,
  as the only take. Map each section of it at its own tempo, then turn the
  strip on for the slow part.

Both use the same two records: timing per take and a plan of acts.

## Core rule: one clock

Each take has one resolved timing. Every sequence-derived layer in an act reads
the position of that act's take at the take's own media time. That covers the
animation square, the mandala, the carousel, the full-speed animation panel
and the card highlight. The performer, the animation and the carousel
therefore always show the same move. Slowing a take (speed below 1×) needs no
second map, because the position follows media time rather than post time.

Conventions, fixed once in the evaluator:

- **Arrival count `r`**: 0 is the opening pose; `k` is the landing of move `k`,
  counted across passes.
- **Move in flight at `r`**: move `ceil(r)` (global), for `r` not an integer.
  The engine position is `r + 1` folded into the pass.
- **Pass index**: `max(0, ceil(r / N) − 1)`. It flips the instant the next
  pass's first move leaves the ground, not one move later.
- **Mandala progress within the pass**: `(r − passIndex·N) / N`.
- **Strip pictograph**: shows the move in flight. The prop travels from the
  previous landing to this move's end pose while the arrow fades.
- **Carousel focus**: the move in flight, the same cell as the square. It
  slides to the next cell across the last 18% of the move. The ring and tick
  are `floor(engine)`, never `round(track)`.
- **Act end**: after the take's last mapped landing, layers hold the final pose.
  Nothing snaps back to the start.

## Timing per take

### Record (`TakeTiming`, zod, `media-composition/domain/take-timing.ts`)

```text
TakeTiming {
  schemaVersion: 1
  sequenceId, takeKey
  sections: TimingSection[]       // ordered, non-overlapping media ranges
  updatedAt
}
TimingSection {
  id
  startSeconds, endSeconds        // media time; one section covers a raw take
  bpm                             // nominal tempo typed by Austen (20–300)
  tempo: "locked" | "follow"      // locked: 60/bpm per beat; follow: fitted ±5%
  snap: "grid" | "taps"           // grid: even landings; taps: matched taps win
  taps: number[]                  // raw media seconds, as tapped
  firstMove: 1..N                 // which move the first fitted landing is
  offsetSeconds                   // whole-grid nudge, in frames from the UI
  overrides: { landing, seconds }[]  // one dragged landing
}
```

Step durations come from the sequence: move `j` lasts `duration(j)` beats, so
a two-beat move spaces its landing twice as far.

### Fitter (`media-composition/domain/tap-fit.ts`, pure)

Model: landing `m` (1-based, global) sits at `τ(m) = t0 + s·B(m)`. Here `s` is
seconds per beat and `B(m)` is the cumulative beats from landing 1, using the
durations of the moves labelled from `firstMove`.

1. **Comb search.** Search `s` in `s0·[0.95, 1.05]` in 0.1% steps (only `s0`
   when locked) and `t0` in the first tap ±0.4 s in 5 ms steps. Score each pair
   with `Σ exp(−r²/2σ²)`, where `σ = 40 ms` and `r` is each tap's distance to
   its nearest landing.
2. **Label.** Assign each tap to its nearest landing. A second tap on the same
   landing and any tap more than 35% of a beat away become extras. Landings
   without a tap are misses, which the grid fills.
3. **Refine.** A Huber IRLS refit of `t0` (and `s` when following) on the
   labelled taps.
4. **Octave check.** Rescore at `s0/2` and `2·s0`. Report when a double-time or
   half-time tap pattern fits better.
5. **Report.** Fitted BPM, median and worst miss in ms, extras, misses.

Simulation before this spec (1,500 trials with the true tempo up to 3.4% off
the typed BPM, 40% missed taps and 20% extra taps) found the phase every time.
The unit tests reproduce that sweep with a seeded generator.

With `snap: "taps"`, each matched tap becomes its landing's time. Misses are
interpolated in beat space between their matched neighbours. This is for slow
takes where a human tempo drifts.

### Resolution (`resolveTakeTiming`)

Each section resolves to an arrival `SequenceTimeMap`. It has an anchor at
every landing inside the section, plus the opening pose one move before
landing 1 and one landing past the section end so the last move interpolates.
Overrides and `offsetSeconds` apply after the fit. The resolved take is a list
of `{ section range, map }`. A media time in a gap between sections holds the
previous section's last pose.

A partial last pass is normal and needs no special case: the map simply stops
at the last landing inside the section.

### Storage (`media-composition/state/take-timing-store.ts`)

- The key is `tka:post-studio:take-timing:v1:<sequenceId>:<takeKey>`.
- `takeKey` depends on the take: `local:<name>:<size>:<lastModified>` for a
  local file, `catalog:<videoId>` for a catalog video, or `url:<hash>` for a
  linked URL.
- Picking the same local file again reattaches its timing.
- A catalog video with a legacy Firestore `beatMap` and no `TakeTiming` gets one
  seeded on first open: the legacy landings become `taps` with `snap: "taps"`.
  This design writes nothing to Firestore. Syncing timing across devices is a
  follow-up.
- The old stores (`local-performance-step-maps.ts`,
  `local-performance-bpm-alignments.ts`) are read once for migration, then
  retired.

## The plan

### Record (`PostPlan`, zod, `media-composition/domain/post-plan.ts`)

```text
PostPlan {
  schemaVersion: 1
  sequenceId
  takes: { id, label, ref: {kind:"local", key} | {kind:"catalog", videoId} | {kind:"linked", url} }[]
  acts: Act[]                      // played in order, back to back
  captions: Caption[]
  audio: "takes" | "silent"        // takes: each 1× act carries its take's sound
}
Act = PerformanceAct | AnimationAct | CardAct   // each has id, label, fadeIn
PerformanceAct {
  kind: "performance", takeId, sourceIn, sourceOut, speed (0.25–1)
  layout: "split" | "full"
  split: { animation: "trails" | "plain", header: boolean }   // take on top, animation below
  full:  { strip: "off" | "arrows" | "mandala" | "alternate", carousel: boolean }
  framing: { fit: "cover" | "contain", zoom 1–3, panX, panY }
}
AnimationAct { kind: "animation", bpm, passes, top: Source, bottom: Source }  // posts with no take
CardAct { kind: "card", seconds, qr: boolean }
Caption { id, text, start, end, position: "top"|"middle"|"bottom", size: "s"|"m"|"l" }
```

- An act's length is `(sourceOut − sourceIn) / speed`, or `seconds` for a card
  act.
- Caption times are post seconds and snap to act edges when dragged near them.
- The default plan for a sequence with one take is one full-speed split act,
  plus a card act.
- Adding a second take appends a full act with the strip.

### Compiler (`media-composition/domain/post-plan-compiler.ts`, pure)

`compilePostPlan(plan, sources) → MediaCompositionPreset` with the free layout
model:

- One source role per take (`take:<id>`), plus the animation, carousel and card
  roles.
- **Clips.** Each performance act emits the take clip with explicit
  `start/end/sourceIn/sourceOut` in seconds. Its derived clips (the split
  animation, the strip square, the carousel) copy the same four values, so their
  source time is the take's media time. They carry a new
  `timeMapRole: "take:<id>"`.
- **Consecutive acts on the same take** share one take region. The region moves
  between the acts' layouts over 0.6 s with the existing region motion, so the
  footage never cuts, and the strip slides in the way Codex's strip already
  does. Different takes cut, with an optional fade.
- **Card act.** A card clip full frame.
- **Markers.** Act boundaries become markers (`act:<id>:start`), so the timeline
  can draw them and the region keyframes follow them.

The schema grows two optional fields, and older presets still parse:

- `timeMapRole` on a visual clip.
- `SequenceFrameAlignment` keyed by role in the evaluator (`alignments` map).
  The old single `alignment` stays as the fallback for clips without the field.

Captions are not preset clips. They are an overlay list painted after the
layers by the caption painter, in the preview and in the export alike.

## UI

### Layout

A step bar across the top: **Takes · Timing · Acts · Captions · Render**.

- Each step shows done or to-do, and the studio opens on the first to-do. Steps
  are tabs, never locked.
- The canvas is always visible.
- The current step's panel sits beside the canvas when there is room (at least
  56rem of studio width), and below it otherwise.
- The transport sits under the canvas, with an **act lane** above the scrubber.
  The act lane shows coloured act blocks with draggable edges. In the Timing
  step the lane shows the take's beat grid instead.

This replaces the layer-inspector rail, the Split/Breakdown switch,
BreakdownControls, the phone tabs that hid the canvas, and the three mapping
entry points. Selecting a region on the canvas still opens that region's
settings, inside the Acts step.

### Takes

A list of takes with thumbnail, length and a timing badge: "Not mapped",
"Mapped · 87 BPM", or "Mapped · 2 sections". Controls:

- "Add a video from this device".
- Catalog and linked videos for the sequence.
- Rename, remove and replace.

Picking a take jumps straight to Timing.

### Timing, the heart of it

The take plays large, with a live strip square beside it: the pictograph for
the move in flight, with the prop moving and the arrow fading. Austen checks
the fit by watching the two together.

Controls, in order:

1. **BPM.** A number field, prefilled from the last BPM used for this sequence.
2. **Tap along.** Plays at a chosen speed (1×, ¾×, ½×). He presses **T** or the
   big Tap button at each landing. Taps record `video.currentTime`, never the
   composition clock.
3. **The fit appears as soon as there are three taps.** Landings show as ticks
   numbered by move, pass boundaries as taller ticks, and each tap as a dot with
   a line to its landing. The result reads in plain words, for example "Fits
   87.2 BPM · taps within 0.03 s · 2 missed, 1 extra ignored".
4. **Adjust:**
   - "Hold 87 exactly" or "Follow the video's tempo".
   - "Move 1 is earlier / later" (±1 move).
   - Nudge the whole grid by ±1 frame. The frame length comes from the video,
     and the picture seeks exactly.
   - Drag any landing tick, or select one and nudge it.
   - "Use my taps as-is" (`snap: "taps"`).
   - "Clear taps".
5. **Sections.** "Split here" at the playhead makes a new section with its own
   BPM and taps, for an edited video that changes speed. Sections show as bands
   on the lane.

The timing saves automatically on every change, with an undo stack. Nothing is
lost if the take ends mid-pass.

### Acts

The act lane holds the whole post, with one panel for the selected act:

- **Take.** Picker, in and out (typed as m:ss.ss, set from the playhead, or
  dragged), speed.
- **Layout.** "Take + animation" (split) or "Take full frame".
  - Split: trails on or off, header on or off.
  - Full: strip off / arrows / mandala / alternate each pass, carousel on or
    off.
- **Framing.** Judged on the canvas with the playhead parked inside the act:
  - Drag the footage to pan, and use the wheel or a pinch to zoom.
  - Fit or Fill.
  - The strip's area is outlined so the prop ends can be kept clear of it.
- Add act (Take, Card, Animation), delete, and move left or right.

### Captions

A list of caption rows (text, start, end, position, size). Controls:

- "Add caption" puts one in the current act at the playhead.
- Caption blocks can be dragged on a caption row of the act lane.

The font is the app's display face with a heavy outline. A handwritten face
needs a font file download, which waits for Austen's go-ahead.

### Render

A sound choice ("Takes' own sound" or "Silent — add music later"), then
Render, Download and Share, as today. While rendering, the canvas is forced
visible and shows progress.

### Sizes

The desktop and phone arrangements are verified at these widths:

- 1920×1080 and 1440×900 desktop.
- The Z Fold unfolded, about 707×676. The panel goes below the canvas, and the
  canvas keeps at least 280 px of width.
- The Z Fold cover and a phone at 375×667. The canvas stays on top, and the
  step panel scrolls under it.

## Rendering

- **Frame source of truth.** `evaluatePresetFrame` stays the only source of
  timing, for both preview and export.
- **Video.** Each frame seeks exactly and draws. In the preview, the media layer
  sets `video.playbackRate` to the act's speed and re-seeks when drift passes
  one frame while paused, or 0.12 s while playing.
- **Painters.** These draw at output resolution, identically in preview and
  export, and read nothing from the DOM:
  - **Strip pictograph** (new). It uses `Canvas2DDirectRenderer`, extended with
    an arrow opacity and prop placement overrides from
    `calculatePictographMotionPositions`, the same function the Construct
    audition uses. No CSS transition, no DOM screenshot and no 5 s wait.
  - **Strip mandala** (new, from `PostStudioBreakdownMandala`). It uses the
    corrected progress and per-move segment lengths, so the bright end sits on
    the prop.
  - **Carousel** (existing), fed the move-in-flight position.
  - **Captions** (new).
- **Split animation panel.** This uses the live `AnimatorCanvas` in preview.
  For export there are two stages:
  - Now: copy its canvas as today. It is sharp enough at the half-frame size
    because the export sets the stage to output size before capturing.
  - Next: a painter that wraps `OffscreenExportRenderer` and
    `ExportFrameCompositor`, the compose export's own path, so trails, header,
    letter and element icon match the Animate export exactly.
- **Card.** The existing DOM capture, cached per beat.
- **Audio.** `buildPostAudioTrack` decodes each 1× act's take audio with
  `OfflineAudioContext`, places it at the act's post time and renders one WAV.
  Slowed acts are silent. The encoder muxes that WAV through its existing
  `originalAudio` URL input.

## What goes

These are deleted, with their tests updated or removed:

- `PostStudioBreakdownControls`, `PostStudioBreakdownDetail`, the BPM-alignment
  store and its override order.
- The Split/Breakdown preset switch as a user control. The presets remain only
  for the compiler's reference geometry and old tests.
- The single-pass section grid fallback.
- The phone Canvas/Edit/Timing tabs.
- The `StepMapEditor` mount inside the picker. `StepMapEditor` itself stays for
  Performances, VideoLab and MovementMapLab, with its `initialTime` crash fixed.

## Verification

- **Unit (Vitest):**
  - Fitter: the seeded simulation sweep, locked and following tempo, the octave
    case, `firstMove`, overrides, step durations of 2, partial passes, sections.
  - Resolver: anchors, holds and gaps.
  - Compiler: the three-act DCK plan, a shared-take morph, a card act and speed
    0.5.
  - Evaluator: square, carousel and pass index agree at `r` = 7.5, 8, 8.5, 16.5
    for N = 8, and slowed acts read the take's media time.
  - Audio planner.
- **Browser** (the in-app browser on a task-owned preview server from this
  worktree):
  - Map the September 6 DCK take at 87 BPM by tapping, and check that the square
    matches the performer across the pass boundary.
  - Build three acts.
  - Render a sample and read frames back from the MP4 at pass boundaries.
  - Check the widths above.
- **Review:** an adversarial review by Codex and an Opus reviewer before
  integration.

## Delivery stages

1. Domain: take timing, fitter, resolver, plan, compiler, and the evaluator's
   per-role maps and convention fixes, with tests.
2. Painters (strip pictograph, mandala, captions) and the audio mixdown.
3. UI: step bar, Takes, Timing, Acts, Captions, Render, and responsive layout.
4. Wiring: the viewer shell, the share sheet, the harness route
   (`/test/post-studio` loads the DCK take), and removals.
5. Verification and review, then guarded integration.
6. Follow-up: the output-resolution split-animation painter, a handwritten
   caption font, cloud sync of timing, and AI edits to the plan through a
   documented JSON contract.
