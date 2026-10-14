# Film Director Gap 7 — Blocking Edges

> Executor plan. Worktree: `E:\worktrees\tka-platform\director-gaps`, branch
> `claude/director-gaps`. Campaign ledger:
> `docs/superpowers/plans/2026-08-30-film-director-gap-campaign.md` (Gap 7 is
> the unchecked item at line 128).
>
> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans`
> and work task by task. Steps use checkbox (`- [ ]`) syntax. Re-read this file
> at the start of every task.

**Goal:** close the four blocking edges the ledger names, each landing as either
a real capability or a proven rejection:

1. `run` — **rejection only.** The locomotion owner has one walk clip and no run
   gait, so `move: "run"` parses and then rejects with a message that names the
   constraint.
2. **Arc paths** — real. A `walk` may bow left or right on the way to its mark:
   `along: { arc: "left" | "right", bulge?: number }`, compiled into chord
   keyframes inside `compileBlockingMoves`.
3. **Offstage entrances** — already legal, documented. Positions and `to` are
   unbounded and `collectStageExtent` grows the floor to include them, so an
   entrance is an opening mark outside the frame plus a walk in. No schema
   change; one proving scene and a matrix note.
4. **Stand-and-watch** (`sequence: {source: "none"}`) — branch decided by a
   verification spike in Task 1. Branch A implements a genuinely sequence-less
   performer; branch B implements it as a proven rejection. Both are fully
   specified below; the executor runs the spike, picks one, and reports which.

**Architecture:** everything for the arc resolves at compile time. A walk with
`along` still produces a plain `ResolvedDirectorBlockingKeyframe[]` — just more
of them, each pair still a straight chord — so `sampleDirectorBlockingTrack`,
`director-blocking-track.ts`, and `collectStageExtent` are untouched. The
invariant `collectStageExtent` documents at
`src/routes/test/film-director/_lib/resolve-film-director-spec.ts:838-841`
("Blocking segments are straight lines between keyframes, so the keyframes
themselves bound the whole scene's travel") stays literally true.

**Version:** stays 5. Every addition is optional (`along`) or a new member of an
existing enum (`run`, and `source: "none"` under branch A). No shipped film
changes meaning, so `FILM_DIRECTOR_SCHEMA_VERSION` does not move.

**Test command:**
`node node_modules/vitest/vitest.mjs run --config tests/config/vitest.config.ts tests/unit/film-director`
(`-u` only in the snapshot step of Task 6.)

---

## Research this plan rests on (read and verified 2026-09-02, in this worktree)

- `src/routes/test/film-director/_lib/blocking-language.ts`
  - `DirectorBlockingVerb = "stand" | "walk" | "turn"` (line 16).
  - `DirectorBlockingMove` (lines 30-38): `move`, `to?`, `direction?`,
    `amount?`, `facing?`, `durationSeconds?`, `easing?`.
  - `ResolvedDirectorBlockingKeyframe` (lines 40-47):
    `{atSeconds, position, facingAngle, walking, easing}`.
  - `MAX_TRAVEL_SPEED = 2.6` (line 66) with the comment at lines 62-65: "A
    brisk walk is about 1.4 m/s and a jog about 2.5. Past this the walk clip can
    no longer be sped up to match the ground and the feet skate."
  - `MOVE_RULES` (lines 71-86): per-verb `{unit, directions, takesDestination}`.
  - `compileBlockingMoves` (lines 88-190). The walk branch is lines 150-176 and
    pushes exactly two keyframes: `push(start, position, facingAngle, true)`
    then `push(end, destination, nextFacing, false)`.
  - `assertWalkable(delta, windowSeconds, performerId)` (lines 308-320) measures
    `Math.hypot(delta.x, delta.z)` — the CHORD.
  - `resolveWalkFacing` (lines 257-269): `"travel"` is
    `Math.atan2(delta.x, delta.z)`.
  - Facing convention, from the comment at lines 277-281: angle 0 looks down
    `+Z`, angle increases clockwise seen from above, so forward is
    `(sin, cos)` and right is `(cos, -sin)`. Therefore for a unit travel
    direction `f = (fx, fz)`, the traveller's right is `(fz, -fx)` and their
    left is `(-fz, fx)`.
  - Error copy style, verbatim shapes to mirror:
    `` `${where} does not take a destination.` `` where
    `` where = `Performer "${performerId}": "${move.move}"` `` (lines 196-206),
    and the long form in `assertWalkable`:
    `` `Performer "${performerId}" would cover ${fmt(distance)}m in ${fmt(windowSeconds)}s (${fmt(speed)} m/s). Travel tops out at ${fmt(MAX_TRAVEL_SPEED)} m/s — give the move more time or a shorter distance.` ``
    `fmt` (line 306) is `(n) => String(Number(n.toFixed(2)))`.
- `src/routes/test/film-director/_lib/film-director-schema.ts`
  - `blockingMoveSchema` at line 568, `move: z.enum(["stand", "walk", "turn"])`
    at line 570, `to: position2Schema.optional()` at 571, `.strict()` plus
    `.superRefine(atMostOneTimeUnit)` at 590-591.
  - `position2Schema` at line 187: `{x: finiteNumber, z: finiteNumber}`,
    `.strict()`, no bounds. Nothing anywhere clamps a position to a stage
    rectangle.
  - `performerSequenceSchema`'s object starts at line ~480 with
    `source: z.literal("demo").optional()`; the source refinement and the
    `CONTROL_REJECTIONS` lookup are in its `superRefine`.
  - `version` accepts the five literals at lines 909-915, and the comment above
    them forbids version-conditional parsing.
- `src/routes/test/film-director/_lib/resolve-film-director-spec.ts`
  - `buildResolvedPerformers` line ~462: `const position = input.position ?? slot!.position;`
    A per-performer `position` overrides the formation slot under ANY preset;
    `formation: "custom"` is only required when you want the resolver to demand
    a position from every performer (line 429-433). So the proving scene keeps
    `side-by-side` and overrides one performer's mark.
  - `collectStageExtent` lines 838-849: the extent is the union of every
    performer's opening mark and every blocking keyframe position. Nothing
    clamps it, which is what makes an offstage entrance legal today.
- `@austencloud/scene-3d` `dist/lib/config/formation-presets.js`
  - `PRESET_VALID_COUNTS["side-by-side"] = [2,3,4,5,6,7,8]` (line 460).
  - `generateSideBySideSlots` (line 262): spacing `1.8`, `z = FORMATION_WALL_OFFSET`,
    and `FORMATION_WALL_OFFSET = -0.3` (`dist/lib/domain/formation.js:14`). So
    three performers side by side stand at `(-1.8, -0.3)`, `(0, -0.3)`,
    `(1.8, -0.3)`.
  - `LocomotionAnimator` (`dist/lib/services/implementations/LocomotionAnimator.js`):
    the state-machine comment names `idle <-> walk (4-way directional) <-> jump/fall/land/crouch`,
    `walkActions` is the only clip bank, and `analyzeClipGait` time-warps that
    one walk clip's playback rate to match ground speed. There is no run or jog
    clip and no gait tier. `.claude/rules/locomotion.md` forbids inventing one.
- `src/routes/test/film-director/_lib/director-viewer-adapter.ts`
  - Lines 25-28 document the current fallback: "A performer with no entry — or a
    scene applied before the library has finished generating — falls back to the
    film's shared sequence."
  - The pooled-performer backfill inside `applyDirectorSceneToViewer`:
    `const sequenceData = viewer.currentSequenceData;` then
    `for (const performer of manager.performers) if (!performer.hasSequence) performer.loadSequence(sequenceData);`
  - The per-performer line: `const directedSequence = options.sequences?.get(directed.id) ?? sequenceData;`
    followed by `if (directedSequence && performer.loadedSequence !== directedSequence) performer.loadSequence(directedSequence);`
    Both of those must learn about an idle performer under branch A.
- `src/lib/shared/3d/state/character-instance-state.svelte.ts`
  - `loadedSequence` is `$state<SequenceData | null>(null)` (line 260),
    `hasSequence` is `$derived(loadedSequence !== null)` (line 377), and the
    step-config, plane-override, and playback paths all early-return on a null
    sequence (lines 354, 671, 755).
- `docs/reference/film-director-capability-matrix.md`
  - Blocking row is line 71; performer `sequence` row is line 73; the
    `## Grammar gaps` section starts at line 199 and opens "None open. Closed so
    far:"; `## Spoken but not real (proven rejections)` starts at line 292.
- `tests/unit/film-director/film-library.test.ts:193` is
  `it("Proving Grounds exercises the gaps it advertises", ...)`; each scene gets
  its own block inside it.
- Concurrency note: another agent is finishing Gap 5 and Gap 6 in this same
  worktree (`sequence-language.ts`, `director-sequence-library.ts`,
  `film-director-schema.ts`, `resolve-film-director-spec.ts`,
  `proving-grounds.ts` are all in flight). Re-read each of those files
  immediately before editing it, and append the proving scene after whatever is
  the LAST scene in the array at that moment.

---

## Grammar this gap adds

```jsonc
// A walk that bows to the traveller's left on the way to its mark.
{
  "move": "walk",
  "to": { "x": 1.8, "z": -0.3 },
  "along": { "arc": "left", "bulge": 0.25 },
  "facing": "travel",
  "durationBeats": 8
}

// Parses, then rejects by name.
{ "move": "run", "to": { "x": 2, "z": 0 } }
```

- `along` is legal only on `walk`. On `stand` or `turn` it rejects.
- `arc` names the side the path bows TOWARD, from the traveller's point of view
  as they set off.
- `bulge` is the sagitta as a fraction of the straight-line chord: `0.5` is a
  semicircle, `0.25` a gentle bow, `1.5` the maximum (a reflex arc that loops
  most of the way round). Default `0.5`. Bounds are `(0, 1.5]`.
- Speed is checked against the ARC length, not the chord, so a bowed walk that
  would need to sprint rejects with the same message a straight one does.
- `along` composes with `direction` + `amount` as well as with `to`: both
  spellings produce a destination first, and the arc is drawn between the
  opening position and that destination.

---

## File structure

| File | Change |
| --- | --- |
| `src/routes/test/film-director/_lib/blocking-language.ts` | `run` rejection; `DirectorBlockingPath` type; `arcKeyframes` helper; walk branch emits chords; `assertWalkable` on arc length. |
| `src/routes/test/film-director/_lib/film-director-schema.ts` | `move` enum gains `run`; `along` field; (branch A only) `source` enum gains `none`. |
| `src/routes/test/film-director/_lib/sequence-language.ts` | Branch A only: `{source: "none"}` in the union, `isIdleSequence`, key. |
| `src/routes/test/film-director/_lib/director-sequence-library.ts` | Branch A only: idle performers get no map entry and no demo fallback. |
| `src/routes/test/film-director/_lib/director-viewer-adapter.ts` | Branch A only: `idlePerformerIndices` helper, skipped in both load paths. |
| `src/routes/test/film-director/_films/proving-grounds.ts` | Scene 7 `edges-of-the-stage`, header comment, brief. |
| `docs/reference/film-director-capability-matrix.md` | Blocking row, one Grammar-gaps bullet, `run` (and branch-B `source: "none"`) under Spoken but not real. |
| Tests | `blocking-language.test.ts`, `film-director-schema.test.ts`, `film-library.test.ts`, snapshot; branch A also `sequence-language.test.ts`, `director-sequence-library.test.ts`, `director-viewer-adapter.test.ts`. |

---

### Task 1: Verification spike — can a performer have no sequence at all?

No production code changes in this task. The output is a decision recorded in
this file and reported in the final message.

- [x] **Step 1: Read the code that would have to tolerate it.**

  1. `src/routes/test/film-director/_lib/director-viewer-adapter.ts` in full.
     Note both load paths quoted in the research section above.
  2. `src/lib/shared/3d/state/character-instance-state.svelte.ts` — every read of
     `loadedSequence` and `hasSequence`. Confirm whether each is guarded
     (`if (!loadedSequence) return;`) or whether any dereferences it.
  3. `src/lib/shared/3d/state/viewer-3d-state.svelte.ts` — `currentSequenceData`,
     `enter3D`, and anything that iterates `performerManager.performers` and
     assumes a sequence.
  4. The components under `src/lib/shared/3d/components/` that render a
     performer's body and prop. Start from
     `src/lib/shared/3d/components/panels/PerformerManager.svelte:61`
     (`{#if performer.hasSequence}`), then grep the components directory for
     `hasSequence`, `loadedSequence`, `stepConfigs`, and `currentStep` and read
     each hit that lives on the render path rather than a control panel.

- [x] **Step 2: Answer these three questions in writing**, each with a file and
      line:

  - Does a performer whose `loadSequence` is never called still render a body in
    an idle pose, or does it render nothing?
  - Does anything throw, warn, or busy-loop on the null sequence?
  - Does the prop render for such a performer? (A performer standing and
    watching should be empty-handed or holding a still prop, not flickering.)

- [x] **Step 3: Pick the branch.**

  - **Branch A** if all three answers are benign: renders an idle body, nothing
    throws, and the prop either does not render or renders statically. Do Task 4A.
  - **Branch B** if any render path dereferences the null sequence, throws, or
    leaves a performer invisible. Do Task 4B.

  Note that the current adapter would defeat branch A on its own even if the
  state layer tolerates it: the pooled backfill loads `viewer.currentSequenceData`
  into every performer with `!hasSequence`. That is a change branch A makes, not
  evidence against branch A.

- [x] **Step 4: Record it.** Append a short "Spike result (branch A|B)" block to
      the end of this plan file with the three answers and their file:line
      citations, and say which branch you took in the final report.

- [x] **Step 5: Commit** the plan file with the spike result.

```bash
git commit -m "docs(film-director): record the stand-and-watch verification spike" -- docs/superpowers/plans/2026-09-02-film-director-gap-7-blocking-edges.md
```

---

### Task 2: `run` parses and then rejects

**Files:** Modify `src/routes/test/film-director/_lib/blocking-language.ts`,
`src/routes/test/film-director/_lib/film-director-schema.ts`; Test
`tests/unit/film-director/blocking-language.test.ts`,
`tests/unit/film-director/film-director-schema.test.ts`.

- [x] **Step 1: Write the failing tests.** Append to `blocking-language.test.ts`:

```ts
describe("run", () => {
  it("rejects and names the single walk clip and the skate ceiling", () => {
    expect(() =>
      compile([{ move: "run", to: { x: 0, z: 4 } }] as DirectorBlockingMove[])
    ).toThrow(
      /"run" is not a gait the 3D locomotion has\. There is one walk clip, time-warped to the ground, and past 2\.6 m\/s the feet skate\. Write a "walk"\./
    );
  });

  it("rejects even when the distance would be walkable", () => {
    expect(() =>
      compile([{ move: "run", to: { x: 0, z: 1 } }] as DirectorBlockingMove[])
    ).toThrow(/"run" is not a gait/);
  });
});
```

Append to `film-director-schema.test.ts`, next to the other blocking-move
tests (find them by grepping the file for `"blocking"`, and reuse whatever
scene-building helper those tests use):

```ts
it("parses a run move so the compiler can reject it by name", () => {
  const parsed = parse(
    sceneWith({
      performance: {
        performers: [{ id: "a", blocking: [{ move: "run", to: { x: 0, z: 2 } }] }],
      },
    })
  );
  expect(parsed.scenes[0]!.performance.performers[0]!.blocking![0]!.move).toBe("run");
});
```

- [x] **Step 2: Run to verify failure.**

```bash
node node_modules/vitest/vitest.mjs run --config tests/config/vitest.config.ts tests/unit/film-director/blocking-language.test.ts tests/unit/film-director/film-director-schema.test.ts
```

Expected: FAIL. The schema enum has no `"run"`, and `compileBlockingMoves`
crashes on `MOVE_RULES["run"]` being `undefined` rather than throwing the
message.

- [x] **Step 3: Implement.** In `blocking-language.ts`, widen the verb and add
      the rejection.

```ts
export type DirectorBlockingVerb = "stand" | "walk" | "turn" | "run";
```

Add the entry to `MOVE_RULES` so the record stays total (it is never reached —
the rejection below fires first — but an incomplete `Record` would not compile):

```ts
  // Reachable only through the rejection in `validateBlockingMove`; a run has
  // no rules because there is no run.
  run: { unit: null, directions: null, takesDestination: false },
```

At the very top of `validateBlockingMove`, before the `MOVE_RULES` lookup:

```ts
  if (move.move === "run") {
    throw new Error(
      `Performer "${performerId}": "run" is not a gait the 3D locomotion has. There is one walk clip, time-warped to the ground, and past ${fmt(MAX_TRAVEL_SPEED)} m/s the feet skate. Write a "walk".`
    );
  }
```

`fmt` is declared at line 306, below `validateBlockingMove`; it is a `const`
arrow function, so hoisting does not apply at module init but does at call
time — `validateBlockingMove` only runs from `compileBlockingMoves`, long after
module evaluation, so this is safe. If `npm run check` disagrees, move the `fmt`
declaration above `compileBlockingMoves` and leave its comment attached.

In `film-director-schema.ts` line 570:

```ts
    move: z.enum(["stand", "walk", "turn", "run"]),
```

- [x] **Step 4: Run** both test files, then the whole folder. Expected: PASS,
      snapshot untouched (no shipped film says `run`).

- [x] **Step 5: Commit**

```bash
git commit -m "feat(film-director): speak run so it rejects with its reason" -- src/routes/test/film-director/_lib/blocking-language.ts src/routes/test/film-director/_lib/film-director-schema.ts tests/unit/film-director/blocking-language.test.ts tests/unit/film-director/film-director-schema.test.ts
```

---

### Task 3: Arc paths

**Files:** Modify `src/routes/test/film-director/_lib/blocking-language.ts`,
`src/routes/test/film-director/_lib/film-director-schema.ts`; Test
`tests/unit/film-director/blocking-language.test.ts`,
`tests/unit/film-director/film-director-schema.test.ts`.

- [x] **Step 1: Write the failing tests.** Append to `blocking-language.test.ts`:

```ts
describe("arc paths", () => {
  /** Straight-line distance walked between consecutive keyframes. */
  function legs(frames: { position: { x: number; z: number } }[]) {
    return frames.slice(1).map((frame, index) => {
      const previous = frames[index]!.position;
      return Math.hypot(
        frame.position.x - previous.x,
        frame.position.z - previous.z
      );
    });
  }

  it("bows off the straight line and still lands exactly on the mark", () => {
    const frames = compile([
      { move: "walk", to: { x: 4, z: 0 }, along: { arc: "left" } },
    ]);
    expect(frames.at(-1)!.position).toEqual({ x: 4, z: 0 });
    expect(frames[0]!.position).toEqual({ x: 0, z: 0 });
    // Default bulge 0.5 is a semicircle: the halfway point sits one sagitta
    // (0.5 x 4m = 2m) off the chord.
    const middle = frames[Math.floor(frames.length / 2)]!;
    expect(Math.abs(middle.position.z)).toBeCloseTo(2, 6);
  });

  it("bows to the opposite side for the opposite arc", () => {
    const left = compile([
      { move: "walk", to: { x: 4, z: 0 }, along: { arc: "left" } },
    ]);
    const right = compile([
      { move: "walk", to: { x: 4, z: 0 }, along: { arc: "right" } },
    ]);
    const leftMid = left[Math.floor(left.length / 2)]!.position;
    const rightMid = right[Math.floor(right.length / 2)]!.position;
    expect(Math.sign(leftMid.z)).toBe(-Math.sign(rightMid.z));
    expect(leftMid.x).toBeCloseTo(rightMid.x, 6);
  });

  it("walks the arc at a constant speed", () => {
    const frames = compile([
      { move: "walk", to: { x: 4, z: 0 }, along: { arc: "left", bulge: 0.3 } },
    ]);
    const lengths = legs(frames.slice(0, -1));
    for (const length of lengths) {
      expect(length).toBeCloseTo(lengths[0]!, 6);
    }
    const times = frames
      .slice(0, -1)
      .map((frame, index, all) =>
        index === 0 ? null : frame.atSeconds - all[index - 1]!.atSeconds
      )
      .filter((value): value is number => value !== null);
    for (const step of times) {
      expect(step).toBeCloseTo(times[0]!, 6);
    }
  });

  it("chops the arc into at least four and at most sixteen chords", () => {
    const tiny = compile([
      { move: "walk", to: { x: 0.4, z: 0 }, along: { arc: "left" } },
    ]);
    // 4 chords + the arrival frame; the trailing hold to the scene end is a
    // duplicate of the arrival, so count unique positions instead.
    expect(tiny.filter((frame) => frame.walking).length).toBe(4);

    const long = compile(
      [{ move: "walk", to: { x: 20, z: 0 }, along: { arc: "left", bulge: 1.5 } }],
      { durationSeconds: 60 }
    );
    expect(long.filter((frame) => frame.walking).length).toBe(16);
  });

  it("faces the tangent all the way round when facing travel", () => {
    const frames = compile([
      { move: "walk", to: { x: 4, z: 0 }, along: { arc: "left" }, facing: "travel" },
    ]);
    // A semicircle turns the traveller through pi radians end to end.
    const turned = frames.at(-2)!.facingAngle - frames[0]!.facingAngle;
    expect(Math.abs(turned)).toBeCloseTo(Math.PI, 4);
    // And every step turns by the same amount, because every chord does.
    const steps = frames
      .slice(1, -1)
      .map((frame, index, all) =>
        index === 0 ? null : frame.facingAngle - all[index - 1]!.facingAngle
      )
      .filter((value): value is number => value !== null);
    for (const step of steps) expect(step).toBeCloseTo(steps[0]!, 6);
  });

  it("measures speed along the arc, not across the chord", () => {
    // A 4m chord in 4s is 1 m/s and walkable; the semicircle over it is
    // 2*pi meters, 1.57 m/s, still walkable.
    expect(() =>
      compile([{ move: "walk", to: { x: 4, z: 0 }, along: { arc: "left" } }], {
        durationSeconds: 4,
      })
    ).not.toThrow();
    // Same chord in 2.5s is 1.6 m/s straight, but 2.51 m/s round the arc.
    expect(() =>
      compile([{ move: "walk", to: { x: 4, z: 0 }, along: { arc: "left" } }], {
        durationSeconds: 2.5,
      })
    ).not.toThrow();
    // 2.4s: 2.62 m/s round the arc, over the ceiling, while the chord is
    // only 1.67 m/s — proof the check reads the arc.
    expect(() =>
      compile([{ move: "walk", to: { x: 4, z: 0 }, along: { arc: "left" } }], {
        durationSeconds: 2.4,
      })
    ).toThrow(/Travel tops out at 2.6 m\/s/);
  });

  it("rejects an arc on a move that does not travel", () => {
    expect(() =>
      compile([{ move: "stand", along: { arc: "left" } }] as DirectorBlockingMove[])
    ).toThrow(/"stand" does not take a path/);
    expect(() =>
      compile([
        { move: "turn", direction: "left", along: { arc: "left" } },
      ] as DirectorBlockingMove[])
    ).toThrow(/"turn" does not take a path/);
  });

  it("arcs a relative walk as well as a walk to a mark", () => {
    const frames = compile([
      {
        move: "walk",
        direction: "forward",
        amount: { meters: 3 },
        along: { arc: "right" },
      },
    ]);
    expect(frames.filter((frame) => frame.walking).length).toBeGreaterThan(1);
  });
});
```

Append to `film-director-schema.test.ts`:

```ts
it("accepts an arc on a walk", () => {
  const parsed = parse(
    sceneWith({
      performance: {
        performers: [
          {
            id: "a",
            blocking: [
              {
                move: "walk",
                to: { x: 2, z: 0 },
                along: { arc: "left", bulge: 0.25 },
              },
            ],
          },
        ],
      },
    })
  );
  expect(parsed.scenes[0]!.performance.performers[0]!.blocking![0]!.along).toEqual({
    arc: "left",
    bulge: 0.25,
  });
});

it("rejects a bulge outside its bounds", () => {
  for (const bulge of [0, -0.5, 1.6]) {
    expect(() =>
      parse(
        sceneWith({
          performance: {
            performers: [
              {
                id: "a",
                blocking: [
                  { move: "walk", to: { x: 2, z: 0 }, along: { arc: "left", bulge } },
                ],
              },
            ],
          },
        })
      )
    ).toThrow();
  }
});

it("rejects an unknown arc side", () => {
  expect(() =>
    parse(
      sceneWith({
        performance: {
          performers: [
            {
              id: "a",
              blocking: [
                { move: "walk", to: { x: 2, z: 0 }, along: { arc: "wide" } },
              ],
            },
          ],
        },
      })
    )
  ).toThrow();
});
```

- [x] **Step 2: Run to verify failure** — the same two-file command as Task 2.
      Expected: FAIL (`along` is rejected by the strict object; `compile`
      ignores it).

- [x] **Step 3: Implement the schema.** In `film-director-schema.ts`, inside
      `blockingMoveSchema`'s object, after the `to` field on line 571:

```ts
    along: z
      .object({
        arc: z.enum(["left", "right"]),
        // Sagitta as a fraction of the chord: 0.5 is a semicircle, 1.5 loops
        // most of the way round. The meaning and the geometry live in
        // `blocking-language.ts`.
        bulge: finiteNumber.gt(0).max(1.5).optional(),
      })
      .strict()
      .optional(),
```

- [x] **Step 4: Implement the compiler.** In `blocking-language.ts`:

Extend the move type (after the `to` field in `DirectorBlockingMove`):

```ts
export interface DirectorBlockingPath {
  /** The side the path bows toward, from the traveller's own point of view. */
  arc: "left" | "right";
  /**
   * The sagitta as a fraction of the straight-line chord. 0.5 (the default)
   * bows the walk into a half circle; 1.5 is the widest loop the grammar
   * allows. The schema bounds it to (0, 1.5].
   */
  bulge?: number;
}
```

and add `along?: DirectorBlockingPath;` to `DirectorBlockingMove`.

Add `takesPath` to the `MOVE_RULES` value shape and set it: `false` for
`stand`, `turn`, and `run`; `true` for `walk`.

In `validateBlockingMove`, after the destination checks:

```ts
  if (move.along && !rules.takesPath) {
    throw new Error(`${where} does not take a path.`);
  }
```

Add the geometry, above `compileBlockingMoves`:

```ts
const DEFAULT_ARC_BULGE = 0.5;
/** Target chord length. Shorter chords are a smoother curve and more keyframes. */
const ARC_CHORD_METERS = 0.5;
const MIN_ARC_CHORDS = 4;
const MAX_ARC_CHORDS = 16;

interface ArcPath {
  /** Chord endpoints in order, `points[0]` the start and the last the mark. */
  points: { x: number; z: number }[];
  /** Travel-tangent facing at each point, same length as `points`. */
  tangents: number[];
  /** Distance along the curve, which is what the speed check must read. */
  length: number;
}

/**
 * The circular arc from `start` to `end` that bows `bulge` chord-fractions to
 * the traveller's `side`, sampled into chords.
 *
 * The circle is the one through both endpoints whose sagitta (the height of
 * the arc above the middle of the chord) is `bulge * chord`. For sagitta `h`
 * and chord `c` the radius is `(c^2/4 + h^2) / (2h)`, and the centre sits at
 * `midpoint + (h - R) * u`, where `u` is the unit vector pointing to the side
 * the arc bows toward: that expression puts the centre behind the chord for a
 * shallow bow and in front of it for a reflex one, with no case split.
 *
 * Facing angle 0 looks down +Z and increases clockwise from above, so for a
 * unit travel direction `f` the traveller's right is `(f.z, -f.x)` and their
 * left is `(-f.z, f.x)` — the same convention `offsetFrom` uses.
 */
function arcPath(
  start: { x: number; z: number },
  end: { x: number; z: number },
  path: DirectorBlockingPath
): ArcPath {
  const chordX = end.x - start.x;
  const chordZ = end.z - start.z;
  const chord = Math.hypot(chordX, chordZ);
  const forward = { x: chordX / chord, z: chordZ / chord };
  const side =
    path.arc === "right"
      ? { x: forward.z, z: -forward.x }
      : { x: -forward.z, z: forward.x };

  const sagitta = (path.bulge ?? DEFAULT_ARC_BULGE) * chord;
  const radius = (chord * chord * 0.25 + sagitta * sagitta) / (2 * sagitta);
  const mid = { x: start.x + chordX * 0.5, z: start.z + chordZ * 0.5 };
  const centre = {
    x: mid.x + side.x * (sagitta - radius),
    z: mid.z + side.z * (sagitta - radius),
  };

  const startAngle = Math.atan2(start.z - centre.z, start.x - centre.x);
  const endAngle = Math.atan2(end.z - centre.z, end.x - centre.x);
  // The minor sweep between the two endpoints, then the major one if the
  // minor sweep bows the wrong way — which is exactly the reflex case
  // (bulge > 1), where the arc's own midpoint is further from the centre's
  // side than the chord is.
  let sweep = endAngle - startAngle;
  while (sweep <= -Math.PI) sweep += 2 * Math.PI;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  const probe = startAngle + sweep * 0.5;
  const probePoint = {
    x: centre.x + radius * Math.cos(probe),
    z: centre.z + radius * Math.sin(probe),
  };
  const bowsCorrectly =
    (probePoint.x - mid.x) * side.x + (probePoint.z - mid.z) * side.z > 0;
  if (!bowsCorrectly) sweep -= Math.sign(sweep) * 2 * Math.PI;

  const length = Math.abs(sweep) * radius;
  const chords = Math.min(
    MAX_ARC_CHORDS,
    Math.max(MIN_ARC_CHORDS, Math.ceil(length / ARC_CHORD_METERS))
  );

  const points: { x: number; z: number }[] = [];
  const tangents: number[] = [];
  for (let step = 0; step <= chords; step += 1) {
    const angle = startAngle + (sweep * step) / chords;
    points.push({
      x: centre.x + radius * Math.cos(angle),
      z: centre.z + radius * Math.sin(angle),
    });
    // The tangent is the derivative of the point in the direction of travel,
    // which flips with the sign of the sweep.
    const tangent =
      sweep >= 0
        ? { x: -Math.sin(angle), z: Math.cos(angle) }
        : { x: Math.sin(angle), z: -Math.cos(angle) };
    tangents.push(Math.atan2(tangent.x, tangent.z));
  }
  // Float error accumulates over sixteen cosines; the mark is exact by
  // construction, so state it rather than approach it.
  points[0] = { ...start };
  points[points.length - 1] = { ...end };
  return { points, tangents, length };
}

/** Turn `from` into `to` along the shortest way round, for a fraction `t`. */
function lerpAngle(from: number, to: number, t: number): number {
  let delta = to - from;
  while (delta <= -Math.PI) delta += 2 * Math.PI;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  return from + delta * t;
}
```

Then rewrite the walk branch's tail (currently lines 173-176) so it handles both
shapes. Replace:

```ts
    push(start, position, facingAngle, true);
    push(end, destination, nextFacing, false);
    position = destination;
    facingAngle = nextFacing;
```

with:

```ts
    if (!move.along || Math.hypot(delta.x, delta.z) < 1e-6) {
      assertWalkable(Math.hypot(delta.x, delta.z), end - start, context.performerId);
      push(start, position, facingAngle, true);
      push(end, destination, nextFacing, false);
    } else {
      const arc = arcPath(position, destination, move.along);
      assertWalkable(arc.length, end - start, context.performerId);
      // Equal angle steps are equal arc lengths, so equal time steps are a
      // constant ground speed — the same thing the straight walk gives the
      // locomotion animator.
      arc.points.forEach((point, step) => {
        const t = step / (arc.points.length - 1);
        const facing =
          requested === "travel"
            ? arc.tangents[step]!
            : lerpAngle(facingAngle, nextFacing, t);
        push(start + (end - start) * t, point, facing, step < arc.points.length - 1);
      });
    }
    position = destination;
    facingAngle = nextFacing;
```

Note two things this depends on and one it changes:

- `requested` and `nextFacing` are already computed above (lines 170-171) and
  stay as they are. On an arc, `facing: "travel"` follows the tangent; every
  other facing eases from the opening angle to the resolved one across the move,
  so a `facing: "audience"` arc walks the curve while turning to the audience.
- `nextFacing` for `facing: "travel"` is computed from the chord delta, which is
  the tangent at the far end of a symmetric arc only by coincidence. Set the
  arc's final facing from `arc.tangents.at(-1)!` instead: after the `forEach`,
  add `if (requested === "travel") facingAngle = arc.tangents.at(-1)!;` and let
  the assignment below be skipped for that case. Simplest correct spelling:

```ts
      const arrival =
        requested === "travel" ? arc.tangents.at(-1)! : nextFacing;
      position = destination;
      facingAngle = arrival;
      return;
```

  placed at the end of the arc branch, with the shared `position`/`facingAngle`
  assignment kept for the straight branch.

- `assertWalkable` changes signature from `(delta, windowSeconds, performerId)`
  to `(distance: number, windowSeconds: number, performerId: string)`; drop the
  `Math.hypot` inside it and keep everything else, including the message,
  byte-identical:

```ts
function assertWalkable(
  distance: number,
  windowSeconds: number,
  performerId: string
): void {
  if (distance < 1e-6) return;
  const speed = windowSeconds > 0 ? distance / windowSeconds : Infinity;
  if (speed <= MAX_TRAVEL_SPEED) return;
  throw new Error(
    `Performer "${performerId}" would cover ${fmt(distance)}m in ${fmt(windowSeconds)}s (${fmt(speed)} m/s). Travel tops out at ${fmt(MAX_TRAVEL_SPEED)} m/s — give the move more time or a shorter distance.`
  );
}
```

  Grep for other callers before changing it: `grep -rn "assertWalkable" src/`.
  As of 2026-09-02 the only call is the one inside `compileBlockingMoves`.

- [x] **Step 5: Run** the two test files, then the whole folder. Expected: PASS.
      The snapshot must be untouched — no shipped film says `along` yet.

- [x] **Step 6: Commit**

```bash
git commit -m "feat(film-director): a walk can bow along an arc to its mark" -- src/routes/test/film-director/_lib/blocking-language.ts src/routes/test/film-director/_lib/film-director-schema.ts tests/unit/film-director/blocking-language.test.ts tests/unit/film-director/film-director-schema.test.ts
```

---

### Task 4A: Stand and watch — a performer with no sequence (branch A only)

Skip this task entirely if the Task 1 spike chose branch B.

**Files:** Modify `src/routes/test/film-director/_lib/sequence-language.ts`,
`film-director-schema.ts`, `director-sequence-library.ts`,
`director-viewer-adapter.ts`; Test `sequence-language.test.ts`,
`film-director-schema.test.ts`, `director-sequence-library.test.ts`,
`director-viewer-adapter.test.ts`.

- [x] **Step 1: Failing tests.**

`tests/unit/film-director/sequence-language.test.ts`:

```ts
describe("standing and watching", () => {
  it("keys an idle performer by their idleness", () => {
    expect(sequenceDirectiveKey({ source: "none" })).toBe("none");
  });

  it("classifies an idle sequence", () => {
    expect(isIdleSequence({ source: "none" })).toBe(true);
    expect(isIdleSequence({ source: "demo" })).toBe(false);
    expect(isIdleSequence({ word: "AB" })).toBe(false);
  });
});
```

(import `isIdleSequence` alongside the existing imports from
`sequence-language`.)

`tests/unit/film-director/film-director-schema.test.ts`:

```ts
it("accepts a performer who stands and watches", () => {
  const parsed = parse(
    sceneWith({
      performance: { performers: [{ id: "a", sequence: { source: "none" } }] },
    })
  );
  expect(parsed.scenes[0]!.performance.performers[0]!.sequence).toEqual({
    source: "none",
  });
});

it("rejects controls on a performer who is not spinning", () => {
  expect(() =>
    parse(
      sceneWith({
        performance: {
          performers: [{ id: "a", sequence: { source: "none", level: 2 } }],
        },
      })
    )
  ).toThrow(/is not spinning anything/);
});
```

`tests/unit/film-director/director-sequence-library.test.ts` (append inside the
existing `describe`):

```ts
  it("gives an idle performer no sequence at all, not the demo", async () => {
    const d = deps();
    const lib = createDirectorSequenceLibrary(seq("demo"), d);
    await lib.prepare(
      film([{ id: "watcher", sequence: { source: "none" } }, { id: "spinner" }])
    );
    const scene = lib.forScene("s1");
    expect(scene.has("watcher")).toBe(false);
    expect(tag(scene.get("spinner")!)).toBe("demo");
    expect(lib.failures).toEqual([]);
  });
```

`tests/unit/film-director/director-viewer-adapter.test.ts` (append; if the file
does not exist, create it with the same import style the other test files use):

```ts
import { idlePerformerIndices } from "../../../src/routes/test/film-director/_lib/director-viewer-adapter";

describe("idle performers", () => {
  it("names the cast slots that spin nothing", () => {
    const scene = {
      performance: {
        performers: [
          { id: "a", sequence: { source: "demo" } },
          { id: "b", sequence: { source: "none" } },
          { id: "c", sequence: { word: "AB" } },
        ],
      },
    } as unknown as ResolvedDirectorScene;
    expect([...idlePerformerIndices(scene)]).toEqual([1]);
  });
});
```

- [x] **Step 2: Run** those four files. Expected: FAIL.

- [x] **Step 3: Implement `sequence-language.ts`.** Change the `demo` member of
      `DirectorPerformerSequence` to carry both literals and add the classifier:

```ts
/**
 * What one performer spins, including the case where they spin nothing.
 * `{source: "none"}` is a performer who stands and watches: no prop phrase, no
 * generated sequence, the body idling in place. Blocking still applies, so a
 * watcher can walk on, stand, and turn.
 */
export type DirectorPerformerSequence =
  | { source: "demo" }
  | { source: "none" }
  | ...the rest of the union unchanged;

export function isIdleSequence(
  sequence: DirectorPerformerSequence
): sequence is { source: "none" } {
  return "source" in sequence && sequence.source === "none";
}
```

In `sequenceDirectiveKey`, before the final `demo` fallthrough:

```ts
  if (isIdleSequence(sequence)) return "none";
```

- [x] **Step 4: Implement the schema.** Change the source field:

```ts
    source: z.enum(["demo", "none"]).optional(),
```

and add `none` to the `CONTROL_REJECTIONS` lookup by branching on the value
rather than the key, since both spellings share the key `source`:

```ts
    const sourceRejection =
      value.source === "none"
        ? `A performer who stands and watches is not spinning anything, so there is nothing for ${quoted(controls)} to shape. Remove it, or give them a "word" of their own.`
        : `The demo sequence is the film's shared one, so it carries no controls of its own. Remove ${quoted(controls)}, or spell a "word" of your own.`;
```

and use `sourceRejection` in place of the `source` entry of `CONTROL_REJECTIONS`.
Also update the no-source message to name it:

```ts
'A sequence names one source: {source: "demo"}, {source: "none"} to stand and watch, a "word" to spell, a "length" to improvise, a "mirrorOf" to reflect, a "transformOf" to change, or a "library" id to play.'
```

- [x] **Step 5: Implement the library.** In `director-sequence-library.ts`'s
      `resolveScene`, at the top of the per-performer body inside
      `performers.map`:

```ts
        if (isIdleSequence(directed)) {
          // Deliberately no entry: the adapter reads the absence as "this
          // performer spins nothing", which is different from "the library has
          // not finished yet" only because the adapter also knows the scene.
          return;
        }
```

Import `isIdleSequence` from `./sequence-language`.

- [x] **Step 6: Implement the adapter.** In `director-viewer-adapter.ts`, export
      the helper and consult it in both load paths:

```ts
/**
 * Cast slots that spin nothing this scene. Their performers must be left with
 * no loaded sequence: both the pooled backfill and the per-performer load
 * below otherwise hand every performer the film's shared sequence, which is
 * the right default for a performer whose own sequence has not resolved yet
 * and exactly wrong for one who is standing and watching.
 */
export function idlePerformerIndices(
  scene: ResolvedDirectorScene
): ReadonlySet<number> {
  const idle = new Set<number>();
  scene.performance.performers.forEach((performer, index) => {
    if (isIdleSequence(performer.sequence)) idle.add(index);
  });
  return idle;
}
```

Import `isIdleSequence` from `./sequence-language`. Then, inside
`applyDirectorSceneToViewer`, compute `const idle = idlePerformerIndices(scene);`
before the `getSceneUndoManager().withoutUndo(...)` call, guard the backfill:

```ts
      for (const [index, performer] of manager.performers.entries()) {
        if (idle.has(index)) continue;
        if (!performer.hasSequence) performer.loadSequence(sequenceData);
      }
```

and guard the per-performer load:

```ts
      const directedSequence = idle.has(index)
        ? null
        : (options.sequences?.get(directed.id) ?? sequenceData);
```

Leave the `if (directedSequence && ...)` condition below it as it is — a null
now falls through to no load, which is the whole point. Update the options
doc comment at lines 25-28 to say that a performer whose scene sequence is
`{source: "none"}` is skipped by name rather than falling back.

- [x] **Step 7: Run** the four files, then the whole folder. Expected: PASS,
      snapshot untouched.

- [x] **Step 8: Commit**

```bash
git commit -m "feat(film-director): a performer can stand and watch with no sequence" -- src/routes/test/film-director/_lib/sequence-language.ts src/routes/test/film-director/_lib/film-director-schema.ts src/routes/test/film-director/_lib/director-sequence-library.ts src/routes/test/film-director/_lib/director-viewer-adapter.ts tests/unit/film-director/sequence-language.test.ts tests/unit/film-director/film-director-schema.test.ts tests/unit/film-director/director-sequence-library.test.ts tests/unit/film-director/director-viewer-adapter.test.ts
```

---

### Task 4B: Stand and watch — a proven rejection (branch B only)

Skip this task entirely if the Task 1 spike chose branch A.

**Files:** Modify `src/routes/test/film-director/_lib/film-director-schema.ts`;
Test `tests/unit/film-director/film-director-schema.test.ts`.

- [x] **Step 1: Failing test.**

```ts
it("rejects a performer who stands and watches, and says why", () => {
  expect(() =>
    parse(
      sceneWith({
        performance: { performers: [{ id: "a", sequence: { source: "none" } }] },
      })
    )
  ).toThrow(
    /Every performer in the 3D viewer is loaded with a sequence; a performer without one does not render/
  );
});
```

- [x] **Step 2: Run** the schema test file. Expected: FAIL — `"none"` is not a
      legal value for `source`, so the rejection is zod's generic enum message
      rather than the spoken one.

- [x] **Step 3: Implement.** Widen the field so the spelling parses far enough
      to be rejected in the director's own words:

```ts
    source: z.enum(["demo", "none"]).optional(),
```

and, first in the `superRefine`, before the source-count check:

```ts
    if (value.source === "none") {
      ctx.addIssue({
        code: "custom",
        message:
          'A performer cannot stand and watch. Every performer in the 3D viewer is loaded with a sequence; a performer without one does not render. Give them {source: "demo"} with {effect: "none"} if you want them quiet.',
      });
      return;
    }
```

Replace the second sentence with the concrete finding from the Task 1 spike
(file and behavior), keeping the copy director-facing and under three
sentences. Also add `{source: "none"}` to nothing else: it stays absent from
`SEQUENCE_SOURCE_KEYS` semantics, since it never resolves.

- [x] **Step 4: Run** the schema tests, then the whole folder. Expected: PASS,
      snapshot untouched.

- [x] **Step 5: Commit**

```bash
git commit -m "feat(film-director): reject stand-and-watch with its reason" -- src/routes/test/film-director/_lib/film-director-schema.ts tests/unit/film-director/film-director-schema.test.ts
```

---

### Task 5: Proving-grounds scene 7 — `edges-of-the-stage`

**Files:** Modify `src/routes/test/film-director/_films/proving-grounds.ts`.

- [x] **Step 1: Re-read the film.** The Gap 5 and Gap 6 agents append scenes to
      the same array. Open `proving-grounds.ts`, find the LAST entry of
      `scenes`, and append after it. Do not renumber or reorder anything.

- [x] **Step 2: Append the scene.**

```ts
    {
      id: "edges-of-the-stage",
      title: "Edges of the Stage",
      intent:
        "Gap 7: performer 3 opens off camera at (5, -1), five meters out past the right edge of a three-wide line, and walks in along a left-bending arc to their mark at (1.8, -0.3) over eight beats — about 3.8 meters of curve in four seconds, a 0.95 m/s walk. Nothing clamps a position to the stage, so the ground grows to include the opening mark and the entrance is simply a walk from outside the frame. Watch the path bow: a straight walk would cut the corner.",
      durationBeats: 16,
      transition: { kind: "cut" },
      location: { environmentId: "forest" },
      performance: {
        bpm: 120,
        // side-by-side, not custom: a per-performer `position` overrides its
        // formation slot under any preset (resolve-film-director-spec.ts,
        // `buildResolvedPerformers`), and "custom" would demand a position
        // from all three when only one of them starts somewhere unusual.
        formation: "side-by-side",
        cast: {
          count: 3,
          defaults: { effect: "none" },
          performers: [
            { id: "performer-1" },
            { id: "performer-2" },
            {
              id: "performer-3",
              // Off camera at the top of the scene. side-by-side puts the
              // third slot at (1.8, -0.3), which is where the arc lands.
              position: { x: 5, z: -1 },
              blocking: [
                {
                  move: "walk",
                  to: { x: 1.8, z: -0.3 },
                  along: { arc: "left", bulge: 0.25 },
                  facing: "travel",
                  durationBeats: 8,
                },
                { move: "stand" },
              ],
            },
          ],
        },
      },
      camera: {
        subject: { kind: "group" },
        shotSize: "wide",
        angle: "eye",
        position: "front",
        moves: [{ move: "hold" }],
      },
    },
```

  **Branch A only:** add `sequence: { source: "none" }` to `performer-1`, so the
  scene also proves a performer standing and watching beside two who spin. Under
  branch B, leave `performer-1` on the demo and say nothing about it in the
  intent.

  **Branch A intent addendum**, appended to the `intent` string above:
  " Performer 1 stands and watches: `{source: \"none\"}`, no prop phrase, body
  idling while the other two spin."

- [x] **Step 3: Header comment.** Append a Gap 7 paragraph to the file's
      top-of-file comment block, in the voice of the five already there:

```
 * Gap 7, the edges of the stage. Before this wave a walk was a straight line
 * between two marks, and a performer who was meant to enter had nowhere to
 * enter from. Scene 7 opens performer 3 five meters off the right of the
 * frame — legal all along, because nothing clamps a position and the ground
 * grows to include it — and walks them in along an arc that bows to their
 * left, compiled into eight chords whose speed is measured along the curve
 * rather than across the chord.
```

- [x] **Step 4: Brief.** Append one sentence to the film's `brief`:
      "A seventh scene walks a performer in from off camera along a bowed
      path." Under branch A, extend it: "...while a third stands and watches
      with no sequence at all."

- [x] **Step 5: Run the folder.** Expected: the film-library and snapshot tests
      fail (new scene); nothing else does. That is Task 6's job — do not
      regenerate the snapshot yet.

- [x] **Step 6: Commit**

```bash
git commit -m "feat(film-director): prove the stage edges in the proving grounds" -- src/routes/test/film-director/_films/proving-grounds.ts
```

---

### Task 6: Film-library assertions and the snapshot

**Files:** Modify `tests/unit/film-director/film-library.test.ts`,
`tests/unit/film-director/__snapshots__/film-resolution-snapshot.test.ts.snap`.

- [x] **Step 1: Add the assertions.** Inside
      `it("Proving Grounds exercises the gaps it advertises", ...)` (line 193),
      after the `three-shots` block and any block the Gap 5 or Gap 6 agent has
      added:

```ts
    const edgesOfStage = resolved.scenes.find(
      (s) => s.id === "edges-of-the-stage"
    )!;
    expect(edgesOfStage.durationSeconds).toBe(8);
    const entrant = edgesOfStage.performance.performers.find(
      (performer) => performer.id === "performer-3"
    )!;
    // The opening mark is off camera and unclamped, and the stage extent
    // stretched to include it rather than pulling it in.
    expect(entrant.position).toEqual({ x: 5, z: -1 });
    expect(edgesOfStage.performance.stageExtent).toContainEqual({ x: 5, z: -1 });

    const walkFrames = entrant.blocking.filter((frame) => frame.walking);
    // Eight chords: 3.8m of arc at a 0.5m target chord length.
    expect(walkFrames).toHaveLength(8);
    expect(entrant.blocking.at(-1)!.position).toEqual({ x: 1.8, z: -0.3 });

    // The path is a bow, not a line: the halfway keyframe sits well off the
    // straight route between the two marks.
    const from = entrant.position;
    const to = { x: 1.8, z: -0.3 };
    const chord = Math.hypot(to.x - from.x, to.z - from.z);
    const halfway = entrant.blocking[4]!.position;
    const offChord =
      Math.abs(
        (to.x - from.x) * (from.z - halfway.z) -
          (from.x - halfway.x) * (to.z - from.z)
      ) / chord;
    expect(offChord).toBeGreaterThan(0.5);

    // Constant ground speed: every chord is the same length and lands on the
    // same time step.
    const legLengths = walkFrames.map((frame, index) => {
      const next = entrant.blocking[index + 1]!;
      return Math.hypot(
        next.position.x - frame.position.x,
        next.position.z - frame.position.z
      );
    });
    for (const leg of legLengths) expect(leg).toBeCloseTo(legLengths[0]!, 6);
    // Arc length over the four seconds eight beats buy, under the 2.6 ceiling.
    const arcLength = legLengths.reduce((sum, leg) => sum + leg, 0);
    expect(arcLength / 4).toBeLessThan(2.6);
    expect(arcLength).toBeGreaterThan(chord);
```

  **Branch A only**, add:

```ts
    expect(
      edgesOfStage.performance.performers.find((p) => p.id === "performer-1")!
        .sequence
    ).toEqual({ source: "none" });
```

- [x] **Step 2: Run** `film-library.test.ts` alone and fix any assertion that
      the actual numbers contradict. Read the failure rather than loosening the
      assertion: an eight-chord count or a 0.5m off-chord distance that comes
      out different means the geometry is not what this plan computed, and that
      is a bug to find in Task 3, not a number to relax. The one exception is
      the chord count if the Gap 3 comment's `FORMATION_WALL_OFFSET` has changed
      in a newer `@austencloud/scene-3d` — re-derive from the live value.

- [x] **Step 3: Snapshot.**

```bash
node node_modules/vitest/vitest.mjs run --config tests/config/vitest.config.ts tests/unit/film-director -u
git diff tests/unit/film-director/__snapshots__/
```

Confirm the diff touches ONLY the `proving` block and only by adding the new
scene. Any change to another film's block means something in Task 2, 3, or 4
altered existing behavior — stop and find it.

- [x] **Step 4: Full folder plus a type check.**

```bash
node node_modules/vitest/vitest.mjs run --config tests/config/vitest.config.ts tests/unit/film-director
npm run check:fast
```

Report the test counts and confirm no new type errors in `film-director` files.
Per `resource-budget.md`, check that no other `svelte-check` is running before
starting this one.

- [x] **Step 5: Commit**

```bash
git commit -m "test(film-director): assert the stage-edge scene and refresh the snapshot" -- tests/unit/film-director/film-library.test.ts tests/unit/film-director/__snapshots__/film-resolution-snapshot.test.ts.snap
```

---

### Task 7: Capability matrix

**Files:** Modify `docs/reference/film-director-capability-matrix.md`, and tick
Gap 7 in `docs/superpowers/plans/2026-08-30-film-director-gap-campaign.md`.

- [x] **Step 1: Blocking row (line 71).** Change the Grammar cell to include the
      two new spellings:

```
literal array of 1–16 moves: `{move: "stand" \| "walk" \| "turn" \| "run", to?, along?, direction?, amount?, facing?, durationSeconds? \| durationBeats?, easing?}`
```

  and append to the Notes cell:

```
`walk` may bow along a circular path with `along: {arc: "left" \| "right", bulge?}` — `arc` names the side the path bends toward from the traveller's own point of view, `bulge` is the sagitta as a fraction of the chord (default 0.5, a semicircle; bounds (0, 1.5]). The arc compiles into 4–16 straight chords inside `compileBlockingMoves`, targeting 0.5m per chord, so everything downstream still sees ordinary keyframes and `collectStageExtent`'s straight-segment invariant holds. Speed is checked against the ARC length, not the chord. `facing: "travel"` follows the tangent round the curve; any other facing eases from the opening angle to the stated one across the move. Positions and `to` are unbounded — nothing clamps a mark to a stage rectangle, and `stageExtent` grows the ground to include whatever the cast touches — so an entrance is an opening mark outside the frame plus a walk in (`/test/film-director?film=proving` scene 7).
```

  **Branch A only**, also update the performer `sequence` row (line 73) to list
  `{source: "none"}` among the sources and note that such a performer is skipped
  by both load paths in `director-viewer-adapter.ts`.

- [x] **Step 2: Grammar gaps bullet.** Append to the list under
      `## Grammar gaps` (line 199), in the voice of the bullets already there:

```
- **Blocking edges** (closed 2026-09-02). Four edges of the staging grammar,
  three of which turned out to be one real capability and two documented
  truths. A `walk` now takes `along: {arc, bulge?}` and bows to the
  traveller's left or right on the way to its mark: the arc is the circle
  through both marks whose sagitta is `bulge` chord-fractions high, sampled
  into 4–16 chords of about half a meter each, with `facing: "travel"`
  following the tangent and the speed check reading the curve's length rather
  than the straight line between its ends. Nothing downstream changed —
  a bowed walk is still a list of keyframes joined by straight segments, which
  is exactly what `sampleDirectorBlockingTrack` and `collectStageExtent`
  already assume. Offstage entrances needed no grammar at all: positions and
  `to` were never bounded, and `stageExtent` already grows the ground to
  include every mark, so an entrance is an opening mark outside the frame
  followed by a walk in. `/test/film-director?film=proving` scene 7
  ("edges-of-the-stage") does both at once: a performer opens five meters off
  the right of the frame and walks in along a left-bending arc to their place
  in the line. The other two edges are rejections — see "Spoken but not real".
```

  **Branch A only**, replace that closing sentence with: "The fourth edge,
  standing and watching, is real: `{source: \"none\"}` gives a performer no
  sequence, no prop phrase, and an idling body, with blocking still applying so
  a watcher can walk on and stand. `run` remains a rejection — see 'Spoken but
  not real'."

- [x] **Step 3: Spoken but not real bullets.** Append under
      `## Spoken but not real (proven rejections)` (line 292):

```
- **`run` (and any gait faster than a walk).** `move: "run"` parses and then
  rejects by name. `@austencloud/scene-3d`'s `LocomotionAnimator` has one walk
  clip bank and no run or jog state — its own state machine comment reads
  `idle <-> walk (4-way directional) <-> jump/fall/land/crouch` — and
  `analyzeClipGait` time-warps that single clip's playback rate to match ground
  speed rather than switching gaits. `MAX_TRAVEL_SPEED` (2.6 m/s) is the point
  where that warp gives out and the feet skate, so "faster than a walk" is
  already the failure the blocking compiler guards against, not a mode it can
  select. Rejection: `Performer "<id>": "run" is not a gait the 3D locomotion
  has. There is one walk clip, time-warped to the ground, and past 2.6 m/s the
  feet skate. Write a "walk".` Adding a run would mean importing run clips into
  the scene package first, which `.claude/rules/locomotion.md` puts outside this
  workbench.
```

  **Branch B only**, also append:

```
- **A performer who stands and watches (`sequence: {source: "none"}`).** Parses,
  then rejects. <one or two sentences naming the exact finding from the Task 1
  spike, with the file and behavior>. Rejection: `A performer cannot stand and
  watch. …` A quiet performer is spelled `{source: "demo"}` with
  `{effect: "none"}`.
```

- [x] **Step 4: Tick the ledger.** In
      `docs/superpowers/plans/2026-08-30-film-director-gap-campaign.md`, change
      the Gap 7 item at line 128 from `- [ ]` to `- [x]` and append a one-line
      outcome naming which of the four edges shipped as capability and which as
      rejection, plus the branch the spike chose.

- [x] **Step 5: Run the folder one last time** and confirm green.

- [x] **Step 6: Commit**

```bash
git commit -m "docs(film-director): close gap 7 and record the blocking edges" -- docs/reference/film-director-capability-matrix.md docs/superpowers/plans/2026-08-30-film-director-gap-campaign.md docs/superpowers/plans/2026-09-02-film-director-gap-7-blocking-edges.md
```

---

## Out of scope (say so, do not do)

- Importing run or jog clips into `@austencloud/scene-3d`. That is a locomotion
  package change with its own research canon, not a workbench change.
- Any runtime or sampler change for arcs. If a task looks like it needs one, the
  arc is being compiled in the wrong place.
- Bezier, spline, or multi-waypoint paths. `along` is one circular arc between
  two marks; a route with several bends is several walks.
- A stage-bounds concept, a camera-frustum check, or an "is this mark visible"
  warning. Offstage is legal by design and the director owns whether it reads.
- Rewriting the existing straight-walk two-keyframe output. A walk with no
  `along` must resolve byte-identically, which the untouched snapshot proves.

---

## Spike result (branch A)

A performer whose `loadSequence` is never called is benign on every path that
matters, so stand-and-watch is a real capability rather than a rejection.

**Does it still render a body?** Yes, in an idle pose. `Viewer3DScene.svelte:812`
mounts `PerformerRig` for every pooled performer inside the cast loop with no
sequence gate at all, and `PerformerRig.svelte:395` gates the avatar only on
`showAvatar`, which defaults to `true` at `PerformerRig.svelte:174`. The one
`hasSequence` gate in the components directory,
`panels/PerformerManager.svelte:61`, is a control-panel row, not the render
path. Locomotion is driven by `isMoving`/`moveSpeed`/`moveDirection`
(`Viewer3DScene.svelte:837-839`), which the blocking track supplies, so a
watcher can still walk on and stop.

**Does anything throw, warn, or busy-loop?** No. Every read of the null
sequence early-returns: `character-instance-state.svelte.ts:354`
(`handleCycleComplete`), `:671` (`applyBeatPlaneOverrides`), `:755`, and the
`stepConfigs.length === 0` guards on `nextStep`/`prevStep`/`goToStep` at `:775`,
`:785`, `:795`. `updateVisibilityFromStep` at `:343` tolerates an `undefined`
step. `resolvePerformerStepSource` handles `totalSteps <= 0` explicitly at
`performer-step-timing.ts:37` and `:12`, so the per-frame `goToStep`/
`setProgress` in `Viewer3DScene.svelte:402-409` gets a finite number and no
division by zero.

**Does the prop render?** No, and it does not flicker.
`character-instance-state.svelte.ts:381` makes `currentStep` null when
`stepConfigs` is empty, so `leftPropState`/`rightPropState` at `:388`/`:391` are
null, and `PerformerRig.svelte:442` and `:466` gate both prop groups on
`{#if bluePropState && blueVisible}`. `showLeft`/`showRight` stay `false`
(`:256-257`). The performer is empty-handed.

**One finding the plan did not anticipate.** `FilmDirectorScene.svelte:71` calls
`viewer.enter3D(sequence)` at mount, and `enter3D` loads the film's shared
sequence into every existing performer (`viewer-3d-state.svelte.ts:1492-1495`).
Skipping the adapter's two load paths is therefore not enough on its own: an
idle performer would keep the sequence enter3D already gave them. The adapter
must actively clear it, which `clearSequence` at
`character-instance-state.svelte.ts:509` already provides and the state's public
surface already exports at `:1416`. Task 4A uses it.

**Branch taken: A.**
