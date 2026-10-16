# TKA Pictograph Package Implementation Plan

> Executed inline in one session (Austen's rule: a handful of substantial tasks, no per-task review). Steps use checkbox syntax for tracking.

**Goal:** `@austencloud/tka-pictograph`, a package that draws real TKA pictographs as SVG in Node or a browser, built from the knowledge server's renderer. Built and tested; not published.

**Architecture:** The knowledge server's `StandaloneRenderer` SVG path moves into `packages/tka-pictograph`. Its drawing code stays synchronous and reads art through a small cache. On Node the cache reads from disk directly, giving one pass. In a browser, a pass that meets uncached art records the paths, the package fetches them, and the pass runs again until nothing is missing. The knowledge server keeps PNG output and imports the SVG renderer from the package through the same alias pattern it uses for `@tka/render-core`.

**Tech stack:** TypeScript, esbuild, vitest. The package bundles `@tka/render-core`, which is unpublished, into its dist.

Spec: `docs/superpowers/specs/2026-10-15-tka-pictograph-package-design.md`.

---

## File map

- `packages/tka-pictograph/package.json`, `tsconfig.json`, `build.mjs`, `LICENSE` (Elastic 2.0, copied from `mcp-server-pkg/LICENSE`).
- `packages/tka-pictograph/src/types.ts`: the public types `PictographInput`, `MotionInput`, `RenderVisibilityOptions` and `HandColorPair`, with no imports from unpublished packages.
- `packages/tka-pictograph/src/art-source.ts`: `ArtSource`, `fsArtSource`, `urlArtSource` and `ArtCache`, the synchronous cache that records misses.
- `packages/tka-pictograph/src/svg-renderer.ts`: the SVG drawing code moved from `mcp-server-pkg/src/core/standalone-renderer.ts`, reading through `ArtCache`.
- `packages/tka-pictograph/src/arrow-adjustment.ts`, `arrow-placement.ts`, `enums.ts`: moved from `mcp-server-pkg/src/core/`. The adjustment JSON loader reads through `ArtCache`.
- `packages/tka-pictograph/src/letters.ts`: `pictographsForLetter`, over dataframe JSON built from the CSVs.
- `packages/tka-pictograph/src/index.ts`: the exports, including `renderPictographSvg`.
- `packages/tka-pictograph/scripts/sync-assets.mjs`: copies art and converts the dataframes.
- `packages/tka-pictograph/tests/`: baseline, art source, letters and browser path tests.
- `mcp-server-pkg/src/core/standalone-renderer.ts`: shrinks to the PNG wrapper around the package.
- `mcp-server-pkg/tsconfig.json` and `build.mjs`: alias `@austencloud/tka-pictograph` to the package source.

---

### Task 1: Baseline snapshots from today's renderer

Freezes today's output before anything moves.

- [ ] Link dependencies into the worktree with junctions to the primary checkout (`node_modules`, `mcp-server-pkg/node_modules`, `packages/render-core/node_modules`, `packages/render-composition/node_modules`, `packages/domain/node_modules`). `wt:finish` unlinks them.
- [ ] Create `mcp-server-pkg/scripts/capture-pictograph-baseline.ts`. It renders the sample matrix with `getStandaloneRenderer().renderToSvg` and writes one file per case to `packages/tka-pictograph/tests/baseline/<case>.svg`. The matrix:
  - letters A, β, γ, W-, Φ-, Λ, using the first Diamond dataframe row for each;
  - turns 0, 1 and 2.5 on both hands, plus a float case on A;
  - prop staff and fan;
  - dark mode, with `showTKA` on.

  Each input is built the way `pictograph-tools.ts` builds one from a CSV row: `startOrientation: "in"`, and `rotationDirection` taken from the row.
- [ ] Run it with `npx tsx scripts/capture-pictograph-baseline.ts` from `mcp-server-pkg`. Expect 37 SVG files.
- [ ] Commit: `test(pictograph): baseline SVG snapshots from the current renderer`.

### Task 2: Package skeleton, art source and letter lookup

- [ ] Write `art-source.ts`:

```ts
export interface ArtSource {
  /** Text of the file at this path under assets/, or null when it does not exist. */
  read(path: string): Promise<string | null>;
  /** Present on sources that can answer at once (disk). */
  readSync?(path: string): string | null;
}

export const MISSING = Symbol("missing");

/** Synchronous view of a source for one render: answers from cache, records what it has not seen. */
export class ArtCache {
  private known = new Map<string, string | null>();
  readonly misses = new Set<string>();
  constructor(private source: ArtSource) {}
  get(path: string): string | null | typeof MISSING {
    if (this.known.has(path)) return this.known.get(path)!;
    if (this.source.readSync) {
      const text = this.source.readSync(path);
      this.known.set(path, text);
      return text;
    }
    this.misses.add(path);
    return MISSING;
  }
  async fill(): Promise<void> {
    const paths = [...this.misses];
    this.misses.clear();
    const texts = await Promise.all(paths.map((p) => this.source.read(p)));
    paths.forEach((p, i) => this.known.set(p, texts[i] ?? null));
  }
}
```

  - `fsArtSource(root)` uses `readFileSync` through a dynamic `import("node:fs")` taken once at creation, so the browser bundle never imports `fs`. `fsArtSource` therefore becomes async: `await fsArtSource(root)`.
  - `urlArtSource(base)` fetches `new URL(path, base)`; a 404 is null, and any other failure throws.
  - `defaultArtSource()` is `urlArtSource(new URL("../assets/", import.meta.url))`.
  - One shared `ArtCache` per source object, so art fetched once stays fetched across renders.
- [ ] Write `scripts/sync-assets.mjs`. It copies from `mcp-server-pkg/assets`:
  - `images/grid`, `images/arrows`, `images/arrow.svg`, `images/letters_trimmed`, `images/numbers`, `images/vtg_glyphs`, `images/elements`;
  - `images/props`, without `animated/` or `build-previews/`;
  - `data/arrow_placement`.

  It also converts `data/pictographs/{Diamond,Box}PictographDataframe.csv` to `src/data/{diamond,box}.json` as arrays of row objects, skipping blank lines.
- [ ] Write `letters.ts`: `pictographsForLetter(letter, { start?, gridMode? })`. `start` matches an exact placement (`alpha3`) or a group (`alpha`). Rows map to `PictographInput` exactly as `pictograph-tools.ts` maps them; blue is the left hand and red is the right.
- [ ] Tests:
  - `ArtCache` records misses with an async-only source and fills them;
  - `fsArtSource` reads a real file and returns null for a missing one;
  - `pictographsForLetter("A", { start: "alpha3" })` returns only alpha3 starts;
  - `"alpha"` returns the whole group;
  - an unknown letter returns an empty list.
- [ ] Run `npx vitest run` in `packages/tka-pictograph`. Commit: `feat(pictograph): package skeleton, art source and letter lookup`.

### Task 3: Move the SVG renderer into the package

- [ ] Move into the package:
  - the `StandaloneRenderer` SVG code: everything except `renderToPng`, `drawHandColorKeyOnPng`, `svgToPng` and the Resvg, canvas and Gelasio imports;
  - `arrow-placement.ts`, `arrow-adjustment.ts` and `enums.ts`.

  Use `git mv` where the whole file moves, so history follows.
- [ ] Replace each `existsSync(join(this.assetsRoot, p))` and `readFileSync` pair with `const text = this.art.get(p); if (text === MISSING || text === null) { ...the existing not-found branch }`. The paths become relative to `assets/` (props, arrows, numbers, letters, VTG, elementals, placement glyph). `arrow-adjustment.ts` takes its JSON through the same cache: `loadPlacementJson(rel)` returns `JSON.parse(text)` or null, and caches parsed JSON per source.
- [ ] Add the pass loop in `index.ts`:

```ts
export async function renderPictographSvg(
  input: PictographInput,
  options: RenderVisibilityOptions & { art?: ArtSource } = {}
): Promise<string> {
  const cache = cacheFor(options.art ?? defaultArtSource());
  for (let pass = 0; pass < 6; pass++) {
    const svg = renderSvgSync(input, options, cache);
    if (cache.misses.size === 0) return svg;
    await cache.fill();
  }
  throw new Error("Pictograph art kept missing after 6 passes");
}
```

- [ ] Write `types.ts` with the public types. `HandColorPair` is a structural `{ left: string; right: string }` copy, so the published types import nothing unpublished.
- [ ] Write `build.mjs`: esbuild `src/index.ts`, bundled, ESM, `--platform=neutral`, with `@tka/render-core` aliased to `../render-core/src/index.ts`. Then `tsc --emitDeclarationOnly` for `types.ts` and `index.ts`. A post-build check fails if `dist/index.js` contains `from "fs"`, `node:fs`, `from "path"` or `node:path`, apart from the one dynamic `import("node:fs")` inside `fsArtSource`.
- [ ] Test: every baseline case rendered through `renderPictographSvg` with `await fsArtSource(<mcp assets>)` equals its `tests/baseline/<case>.svg` byte for byte.
- [ ] Run the package tests. Commit: `refactor(pictograph): move the SVG renderer into tka-pictograph behind an art source`.

### Task 4: The knowledge server uses the package

- [ ] In `mcp-server-pkg/tsconfig.json` and `build.mjs`, alias `@austencloud/tka-pictograph` to `../packages/tka-pictograph/src/index.ts`, alongside the existing `@tka/render-core` alias.
- [ ] `standalone-renderer.ts` keeps `StandaloneRenderer` and `getStandaloneRenderer` with the same public methods:
  - `renderToSvg` calls `renderPictographSvg(input, { ...options, art: this.art })`, where `this.art` is `fsArtSource(assetsRoot)`, made once;
  - `renderToPng` is unchanged apart from calling that `renderToSvg`;
  - it re-exports `PictographInput`, `MotionInput` and `RenderVisibilityOptions` from the package, so `pictograph-tools.ts`, `sequence-renderer.ts` and the tests keep their imports.
- [ ] Run `npm test` in `mcp-server-pkg` (it builds, then runs vitest). Expect the same pass count as before the move; record both counts.
- [ ] Run `npm run test:card-mcp-parity` and `npm run test:render-parity` at the root. Record the results; investigate any difference from main before going on.
- [ ] Commit: `refactor(mcp): knowledge server renders pictographs through tka-pictograph`.

### Task 5: Browser path and package contents

- [ ] Test: start a local static server on a free port over `packages/tka-pictograph/assets` (Node `http`, on a port the test picks itself), render every baseline case through `urlArtSource("http://127.0.0.1:<port>/")`, and expect byte-for-byte equality with the baselines.
- [ ] Run `npm pack --dry-run` in the package. Check the file list holds `dist/`, `assets/`, `LICENSE` and `package.json` and nothing else. Record the tarball size in the commit body.
- [ ] Run the build and its no-Node check.
- [ ] Commit: `test(pictograph): browser art source renders the same SVG`.

### Task 6: Finish

- [ ] Update the spec where the build differed:
  - the `start` filter replaces `startPlacement` and `startPosition`;
  - `fsArtSource` is async;
  - `tka-glyph-loader` stays in the knowledge server, because only the canvas word header uses it.
- [ ] Run `npm run check:fast` on d2 with `scripts/d2-run.ps1` if it covers this branch; otherwise run the package and knowledge server tests above on d2.
- [ ] Leave the worktree and run `npm run wt:finish -- codex/pictograph-package --nonvisual` from `E:/tka-platform`. Stop on any gate failure with the branch intact.
- [ ] Do not publish. Report the package name, version, tarball size and the test counts.
