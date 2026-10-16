# TKA Pictograph Package

Approved by Austen on 2026-10-15.

## Goal

Other apps can draw real TKA pictographs from Austen's own renderer and art, in a browser or desktop webview, offline. The first user is Flow DNA Studio, Duncan Greenwood's LED choreography app, which today draws hand-made stand-ins for TKA letters.

## Decisions

- **Renderer, not images.** The app ships a package; it doesn't fetch pictures from tkaflowarts.com and doesn't get a fixed image set. Beats need every turns and orientation combination, offline.
- **Same license as the knowledge server package:** Elastic 2.0. The prop and arrow art already ship publicly inside `@austencloud/tka-domain-mcp`, so this exposes nothing new.
- **One renderer.** The knowledge server's `StandaloneRenderer` becomes the package's renderer. It is not copied, and the Composer's on-screen Canvas2D renderer is not extracted.
- **Props come from Austen's prop system.** The consumer passes a prop type; fan and buugeng art exist today. Bringing Duncan's own props into the prop system, credited to him, is a separate task.

## Architecture

### Art source

`StandaloneRenderer.renderToSvg` reads every piece of art (props, arrows, turn numbers, letters, VTG glyphs, elementals, grids) with `readFileSync` and `existsSync` under `assets/`. So does `arrow-adjustment.ts`, which reads the arrow placement JSON under `assets/data/arrow_placement`. (`tka-glyph-loader.ts` serves the sequence cards, not the pictograph renderer, so it stays in the knowledge server.) All of those reads go through one interface instead:

```ts
interface ArtSource {
  /** Text of the art file at this path under assets/, or null when absent. */
  read(path: string): Promise<string | null>;
  /** Optional synchronous read, for sources that can answer at once. */
  readSync?(path: string): string | null;
}
```

- `fsArtSource(root)` reads from disk and answers synchronously. It is async to create (`await fsArtSource(root)`) because it loads `node:fs` with a dynamic import, which keeps Node out of the browser bundle. The knowledge server uses it, so its behavior is unchanged.
- `urlArtSource(base)` fetches from a base URL. The package's default base is its own `assets/` folder, resolved with `new URL("./assets/", import.meta.url)`, so Vite, SvelteKit and Tauri serve the files and nothing loads until a pictograph needs it.
- Reads are cached per path for the life of the source.

As built, the 1,900-line renderer stays synchronous. It reads through a per-source cache: a path the cache doesn't hold yet is recorded as a miss and drawn without that art. `renderPictographSvg` then fetches every miss and draws again, up to ten passes, and returns the first pass with no misses. Warnings about missing art are logged only on that final pass. A disk source never misses, so the server draws once.

**Serving the art in production.** The default source resolves `./assets/` next to the bundled `dist/index.js`. That works in development and in Node, but a production Vite build may not copy the folder. An app that ships its own build copies the package's `assets/` into its public folder and passes `urlArtSource("/tka-pictograph/")` (or wherever it put them).

### Package

A new workspace package, `packages/tka-pictograph`, published as `@austencloud/tka-pictograph`.

- **Source:** the SVG half of `standalone-renderer.ts` and the modules it uses (`arrow-placement`, `arrow-adjustment`, `tka-glyph-loader`, `enums`, and the calculations it takes from `@tka/render-core`, such as `calculateOrientations`), moved into the package. The knowledge server imports `packages/tka-pictograph/src/render.ts` by relative path, the way it already reaches other workspace source, and keeps one-line re-export files for `enums` and `arrow-placement`, which other server code still uses. `render.ts` is the package's entry without the letter tables; `index.ts` adds them.
- **Stays in the knowledge server:** `renderToPng`, Resvg, `@napi-rs/canvas` and the Gelasio font registration that PNG output needs. None of them work in a browser.
- **Build:** esbuild, ESM, platform neutral, with `@tka/render-core` (MIT, unpublished) bundled in. A build check fails on any `fs`, `path`, `url` or `child_process` import except `fsArtSource`'s one dynamic `node:fs` import, and on any published declaration that names an `@tka/` package. Declarations are emitted only for files the public entry reaches; the hand colour helper and viewBox size live in `palette.ts` so those stay standalone.
- **Art:** a sync script copies what the renderer can reference from the canonical art into `packages/tka-pictograph/assets/`: grids, arrows, arrow placement data, trimmed letters, turn numbers, VTG glyphs, elementals and static props. It leaves out build previews and animated props.
- **Data:** the Diamond and Box pictograph dataframes, converted to JSON at build time for the letter lookup below.

### API

```ts
renderPictographSvg(input: PictographInput, options?: RenderVisibilityOptions & { art?: ArtSource }): Promise<string>

/** The letter's pictographs from the dataframe; `start` is an exact placement ("alpha3") or a group ("alpha"). */
pictographsForLetter(letter: string, filter?: { start?: string; gridMode?: "diamond" | "box" }): PictographInput[]

fsArtSource(root: string): Promise<ArtSource>
urlArtSource(base: string | URL): ArtSource
defaultArtSource(): ArtSource

handColor(hand: "left" | "right", darkMode: boolean, custom?: HandColorPair | null): string
PICTOGRAPH_VIEWBOX: 950
```

`PictographInput` and `RenderVisibilityOptions` are the knowledge server's existing types, moved with the renderer and exported unchanged.

`pictographsForLetter` is what lets a letter picker show the version of a letter that fits where a word currently ends, instead of one fixed drawing per letter.

## Release

- The package version starts at 0.1.0. The knowledge server takes a minor version bump because its internals moved, though its tools and output stay the same.
- npm publishing of a public package is free. Austen approves before each publish.
- Publishing runs from d1 because it needs Austen's npm login. Builds and tests run on d2.

## Testing

- **One renderer, proven:** the knowledge server's existing renderer tests pass unchanged after the move.
- **Same output:** for a fixed sample (A, β, γ, W-, Φ-, Λ, each at 0, 1 and 2.5 turns, staff and fan), the package's `renderPictographSvg` with `fsArtSource` returns exactly the SVG the knowledge server returned before the move. Snapshots are taken from the pre-move build.
- **Browser path:** a test imports the built `dist/index.js`, renders the same sample through `urlArtSource` against a local HTTP server, and gets the same SVG.
- **No Node in the bundle:** the build check above.
- **Letter lookup:** `pictographsForLetter("A", { start: "alpha3" })` returns only rows that start at alpha3, `{ start: "alpha" }` returns the whole group, and an unknown letter returns an empty list.

## First consumer: Flow DNA Studio

Built separately on an `austen/tka-pictographs` branch in Duncan's repo and sent to him as a pull request into `claude`, after this package is published. The details stay in that repository, which is private. In outline: the app adds this package, maps its own reading of each beat to `PictographInput`, and draws real pictographs in its letter picker and its sequence of beats. That pull request closes Flow DNA Studio issues 1 and 2 and covers most of issue 4.

## Out of scope

- Bringing Flow DNA props into the prop system.
- A pictograph image endpoint on tkaflowarts.com.
- Decoding construct links inside the package. Consumers already hold the motion data.
- Conjoined grids in the browser path: the input field moves with the renderer, but it gets no new browser testing here.
