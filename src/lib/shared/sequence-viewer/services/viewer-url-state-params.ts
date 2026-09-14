/**
 * Viewer URL parameter names, split out of `viewer-url-state-codec.ts`.
 *
 * IMPORT BOUNDARY. The codec compresses the `s` blob through
 * `navigation/services/sequence-codec`, which statically imports `fflate`
 * (210 KB raw / 72 KB gzip once bundled). The root layout's
 * `url-parameter-policy` needs nothing from the codec except this list of five
 * strings, so importing it from the codec put the whole compression stack on
 * every route's hydration path. Measured 2026-09-12: that chunk was one of the
 * two large entries in the boot preload set for `/`, `/create` and `/browse`.
 *
 * Keep this module dependency-free. `viewer-url-state-codec.ts` re-exports the
 * list so existing importers are unaffected, and
 * `tests/unit/boot-import-boundary.test.ts` enforces the rule.
 *
 * Viewer mode rides on `pane`, not `vm`: printed QR cards already own `vm`
 * as the BROWSE view-mode code (`short-code-manager.ts` prints `vm=hsb`),
 * and physical artifacts cannot be re-parameterized.
 */
export const VIEWER_STATE_PARAM_NAMES = [
  "pane",
  "split",
  "fx",
  "cols",
  "s",
] as const;
