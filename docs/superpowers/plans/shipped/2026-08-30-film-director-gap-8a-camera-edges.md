# Film Director Gap 8a — Camera Edges: truck / zoom / roll

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a director can say "truck right two meters", "zoom in 15 degrees", and
"roll clockwise 10 degrees" as camera moves, alongside the existing
hold/push-in/pull-back/orbit/crane/pan.

**Architecture:** the moves compile in `compileCameraMoves` (camera-language.ts)
into the existing keyframe stream. Zoom makes fov mutable move state (the
sampler already interpolates fovDeg). Roll adds an OPTIONAL `rollDeg` to
resolved keyframes and to the sampled `DirectorCameraFrame`; the adapter
applies it as a local-Z rotation after an explicit `lookAt`. Truck translates
position AND target together along the camera-right ground axis. The 8 shipped
films' resolved-spec snapshots stay byte-identical because none of them uses
the new moves and `rollDeg` is emitted only on keyframe streams that roll.

**Tech stack:** zod schema (`film-director-schema.ts`), move compiler
(`camera-language.ts`), sampler (`director-camera-track.ts`), adapter
(`director-viewer-adapter.ts`), vitest.

**Worktree:** `E:/worktrees/tka-platform/director-gaps`, branch
`claude/director-gaps`. Run tests with
`node node_modules/vitest/vitest.mjs run --config tests/config/vitest.config.ts <paths>`
(npx does not resolve in this worktree).

**Design decisions locked here (do not relitigate):**

- `truck`: unit meters, directions `left`/`right`, default direction `left`
  (matches pan's default side), default amount 2 (matches crane). Camera-right
  on the ground plane is `normalize([-fz, 0, fx])` where `[fx, fz]` are the
  x/z components of `target - position`. `right` moves along `+right`, `left`
  along `-right`. Position and target BOTH translate: the framing slides
  sideways without turning.
- `zoom`: unit degrees, directions `in`/`out`, default direction `in`, default
  amount 10. `in` SUBTRACTS from fov (narrower = closer), `out` adds. A zoom
  that would leave [20, 100] REJECTS (honest rejection, not a silent clamp)
  with the message
  `` `A zoom of ${fmt(degrees)} degrees would take the lens to ${fmt(next)} degrees, outside the 20-100 degree range (it is at ${fmt(current)}).` ``
  using the same two-decimal `fmt` helper pattern as director-move-windows.ts.
- `roll`: unit degrees, directions `cw`/`ccw`, default direction `cw`, default
  amount 15. Convention: positive `rollDeg` = the horizon tilts CLOCKWISE as
  the audience sees the frame, applied as `camera.rotateZ(+rollRad)` after
  `lookAt`. (Screen-sense verified visually by the main loop at the gate; if
  it reads backwards the fix is one sign flip in the adapter, not the schema.)
  Rolls accumulate across moves in a scene; no total cap.
- `ResolvedDirectorCameraKeyframe.rollDeg?: number` is OPTIONAL and only
  present on streams where a roll move ran (sparse — keeps every existing
  film's snapshot byte-identical). When the FIRST roll move starts, its start
  keyframe carries an explicit `rollDeg: 0` so the ramp has an anchor.
- `DirectorCameraFrame.rollDeg: number` is REQUIRED (always sampled, 0 when no
  keyframe has it). Sampled frames are never snapshotted, so this changes no
  fixture.
- Raw authored keyframes also gain `rollDeg: finiteNumber.min(-180).max(180).optional()`
  so the two layers stay symmetric; the keyframe resolution path passes it
  through.
- Adapter: when `frame.rollDeg !== 0`, after `snapCameraTo` do
  `camera.up.set(0, 1, 0); camera.lookAt(tx, ty, tz); camera.rotateZ(rollRad)`
  then the existing fov update. The explicit lookAt makes roll deterministic
  even if `snapCameraTo` early-outs on an unchanged position (during a roll
  the position IS unchanged frame to frame). When `rollDeg === 0` the legacy
  path runs bit-identical.

---

### Task 1: Schema — new moves, directions, keyframe rollDeg

**Files:**
- Modify: `src/routes/test/film-director/_lib/film-director-schema.ts`
- Test: `tests/unit/film-director/directive-corpus/camera.ts` (corpus entries)

- [x] **Step 1: Add failing corpus entries**

In `tests/unit/film-director/directive-corpus/camera.ts`, follow the file's
existing accept/reject entry shape (read it first) and add:

- accept: `moves: [{ move: "truck", direction: "right", amount: { meters: 2 } }]`
- accept: `moves: [{ move: "zoom", direction: "in", amount: { degrees: 15 } }]`
- accept: `moves: [{ move: "roll", direction: "ccw", amount: { degrees: 10 }, durationBeats: 8 }]`
- accept: a raw keyframe carrying `rollDeg: 12`
- reject: `moves: [{ move: "truck", amount: { degrees: 30 } }]` (meters move given degrees)
- reject: `moves: [{ move: "zoom", direction: "cw" }]` (zoom directions are in/out)
- reject: a raw keyframe with `rollDeg: 270` (outside ±180)

- [x] **Step 2: Run the corpus test to verify the new entries fail**

Run: `node node_modules/vitest/vitest.mjs run --config tests/config/vitest.config.ts tests/unit/film-director/film-director-schema.test.ts` (or whichever test file consumes the corpus — grep for `directive-corpus/camera`).
Expected: the new accepts FAIL (unknown enum values), rejects may pass vacuously.

- [x] **Step 3: Implement the schema**

In `film-director-schema.ts`:

```ts
// cameraKeyframeSchema gains, after fovDeg:
    rollDeg: finiteNumber.min(-180).max(180).optional(),
```

```ts
// cameraSchema.moves: extend the enums:
            move: z.enum([
              "hold",
              "push-in",
              "pull-back",
              "orbit",
              "crane",
              "pan",
              "truck",
              "zoom",
              "roll",
            ]),
            direction: z
              .enum(["cw", "ccw", "up", "down", "left", "right", "in", "out"])
              .optional(),
```

```ts
// ResolvedDirectorCameraKeyframe gains:
  /**
   * Horizon tilt in degrees, positive = clockwise as the audience sees the
   * frame. Present only on keyframe streams where a roll move ran, so films
   * that never roll resolve byte-identically to their pre-roll snapshots.
   */
  rollDeg?: number;
```

Per-move direction/unit validity is enforced in camera-language.ts
`MOVE_RULES` (Task 2), same as the existing moves — the schema stays
syntactic, the compiler stays semantic (two-layer contract, see the
`atMostOneTimeUnit` doc comment).

- [x] **Step 4: Run the corpus test again**

Expected: all new entries pass.

- [x] **Step 5: Commit**

```bash
git add tests/unit/film-director/directive-corpus/camera.ts src/routes/test/film-director/_lib/film-director-schema.ts
git commit -m "feat(film-director): truck/zoom/roll schema surface" -- tests/unit/film-director/directive-corpus/camera.ts src/routes/test/film-director/_lib/film-director-schema.ts
```

### Task 2: Compiler — truck, zoom, roll in compileCameraMoves

**Files:**
- Modify: `src/routes/test/film-director/_lib/camera-language.ts`
- Test: `tests/unit/film-director/camera-language.test.ts`

- [x] **Step 1: Write the failing compiler tests**

Extend `camera-language.test.ts` (match its existing helpers/context setup):

```ts
describe("truck", () => {
  it("translates position and target together along camera-right", () => {
    // Framing looking down -z from +z: camera-right is +x on screen-left?
    // No geometry guessing: assert the INVARIANTS.
    const framing = { position: [0, 1.6, 6] as V3, target: [0, 1.2, 0] as V3, fovDeg: 50 };
    const frames = compileCameraMoves(
      [{ move: "truck", direction: "right", amount: { meters: 2 } }],
      framing,
      context({ durationSeconds: 4 })
    );
    const first = frames[0]!;
    const last = frames.at(-1)!;
    // Both endpoints moved by the same vector (no rotation of the framing):
    const dPos = sub(last.position, first.position);
    const dTgt = sub(last.target, first.target);
    expect(dPos).toEqual(dTgt);
    // The move is 2 meters, on the ground plane, perpendicular to view:
    expect(Math.hypot(...dPos)).toBeCloseTo(2, 6);
    expect(dPos[1]).toBeCloseTo(0, 6);
    const forward = sub(first.target, first.position);
    expect(dPos[0] * forward[0] + dPos[2] * forward[2]).toBeCloseTo(0, 6);
  });

  it("left and right are opposite vectors", () => { /* compile both, expect negated dPos */ });
});

describe("zoom", () => {
  it("zoom in narrows fov by the stated degrees without moving the camera", () => {
    const frames = compileCameraMoves(
      [{ move: "zoom", direction: "in", amount: { degrees: 15 } }],
      framing50,
      context({ durationSeconds: 4 })
    );
    expect(frames[0]!.fovDeg).toBe(50);
    expect(frames.at(-1)!.fovDeg).toBe(35);
    expect(frames.at(-1)!.position).toEqual(frames[0]!.position);
  });

  it("a later push-in starts from the zoomed fov", () => { /* zoom then hold: hold keyframes carry 35 */ });

  it("rejects a zoom that leaves 20-100", () => {
    expect(() =>
      compileCameraMoves(
        [{ move: "zoom", direction: "in", amount: { degrees: 40 } }],
        framing50,
        context({ durationSeconds: 4 })
      )
    ).toThrow(/outside the 20-100 degree range/);
  });
});

describe("roll", () => {
  it("ramps rollDeg from an explicit 0 anchor to the signed amount", () => {
    const frames = compileCameraMoves(
      [{ move: "roll", direction: "cw", amount: { degrees: 10 } }],
      framing50,
      context({ durationSeconds: 4 })
    );
    expect(frames[0]!.rollDeg).toBe(0);
    expect(frames.at(-1)!.rollDeg).toBe(10);
  });

  it("ccw is negative and rolls accumulate", () => { /* cw 10 then ccw 25 -> ends at -15 */ });

  it("keyframes from scenes that never roll carry no rollDeg key", () => {
    const frames = compileCameraMoves([{ move: "hold" }], framing50, context({ durationSeconds: 4 }));
    for (const frame of frames) expect("rollDeg" in frame).toBe(false);
  });
});
```

- [x] **Step 2: Run to verify they fail**

Run: `node node_modules/vitest/vitest.mjs run --config tests/config/vitest.config.ts tests/unit/film-director/camera-language.test.ts`
Expected: FAIL (compiler throws on unknown move via MOVE_RULES lookup).

- [x] **Step 3: Implement**

In `camera-language.ts`:

```ts
// DirectorCameraMove:
  move: "hold" | "push-in" | "pull-back" | "orbit" | "crane" | "pan" | "truck" | "zoom" | "roll";
  direction?: "cw" | "ccw" | "up" | "down" | "left" | "right" | "in" | "out";
```

```ts
// MOVE_RULES additions:
  truck: { unit: "meters", directions: ["left", "right"] },
  zoom: { unit: "degrees", directions: ["in", "out"] },
  roll: { unit: "degrees", directions: ["cw", "ccw"] },
```

```ts
const MIN_FOV_DEG = 20;
const MAX_FOV_DEG = 100;
const fmt = (n: number) => String(Number(n.toFixed(2)));
```

In `compileCameraMoves`, make fov and roll mutable move state and thread them
through `push` (which currently hardcodes `framing.fovDeg`):

```ts
  let fovDeg = framing.fovDeg;
  let rollDeg: number | undefined;
  // inside the per-move closure, push becomes:
    const push = (
      atSeconds: number,
      pos: [number, number, number],
      tgt: [number, number, number],
      interpolation: ResolvedDirectorCameraKeyframe["interpolation"] = "smooth"
    ) => {
      const last = frames.at(-1);
      if (last && Math.abs(last.atSeconds - atSeconds) < 1e-6) frames.pop();
      frames.push({
        atSeconds,
        position: pos,
        target: tgt,
        fovDeg,
        interpolation,
        easing,
        ...(rollDeg !== undefined ? { rollDeg } : {}),
      });
    };
```

New move branches (before the trailing pan fallthrough — convert pan to an
explicit `if` block or keep it last; do not let truck/zoom/roll fall into it):

```ts
    if (move.move === "truck") {
      const meters =
        (move.amount && "meters" in move.amount ? move.amount.meters : 2) *
        (move.direction === "right" ? 1 : -1);
      const fx = target[0] - position[0];
      const fz = target[2] - position[2];
      const groundLength = Math.hypot(fx, fz) || 1;
      const right: [number, number] = [-fz / groundLength, fx / groundLength];
      const nextPosition: [number, number, number] = [
        position[0] + right[0] * meters, position[1], position[2] + right[1] * meters,
      ];
      const nextTarget: [number, number, number] = [
        target[0] + right[0] * meters, target[1], target[2] + right[1] * meters,
      ];
      push(start, [...position], [...target]);
      push(end, nextPosition, nextTarget);
      position = nextPosition;
      target = nextTarget;
      return;
    }

    if (move.move === "zoom") {
      const degrees =
        (move.amount && "degrees" in move.amount ? move.amount.degrees : 10) *
        (move.direction === "out" ? 1 : -1);
      const next = fovDeg + degrees;
      if (next < MIN_FOV_DEG || next > MAX_FOV_DEG) {
        throw new Error(
          `A zoom of ${fmt(Math.abs(degrees))} degrees would take the lens to ${fmt(next)} degrees, outside the ${MIN_FOV_DEG}-${MAX_FOV_DEG} degree range (it is at ${fmt(fovDeg)}).`
        );
      }
      push(start, [...position], [...target]);
      fovDeg = next;
      push(end, [...position], [...target]);
      return;
    }

    if (move.move === "roll") {
      const degrees =
        (move.amount && "degrees" in move.amount ? move.amount.degrees : 15) *
        (move.direction === "ccw" ? -1 : 1);
      rollDeg ??= 0;
      push(start, [...position], [...target]);
      rollDeg += degrees;
      push(end, [...position], [...target]);
      return;
    }
```

CAREFUL with the same-time dedupe: `push` pops the previous frame when times
collide, so back-to-back moves keep exactly one keyframe at the seam — the
LATER push wins. For zoom/roll that is correct (the seam frame carries the
pre-move value pushed at `start` of the next move, which equals the post-move
value of the previous one because state is threaded).

- [x] **Step 4: Run the compiler tests + the full film-director suite**

Run: `node node_modules/vitest/vitest.mjs run --config tests/config/vitest.config.ts tests/unit/film-director`
Expected: all green, snapshots UNCHANGED (no film uses the new moves yet).

- [x] **Step 5: Commit**

```bash
git add tests/unit/film-director/camera-language.test.ts src/routes/test/film-director/_lib/camera-language.ts
git commit -m "feat(film-director): compile truck/zoom/roll camera moves" -- tests/unit/film-director/camera-language.test.ts src/routes/test/film-director/_lib/camera-language.ts
```

### Task 3: Sampler + adapter — rollDeg through to the lens

**Files:**
- Modify: `src/routes/test/film-director/_lib/director-camera-track.ts`
- Modify: `src/routes/test/film-director/_lib/director-viewer-adapter.ts`
- Test: `tests/unit/film-director/director-camera-track.test.ts`

- [x] **Step 1: Write the failing sampler tests**

In `director-camera-track.test.ts` (reuse its keyframe helpers):

```ts
describe("rollDeg sampling", () => {
  it("interpolates roll between keyframes and defaults absent roll to 0", () => {
    const frames = [
      kf({ atSeconds: 0, rollDeg: 0, interpolation: "linear" }),
      kf({ atSeconds: 4, rollDeg: 10, interpolation: "linear" }),
    ];
    expect(sampleDirectorCameraTrack(frames, 2).rollDeg).toBeCloseTo(5, 4);
    expect(sampleDirectorCameraTrack(frames, 0).rollDeg).toBe(0);
    expect(sampleDirectorCameraTrack(frames, 99).rollDeg).toBe(10);
  });

  it("legacy keyframes without rollDeg sample as 0", () => {
    const frames = [kf({ atSeconds: 0 }), kf({ atSeconds: 4 })];
    expect(sampleDirectorCameraTrack(frames, 2).rollDeg).toBe(0);
  });
});
```

Also pass `rollDeg` through the RAW-KEYFRAME resolution path: in
`resolveDirectorCameraTrack`'s `input.keyframes` branch, spread the authored
`frame.rollDeg` into the resolved keyframe when present (extend the local
`keyframe(...)` helper with an optional rollDeg param or spread after). Add a
test resolving a custom-keyframe camera with `rollDeg: 12` and asserting the
resolved keyframe carries it.

- [x] **Step 2: Run to verify they fail**

Expected: FAIL — `rollDeg` is undefined on `DirectorCameraFrame`.

- [x] **Step 3: Implement sampler + adapter**

`director-camera-track.ts`:

```ts
export interface DirectorCameraFrame {
  position: [number, number, number];
  target: [number, number, number];
  fovDeg: number;
  /** Horizon tilt, degrees; positive = clockwise on screen. Always present (0 = level). */
  rollDeg: number;
}
```

Every return path in `sampleDirectorCameraTrack` gains rollDeg: the empty
fallback returns 0; first/last/step paths return `frame.rollDeg ?? 0`; the
interpolated path adds

```ts
    rollDeg: interpolateScalar(
      before.rollDeg ?? 0,
      start.rollDeg ?? 0,
      end.rollDeg ?? 0,
      after.rollDeg ?? 0,
      progress,
      smooth
    ),
```

`director-viewer-adapter.ts` — restructure `applyDirectorCameraFrame` so roll
and fov are independent (the current early return would skip roll whenever fov
is unchanged, which is every frame of a pure roll):

```ts
export function applyDirectorCameraFrame(
  viewer: Viewer3DState,
  frame: DirectorCameraFrame,
  previewFovDeg = frame.fovDeg
): void {
  viewer.snapCameraTo(
    { x: frame.position[0], y: frame.position[1], z: frame.position[2] },
    { x: frame.target[0], y: frame.target[1], z: frame.target[2] },
    undefined,
    false
  );

  const camera = viewer.threlteCamera as PerspectiveCamera | null;
  if (!camera) return;

  if (frame.rollDeg !== 0) {
    // Re-derive the orientation locally: snapCameraTo may skip its lookAt on
    // an unchanged position, and during a pure roll the position IS
    // unchanged frame to frame — an accumulated rotateZ would spin out.
    camera.up.set(0, 1, 0);
    camera.lookAt(frame.target[0], frame.target[1], frame.target[2]);
    camera.rotateZ((frame.rollDeg * Math.PI) / 180);
  }

  if (Math.abs(camera.fov - previewFovDeg) >= 0.001) {
    camera.fov = previewFovDeg;
    camera.updateProjectionMatrix();
  }
}
```

(`PerspectiveCamera` is already imported as a type; `lookAt`/`rotateZ`/`up`
are THREE.Object3D/Camera members, no new imports.)

- [x] **Step 4: Run the full film-director suite**

Expected: all green, snapshots unchanged.

- [x] **Step 5: Commit**

```bash
git add tests/unit/film-director/director-camera-track.test.ts src/routes/test/film-director/_lib/director-camera-track.ts src/routes/test/film-director/_lib/director-viewer-adapter.ts
git commit -m "feat(film-director): sample and apply camera roll" -- tests/unit/film-director/director-camera-track.test.ts src/routes/test/film-director/_lib/director-camera-track.ts src/routes/test/film-director/_lib/director-viewer-adapter.ts
```

### Task 4: Proving scene 3 + docs

**Files:**
- Modify: `src/routes/test/film-director/_films/proving-grounds.ts`
- Modify: `tests/unit/film-director/film-library.test.ts`
- Modify: `docs/reference/film-director-capability-matrix.md`
- Snapshot: `tests/unit/film-director/__snapshots__/film-resolution-snapshot.test.ts.snap` (via `-u`)

- [x] **Step 1: Append the scene**

APPEND (never edit scenes 1–2) to `provingGroundsFilm.scenes`, and extend the
film's `brief` with one clause about the camera-edges scene:

```ts
    {
      id: "camera-edges",
      title: "Camera Edges",
      intent:
        "Gap 8a: the frame slides two meters sideways without turning (truck), the lens tightens fifteen degrees while the camera stands still (zoom), and the horizon tilts ten degrees clockwise and holds (roll).",
      durationBeats: 24,
      transition: { kind: "fade-through-black", durationBeats: 2 },
      location: { environmentId: "forest" },
      performance: {
        bpm: 120,
        formation: "side-by-side",
        cast: { count: 2, defaults: { effect: "none" } },
      },
      camera: {
        subject: { kind: "group" },
        shotSize: "wide",
        angle: "eye",
        position: "front",
        moves: [
          { move: "truck", direction: "right", amount: { meters: 2 }, durationBeats: 8 },
          { move: "zoom", direction: "in", amount: { degrees: 15 }, durationBeats: 8 },
          { move: "roll", direction: "cw", amount: { degrees: 10 }, durationBeats: 4 },
          { move: "hold", durationBeats: 4 },
        ],
      },
    },
```

(24 beats at 120 bpm = 12 s; the moves are counted 8+8+4+4. This also
exercises `transition.durationBeats`, one of the deferred beats spellings.)

- [x] **Step 2: Extend the proving assertions in film-library.test.ts**

Inside the existing `"Proving Grounds exercises the gaps it advertises"` test:

```ts
    const edges = resolved.scenes.find((s) => s.id === "camera-edges")!;
    expect(edges.durationSeconds).toBe(12);
    expect(edges.transition).toMatchObject({ durationSeconds: 1 });
    const kf = edges.camera.keyframes;
    const at = (t: number) =>
      kf.find((frame) => Math.abs(frame.atSeconds - t) < 1e-6)!;
    // Truck (0-4s): position and target translate by the same 2m ground vector.
    const truckDelta = [0, 1, 2].map((axis) => at(4).position[axis]! - at(0).position[axis]!);
    const targetDelta = [0, 1, 2].map((axis) => at(4).target[axis]! - at(0).target[axis]!);
    expect(truckDelta).toEqual(targetDelta);
    expect(Math.hypot(...truckDelta)).toBeCloseTo(2, 4);
    expect(truckDelta[1]).toBeCloseTo(0, 6);
    // Zoom (4-8s): fov 50 -> 35 with the camera parked.
    expect(at(4).fovDeg).toBe(50);
    expect(at(8).fovDeg).toBe(35);
    expect(at(8).position).toEqual(at(4).position);
    // Roll (8-10s): explicit 0 anchor ramping to +10 (clockwise on screen).
    expect(at(8).rollDeg).toBe(0);
    expect(at(10).rollDeg).toBe(10);
    // Scenes that never roll stay sparse:
    expect(onBeat.camera.keyframes.every((frame) => !("rollDeg" in frame))).toBe(true);
```

- [x] **Step 3: Run the suite with `-u`, inspect the snapshot diff**

Run: `node node_modules/vitest/vitest.mjs run --config tests/config/vitest.config.ts -u tests/unit/film-director`
Then: `git diff tests/unit/film-director/__snapshots__/` — every hunk must be
inside the Proving Grounds export (the appended scene). ANY hunk in another
film's block is a real bug: stop and investigate, do not commit.

- [x] **Step 4: Update the capability matrix**

In `docs/reference/film-director-capability-matrix.md`: update the camera
moves row to include truck/zoom/roll with their units/directions/defaults, and
add a closed-gap entry "Camera edges: truck, zoom, roll (closed 2026-08-30)"
following the existing closed-entry format (see "Beats as a time unit"). Note
the roll screen-sense convention (positive = clockwise on screen) and the
zoom 20-100 rejection.

- [x] **Step 5: Run the FULL film-director suite one final time**

Expected: 26 files green; the proving poster test still passes (the poster is
already baked and scene 1 is untouched).

- [x] **Step 6: Commit**

```bash
git add src/routes/test/film-director/_films/proving-grounds.ts tests/unit/film-director/film-library.test.ts tests/unit/film-director/__snapshots__/film-resolution-snapshot.test.ts.snap docs/reference/film-director-capability-matrix.md
git commit -m "feat(film-director): proving scene for camera edges" -- src/routes/test/film-director/_films/proving-grounds.ts tests/unit/film-director/film-library.test.ts tests/unit/film-director/__snapshots__/film-resolution-snapshot.test.ts.snap docs/reference/film-director-capability-matrix.md
```

---

**Out of scope for the executor (main loop owns these):** visual verification
of the three moves on the workbench, the roll screen-sense check (and the
one-line adapter sign flip if it reads backwards), campaign-ledger checkbox,
merge to main.
