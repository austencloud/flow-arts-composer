---
status: active
value: 4
effort: L
remaining: "All four phases are built (bodies, phrase-brain performances, lessons at full tempo, staff carry). Owed: Austen's look at the lab, close-ups of hands on props, and the Unreal port of the new snapshot fields."
depends_on: ""
plan_path: ""
tags: [village, flow-fest]
last_triaged: 2026-10-28
work_state: in-progress
---
# Village people on the Flow Fest performer stack

Austen, 2026-10-27, on the village lab after the realism wave: people float
instead of walking, the sequences ignore momentum, hands come off the props,
props are held out in front while walking, and shrinking youths is cheap. "This
was kind of the prototype for Flow Fest Sim." His picks: drop visible age, and
rebuild the people on Flow Fest's stack so both scenes share one system.

## What is wrong now (from the code)

| Seen                       | Cause                                                                                                                                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hands leave the props      | `VillageAvatar` drives a bare `PerformerRig` with `weldGrip` off and no reach fit. `LiveSequencePerformer3D` fits prop length and hand distance to each character's measured arms and runs contact and body response.                                                          |
| Momentum makes no sense    | Every catalogue sequence is forced `isCircular` and looped, so one that does not end where it starts jumps at every repeat; each new sequence starts at its own start pose; lessons `goToStep` and pause, so props stop dead mid-air and jump between steps.                   |
| Floating                   | With a sequence loaded the body follows the sim's position with no steps (`village-walk.ts`). Flow Fest walks spinners with exact-step beat travel and walk-safe material only.                                                                                                |
| Props held out             | Props show whenever the body does, with nothing spinning them.                                                                                                                                                                                                                 |
| Youths are shrunk adults   | `village-age-look.ts`.                                                                                                                                                                                                                                                         |

## Owners (reuse, extend, compose)

- **Body, hands, props:** reuse `shared/3d/performers/LiveSequencePerformer3D.svelte`.
- **What a spinner plays and where they stand:** the phrase brain, library tags,
  joins and playback (`features/flow-fest-sim/domain/flow-fest-phrase-*.ts`).
  They stay in `flow-fest-sim`, and the village imports them: a move would
  touch every Flow Fest scene for no change in behaviour. The village bakes
  each sequence's tags and joins into `village/domain/village-phrase-table.json`
  (the sim never loads motion), checked against the catalogue by a test.
- **Walking while spinning:** reuse `shared/3d/locomotion/beat-travel-plan.ts`
  through the phrase playback.
- **Carrying a prop while not spinning:** the approved S1/S2/H1 carry poses
  from `codex/flow-fest-carry-web` (30c9e750b7, not on main; applies cleanly).
  Their domain and rig move to shared beside the performer; Flow Fest's
  wiring stays on its branch.

## Phases (each merges on its own)

1. **Bodies.** Remove visible age (scale, youth wobble, stoop). Villagers
   render through `LiveSequencePerformer3D` with welded grip, reach fit and
   body response. Props show only while spinning; otherwise empty hands until
   phase 4. Seated figure unchanged.
2. **Spinning from the phrase brain.** A performance or practice is a phrase
   plan over the villager's repertoire, starting from where they stand and
   chaining hand to hand (brain rule 10). Only sequences that end where they
   start repeat. Travelling phrases walk on the beat with walk-safe material;
   the sim's target for a performer becomes the phrase path, not a glide.
   Sim change: the replay golden moves, regenerated in that commit with why.
3. **Lessons at full tempo.** The teacher plays a phrase; the learner joins
   mirrored on a phrase boundary and plays at tempo. A slip ends the
   learner's phrase at its next join (props never stop mid-air) and they
   rejoin on the following phrase. The lesson phases stay; what each phase
   plays changes. Shared snapshot fields change, so the Unreal port note is
   updated in the same commit.
4. **Carry.** Walking and standing villagers who own a prop carry it in the
   approved poses; it goes to the hands only when they start spinning.

## Out of scope

Unreal (`unreal/`, the Museum Unreal Port session's), Flow Fest's own scenes
beyond the import move, and new character models.

## Checks

Village unit tests and replay golden, `flow-fest-phrase-*` tests after the
move, `npm run test:changed`, then `wt:finish --route /lab/village`. Browser:
the lab at default camera, one performer walking a travelling phrase, one
lesson through a slip, a carrier walking, hands on props in close-up.
