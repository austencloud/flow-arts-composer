# Shape Engine Packages Implementation Plan

> **For agentic workers:** Execute this plan inline, task by task, in the worktree `E:/worktrees/tka-platform/shape-engine-packages` (branch `codex/shape-engine-packages`). Steps use checkbox (`- [ ]`) syntax for tracking. Austen's Agent Budget rule overrides the subagent-per-task default: no per-task subagents, no per-task reviews.

**Goal:** Pull the Shape Engine out of `src/lib/shared/shape-matrix` into two workspace packages, `@tka/shape-domain` (framework-free rules) and `@tka/shape-engine` (the Svelte app), so the Composer's four consumers run off the packages and a single IIFE build of the engine can be dropped into the Poi Mirror demo.

**Architecture:** `@tka/shape-domain` is a `tsc` package with no `src/lib` imports, holding the flower axis, the six elements, the Hands to Props rule and the letter lookup with its CSV edges baked to JSON. `@tka/shape-engine` holds the moved `app/`, `components/` and `services/` folders of the engine and exposes two mount functions. Where the engine still needs Composer subsystems that are too large to move (animation engine, effects, pictograph rendering, mandala services), the engine package keeps importing them through the Composer's `#lib/*` alias; the Composer resolves that alias for every module it bundles, and the engine's own Vite IIFE build maps the same alias to `../../src/lib`. A test freezes that list so it can only shrink.

**Tech Stack:** pnpm workspace (`packages/*`), TypeScript 6, Svelte 5, Vite 8 library mode, Vitest 4, `@austencloud/motion` 0.2.1 (vendored tgz), `@sveltejs/package`.

**Spec:** `E:/poi-mirror-tka/docs/superpowers/specs/2026-11-01-shape-engine-on-mirror-design.md`, sections 3, 6 and 7. One deviation, decided in planning: the spec's "shared UI is either moved in or replaced by a slot" is taken as "moved in where only the engine uses it, otherwise kept behind the `#lib/*` alias and frozen by the allowlist test". The demo needs a complete bundle, not a publishable engine package, and the Composer's animation engine is not something this plan relocates.

---

## Rules that bind this plan

- Work only in the worktree above. `E:/tka-platform` is the primary checkout: never edit, build, install or switch branches there. Its dev server (`https://localhost:5173`) belongs to Austen.
- `node_modules` in the worktree is a junction into the primary. Never run `pnpm install`, `pnpm add` or `npm install` in the worktree. New workspace packages are reached through aliases (Task 1); the primary gets `pnpm install --offline` during integration, not here.
- Commit with explicit pathspecs only. Never `git add -A`, `git add .`, `git stash`, `git reset --hard`, `git checkout --`. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Quick, focused tests run here: `npx vitest run <path>` and `npm run test:changed`. The full gate (`npm run check`, `check:tsc`, the whole suite) runs on d2 through the finish step, not on this PC. Never add a GitHub Actions workflow. Nothing in this plan may set up or enable anything metered.
- No pushes, no deploys, no remote of any kind. The demo repo `E:/poi-mirror-tka` is not touched by this plan.
- Writing style for any text a user sees (the strings seam, the attribution line): plain words, no em dashes, no superlatives.

## File structure

Created:

```
packages/shape-domain/
  package.json
  tsconfig.json
  scripts/bake-edges.mjs              CSV -> JSON, run once per CSV change
  src/index.ts                        the whole public surface
  src/flowers/…                       moved from src/lib/shared/shape-matrix/domain/
  src/elements/tnd-elements.ts        TND_ELEMENTS without iconPath, MODE_ORDER, MODE_LABEL, VtgMode, MODE_ELEMENT
  src/turns/level-turn-values.ts      moved from src/lib/shared/create/services/
  src/letters/csv-edges.ts            CsvEdge, StepMotionQuery, parseCsvEdges, lookupLetter, DIAMOND_EDGES, BOX_EDGES
  src/letters/diamond-edges.json      baked from static/data/pictographs/DiamondPictographDataframe.csv
  src/letters/box-edges.json          baked from static/data/pictographs/BoxPictographDataframe.csv
  src/__tests__/dependencies.test.ts  no #lib, no $lib, no svelte

packages/shape-engine/
  package.json
  tsconfig.json
  vite.iife.config.ts                 IIFE build for the demo
  src/index.ts                        mountShapeEngine, mountElementStrip, re-exports
  src/bridge.ts                       propsElementFor, letterFor (need the realization chain, so they live here)
  src/__tests__/bridge.test.ts
  src/strings.ts                      ShapeEngineStrings + English defaults
  src/app/…                           moved from src/lib/shared/shape-matrix/app/
  src/components/…                    moved from src/lib/shared/shape-matrix/components/
  src/services/…                      moved from src/lib/shared/shape-matrix/services/
  src/debug/…                         moved
  src/iife-entry.ts                   window.TkaShapeEngine = { mountShapeEngine, mountElementStrip, domain }
  src/__tests__/composer-imports.test.ts   the frozen #lib allowlist
  src/__tests__/mount.test.ts         jsdom smoke: mount, trace callback, destroy
```

Modified:

- `vite.config.ts`: aliases for the two packages and `#lib/*`.
- `tests/config/vitest.config.ts`: the same aliases; `packages/shape-domain/src/**` and `packages/shape-engine/src/**` added to `include`.
- `tsconfig.json`: `paths` for the two packages (keep whatever SvelteKit's generated config already provides).
- `packages/tsconfig.build.json`: reference to `./shape-domain`.
- The 40 Composer files that import `#lib/shared/shape-matrix/...` (list in Task 5) move to the package imports.
- `src/lib/features/choreo-card/domain/tnd-element.ts` and `services/pictograph-letter-lookup.ts` become thin re-exports of the domain package (icon paths added back on the Composer side).
- `src/lib/shared/shape-matrix/README.md` is replaced by a pointer to the packages.

Deleted at the end of Task 5: `src/lib/shared/shape-matrix/` (everything moved, nothing left to re-export).

---

### Task 1: Package scaffolds and aliases

**Files:**
- Create: `packages/shape-domain/package.json`, `packages/shape-domain/tsconfig.json`, `packages/shape-domain/src/index.ts`
- Create: `packages/shape-engine/package.json`, `packages/shape-engine/tsconfig.json`, `packages/shape-engine/src/index.ts`
- Modify: `vite.config.ts`, `tests/config/vitest.config.ts`, `tsconfig.json`, `packages/tsconfig.build.json`

- [ ] **Step 1: Domain package manifest**

`packages/shape-domain/package.json`:

```json
{
  "name": "@tka/shape-domain",
  "version": "0.1.0",
  "description": "Shape Engine rules: the flower axis, the six timing-and-direction elements, the Hands to Props bridge and the pictograph letter lookup. Framework-free.",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "bake-edges": "node scripts/bake-edges.mjs",
    "clean": "rimraf dist"
  },
  "dependencies": {
    "@tka/tka-types": "workspace:*",
    "@tka/sequence-engine": "workspace:*",
    "@vtg/domain": "workspace:*",
    "@flow-arts/core": "workspace:*"
  },
  "devDependencies": {
    "rimraf": "^5.0.0",
    "typescript": "^6.0.0"
  },
  "author": "Austen Cloud <austencloud@gmail.com>",
  "license": "MIT"
}
```

Drop any of the four dependencies the finished package does not import (check with `grep -rho "from \"@[a-z/-]*" packages/shape-domain/src | sort -u` at the end of Task 3).

`packages/shape-domain/tsconfig.json` copies `packages/vtg-domain/tsconfig.json` with `resolveJsonModule: true` added and `paths`/`references` pointing at `../tka-types`, `../sequence-engine`, `../vtg-domain`, `../flow-arts-core` the way vtg-domain points at flow-arts-core.

- [ ] **Step 2: Engine package manifest**

`packages/shape-engine/package.json` (follows `packages/camera-3d`, the one Svelte package):

```json
{
  "name": "@tka/shape-engine",
  "version": "0.1.0",
  "description": "The Shape Engine: Lorq Nichols' shape matrix as a Svelte 5 app, mountable standalone, embedded, or on the Poi Mirror.",
  "type": "module",
  "svelte": "./src/index.ts",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "svelte": "./src/index.ts",
      "import": "./dist/index.js"
    },
    "./iife": "./dist/shape-engine.iife.js",
    "./style.css": "./dist/shape-engine.css"
  },
  "files": ["dist", "src"],
  "scripts": {
    "build": "svelte-package -i src -o dist",
    "build:iife": "vite build --config vite.iife.config.ts",
    "check": "svelte-check --tsconfig ./tsconfig.json",
    "clean": "rimraf dist"
  },
  "dependencies": {
    "@tka/shape-domain": "workspace:*",
    "@austencloud/motion": "file:../../vendor/austencloud-motion-0.2.1.tgz"
  },
  "peerDependencies": {
    "svelte": ">=5.0.0"
  },
  "devDependencies": {
    "@sveltejs/package": "^2.3.0",
    "@sveltejs/vite-plugin-svelte": "^7.0.0",
    "rimraf": "^5.0.0",
    "svelte": "^5.57.1",
    "svelte-check": "^4.0.0",
    "typescript": "^6.0.0",
    "vite": "^8.0.12"
  },
  "author": "Austen Cloud <austencloud@gmail.com>",
  "license": "MIT"
}
```

`packages/shape-engine/tsconfig.json`: copy `packages/camera-3d/tsconfig.json`, add `"paths": { "#lib/*": ["../../src/lib/*"], "@tka/shape-domain": ["../shape-domain/src/index.ts"] }`.

- [ ] **Step 3: Aliases so the worktree resolves both packages from its own source**

In `vite.config.ts`, in `resolve.alias` (add next to the existing entries; the file is large, search for `resolve:` and `alias`), add:

```ts
"@tka/shape-domain": path.resolve(__dirname, "packages/shape-domain/src/index.ts"),
"@tka/shape-engine": path.resolve(__dirname, "packages/shape-engine/src/index.ts"),
```

and a regex alias for `#lib/*` so modules under `packages/shape-engine/src` resolve it (the root `package.json` `imports` map only serves files whose nearest `package.json` is the root one):

```ts
{ find: /^#lib\//, replacement: path.resolve(__dirname, "src/lib") + "/" },
```

If `resolve.alias` is an object today, convert it to the array form (`[{ find, replacement }, …]`) so the regex entry fits; keep every existing entry.

In `tests/config/vitest.config.ts`, add the same three aliases beside the `@tka/render-core` entry (same comment applies: the junctioned `node_modules` would otherwise hide this checkout's packages). Add to `test.include`:

```ts
"packages/shape-domain/src/**/*.{test,spec}.{js,ts}",
"packages/shape-engine/src/**/*.{test,spec}.{js,ts}",
```

In `tsconfig.json`, add `paths` for `@tka/shape-domain` and `@tka/shape-engine` to the two `src/index.ts` files. SvelteKit's generated `.svelte-kit/tsconfig.json` supplies `$lib` paths through `extends`; a `paths` block in the child replaces the parent's, so copy the generated `$lib` and `$lib/*` entries into the child too. Verify afterwards with `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | tail -3` on one unchanged route: the error count must not move.

In `packages/tsconfig.build.json`, add `{ "path": "./shape-domain" }` after `./sequence-engine`. (`shape-engine` is Svelte and is not part of the tsc build.)

- [ ] **Step 4: Smoke the wiring**

`packages/shape-domain/src/index.ts`:

```ts
export const SHAPE_DOMAIN_VERSION = "0.1.0";
```

`packages/shape-engine/src/index.ts`:

```ts
export { SHAPE_DOMAIN_VERSION } from "@tka/shape-domain";
```

`packages/shape-engine/src/__tests__/wiring.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SHAPE_DOMAIN_VERSION } from "@tka/shape-engine";

describe("package wiring", () => {
  it("resolves the engine and domain packages from this checkout", () => {
    expect(SHAPE_DOMAIN_VERSION).toBe("0.1.0");
  });
});
```

Run: `npx vitest run packages/shape-engine/src/__tests__/wiring.test.ts`
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/shape-domain/package.json packages/shape-domain/tsconfig.json packages/shape-domain/src/index.ts packages/shape-engine/package.json packages/shape-engine/tsconfig.json packages/shape-engine/src/index.ts packages/shape-engine/src/__tests__/wiring.test.ts vite.config.ts tests/config/vitest.config.ts tsconfig.json packages/tsconfig.build.json
git commit -m "Shape Engine packages: scaffold @tka/shape-domain and @tka/shape-engine with worktree aliases"
```

---

### Task 2: Move the flower domain into `@tka/shape-domain`

**Files:**
- Move (git mv): every file in `src/lib/shared/shape-matrix/domain/` including `__tests__/` to `packages/shape-domain/src/flowers/`
- Create: `packages/shape-domain/src/__tests__/dependencies.test.ts`
- Modify: `packages/shape-domain/src/index.ts`

- [ ] **Step 1: Write the dependency test first**

`packages/shape-domain/src/__tests__/dependencies.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const FORBIDDEN = [/from\s+["']#lib\//, /from\s+["']\$lib\//, /from\s+["']\$app\//, /from\s+["']svelte/, /from\s+["']\.\.\/\.\.\/\.\.\/src\//];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : full.endsWith(".ts") ? [full] : [];
  });
}

describe("@tka/shape-domain stays framework-free", () => {
  it("imports nothing from the Composer's src or from Svelte", () => {
    const offenders = files(ROOT)
      .filter((f) => !f.includes("__tests__"))
      .flatMap((f) => {
        const text = readFileSync(f, "utf8");
        return FORBIDDEN.filter((re) => re.test(text)).map((re) => `${f}: ${re}`);
      });
    expect(offenders).toEqual([]);
  });
});
```

Run: `npx vitest run packages/shape-domain/src/__tests__/dependencies.test.ts`
Expected: PASS (the package is still empty). It will fail during Step 2 and pass again by Step 4.

- [ ] **Step 2: Move the domain folder**

```bash
git mv src/lib/shared/shape-matrix/domain packages/shape-domain/src/flowers
```

Then list every outside import the moved files carry:

```bash
grep -rhoE "from \"[^\"]+\"" packages/shape-domain/src/flowers | sort | uniq -c | sort -rn
```

Expected to appear (from the census): `#lib/shared/create/services/level-turn-values` (TurnValue, TurnLevel, TURN_LEVELS, turnValuesForLevel, levelForTurns, clampTurnToLevel), `#lib/shared/pictograph/prop/domain/enums/prop-type` (PropType enum), `#lib/shared/pictograph/shared/domain/enums/pictograph-enums`, `#lib/shared/mandala/domain/mandala-types`, `#lib/shared/foundation/domain/models/sequence-data`, `#lib/features/choreo-card/domain/tnd-element`, `#lib/features/choreo-card/domain/turn-pattern-parser`, `@vtg/domain`, `@tka/tka-types`, `vitest`.

- [ ] **Step 3: Resolve each outside import, in this order of preference**

1. **It is a type already exported by `@tka/tka-types`** (Letter, GridMode, MotionType, RotationDirection, Orientation, HandSide, Motion, Step): import it from `@tka/tka-types`.
2. **It is a small rules file with no further `#lib` imports** (`level-turn-values.ts` is one: check with `grep -n "^import" src/lib/shared/create/services/level-turn-values.ts`): `git mv` it into `packages/shape-domain/src/turns/level-turn-values.ts`, export it from the package index, and leave a one-line re-export at the old path:
   ```ts
   export * from "@tka/shape-domain/turns";
   ```
   (Add a `"./turns"` export to the domain `package.json` pointing at `./dist/turns/index.js`, with `types`, and a `turns/index.ts`. Re-exports at old paths keep the Composer's other 14 importers of `level-turn-values` working untouched.)
3. **It is an enum the engine only reads** (`PropType`, pictograph enums, mandala-types): the package needs the values. Check whether `@tka/tka-types` already has an equivalent (for example `MotionType` there versus `pictograph-enums` here). If it does, use it and adapt. If it does not, move the enum file into the package the same way as rule 2 and re-export at the old path. `PropType` lives in `src/lib/shared/pictograph/prop/domain/enums/prop-type.ts`; expect it to be movable (it should be a plain enum file).
4. **It is a Composer type used only as a type** (`SequenceData`, `PictographData`, `MotionData`): change the import to `import type` and move the type definition file only if it has no runtime `#lib` imports; otherwise define a structural subset in `packages/shape-domain/src/types.ts` naming only the fields the package reads, and import that. Say in a comment where the full type lives.
5. **`tnd-element` and `turn-pattern-parser`**: handled in Task 3; for now leave the import and let the dependency test fail until Task 3 lands.

After each move run `npx vitest run packages/shape-domain` and `npx vitest run src/lib/shared/shape-matrix` to catch broken relative paths.

- [ ] **Step 4: Export the public surface**

`packages/shape-domain/src/index.ts`, replacing the version stub:

```ts
export * from "./flowers/flower-signature.js";
export * from "./flowers/filter-flower-axis.js";
export * from "./flowers/matrix-size-preset.js";
export * from "./flowers/matrix-turn-band.js";
export * from "./flowers/prop-pair.js";
export * from "./flowers/prop-relationship.js";
export * from "./flowers/rotation-style.js";
export * from "./flowers/shape-matrix-display.js";
export * from "./flowers/theory-flower.js";
export * from "./flowers/theory-prop-relationship.js";
export * from "./flowers/theory-ratio.js";
export * from "./flowers/flower-at-turn.js";
export * from "./turns/level-turn-values.js";
export const SHAPE_DOMAIN_VERSION = "0.1.0";
```

Adjust the list to the files that actually exist after the move (`ls packages/shape-domain/src/flowers`). Keep the `.js` suffix convention the other packages use.

- [ ] **Step 5: Re-export from the old module paths**

For every moved file, leave a stub at its old path in `src/lib/shared/shape-matrix/domain/<name>.ts`:

```ts
export * from "@tka/shape-domain";
```

(One line, no selective re-export: the old imports were by module path, and `export *` from the package index satisfies every named import that used to work. The stubs are deleted in Task 5.)

- [ ] **Step 6: Run the engine's own tests and the dependency test**

Run: `npx vitest run src/lib/shared/shape-matrix packages/shape-domain`
Expected: every previously passing engine test passes; `dependencies.test.ts` fails only on the two Task 3 imports (`tnd-element`, `turn-pattern-parser`). Any other failure is fixed now.

- [ ] **Step 7: Commit**

```bash
git add packages/shape-domain src/lib/shared/shape-matrix/domain src/lib/shared/create/services/level-turn-values.ts src/lib/shared/pictograph/prop/domain/enums/prop-type.ts
git commit -m "Shape Engine packages: move the flower domain into @tka/shape-domain"
```

Add to the pathspec every other file you moved or stubbed in Step 3 (list them with `git status --short`; never use `-A`).

---

### Task 3: Elements and the letter edges

**Files:**
- Create: `packages/shape-domain/src/elements/tnd-elements.ts`
- Create: `packages/shape-domain/scripts/bake-edges.mjs`, `packages/shape-domain/src/letters/csv-edges.ts`, `packages/shape-domain/src/letters/diamond-edges.json`, `packages/shape-domain/src/letters/box-edges.json`
- Modify: `src/lib/features/choreo-card/domain/tnd-element.ts`, `src/lib/features/choreo-card/services/pictograph-letter-lookup.ts`, `src/lib/shared/shape-matrix/services/shape-matrix-realizations.ts` (MODE_ORDER, MODE_LABEL, VtgMode move out)

Why the Hands to Props rule and `letterFor` are not in this task: `derivePropRelationship(sequence, pair)` in `prop-relationship.ts` reads the realized sequence's motions, and the letters come from the realization chain (`tnd-base-index.ts`, `build-realization-sequence.ts`), which needs `deck-variation` and the mandala services. Both functions therefore live in `@tka/shape-engine` (Task 6 Step 1) and ride in the IIFE. This is a planned deviation from the spec's section 3.

- [ ] **Step 1: Confirm the three small files are movable**

```bash
grep -n "^import" src/lib/shared/create/services/level-turn-values.ts src/lib/shared/pictograph/prop/domain/enums/prop-type.ts src/lib/features/choreo-card/domain/turn-pattern-parser.ts
```

Expected (checked 2026-11-01): no output, none of the three imports anything. They move in Step 2 and Task 2 Step 3 by the re-export rule.

- [ ] **Step 2: Move the elements**

Create `packages/shape-domain/src/elements/tnd-elements.ts` from `src/lib/features/choreo-card/domain/tnd-element.ts`: the same `TnDElement` interface and `TND_ELEMENTS` array **without** `iconPath` (the consumer supplies icons: see `ElementIcons` below), plus `TND_BY_FAMILY`, and these three moved from `src/lib/shared/shape-matrix/services/shape-matrix-realizations.ts`:

```ts
export type VtgMode = "SS" | "TS" | "QS" | "SO" | "TO" | "QO";
export const MODE_ORDER: readonly VtgMode[] = ["SS", "TS", "QS", "SO", "TO", "QO"];
export const MODE_LABEL: Record<VtgMode, string> = { /* copy the existing map verbatim */ };

export type ElementName = "water" | "earth" | "sun" | "fire" | "air" | "moon";
export type ElementIcons = Record<ElementName, string>;

/** The element each VTG mode realizes as; the same table the TnD deck uses. */
export const MODE_ELEMENT: Record<VtgMode, ElementName> = {
  SS: "water", TS: "earth", QS: "sun", SO: "fire", TO: "air", QO: "moon",
};

export function elementFor(mode: VtgMode): TnDElement {
  return TND_BY_FAMILY[MODE_FAMILY[mode]];
}
```

Copy `MODE_ORDER`'s real order from the existing file rather than trusting the line above, and derive `MODE_FAMILY` (`SS: "split-same"`, and so on) from the family ids in `TND_ELEMENTS`.

Then make `src/lib/features/choreo-card/domain/tnd-element.ts` a Composer-side adapter that adds the icon paths back for the deck and everything else that reads `iconPath`:

```ts
import { TND_ELEMENTS as BASE, type TnDElement as BaseElement } from "@tka/shape-domain";
export * from "@tka/shape-domain";

export interface TnDElement extends BaseElement {
  readonly iconPath: string;
}

export const TND_ELEMENTS: readonly TnDElement[] = BASE.map((e) => ({
  ...e,
  iconPath: `/images/elements/norm/${e.element}.png`,
}));

export const TND_BY_FAMILY: Record<string, TnDElement> = Object.fromEntries(
  TND_ELEMENTS.map((e) => [e.familyId, e])
);
```

Run the deck's existing tests: `npx vitest run src/lib/features/choreo-card`. Expected: pass unchanged.

Also add to `packages/shape-domain/src/index.ts`:

```ts
export interface FlowerPair {
  left: Flower;
  right: Flower;
}
```

(with `Flower` imported from `./flowers/flower-signature.js`) so the engine, the mount API and the demo all name a pair the same way.

- [ ] **Step 3: Bake the CSV edges to JSON**

`packages/shape-domain/scripts/bake-edges.mjs`:

```js
// Bakes the pictograph dataframes the letter lookup reads into JSON so the
// package needs no fetch. Run from packages/shape-domain after a CSV changes:
//   node scripts/bake-edges.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const STATIC = join(here, "../../../static/data/pictographs");
const OUT = join(here, "../src/letters");

// The CSV header (checked 2026-11-01):
// letter,startPlacement,endPlacement,timing,direction,blueMotionType,
// blueRotationDirection,blueStartLocation,blueEndLocation,redMotionType,
// redRotationDirection,redStartLocation,redEndLocation
// The lookup's CsvEdge names the hands left/right; the CSV names them blue/red.
const RENAME = {
  blueMotionType: "leftMotionType",
  blueRotationDirection: "leftRotationDirection",
  blueStartLocation: "leftStartLocation",
  blueEndLocation: "leftEndLocation",
  redMotionType: "rightMotionType",
  redRotationDirection: "rightRotationDirection",
  redStartLocation: "rightStartLocation",
  redEndLocation: "rightEndLocation",
};

function bake(name, out) {
  const [head, ...rows] = readFileSync(join(STATIC, name), "utf8").trim().split(/\r?\n/);
  const cols = head.split(",").map((c) => RENAME[c] ?? c);
  const edges = rows.map((row) => {
    const cells = row.split(",");
    return Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? ""]));
  });
  writeFileSync(join(OUT, out), JSON.stringify(edges));
  console.log(`${out}: ${edges.length} edges`);
}

bake("DiamondPictographDataframe.csv", "diamond-edges.json");
bake("BoxPictographDataframe.csv", "box-edges.json");
```

Compare with the existing `parseCsvEdges` in `pictograph-letter-lookup.ts` (it does the same blue/red to left/right fallback at read time) and confirm the box CSV has the same header; if it differs, extend `RENAME`. Run `node scripts/bake-edges.mjs` from `packages/shape-domain`. Expected: two JSON files, a few hundred edges each (the diamond CSV is 33 KB).

- [ ] **Step 4: Move the lookup**

`git mv src/lib/features/choreo-card/services/pictograph-letter-lookup.ts packages/shape-domain/src/letters/csv-edges.ts`. Inside it, remove `loadDiamondEdges` and its fetch; keep `CsvEdge`, `StepMotionQuery`, `parseCsvEdges`, `lookupLetter`, and add:

```ts
import diamond from "./diamond-edges.json";
import box from "./box-edges.json";

export const DIAMOND_EDGES: readonly CsvEdge[] = diamond as CsvEdge[];
export const BOX_EDGES: readonly CsvEdge[] = box as CsvEdge[];
```

Leave the old path as the Composer adapter, keeping the async loader signature its 11 importers expect:

```ts
export * from "@tka/shape-domain";
import { DIAMOND_EDGES, type CsvEdge } from "@tka/shape-domain";

/** Kept for callers that awaited the fetch; the edges ship with the package now. */
export async function loadDiamondEdges(): Promise<CsvEdge[]> {
  return DIAMOND_EDGES as CsvEdge[];
}
```

Run: `npx vitest run packages/shape-domain`. Expected: all pass, including `dependencies.test.ts` now that the `tnd-element` import is gone from the package (move `turn-pattern-parser.ts` in too if the flowers still need it; Step 1 showed it imports nothing).

- [ ] **Step 5: Run the Composer side**

Run: `npx vitest run src/lib/features/choreo-card src/lib/shared/shape-matrix src/lib/features/lab/vtg-lab`
Expected: pass. The deck still sees `iconPath`; the lab still awaits `loadDiamondEdges`.

- [ ] **Step 6: Commit**

```bash
git add packages/shape-domain src/lib/features/choreo-card/domain/tnd-element.ts src/lib/features/choreo-card/services/pictograph-letter-lookup.ts src/lib/shared/shape-matrix/services/shape-matrix-realizations.ts
git commit -m "Shape Engine packages: elements and the baked letter edges in @tka/shape-domain"
```

Add any other moved file to the pathspec from `git status --short`.

---

### Task 4: Move the engine app into `@tka/shape-engine` with the strings and motion seams

**Files:**
- Move: `src/lib/shared/shape-matrix/{app,components,services,debug}` to `packages/shape-engine/src/{app,components,services,debug}`
- Create: `packages/shape-engine/src/strings.ts`, `packages/shape-engine/src/__tests__/composer-imports.test.ts`
- Modify: every moved file that imports `#lib/shared/i18n/i18n.svelte.js` (28 files) or `#lib/shared/transitions/*` (30 files)

- [ ] **Step 1: Move the folders**

```bash
git mv src/lib/shared/shape-matrix/app packages/shape-engine/src/app
git mv src/lib/shared/shape-matrix/components packages/shape-engine/src/components
git mv src/lib/shared/shape-matrix/services packages/shape-engine/src/services
git mv src/lib/shared/shape-matrix/debug packages/shape-engine/src/debug
```

Every `#lib/shared/shape-matrix/domain/...` import inside the moved files becomes `@tka/shape-domain`; every `#lib/shared/shape-matrix/services/...` or `.../app/...` or `.../components/...` import becomes a relative import inside the package. Do it with one careful `sed` per pattern and read the diff:

```bash
grep -rl '#lib/shared/shape-matrix/' packages/shape-engine/src | xargs sed -i -E 's#"\#lib/shared/shape-matrix/domain/[^"]+"#"@tka/shape-domain"#g'
grep -rn '#lib/shared/shape-matrix/' packages/shape-engine/src
```

Rewrite the remaining `services/app/components` hits by hand to relative paths (there are three folders; a path from `app/components/X.svelte` to `services/y.ts` is `../../services/y.js`).

Leave a stub at every old module path the Composer still imports (Task 5 lists the 40 consumer files; `grep -rhoE '#lib/shared/shape-matrix/[^"]+' src | sort -u` gives the exact module list). Each stub is `export * from "@tka/shape-engine";` for `.ts` modules; for `.svelte` modules the stub is the component re-exported from the package index (see Step 4). Stubs go in Task 5.

- [ ] **Step 2: The strings seam**

`packages/shape-engine/src/strings.ts`:

```ts
/**
 * Every piece of text the engine shows. The Composer passes its translator's
 * output through `setStrings`; the demo passes nothing and gets English.
 */
import { getContext, setContext } from "svelte";

export type ShapeEngineStrings = Record<ShapeEngineStringKey, string>;

const KEY = Symbol("shape-engine-strings");

export function provideStrings(overrides?: Partial<ShapeEngineStrings>): ShapeEngineStrings {
  const strings = { ...ENGLISH, ...overrides };
  setContext(KEY, strings);
  return strings;
}

export function useStrings(): ShapeEngineStrings {
  return getContext<ShapeEngineStrings>(KEY) ?? ENGLISH;
}

/** Drop-in for the Composer's `t(key)` inside the engine. */
export function s(key: ShapeEngineStringKey, vars?: Record<string, string | number>): string {
  let text = useStrings()[key];
  for (const [k, v] of Object.entries(vars ?? {})) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}
```

Build `ENGLISH` and `ShapeEngineStringKey` mechanically: list every key the engine uses with

```bash
grep -rhoE "\bt\(\s*[\"'][a-zA-Z0-9_.-]+[\"']" packages/shape-engine/src | sed -E "s/.*[\"']([^\"']+)[\"']/\1/" | sort -u > /tmp/keys.txt; wc -l /tmp/keys.txt
```

(the census found about 230) and copy each key's English value from the Composer's English JSON under `src/lib/shared/i18n/` into `ENGLISH` as a `const ENGLISH = { … } as const satisfies Record<string, string>` with `export type ShapeEngineStringKey = keyof typeof ENGLISH`. Then in each of the 28 files replace `import { t } from "#lib/shared/i18n/i18n.svelte.js";` with `import { s as t } from "../strings.js";` (the right relative path) so the call sites do not change. Check how the Composer's `t` interpolates variables (`t("key", { n })` or similar) and make `s` take the same shape.

`ShapeMatrixApp.svelte` gains a `strings?: Partial<ShapeEngineStrings>` prop and calls `provideStrings(strings)` at the top of its script, so every child reads from context.

- [ ] **Step 3: The motion seam**

The Composer's `#lib/shared/transitions/motion.js` already re-exports `Crossfade`, `flyFade`, `growFade`, `motionDuration`, `reducedMotion`, `arrive`, `leave`, `flipDuration` from `@austencloud/motion`, and `transitions.js` exports `DURATION`, `STAGGER`. In the moved files:

- `import { … } from "#lib/shared/transitions/motion.js"` → `import { … } from "@austencloud/motion"`, except `popIn`, which the Composer wraps for SVG; copy that four-line wrapper into `packages/shape-engine/src/motion.ts` and import `popIn` from there.
- `import { DURATION, STAGGER } from "#lib/shared/transitions/transitions.js"` → `DURATION` from `@austencloud/motion`; if `STAGGER` is not in the package (check `node_modules/@austencloud/motion/dist/index.d.ts`), define it in `src/motion.ts` with the Composer's values.
- `claimed-view-transition-name.js`, `results-morph.js`, `layout-flip.js` (5 imports): these are Composer route-morph helpers. Keep them behind the `#lib` alias for now and add them to the allowlist in Step 5; they are Composer glue, not engine rules.

- [ ] **Step 4: Package entry**

`packages/shape-engine/src/index.ts`:

```ts
export { default as ShapeMatrixApp } from "./app/ShapeMatrixApp.svelte";
export { default as ShapeMatrixGrid } from "./components/ShapeMatrixGrid.svelte";
export { default as ShapeMatrixDrill } from "./components/ShapeMatrixDrill.svelte";
export { default as ShapeMatrixTeaser } from "./components/ShapeMatrixTeaser.svelte";
export { default as ElementChipRow } from "./components/ElementChipRow.svelte";
export { default as PropRelationshipChipRow } from "./components/PropRelationshipChipRow.svelte";
export { default as RelationshipChoiceChip } from "./components/RelationshipChoiceChip.svelte";
export type { ShapeMatrixAppSnapshot, ShapeMatrixAppPersistence } from "./app/state/shape-matrix-app-state.svelte.js";
export * from "./services/shape-matrix-flowers.js";
export * from "./services/build-realization-cards.js";
export * from "./services/build-mode-realizations.js";
export * from "./services/verify-realization-parity.js";
export * from "./services/shape-matrix-render.js";
export * from "./services/shape-matrix-poi-render.js";
export * from "./services/shape-matrix-realizations.js";
export * from "./services/build-realization-sequence.js";
export * from "./services/tnd-base-index.js";
export * from "./strings.js";
export { mountShapeEngine, mountElementStrip } from "./mount.js";
export * as domain from "@tka/shape-domain";
```

Add every other service or component a Task 5 consumer imports (the README's public-surface table is the starting list). `mount.ts` is written in Task 6; until then leave that line out so the wiring test keeps passing.

- [ ] **Step 5: Freeze the remaining Composer imports**

`packages/shape-engine/src/__tests__/composer-imports.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

/**
 * Composer modules the engine still reaches through the `#lib/*` alias. Each
 * one is a subsystem too large to move for the Poi Mirror demo (the animation
 * engine, effects, pictograph rendering, mandala services) or Composer glue
 * (route morphs, settings). The list may only shrink. Adding to it is a
 * design decision, not a convenience.
 */
const ALLOWED = new Set<string>([
  "#lib/shared/animation-engine/state",
  "#lib/shared/animation-engine/domain",
  // … fill from the grep below, one module path per line, with the count
  // the census found beside it in a comment.
]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.(ts|svelte)$/.test(name) ? [full] : [];
  });
}

describe("@tka/shape-engine's Composer imports", () => {
  it("only reach the frozen allowlist", () => {
    const seen = new Set<string>();
    for (const f of files(ROOT)) {
      if (f.includes("__tests__")) continue;
      for (const m of readFileSync(f, "utf8").matchAll(/from\s+["'](#lib\/[^"']+)["']/g)) {
        const mod = m[1].replace(/\/[^/]+\.(js|ts|svelte)$/, (x) => x).replace(/\.js$/, "");
        const key = mod.split("/").slice(0, 4).join("/");
        if (!ALLOWED.has(key)) seen.add(`${relative(ROOT, f)} -> ${m[1]}`);
      }
    }
    expect([...seen]).toEqual([]);
  });

  it("never imports i18n or the Composer's transition wrappers", () => {
    const hits = files(ROOT)
      .filter((f) => !f.includes("__tests__"))
      .filter((f) => /#lib\/shared\/(i18n|transitions\/(motion|transitions))\b/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
```

Fill `ALLOWED` from:

```bash
grep -rhoE 'from "#lib/[^"]+"' packages/shape-engine/src | sed -E 's/from "//; s/"$//' | awk -F/ '{print $1"/"$2"/"$3"/"$4}' | sort | uniq -c | sort -rn
```

Expected categories (from the census, to be confirmed): `animation-engine/*`, `effects/*`, `pictograph/*`, `mandala/*`, `foundation/*`, `create/services`, `choreo-card/*` (deck-variation, sequence-render-hydrator, deck-composer, tnd-base-word-snapshot, getPrintCardRenderer), `ui/components`, `components/panel`, `settings/components`, `application/state`, `animation-panel/*`, `timeline/*`, `sequence-viewer/*`, `keyboard/*`, `notation/qft`, `landing/data`, `navigation/services`, `share/services`, `toast/state`, `render/core`, `effort/domain`, `loop-labeler`, `coordinators`, `transitions/claimed-view-transition-name`, `transitions/results-morph`, `transitions/layout-flip`, `features/lab/vtg-lab/services` (the two README-allowlisted imports). Where a module is small, only the engine uses it (`grep -rl "<module>" src | wc -l` gives 0 outside the engine) and it carries no further `#lib` imports, move it into the package instead of allowlisting it. `landing/data` and `notation/qft` are consumers of the engine, not parts: if the engine imports them, that is a cycle; break it by moving the shared piece to the package or passing it in as a prop, and say which in the commit message.

Run: `npx vitest run packages/shape-engine`. Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/shape-engine src/lib/shared/shape-matrix
git commit -m "Shape Engine packages: move the engine app into @tka/shape-engine behind strings and motion seams"
```

---

### Task 5: Migrate the Composer's consumers and delete the old module

**Files:**
- Modify (40 files, the complete list):
  - `src/routes/(public)/shape-engine/+page.svelte`, `src/routes/(public)/shape-engine/_state/shape-matrix-url.ts`
  - `src/lib/features/create/shape-engine/ShapeEngineTab.svelte`, `shape-engine-persistence.ts`, `shape-engine-prop-source.ts`
  - `src/lib/features/browse/home/previews/browse-preview-mandalas.ts`, `VisualsScene.svelte`
  - `src/lib/features/choreo-card/components/TnDModeGrid.svelte`
  - `src/lib/features/create/generate/components/cards/tnd-card-display.ts`, `TnDCard.svelte`, `TnDPanel.svelte`
  - `src/lib/features/create/shared/method-previews/method-preview-shape.ts`, `ShapeScene.svelte`
  - `src/lib/features/create/tunnel/ShapeMatrixTunnelSourcePicker.svelte`, `TunnelLayout.svelte`
  - `src/lib/features/fuse/…`: `FuseTnDModePicker.svelte`, `FuseVtgPathPicker.svelte`, `fuse-tnd-rule.ts`, `fuse-flower-path-source.ts`, `solo-loop-generator.ts`
  - `src/lib/features/lab/tabs/poi-string/PoiStringLab.svelte`
  - `src/lib/features/lab/vtg-lab/…`: `ShapeMatrixDrillModal.svelte`, `ShapeMatrixFilters.svelte`, `classify-rotation-style.test.ts`, `build-flower-sequence.ts`, `resolve-rotation-style-matrices.ts`
  - `src/lib/features/learn/…`: `PictographAnatomyConceptExperience.svelte`, `LearningWordStage.svelte`
  - `src/lib/features/levels/poi-lab/poi-legal-verdicts.svelte.ts` and its test
  - `src/lib/features/toys/third-order/ThirdOrderPathControls.svelte`, `third-order-composition.ts`, `third-order-state.svelte.ts`
  - `src/lib/shared/animation-engine/components/layers/GlyphOverlay.svelte`
  - `src/lib/shared/browse/components/localize-filter-chip.ts`
  - `src/lib/shared/create/domain/hand-relationship-tnd.test.ts`, `hand-relationship.ts`
  - `src/lib/shared/create/services/loop-type-utils.ts`
  - `src/lib/shared/guide-topics/caps-topic.ts` and its test
  - `src/lib/shared/landing/data/shape-matrix-hero-pool.ts`
  - `src/lib/shared/notation/notation-catalog.ts`
- Delete: `src/lib/shared/shape-matrix/` (whole folder, stubs included)

- [ ] **Step 1: Rewrite the imports**

Confirm the list first; it was taken on 2026-11-01 and main may have moved:

```bash
grep -rl '#lib/shared/shape-matrix/' src --include=*.ts --include=*.svelte | sort
```

For each file: imports of `.../domain/...` become `from "@tka/shape-domain"`; everything else becomes `from "@tka/shape-engine"`, using the named exports Task 4 Step 4 set up. A `.svelte` default import (`import ShapeMatrixApp from "#lib/shared/shape-matrix/app/ShapeMatrixApp.svelte"`) becomes `import { ShapeMatrixApp } from "@tka/shape-engine"`. Where a consumer imported something the index does not export yet, add the export to the index rather than reaching into `@tka/shape-engine/src/...`.

`ShapeEngineTab.svelte` and the `/shape-engine` route pass `strings` built from the Composer's translator so the engine stays translated:

```svelte
<script lang="ts">
  import { ShapeMatrixApp, ENGLISH, type ShapeEngineStringKey } from "@tka/shape-engine";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  const strings = Object.fromEntries(
    (Object.keys(ENGLISH) as ShapeEngineStringKey[]).map((k) => [k, t(k)])
  ) as Record<ShapeEngineStringKey, string>;
</script>
<ShapeMatrixApp {persistence} {propSource} variant="embedded" {strings} />
```

Make `strings` reactive to the locale the way the rest of the Composer does (`$derived` if `t` reads a rune; check `i18n.svelte.ts`).

- [ ] **Step 2: Delete the old module**

```bash
git rm -r src/lib/shared/shape-matrix
grep -rn 'shape-matrix/' src --include=*.ts --include=*.svelte --include=*.md | grep -v "shape-matrix-url\|shape-matrix-hero-pool\|ShapeMatrix" | head
```

The grep should print nothing but file names that merely contain the phrase. Fix any real leftover.

- [ ] **Step 3: Run the consumers' tests and the changed-tests runner**

Run: `npx vitest run src/lib/features/create src/lib/features/fuse src/lib/features/lab src/lib/features/levels src/lib/shared/create src/lib/shared/guide-topics src/lib/shared/landing src/lib/shared/notation packages`
Expected: pass.
Run: `npm run test:changed`
Expected: pass.

- [ ] **Step 4: Type-check the touched routes**

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | tail -5`
Expected: the same error count as `main` has (record `main`'s count first on a clean worktree of main if unsure; the primary's own `check` output is not yours to run). Any new error is yours.

- [ ] **Step 5: Look at the route**

Start a dev server in the worktree on a free port (never 5173, 3000, 1871, 9333): `npx vite dev --port 5174 --host 127.0.0.1` in the background. Open `https://127.0.0.1:5174/shape-engine?level=2&leftTurn=2&rightTurn=2&axis=both&labels=turns&prop=poi&left=pro-2-in-diamond&right=anti-2-in-diamond&mode=SS` in the agent Chrome (chrome-devtools MCP, remote debugging port 9222) and confirm the matrix renders, the Hands to Props row shows the six chips, and the console has no errors. Then open `/create` and the Shape tab. Save a screenshot of each to `docs/superpowers/plans/proof/2026-11-01-shape-engine-packages-route.png` and `-create-tab.png`. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add -u src packages docs/superpowers/plans/proof
git commit -m "Shape Engine packages: Composer consumers import @tka/shape-engine and @tka/shape-domain; old module removed"
```

(`-u` stages tracked modifications and deletions only, which is what this step produces; new proof files are named in the pathspec.)

---

### Task 6: The bridge functions, `mountShapeEngine`, `mountElementStrip`, the mirror variant and the IIFE build

**Files:**
- Create: `packages/shape-engine/src/bridge.ts`, `packages/shape-engine/src/__tests__/bridge.test.ts`
- Create: `packages/shape-engine/src/mount.svelte.ts`, `packages/shape-engine/src/iife-entry.ts`, `packages/shape-engine/vite.iife.config.ts`, `packages/shape-engine/src/components/ElementStrip.svelte`, `packages/shape-engine/src/__tests__/mount.test.ts`
- Modify: `packages/shape-engine/src/app/ShapeMatrixApp.svelte`, `app/components/ShapeMatrixAppShell.svelte`, `components/ShapeMatrixStageActions.svelte`, `app/components/ShapeMatrixOverflowMenu.svelte`

- [ ] **Step 1: The bridge functions, test first**

The six reference values come from the spec's fit proof: left `pro-2-in` (blue, 4 petals) over right `anti-2-in` (red, 6 petals) at level 2. Hands modes map to props elements SS→Fire, TS→Air, QS→Moon, SO→Water, TO→Earth, QO→Sun, and to the letters SS C, TS I, QS U, SO LF, TO FL, QO RO.

`packages/shape-engine/src/__tests__/bridge.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { propsElementFor, letterFor } from "@tka/shape-engine";
import { MODE_ORDER, type Flower, type VtgMode } from "@tka/shape-domain";

const left: Flower = { style: "pro", turns: 2, ori: "in", grid: "diamond", petals: 4 };
const right: Flower = { style: "anti", turns: 2, ori: "in", grid: "diamond", petals: 6 };
const pair = { left, right };

const ELEMENT: Record<VtgMode, string> = { SS: "fire", TS: "air", QS: "moon", SO: "water", TO: "earth", QO: "sun" };
const LETTERS: Record<VtgMode, string> = { SS: "C", TS: "I", QS: "U", SO: "LF", TO: "FL", QO: "RO" };

describe("propsElementFor", () => {
  it.each(MODE_ORDER)("hands %s gives the props element the engine's bridge row shows", async (mode) => {
    const element = await propsElementFor(mode, pair, [2, 2]);
    expect(element?.element).toBe(ELEMENT[mode]);
  });

  it("returns the element record without an icon path", async () => {
    const fire = await propsElementFor("SS", pair, [2, 2]);
    expect(fire?.familyId).toBe("split-opp");
    expect(fire?.accentColor).toBe("#f2673a");
    expect(fire && "iconPath" in fire).toBe(false);
  });
});

describe("letterFor", () => {
  it.each(MODE_ORDER)("mode %s of the reference pair reads its letters", async (mode) => {
    expect(await letterFor(pair, mode, [2, 2])).toBe(LETTERS[mode]);
  });
});
```

Build the `Flower` literals from the real `Flower` type (field names may differ: check `flower-signature.ts`). Run: `npx vitest run packages/shape-engine/src/__tests__/bridge.test.ts`. Expected: FAIL, not exported.

`packages/shape-engine/src/bridge.ts` wraps what the engine already does; it writes no new rule:

```ts
import { derivePropRelationship, type FlowerPair, type TnDElement, type VtgMode } from "@tka/shape-domain";
import { buildModeRealizationCandidates } from "./services/build-mode-realizations.js";
import { resolveBase } from "./services/build-realization-sequence.js";

/**
 * The realized sequence for a pair in a hands mode at these turns, built the
 * way the matrix builds a cell's realization. Null when the mode has no
 * realization for the pair (a float, or a parity the mode cannot hold).
 */
export async function realizationFor(pair: FlowerPair, mode: VtgMode, turns: [number, number]) {
  // Call the same chain DetailPane / PropRelationshipChipRow use; read those
  // components to find the exact entry point and its arguments, and reuse it.
}

/** The element the props trace: what the engine's Hands to Props row shows. */
export async function propsElementFor(mode: VtgMode, pair: FlowerPair, turns: [number, number]): Promise<TnDElement | null> {
  const seq = await realizationFor(pair, mode, turns);
  if (!seq) return null;
  const rel = derivePropRelationship(seq, pair);
  return rel.kind === "full" ? rel.element : null;
}

/** The letters the chip corner prints: the realization's base word prefix (C, or LF). */
export async function letterFor(pair: FlowerPair, mode: VtgMode, turns: [number, number]): Promise<string | null> {
  const seq = await realizationFor(pair, mode, turns);
  // Return what the chip shows; find the field (letter, word, baseWord) in the
  // realization the components read and return the same string.
}
```

Whether these are async depends on the chain (the base index is loaded from static words by default after Step 5's `loadBaseIndex` injection). If the chain is synchronous, drop `async` and the `await`s in the test. `derivePropRelationship` returns `{ kind: "full", element }` for equal turns; the `element` there carries the Composer `iconPath` only if `TND_BY_FAMILY` comes from the Composer adapter, so make `prop-relationship.ts` in the domain package use the package's own `TND_BY_FAMILY` (no icon path).

Run: `npx vitest run packages/shape-engine/src/__tests__/bridge.test.ts`. Expected: 13 passed. If a value differs, open `https://localhost:5173/shape-engine?level=2&leftTurn=2&rightTurn=2&axis=both&labels=turns&prop=poi&left=pro-2-in-diamond&right=anti-2-in-diamond&mode=SS` (Austen's running primary dev server, read only) in the agent Chrome, read the Hands to Props row and the chip letters, and fix the test to match the engine, never the engine to match the test. Export both functions and `realizationFor` from `src/index.ts`.

- [ ] **Step 2: Write the mount test**

`packages/shape-engine/src/__tests__/mount.test.ts` (runs under jsdom, the default project):

```ts
import { describe, expect, it, vi } from "vitest";
import { mountShapeEngine, mountElementStrip } from "@tka/shape-engine";

const icons = {
  water: "/i/water.webp", earth: "/i/earth.webp", sun: "/i/sun.webp",
  fire: "/i/fire.webp", air: "/i/air.webp", moon: "/i/moon.webp",
};

describe("mountShapeEngine", () => {
  it("mounts the mirror variant with a Trace this button and tears down clean", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const onTrace = vi.fn();
    const handle = mountShapeEngine(host, { variant: "mirror", icons, onTrace });
    expect(host.querySelector("[data-shape-engine]")).not.toBeNull();
    expect(host.textContent).toContain("Trace this");
    expect(host.textContent).not.toContain("Customize");
    handle.destroy();
    expect(host.childElementCount).toBe(0);
  });

  it("takes an initial state", () => {
    const host = document.createElement("div");
    const handle = mountShapeEngine(host, {
      variant: "mirror", icons,
      initial: { level: 2, leftTurn: 2, rightTurn: 2, mode: "SS" },
    });
    expect(host.querySelector("[data-level='2']")).not.toBeNull();
    handle.destroy();
  });
});

describe("mountElementStrip", () => {
  it("shows six chips and reports a change", () => {
    const host = document.createElement("div");
    const onChange = vi.fn();
    const left = { style: "pro", turns: 2, ori: "in", grid: "diamond", petals: 4 } as const;
    const right = { style: "anti", turns: 2, ori: "in", grid: "diamond", petals: 6 } as const;
    const handle = mountElementStrip(host, { pair: { left, right }, mode: "SS", turns: [2, 2], icons, onChange });
    const chips = host.querySelectorAll("button[data-mode]");
    expect(chips.length).toBe(6);
    (chips[3] as HTMLButtonElement).click();
    expect(onChange).toHaveBeenCalledWith("SO");
    handle.update({ pair: { left, right }, mode: "SO", turns: [2, 2], icons, onChange });
    expect(host.querySelector("button[data-mode='SO']")?.getAttribute("aria-pressed")).toBe("true");
    handle.destroy();
  });
});
```

If the engine's canvas code throws under jsdom (no `getContext`), stub it in the test with `HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;` at the top, and make the render services tolerate a null context (return early) rather than skipping the test.

Run: `npx vitest run packages/shape-engine/src/__tests__/mount.test.ts`. Expected: FAIL, `mountShapeEngine` is not exported.

- [ ] **Step 3: The mount functions**

`packages/shape-engine/src/mount.svelte.ts`:

```ts
import { mount, unmount } from "svelte";
import type { ElementIcons, FlowerPair, VtgMode } from "@tka/shape-domain";
import ShapeMatrixApp from "./app/ShapeMatrixApp.svelte";
import ElementStrip from "./components/ElementStrip.svelte";
import type { ShapeMatrixAppPersistence, ShapeMatrixAppSnapshot } from "./app/state/shape-matrix-app-state.svelte.js";
import type { ShapeEngineStrings } from "./strings.js";

export type ShapeEngineVariant = "standalone" | "embedded" | "mirror";

export interface TracePick {
  pair: FlowerPair;
  mode: VtgMode;
  turns: [number, number];
}

export interface MountShapeEngineOptions {
  variant: ShapeEngineVariant;
  persistence?: ShapeMatrixAppPersistence;
  initial?: Partial<ShapeMatrixAppSnapshot>;
  icons: ElementIcons;
  strings?: Partial<ShapeEngineStrings>;
  onTrace?: (pick: TracePick) => void;
  onBack?: () => void;
}

export interface MountHandle<O> {
  update(options: O): void;
  destroy(): void;
}

export function mountShapeEngine(host: HTMLElement, options: MountShapeEngineOptions): MountHandle<MountShapeEngineOptions> {
  const props = $state({ ...options });
  const app = mount(ShapeMatrixApp, { target: host, props });
  return {
    update(next) { Object.assign(props, next); },
    destroy() { unmount(app); },
  };
}

export interface MountElementStripOptions {
  pair: FlowerPair;
  mode: VtgMode;
  turns: [number, number];
  icons: ElementIcons;
  strings?: Partial<ShapeEngineStrings>;
  onChange: (mode: VtgMode) => void;
}

export function mountElementStrip(host: HTMLElement, options: MountElementStripOptions): MountHandle<MountElementStripOptions> {
  const props = $state({ ...options });
  const strip = mount(ElementStrip, { target: host, props });
  return {
    update(next) { Object.assign(props, next); },
    destroy() { unmount(strip); },
  };
}
```

`$state` outside a component is why the file is named `mount.svelte.ts`. `ShapeMatrixApp.svelte` grows these props: `variant` accepts `"mirror"`, plus `initial`, `icons`, `strings`, `onTrace`, `onBack`. `initial` is applied once on mount through the same path `persistence.restore()` takes (`persistence` wins when both are given). The root element of the app shell gets `data-shape-engine` and `data-level={state.level}` so hosts and tests can find it. Icons: every `<img src={element.iconPath}>` in the engine (the chip, the chip row, the bridge, cards) reads `icons[element.element]` from a context set in `ShapeMatrixApp`; the Composer's route and tab pass `icons` built from `/images/elements/norm/<el>.webp`. A missing `icons` prop in the Composer falls back to those paths inside `ShapeMatrixApp`, so the Composer's consumers do not all need the prop.

- [ ] **Step 4: The mirror variant**

In `ShapeMatrixAppShell.svelte`, `variant` gains `"mirror"`. The branches that today test `variant === "embedded"` apply to `mirror` too (`const compactHost = variant !== "standalone"`). Then:

- `ShapeMatrixStageActions.svelte`: when `variant === "mirror"`, render one primary pill labelled `t("shape_engine_trace_this")` ("Trace this") that calls `onTrace({ pair, mode, turns })` with the current selection, and do not render the Customize button. Add `shape_engine_trace_this` to `ENGLISH` (and to the Composer's English JSON so the key exists for the translator). Open, Save and Share live in the overflow menu and the stage; hide them for `mirror`.
- `ShapeMatrixOverflowMenu.svelte`: not rendered for `mirror`.
- Attribution line: a `<footer class="attribution">` in the pick screen's footer for `mirror` only, text `t("shape_engine_attribution")` = "Shape matrix after Lorq Nichols; Spin Science by Lorq Nichols and Austen Cloud. The Kinetic Alphabet is Austen Cloud's." Read `ShapeMatrixAboutModal.svelte` for the wording the engine already uses and match it; do not invent credits.
- `onBack`: when given and `variant === "mirror"`, the shell shows a Back pill (left of the header) that calls it.

`onTrace` receives the `FlowerPair` the matrix has selected (the two `Flower`s of the active cell), the active `VtgMode` and `[leftTurn, rightTurn]`. Find where the app state holds the selected cell (`shape-matrix-app-state.svelte.ts`: `leftTurn`, `rightTurn`, `theoryMode`/the matrix mode, and the selected pair) and build the pick there in one function `currentTracePick(state): TracePick | null`, exported for the test.

- [ ] **Step 5: `ElementStrip.svelte`**

A thin component in `packages/shape-engine/src/components/ElementStrip.svelte` that renders the existing `RelationshipChoiceChip` six times from `MODE_ORDER`, each with `data-mode={mode}`, `aria-pressed={mode === current}`, the element's icon from `icons`, and the letter from `letterFor(pair, mode, turns)` (awaited into state if async); below it the existing Hands to Props bridge row (`PropRelationshipChipRow`) for the current mode. Props: `pair`, `mode`, `turns`, `icons`, `strings?`, `onChange`. It calls `provideStrings(strings)` itself since it mounts without `ShapeMatrixApp`. No new styling: it reuses the chips' own styles.

Run: `npx vitest run packages/shape-engine`. Expected: pass, including `mount.test.ts`.

- [ ] **Step 6: The IIFE build**

`packages/shape-engine/src/iife-entry.ts`:

```ts
import { mountShapeEngine, mountElementStrip } from "./mount.svelte.js";
import { propsElementFor, letterFor, realizationFor } from "./bridge.js";
import * as domain from "@tka/shape-domain";
import "./app/styles.css"; // only if the engine's global styles live in a file; otherwise omit

const api = { mountShapeEngine, mountElementStrip, propsElementFor, letterFor, realizationFor, domain };

declare global {
  interface Window {
    TkaShapeEngine: typeof api;
  }
}

window.TkaShapeEngine = api;
```

`packages/shape-engine/vite.iife.config.ts`:

```ts
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [svelte({ hot: false, compilerOptions: { css: "external" } })],
  resolve: {
    alias: [
      { find: /^#lib\//, replacement: resolve(here, "../../src/lib") + "/" },
      { find: "@tka/shape-domain", replacement: resolve(here, "../shape-domain/src/index.ts") },
      { find: "$app/navigation", replacement: resolve(here, "src/shims/app-navigation.ts") },
    ],
  },
  build: {
    outDir: "dist",
    emptyOutDir: false,
    cssCodeSplit: false,
    lib: {
      entry: resolve(here, "src/iife-entry.ts"),
      name: "TkaShapeEngine",
      formats: ["iife"],
      fileName: () => "shape-engine.iife.js",
    },
    rollupOptions: {
      output: { assetFileNames: "shape-engine.css" },
    },
  },
});
```

`$app/navigation` (2 imports in the engine) is SvelteKit; the shim `src/shims/app-navigation.ts` exports no-op `goto`, `pushState`, `replaceState` for the bundle. Any other SvelteKit import that surfaces in the build gets the same treatment, shimmed and named in the commit message. Firebase: if the build pulls Firebase in through `loadBaseIndex`, the IIFE entry must not reach it; make the Firestore loader a consumer-injected function on `ShapeMatrixApp` (`loadBaseIndex?: () => Promise<BaseIndex>`) with the pure `tnd-base-index` static words as the default, which is what the demo needs anyway.

Run from `packages/shape-engine`: `npx vite build --config vite.iife.config.ts 2>&1 | tail -15`
Expected: `dist/shape-engine.iife.js` and `dist/shape-engine.css`. Record both sizes. Warn in the report if the JS is above 1.5 MB; do not try to shrink it in this plan.

- [ ] **Step 7: Prove the bundle loads with no server**

`packages/shape-engine/src/__tests__/iife-smoke.test.ts` (jsdom):

```ts
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIST = join(__dirname, "../../dist");

describe.skipIf(!existsSync(join(DIST, "shape-engine.iife.js")))("the IIFE bundle", () => {
  it("defines window.TkaShapeEngine with both mounts and the domain", () => {
    const code = readFileSync(join(DIST, "shape-engine.iife.js"), "utf8");
    new Function(code)();
    const api = (window as any).TkaShapeEngine;
    expect(typeof api.mountShapeEngine).toBe("function");
    expect(typeof api.mountElementStrip).toBe("function");
    expect(api.domain.MODE_ORDER.length).toBe(6);
    expect(api.letterFor).toBeTypeOf("function");
    expect(api.propsElementFor).toBeTypeOf("function");
  });
});
```

Run: `npx vitest run packages/shape-engine/src/__tests__/iife-smoke.test.ts`. Expected: 1 passed (not skipped). Add `packages/shape-engine/dist/` to `.gitignore` if `dist` folders are not already ignored (`git check-ignore packages/shape-engine/dist/x.js`).

- [ ] **Step 8: Commit**

```bash
git add packages/shape-engine .gitignore
git commit -m "Shape Engine packages: bridge functions, mountShapeEngine, mountElementStrip, the mirror variant and the IIFE build"
```

---

### Task 7: Finish

- [ ] **Step 1: Bring the branch current and rerun the focused tests**

```bash
git fetch . main:main 2>/dev/null; git merge --no-edit main
npm run test:changed
```

Expected: clean merge (or conflicts resolved by hand in the files this plan touched), tests pass.

- [ ] **Step 2: Build the bundle one last time on the final commit and record where it is**

```bash
cd packages/shape-engine && npx vite build --config vite.iife.config.ts && ls -la dist && git -C ../.. rev-parse --short HEAD
```

The demo plan vendors `dist/shape-engine.iife.js`, `dist/shape-engine.css` and the domain build. Build the domain too: `cd ../shape-domain && npx tsc && ls dist | head`. Expected: `dist/index.js` and friends.

- [ ] **Step 3: Hand off; do not run `wt:finish` yourself**

The guarded finish (`npm run wt:finish -- codex/shape-engine-packages --route /shape-engine`) runs the full gate on d2 and merges to local main. It is run from the primary checkout by the session that owns this task, after review. Stop here and report:

- the commits (`git log --oneline main..HEAD`),
- the test summary lines from `npm run test:changed`,
- the svelte-check error count against main's,
- the bundle sizes and the commit they were built from,
- the final `ALLOWED` list in `composer-imports.test.ts`,
- every deviation from this plan and anything you could not verify.

---

## Self-review against the spec

- Section 3, `@tka/shape-domain`: flowers (Task 2), elements with icons as a parameter (Task 3 Step 2), letter edges baked to JSON with `lookupLetter` (Task 3 Steps 3 and 4), dependency test (Task 2 Step 1). Two planned deviations: `propsElementFor` and `letterFor` live in `@tka/shape-engine` (Task 6 Step 1) because the rule reads a realized sequence, and `build-flower-sequence` is not moved into the domain package because it needs `deck-variation` and `prepare-mandala-club-sequence`, which pull the choreo-card and mandala subsystems. Both ship inside the IIFE on `window.TkaShapeEngine` (`propsElementFor`, `letterFor`, `realizationFor`, and `buildFlowerSequence` through the engine's exports if the demo plan needs it). The demo plan reads them from there.
- Section 3, `@tka/shape-engine`: moves (Task 4 Step 1), strings seam (Step 2), motion seam (Step 3), frozen allowlist in place of "moved in or replaced by a slot" for the large subsystems (Step 5, stated deviation), `mountShapeEngine` and `mountElementStrip` (Task 6 Step 2), `variant: "mirror"` with Trace this, hidden Open/Save/Share/Customize and the attribution line (Task 6 Step 3), IIFE plus CSS with global `TkaShapeEngine` (Task 6 Step 5), svelte-package build script present (Task 1 Step 2).
- Section 3, proof: the four consumers and the other 36 importers migrated and their tests passing (Task 5); route and Create tab looked at (Task 5 Step 5); full gate on d2 at finish (Task 7).
- Section 6 tests: engine tests for all six `propsElementFor` values and the six `letterFor` words (Task 6 Step 1), the domain dependency test, the frozen Composer-import test, engine jsdom mount tests, the IIFE smoke test.
- Types used across tasks: `Flower`, `FlowerPair` (domain index, Task 3 Step 2), `VtgMode`, `ElementName`, `ElementIcons`, `TnDElement` (Task 3 Step 2), `TracePick`, `MountHandle` (Task 6 Step 3), `ShapeMatrixAppPersistence`, `ShapeMatrixAppSnapshot` (existing), `ShapeEngineStrings`, `ShapeEngineStringKey` (Task 4 Step 2) are each defined once and used by those names afterwards.
