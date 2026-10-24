---
status: active
value: 4
effort: L
work_state: in-progress
remaining: Build steps 1 and 3 started 2026-10-22; the remaining steps, the weave library and the Unreal port follow.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-23'
---

# Real poi: tether physics and a weave library

Status: APPROVED by Austen, 2026-10-22. Build steps 1 and 3 started the same
day.

Scope: poi on the 3D performers, in the browser (Threlte) and in native Unreal
(`unreal/FlowFest/`). Rigid props (staffs, clubs, fans, hoops) belong to the
Flow Fest jam's phrase brain
([2026-10-22-flow-fest-follow-the-light.md](2026-10-22-flow-fest-follow-the-light.md)).
This spec owns poi and agrees an interface with that work.

## What we're building

Today a 3D poi is a rigid stick. The string is a straight cylinder posed from
the notation's staff angle, in both the browser (`Poi3D.svelte`,
`worker-procedural-props.ts` `createPoi`) and Unreal (a static mesh with a
captured transform). Nothing hangs, nothing goes slack, and the head never
follows the hand. Poi only play grid work translated from other props.

When this is done:

1. **The string is real.** Gravity acts on it. The head follows the hand
   through the string. When the spin is too weak the string goes slack and the
   head drops, because the physics says so, not because a script does.
2. **Poi have their own moves.** A poi move library starts with the 3-beat
   weave (forward and backward), built from a motion-capture study of tutorial
   footage. TKA poi sequences stay in the repertoire and get the same string.
3. **Spinners differ.** Clean and sloppy timing, and planted and walking
   versions, come from measured variation, through an interface the jam's
   phrase brain drives.

## Decisions taken (Austen, 2026-10-22)

| Question                   | Choice                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| First moves                | Weaves. 3-beat first, built from markerless mocap of tutorial footage.                                                    |
| Footage                    | Ten YouTube tutorials (6 Playpoi, 2 DrexFactor, 2 Circus Brighton), downloaded with his yes, kept local as research data. |
| How the poi moves          | **Solve, then simulate.** Solver gives the hand target; a real string sim moves the head from the actual hand.            |
| How moves are written down | **Separate poi move library**, not TKA notation.                                                                          |
| Repertoire                 | **Library moves plus the poi-legal TKA sequences**, all on the same string physics.                                       |

## Architecture

Five units, each usable and testable alone. The same data and the same
algorithm run in both engines.

```
 move source                    hand target          real hand        head
 ───────────                    ───────────          ─────────        ────
 TKA poi sequence ──► hand solver ──┐
                                    ├─► performer IK ──► string sim ──► render
 library move (weave) ──────────────┘   (+ body overlay)    ▲
                                                            │
                             intended head path ────────────┘ (steering, via the hand)
```

### 1. String sim (`poi-tether`)

Pure, engine-free code. One TypeScript module, ported line for line to C++.

- **Model.** A chain of 8 points: the hand anchor, 6 light string points and a
  heavy head. Position Verlet at a fixed 240 Hz substep, independent of frame
  rate. Gravity, light air drag on the head.
- **The string can't stretch but can go slack.** Each segment is an
  inequality constraint (length ≤ its rest length), so a string under no pull
  bends and sags instead of acting like a rod.
- **Correction goes through the hand, never through the head.** A real
  spinner keeps a poi on its pattern by moving the hand. The sim does the
  same: the hand target is nudged by a small gain times the head's error from
  its intended path (a PD term on the hand). There is no invisible force on
  the head, so a slack poi can't be steered, as in life. The gain is the
  `skill` dial's main lever (see Personality).
- **Outputs per frame:** the 8 point positions (for drawing the string), head
  position and velocity, string tension in poi weights, and a `slack` flag
  (tension under 0.2 weights, the Poi String lab's "loose" band).
- **Lost poi.** If the head error stays above one string length for 2 beats,
  the sim reports `lost`. The caller decides what to do. In v1 the performer
  stops that hand's move and restarts it on the next cycle.

### 2. Hand solver (from the Poi String lab)

`solvePoiHand` in `src/lib/features/lab/tabs/poi-string/poi-string-check.ts`
already does the inverse: it keeps the head on the drawing and puts the hand
one string length along the pull the head needs. It moves into a shared module
and grows in three ways:

- **3D:** it solves in the move's plane, then rotates the result into the
  performer's frame. The plane comes from the caller.
- **Output is a track, not a verdict:** hand targets and intended head
  positions per sample. The stray and effort bands stay for the lab.
- **Precomputed and cached** per (sequence, tempo, hand radius, string
  length) at load time. A TKA loop at 120 samples per beat is a few kilobytes.

Library moves skip the solver. The mocap gives both their hand path and their
head path directly.

### 3. Poi move library

Data, not code: one JSON file per move, exported for both engines the way
`jam-layout.json` is.

```ts
interface PoiMove {
  id: "weave-3-forward" | "weave-3-backward"; // grows later
  name: string;
  cycleBeats: number; // 6 for the 3-beat weave (both hands' full cycle)
  plane: "wheel" | "wall" | "floor"; // the plane the circles spin in
  walkable: boolean; // may be played while travelling
  tempoRange: [number, number]; // bpm the data supports
  hands: {
    left: PoiMoveHand;
    right: PoiMoveHand;
  };
  body: PoiBodyCurves; // upper-body overlay, see below
  provenance: string[]; // research sources, for the credits doc only
}

interface PoiMoveHand {
  // Samples per cycle, in the body frame, normalised by arm length.
  hand: Vec3Sample[];
  head: Vec3Sample[]; // intended head path
  handSpread: number[]; // per-sample spread across sources (for sloppiness)
}

interface PoiBodyCurves {
  // Per-sample joint rotations for spine, chest, shoulders, upper and lower
  // arms, plus their spread. No legs, hips or feet: those belong to the
  // phrase brain.
  joints: Record<string, QuatSample[]>;
  spread: Record<string, number[]>;
}
```

The library holds **averages across sources, never one person's track**. That
is the line between research and copying: no shipped move reproduces a single
spinner's performance.

### 4. Weave mocap study (offline pipeline)

Built on the existing markerless pipeline in `E:/mocap-metahuman/` (UE 5.8
MetaHuman Body Tracker, SAM 2 prop tracking, Blender retarget to X Bot). See
memory `project_markerless_mocap_metahuman`.

1. **Pick segments.** From each tutorial, cut the stretches where the full
   body is in frame doing the weave on repeat (target 10–25 s per clip). Skip
   talking, close-ups and part moves. Convert to constant 60 fps with
   `prepare-take.ps1`.
2. **Solve bodies** overnight on d1 (about 20 minutes of solve per 25 s clip;
   uses the whole machine, so only while Austen is away).
3. **Track poi heads** with SAM 2 and lift them to 3D on the solved camera, as
   `prop/` does for staffs. The string length is fixed per clip (Austen's rule
   for staffs: a prop never changes length).
4. **Fix the arms where the solve fails.** The staff test showed arms go wrong
   when hands cross in front of the chest, which a weave does on every beat.
   The hand is placed where the tracked head says it must be (the hand solver
   run forwards on real data), and the arm is solved by IK to reach it.
5. **Phase-align and average.** Find each clip's weave cycle from the head
   tracks, resample to one cycle, normalise by body size, average, and keep the
   per-sample spread.
6. **Export** `weave-3-forward.json` and `weave-3-backward.json`.

Footage and per-source tracks stay in `E:/mocap-metahuman/` and never enter the
repo, an artifact, email or Drive. Only the averaged move files are committed.

### 5. Performer integration

**Browser.** `LiveSequencePerformer3D` gains a poi path:

- Hand IK targets come from the solver track (TKA sequences) or the move
  (library), plus the sim's correction term.
- For library moves the upper body follows the move's `body` curves, layered
  over whatever the lower body is doing.
- The rigid poi mesh is replaced by a handle at the hand (pointing along the
  first string segment), a string drawn through the sim's points (all strings
  in the scene in one shared line buffer, so one draw call), and the head at
  the last point. Fire and LED effects attach to the head point, not the old
  tip estimate.

**Unreal.** Unreal plays performers from motion captured in the browser
(`.motion.json`, `FlowArtsRuntimeMotion.cpp`) rather than running the TS
sequence code. So:

- The capture adds the hand-target track and the intended head path for each
  poi hand.
- The string sim runs natively and live in C++ (`FlowArtsPoiTether`), so slack
  and tension react to the actual animated hand, the same as in the browser.
- The string is drawn as a spline mesh or a procedural tube through the sim
  points. Not Chaos Cable: an identical algorithm in both engines matters more
  than Unreal's own cable.
- **Parity test:** the TS sim writes fixture files (a hand track in, head
  positions out). A C++ automation test replays them and must match within
  1 mm.

## Personality and the phrase-brain interface

The phrase brain picks what and when for every performer. The poi system
decides how a poi hand does it. Request:

```ts
interface PoiPhraseRequest {
  source: { kind: "move"; id: string } | { kind: "sequence"; id: string };
  startBeat: number;
  beats: number;
  bpm: number;
  planeYaw: number; // the plane the phrase brain picked for this phrase
  mode: "planted" | "turning" | "travelling";
  skill: number; // 0..1
  sloppiness: number; // 0..1
  seed: number;
}
```

Who owns what:

| Phrase brain                               | Poi system                                    |
| ------------------------------------------ | --------------------------------------------- |
| Phrase choice, length, plane, facing       | Hand targets, upper-body overlay              |
| Feet, hips, steps, travel path             | String sim, poi heads, slack, tension         |
| Planted / turning / travelling mode        | Refusing a non-walkable move while travelling |
| What happens after `lost` or `phraseEnded` | Reporting `lost`, `phraseEnded`               |

What the dials do:

- `skill` raises the steering gain, and the move's tempo ceiling and which
  moves are open (the weave needs skill ≥ 0.3; plain circles need none).
- `sloppiness` scales timing jitter and hand-path noise by the measured
  spread from the mocap. At 1 it reaches the loosest real spinner in the set;
  it can't exceed what real spinners did.
- `seed` makes a spinner repeatable from run to run.

The 3-beat weave is `walkable`. Playpoi teaches a "weave with your feet", and
walking simple material is the low-skill mode the jam wants.

## Build plan, ranked

Each step ends with something Austen can watch. Browser and Unreal pieces of a
step can run in parallel in separate worktrees.

| #   | Piece                                                                                                    | Engine  | Watchable result                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | String sim core + tests (slack appears when tempo drops, tight string follows the path, never stretches) | Shared  | `/test/poi-tether`: one performer playing a poi-legal TKA sequence with a real string; a tempo slider shows slack |
| 2   | C++ port of the sim, parity fixtures, string drawing                                                     | Unreal  | Same performer, same sequence, in an Unreal test launch                                                           |
| 3   | Weave mocap study: segments, overnight solves, head tracks, averaging, export                            | Offline | Side-by-side page: averaged weave skeleton beside the source clips (local only)                                   |
| 4   | Library player and body overlay; weave on the test page                                                  | Browser | The test page plays the 3-beat weave, forward and backward, with real strings                                     |
| 5   | Library player in Unreal                                                                                 | Unreal  | The weave in the Unreal test launch                                                                               |
| 6   | Phrase-brain interface, personality dials, distance LOD; the jam's 7 poi spinners switch over            | Both    | The fire jam's poi spinners weave, walk and occasionally go slack                                                 |
| 7   | Next moves (2-beat weave, then butterfly) through the same pipeline                                      | Both    | Separate approval per move                                                                                        |

The order of later moves comes from the poi trick catalog
([docs/research/poi-trick-catalog/](../../../research/poi-trick-catalog/README.md)):
446 named tricks from public sources, marked where VTG or the Shape Engine
already has them. Austen fills in what the uncertain ones look like.

Steps 1 and 3 can start the same day: one is code, the other is overnight
compute and data work.

## Risks, honestly

- **Mocap quality is the big unknown.** The Playpoi clips are 360–720p at
  24–30 fps. The solver wants HD at 60 fps, and a forum user reported 30 fps
  footage failing. Arms crossing in front of the chest already broke the staff
  solve. Mitigations: the four 1080p clips, Playpoi's slow-motion clip, and
  rebuilding the hand from the tracked head (pipeline step 4). If the averaged
  weave still looks wrong, the fallback is Austen filming his own weave from
  two angles.
- **Poi head tracking at 30 fps.** A fast head is a blur streak. SAM 2 may need
  more correction clicks than it did for staffs, and the streak centre may sit
  off the true head.
- **Steering through the hand may oscillate.** The head lags the hand, so the
  feedback loop can ring. Tune the gain and damping on the test page first. If
  it can't be made stable, the fallback is a capped force on the head that
  acts only while the string is tight (it still can't fake a slack poi).
  Using it would be a spec change and goes back to Austen.
- **Some TKA sequences will look sloppy.** The Poi String sweep found 137
  left-hand and 79 right-hand spins whose hand stray exceeds the string's
  length, all jumping between 0 turns and a fast spin. With real physics
  those go slack or round off. That's honest, and the poi-legal filter keeps
  most of them out of the jam.
- **Performance.** The sim is cheap: 8 points × 240 Hz × 14 poi is about 27,000
  point updates a second, well under a millisecond even for 100 spinners. The
  real costs are string drawing (one shared buffer), per-frame arm IK, and the
  jam's tight budget (58–60 fps after a hard optimisation pass, where finger
  contact once took 63% of a frame). Distance LOD: past a set distance the
  string drops to one segment at a lower rate. Spinners at the edge keep
  today's spin-in-hand.
- **Clipping is accepted for now.** Strings and heads will pass through arms
  and bodies, and weaves come close by design. String-body contact is the
  foundation for wraps and is out of scope.
- **Two engines can drift.** The parity fixtures guard the sim. They do not
  guard IK or retarget differences between the browser and Unreal skeletons.
- **Rights.** The footage was downloaded from YouTube against its terms of
  service, at Austen's direction, as research data. It stays on d1. Only
  averages across sources ship. The credits doc names Playpoi, DrexFactor
  Poi and Circus Brighton as research sources.
- **Compute.** Ten clips at about 20 s each is roughly 3–4 hours of overnight
  solve on d1. d2 (8 GB GPU) has not been tested for this.

## Out of scope

Wraps, stalls, tosses, contact with the body; poi colliding with each other or
with other performers' props; TKA notation changes; the phrase brain itself;
rigid-prop personality; shipping any footage.

## Done means

- `/test/poi-tether` and its Unreal launch play a poi-legal TKA sequence and
  the 3-beat weave (forward and backward) with real strings, slack at low
  tempo, and matching heads in both engines (parity test green).
- The jam's 7 poi spinners use `PoiPhraseRequest` and hold the jam's frame
  budget.
- Austen has watched each step's result and said yes.
