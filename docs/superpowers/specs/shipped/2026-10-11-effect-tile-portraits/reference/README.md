# Effect tile prototypes (approved 2026-10-11)

Reference art for `../../2026-10-11-effect-tile-portraits-design.md`. Each
page draws one effect's presets at the picker size (304x114) and at full size
(720x270) with the canvas code the implementer ports into the Svelte tile. The
`<p class="lede">` on each page is the approved art direction; the draw code is
the approved parameter mapping. Austen locked every page in the browser. When a
port drifts, change the Svelte tile, not these files.

| Page           | Draw code                               | Notes                                                           |
| -------------- | --------------------------------------- | --------------------------------------------------------------- |
| `zap.html`     | inline                                  | three looks                                                     |
| `sparkle.html` | inline                                  | six looks                                                       |
| `ghost2.html`  | inline                                  | uses a fixed staff SVG; the tile uses the live prop sprite      |
| `goo.html`     | inline                                  | seven looks                                                     |
| `bubbles.html` | inline                                  | six looks                                                       |
| `petals.html`  | inline, imports `petal-palettes.js`     | bundle of `src/lib/shared/effects/domain/petal-palettes.ts`     |
| `smoke3.html`  | inline, imports `smoke-curl-field.js`   | bundle of `src/lib/shared/3d/effects/smoke/smoke-curl-field.ts` |
| `ink.html`     | inline                                  | three looks                                                     |
| `silk.html`    | `silk-draw.js`, imports `silk-kit.js`   | bundle of `silk-entry.ts`                                       |
| `animal.html`  | `animal-draw.js`, imports `silk-kit.js` | same bundle                                                     |
| `pulse.html`   | `pulse-draw.js`                         | four looks                                                      |

The three bundles are not committed. Rebuild them from the primary checkout
before serving the pages:

```powershell
$esbuild = "node_modules/.pnpm/node_modules/.bin/esbuild"
$dir = "docs/superpowers/specs/active/2026-10-11-effect-tile-portraits/reference"
& $esbuild "$dir/silk-entry.ts" --bundle --format=esm --platform=browser --outfile="$dir/silk-kit.js"
& $esbuild src/lib/shared/effects/domain/petal-palettes.ts --bundle --format=esm --platform=browser --outfile="$dir/petal-palettes.js"
& $esbuild src/lib/shared/3d/effects/smoke/smoke-curl-field.ts --bundle --format=esm --platform=browser --outfile="$dir/smoke-curl-field.js"
```

`silk-entry.ts` imports by absolute `E:/tka-platform/src/...` paths; adjust
them if the checkout lives elsewhere. Serve the folder with any static server
(`python -m http.server 8731`) and open a page. Browsers cache ES modules per
URL, so bump the `?v=N` on an import after editing a draw file.
