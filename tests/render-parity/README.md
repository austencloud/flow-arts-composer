# Card rendering parity

`npm run test:card-mcp-parity` compares the real browser `ImageComposer` export
against both the source and packaged MCP renderers. It compares the same inputs
at the same output size; it does not compare an adapter to its own screenshot.

The corpus covers light/dark exports, explicit and default difficulty badges,
physical print frames, LOOP periods/reflection/overlay metadata, repeated titles,
custom hand colors, mixed fan/staff props, and footer notes. Header, body, and
footer are measured separately so the large white body cannot hide a missing
badge. A deliberately removed badge must fail the header tolerance.

For visual investigation, run `pnpm exec tsx tests/render-parity/serve-card-parity.ts`
from the repository root and open the printed loopback URL. The page uses the
same Composer fixture adapter as the automated test. PNG triplets and metrics
are written to the ignored `.artifacts/card-parity` directory. The run also
renders the product presets in `card-profile-cases.ts` (Composer export, viewer
Auto, poker print) and saves `.artifacts/card-parity/card-profiles.html`, a
self-contained side-by-side review that opens without the server. Preset
layouts are guarded by `tests/unit/card-profile-cases.test.ts`. In a fresh
worktree, build the workspace packages and run
`node mcp-server-pkg/scripts/sync-card-assets.mjs` first. Stop the server after
review.

## Owners

- `@tka/render-composition` owns header/footer geometry, badge calculation,
  title simplification/compression, text placement, mandala paint, and print frame.
- `@tka/render-core` and canonical static data own pictograph positioning.
- Browser and MCP use the exact same bundled Gelasio WOFF2 files. MCP uses Skia,
  with explicit font registration; host-installed fonts are not a requirement.
- `mcp-server-pkg/scripts/sync-card-assets.mjs` copies canonical font/glyph/prop
  assets into the distributable package. Do not edit the copies independently.

Web App CI runs the cross-renderer test and rejects stale packaged assets.
When changing card rendering, update the shared owner and add a representative
fixture for any new option. Do not widen tolerances to accept a visible defect.
Small rasterization differences are distinct from missing content or displaced
geometry; inspect the saved difference image before changing a tolerance.

The `composer` and `print` profiles intentionally have different dimensions and
badge scales. Compare matching profiles and options. This suite covers image
exports, not every interactive card state or externally generated QR payload.
