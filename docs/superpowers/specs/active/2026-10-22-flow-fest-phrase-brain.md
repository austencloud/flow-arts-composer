# Flow Fest: the phrase brain (believable jam spinners)

Status: approved direction, 2026-10-22. First build: a staff test stage in both engines.
Parent: `2026-10-22-flow-fest-follow-the-light.md` (the jam slice).

## Why

Austen's verdict on the jam circle: the spinners "kind of look really kind of crappy".
What the code shows:

- **They float.** Jam performers slide from spot to spot while their arms spin.
  `PerformerRig` already supports footsteps (`isMoving`, `moveSpeed`, `moveDirection`,
  `gaitTimingSample`, `terminalStepPlan`; the Stage module drives them through
  `stage-travel-plan.ts`), but `LiveSequencePerformer3D` never passes them on.
- **Bizarre sequences.** All 34 performers share six LOOPs from the random generator.
  Each step is legal TKA, but no phrase holds a plane, repeats or builds, so nothing reads
  as a person spinning.
- **Wrong props on fire.** `jamPropType` maps staff to the plain staff, hoop to the plain
  big hoop, fans to the plain fan and dragon staff to the plain big staff, then adds fire.
  Only the double staff maps to a fire model.

## Decisions (Austen, 2026-10-22)

- **A sequence has no canonical plane.** Any sequence can be done in any plane; the
  performer chooses the plane as it plays. The plane belongs to the performance, not
  the data.
- **Staffs (and other rigid props) draw from the whole library.**
- **Poi stay on today's grid work** until the separate poi project (tether physics and
  weave vocabulary) replaces them. Rope darts follow poi.
- **Dual wheel is held at the sides**, as the web app already does. Clipping between
  props and bodies is accepted for now; negative space comes later.
- **People differ:** some are sloppy, some clean; some stand still and do tech, some walk
  around doing simple material.

## The model

A performer is a **phrase brain** that strings phrases together. A phrase is:

| Field        | Meaning                                                                   |
| ------------ | ------------------------------------------------------------------------- |
| `sequenceId` | A library sequence (rigid props: whole library).                          |
| `repeats`    | 1–3 plays of the sequence.                                                |
| `plane`      | Wall, wheel or floor, held for the whole phrase. Dual wheel is side-held. |
| `mode`       | `planted`, `turning` or `travelling`.                                     |
| `facing`     | Yaw at the start; `turning` phrases end on a new yaw.                     |
| `path`       | For `travelling`: from and to ground points, with exact footsteps.        |

### Modes

1. **Planted.** Feet stay put with small weight shifts on the beat. Any sequence the
   personality allows; this is where hard material happens.
2. **Turning.** Stepping on the spot to the beat while the body turns. **Plane changes
   happen only at the start of a turning phrase.**
3. **Travelling.** Walking a few metres with exact footsteps (the Stage module's
   destination walk), feet on the beat. Only **walk-safe** sequences.

### Walk-safe moves (default, for Austen to tune on the stage)

While walking, a staff spinner does simple material in one plane only:

- forward and backward wheel-plane spins;
- wall-plane figure-eights;
- basic passes between hands.

Anything with turns or plane changes happens planted. The walk-safe list is a setting on
the test stage, not a hard-coded rule, so Austen can add or ban moves by watching.

Classifying a library sequence as walk-safe is the brain's job, from its data: no plane
change (already true by construction), a low total turn count, and no step whose
motion type the classifier marks as hard. The thresholds are settings too.

### Personality

Each performer gets:

| Trait    | Range             | Effect                                                                                              |
| -------- | ----------------- | --------------------------------------------------------------------------------------------------- |
| `skill`  | 0–1               | Timing looseness (late or early hits, small tempo drift), and how hard the planted material can be. |
| `style`  | techer ↔ wanderer | Share of planted versus travelling phrases, and travel distance.                                    |
| `energy` | 0–1               | Phrase length, and breaks (stop spinning, stand, step out of the circle, come back).                |

The brain is deterministic per performer seed, so the same performer does the same night
and tests can pin it.

### Rules

1. A phrase is one sequence played 1–3 times.
2. The plane holds for the whole phrase.
3. Plane changes only at the start of a turning phrase.
4. Travelling phrases use walk-safe sequences only, with feet on the beat.
5. Hard material is planted.
6. In the jam, spinners stay inside their area of the circle and face mostly outward
   (the existing jam rules still apply).
7. A planted streak ends after two to four planted phrases (rests count; fewer for higher
   energy) on a turning phrase that changes plane. A techer's is a quarter turn on the
   spot. Over a night every performer plays all three planes, and a techer changes plane
   at least six times in 512 beats.
8. At most two turning phrases in a row. Facing away (the back to the audience), the
   performer turns back out once, then walks or plants; side on still counts as facing
   the audience. A wanderer turns on about 15–25% of phrases and travels on 30–45%.
9. Plane shares follow the performer's preference. The floor plane (overhead and low
   horizontal spins) gets about a fifth of a techer's phrases and a little less of a
   wanderer's.
10. **Phrases chain** (added 2026-10-23, after Austen saw the props jump between
    sequences). Each phrase's sequence starts where the previous phrase's sequence
    ended: both hands at the same grid location and orientation. A sequence's start is
    where each hand's first step begins; its end is where each hand's last step lands
    (`phraseJoins`, which matches `rebuildPhraseSequence` for all 320 entries). Among the
    allowed sequences (mode, walk-safe, plane, personality limits) the brain picks an
    exact match; failing that, one with the hands at the right locations; failing that,
    the closest. It prefers sequences that end where at least 20 library sequences
    start, so a bridge never leads into a dead end. Only a sequence that ends exactly
    where it starts may repeat (four of the library's "circular" sequences end with the
    orientations flipped, so the flag alone is not enough). A rest holds the chain: its
    named sequence starts where the hands are. `countJoinMismatches` counts the joins
    that do not match; it is 0 for the stage night with the default seeds, and for
    every seed the tests run.

## Architecture: one brain, two engines

- **Brain (TypeScript, pure domain):** `src/lib/features/flow-fest-sim/domain/` gets a
  phrase-brain module. Given a performer seed, personality, prop family, an area, a
  tempo and a phrase library, it produces a **phrase schedule**: phrases with start
  beat, sequence, plane, mode, facing and path. No three.js or Svelte in it.
- **Phrase library:** a static snapshot of library sequences, so both engines use the same
  set and the page needs no network. It is written by a tool from the library, with
  walk-safe and difficulty tags computed at write time, and stored under
  `static/data/flow-fest/`.
- **Browser:** the brain's schedule drives `LiveSequencePerformer3D`, with new optional
  props that pass travel and gait inputs through to `PerformerRig`, defaulting to
  today's behaviour. The plane per phrase uses the existing `leftPlane`/`rightPlane`
  props.
- **Unreal:** the brain's schedule is exported as JSON, the way `export-jam.ts` exports the
  layout. Native playback uses captured routines per (sequence, plane) from the existing
  native capture pipeline (`unreal/FlowFest/Tools/native-capture-README.md`). The upper
  body plays the captured spin while the lower body plays native locomotion during
  travelling and turning phrases.
- **Fire props:** fix `jamPropType` so every fire performer holds a fire model. Where no
  fire model exists for a family yet (fans, hoop, dragon staff), say so and use the
  closest fire model, or keep it unlit, rather than adding fire to a plain prop.

## First build: the staff test stage

A small lit stage, not the jam. Two staff spinners side by side with the same prop and
different personalities:

- **Left:** a planted techer (high skill, low wander).
- **Right:** a wanderer (middling skill, high wander).

On screen:

- **Labels** naming each performer's current phrase: mode, plane and sequence name.
- **Controls:** tempo, the walk-safe move list, the walk-safe thresholds, each
  performer's traits, and a reseed button.
- **Orbit camera** and a ground grid so footsteps can be judged against the floor.

Browser route: `/test/flow-fest-phrase-stage`. Unreal: a `-PhraseStage` launch mode
of the FlowFest project, with a `Launch-PhraseStage.cmd`.

### Done means

- Feet step on the beat while travelling and turning. No sliding: feet stay planted
  during planted phrases, measured with the gait probe.
- Planes hold through each phrase and change only on turns, checked by a unit test on
  the brain.
- The two spinners look like different people.
- Both engines play the same schedule for the same seed.
- Unit tests cover the brain (rules 1–5, determinism, walk-safe filtering) and the
  library snapshot tags.
- Then Austen's look. Only after his yes does the brain go into the jam circle.

## Not in this build

- Poi and rope dart (the poi project).
- Negative space and clip-free props.
- Duets and passing between performers (next, after the stage).
- Unreal fire and LED look parity with the web (a separate parallel job).

## Phrase schedule file (shared contract)

`static/data/flow-fest/phrase-stage-schedule.json`, written by the brain (a tool runs it
for fixed seeds). Unreal copies it to `unreal/FlowFest/Content/FlowFest/Assets/Jam/Data/`
the way `export-jam.ts` does. Units are metres and radians, in the jam's frame: x east,
z south, and yaw 0 faces +x, turning toward +z.

```json
{
  "version": "flow-fest-phrase-schedule-v1",
  "tempoBpm": 60,
  "lengthBeats": 512,
  "performers": [
    {
      "id": "stage-left",
      "seed": 11,
      "characterId": "ch07",
      "propFamily": "staff",
      "personality": { "skill": 0.9, "style": 0.15, "energy": 0.6 },
      "home": { "x": -1.5, "z": 0 },
      "areaRadius": 2.5,
      "phrases": [
        {
          "startBeat": 0,
          "beats": 32,
          "sequenceId": "library-id",
          "sequenceName": "Display name",
          "repeats": 2,
          "plane": "wall",
          "mode": "planted",
          "facingStart": 1.57,
          "facingEnd": 1.57,
          "turnBeats": null,
          "path": null,
          "rest": false,
          "timing": { "jitterBeats": 0.03, "tempoDrift": 0.01 }
        }
      ]
    }
  ]
}
```

`style` runs from 0 (techer) to 1 (wanderer). `path` is
`{ "from": {x,z}, "to": {x,z}, "steps": n, "beatsPerStep": b }` for travelling phrases, and `null`
otherwise. The phrase library snapshot keys sequences by the same `sequenceId`.

Added in the first build (2026-10-22, additive; field order as in the example):

- **Tiling.** Phrases cover `[0, lengthBeats)` exactly, in order, with no gaps. The
  night loops at `lengthBeats`.
- **Position.** A performer starts at `home`. A planted or turning phrase stands where the
  last travelling phrase ended (`path.to`); a travelling phrase starts at `path.from`.
- **`path.beatsPerStep`.** Footfalls start with the phrase: footfall _k_ (1-based) lands
  on `startBeat + k * beatsPerStep`, so the walk ends at `startBeat + steps * beatsPerStep`
  and the rest of the phrase stands at `path.to`. `beatsPerStep` is 1 between 90 and
  150 bpm, 2 above 150 bpm, and 0.5 below 90 bpm (the exact-step plans cover 90 to 150
  steps a minute, so at the stage's 60 bpm a walk steps twice a beat).
  A walk keeps the facing (`facingEnd` equals `facingStart`) and heads within about 35°
  of it. Distance, steps and time always pass the exact-step constraints.
- **`turnBeats`.** For a turning phrase, the beats the turn takes from `startBeat`: a
  quarter turn lasts a second and a half turn a second and a half, rounded to whole
  beats (2 and 3 at 120 bpm, 1 and 2 at 60; the authored stepping turn clips). The rest of the
  phrase is planted at `facingEnd`. `null` for other modes.
- **`rest`.** `true` for a break: feet planted and props held still at the start of the
  named sequence: the one just played when it ends where it starts, otherwise a sequence
  that starts where the hands are (rule 10). `repeats` is 1 and `mode` is `planted`; `beats`
  need not be a multiple of the sequence length.
- **`timing`.** `jitterBeats` is an offset on the props inside the phrase, in beats;
  positive is late. `tempoDrift` is a fractional tempo change for the props inside the
  phrase; positive is rushing. Since rule 10 the offset eases in over the phrase's first
  two beats and out over its last two (a quarter of the phrase when shorter, with a
  smoothstep), so the props leave and land on each join on the beat:
  `score = local + ((local − jitter)(1 + drift) − local) · smoothstep(min(1, local/e, (beats − local)/e))`
  (`phraseScoreBeat`). Feet and turns stay on the beat.
- **Library file.** `static/data/flow-fest/phrase-library.json` (`flow-fest-phrase-library-v1`)
  holds each sequence in the public library's compositional form (`leftSoloProp`,
  `rightSoloProp`, `stepPairings`) with empty fields left out: `null`s, a step `duration`
  of 1, and false `leftReversal`/`rightReversal`. Rebuild steps with
  `rebuildPhraseSequence` (`flow-fest-phrase-sequence.ts`), which restores those defaults
  and calls `deriveSteps`. Each entry also carries `beats` and `tags`.
- **Stage tempo.** 60 bpm, the app's animation default (one step a second), changed
  2026-10-23 from 120. The Unreal stage's captured arm tracks were made at 120 and need
  recapturing.
- **Stage cast.** Both performers face the audience at yaw π/2 (+z). `stage-left` is at
  home (−2.25, 0) with area radius 2.0; `stage-right` at (3.0, 0) with radius 3.0 (changed
  2026-10-22 from (2.25, 0) and 2.4). The areas do not overlap. 2.0 is about the least
  radius that fits the shortest walk (three steps of 0.56, kept 0.25 inside the edge) from
  home, so the techer can travel at all; 3.0 fits two or three walks in a row along one
  facing, so the wanderer walks more than it turns.
