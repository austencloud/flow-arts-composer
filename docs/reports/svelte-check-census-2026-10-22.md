# svelte-check census, 2026-10-22

Full `svelte-check` (`pnpm run check:full`, the `tsconfig.check-full.json`
config with the 20 MB size cap lifted, as `npm run check` intends), run on d2
with `--output machine`. Counts are errors; warnings (71) are unchanged and not
counted. Follows [the type census](type-census-2026-10-22.md).

- Before: `cef5a61d55` (branch base, local main at the time): **106 errors**,
  71 warnings, 56 files with problems (d2 job `svcheck-cef5a61d55-210610`).
- After: `6117aec9f5` (branch `codex/svelte-check-census`): **91 errors**,
  71 warnings, 52 files with problems (d2 job `svcheck-6117aec9f5-211506`).

Our own code is at 0. Everything left is either the ocean labs (Austen's
keep-or-retire call) or the pnpm-patched `@austencloud/scene-3d` package
source.

## By directory

| Directory                                 | Before | After | Note                              |
| ----------------------------------------- | ------ | ----- | --------------------------------- |
| `src/routes/test/ocean-character-lab`     | 58     | 58    | skipped: fish APIs not published  |
| `src/routes/test/ocean-motion-benchmark`  | 13     | 13    | skipped: fish APIs not published  |
| `@austencloud/scene-3d` package source    | 20     | 20    | skipped: pnpm patch, not ours     |
| `src/routes/test/flow-fest-native-export` | 7      | 0     | catalog rows typed                |
| `src/lib/features/lab/tabs/poi-string`    | 4      | 0     | `tone()` keeps option value types |
| `src/lib/features/village/components`     | 3      | 0     | speed options as strings          |
| `src/routes/test/flow-fest-jam`           | 1      | 0     | in-bounds `loops[0]!`             |
| **Total**                                 | 106    | 91    |                                   |

## By error code

Machine output carries no TS code; codes below are mapped from the message.

| Code    | Message                              | Before | After |
| ------- | ------------------------------------ | ------ | ----- |
| TS2339  | Property does not exist on type      | 77     | 70    |
| TS2322  | Type is not assignable to type       | 9      | 2     |
| TS18048 | 'x' is possibly 'undefined'          | 8      | 8     |
| TS2532  | Object is possibly 'undefined'       | 6      | 6     |
| TS2345  | Argument not assignable to parameter | 5      | 4     |
| TS2305  | Module has no exported member        | 1      | 1     |

## Fixes (type-only, no runtime change)

1. `VillageControls.svelte`: `SegmentedControl` is `generics="T extends string"`;
   the speed options passed numbers. Values are now `"0.5"`..`"10"`, the control
   gets `String(speed)` and `setSpeed(Number(value))`. Same numbers reach state.
2. `PoiStringLab.svelte`: `tone()` took `{ value: string }[]`, widening
   `CapSpin`/`Motion` options so the bound `onchange` handlers failed. It is now
   generic over `T extends string`.
3. `FlowFestJamScene.svelte`: `sequencePool.loops[0]!`. Both pool sources hold
   at least one loop: `createFlowFestPlaceholderPool()` copies three fixtures,
   and the generator returns that placeholder when it accepts none
   (`src/routes/test/flow-fest-sim/flow-fest-performer-sequences.ts`).
4. `flow-fest-native-export/+page.svelte`: the `.mjs` catalog infers a union of
   row shapes, so optional build keys (`finish`, `fanBuild`, flips) were
   invisible on the union. Rows are cast to a local
   `Partial<PropBuild> & { id; leftFlipped?; rightFlipped? }` type.

No primary-checkout path under `src/` was modified or untracked at the time, so
nothing was left for another owner.

<details>
<summary>Raw list before (106)</summary>

```
[scene-3d]/src/lib/services/implementations/AvatarAnimator.ts(108,8): Object is possibly 'undefined'.
[scene-3d]/src/lib/services/implementations/AvatarAnimator.ts(3071,7): Argument of type 'number | undefined' is not assignable to parameter of type 'number'. Type 'undefined' is not assignable to type 'number'.
[scene-3d]/src/lib/services/implementations/FingerAnimator.ts(375,69): Property 'isBone' does not exist on type 'Object3D<Object3DEventMap>'.
[scene-3d]/src/lib/services/implementations/FingerAnimator.ts(1702,75): Argument of type '/"index/" | /"ring/" | /"middle/" | /"thumb/" | /"pinky/"' is not assignable to parameter of type '/"index/" | /"thumb/"'. Type '/"ring/"' is not assignable to type '/"index/" | /"thumb/"'.
[scene-3d]/src/lib/services/implementations/LocomotionAnimator.ts(580,36): Object is possibly 'undefined'.
[scene-3d]/src/lib/services/implementations/FootPlanter.ts(1239,20): Object is possibly 'undefined'.
[scene-3d]/src/lib/services/implementations/FootPlanter.ts(1240,37): Argument of type 'Quaternion | undefined' is not assignable to parameter of type 'Quaternion'. Type 'undefined' is not assignable to type 'Quaternion'.
[scene-3d]/src/lib/services/implementations/FootPlanter.ts(1241,19): Argument of type 'Quaternion | undefined' is not assignable to parameter of type 'QuaternionLike'. Type 'undefined' is not assignable to type 'QuaternionLike'.
[scene-3d]/src/lib/services/implementations/FootPlanter.ts(1242,12): Object is possibly 'undefined'.
[scene-3d]/src/lib/services/implementations/FootPlanter.ts(1250,7): Object is possibly 'undefined'.
[scene-3d]/src/lib/services/implementations/FootPlanter.ts(1250,28): Object is possibly 'undefined'.
[scene-3d]/src/lib/components/props/prop-model-recolor.ts(112,5): Type 'Material | Material[] | undefined' is not assignable to type 'Material | Material[]'. Type 'undefined' is not assignable to type 'Material | Material[]'.
[scene-3d]/src/lib/components/props/prop-lathe.ts(111,7): 'first' is possibly 'undefined'.
[scene-3d]/src/lib/components/props/prop-lathe.ts(111,53): 'first' is possibly 'undefined'.
[scene-3d]/src/lib/components/props/prop-lathe.ts(113,7): 'last' is possibly 'undefined'.
[scene-3d]/src/lib/components/props/prop-lathe.ts(113,52): 'last' is possibly 'undefined'.
[scene-3d]/src/lib/components/props/triangle-geometry.ts(99,23): 'p' is possibly 'undefined'.
[scene-3d]/src/lib/components/props/triangle-geometry.ts(99,29): 'q' is possibly 'undefined'.
[scene-3d]/src/lib/components/props/triangle-geometry.ts(99,43): 'p' is possibly 'undefined'.
[scene-3d]/src/lib/components/props/triangle-geometry.ts(99,49): 'q' is possibly 'undefined'.
src/lib/features/village/components/VillageControls.svelte(56,5): Type '{ value: number; label: string; ariaLabel: string; }[]' is not assignable to type '$$render<string>.Option[]'. Type '{ value: number; label: string; ariaLabel: string; }' is not assignable to type '$$render<string>.Option'.   Types of property 'value' are incompatible.     Type 'number' is not assignable to type 'string'.
src/lib/features/village/components/VillageControls.svelte(57,5): Type 'number' is not assignable to type 'string'.
src/lib/features/village/components/VillageControls.svelte(58,48): Argument of type 'string' is not assignable to parameter of type 'number'.
src/lib/features/lab/tabs/poi-string/PoiStringLab.svelte(359,31): Type 'string' is not assignable to type 'CapSpin'.
src/lib/features/lab/tabs/poi-string/PoiStringLab.svelte(368,31): Type 'string' is not assignable to type 'CapSpin'.
src/lib/features/lab/tabs/poi-string/PoiStringLab.svelte(380,31): Type 'string' is not assignable to type '/"pro/" | /"anti/"'.
src/lib/features/lab/tabs/poi-string/PoiStringLab.svelte(389,31): Type 'string' is not assignable to type '/"pro/" | /"anti/"'.
src/routes/test/flow-fest-jam/FlowFestJamScene.svelte(1210,7): Type 'SequenceData | undefined' is not assignable to type 'SequenceData'. Type 'undefined' is not assignable to type 'SequenceData'.
src/routes/test/flow-fest-native-export/+page.svelte(406,24): Property 'finish' does not exist on type '{ family: PropType; propId: string; id: string; } | { family: PropType; propId: string; id: string; leftFlipped: boolean; rightFlipped: boolean; } | { family: PropType; propId: string; id: string; finish: string; } | { ...; }'. Property 'finish' does not exist on type '{ family: PropType; propId: string; id: string; }'.
src/routes/test/flow-fest-native-export/+page.svelte(406,61): Property 'fanBuild' does not exist on type '{ family: PropType; propId: string; id: string; } | { family: PropType; propId: string; id: string; leftFlipped: boolean; rightFlipped: boolean; } | { family: PropType; propId: string; id: string; finish: string; } | { ...; }'. Property 'fanBuild' does not exist on type '{ family: PropType; propId: string; id: string; }'.
src/routes/test/flow-fest-native-export/+page.svelte(407,31): Property 'fanFrameColor' does not exist on type '{ family: PropType; propId: string; id: string; } | { family: PropType; propId: string; id: string; leftFlipped: boolean; rightFlipped: boolean; } | { family: PropType; propId: string; id: string; finish: string; } | { ...; }'. Property 'fanFrameColor' does not exist on type '{ family: PropType; propId: string; id: string; }'.
src/routes/test/flow-fest-native-export/+page.svelte(407,76): Property 'fanCover' does not exist on type '{ family: PropType; propId: string; id: string; } | { family: PropType; propId: string; id: string; leftFlipped: boolean; rightFlipped: boolean; } | { family: PropType; propId: string; id: string; finish: string; } | { ...; }'. Property 'fanCover' does not exist on type '{ family: PropType; propId: string; id: string; }'.
src/routes/test/flow-fest-native-export/+page.svelte(408,30): Property 'triangleGrip' does not exist on type '{ family: PropType; propId: string; id: string; } | { family: PropType; propId: string; id: string; leftFlipped: boolean; rightFlipped: boolean; } | { family: PropType; propId: string; id: string; finish: string; } | { ...; }'. Property 'triangleGrip' does not exist on type '{ family: PropType; propId: string; id: string; }'.
src/routes/test/flow-fest-native-export/+page.svelte(410,36): Property 'leftFlipped' does not exist on type '{ family: PropType; propId: string; id: string; } | { family: PropType; propId: string; id: string; leftFlipped: boolean; rightFlipped: boolean; } | { family: PropType; propId: string; id: string; finish: string; } | { ...; }'. Property 'leftFlipped' does not exist on type '{ family: PropType; propId: string; id: string; }'.
src/routes/test/flow-fest-native-export/+page.svelte(411,37): Property 'rightFlipped' does not exist on type '{ family: PropType; propId: string; id: string; } | { family: PropType; propId: string; id: string; leftFlipped: boolean; rightFlipped: boolean; } | { family: PropType; propId: string; id: string; finish: string; } | { ...; }'. Property 'rightFlipped' does not exist on type '{ family: PropType; propId: string; id: string; }'.
src/routes/test/ocean-character-lab/+page.svelte(57,5): Module '/"@austencloud/backgrounds/"' has no exported member 'setOceanFishSimulationSeed'.
src/routes/test/ocean-character-lab/+page.svelte(190,19): Property 'resident' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(190,39): Property 'resident' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(190,62): Property 'resident' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(208,32): Property 'getSpineChain' does not exist on type 'IFishAnimator'.
src/routes/test/ocean-character-lab/+page.svelte(215,14): Property 'repositionFish' does not exist on type 'IFishAnimator'.
src/routes/test/ocean-character-lab/+page.svelte(224,10): Property 'intent' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(225,10): Property 'intentTimer' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(226,10): Property 'escapeManeuver' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(233,10): Property 'resident' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(237,10): Property 'attention' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(246,10): Property 'perception' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(247,10): Property 'perception' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(248,10): Property 'perception' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(249,10): Property 'perception' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(250,10): Property 'perception' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(251,10): Property 'perception' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(252,10): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(253,10): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(254,10): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(255,10): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(256,10): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(257,10): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(258,10): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(268,32): Property 'getSpineChain' does not exist on type 'IFishAnimator'.
src/routes/test/ocean-character-lab/+page.svelte(277,14): Property 'repositionFish' does not exist on type 'IFishAnimator'.
src/routes/test/ocean-character-lab/+page.svelte(293,13): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(302,55): Property 'escapeEventCount' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(335,53): Property 'resident' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(423,11): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(462,15): Property 'perception' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(466,16): Property 'perception' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(468,40): Property 'intent' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(469,40): Property 'intent' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(502,37): Property 'perception' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(506,34): Property 'perception' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(511,12): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(524,12): Property 'escapeEventCount' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(525,12): Property 'perception' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(529,14): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(538,37): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(557,51): Property 'attention' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(558,39): Property 'attention' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(566,7): Type '/"socializing/"' is not assignable to type 'FishBehavior'.
src/routes/test/ocean-character-lab/+page.svelte(567,13): Property 'intent' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(573,13): Property 'attention' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(574,13): Property 'attention' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(576,40): Property 'attention' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(580,13): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(606,19): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(625,33): Property 'perception' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(626,37): Property 'perception' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(629,14): Property 'perception' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(631,60): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(634,16): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(637,34): Property 'escapeEventCount' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(639,16): Property 'escapeEventCount' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(641,17): Property 'escapeEventCount' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-motion-benchmark/+page.svelte(103,35): Property 'escapeSwim' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-motion-benchmark/+page.svelte(107,17): Property 'escapeSwim' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-motion-benchmark/+page.svelte(113,14): Property 'escapeManeuver' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-motion-benchmark/+page.svelte(113,42): Property 'escapeManeuver' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-motion-benchmark/+page.svelte(148,20): Property 'intent' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-motion-benchmark/+page.svelte(149,30): Property 'escapeEventCount' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-motion-benchmark/+page.svelte(150,25): Property 'escapeManeuver' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-motion-benchmark/+page.svelte(165,29): Property 'escapeManeuver' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-motion-benchmark/+page.svelte(165,55): Property 'escapeSwim' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-motion-benchmark/+page.svelte(169,40): Property 'escapeManeuver' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-motion-benchmark/+page.svelte(169,68): Property 'escapeSwim' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-motion-benchmark/+page.svelte(197,36): Property 'escapeManeuver' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-motion-benchmark/+page.svelte(197,63): Property 'escapeSwim' does not exist on type 'FishMarineLife'.
```

</details>

<details>
<summary>Raw list after (91)</summary>

```
[scene-3d]/src/lib/services/implementations/AvatarAnimator.ts(108,8): Object is possibly 'undefined'.
[scene-3d]/src/lib/services/implementations/AvatarAnimator.ts(3071,7): Argument of type 'number | undefined' is not assignable to parameter of type 'number'. Type 'undefined' is not assignable to type 'number'.
[scene-3d]/src/lib/services/implementations/FingerAnimator.ts(375,69): Property 'isBone' does not exist on type 'Object3D<Object3DEventMap>'.
[scene-3d]/src/lib/services/implementations/FingerAnimator.ts(1702,75): Argument of type '/"index/" | /"ring/" | /"middle/" | /"thumb/" | /"pinky/"' is not assignable to parameter of type '/"index/" | /"thumb/"'. Type '/"ring/"' is not assignable to type '/"index/" | /"thumb/"'.
[scene-3d]/src/lib/services/implementations/LocomotionAnimator.ts(580,36): Object is possibly 'undefined'.
[scene-3d]/src/lib/services/implementations/FootPlanter.ts(1239,20): Object is possibly 'undefined'.
[scene-3d]/src/lib/services/implementations/FootPlanter.ts(1240,37): Argument of type 'Quaternion | undefined' is not assignable to parameter of type 'Quaternion'. Type 'undefined' is not assignable to type 'Quaternion'.
[scene-3d]/src/lib/services/implementations/FootPlanter.ts(1241,19): Argument of type 'Quaternion | undefined' is not assignable to parameter of type 'QuaternionLike'. Type 'undefined' is not assignable to type 'QuaternionLike'.
[scene-3d]/src/lib/services/implementations/FootPlanter.ts(1242,12): Object is possibly 'undefined'.
[scene-3d]/src/lib/services/implementations/FootPlanter.ts(1250,7): Object is possibly 'undefined'.
[scene-3d]/src/lib/services/implementations/FootPlanter.ts(1250,28): Object is possibly 'undefined'.
[scene-3d]/src/lib/components/props/prop-model-recolor.ts(112,5): Type 'Material | Material[] | undefined' is not assignable to type 'Material | Material[]'. Type 'undefined' is not assignable to type 'Material | Material[]'.
[scene-3d]/src/lib/components/props/prop-lathe.ts(111,7): 'first' is possibly 'undefined'.
[scene-3d]/src/lib/components/props/prop-lathe.ts(111,53): 'first' is possibly 'undefined'.
[scene-3d]/src/lib/components/props/prop-lathe.ts(113,7): 'last' is possibly 'undefined'.
[scene-3d]/src/lib/components/props/prop-lathe.ts(113,52): 'last' is possibly 'undefined'.
[scene-3d]/src/lib/components/props/triangle-geometry.ts(99,23): 'p' is possibly 'undefined'.
[scene-3d]/src/lib/components/props/triangle-geometry.ts(99,29): 'q' is possibly 'undefined'.
[scene-3d]/src/lib/components/props/triangle-geometry.ts(99,43): 'p' is possibly 'undefined'.
[scene-3d]/src/lib/components/props/triangle-geometry.ts(99,49): 'q' is possibly 'undefined'.
src/routes/test/ocean-character-lab/+page.svelte(57,5): Module '/"@austencloud/backgrounds/"' has no exported member 'setOceanFishSimulationSeed'.
src/routes/test/ocean-character-lab/+page.svelte(190,19): Property 'resident' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(190,39): Property 'resident' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(190,62): Property 'resident' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(208,32): Property 'getSpineChain' does not exist on type 'IFishAnimator'.
src/routes/test/ocean-character-lab/+page.svelte(215,14): Property 'repositionFish' does not exist on type 'IFishAnimator'.
src/routes/test/ocean-character-lab/+page.svelte(224,10): Property 'intent' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(225,10): Property 'intentTimer' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(226,10): Property 'escapeManeuver' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(233,10): Property 'resident' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(237,10): Property 'attention' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(246,10): Property 'perception' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(247,10): Property 'perception' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(248,10): Property 'perception' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(249,10): Property 'perception' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(250,10): Property 'perception' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(251,10): Property 'perception' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(252,10): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(253,10): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(254,10): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(255,10): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(256,10): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(257,10): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(258,10): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(268,32): Property 'getSpineChain' does not exist on type 'IFishAnimator'.
src/routes/test/ocean-character-lab/+page.svelte(277,14): Property 'repositionFish' does not exist on type 'IFishAnimator'.
src/routes/test/ocean-character-lab/+page.svelte(293,13): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(302,55): Property 'escapeEventCount' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(335,53): Property 'resident' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(423,11): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(462,15): Property 'perception' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(466,16): Property 'perception' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(468,40): Property 'intent' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(469,40): Property 'intent' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(502,37): Property 'perception' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(506,34): Property 'perception' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(511,12): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(524,12): Property 'escapeEventCount' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(525,12): Property 'perception' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(529,14): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(538,37): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(557,51): Property 'attention' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(558,39): Property 'attention' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(566,7): Type '/"socializing/"' is not assignable to type 'FishBehavior'.
src/routes/test/ocean-character-lab/+page.svelte(567,13): Property 'intent' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(573,13): Property 'attention' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(574,13): Property 'attention' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(576,40): Property 'attention' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(580,13): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(606,19): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(625,33): Property 'perception' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(626,37): Property 'perception' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(629,14): Property 'perception' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(631,60): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(634,16): Property 'memory' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(637,34): Property 'escapeEventCount' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(639,16): Property 'escapeEventCount' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-character-lab/+page.svelte(641,17): Property 'escapeEventCount' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-motion-benchmark/+page.svelte(103,35): Property 'escapeSwim' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-motion-benchmark/+page.svelte(107,17): Property 'escapeSwim' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-motion-benchmark/+page.svelte(113,14): Property 'escapeManeuver' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-motion-benchmark/+page.svelte(113,42): Property 'escapeManeuver' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-motion-benchmark/+page.svelte(148,20): Property 'intent' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-motion-benchmark/+page.svelte(149,30): Property 'escapeEventCount' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-motion-benchmark/+page.svelte(150,25): Property 'escapeManeuver' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-motion-benchmark/+page.svelte(165,29): Property 'escapeManeuver' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-motion-benchmark/+page.svelte(165,55): Property 'escapeSwim' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-motion-benchmark/+page.svelte(169,40): Property 'escapeManeuver' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-motion-benchmark/+page.svelte(169,68): Property 'escapeSwim' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-motion-benchmark/+page.svelte(197,36): Property 'escapeManeuver' does not exist on type 'FishMarineLife'.
src/routes/test/ocean-motion-benchmark/+page.svelte(197,63): Property 'escapeSwim' does not exist on type 'FishMarineLife'.
```

</details>
