# Pictograph SVG asset and loader contract audit

Read-only audit of the pictograph SVG corpus and the loaders that consume it.
No runtime module and no SVG asset was modified.

|             |                                                            |
| ----------- | ---------------------------------------------------------- |
| Date        | 2026-09-13                                                 |
| Base commit | `6e4c1b5a388625d9c95f92e9a717f8ca2ab77f20` (`origin/main`) |
| Branch      | `claude/svg-asset-contract-audit-p7ta75`                   |
| Commits     | `4a00b626` (tests), then this report as the branch head    |
| Owned paths | `tests/unit/opus-svg-audit/`, this report                  |
| Corpus      | 497 `.svg` files under `static/`, read at the base commit  |

## How to reproduce

```sh
npm run build:packages   # workspace packages must be built first
npx vitest run --config tests/config/vitest.config.ts tests/unit/opus-svg-audit/
```

47 tests, all passing. Three of them are `it.fails` cases: they record a
defect that exists today and turn red when it is fixed, which is the same
convention `src/lib/shared/render/core/__tests__/prop-placement.test.ts`
already uses in this repository.

## What was checked

Every check runs against the real files under `static/` and calls the shipped
functions rather than reimplementing them.

| Area                                  | Instrument                                                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| XML well-formedness                   | jsdom `DOMParser` with `image/svg+xml`, plus a self-check that it actually reports malformed input               |
| Root element and namespaces           | root `<svg>` tag scan, `xmlns` and `xmlns:xlink`                                                                 |
| viewBox validity and extent           | four-number parse, positive width and height, origin at `0 0`                                                    |
| Duplicate ids and fragment references | per-file id census with XML comments stripped                                                                    |
| Path data                             | `isValidPath` from `svg-path-commander` over every `d` attribute                                                 |
| Asset resolution coverage             | `resolveFullArrowAssetPath` (`@tka/render-core`), `HALF_ASSET_TURNS`, `PropType`, compared against files on disk |
| Color-transform fragment survival     | the real `applyMotionColorToSvg` with the options `PropSvgLoader` passes                                         |
| Bitmap sanitizer                      | the real `sanitizeSvgForBitmap` over synthetic edge cases and the whole corpus                                   |

## Corpus health

These passed across all 497 files and are now guarded by
`tests/unit/opus-svg-audit/svg-corpus-contract.test.ts`.

- Every file parses as well-formed XML and has an `<svg>` root in the SVG
  namespace. Every file using an `xlink:` attribute declares the namespace.
- No file repeats an id. Across the 105 arrow assets, no id is shared between
  two files either, so inlining two arrows into one pictograph cannot produce
  an ambiguous reference.
- Every `d` attribute parses. No empty, `NaN`, or truncated path data.
- No `<script>` element and no reference to an external resource anywhere in
  the corpus.
- All 7 grid assets are authored on `0 0 950 950`, the pictograph coordinate
  system.
- All 105 arrow assets and all 54 `props/pictograph/` assets place their
  viewBox origin at `0 0`, which is what `parseArrowSvg` and `parsePropSvg`
  assume when they rebuild the box and derive the rotation anchor.
- Exactly four files carry `width="0"`: the two zero-turn static arrows,
  `arrows/still.svg`, and `images/blank.svg`. That is intentional.
  `extractSvgContent` in `arrow-svg-parser.ts` returns `""` for markup
  containing `width="0"`, which is how a zero-turn static arrow draws no glyph.
  The test pins the set to those four so a fifth cannot join it silently.
- `id="centerPoint"` appears in 10 files, all of them halved-motion glyphs, and
  in every case as `<circle ... fill="none"/>`. Both color transformers delete
  it with a `<circle>`-specific regex, so no other element type may carry it.

## Findings

### F1: The prop color transform breaks every `<use>` reference in torch artwork

Confirmed, measured.

`PropSvgLoader.applyColorToSvg` calls `applyMotionColorToSvg` with
`makeClassNamesUnique: true` for every non-fan prop
(`src/lib/shared/pictograph/prop/services/prop-svg-loader.ts:335`). That option
rewrites `id="X"` to `id="X-left"` and `url(#X)` to `url(#X-left)`
(`packages/render-core/src/svg-color.ts:211`), so two props inlined into one
pictograph document cannot collide. It does not rewrite `xlink:href="#X"`.

Four files the loader fetches use `<use>`:

| Asset                                         | `<use>` targets lost |
| --------------------------------------------- | -------------------- |
| `static/images/props/pictograph/torch.svg`    | 3 of 3               |
| `static/images/props/pictograph/bigtorch.svg` | 2 of 2               |
| `static/images/props/animated/torch.svg`      | 3 of 3               |
| `static/images/props/animated/bigtorch.svg`   | 2 of 2               |

All four are internally consistent as authored: zero dangling `<use>` before
the transform, every target dangling after it. Measured by
`tests/unit/opus-svg-audit/prop-color-transform-fragments.test.ts`.

The consequence is two-part. A `<use>` with no target draws nothing, and a
`<clipPath>` whose only child is such a `<use>` has no geometry, so SVG clips
its subject away completely rather than leaving it unclipped. In
`props/pictograph/torch.svg` three clip paths are emptied this way and two of
them are still referenced by a group; each of those groups holds roughly thirty
`<line>` elements of shaft shading. `bigtorch` loses two referenced clip paths
on the same pattern.

Impact, stated conservatively:

- On the default pictograph path the shaft body survives, because
  `applyTorchContrastPalette` makes the `data-torch-shaft` path visible and
  that path duplicates the same geometry the `<use>` drew. What is lost is the
  clipped interior shading, on every surface that goes through this loader:
  the live DOM, the composition worker raster, image export and print.
- Under `useGridVersion: true` the contrast palette is skipped
  (`prop-svg-loader.ts:176`) and the `animated/` artwork is used, so the
  authored shaft body is lost as well. Reachable from
  `HandPathBuilderLab.svelte`, `assemble-lab/components/InteractiveGrid.svelte`
  and `/test/positions-concept`.
- The animation canvas is not affected. `svg-generator.ts:485` calls
  `applyColorToSvg` without `makeClassNamesUnique`, so `<use>` survives there.

Not visually confirmed in a browser: this cloud session has no display and no
dev server, and the repository rules reserve port 5173 for Austen. The claim
above is a structural one about the transformed markup, measured from the real
transform's output, not an observation of rendered pixels.

Two directions a fix could take, neither applied here (prop appearance is
outside this audit's edit scope): teach the `makeClassNamesUnique` branch to
rewrite `href`/`xlink:href` fragments alongside `url(#…)`, or flatten the
`<use>` elements out of the four assets during an art pass.

### F2: Four zero-turn skew arrow slots resolve to art that does not exist

Confirmed.

`resolveFullArrowAssetPath` appends `_skew+` or `_skew-` for any pro or anti
motion with `skewSteps > 0` and a direction, at every turns value except 0.25.
Walking the resolver's full input domain (4 motion types x 16 orientations x
8 turns values x 3 skew states) produces 92 distinct non-skew paths, all of
which exist, and 56 distinct skew paths, of which 4 exist:

```
static/images/arrows/anti/from_nonradial/anti_0.0_skew+.svg
static/images/arrows/anti/from_radial/anti_0.0_skew-.svg
static/images/arrows/pro/from_radial/pro_0.0_skew+.svg
static/images/arrows/pro/from_radial/pro_0.0_skew-.svg
```

At zero turns the art set is asymmetric. These four resolve to nothing:

```
/images/arrows/anti/from_nonradial/anti_0.0_skew-.svg
/images/arrows/anti/from_radial/anti_0.0_skew+.svg
/images/arrows/pro/from_nonradial/pro_0.0_skew+.svg
/images/arrows/pro/from_nonradial/pro_0.0_skew-.svg
```

`ArrowSvgLoader.fetchSvgContent` throws on the 404 and the arrow is dropped
from the pictograph. Nothing surfaces to the user.

The remaining 48 missing paths are skew variants above zero turns. No shipped
sequence data carries a skewed motion with turns, so that half is recorded as
latent rather than live; the zero-turn half is reachable now.

### F3: Two prop types have no artwork in `props/animated/`

Confirmed.

`capsule_baton` and `fire_double_staff` are in `PropType` and have
`props/pictograph/` artwork, but no `props/animated/` file. Three call sites
build that path from an arbitrary prop type:

- `src/lib/shared/3d/components/PropPlane2D.svelte:38`
- `src/lib/shared/qr-video/services/worker-asset-loader.ts:14`
- `src/lib/shared/pictograph/prop/services/prop-svg-loader.ts:125` under
  `useGridVersion`

Each rejects on the missing file. The main animation canvas is not affected:
`resolvePropSvgPath` sends only `torch`, `bigtorch`, `triquetra2` and the
`sword-*` builds to `animated/`, and all of those exist.

### F4: The arrow loader bypasses the timeout-guarded asset fetcher

Confirmed by inspection.

`src/lib/shared/net/asset-fetch.ts` exists specifically to stop a freeze:
without a timeout, a stalled asset request holds its socket open indefinitely,
and enough wedged sockets leave the tab on "Loading…" until a new tab is
opened. Its own header documents this.

`PropSvgLoader`, the letter loader in `svg-asset-loader.ts` and
`SvgImageCache` route through `assetFetch`. The arrow path does not. Bare
`fetch` call sites in the pictograph render path:

| File                                                                     | Line                         | Asset                       |
| ------------------------------------------------------------------------ | ---------------------------- | --------------------------- |
| `src/lib/shared/pictograph/arrow/rendering/services/arrow-svg-loader.ts` | 246                          | every arrow SVG             |
| `src/lib/shared/pictograph/arrow/rendering/services/arrow-svg-loader.ts` | 68                           | `arrow-split-manifest.json` |
| `src/lib/shared/pictograph/shared/services/svg-preloader.ts`             | 203                          | prop, grid and arrow SVGs   |
| `src/lib/shared/render/services/glyph-cache.ts`                          | 178, 219, 247, 271, 299, 363 | glyph SVGs                  |
| `src/lib/shared/render/services/canvas-2d-glyph-renderer.ts`             | 363, 407, 635                | glyph and element assets    |
| `src/lib/shared/render/services/card-asset-bundle.ts`                    | 64                           | bundle assets               |

Arrows are the highest-volume asset class in a pictograph, up to two per
beat, so the failure mode `asset-fetch.ts` was written to prevent is still
reachable through the path that fetches the most.

Inferred, not reproduced: this session has no dev server to saturate, so the
freeze itself was not observed. The evidence is the call sites and the
module's own documented rationale.

### F5: Latent edges in `sanitizeSvgForBitmap`

Measured against the real function; no asset in the corpus reaches any of
them today. `tests/unit/opus-svg-audit/svg-bitmap-sanitizer-contract.test.ts`
holds both halves, so if an asset ever does, it fails there instead of
producing a silently wrong bitmap.

1. A root carrying `stroke-width` and `height` but no `width` looks fully
   dimensioned to the presence test `/<svg[^>]*\bwidth\s*=/`, because `\b`
   matches inside `stroke-width`. Nothing is injected and the decode yields
   the dimensionless image the injection exists to prevent, which is what
   makes a later `createImageBitmap(img)` throw `InvalidStateError`.
2. The guard fires when either dimension is missing but the injection writes
   both. A root with `width` and no `height` comes back with `width` twice,
   which is not well-formed XML and fails the decode outright.
3. The viewBox is split on whitespace only. A comma-separated viewBox is legal
   SVG and yields `NaN` for every number after the first, so the fallback
   100x100 box is injected and the aspect ratio is silently wrong.

### F6: Two loader conventions that hold only by luck

Both are latent. Neither has a corpus violation today, and both are now pinned
by a test.

1. `parseArrowSvg` rebuilds the box as `0 0 W H` and `parsePropSvg` derives the
   rotation anchor as `(width / 2, height / 2)`. Both discard `minX` and
   `minY`. Every arrow and every `props/pictograph/` asset is authored at the
   origin, so both are correct today. Two assets in `props/animated/` are not:
   `torch.svg` is `-30 -10.1 360 35.7` and `bigtorch.svg` is
   `-38.5 -12.35 402 57.3`, which puts the derived anchor off the true box
   centre by 30 x 10.1 and 38.5 x 12.35 units respectively. Only
   `PropSvgLoader` under `useGridVersion` derives an anchor from those files;
   `svg-generator` reads width and height only and is unaffected.
2. `parseArrowSvg` rescales any arrow whose viewBox is smaller than 50x50 up to
   250 units. The only asset that matches is `/images/arrows/dash.svg`
   (`0 0 34.93 8.45`), and `getArrowPath` never routes to it, so the branch is
   dead. A newly authored small-box arrow would be scaled without anyone
   asking.

### F7: Dead `url(#…)` references in torch and fire artwork

Cosmetic, no runtime effect.

Eight prop assets carry Illustrator `<style>` rules whose `clip-path` or
`fill` references point at ids the file no longer contains:
`props/torch.svg` (3), and `props/{pictograph,animated,buttons}/torch.svg`,
`props/{pictograph,animated,buttons}/bigtorch.svg` and `props/bigtorch.svg`
(2 each). Every affected `.stN` class is applied by no element, so the browser
never resolves the reference. Recorded rather than ignored, because an art pass
that starts using one of those classes would inherit a broken reference.

The `url(#…)` occurrences inside the long authoring comments in
`capsule_baton.svg` and `fire_double_staff.svg` are prose, not references. The
census strips XML comments before scanning so they are not reported.

## Cache keys across prop variants

No defect found. Recorded because the brief asked for it.

`PropSvgLoader` keys its transformed cache on
`${path}:${propType}:${color}:${themeMode}` (`prop-svg-loader.ts:129`). Every
input that changes the output is covered:

- `useGridVersion` selects `animated/` or `pictograph/` and so is encoded in
  `path`.
- A fan appearance resolves to its own artwork file, which is also `path`. The
  separate `propType` segment is what keeps `fan` and `bigfan` apart when they
  share one appearance file and differ only by the Big Fan sizing applied
  afterwards.
- `applyTorchContrastPalette` varies by theme, and `themeMode` is in the key.
- The metadata cache keyed on `path` alone is consulted only when the artwork
  was not treated (`prop-svg-loader.ts:184`), so a torch or Big Fan never reads
  a pre-treatment box from it.

`ArrowSvgLoader` keys on `${path}:${hand}:${themeMode}`, which covers
everything its transform depends on.

`SvgImageCache` shares one map between `getImage(svg, key)` and
`getImageFromUrl(url)`. Callers in `canvas-2d-direct-renderer.ts` build keys
from a 32-bit hash of the full wrapped SVG, so the key is content-addressed and
a custom `primaryPropColors` recolor cannot collide with the default one. The
residual risk is a hash collision returning the wrong bitmap: with a 32-bit
space and a few thousand distinct SVG strings in one session the probability is
under a tenth of a percent, which is why it is listed here as a note and not as
a finding.

## Tests

Before: no test in the repository covered the asset corpus itself. The closest
existing coverage is `tests/unit/svg-precache-manifest.test.ts`, which checks
the service-worker precache list, not the files.

After: `tests/unit/opus-svg-audit/` adds 47 tests in four files.

| File                                     | Tests | Covers                                                                                          |
| ---------------------------------------- | ----- | ----------------------------------------------------------------------------------------------- |
| `svg-corpus.ts`                          | n/a   | shared corpus reader, comment stripping, zero-dimension inventory                               |
| `svg-corpus-contract.test.ts`            | 18    | XML, namespaces, viewBox, ids, fragment refs, path data, grid/arrow/prop coordinate conventions |
| `pictograph-asset-resolution.test.ts`    | 14    | arrow, half-arrow and prop path resolution against disk; F2 and F3                              |
| `prop-color-transform-fragments.test.ts` | 8     | fragment survival across the real color transform; F1                                           |
| `svg-bitmap-sanitizer-contract.test.ts`  | 7     | sanitizer behavior and corpus exposure; F5                                                      |

Neighboring suites re-run unchanged after the workspace packages were built:
`tests/unit/svg-precache-manifest.test.ts`,
`tests/unit/render/svg-loader-batch-cache.test.ts`,
`src/lib/shared/pictograph/prop/services/prop-svg-loader.fan-build.test.ts`,
`src/lib/shared/pictograph/arrow/rendering/services/__tests__/arrow-path-resolver-quarter.test.ts`
Ran 27 tests, all passing.

A note on running them: those four suites fail to collect with
`Failed to resolve entry for package "@tka/tka-types"` on a fresh checkout
until `npm run build:packages` has run. That is a pre-existing environment
requirement, unrelated to this branch.

Also run on the owned paths: `npx prettier --check` (clean) and a `tsc --noEmit`
pass over `tests/unit/opus-svg-audit/**/*.ts` under the project's strict
compiler options with Node types added (clean). ESLint ignores `tests/`, and
the project `tsconfig.json` includes only `src/**`, so the broad `npm run check`
gate does not reach these files and was not run for them.

## Limitations

- No browser. This session has no display, and the repository rules forbid
  touching the dev server on port 5173, so nothing here was verified against
  rendered pixels. F1's rendering consequence follows from SVG's clip-path and
  `<use>` semantics applied to the transform's real output, not from a
  screenshot.
- The corpus census is textual. It uses jsdom for well-formedness and
  `svg-path-commander` for path data, but it does not rasterize, so it cannot
  catch a defect that only appears at decode time in one browser engine.
- Reachability for F2 was judged from the shipped sequence data in the
  repository. A user-authored sequence with a skewed turning motion was not
  constructed.
- Prop appearance, fire and flame artwork, positioning offsets and half-arrow
  visual tuning were out of scope for edits. F1, F3 and F7 all sit in that
  territory and are reported rather than fixed.

## Follow-ups

Ordered by how much they change on screen.

1. F1. Decide where the fix belongs: rewrite `href` fragments alongside
   `url(#…)` in `applyColorToSvg`, or flatten `<use>` out of the four torch
   assets. The first is one regex and covers future artwork; the second keeps
   the transform as-is. Either way, delete the `.fails` from
   `prop-color-transform-fragments.test.ts` and check a torch pictograph in a
   browser.
2. F2. Draw the four missing zero-turn skew arrows, or give
   `resolveFullArrowAssetPath` a documented fallback to the unskewed glyph so a
   missing variant degrades instead of vanishing.
3. F3. Either add the two `props/animated/` files, or route
   `PropPlane2D.svelte` and `worker-asset-loader.ts` through
   `resolvePropSvgPath`, which already knows which props live in that
   directory.
4. F4. Move the arrow loader and the SVG preloader onto `assetFetch`. Small
   change, and it closes the freeze path through the most-fetched asset class.
5. F6. If the `< 50x50` rescale in `parseArrowSvg` is genuinely obsolete,
   removing it is cheaper than keeping a branch that can silently resize a
   future asset.
