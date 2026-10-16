# @austencloud/tka-pictograph

Draws The Kinetic Alphabet's pictographs as SVG: the grid, props, arrows, turn numbers and letter, from Austen Cloud's own renderer and art. The same renderer makes the pictographs in the TKA knowledge server. It runs in a browser, a desktop webview or Node, and works offline.

## Use

```ts
import { pictographsForLetter, renderPictographSvg } from "@austencloud/tka-pictograph";

const [a] = pictographsForLetter("A", { start: "alpha" });
const svg = await renderPictographSvg(a, { darkMode: true, leftPropType: "staff", rightPropType: "staff" });
```

`renderPictographSvg` returns an SVG document 950 units square (`PICTOGRAPH_VIEWBOX`). Put it in the page as markup or as an image source.

A pictograph is a `PictographInput`: the letter, the start and end placements, the grid mode, and one `MotionInput` per hand (motion type, rotation direction, start and end location, turns and start orientation). End orientations are worked out when they are left out. `pictographsForLetter` returns every version of a letter from the TKA dataframe with no turns and both props starting in; `start` keeps those that start at one placement (`"alpha3"`) or a group (`"alpha"`).

`handColor(hand, darkMode)` gives the colour each hand is drawn in, so the rest of an app can match.

## Art

The art ships in the package's `assets/` folder, about 5 MB, and loads only when a pictograph needs it.

- **Default:** with no `art` option, files are fetched from `assets/` next to the package's `dist/`. This works in development and in Node.
- **A production web build:** copy `node_modules/@austencloud/tka-pictograph/assets/` into your public folder and pass its URL:

  ```ts
  import { urlArtSource } from "@austencloud/tka-pictograph";
  const art = urlArtSource("/tka-pictograph/");
  await renderPictographSvg(input, { art });
  ```

  Reuse one source; it caches what it has fetched.
- **Node, from disk:** `const art = await fsArtSource(pathToAssets)`.
- **Your own source:** any object with `read(path): Promise<string | null>`, returning `null` for a file that does not exist.

## License

Elastic License 2.0; see `LICENSE`. Austen Cloud's MIT-licensed render-core calculations are bundled in `dist/`.
