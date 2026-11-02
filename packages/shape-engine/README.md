# @tka/shape-engine

The Shape Engine as a Svelte 5 package: Lorq Nichols' shape matrix (the flower
axes, the level and ratio matrices), the exact-realization drill, the Hands to
Props bridge, and the cell renderers. The framework-free half (flowers, modes,
elements, the baked letter edges) lives in `@tka/shape-domain`.

Internal `ShapeMatrix*` names remain because the matrix is still the behavior
they own.

## Hosts

| Host                                             | How it mounts                                                    |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| `/shape-engine` (public route)                   | `ShapeMatrixApp` with `variant="standalone"` and URL persistence |
| Create module's Shape tab                        | `ShapeMatrixApp` with `variant="embedded"`                       |
| Native Shape Engine app (`apps/shape-engine`)    | `ShapeMatrixApp` behind that app's SvelteKit shims               |
| A page with no bundler (the Poi Mirror demo)     | `dist/shape-engine.iife.js`: `window.TkaShapeEngine`             |

The Composer imports module paths (`@tka/shape-engine/app/ShapeMatrixApp.svelte`,
`@tka/shape-engine/services/...`). The root `index.ts` is the entry for hosts
outside the Composer, the IIFE and tests.

## Mounting from outside

```ts
const engine = mountShapeEngine(host, {
  variant: "mirror",
  icons, // { water, earth, sun, fire, air, moon } image URLs
  initial: { level: 2, leftTurn: 2, rightTurn: 2, pair, mode: "SS" },
  onTrace: ({ pair, mode, turns }) => { /* trace the pick */ },
  onBack: () => { /* return to the host */ },
});
engine.update({ ...options, strings });
engine.destroy();

const strip = mountElementStrip(host, { pair, mode, turns, icons, onChange });
```

`ShapeMatrixApp` fills the element it is given; give that element a width and
height. `persistence` (`restore`, `persist`, optional `link`) wins over
`initial` when both are given.

The `mirror` variant swaps Open, Save, Share and Customize for one Trace this
action, adds a Back action when `onBack` is given, and shows the attribution
line under the pick screen.

`mountElementStrip` shows the six hands modes for a pick the host already has:
each chip's element, the letters it spells for that pair, and the Hands to
Props row for the current mode.

Bridge functions answer the same questions without mounting anything:
`realizationFor(pair, mode, turns)`, `propsElementFor(mode, pair, turns)` and
`letterFor(pair, mode, turns)`. Each runs the drill's own chain, so the answers
match what the engine shows.

## Strings

Every label goes through `s(key)` in `strings.svelte.ts`. English is built in;
a host passes `strings` (a partial table) or installs a translator with
`setTranslator`, as the Composer does once in its i18n setup.

## Builds

- `npm run build:iife` (from this folder): `dist/shape-engine.iife.js` and
  `dist/shape-engine.css`. It reuses `apps/shape-engine`'s aliases for running
  outside SvelteKit and adds shims in `src/shims/` for `$app/env/public`,
  `$app/state` and `$app/navigation`. The page serves the Composer's `static/`
  files (`/data/...`, `/images/elements/...`) itself.
- The bundle carries the Composer's shared animation code, Firebase included,
  so it is large (see the build output). Shrinking it is separate work.

## Tests

- `src/__tests__/*.test.ts` and `src/**/__tests__` run under jsdom in the
  default Vitest project.
- `mount.svelte.test.ts` mounts the real app, so it runs in the browser
  component project (`tests/config/vitest.components.config.ts`).
- `composer-imports.test.ts` lists every Composer module the package may
  import; anything new needs a line there and a reason.
- `iife-smoke.test.ts` evaluates the built bundle and is skipped until it
  exists.

## Lab-side dependencies (not extracted)

Two helpers stay in `src/lib/features/lab/vtg-lab/services/`:
`resolve-rotation-style-matrices.ts` and `build-flower-sequence.ts`. Moving
them would drag lab-only domain modules with them. `composer-imports.test.ts`
allows exactly that folder.
