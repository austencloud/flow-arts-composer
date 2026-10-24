# Type census, 2026-10-22

Base: local `main` at `ee81e83f7a` (after the Flow Fest jam merge). Branch
`codex/type-errors-1022`. Counts are errors, not warnings.

## Results

| Gate                                                        | Before | After |
| ----------------------------------------------------------- | ------ | ----- |
| `npm run check:tsc` in this worktree (as run)               | 274    | 164   |
| plain tsc, worktree rootDirs (see below), `src/` + `tests/` | 110    | 0     |
| plain tsc, foreign (scene-3d package source)                | 11     | 11    |
| `svelte-fast-check`, worktree rootDirs                      | 272    | 110   |

### By directory, svelte-fast-check

| Directory                                                      | Before | After | What is left                           |
| -------------------------------------------------------------- | ------ | ----- | -------------------------------------- |
| `src/lib/features/flow-fest-sim`                               | 109    | 0     |                                        |
| `src/lib/shared` (sequence-viewer, 3d, debug, pictograph, ...) | 35     | 18    | tool noise only                        |
| `src/lib/features` (other)                                     | 18     | 5     | tool noise only                        |
| `src/lib/components`, `src/config`, `src/routes/(public)`      | 3      | 2     | tool noise only                        |
| `src/routes/test/**`                                           | 96     | 74    | ocean labs 71, native-export 3 (noise) |
| `@austencloud/scene-3d` package                                | 11     | 11    | not ours                               |

## Root causes

1. **Flow Fest jam domain (109).** `flow-fest-jam-layout.ts` and
   `flow-fest-jam-runtime.ts` merged with `noUncheckedIndexedAccess` errors, so
   the CI tsc gate fails on main. Fixed with in-bounds `!` reads.
2. **Word menu trigger type (26).** WordLabel and ViewerHeader derived the
   snippet argument as `Parameters<ComponentProps<typeof WordActionMenu>["trigger"]>[0]`,
   which resolved to `unknown`. WordActionMenu now exports `WordActionTrigger`.
3. **Stale Threlte augmentation (2).** `src/types/global.d.ts` redeclares
   `useThrelte()` without Threlte 8's `mainStage` and `scheduler`.
4. **Snippet cluster: already gone.** The October root cause (packages/camera-3d
   pinning an older svelte, two ambient `declare module "svelte"`) was fixed in
   wave 4. fast-check reports no Snippet diagnostics. A d1 `check:full` in a
   worktree may still show them while the primary `node_modules` holds the old
   camera-3d svelte link.

## Not code errors (measurement artifacts)

- **`./$types` in a worktree (88 + 76 knock-on implicit-any).** SvelteKit 3's
  `extends: "$app/tsconfig"` resolves through the `node_modules` junction to
  `E:/tka-platform/node_modules/$app/tsconfig.json`, whose `rootDirs` then point
  at the primary checkout, not the worktree. Every `./$types` import fails and
  each `load`/handler argument becomes implicit any. CI and d2 have real
  installs and are not affected. Reproduce the true count in a worktree with an
  untracked `tsconfig.wt-census.json`:
  `{"extends":"./tsconfig.json","compilerOptions":{"rootDirs":[".","./.svelte-kit/types"],"incremental":false}}`
  and `npx tsc --noEmit -p tsconfig.wt-census.json` /
  `npx svelte-fast-check --tsconfig ./tsconfig.wt-census.json`.
- **svelte-fast-check 0.4.5 does not follow `extends: "$app/tsconfig"`** (it
  `path.resolve`s the bare specifier), so it loses `allowImportingTsExtensions`
  and `allowJs`: 17 `ts5097` (`.ts` import extension) and 11 `ts7016` (`.mjs`
  without declarations). Plain tsc does not report them.
- **Ocean labs (71).** `ocean-character-lab` and `ocean-motion-benchmark` call
  fish APIs (`memory`, `perception`, `escapeManeuver`, ...) that the published
  `@austencloud/backgrounds` does not have. Keep or retire is Austen's call.

<details>
<summary>Raw list before: plain tsc, src/ and tests/ (110)</summary>

```
src/lib/features/create/shared/workspace-panel/sequence-display/components/PictographArrivalStage.svelte.test.ts(197,9): error TS2353: Object literal may only specify known properties, and 'container' does not exist in type 'SetupOptions<never>'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(349,48): error TS2345: Argument of type 'JamPoint | undefined' is not assignable to parameter of type 'JamPoint'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(360,7): error TS18048: 'a' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(360,21): error TS18048: 'b' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(361,15): error TS18048: 'b' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(361,21): error TS18048: 'a' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(361,35): error TS18048: 'a' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(361,44): error TS18048: 'b' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(361,50): error TS18048: 'a' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(361,57): error TS18048: 'a' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(391,25): error TS2345: Argument of type 'JamPoint | undefined' is not assignable to parameter of type 'JamPoint'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(400,14): error TS2532: Object is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(400,32): error TS2345: Argument of type 'JamPoint | undefined' is not assignable to parameter of type 'JamPoint'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(411,19): error TS18048: 'total' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(411,28): error TS18048: 'total' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(411,37): error TS18048: 'total' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(413,40): error TS2532: Object is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(416,15): error TS2532: Object is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(416,32): error TS2532: Object is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(417,18): error TS2532: Object is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(418,20): error TS2345: Argument of type 'JamPoint | undefined' is not assignable to parameter of type 'JamPoint'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(420,13): error TS18048: 'a' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(420,20): error TS18048: 'b' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(420,26): error TS18048: 'a' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(420,39): error TS18048: 'a' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(420,46): error TS18048: 'b' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(420,52): error TS18048: 'a' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(421,20): error TS18048: 'b' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(421,26): error TS18048: 'a' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(421,42): error TS18048: 'b' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(421,48): error TS18048: 'a' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(428,14): error TS2532: Object is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(428,29): error TS2532: Object is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(428,46): error TS2532: Object is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(428,61): error TS2532: Object is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(453,52): error TS2532: Object is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(478,8): error TS2532: Object is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(478,35): error TS2532: Object is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(479,9): error TS2532: Object is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(479,36): error TS2532: Object is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(480,15): error TS2532: Object is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(480,42): error TS2532: Object is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(481,15): error TS2532: Object is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(481,42): error TS2532: Object is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(503,38): error TS2345: Argument of type 'number | undefined' is not assignable to parameter of type 'number'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(508,39): error TS2345: Argument of type 'number | undefined' is not assignable to parameter of type 'number'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(511,43): error TS2345: Argument of type 'number | undefined' is not assignable to parameter of type 'number'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(559,13): error TS2532: Object is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(579,28): error TS2322: Type 'JamPoint | undefined' is not assignable to type 'JamPoint'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(579,48): error TS2322: Type 'JamPoint | undefined' is not assignable to type 'JamPoint'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(700,61): error TS2345: Argument of type '(JamPoint | undefined)[]' is not assignable to parameter of type 'JamPoint[]'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(721,7): error TS2322: Type 'JamPropFamily | undefined' is not assignable to type 'JamPropFamily'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(774,32): error TS18048: 'perimeter' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(802,20): error TS2345: Argument of type 'JamPoint | undefined' is not assignable to parameter of type 'JamPoint'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(805,7): error TS2322: Type 'number | undefined' is not assignable to type 'number'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(842,40): error TS18048: 'perimeter' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(848,18): error TS18048: 'perimeter' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(912,25): error TS18048: 'perimeter' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(1001,9): error TS18048: 'perimeter' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(1035,32): error TS2322: Type 'JamPoint | undefined' is not assignable to type 'JamPoint'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(1035,45): error TS2322: Type 'JamPoint | undefined' is not assignable to type 'JamPoint'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(1045,7): error TS2322: Type 'JamPropFamily | undefined' is not assignable to type 'JamPropFamily'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(1188,5): error TS2322: Type 'number | undefined' is not assignable to type 'number'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(1233,15): error TS2532: Object is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(1234,22): error TS2532: Object is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(1234,49): error TS2532: Object is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(1238,17): error TS18048: 'b' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(1239,25): error TS18048: 'a' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(1239,36): error TS18048: 'b' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(1239,45): error TS18048: 'a' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(1241,17): error TS18048: 'a' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(1241,29): error TS18048: 'b' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(1241,40): error TS18048: 'a' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(1242,19): error TS18048: 'a' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(1242,33): error TS18048: 'b' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(1242,46): error TS18048: 'a' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(1247,20): error TS18048: 'last' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts(1247,43): error TS18048: 'last' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(98,20): error TS18048: 'last' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(98,35): error TS18048: 'first' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(99,28): error TS18048: 'first' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(99,52): error TS18048: 'last' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(101,39): error TS18048: 'first' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(103,18): error TS18048: 'first' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(105,33): error TS2532: Object is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(108,16): error TS18048: 'b' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(108,28): error TS18048: 'a' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(109,58): error TS18048: 'a' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(113,60): error TS18048: 'before' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(113,75): error TS18048: 'a' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(113,85): error TS18048: 'b' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(113,95): error TS18048: 'after' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(116,33): error TS2532: Object is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(119,19): error TS18048: 'sb' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(119,32): error TS18048: 'sa' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(120,63): error TS18048: 'sa' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(121,29): error TS18048: 'sa' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(121,55): error TS18048: 'sb' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(121,80): error TS18048: 'sa' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(336,16): error TS18048: 'b' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(336,22): error TS18048: 'a' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(337,16): error TS18048: 'b' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(337,22): error TS18048: 'a' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(339,47): error TS18048: 'a' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(339,66): error TS18048: 'a' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(340,20): error TS18048: 'a' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(340,37): error TS18048: 'a' is possibly 'undefined'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(347,3): error TS2322: Type 'JamPoint | undefined' is not assignable to type 'JamPoint'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(423,48): error TS2345: Argument of type '(JamPoint | undefined)[]' is not assignable to parameter of type 'JamPoint[]'.
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts(469,78): error TS2345: Argument of type '(JamPoint | undefined)[]' is not assignable to parameter of type 'JamPoint[]'.
```

</details>

<details>
<summary>Raw list before: svelte-fast-check (272)</summary>

```
node_modules/@austencloud/scene-3d/src/lib/services/implementations/AvatarAnimator.ts:108:8 | Object is possibly 'undefined'. (ts2532)
node_modules/@austencloud/scene-3d/src/lib/services/implementations/AvatarAnimator.ts:3071:7 | Argument of type 'number | undefined' is not assignable to parameter of type 'number'. (ts2345)
node_modules/@austencloud/scene-3d/src/lib/services/implementations/FingerAnimator.ts:375:69 | Property 'isBone' does not exist on type 'Object3D<Object3DEventMap>'. (ts2339)
node_modules/@austencloud/scene-3d/src/lib/services/implementations/FingerAnimator.ts:1702:75 | Argument of type '"index" | "middle" | "pinky" | "ring" | "thumb"' is not assignable to parameter of type '"index" | "thumb"'. (ts2345)
node_modules/@austencloud/scene-3d/src/lib/services/implementations/FootPlanter.ts:1239:20 | Object is possibly 'undefined'. (ts2532)
node_modules/@austencloud/scene-3d/src/lib/services/implementations/FootPlanter.ts:1240:37 | Argument of type 'Quaternion | undefined' is not assignable to parameter of type 'Quaternion'. (ts2345)
node_modules/@austencloud/scene-3d/src/lib/services/implementations/FootPlanter.ts:1241:19 | Argument of type 'Quaternion | undefined' is not assignable to parameter of type 'QuaternionLike'. (ts2345)
node_modules/@austencloud/scene-3d/src/lib/services/implementations/FootPlanter.ts:1242:12 | Object is possibly 'undefined'. (ts2532)
node_modules/@austencloud/scene-3d/src/lib/services/implementations/FootPlanter.ts:1250:7 | Object is possibly 'undefined'. (ts2532)
node_modules/@austencloud/scene-3d/src/lib/services/implementations/FootPlanter.ts:1250:28 | Object is possibly 'undefined'. (ts2532)
node_modules/@austencloud/scene-3d/src/lib/services/implementations/LocomotionAnimator.ts:580:36 | Object is possibly 'undefined'. (ts2532)
src/lib/components/media/spotlight/MediaSpotlight.svelte:22:62 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/features/create/shared/components/sequence-actions/RotationDirectionView.svelte:13:49 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/features/create/shared/workspace-panel/sequence-display/components/WordLabel.svelte:360:18 | 'actions' is of type 'unknown'. (ts18046)
src/lib/features/create/shared/workspace-panel/sequence-display/components/WordLabel.svelte:361:24 | 'actions' is of type 'unknown'. (ts18046)
src/lib/features/create/shared/workspace-panel/sequence-display/components/WordLabel.svelte:362:24 | 'actions' is of type 'unknown'. (ts18046)
src/lib/features/create/shared/workspace-panel/sequence-display/components/WordLabel.svelte:363:24 | 'actions' is of type 'unknown'. (ts18046)
src/lib/features/create/shared/workspace-panel/sequence-display/components/WordLabel.svelte:364:22 | 'actions' is of type 'unknown'. (ts18046)
src/lib/features/create/shared/workspace-panel/sequence-display/components/WordLabel.svelte:365:26 | 'actions' is of type 'unknown'. (ts18046)
src/lib/features/create/shared/workspace-panel/sequence-display/components/WordLabel.svelte:366:25 | 'actions' is of type 'unknown'. (ts18046)
src/lib/features/create/shared/workspace-panel/sequence-display/components/WordLabel.svelte:369:57 | 'actions' is of type 'unknown'. (ts18046)
src/lib/features/create/shared/workspace-panel/sequence-display/components/WordLabel.svelte:371:58 | 'actions' is of type 'unknown'. (ts18046)
src/lib/features/create/shared/workspace-panel/sequence-display/components/WordLabel.svelte:375:21 | 'actions' is of type 'unknown'. (ts18046)
src/lib/features/create/shared/workspace-panel/sequence-display/components/WordLabel.svelte:429:12 | 'actions' is of type 'unknown'. (ts18046)
src/lib/features/create/shared/workspace-panel/sequence-display/components/WordLabel.svelte:431:44 | 'actions' is of type 'unknown'. (ts18046)
src/lib/shared/3d/components/CapturedComposerPose.svelte:21:30 | Property 'mainStage' does not exist on type 'ThrelteContext'. (ts2339)
src/lib/shared/3d/components/CapturedComposerPose.svelte:21:41 | Property 'scheduler' does not exist on type 'ThrelteContext'. (ts2339)
src/lib/shared/3d/components/RuntimeMotionCapture.svelte:14:52 | Could not find a declaration file for module '../../../../../unreal/Shared/Tools/capture-provenance.mjs'. 'E:/worktrees/tka-platform/type-errors/unreal/Shared/Tools/capture-provenance.mjs' implicitly has an 'any' type. (ts7016)
src/lib/shared/3d/components/RuntimeMotionCapture.svelte:15:106 | Could not find a declaration file for module '../../../../../unreal/Shared/Tools/runtime-motion-bundle.mjs'. 'E:/worktrees/tka-platform/type-errors/unreal/Shared/Tools/runtime-motion-bundle.mjs' implicitly has an 'any' type. (ts7016)
src/lib/shared/application/components/MainApplication.svelte:40:33 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/shared/debug/components/AdminToolbar.svelte:23:33 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/shared/debug/components/AdminToolbar.svelte:24:33 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/shared/foundation/ui/morph-chip/MorphChip.svelte:11:39 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/shared/foundation/ui/morph-chip/MorphChipGroup.svelte:11:39 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/shared/sequence-viewer/components/ViewerHeader.svelte:507:21 | 'actions' is of type 'unknown'. (ts18046)
src/lib/shared/sequence-viewer/components/ViewerHeader.svelte:508:18 | 'actions' is of type 'unknown'. (ts18046)
src/lib/shared/sequence-viewer/components/ViewerHeader.svelte:509:24 | 'actions' is of type 'unknown'. (ts18046)
src/lib/shared/sequence-viewer/components/ViewerHeader.svelte:510:24 | 'actions' is of type 'unknown'. (ts18046)
src/lib/shared/sequence-viewer/components/ViewerHeader.svelte:511:24 | 'actions' is of type 'unknown'. (ts18046)
src/lib/shared/sequence-viewer/components/ViewerHeader.svelte:512:22 | 'actions' is of type 'unknown'. (ts18046)
src/lib/shared/sequence-viewer/components/ViewerHeader.svelte:513:26 | 'actions' is of type 'unknown'. (ts18046)
src/lib/shared/sequence-viewer/components/ViewerHeader.svelte:514:25 | 'actions' is of type 'unknown'. (ts18046)
src/lib/shared/sequence-viewer/components/ViewerHeader.svelte:516:38 | 'actions' is of type 'unknown'. (ts18046)
src/lib/shared/sequence-viewer/components/ViewerHeader.svelte:519:21 | 'actions' is of type 'unknown'. (ts18046)
src/lib/shared/sequence-viewer/components/ViewerHeader.svelte:524:57 | 'actions' is of type 'unknown'. (ts18046)
src/lib/shared/sequence-viewer/components/ViewerHeader.svelte:549:25 | 'actions' is of type 'unknown'. (ts18046)
src/lib/shared/sequence-viewer/components/ViewerHeader.svelte:561:12 | 'actions' is of type 'unknown'. (ts18046)
src/lib/shared/sequence-viewer/components/ViewerHeader.svelte:563:51 | 'actions' is of type 'unknown'. (ts18046)
src/lib/shared/sequence-viewer/components/art-settings/TunnelColorSettings.svelte:120:28 | Element implicitly has an 'any' type because expression of type 'any' can't be used to index type 'TunnelPropColorPair'. (ts7053)
src/lib/shared/settings/components/tabs/PreferencesTab.svelte:15:33 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/routes/(public)/guide/motion-paths/_components/MotionPathExplorer.svelte:508:23 | Element implicitly has an 'any' type because expression of type 'any' can't be used to index type 'Record<MandalaPathShape, SequenceData>'. (ts7053)
src/routes/test/flow-fest-camping/+page.svelte:171:11 | 'a' is possibly 'undefined'. (ts18048)
src/routes/test/flow-fest-camping/+page.svelte:171:26 | 'b' is possibly 'undefined'. (ts18048)
src/routes/test/flow-fest-camping/+page.svelte:171:49 | 'b' is possibly 'undefined'. (ts18048)
src/routes/test/flow-fest-camping/+page.svelte:171:55 | 'a' is possibly 'undefined'. (ts18048)
src/routes/test/flow-fest-camping/+page.svelte:171:70 | 'a' is possibly 'undefined'. (ts18048)
src/routes/test/flow-fest-camping/+page.svelte:171:79 | 'b' is possibly 'undefined'. (ts18048)
src/routes/test/flow-fest-camping/+page.svelte:171:85 | 'a' is possibly 'undefined'. (ts18048)
src/routes/test/flow-fest-camping/+page.svelte:171:92 | 'a' is possibly 'undefined'. (ts18048)
src/routes/test/flow-fest-camping/+page.svelte:189:17 | Object is possibly 'undefined'. (ts2532)
src/routes/test/flow-fest-camping/+page.svelte:313:20 | Object is possibly 'undefined'. (ts2532)
src/routes/test/flow-fest-camping/+page.svelte:316:54 | Object is possibly 'undefined'. (ts2532)
src/routes/test/flow-fest-camping/+page.svelte:316:87 | Object is possibly 'undefined'. (ts2532)
src/routes/test/flow-fest-camping/+page.svelte:408:52 | 'first' is possibly 'undefined'. (ts18048)
src/routes/test/flow-fest-camping/+page.svelte:408:68 | 'first' is possibly 'undefined'. (ts18048)
src/routes/test/flow-fest-camping/+page.svelte:539:33 | Object is possibly 'undefined'. (ts2532)
src/routes/test/flow-fest-camping/+page.svelte:569:89 | 'option' is possibly 'undefined'. (ts18048)
src/routes/test/flow-fest-camping/+page.svelte:571:102 | 'option' is possibly 'undefined'. (ts18048)
src/routes/test/flow-fest-camping/+page.svelte:600:57 | 'option' is possibly 'undefined'. (ts18048)
src/routes/test/flow-fest-jam/FlowFestJamScene.svelte:518:79 | Property 'isGroup' is missing in type 'Object3D<Object3DEventMap>' but required in type 'Group<Object3DEventMap>'. (ts2741)
src/routes/test/flow-fest-native-export/+page.svelte:9:10 | Could not find a declaration file for module '../../../../unreal/Shared/Tools/capture-provenance.mjs'. 'E:/worktrees/tka-platform/type-errors/unreal/Shared/Tools/capture-provenance.mjs' implicitly has an 'any' type. (ts7016)
src/routes/test/flow-fest-native-export/+page.svelte:15:10 | Could not find a declaration file for module '../../../../unreal/Shared/Tools/runtime-motion-bundle.mjs'. 'E:/worktrees/tka-platform/type-errors/unreal/Shared/Tools/runtime-motion-bundle.mjs' implicitly has an 'any' type. (ts7016)
src/routes/test/flow-fest-native-export/+page.svelte:16:38 | Could not find a declaration file for module '../../../../unreal/Shared/Tools/native-prop-catalog.mjs'. 'E:/worktrees/tka-platform/type-errors/unreal/Shared/Tools/native-prop-catalog.mjs' implicitly has an 'any' type. (ts7016)
src/routes/test/mocap-clip/+page.svelte:166:7 | Object is possibly 'undefined'. (ts2532)
src/routes/test/mocap-clip/+page.svelte:167:7 | Object is possibly 'undefined'. (ts2532)
src/routes/test/ocean-character-lab/+page.svelte:57:5 | Module '"@austencloud/backgrounds"' has no exported member 'setOceanFishSimulationSeed'. (ts2305)
src/routes/test/ocean-character-lab/+page.svelte:190:19 | Property 'resident' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:190:39 | Property 'resident' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:190:62 | Property 'resident' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:208:32 | Property 'getSpineChain' does not exist on type 'IFishAnimator'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:215:14 | Property 'repositionFish' does not exist on type 'IFishAnimator'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:224:10 | Property 'intent' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:225:10 | Property 'intentTimer' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:226:10 | Property 'escapeManeuver' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:233:10 | Property 'resident' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:237:10 | Property 'attention' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:246:10 | Property 'perception' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:247:10 | Property 'perception' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:248:10 | Property 'perception' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:249:10 | Property 'perception' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:250:10 | Property 'perception' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:251:10 | Property 'perception' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:252:10 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:253:10 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:254:10 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:255:10 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:256:10 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:257:10 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:258:10 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:268:32 | Property 'getSpineChain' does not exist on type 'IFishAnimator'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:277:14 | Property 'repositionFish' does not exist on type 'IFishAnimator'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:293:13 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:302:55 | Property 'escapeEventCount' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:335:53 | Property 'resident' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:423:11 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:462:15 | Property 'perception' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:466:16 | Property 'perception' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:468:40 | Property 'intent' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:469:40 | Property 'intent' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:502:37 | Property 'perception' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:506:34 | Property 'perception' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:511:12 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:524:12 | Property 'escapeEventCount' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:525:12 | Property 'perception' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:529:14 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:538:37 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:557:51 | Property 'attention' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:558:39 | Property 'attention' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:566:7 | Type '"socializing"' is not assignable to type 'FishBehavior'. (ts2322)
src/routes/test/ocean-character-lab/+page.svelte:567:13 | Property 'intent' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:573:13 | Property 'attention' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:574:13 | Property 'attention' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:576:40 | Property 'attention' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:580:13 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:606:19 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:625:33 | Property 'perception' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:626:37 | Property 'perception' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:629:14 | Property 'perception' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:631:60 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:634:16 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:637:34 | Property 'escapeEventCount' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:639:16 | Property 'escapeEventCount' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:641:17 | Property 'escapeEventCount' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-motion-benchmark/+page.svelte:103:35 | Property 'escapeSwim' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-motion-benchmark/+page.svelte:107:17 | Property 'escapeSwim' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-motion-benchmark/+page.svelte:113:14 | Property 'escapeManeuver' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-motion-benchmark/+page.svelte:113:42 | Property 'escapeManeuver' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-motion-benchmark/+page.svelte:148:20 | Property 'intent' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-motion-benchmark/+page.svelte:149:30 | Property 'escapeEventCount' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-motion-benchmark/+page.svelte:150:25 | Property 'escapeManeuver' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-motion-benchmark/+page.svelte:165:29 | Property 'escapeManeuver' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-motion-benchmark/+page.svelte:165:55 | Property 'escapeSwim' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-motion-benchmark/+page.svelte:169:40 | Property 'escapeManeuver' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-motion-benchmark/+page.svelte:169:68 | Property 'escapeSwim' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-motion-benchmark/+page.svelte:197:36 | Property 'escapeManeuver' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-motion-benchmark/+page.svelte:197:63 | Property 'escapeSwim' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-scene/HarnessInspector.svelte:122:9 | Type 'number' is not assignable to type 'ToneMapping'. (ts2322)
src/config/vite-plugin-deploy-static-copy.ts:4:38 | Could not find a declaration file for module '../../scripts/deploy-asset-trim-policy.js'. 'E:/worktrees/tka-platform/type-errors/scripts/deploy-asset-trim-policy.js' implicitly has an 'any' type. (ts7016)
src/lib/features/create/shared/workspace-panel/sequence-display/components/PictographArrivalStage.svelte.test.ts:197:9 | Object literal may only specify known properties, and 'container' does not exist in type 'SetupOptions<never>'. (ts2353)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:349:48 | Argument of type 'JamPoint | undefined' is not assignable to parameter of type 'JamPoint'. (ts2345)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:360:7 | 'a' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:360:21 | 'b' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:361:15 | 'b' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:361:21 | 'a' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:361:35 | 'a' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:361:44 | 'b' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:361:50 | 'a' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:361:57 | 'a' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:391:25 | Argument of type 'JamPoint | undefined' is not assignable to parameter of type 'JamPoint'. (ts2345)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:400:14 | Object is possibly 'undefined'. (ts2532)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:400:32 | Argument of type 'JamPoint | undefined' is not assignable to parameter of type 'JamPoint'. (ts2345)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:411:19 | 'total' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:411:28 | 'total' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:411:37 | 'total' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:413:40 | Object is possibly 'undefined'. (ts2532)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:416:15 | Object is possibly 'undefined'. (ts2532)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:416:32 | Object is possibly 'undefined'. (ts2532)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:417:18 | Object is possibly 'undefined'. (ts2532)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:418:20 | Argument of type 'JamPoint | undefined' is not assignable to parameter of type 'JamPoint'. (ts2345)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:420:13 | 'a' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:420:20 | 'b' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:420:26 | 'a' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:420:39 | 'a' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:420:46 | 'b' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:420:52 | 'a' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:421:20 | 'b' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:421:26 | 'a' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:421:42 | 'b' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:421:48 | 'a' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:428:14 | Object is possibly 'undefined'. (ts2532)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:428:29 | Object is possibly 'undefined'. (ts2532)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:428:46 | Object is possibly 'undefined'. (ts2532)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:428:61 | Object is possibly 'undefined'. (ts2532)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:453:52 | Object is possibly 'undefined'. (ts2532)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:478:8 | Object is possibly 'undefined'. (ts2532)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:478:35 | Object is possibly 'undefined'. (ts2532)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:479:9 | Object is possibly 'undefined'. (ts2532)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:479:36 | Object is possibly 'undefined'. (ts2532)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:480:15 | Object is possibly 'undefined'. (ts2532)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:480:42 | Object is possibly 'undefined'. (ts2532)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:481:15 | Object is possibly 'undefined'. (ts2532)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:481:42 | Object is possibly 'undefined'. (ts2532)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:503:38 | Argument of type 'number | undefined' is not assignable to parameter of type 'number'. (ts2345)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:508:39 | Argument of type 'number | undefined' is not assignable to parameter of type 'number'. (ts2345)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:511:43 | Argument of type 'number | undefined' is not assignable to parameter of type 'number'. (ts2345)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:559:13 | Object is possibly 'undefined'. (ts2532)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:579:28 | Type 'JamPoint | undefined' is not assignable to type 'JamPoint'. (ts2322)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:579:48 | Type 'JamPoint | undefined' is not assignable to type 'JamPoint'. (ts2322)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:700:61 | Argument of type '(JamPoint | undefined)[]' is not assignable to parameter of type 'JamPoint[]'. (ts2345)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:721:7 | Type 'JamPropFamily | undefined' is not assignable to type 'JamPropFamily'. (ts2322)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:774:32 | 'perimeter' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:802:20 | Argument of type 'JamPoint | undefined' is not assignable to parameter of type 'JamPoint'. (ts2345)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:805:7 | Type 'number | undefined' is not assignable to type 'number'. (ts2322)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:842:40 | 'perimeter' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:848:18 | 'perimeter' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:912:25 | 'perimeter' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:1001:9 | 'perimeter' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:1035:32 | Type 'JamPoint | undefined' is not assignable to type 'JamPoint'. (ts2322)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:1035:45 | Type 'JamPoint | undefined' is not assignable to type 'JamPoint'. (ts2322)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:1045:7 | Type 'JamPropFamily | undefined' is not assignable to type 'JamPropFamily'. (ts2322)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:1188:5 | Type 'number | undefined' is not assignable to type 'number'. (ts2322)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:1233:15 | Object is possibly 'undefined'. (ts2532)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:1234:22 | Object is possibly 'undefined'. (ts2532)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:1234:49 | Object is possibly 'undefined'. (ts2532)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:1238:17 | 'b' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:1239:25 | 'a' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:1239:36 | 'b' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:1239:45 | 'a' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:1241:17 | 'a' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:1241:29 | 'b' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:1241:40 | 'a' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:1242:19 | 'a' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:1242:33 | 'b' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:1242:46 | 'a' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:1247:20 | 'last' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout.ts:1247:43 | 'last' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:98:20 | 'last' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:98:35 | 'first' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:99:28 | 'first' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:99:52 | 'last' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:101:39 | 'first' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:103:18 | 'first' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:105:33 | Object is possibly 'undefined'. (ts2532)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:108:16 | 'b' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:108:28 | 'a' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:109:58 | 'a' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:113:60 | 'before' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:113:75 | 'a' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:113:85 | 'b' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:113:95 | 'after' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:116:33 | Object is possibly 'undefined'. (ts2532)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:119:19 | 'sb' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:119:32 | 'sa' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:120:63 | 'sa' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:121:29 | 'sa' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:121:55 | 'sb' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:121:80 | 'sa' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:336:16 | 'b' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:336:22 | 'a' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:337:16 | 'b' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:337:22 | 'a' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:339:47 | 'a' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:339:66 | 'a' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:340:20 | 'a' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:340:37 | 'a' is possibly 'undefined'. (ts18048)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:347:3 | Type 'JamPoint | undefined' is not assignable to type 'JamPoint'. (ts2322)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:423:48 | Argument of type '(JamPoint | undefined)[]' is not assignable to parameter of type 'JamPoint[]'. (ts2345)
src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.ts:469:78 | Argument of type '(JamPoint | undefined)[]' is not assignable to parameter of type 'JamPoint[]'. (ts2345)
src/lib/features/library/services/library-save-service.ts:22:44 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/features/library/services/library-save-service.ts:32:23 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/features/library/services/library-save-service.ts:706:22 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/features/museum/services/museum-editor-placement.ts:9:37 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/shared/3d/native-capture/capture-score-time.ts:4:41 | Could not find a declaration file for module '../../../../../unreal/Shared/Tools/runtime-motion-bundle.mjs'. 'E:/worktrees/tka-platform/type-errors/unreal/Shared/Tools/runtime-motion-bundle.mjs' implicitly has an 'any' type. (ts7016)
src/lib/shared/3d/services/performance-transfer.test.ts:10:33 | Could not find a declaration file for module '../../../../../unreal/Shared/Tools/capture-provenance.mjs'. 'E:/worktrees/tka-platform/type-errors/unreal/Shared/Tools/capture-provenance.mjs' implicitly has an 'any' type. (ts7016)
src/lib/shared/3d/services/performance-transfer.ts:5:8 | Could not find a declaration file for module '../../../../../unreal/Shared/Tools/capture-provenance.mjs'. 'E:/worktrees/tka-platform/type-errors/unreal/Shared/Tools/capture-provenance.mjs' implicitly has an 'any' type. (ts7016)
src/lib/shared/3d/unreal/domain/composer-motion-cache.ts:1:33 | Could not find a declaration file for module '../../../../../../unreal/Shared/Tools/capture-provenance.mjs'. 'E:/worktrees/tka-platform/type-errors/unreal/Shared/Tools/capture-provenance.mjs' implicitly has an 'any' type. (ts7016)
src/lib/shared/3d/unreal/domain/native-prop-selection.ts:2:36 | Could not find a declaration file for module '../../../../../../unreal/Shared/Tools/native-prop-catalog.mjs'. 'E:/worktrees/tka-platform/type-errors/unreal/Shared/Tools/native-prop-catalog.mjs' implicitly has an 'any' type. (ts7016)
src/lib/shared/pictograph/arrow/positioning/calculation/config/dash-rotation-maps.ts:1:30 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/shared/pictograph/arrow/positioning/calculation/config/float-rotation-maps.ts:1:30 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/shared/pictograph/arrow/positioning/calculation/config/handpath-direction-maps.ts:1:30 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/shared/pictograph/arrow/positioning/calculation/config/pro-anti-rotation-maps.ts:1:30 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/shared/pictograph/arrow/positioning/calculation/config/static-rotation-maps.ts:1:30 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
```

</details>

<details>
<summary>Raw list after: svelte-fast-check (110)</summary>

```
node_modules/@austencloud/scene-3d/src/lib/services/implementations/AvatarAnimator.ts:108:8 | Object is possibly 'undefined'. (ts2532)
node_modules/@austencloud/scene-3d/src/lib/services/implementations/AvatarAnimator.ts:3071:7 | Argument of type 'number | undefined' is not assignable to parameter of type 'number'. (ts2345)
node_modules/@austencloud/scene-3d/src/lib/services/implementations/FingerAnimator.ts:375:69 | Property 'isBone' does not exist on type 'Object3D<Object3DEventMap>'. (ts2339)
node_modules/@austencloud/scene-3d/src/lib/services/implementations/FingerAnimator.ts:1702:75 | Argument of type '"index" | "middle" | "pinky" | "ring" | "thumb"' is not assignable to parameter of type '"index" | "thumb"'. (ts2345)
node_modules/@austencloud/scene-3d/src/lib/services/implementations/FootPlanter.ts:1239:20 | Object is possibly 'undefined'. (ts2532)
node_modules/@austencloud/scene-3d/src/lib/services/implementations/FootPlanter.ts:1240:37 | Argument of type 'Quaternion | undefined' is not assignable to parameter of type 'Quaternion'. (ts2345)
node_modules/@austencloud/scene-3d/src/lib/services/implementations/FootPlanter.ts:1241:19 | Argument of type 'Quaternion | undefined' is not assignable to parameter of type 'QuaternionLike'. (ts2345)
node_modules/@austencloud/scene-3d/src/lib/services/implementations/FootPlanter.ts:1242:12 | Object is possibly 'undefined'. (ts2532)
node_modules/@austencloud/scene-3d/src/lib/services/implementations/FootPlanter.ts:1250:7 | Object is possibly 'undefined'. (ts2532)
node_modules/@austencloud/scene-3d/src/lib/services/implementations/FootPlanter.ts:1250:28 | Object is possibly 'undefined'. (ts2532)
node_modules/@austencloud/scene-3d/src/lib/services/implementations/LocomotionAnimator.ts:580:36 | Object is possibly 'undefined'. (ts2532)
src/lib/components/media/spotlight/MediaSpotlight.svelte:22:62 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/features/create/shared/components/sequence-actions/RotationDirectionView.svelte:13:49 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/shared/3d/components/RuntimeMotionCapture.svelte:14:52 | Could not find a declaration file for module '../../../../../unreal/Shared/Tools/capture-provenance.mjs'. 'E:/worktrees/tka-platform/type-errors/unreal/Shared/Tools/capture-provenance.mjs' implicitly has an 'any' type. (ts7016)
src/lib/shared/3d/components/RuntimeMotionCapture.svelte:15:106 | Could not find a declaration file for module '../../../../../unreal/Shared/Tools/runtime-motion-bundle.mjs'. 'E:/worktrees/tka-platform/type-errors/unreal/Shared/Tools/runtime-motion-bundle.mjs' implicitly has an 'any' type. (ts7016)
src/lib/shared/application/components/MainApplication.svelte:40:33 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/shared/debug/components/AdminToolbar.svelte:23:33 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/shared/debug/components/AdminToolbar.svelte:24:33 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/shared/foundation/ui/morph-chip/MorphChip.svelte:11:39 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/shared/foundation/ui/morph-chip/MorphChipGroup.svelte:11:39 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/shared/settings/components/tabs/PreferencesTab.svelte:15:33 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/routes/test/flow-fest-native-export/+page.svelte:9:10 | Could not find a declaration file for module '../../../../unreal/Shared/Tools/capture-provenance.mjs'. 'E:/worktrees/tka-platform/type-errors/unreal/Shared/Tools/capture-provenance.mjs' implicitly has an 'any' type. (ts7016)
src/routes/test/flow-fest-native-export/+page.svelte:15:10 | Could not find a declaration file for module '../../../../unreal/Shared/Tools/runtime-motion-bundle.mjs'. 'E:/worktrees/tka-platform/type-errors/unreal/Shared/Tools/runtime-motion-bundle.mjs' implicitly has an 'any' type. (ts7016)
src/routes/test/flow-fest-native-export/+page.svelte:16:38 | Could not find a declaration file for module '../../../../unreal/Shared/Tools/native-prop-catalog.mjs'. 'E:/worktrees/tka-platform/type-errors/unreal/Shared/Tools/native-prop-catalog.mjs' implicitly has an 'any' type. (ts7016)
src/routes/test/ocean-character-lab/+page.svelte:57:5 | Module '"@austencloud/backgrounds"' has no exported member 'setOceanFishSimulationSeed'. (ts2305)
src/routes/test/ocean-character-lab/+page.svelte:190:19 | Property 'resident' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:190:39 | Property 'resident' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:190:62 | Property 'resident' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:208:32 | Property 'getSpineChain' does not exist on type 'IFishAnimator'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:215:14 | Property 'repositionFish' does not exist on type 'IFishAnimator'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:224:10 | Property 'intent' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:225:10 | Property 'intentTimer' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:226:10 | Property 'escapeManeuver' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:233:10 | Property 'resident' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:237:10 | Property 'attention' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:246:10 | Property 'perception' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:247:10 | Property 'perception' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:248:10 | Property 'perception' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:249:10 | Property 'perception' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:250:10 | Property 'perception' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:251:10 | Property 'perception' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:252:10 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:253:10 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:254:10 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:255:10 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:256:10 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:257:10 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:258:10 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:268:32 | Property 'getSpineChain' does not exist on type 'IFishAnimator'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:277:14 | Property 'repositionFish' does not exist on type 'IFishAnimator'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:293:13 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:302:55 | Property 'escapeEventCount' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:335:53 | Property 'resident' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:423:11 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:462:15 | Property 'perception' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:466:16 | Property 'perception' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:468:40 | Property 'intent' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:469:40 | Property 'intent' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:502:37 | Property 'perception' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:506:34 | Property 'perception' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:511:12 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:524:12 | Property 'escapeEventCount' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:525:12 | Property 'perception' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:529:14 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:538:37 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:557:51 | Property 'attention' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:558:39 | Property 'attention' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:566:7 | Type '"socializing"' is not assignable to type 'FishBehavior'. (ts2322)
src/routes/test/ocean-character-lab/+page.svelte:567:13 | Property 'intent' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:573:13 | Property 'attention' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:574:13 | Property 'attention' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:576:40 | Property 'attention' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:580:13 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:606:19 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:625:33 | Property 'perception' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:626:37 | Property 'perception' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:629:14 | Property 'perception' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:631:60 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:634:16 | Property 'memory' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:637:34 | Property 'escapeEventCount' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:639:16 | Property 'escapeEventCount' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-character-lab/+page.svelte:641:17 | Property 'escapeEventCount' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-motion-benchmark/+page.svelte:103:35 | Property 'escapeSwim' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-motion-benchmark/+page.svelte:107:17 | Property 'escapeSwim' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-motion-benchmark/+page.svelte:113:14 | Property 'escapeManeuver' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-motion-benchmark/+page.svelte:113:42 | Property 'escapeManeuver' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-motion-benchmark/+page.svelte:148:20 | Property 'intent' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-motion-benchmark/+page.svelte:149:30 | Property 'escapeEventCount' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-motion-benchmark/+page.svelte:150:25 | Property 'escapeManeuver' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-motion-benchmark/+page.svelte:165:29 | Property 'escapeManeuver' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-motion-benchmark/+page.svelte:165:55 | Property 'escapeSwim' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-motion-benchmark/+page.svelte:169:40 | Property 'escapeManeuver' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-motion-benchmark/+page.svelte:169:68 | Property 'escapeSwim' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-motion-benchmark/+page.svelte:197:36 | Property 'escapeManeuver' does not exist on type 'FishMarineLife'. (ts2339)
src/routes/test/ocean-motion-benchmark/+page.svelte:197:63 | Property 'escapeSwim' does not exist on type 'FishMarineLife'. (ts2339)
src/config/vite-plugin-deploy-static-copy.ts:4:38 | Could not find a declaration file for module '../../scripts/deploy-asset-trim-policy.js'. 'E:/worktrees/tka-platform/type-errors/scripts/deploy-asset-trim-policy.js' implicitly has an 'any' type. (ts7016)
src/lib/features/library/services/library-save-service.ts:22:44 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/features/library/services/library-save-service.ts:32:23 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/features/library/services/library-save-service.ts:706:22 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/features/museum/services/museum-editor-placement.ts:9:37 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/shared/3d/native-capture/capture-score-time.ts:4:41 | Could not find a declaration file for module '../../../../../unreal/Shared/Tools/runtime-motion-bundle.mjs'. 'E:/worktrees/tka-platform/type-errors/unreal/Shared/Tools/runtime-motion-bundle.mjs' implicitly has an 'any' type. (ts7016)
src/lib/shared/3d/services/performance-transfer.test.ts:10:33 | Could not find a declaration file for module '../../../../../unreal/Shared/Tools/capture-provenance.mjs'. 'E:/worktrees/tka-platform/type-errors/unreal/Shared/Tools/capture-provenance.mjs' implicitly has an 'any' type. (ts7016)
src/lib/shared/3d/services/performance-transfer.ts:5:8 | Could not find a declaration file for module '../../../../../unreal/Shared/Tools/capture-provenance.mjs'. 'E:/worktrees/tka-platform/type-errors/unreal/Shared/Tools/capture-provenance.mjs' implicitly has an 'any' type. (ts7016)
src/lib/shared/3d/unreal/domain/composer-motion-cache.ts:1:33 | Could not find a declaration file for module '../../../../../../unreal/Shared/Tools/capture-provenance.mjs'. 'E:/worktrees/tka-platform/type-errors/unreal/Shared/Tools/capture-provenance.mjs' implicitly has an 'any' type. (ts7016)
src/lib/shared/3d/unreal/domain/native-prop-selection.ts:2:36 | Could not find a declaration file for module '../../../../../../unreal/Shared/Tools/native-prop-catalog.mjs'. 'E:/worktrees/tka-platform/type-errors/unreal/Shared/Tools/native-prop-catalog.mjs' implicitly has an 'any' type. (ts7016)
src/lib/shared/pictograph/arrow/positioning/calculation/config/dash-rotation-maps.ts:1:30 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/shared/pictograph/arrow/positioning/calculation/config/float-rotation-maps.ts:1:30 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/shared/pictograph/arrow/positioning/calculation/config/handpath-direction-maps.ts:1:30 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/shared/pictograph/arrow/positioning/calculation/config/pro-anti-rotation-maps.ts:1:30 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
src/lib/shared/pictograph/arrow/positioning/calculation/config/static-rotation-maps.ts:1:30 | An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled. (ts5097)
```

</details>
