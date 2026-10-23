---
status: active
value: null
effort: null
work_state: ready
remaining: Austen approves or edits each script; then record Construct on the computer that holds the feature-video root.
depends_on: "active/2026-10-11-walkthrough-zoom-bubbles-design.md"
plan_path: ""
tags: [feature-video, tutorial, create]
last_triaged: "2026-10-22"
---

# Creation mode tutorial videos

Date: 2026-10-22. Raised by Austen from the night-shift coordinator session:
a short how-it-works video for each creation mode, made the way the Generate
tutorial is made. This document is the inventory, the scripts and the
recording recipe. Nothing here authorizes a UI change. No video is rendered
yet (see "Where this stands").

## The pipeline the Generate tutorial uses

The Generate tutorial is a **feature video**: a folder under the feature-video
root (`E:/tka-platform-media/feature-videos/generate-tutorial/`, or whatever
`TKA_FEATURE_VIDEO_ROOT` names on the dev server), opened in Post Studio at
`/post?feature=generate-tutorial`. Its parts, all on local `main`:

| Step   | Tool                                                                                 | What it makes                                                                                                                          |
| ------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Record | `scripts/feature-video/capture.mjs` with a `<id>.capture.mjs` script                 | A scripted pass through the app in a headless Chrome, recorded as a take with the real pointer; `capture.json` keeps every click's box |
| Cut    | `scripts/post-project.mjs walkthrough --lines walkthrough.json`                      | Clips with a camera that pushes in on each click, and one bubble beside each click with the line that explains it                      |
| Words  | The bubbles are Post text items                                                      | Austen replaces placeholder lines in the editor; a rebuild keeps words on bubbles whose ids survive                                    |
| Export | `scripts/post-project.mjs render --feature <slug> --open`, `stills`, `contact-sheet` | The MP4 in `exports/`, plus stills for review                                                                                          |

Design and decisions: `active/2026-10-11-walkthrough-zoom-bubbles-design.md`
(approved 2026-10-11) and `2026-10-06-feature-video-pipeline-design.md`.
Command reference: `docs/development/post-studio-manifest-bridge.md`. The
earlier `docs/specs/2026-09-13-generate-tutorial-video-spec.md` is the
production contract these videos inherit: real current app, native input with
hover proof, captions that make only shipped claims, dark quiet framing.

Format carried over from the Generate take 3 pilot:

- 16:9 at 1920 by 1080, recorded at a device scale of 2 (3840 by 2160) so
  push-ins to 2× stay sharp. Desktop layout.
- The words are bubbles beside each click, and Austen's own words replace the
  placeholders in the editor. Voiceover and music are outside this work, as
  they are for the Generate pilot.
- Signed in as the shared test account (`docs/reference/agent-browser-profile.md`)
  through a kept capture profile passed with `--profile`.
- Every bubble holds at least 3 s on screen (the builder warns under 1.6 s).
  Each line fits two bubble lines at 36% of the frame width, so about 60
  characters.
- Chapters come from the first bubble of each chapter; the CLI prints them as
  YouTube chapter times.

## Inventory

Creation modes come from `CREATE_TABS` in
`src/lib/shared/navigation/config/tab-definitions.ts` (`isCreationMethod`).
Each gets one video. Times are targets for the 16:9 master.

| Mode      | Route                  | Video                | Length | Script | Capture script | Status                                   |
| --------- | ---------------------- | -------------------- | ------ | ------ | -------------- | ---------------------------------------- |
| Generate  | `/create/generate`     | `generate-tutorial`  | ~5:00  | exists | exists         | Level chapter pilot; awaiting verdict    |
| Construct | `/create/construct`    | `construct-tutorial` | 2:10   | below  | run            | Approved; take 2 rendered, words pending |
| Assemble  | `/create/assemble`     | `assemble-tutorial`  | ~2:40  | below  | written        | Approved; needs the signed-in profile    |
| Shape     | `/create/shape-engine` | `shape-tutorial`     | ~2:00  | below  | after approval | Script awaiting approval                 |
| Fuse      | `/create/fuse`         | `fuse-tutorial`      | ~2:00  | below  | after approval | Script awaiting approval                 |
| Tunnel    | `/create/tunnel`       | `tunnel-tutorial`    | ~2:30  | below  | after approval | Script awaiting approval                 |

The order of work is Construct, Assemble, then the other three. Construct and
Assemble have no random step, so one take gives the planned video. Shape,
Fuse and Tunnel generate content on open, so each take is its own video and
the lines never promise what a given cell or roll produces.

Seen on the Create front door as a guest on 2026-10-22: Construct, Generate
and Shape open without an account; Assemble, Fuse and Tunnel are marked
"needs a free account". Their takes need the signed-in capture profile.

Beyond Create, a new user also meets these modules in the sidebar
(`isMain` in `module-definitions.ts`, tier `core` or `shipped`): Browse,
Learn, Train, Compose, Studio, Social, Creators, Tika, Arena, Toys, Shop,
Choreo, Choreo Cards, Festivals, Museum, Levels, Hand Paths, Video and
3D Studio. None has a script yet. The ones a first-week user needs are
Browse (find and open a sequence, save it, open its card), Learn (one
lesson, start to finish) and Train (one practice session). They are listed
here so the inventory is complete; scripting them is separate work, after
the creation-mode set is approved.

Capture scripts and lines files live in
`docs/superpowers/specs/tutorial-videos-scripts/creation-modes/<mode>/` until
a feature project exists for the mode, then they are copied into its
`captures/` folder. The repo copy is the reviewable one.

## How to read a script

Each scene names the click (the director call the capture script makes), the
bubble line that appears beside it, the shot, and what on screen proves the
line. Close is the default shot: the camera pushes in on the clicked control.
Wide pulls back to the whole frame so a result is seen whole. A row with no
bubble is a click the viewer watches without a caption.

Lines are placeholders in the tutorial's voice: short, present tense, naming
what the control does and nothing it does not. Austen's words replace them in
the editor. Labels marked _confirm_ were read from the code, not from a
running page, and get checked in the capture browser before the first take.

## Construct

Route `/create/construct`. Builds a sequence one pictograph at a time: a
start placement, then one option per step, each option starting where the
last step ended. Nothing in the flow is random, so this take is the video.
Script: `creation-modes/construct/construct-tutorial.capture.mjs`, lines:
`creation-modes/construct/walkthrough.json`.

Recording state: a fresh, signed-out profile (the runner's default), so the
picker opens on Presets, Diamond, Level 2 with no turns and no draft. A
fresh profile also gets the "New to Construct?" offer; the script clicks
"Not now" before the shot starts, so that click stays out of the video.
Building needs no account. The take writes nothing: the Save dialog is
cancelled, and the Share menu is left open because Copy link creates a
short code.

Every label in the table was checked on the running app at 1920 by 1080 on
2026-10-22. Option cards are `button[data-testid="option-card"]` with a
`data-letter`; the turn buttons sit in groups named "Left turns" and "Right
turns"; the Save dialog has no name field (the word is the name), only a
public switch, collections, a card footer choice and notes.

| Time | Chapter | Click                                           | Bubble                                                               | Shot  | Proof on screen                                                 |
| ---- | ------- | ----------------------------------------------- | -------------------------------------------------------------------- | ----- | --------------------------------------------------------------- |
| 0:02 | Start   | Alpha tile (`pick` on `[data-ghost-label="α"]`) | Pick where the hands start. Alpha puts them on opposite points.      | close | Tile flies into the start cell; options appear                  |
| 0:06 |         | same click, +3.8 s                              | The grid and the orientation can change here, before the first step. | close | Diamond/Box toggle and orientation cyclers in the picker footer |
| 0:11 | Options | first "Add A. Hold to preview."                 | Tap an option to add it. Hold it to preview the move.                | close | Step 1 fills; the picker refills                                |
| 0:15 |         | same click, +3.8 s                              | Options are grouped by letter type. Type 1 moves both hands.         | close | Section headings Type 1, Type 2, Type 3, Types 4-6              |
| 0:20 |         | first "Add B. Hold to preview."                 | Every option starts where the last step ended.                       | close | Step 2 fills                                                    |
| 0:25 | Levels  | "Level 1: Base Motions"                         | Level 1 keeps the options turn-free.                                 | close | Turn rows disappear; options change                             |
| 0:29 |         | "Level 2: Whole Turns"                          | Level 2 brings whole turns back.                                     | close | "Left turns" and "Right turns" rows return                      |
| 0:33 |         | same click, +3.6 s                              | Set each hand's turns here before you add the step.                  | close | The turn rows                                                   |
| 0:37 |         | "1" in the "Left turns" group                   | The left hand makes one turn on the next step.                       | close | The 1 button pressed; spin toggle appears                       |
| 0:41 |         | first "Add C. Hold to preview."                 | The step carries the turns you chose.                                | wide  | Step 3 shows a turn in its notation                             |
| 0:46 |         | "Level 3: Half Turns, Floats"                   | Level 3 adds half turns and floats.                                  | close | Turn rows gain fl and halves                                    |
| 0:51 | Edit    | "Step 2 Pictograph"                             | Tap a step to open the editor.                                       | close | Step Editor panel with heading "Step 2"                         |
| 0:55 |         | "Add half a turn: Left"                         | Add or remove turns for either hand.                                 | close | The step's turn count changes                                   |
| 0:59 |         | "Toggle Left rotation (currently CW)"           | This flips the spin direction.                                       | close | Label reads CCW                                                 |
| 1:03 |         | "Close step editor"                             |                                                                      | close |                                                                 |
| 1:04 |         | "Undo"                                          | Undo takes back the last change. Redo puts it back.                  | close | The step returns to its earlier turns                           |
| 1:09 | Play    | "Play sequence" (visible "Play")                | Play runs the sequence in the workspace.                             | wide  | Inline playback for about 9 s                                   |
| 1:19 |         | "Stop playback and return to card"              |                                                                      |       |                                                                 |
| 1:20 | Actions | "Sequence Actions" (visible "Actions")          | Actions holds the tools that change the whole sequence.              | close | Panel "Sequence Actions" with Transform, Patterns, Grid, Edit   |
| 1:24 |         | "Mirror Sequence: flip left and right"          | Mirror flips the sequence left to right.                             | wide  | Every step's notation mirrored                                  |
| 1:28 |         | "Back to workspace"                             |                                                                      |       |                                                                 |
| 1:29 | Save    | "Save to Library" (visible "Save")              | Save keeps the sequence in your library.                             | close | Dialog "Save to Library" with the public switch and collections |
| 1:33 |         | same click, +3.6 s                              | Public needs four steps. Collections keep your library in order.     | close | The "Needs at least 4 steps to make public" switch              |
| 1:37 |         | "Cancel"                                        |                                                                      |       | Dialog closes; nothing saved                                    |
| 1:38 |         | "Share sequence" (visible "Share")              | Share copies a link anyone can open.                                 | close | Menu with "Copy link" and the card or video export              |

The clicks alone run about 1:45; the camera moves and the holds the builder
adds bring it to roughly 3:30, in line with the Generate pilot's pacing.
Open question for Austen: whether the Level 3 scene stays (it adds nothing
the viewer uses in this video).

## Assemble

Route `/create/assemble`. Builds each hand's path by tapping grid points;
the app derives every motion from the start pose, the end point and the
current turn settings. No random step. Script:
`creation-modes/assemble/assemble-tutorial.capture.mjs`, lines:
`creation-modes/assemble/walkthrough.json`.

Recording state: the test profile with the Assemble draft cleared and the
grid preference at Diamond without Center. Grid points are
`<circle role="button">` elements named by phase ("Set Left start at North",
then "Move Left prop to East"); each click animates one hop and the points
stay disabled until it lands. The take keeps three paired steps, well under
the guest cap of eight.

| Time | Chapter    | Click                                  | Bubble                                                       | Shot  | Proof on screen                                                    |
| ---- | ---------- | -------------------------------------- | ------------------------------------------------------------ | ----- | ------------------------------------------------------------------ |
| 0:02 | Grid       | chip "Grid: Diamond"                   | Assemble builds on the grid. Diamond uses four points.       | close | Popover with Diamond, Box, Merged and a Center toggle              |
| 0:06 |            | same click, +3.6 s                     | Box and Merged add the corners. Center adds the middle.      | close | The popover options                                                |
| 0:09 |            | "Diamond" in the popover (_confirm_)   |                                                              |       | Popover closes                                                     |
| 0:10 | Left hand  | "Set Left start at North"              | Tap a point to place the left hand.                          | close | Blue prop on North; chips "Orientation: in", "Turn settings: CW 0" |
| 0:14 |            | same click, +3.8 s                     | The chips above set its orientation and turns.               | close | The two chips                                                      |
| 0:19 |            | "Move Left prop to East"               | Each tap moves the hand to the next point.                   | close | One hop animates                                                   |
| 0:23 |            | same click, +3.8 s                     | The app writes the motion for you.                           | close | The hop lands                                                      |
| 0:28 |            | "Move Left prop to South"              |                                                              | close |                                                                    |
| 0:30 |            | "Move Left prop to West"               | Three steps for the left hand so far.                        | close | Hand picker reads 3 steps for Left                                 |
| 0:35 | Right hand | "Right hand" (_confirm_ visible text)  | Switch hands. The left hand's path stays as a ghost.         | close | Dim ghost prop on the grid                                         |
| 0:39 |            | "Set Right start at South"             | The right hand gets its own start point.                     | close | Red prop on South                                                  |
| 0:43 |            | "Move Right prop to West"              | Steps pair up. Each pair is one pictograph in the workspace. | wide  | Step 1 appears in the workspace                                    |
| 0:48 |            | "Move Right prop to North"             |                                                              | close | Step 2 appears                                                     |
| 0:50 | Turns      | chip "Turn settings: CW 0"             | Turns and direction apply to the next step.                  | close | Popover "Turn count and rotation direction"                        |
| 0:54 |            | "1" in the popover (_confirm_ index)   | One turn on the way to the next point.                       | close | Chip reads CW 1                                                    |
| 0:58 |            | "CCW" in the popover (_confirm_ index) | CCW spins it the other way.                                  | close | Chip reads CCW 1                                                   |
| 1:02 |            | "Move Right prop to East"              | The step shows the turn in its notation.                     | wide  | Step 3 with a turn mark                                            |
| 1:07 | Complete   | "Complete"                             | Complete locks the sequence and shows the end poses.         | close | Points disabled; button becomes "New"; "Build Another"             |
| 1:11 |            | "Play" (aria "Open sequence viewer")   | Play opens the viewer with the animation.                    | wide  | Viewer overlay plays for about 9 s                                 |
| 1:21 |            | the viewer's close control (_confirm_) |                                                              |       |                                                                    |
| 1:22 |            | "Save to Library"                      | Save keeps it in your library.                               | close | Save panel                                                         |

About 2:40 after the builder's moves and holds. Open question: whether to
show the orientation "?" explainer (a bottom drawer titled "Orientation")
as a chapter of its own; it is left out to keep the first video short.

## Shape

Route `/create/shape-engine` (the Shape Engine, `ShapeMatrixApp` in embedded
mode). A cell in the matrix pairs one flower per hand; the detail pane draws
what the pair makes and lists the sequence under it. Capture script after
approval, since the cell labels depend on the grid the take opens on.

Recording state: `create-shape-engine-state-v1` cleared so the matrix opens
at Level 2 with no cell picked. Avoid Level 4 and the 3v4 quarter-opposite
cell, which another session is fixing today. "Surprise me" uses
`Math.random`; it is the last scene so the roll never has to be reproduced.

| Time | Chapter  | Click                                                        | Bubble                                                        | Shot  | Proof on screen                             |
| ---- | -------- | ------------------------------------------------------------ | ------------------------------------------------------------- | ----- | ------------------------------------------- |
| 0:02 | Pairing  | a cell (`pick` on `button.cell[data-row="1"][data-col="2"]`) | Rows are the left hand's shape. Columns are the right hand's. | close | Cell pressed; row and column headers        |
| 0:06 |          | same click, +3.5 s                                           | A cell pairs them and draws the result.                       | wide  | Mandala canvas and pictograph strip fill in |
| 0:11 | Elements | chip "Fire" (_confirm_ chip text)                            | Six elements set timing and direction between the hands.      | close | Chip row Water, Earth, Sun, Fire, Air, Moon |
| 0:16 |          | chip "Moon"                                                  | Each one draws the same shapes a different way.               | wide  | The art crossfades                          |
| 0:21 | Play     | the canvas (`director.canvas()`)                             | Tap the art to play. The pictographs below keep time.         | wide  | Playback with the strip highlighting        |
| 0:31 | Levels   | the Level 3 option in "Difficulty level" (_confirm_ label)   | Difficulty adds turns to every cell.                          | close | Grid rebuilds; cell labels change           |
| 0:36 | Surprise | "Surprise me"                                                | Surprise me rolls a new grid and pairing.                     | wide  | New grid and a new cell pressed             |
| 0:41 | Keep     | "Save to library"                                            | Save puts the sequence in your library.                       | close | Viewer opens with save                      |
| 0:46 |          | "Share sequence"                                             | Share copies a link to it.                                    | close | Toast "Sequence link copied"                |

About 2:00. Open question: the Level Matrix / Ratio Playground switch and the
Customize gear are left out; either could be a second Shape video.

## Fuse

Route `/create/fuse`. Each hand gets a one-hand LOOP; the combined preview
joins them into one two-hand sequence. Both paths are random on open and on
Regenerate, so the lines describe the controls, never a particular path.
Capture script after approval.

Recording state: `fuse-tab-state` and `tka-fuse-splits` cleared. Wait for
`aria-busy` on `.fuse-workspace` to clear before each click. Fuse's labels
are hard-coded English; the mirror button's subject word is unverified.

| Time | Chapter | Click                                           | Bubble                                                      | Shot  | Proof on screen                            |
| ---- | ------- | ----------------------------------------------- | ----------------------------------------------------------- | ----- | ------------------------------------------ |
| 0:02 | Paths   | "Regenerate" (Left card)                        | Each hand gets a one-hand LOOP. Regenerate rolls a new one. | close | Left notation changes                      |
| 0:06 |         | same click, +3.5 s                              | The preview joins them, left in blue and right in red.      | wide  | Combined preview updates                   |
| 0:11 |         | "Previous"                                      | Previous brings back the path you had.                      | close | Left notation returns                      |
| 0:15 | Edit    | "Edit Left path"                                | Edit path has mirror, flip, rotate and more for one hand.   | close | Popover "Left LOOP / Edit this path"       |
| 0:19 |         | the mirror button (_confirm_ label)             | The left path now runs mirrored.                            | wide  | Left notation and preview change           |
| 0:23 |         | "Close path actions"                            |                                                             |       |                                            |
| 0:24 | Linked  | "Linked paths: one path rebuilds the other"     | Linked rebuilds the right path from the left by a rule.     | close | Right card shows the follower state        |
| 0:29 | Play    | the canvas (`director.canvas()`)                | Tap the preview to play it.                                 | wide  | Playback; notation cells highlight in time |
| 0:38 |         | "Set tempo, currently N BPM" (_confirm_ number) | Tempo sets the playback speed.                              | close | BPM chips                                  |
| 0:42 |         | "Disassemble combined preview"                  | Disassemble shows each hand's path on its own.              | wide  | Two previews                               |
| 0:47 |         | "Reassemble combined preview"                   |                                                             |       |                                            |
| 0:48 | Keep    | "Save result"                                   | Save result keeps the fused sequence in your library.       | close | Toast "Fused LOOP saved to your library"   |

About 2:00. Open question: whether the "Choose saved LOOP" and "Choose a
shape" sources deserve a scene; both need content the test account may not
have.

## Tunnel

Route `/create/tunnel`. Up to four performers, each with a sequence; Linked
mode derives the others from Performer 1 by a rule (rotation, reflection,
speed, start offset). Generate is random, so the lines describe the controls.
Capture script after approval.

Recording state: `tka-create-tunnel-draft-v1` cleared so the workspace opens
empty with two performer slots and Linked on. "Open viewer" stays disabled
until every slot has a sequence; in Linked mode one Generate fills both.

| Time | Chapter   | Click                                                               | Bubble                                                  | Shot  | Proof on screen                                      |
| ---- | --------- | ------------------------------------------------------------------- | ------------------------------------------------------- | ----- | ---------------------------------------------------- |
| 0:02 | Cast      | "Generate a new sequence for Performer 1 with the current settings" | Each performer needs a sequence. Generate writes one.   | close | Performer 1 card fills                               |
| 0:06 |           | same click, +3.5 s                                                  | Linked is on, so Performer 2 follows Performer 1.       | wide  | Preview appears with two performers                  |
| 0:11 | Rule      | tab "P2"                                                            | Performer 2 holds the rule that ties it to Performer 1. | close | Performer 2 card                                     |
| 0:15 |           | "More actions: Performer 2"                                         |                                                         |       | Menu                                                 |
| 0:16 |           | "Edit relationship"                                                 | Edit relationship changes that rule.                    | close | Panel with Rotation, Reflection, Speed, Start offset |
| 0:20 |           | "Mirror" under "Reflection: Performer 2"                            | Mirror reflects Performer 2 across the stage.           | wide  | Preview updates                                      |
| 0:25 |           | "Increase offset: Performer 2"                                      | Start offset shifts where Performer 2 begins.           | wide  | Preview updates                                      |
| 0:30 | Cast size | "Add another performer"                                             | Up to four performers share the stage.                  | wide  | Third performer in the preview                       |
| 0:35 | Stage     | "Stage settings"                                                    | Stage settings place the cast and set the tempo.        | close | Panel "Formation, appearance and playback"           |
| 0:39 |           | the play control in Stage settings (_confirm_ label)                | Play runs the whole cast together.                      | wide  | Playback for about 9 s                               |
| 0:49 | Keep      | "Open viewer"                                                       | Open viewer plays the tunnel full size and saves it.    | wide  | Viewer overlay                                       |

About 2:30. Open question: whether a "Browse sequences" scene (picking a
community sequence for Performer 1) replaces Generate as the opening, which
would make the take reproducible.

## Recording recipe (Construct first)

Run on the computer whose dev server reads the feature-video root. The
runner starts its own headless Chrome and needs ffmpeg and Python for the
encoder; it never touches port 5173's process, only its pages.

```powershell
node scripts/post-project.mjs create construct-tutorial --sequence DCKΨ- --title "Construct tutorial" --canvas 16:9
Copy-Item docs/superpowers/specs/tutorial-videos-scripts/creation-modes/construct/* <root>/construct-tutorial/captures/
node scripts/feature-video/capture.mjs --feature construct-tutorial --capture construct-tutorial
node scripts/post-project.mjs walkthrough --feature construct-tutorial --lines <root>/construct-tutorial/captures/walkthrough.json
node scripts/post-project.mjs render --feature construct-tutorial --open
node scripts/post-project.mjs contact-sheet <root>/construct-tutorial/exports/<render>.mp4
```

On a task server instead of 5173, every command above takes `--url` (the
CLI) or `--origin` (the runner) with the server's loopback address, and the
server needs `TKA_FEATURE_VIDEO_ROOT` set to a root that exists on that
computer. Modes that need an account add `--profile <capture profile>` to
the runner. `TKA_CAPTURE_DRY=1` records the Construct script at scale 1 with
quarter-length holds, which checks every label in about three minutes;
`TKA_CAPTURE_SCALE=1.5` is the fallback when scale 2 delivers under 24
frames a second (the pilot's floor).

Measured on the laptop on 2026-10-22: a 75 s dry take at scale 1 recorded at
30 fps and took about three minutes end to end; the 130 s take at scale 2
recorded at 15 fps and took about five minutes; the walkthrough cut takes a
second and the 130 s render about three minutes in a headless Chrome.

## Where this stands

- Scripts for all five modes are drafted from the code and listed above.
  Austen approved the Construct and Assemble scripts as drafted on
  2026-10-22. Capture scripts and lines files exist for both; Construct's
  has been run.
- Construct is recorded and rendered on the laptop (HP-OMNIBOOK7), whose
  feature-video root is `C:/tka-platform-media/feature-videos` (there is no
  E: drive there), served by a task server on port 5186 started from this
  worktree with that root. Take 1 at scale 2 rendered as
  `construct-tutorial/exports/construct-take-1.mp4` (2:10, 1920 by 1080,
  30 fps constant from a 15 fps screencast). Take 2 at scale 1.5, made
  under the pilot's frame-rate rule, recorded at 27 fps and rendered as
  `exports/construct-take-2.mp4` (2:10); it is the one to review, with its
  contact sheet in `exports/stills/`. The desktop that holds the
  `generate-tutorial` project was not reachable from the laptop (no SSH on
  d1; d2's host key is not trusted there), so the folder is copied over by
  hand when the two roots are brought together.
- Two bubbles sit only fairly in take 2: the step editor's "Add or remove
  turns" bubble overlaps the editor's Duration row, and the second Save
  bubble stays at the Save button while the dialog opens at the right edge.
  Both move in the editor; an `include` rect on those lines would also let
  the builder frame the dialog.
- Austen's words replace the placeholder lines in the editor
  (`/post?feature=construct-tutorial` on the server that reads that root).
- Assemble, Fuse and Tunnel need the signed-in capture profile, which does
  not exist on the laptop yet.
