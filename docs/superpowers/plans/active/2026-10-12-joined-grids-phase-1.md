# Joined Grids in Arrangement Cells, Phase 1: Layers Share the Join

> **For agentic workers:** This plan is executed inline in one worktree
> (`E:/worktrees/tka-platform/layers-share-join`, branch
> `codex/layers-share-join`) under the Agent Budget rule: no per-task
> subagents, one review at most. Steps use checkbox (`- [ ]`) syntax for
> tracking. Phase 2 of the spec (the cell's own join, the Grids panel) gets its
> own plan when it begins.

**Spec:** `docs/superpowers/specs/2026-10-12-joined-grids-in-arrangement-cells-design.md`,
sections "Engine: overlaid layers share the sequence's join", "Testing" (the
engine and sub-sampler cases), "Visual verification" (the viewer Tunnel
screenshot) and "Phases" (phase 1).

**Goal:** A sequence that carries a join draws its pair of grids even when
other performers are overlaid on it. Every overlaid layer's blue hand moves on
blue's grid and its red hand on red's, trails and effects follow, and slow
frames keep their sub-samples. Nothing can set a join yet; that is phase 2.

**Architecture:** `resolveAnimationGridJoin` stops nulling the join when
layers are present, so the six callers that pass a layer count lose that
argument. `FrameSystem.applyGridJoin`, which already moves the base pair onto
their grids with `shiftPropState` into scratch states, does the same for every
entry of `params.props.additionalLayers` through a new pure helper,
`shiftLayerProps`, that writes shifted copies into a reused pool and leaves
the host's layer objects alone. The motion sub-sampler, whose layer guard
compares a layer's sampled pose with the live one, learns the frame's hand
offsets so it compares and fills shifted poses. Trails, fire, LED and the
other effects read tips off `params.props.additionalLayers` after the shift,
so they follow without changes of their own. The `/test/prop-tunnel` harness
takes a `?join=` token so the overlaid pair can be seen on demand, and the
canon's sentence about tunnel layers keeping one grid is replaced.

**Tech Stack:** TypeScript, Svelte 5 runes, Vitest
(`npm run test:ci -- <paths>`), `npm run check:fast`, the in-app browser on
the primary server at `https://localhost:5173`.

---

## File map

| Path                                                                                   | Responsibility                                                                                                  |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Modify `src/lib/shared/animation-engine/services/animation-grid-join.ts`               | `resolveAnimationGridJoin(sequence, gridMode)`; new `LayerShiftPool`, `createLayerShiftPool`, `shiftLayerProps` |
| Modify `src/lib/shared/animation-engine/services/managers/frame-system.ts`             | Drop the layer count from the resolver call; shift the layers in `applyGridJoin`                                |
| Modify `src/lib/shared/animation-engine/services/managers/playback-sync.ts`            | Drop the layer count from the resolver call                                                                     |
| Modify `src/lib/shared/animation-engine/services/animation-engine.svelte.ts`           | Drop the layer count from the resolver call                                                                     |
| Modify `src/lib/shared/animation-engine/components/AnimatorCanvas.svelte`              | Drop the layer count from the resolver call                                                                     |
| Modify `src/lib/shared/video-export/services/offscreen-export-renderer.ts`             | Drop the layer count from the resolver call                                                                     |
| Modify `src/lib/shared/animation-engine/services/motion-sub-sampler.ts`                | `MotionPlanInput.gridJoinOffsets`; shifted layer guard and shifted pooled layer samples                         |
| Modify `src/lib/shared/animation-engine/services/animation-render-loop.ts`             | Pass the frame's offsets into the plan                                                                          |
| Modify `src/routes/test/prop-tunnel/+page.svelte`                                      | `?join=<token>` stamps the generated base sequence                                                              |
| Modify `docs/architecture/canonical-capabilities.md`                                   | The 2D animation paragraph: layers share the join                                                               |
| Modify `tests/unit/animation-engine/animation-grid-join.test.ts`                       | Resolver signature; "layers share the sequence's join"; `shiftLayerProps` cases                                 |
| Modify `src/lib/shared/animation-engine/services/__tests__/motion-sub-sampler.test.ts` | Shifted layer samples and guard                                                                                 |

Not touched: `arrangement.ts`, `arrangement-edits.ts`, `arrangement-look.ts`,
`post-animation-appearance.ts`, the plugin UI files and the shared
`@austencloud/video-editor` package (the Video Editor session's files; phase 2
tells that session before editing them).

---

### Task 1: The resolver no longer nulls the join for layers

**Files:**

- Modify: `src/lib/shared/animation-engine/services/animation-grid-join.ts:38-55`
- Modify: `src/lib/shared/animation-engine/components/AnimatorCanvas.svelte:758-762`
- Modify: `src/lib/shared/animation-engine/services/animation-engine.svelte.ts:421-425`
- Modify: `src/lib/shared/animation-engine/services/managers/frame-system.ts:132-139`
- Modify: `src/lib/shared/animation-engine/services/managers/playback-sync.ts:674-678`
- Modify: `src/lib/shared/video-export/services/offscreen-export-renderer.ts:176`
- Test: `tests/unit/animation-engine/animation-grid-join.test.ts:124-170`

- [ ] **Step 1: Change the tests first**

In `tests/unit/animation-engine/animation-grid-join.test.ts`, inside
`describe("which grids the animation draws")`, the two calls that pass `0` as
the layer count lose it:

```ts
// The grid the animation draws wins over the sequence's stored mode.
expect(
  resolveAnimationGridJoin({ ...diagonal, gridMode: "diamond" }, "box")
).toEqual({ toward: "nw", steps: 2 });
expect(
  resolveAnimationGridJoin({
    conjoined: { toward: "e", steps: 1 },
    gridMode: "box",
  })
).toEqual({ toward: "se", steps: 1 });
```

and the "keeps tunnel layers on one grid" case becomes:

```ts
it("draws the sequence's join whatever is overlaid on it", () => {
  // Tunnel copies and arrangement performers share the sequence's grids;
  // the frame system moves each layer's hands onto them (Task 2).
  const sequence = { conjoined: { toward: "e", steps: 1 } };
  expect(resolveAnimationGridJoin(sequence)).toEqual({
    toward: "e",
    steps: 1,
  });
  expect(resolveAnimationGridJoin(sequence, "box")).toEqual({
    toward: "se",
    steps: 1,
  });
});
```

- [ ] **Step 2: Run the file to see the signature mismatch fail**

Run: `npm run test:ci -- tests/unit/animation-engine/animation-grid-join.test.ts`
Expected: the "wins over the sequence's stored mode" case fails (the string
`"box"` lands in `tunnelLayerCount`, so the join resolves as if no grid mode
were given: north, not north-west). The new case passes already.

- [ ] **Step 3: Change the resolver**

In `animation-grid-join.ts` replace the doc comment and function:

```ts
/**
 * The join the animation draws for a sequence, or null for one grid. Layers
 * overlaid on the sequence (tunnel copies, arrangement performers) share it:
 * the frame system moves every layer's hands onto the pair. The join is lined
 * up with the grid drawn (`gridMode`, else the sequence's own), as the cards
 * line it up.
 */
export function resolveAnimationGridJoin(
  sequence: JoinedSequence | null | undefined,
  gridMode?: string | null
): GridJoin | null {
  const join = sequence?.conjoined;
  return isGridJoin(join)
    ? alignGridJoin(join, gridMode ?? sequence?.gridMode)
    : null;
}
```

- [ ] **Step 4: Change the five callers**

`AnimatorCanvas.svelte`:

```ts
// The join belongs to the sequence; overlaid layers draw on its pair too.
const gridJoin = $derived(resolveAnimationGridJoin(sequenceData, gridMode));
```

`animation-engine.svelte.ts`:

```ts
const initGridJoin = resolveAnimationGridJoin(
  this.playbackSync.lastPropsRef?.sequenceData,
  this.playbackSync.lastPropsRef?.gridMode
);
```

`frame-system.ts` (`buildFrameParams`):

```ts
this.applyGridJoin(
  params,
  resolveAnimationGridJoin(props.sequenceData, props.gridMode)
);
```

`playback-sync.ts` (`syncGridJoin`):

```ts
const join = resolveAnimationGridJoin(
  this._lastPropsRef?.sequenceData,
  this._lastPropsRef?.gridMode
);
```

`offscreen-export-renderer.ts`:

```ts
resolveAnimationGridJoin(this.panelState.sequenceData, gridMode);
```

The mandala test (`src/lib/shared/mandala/services/__tests__/mandala-grid-join.test.ts`)
already calls the resolver with one argument and needs no change.

- [ ] **Step 5: Run the tests and the type pass**

Run: `npm run test:ci -- tests/unit/animation-engine/animation-grid-join.test.ts src/lib/shared/mandala/services/__tests__/mandala-grid-join.test.ts`
Expected: PASS.

Run: `npm run check:fast`
Expected: no new errors (a stale three-argument call anywhere would show here).

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor(animation): draw a sequence's join under overlaid layers" -- src/lib/shared/animation-engine/services/animation-grid-join.ts src/lib/shared/animation-engine/components/AnimatorCanvas.svelte src/lib/shared/animation-engine/services/animation-engine.svelte.ts src/lib/shared/animation-engine/services/managers/frame-system.ts src/lib/shared/animation-engine/services/managers/playback-sync.ts src/lib/shared/video-export/services/offscreen-export-renderer.ts tests/unit/animation-engine/animation-grid-join.test.ts
```

(The pre-commit hook runs the full `svelte-check`; commit once per task, in
the background, and wait for it.)

---

### Task 2: `shiftLayerProps` and the frame system

**Files:**

- Modify: `src/lib/shared/animation-engine/services/animation-grid-join.ts` (after `shiftPropState`)
- Modify: `src/lib/shared/animation-engine/services/managers/frame-system.ts:33-41, 46-57, 155-190`
- Test: `tests/unit/animation-engine/animation-grid-join.test.ts` (new `describe`)

- [ ] **Step 1: Write the failing tests**

Add to the imports of `animation-grid-join.test.ts`:

```ts
import {
  ANIMATION_GRID_GEOMETRY,
  animationGridJoinKey,
  buildJoinedGridSvg,
  createLayerShiftPool,
  gridJoinShiftUnits,
  gridJoinShiftViewBox,
  gridPointOfElementId,
  resolveAnimationGridJoin,
  shiftLayerProps,
  shiftPropState,
  shiftTrailPoints,
} from "#lib/shared/animation-engine/services/animation-grid-join.js";
import type { AdditionalLayerProps } from "#lib/shared/animation-engine/domain/types/trail-capture-types.js";
import {
  CENTERED_HAND_OFFSETS,
  gridJoinHandOffsets,
} from "#lib/shared/grid-join/grid-join-tween.js";
```

and a new block after `describe("shiftPropState")`:

```ts
describe("shiftLayerProps", () => {
  const join: GridJoin = { toward: "e", steps: 1 };
  const offsets = gridJoinHandOffsets(join);

  function layers(): AdditionalLayerProps[] {
    return [
      {
        leftProp: { centerPathAngle: 0.3, staffRotationAngle: 1.1 },
        rightProp: {
          centerPathAngle: 2.0,
          staffRotationAngle: 0.4,
          x: 0.25,
          y: -0.5,
        },
        opacity: 0.5,
        leftPropType: "fan",
        rightPropType: "staff",
      },
      {
        leftProp: null,
        rightProp: { centerPathAngle: 1.0, staffRotationAngle: 0 },
        trailCaptureSuppressed: true,
        formationTransitionActive: true,
      },
    ];
  }

  it("moves every layer's hands by the hand offsets", () => {
    const host = layers();
    const shifted = shiftLayerProps(host, offsets, createLayerShiftPool());

    expect(shifted).toHaveLength(2);
    const blue = shifted[0]!.leftProp!;
    expect(blue.x).toBeCloseTo(Math.cos(0.3) + offsets.left.x, 12);
    expect(blue.y).toBeCloseTo(Math.sin(0.3) + offsets.left.y, 12);
    expect(blue.staffRotationAngle).toBe(1.1);
    const red = shifted[0]!.rightProp!;
    expect(red.x).toBeCloseTo(0.25 + offsets.right.x, 12);
    expect(red.y).toBeCloseTo(-0.5 + offsets.right.y, 12);
    expect(shifted[1]!.leftProp).toBeNull();
    expect(shifted[1]!.rightProp!.x).toBeCloseTo(
      Math.cos(1.0) + offsets.right.x,
      12
    );
  });

  it("carries a layer's other fields and leaves the host's objects alone", () => {
    const host = layers();
    const before = JSON.stringify(host);
    const shifted = shiftLayerProps(host, offsets, createLayerShiftPool());

    expect(shifted).not.toBe(host);
    expect(shifted[0]).not.toBe(host[0]);
    expect(shifted[0]!.leftProp).not.toBe(host[0]!.leftProp);
    expect(shifted[0]).toMatchObject({
      opacity: 0.5,
      leftPropType: "fan",
      rightPropType: "staff",
    });
    expect(shifted[1]).toMatchObject({
      trailCaptureSuppressed: true,
      formationTransitionActive: true,
    });
    expect(shifted[1]!.opacity).toBeUndefined();
    expect(JSON.stringify(host)).toBe(before);
  });

  it("reuses the pool across frames and drops a field a layer lost", () => {
    const pool = createLayerShiftPool();
    const first = shiftLayerProps(layers(), offsets, pool);
    const firstSlot = first[0];
    const firstLeft = first[0]!.leftProp;
    const second = shiftLayerProps(
      [
        {
          leftProp: { centerPathAngle: 0, staffRotationAngle: 0 },
          rightProp: null,
        },
      ],
      offsets,
      pool
    );

    expect(second).toBe(first);
    expect(second).toHaveLength(1);
    expect(second[0]).toBe(firstSlot);
    expect(second[0]!.leftProp).toBe(firstLeft);
    expect(second[0]!.opacity).toBeUndefined();
    expect(second[0]!.leftPropType).toBeUndefined();
  });

  it("returns the host's array when there is nothing to shift", () => {
    const host = layers();
    expect(
      shiftLayerProps(host, CENTERED_HAND_OFFSETS, createLayerShiftPool())
    ).toBe(host);
    const empty: AdditionalLayerProps[] = [];
    expect(shiftLayerProps(empty, offsets, createLayerShiftPool())).toBe(empty);
  });
});
```

- [ ] **Step 2: Run the file to see it fail**

Run: `npm run test:ci -- tests/unit/animation-engine/animation-grid-join.test.ts`
Expected: FAIL, `createLayerShiftPool` and `shiftLayerProps` are not exported.

- [ ] **Step 3: Add the helper**

In `animation-grid-join.ts`, add two type imports at the top:

```ts
import type { AdditionalLayerProps } from "../domain/types/trail-capture-types.js";
import type { HandOffsets } from "#lib/shared/grid-join/grid-join-tween.js";
```

and after `shiftPropState`:

```ts
/**
 * Scratch for `shiftLayerProps`: one shifted layer, with its own left and
 * right states, per slot. Created once per frame system and reused every
 * frame, so shifting allocates nothing on the hot path.
 */
export interface LayerShiftPool {
  readonly layers: AdditionalLayerProps[];
  readonly left: PropState[];
  readonly right: PropState[];
}

export function createLayerShiftPool(): LayerShiftPool {
  return { layers: [], left: [], right: [] };
}

function newPropState(): PropState {
  return { centerPathAngle: 0, staffRotationAngle: 0 };
}

/**
 * The overlaid layers with each hand moved onto its grid by `offsets`, the
 * way the base pair is moved. The copies live in `pool` and carry the
 * layer's other fields (opacity, prop types, capture flags); the host's layer
 * objects are never written. With nothing to shift (no layers, or both
 * offsets at the center) the host's array comes back as it is.
 */
export function shiftLayerProps(
  layers: AdditionalLayerProps[],
  offsets: HandOffsets,
  pool: LayerShiftPool
): AdditionalLayerProps[] {
  if (
    layers.length === 0 ||
    (offsets.left.x === 0 &&
      offsets.left.y === 0 &&
      offsets.right.x === 0 &&
      offsets.right.y === 0)
  ) {
    return layers;
  }
  for (let i = 0; i < layers.length; i++) {
    const source = layers[i]!;
    const left = (pool.left[i] ??= newPropState());
    const right = (pool.right[i] ??= newPropState());
    const target = (pool.layers[i] ??= { leftProp: null, rightProp: null });
    target.leftProp = source.leftProp
      ? shiftPropState(source.leftProp, offsets.left, left)
      : null;
    target.rightProp = source.rightProp
      ? shiftPropState(source.rightProp, offsets.right, right)
      : null;
    // Every other field is copied by name so a value from an earlier frame's
    // layer cannot linger on a reused slot.
    target.opacity = source.opacity;
    target.trailCaptureSuppressed = source.trailCaptureSuppressed;
    target.formationTransitionActive = source.formationTransitionActive;
    target.leftPropType = source.leftPropType;
    target.rightPropType = source.rightPropType;
  }
  pool.layers.length = layers.length;
  return pool.layers;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:ci -- tests/unit/animation-engine/animation-grid-join.test.ts`
Expected: PASS.

- [ ] **Step 5: Shift the layers in the frame system**

In `frame-system.ts`, extend the import:

```ts
import {
  createLayerShiftPool,
  resolveAnimationGridJoin,
  shiftLayerProps,
} from "../animation-grid-join";
```

add a field after `joinedRightProp`:

```ts
  private readonly layerShiftPool = createLayerShiftPool();
```

and replace the `applyGridJoin` doc comment and the body after the base pair:

```ts
  /**
   * Joined grids: each hand moves onto its own grid, set by the sequence's
   * join. Overlaid layers (tunnel copies, arrangement performers) move with
   * the hand they copy, so every performer's blue hand sits on blue's grid.
   * While a layout change slides, the hands sit where the slide has them,
   * even on the way back to one grid.
   */
  private applyGridJoin(
    params: RenderFrameParams,
    join: GridJoin | null
  ): void {
    params.gridJoin = join;
    let slide = this.gridJoinTween.sample(performance.now());
    if (slide && slide.t >= 1) {
      this.gridJoinTween.stop();
      slide = null;
      this.gridJoinTweenEnded?.();
    }
    const offsets = slide?.offsets ?? gridJoinHandOffsets(join);
    params.gridJoinOffsets = offsets;
    params.gridJoinSlide = slide;
    if (!join && !slide) return;

    const { leftProp, rightProp } = params.props;
    if (leftProp) {
      params.props.leftProp = shiftPropState(
        leftProp,
        offsets.left,
        this.joinedLeftProp
      );
    }
    if (rightProp) {
      params.props.rightProp = shiftPropState(
        rightProp,
        offsets.right,
        this.joinedRightProp
      );
    }
    // Trails, fire, LED and the other effects read the layers' tips off
    // `params.props.additionalLayers` after this, so they follow the copies.
    params.props.additionalLayers = shiftLayerProps(
      params.props.additionalLayers,
      offsets,
      this.layerShiftPool
    );
    // The mandala guide reads `gridJoinOffsets` and draws each hand's figure
    // on its own grid, sliding with the props, so it stays visible.
  }
```

`params.props.additionalLayers` is reassigned from the host's array by
`FrameParameterBuilder.getFrameParams` at the top of every frame
(`frame-parameter-builder.ts:277`), so the pooled array never outlives its
frame.

- [ ] **Step 6: Run the type pass**

Run: `npm run check:fast`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(animation): move overlaid layers onto the sequence's joined grids" -- src/lib/shared/animation-engine/services/animation-grid-join.ts src/lib/shared/animation-engine/services/managers/frame-system.ts tests/unit/animation-engine/animation-grid-join.test.ts
```

---

### Task 3: The sub-sampler shifts its layer samples

**Files:**

- Modify: `src/lib/shared/animation-engine/services/motion-sub-sampler.ts:36-48, 264-281, 324-384`
- Modify: `src/lib/shared/animation-engine/services/animation-render-loop.ts:1570-1587`
- Test: `src/lib/shared/animation-engine/services/__tests__/motion-sub-sampler.test.ts`

Why: `plan()` compares each layer's sampled pose at the current step with the
live layer and nulls the layer when they differ. After Task 2 the live layers
are shifted by the grid offsets while `layersAt` still returns raw poses, so
every layer on a joined canvas would silently lose its sub-samples
(`layerGuardRejections` climbing, trails turning to chords on slow frames).

- [ ] **Step 1: Write the failing test**

Add to the imports of `motion-sub-sampler.test.ts`:

```ts
import { shiftPropState } from "../animation-grid-join";
import type { HandOffsets } from "#lib/shared/grid-join/grid-join-tween.js";
```

and this helper and case after "nulls a mismatching layer while the base pair
keeps sampling":

```ts
const EAST_ONE: HandOffsets = {
  left: { x: -0.5, y: 0 },
  right: { x: 0.5, y: 0 },
};

function onGrid(pose: PropState, shift: { x: number; y: number }): PropState {
  return shiftPropState(pose, shift, {
    centerPathAngle: 0,
    staffRotationAngle: 0,
  });
}

it("shifts layer samples onto their grids and trusts live layers shifted the same way", () => {
  const sampler = new MotionSubSampler();
  const samples = sampler.plan({
    source: circleSource(),
    previousStep: 1,
    currentStep: 2,
    dtSeconds: 0.05,
    isSeamlesslyLoopable: false,
    loopDetected: false,
    liveLeft: poseAt(2).left,
    liveRight: poseAt(2).right,
    layerCount: 2,
    layersAt: (step) => [
      { leftProp: poseAt(step + 1).left, rightProp: poseAt(step + 1).right },
      { leftProp: poseAt(step + 2).left, rightProp: poseAt(step + 2).right },
    ],
    liveLayers: [
      // The frame system shifted this copy onto the pair.
      {
        leftProp: onGrid(poseAt(3).left, EAST_ONE.left),
        rightProp: onGrid(poseAt(3).right, EAST_ONE.right),
      },
      // A copy still at the center does not match a joined frame.
      { leftProp: poseAt(4).left, rightProp: poseAt(4).right },
    ],
    gridJoinOffsets: EAST_ONE,
    previousTimeMs: 0,
    currentTimeMs: 50,
  });

  expect(samples.length).toBe(2);
  const first = samples[0]!.layers[0]!;
  const expected = onGrid(poseAt(1 + 1 / 3 + 1).left, EAST_ONE.left);
  expect(first.left?.x).toBeCloseTo(expected.x!, 9);
  expect(first.left?.y).toBeCloseTo(expected.y!, 9);
  expect(first.right?.x).toBeCloseTo(
    onGrid(poseAt(1 + 1 / 3 + 1).right, EAST_ONE.right).x!,
    9
  );
  expect(samples[0]!.layers[1]!.left).toBeNull();
  expect(samples[0]!.layers[1]!.right).toBeNull();
  expect(sampler.stats.layerGuardRejections).toBe(1);
});

it("keeps raw layer samples when the frame has no grid offsets", () => {
  const sampler = new MotionSubSampler();
  const samples = sampler.plan({
    source: circleSource(),
    previousStep: 1,
    currentStep: 2,
    dtSeconds: 0.05,
    isSeamlesslyLoopable: false,
    loopDetected: false,
    liveLeft: poseAt(2).left,
    liveRight: poseAt(2).right,
    layerCount: 1,
    layersAt: (step) => [
      { leftProp: poseAt(step + 1).left, rightProp: poseAt(step + 1).right },
    ],
    liveLayers: [{ leftProp: poseAt(3).left, rightProp: poseAt(3).right }],
    gridJoinOffsets: null,
    previousTimeMs: 0,
    currentTimeMs: 50,
  });
  expect(samples.length).toBe(2);
  expect(samples[0]!.layers[0]!.left?.x).toBeUndefined();
  expect(samples[0]!.layers[0]!.left?.centerPathAngle).toBeCloseTo(
    1 + 1 / 3 + 1,
    6
  );
  expect(sampler.stats.layerGuardRejections).toBe(0);
});
```

- [ ] **Step 2: Run the file to see it fail**

Run: `npm run test:ci -- src/lib/shared/animation-engine/services/__tests__/motion-sub-sampler.test.ts`
Expected: the first new case FAILS (both layers rejected: the sampler compares
raw poses with the shifted live copy, so `layerGuardRejections` is 2 and
`first.left` is null). The second passes already (and `gridJoinOffsets` is a
type error until Step 3).

- [ ] **Step 3: Teach the sampler the offsets**

In `motion-sub-sampler.ts`, extend `MotionPlanInput`:

```ts
  /** Tunnel copies at a step, index-aligned with `liveLayers`. */
  layersAt: ((step: number) => readonly AdditionalLayerProps[]) | null;
  liveLayers: readonly AdditionalLayerProps[] | null;
  /**
   * The shift each hand gets this frame on joined grids, which the live
   * layers already carry while `layersAt` returns raw poses; null or absent
   * for one centered grid. (`source` applies the base pair's own shift.)
   */
  gridJoinOffsets?: HandOffsets | null;
```

Give the pooled layer slots their own scratch states. Replace the
`MotionSubSampleLayer` interface comment block with:

```ts
export interface MotionSubSampleLayer {
  left: PropState | null;
  right: PropState | null;
}

/** A pooled layer slot: the public pair plus the scratch the shift writes. */
interface PooledSubSampleLayer extends MotionSubSampleLayer {
  readonly leftPose: PropState;
  readonly rightPose: PropState;
}
```

In the class, add two guard scratch states after `guardRight`:

```ts
  private readonly guardLayerLeft = newPose();
  private readonly guardLayerRight = newPose();
```

Replace the layer guard loop:

```ts
// Same check per tunnel copy; a copy that is mid formation travel is
// skipped on its own while the base pair keeps its samples. On joined
// grids the live copies were shifted by the frame system, so the raw
// sample is shifted the same way before the comparison.
const layerCount = input.layersAt && input.liveLayers ? input.layerCount : 0;
const offsets = input.gridJoinOffsets ?? null;
let layerOk: boolean[] | null = null;
if (layerCount > 0) {
  const liveAt = input.layersAt!(input.currentStep);
  layerOk = [];
  for (let li = 0; li < layerCount; li++) {
    const sampled = liveAt[li];
    const live = input.liveLayers![li];
    const ok =
      !!sampled &&
      !!live &&
      (!live.leftProp ||
        (!!sampled.leftProp &&
          propPosesMatch(
            offsets
              ? shiftPropState(
                  sampled.leftProp,
                  offsets.left,
                  this.guardLayerLeft
                )
              : sampled.leftProp,
            live.leftProp
          ))) &&
      (!live.rightProp ||
        (!!sampled.rightProp &&
          propPosesMatch(
            offsets
              ? shiftPropState(
                  sampled.rightProp,
                  offsets.right,
                  this.guardLayerRight
                )
              : sampled.rightProp,
            live.rightProp
          )));
    if (!ok) this.stats.layerGuardRejections++;
    layerOk.push(ok);
  }
}
```

and the fill loop's layer branch:

```ts
if (layerCount > 0) {
  const at = input.layersAt!(step);
  for (let li = 0; li < layerCount; li++) {
    const layer = sample.layers[li] as PooledSubSampleLayer;
    const src = layerOk![li] ? at[li] : undefined;
    layer.left = src?.leftProp
      ? offsets
        ? shiftPropState(src.leftProp, offsets.left, layer.leftPose)
        : src.leftProp
      : null;
    layer.right = src?.rightProp
      ? offsets
        ? shiftPropState(src.rightProp, offsets.right, layer.rightPose)
        : src.rightProp
      : null;
  }
}
```

and `slot()`'s layer growth:

```ts
while (sample.layers.length < layerCount) {
  const pooled: PooledSubSampleLayer = {
    left: null,
    right: null,
    leftPose: newPose(),
    rightPose: newPose(),
  };
  sample.layers.push(pooled);
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:ci -- src/lib/shared/animation-engine/services/__tests__/motion-sub-sampler.test.ts`
Expected: PASS, including every earlier case.

- [ ] **Step 5: Pass the frame's offsets from the render loop**

In `animation-render-loop.ts`, inside the `this.motionSubSampler.plan({ ... })`
call, after `liveLayers: props.additionalLayers,` add:

```ts
            // The same condition the frame system uses for its sample source.
            gridJoinOffsets:
              params.gridJoin || params.gridJoinSlide
                ? (params.gridJoinOffsets ?? null)
                : null,
```

- [ ] **Step 6: Run the neighbouring tests and the type pass**

Run: `npm run test:ci -- src/lib/shared/animation-engine/services/__tests__/motion-sub-sampler.test.ts src/lib/shared/animation-engine/services/__tests__/render-loop-motion-resample.test.ts src/lib/shared/animation-engine/services/__tests__/trail-overlay-canvas-motion-samples.test.ts src/lib/shared/animation-engine/services/__tests__/fire-tip-tracker-path.test.ts`
Expected: PASS.

Run: `npm run check:fast`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git commit -m "fix(animation): keep layer sub-samples on joined grids" -- src/lib/shared/animation-engine/services/motion-sub-sampler.ts src/lib/shared/animation-engine/services/animation-render-loop.ts src/lib/shared/animation-engine/services/__tests__/motion-sub-sampler.test.ts
```

---

### Task 4: `/test/prop-tunnel?join=<token>`

**Files:**

- Modify: `src/routes/test/prop-tunnel/+page.svelte:24-36, 136-170`

Why: the spec's visual check is "the viewer's Tunnel on a joined sequence". A
full-state viewer link encodes its join inside a compressed blob, so the
harness that already overlays tunnel copies on a generated sequence takes a
join token instead, the way `/test/viewer-3d?join=e2` does. No shipping
surface changes.

- [ ] **Step 1: Read the token once**

Add two imports beside the others:

```ts
import { parseGridJoinToken } from "#lib/shared/foundation/domain/models/grid-join-token.js";
import { withSequenceGridJoin } from "#lib/shared/grid-join/sequence-grid-join.js";
```

and after `let base = $state<SequenceData | null>(null);`:

```ts
/** `?join=e1` stamps the generated sequence so the copies draw on its pair. */
const requestedJoin =
  typeof window === "undefined"
    ? undefined
    : parseGridJoinToken(
        new URLSearchParams(window.location.search).get("join") ?? ""
      );
```

- [ ] **Step 2: Stamp the base sequence**

In `buildSequences()` replace `base = seq;` with:

```ts
base = requestedJoin ? withSequenceGridJoin(seq, requestedJoin) : seq;
```

The rotated and mirrored layers are built from `seq` before this line and
keep no join of their own; the engine reads the join off `base`.

- [ ] **Step 3: Type pass**

Run: `npm run check:fast`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git commit -m "test(prop-tunnel): take a join token so copies draw on the pair" -- src/routes/test/prop-tunnel/+page.svelte
```

---

### Task 5: Canon

**Files:**

- Modify: `docs/architecture/canonical-capabilities.md:201-207`

- [ ] **Step 1: Replace the sentence**

In the paragraph that begins "The 2D animation draws the join its sequence
carries", replace

```
Overlaid tunnel layers share one grid, so with any present the animation
stays single.
```

with

```
Layers overlaid on the sequence (the viewer's Tunnel copies, Studio's tunnel
hook, an arrangement cell's performers) share its join: `FrameSystem.applyGridJoin`
moves every layer's hands by the same per-hand offsets as the base pair
through `shiftLayerProps` (a pooled copy; the host's layer objects are never
written), trails and effects read the shifted tips, and the motion
sub-sampler shifts its layer samples to match (`MotionPlanInput.gridJoinOffsets`).
Do not null the join for layers anywhere.
```

- [ ] **Step 2: Format check**

Run: `npx prettier --check docs/architecture/canonical-capabilities.md`
Expected: no warning (the file is prose; wrap at the paragraph's width).

- [ ] **Step 3: Commit**

```bash
git commit -m "docs(canon): overlaid layers share the sequence's join" -- docs/architecture/canonical-capabilities.md
```

---

### Task 6: Verify, integrate, look

- [ ] **Step 1: Focused tests once more, together**

Run: `npm run test:ci -- tests/unit/animation-engine/animation-grid-join.test.ts tests/unit/animation-engine/grid-join-tween.test.ts src/lib/shared/mandala/services/__tests__/mandala-grid-join.test.ts src/lib/shared/animation-engine/services/__tests__/motion-sub-sampler.test.ts src/lib/shared/animation-engine/services/__tests__/render-loop-motion-resample.test.ts tests/unit/media-composition/post-arrangement-export.test.ts tests/unit/media-composition/post-tunnel-hook.test.ts`
Expected: PASS.

- [ ] **Step 2: Bring the branch current and finish**

From the worktree: `git merge --no-edit main`. From the primary checkout, in
PowerShell:

```powershell
Set-Location E:/tka-platform
npm run wt:finish -- codex/layers-share-join --route /post
```

Expected: gate green (svelte-check 0 errors, compile gate), merged to local
`main`, worktree removed, branch deleted. Nothing pushed.

- [ ] **Step 3: Look at it on the primary server**

In the in-app browser:

- `https://localhost:5173/test/prop-tunnel?join=e1`: wait for "tunnel ready",
  screenshot. Expected: two grids side by side, every copy's blue prop over
  the left grid and red over the right, trails following. Then
  `https://localhost:5173/test/prop-tunnel` (no token): one grid, as before.
- `https://localhost:5173/test/studio-arrangement`: the harness still plays;
  a one-performer cell draws as before. (A joined cell waits for phase 2's
  fixture.)
- Console: no new errors on either page.

- [ ] **Step 4: Report**

Tell Austen in plain words: joined sequences now keep their pair of grids
under overlaid performers and Tunnel copies; the Tunnel side effect the spec
flagged is now visible at the harness link; nothing can pick a join inside an
arrangement yet (phase 2); nothing pushed. Then start phase 2's plan.
