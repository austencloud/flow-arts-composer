# Reference Video Viewer: Design

Status: approved by Austen 2026-10-07. First of four pieces.

## Why

Pose fixes have been judged against pictures of the avatar alone, and the
planner guesses where the body goes (the hip shift from grid-styles step 5).
Austen's direction: record himself from three angles doing the same
sequences, line each video frame up with the matching moment, and judge (and
later key) the avatar against his real body. The four pieces, in order:

1. **Reference video viewer** (this note): three synced camera videos beside
   the 3D performer, scrubbed together.
2. Whole-body pose editor: key poses per beat with filled in-betweens,
   including keyed steps (lift, pass, plant). Grows from the grip lab's
   one-arm editor (`src/routes/test/grip-lab/`).
3. Automatic capture: 3D body from the three videos as draft key poses.
   Needs camera calibration and a license check of any tool used.
4. Viewing the capture in a 3D space. Last.

## What Austen does

1. Sets up three cameras, starts them, claps once, performs a sequence that
   is saved in the app.
2. In Post Studio, opens that sequence's post, adds the three videos as
   takes, and maps timing on one of them with the existing timing tool.
3. Opens the staff grip lab on the same sequence (`seq=<id>`) and turns on
   Reference. Picks the three files (local takes store metadata only, so they
   are re-picked each session; catalog takes load on their own).

## What the lab shows

- Each camera video paired with one 3D view of the performer.
- Each 3D view starts from the nearest preset (front, side, three-quarter,
  overhead, matching `INSPECTION_VIEWS`) and is fine-tuned by dragging. The
  tuned angle is remembered per take in localStorage, keyed by `takeKey`.
- One scrubber drives all videos and the performer. Frame step, slow play,
  real-speed play. In Reference mode the video clock replaces the lab's
  synthetic `PLAYBACK_STEPS_PER_SECOND` clock.
- All lab settings keep working (Body switch, staff length, grid style).
- Side by side only. No overlay: preset-and-nudge angles cannot line up a
  see-through figure exactly. Overlay belongs with calibration in piece 3.

## Parts

| Part                       | Job                                                                                             | Builds on                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Reference take loader      | For the lab's sequence id, read the Post Studio project's takes and the mapped take's timing    | `loadPostProject`, `loadTakeTiming`, `resolveTakeTiming`         |
| Clap finder                | Pure function: decoded audio in, time of the sharpest loud transient in the opening seconds out | New; decoding pattern from `post-audio-track.ts`                 |
| Reference clock            | Video seconds of the timed take to lab phase and back; other takes add their clap offset        | `takeSampleAt`, `sequencePositionToMediaTime`, `sequenceFrameAt` |
| Camera match               | Preset view plus a saved orbit offset per take                                                  | `inspection-framing.ts`                                          |
| Reference panel and layout | File pickers, sync status, per-video manual offset, paired layout                               | `LabControls.svelte`, the lab's view grid                        |

Before the clock is built, confirm whether lab phase equals arrival position
or `enginePosition - 1`; the census did not settle it.

## When something is off

- No clap found in a video: that video gets a manual offset slider.
- No mapped timing (`isTakeTimingMapped` false): a notice linking to Post
  Studio for that sequence.
- Sequence changed since mapping (`takeTimingStatus` is `stale`): a warning;
  the viewer still plays.
- A picked file whose name, size or date differs from the take's metadata:
  ask before using it.

## Checks

- Clap finder unit test on synthetic audio (clap in silence, clap in music,
  no clap).
- Clock round-trip unit test on a fixture `TakeTiming`.
- Browser check of the lab in Reference mode with real or synthetic videos.
