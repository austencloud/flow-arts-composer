# W5 app type-error lane

Date: 2026-10-18. Branch: `codex/swarm-types-w5-app`.
Starting commit: `2841631dcff0139d4bb8fc80cfc7a12dc34a4ac3`.

**Status: partial.** Source changes address 22 listed diagnostics. Seven Google
Maps diagnostics remain because their root declaration is outside this lane's
owned paths. These counts are source-based inferences, not a fresh type-check
result: no TypeScript or Svelte type checker ran. The coordinator must confirm
the counts with its full check. Focused unit tests passed (106 tests); browser
test discovery was blocked by a local listen error.

## File accounting

The fixed column means the listed expression/import/contract was corrected by
source inspection. Original line numbers are from the brief.

| File                                                                 | Errors listed |  Fixed |  Left | Note                                                                                                                 |
| -------------------------------------------------------------------- | ------------: | -----: | ----: | -------------------------------------------------------------------------------------------------------------------- |
| `src/lib/shared/settings/components/tabs/prop-type/PropGrid.svelte`  |             1 |      1 |     0 | Explicitly narrow `railCredit.sourceUrl` before rendering LinkChip; credits without URLs stay plain text.            |
| `src/lib/shared/3d/services/performance-transfer.ts`                 |             1 |      1 |     0 | Explicitly require an origin before decoding its source.                                                             |
| `src/lib/shared/3d/components/controls/SceneControlInspector.svelte` |             2 |      2 |     0 | Initialize icons before the derived expression that references them.                                                 |
| `src/lib/shared/3d/effects/petals/PetalEmitter3D.svelte`             |             2 |      2 |     0 | Compose the current falling-plate physics instead of reading removed sway parameters.                                |
| `src/lib/shared/3d/effects/petals/PetalAmbientShower3D.svelte`       |             2 |      2 |     0 | Same flight adapter as the tip emitter.                                                                              |
| `src/lib/shared/3d/components/Viewer3DScene.svelte`                  |             2 |      2 |     0 | PerformerLayerGroup scopes Threlte's `defaultLayers` context to each protected subtree.                              |
| `src/lib/shared/share/components/LiveExportCard.svelte`              |             1 |      1 |     0 | Remove the unconsumed ChoreoCard revision prop; keep LiveExportCard's own revision/readiness logic.                  |
| `src/lib/shared/3d/services/performance-transfer.test.ts`            |             1 |      1 |     0 | Contextual SequenceData array plus the actual `PropType.CLUB` enum instead of the invalid string `clubs`.            |
| `src/lib/shared/foundation/ui/Drawer.svelte.test.ts`                 |             3 |      3 |     0 | Typed close-event mocks and optional access to the first call; existing call-count assertions still require a close. |
| `src/lib/shared/navigation/components/TabOverflowSelector.svelte`    |             1 |      1 |     0 | Annotate the group filter's section parameter with the existing Section type.                                        |
| `src/routes/(public)/composer/_sections/ConstructSection.svelte`     |             1 |      1 |     0 | Replace unsupported player props with host-owned pause/resume through its existing controller callback.              |
| `src/lib/features/community/components/GlobalUserMap.svelte`         |             7 |      0 |     7 | Untouched: missing members originate in `src/types/global.d.ts`, outside ownership.                                  |
| `src/lib/shared/pictograph/prop/components/PropChoiceRow.svelte`     |             2 |      2 |     0 | Keep the module-script PropType import; instance code shares that scope.                                             |
| `src/routes/(public)/guide/_components/GuideCompanionHost.svelte`    |             1 |      1 |     0 | Remove the unconsumed `isCodexMode` prop; fix the touched rune-module import to `.svelte.js`.                        |
| `src/routes/(public)/notation/props/BuugengChirality.svelte`         |             2 |      2 |     0 | Resolve the existing buugeng-pair owner with a `.js` import; callback inference follows.                             |
| **Total**                                                            |        **29** | **22** | **7** | Pending coordinator type-check confirmation.                                                                         |

Additional owned files:

- `src/lib/shared/3d/components/PerformerLayerGroup.svelte`: component composition,
  no additional Three.js object or DOM wrapper.
- `src/lib/shared/3d/effects/petals/petal-fallback-flight.ts`: shared adapter to
  `petal-aero.ts` and `petal-airflow.ts`.
- `src/lib/shared/3d/effects/petals/petal-fallback-flight.test.ts`: finite flight,
  carried velocity, normalized orientation, and zero-time regression checks.

## RUNTIME DEFECTS

1. **Inference from source:** fallback petals multiply and pass undefined
   `swayFrequency`/`swayBaseSpeed` values into sine/cosine and position updates.
   That produces NaN coordinates whenever the unpooled fallback runs. Commit
   `2fee58f089` deliberately removed these parameters from both the resolver and
   type for the new plate physics; restoring the fields would undo that intent.
   Both fallback components now compose `createPetalBody`, `resolvePetalShape`,
   `samplePetalAirflow3D`, and `stepPetalBody`, and render their quaternions.
   Emission, size, palette, fade, lifetime and ember policies remain at their
   existing component owners. The new two-test suite passed.
2. **Inference from source:** Construct passed host playback-permission props
   to AnimationPlayer, which does not read those props. History search identifies
   `5bf02781c1` as the caller change that added them. Construct now uses the
   controller already exposed for seeking to pause an inactive section and
   resume only playback the host paused. A manually paused player remains
   paused; changing controller identity clears the resume intent. This is UI
   effect wiring; browser execution was not established because the browser
   harness failed before discovery. No player prop was restored.

No observed browser crash is claimed for SceneControlInspector: its initialization
order was corrected, but no browser execution was available to establish whether
Svelte's derived evaluation actually exposed a temporal-dead-zone failure.

## ROOT CAUSES

- **Observation:** `git log -5 -- <file>` was read for all 15 listed files before
  editing. Relevant newest intent includes `2fee58f089` (petal physics),
  `e60fa92bd6` (scene rail), `fc36ca9d3e` (live export contracts),
  `36b457fff2` (Flow DNA fan credit), and `b888310e06` (inline prop tiles).
- **Observation:** `rg` locates PropType at
  `src/lib/shared/pictograph/prop/domain/enums/prop-type.ts`; PropChoiceRow imported
  it twice across module/instance scripts. The shared module import remains.
- **Observation:** `BUUGENG_PAIRS`, BuugengPair and BuugengPairId are owned by
  `src/lib/shared/settings/components/tabs/prop-type/buugeng-pair.ts`.
  BuugengChirality's extensionless `#lib` import did not resolve under the listed
  checker contract. The `.js` specifier points at that existing owner.
- **Observation:** ChoreoCard's Props and destructuring contain no `revision`;
  LiveExportCard uses revision itself to reannounce settled layouts. Removing
  only the ignored child prop preserves that logic.
- **Observation:** GuideCompanion's Props and destructuring contain no
  `isCodexMode`; its caller passed false. The prop was removed from the caller.
- **Observation:** installed `@threlte/extras/dist/layers/index.d.ts` supports
  `layers({ defaultLayers: ThrelteLayers })`, including multiple layers. Its
  plugin applies inherited layers to Object3D descendants. The core T props
  instead infer `layers` from Three.js `Layers.set(layer: number)`, producing
  `number | [layer: number]` for a direct prop. PerformerLayerGroup uses the
  supported context API and preserves both base (0) and protected (7) layers;
  it does not replace the mask with one layer or cast an array.
- **Observation:** Drawer errors come from `noUncheckedIndexedAccess` on mock
  call arrays. Typed event mocks plus optional first-call access preserve the
  existing positive call-count and reason assertions.

## LEFT

**Seven GlobalUserMap errors, original lines 148, 185, 190, 192, 196, 197, 202.**

Observations:

- `src/types/global.d.ts:52` declares the hand-maintained `google.maps` namespace.
  Its Map class only has constructor, panTo and setZoom. MapOptions omits
  cameraControl and keyboardShortcuts. LatLngBounds and event are undeclared.
- `tsconfig.json` explicitly includes `src/**/*.d.ts`; its `types` list is
  `['$app/types', 'vite/client', 'web-bluetooth']`.
- `package.json:351-352` already depends on `@googlemaps/js-api-loader` and
  `@googlemaps/markerclusterer`, with no direct `@types/google.maps` dependency.
  `pnpm-lock.yaml:10905-10907` records the loader's transitive
  `@types/google.maps: 3.65.2`. The installed loader declaration references the
  namespace but does not itself import those global type declarations.
- `src/types/global.d.ts:106-109` explicitly documents the decision to keep the
  local declarations rather than install the complete Google namespace.
- `src/app.d.ts` and `src/lib/shared/types/vendor-prefixed.d.ts` also declare
  `Window.google` for Google identity/accounts; neither supplies map members.

**Proposal for the declaration owner (not applied):** extend the existing
`src/types/global.d.ts` namespace with the members GlobalUserMap already calls.
The minimal additional declarations are:

```ts
// Add to google.maps.Map:
setCenter(latLng: LatLngLiteral): void;
getZoom(): number | undefined;
fitBounds(bounds: LatLngBounds, padding?: number): void;

// Add to google.maps.MapOptions:
cameraControl?: boolean;
keyboardShortcuts?: boolean;

// Add within google.maps:
class LatLngBounds {
  constructor();
  extend(point: LatLngLiteral): LatLngBounds;
}
interface MapsEventListener {
  remove(): void;
}
namespace event {
  function addListenerOnce(
    instance: Map,
    eventName: string,
    handler: () => void
  ): MapsEventListener;
}
```

These are a proposal for the subset this component uses, not a replacement for
the full upstream API. Do not hide the missing members with casts, local fake
constructors, or removed map behavior. The source of truth is outside the owned
paths, so GlobalUserMap was left untouched.

## PACKAGE PROPOSALS

None. No workspace package changes or dependency installs are needed for the
minimal declaration proposal above. No `packages/**` files were edited.

## TESTS RUN

### Passing focused unit tests

```powershell
npx vitest run --config tests/config/vitest.config.ts src/lib/shared/3d/services/performance-transfer.test.ts src/lib/shared/3d/effects/petals/petal-fallback-flight.test.ts
```

Exit 0: `Test Files  2 passed (2)`; `Tests  8 passed (8)`.

```powershell
npx vitest run --config tests/config/vitest.config.ts tests/unit/3d-viewer/performer-light-pool.test.ts tests/unit/3d-viewer/viewer3d-effects-slot-contract.test.ts tests/unit/3d-viewer/viewer3d-integration-observer.test.ts tests/unit/effects/scene-effects-batching-contract.test.ts tests/unit/guide-reflow-contract.test.ts tests/unit/guide-level-2-topic-pages-ssr-guards.test.ts tests/unit/landing-route-morph.test.ts tests/unit/composer/composer-gallery-firebase.test.ts tests/unit/prop-chirality-picker-contract.test.ts
```

Exit 0: `Test Files  9 passed (9)`; `Tests  98 passed (98)`.

### Blocked browser checks

```powershell
npx vitest run --config tests/config/vitest.components.config.ts src/lib/shared/foundation/ui/Drawer.svelte.test.ts src/lib/shared/settings/components/tabs/prop-type/PropGrid.svelte.test.ts src/lib/shared/settings/components/tabs/prop-type/PropGridFamilyTile.svelte.test.ts --no-file-parallelism
```

Exit 1: `Error: listen EACCES: permission denied ::1:63315`;
`Test Files  no tests`; `Tests  no tests`; `Errors  1 error`.

Retry of the same command with
`--browser.api.host=127.0.0.1 --browser.api.port=5317 --browser.api.strictPort`
also exited 1 and reported the same `::1:63315` error. The override did not move
the failing listener. The initial run and retry also reported a 10-second close
timeout and then exited; no task preview was started or retained.

```powershell
npx vitest run --config tests/config/vitest.card-mcp-parity.config.ts tests/render-parity/live-card-qr-readiness.test.ts --browser.api.host=127.0.0.1 --browser.api.port=5317 --api.host=127.0.0.1 --api.port=5318
```

Exit 1: main API reported `API started at http://127.0.0.1:5318/`, but browser
setup still failed with `listen EACCES: permission denied ::1:63315`;
`Test Files  no tests`; `Tests  no tests`; `Errors  1 error`.

### Formatting, lint and compilation

The changed-file set before commits was constructed as:

```powershell
$owned = @(git diff --name-only -- '*.ts' '*.svelte')
$owned += @('src/lib/shared/3d/components/PerformerLayerGroup.svelte','src/lib/shared/3d/effects/petals/petal-fallback-flight.ts','src/lib/shared/3d/effects/petals/petal-fallback-flight.test.ts')
npx prettier --write $owned
npx eslint $owned
npx prettier --check $owned
```

- ESLint exit 0: `12 problems (0 errors, 12 warnings)`. All 12 warnings say
  `File ignored because of a matching ignore pattern` for `.svelte` files;
  `eslint.config.js:17` globally ignores `**/*.svelte`. The five changed
  TypeScript/test files produced no diagnostics. This does not claim Svelte
  lint coverage.
- Prettier exit 0: `All matched files use Prettier code style!` (17 files).
  Existing formatting in touched files was normalized where required.
- `git diff --check`: exit 0, no output.
- Svelte compiler validation, exit 0: `Svelte compile passed: 12 components`.
  Exact command (parse/rune validation, no type checker and no emitted files):

```powershell
node --input-type=module -e 'import {readFileSync} from "node:fs"; import {execFileSync} from "node:child_process"; import {compile} from "svelte/compiler"; const paths=execFileSync("git",["diff","--name-only","--","*.svelte"],{encoding:"utf8"}).trim().split("\n").filter(Boolean); paths.push("src/lib/shared/3d/components/PerformerLayerGroup.svelte"); for (const filename of paths) compile(readFileSync(filename,"utf8"),{filename,generate:false}); console.log(`Svelte compile passed: ${paths.length} components`);'
```

The compiler command ran before commits while those 11 edited components were
in the working diff; the new layer component was explicitly appended.

## Commits

- `5c6c2e5a73` — fix(types): w5-app 3d (10 errors)
- `46470f49ac` — fix(types): w5-app foundation (3 errors)
- `298619cfd1` — fix(types): w5-app navigation (1 error)
- `fee0f6a421` — fix(types): w5-app pictograph (2 errors)
- `40d24d4eea` — fix(types): w5-app settings (1 error)
- `ac1a086b2a` — fix(types): w5-app share (1 error)
- `9fd828fd28` — fix(types): w5-app composer (1 error)
- `70e56fbe34` — fix(types): w5-app guide (1 error)
- `17a76b4a30` — fix(types): w5-app notation (2 errors)

No integration, push, install, dev server, full check or build was performed.
The existing assigned worktree was retained for the coordinator. The final
ledger commit is intentionally not self-referenced here.
