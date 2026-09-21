# Card rendering parity

`npm run test:card-mcp-parity` compares the real browser `ImageComposer` export
against the source and package-source MCP renderers, plus the installed
package's `dist/card-renderer.js` when `MCP_PACKED_ROOT` is set. It compares
the same inputs at the same output size; it does not compare an adapter to its
own screenshot.

The corpus covers light/dark exports, explicit and default difficulty badges,
physical print frames, LOOP periods/reflection/overlay metadata, repeated titles,
custom hand colors, mixed fan/staff props, footer notes, step duration badges
(`duration` on a step), TnD accent tint (`accentColor`, `accentTintOpacity`),
and the published-link QR cell (`qrUrl`, with the mandala moved off that cell).
Header, body, and footer are measured separately so the large white body cannot
hide a missing badge. A deliberately removed badge must fail the header
tolerance.

The Start-cell L/R hand-color key also has its own cropped comparison. Removing
the key must fail that region, even when the change is too small to fail the
whole body. The same check runs against source, package-source, and installed
MCP output with the default, dark-mode, and custom hand colors.

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

A linked worktree needs three more things before the server runs: `npm ci`
inside `mcp-server-pkg` and `mcp-server` (their `@napi-rs/canvas` and
`@tka/*` links are not hoisted into the root `node_modules`), `pnpm exec
svelte-kit sync` for the generated tsconfig, and a way to point the harness'
`@tka/render-composition` import at the worktree copy. The Vite alias in the
server and the Vitest config already does that for the browser bundle; for the
Node side set `TSX_TSCONFIG_PATH` to an untracked tsconfig whose `paths` map
`@tka/render-composition` to `packages/render-composition/src/index.ts`.

## Owners

- `@tka/render-composition` owns header/footer geometry, badge calculation,
  title simplification/compression, text placement, mandala paint, print frame,
  the QR cell (slot, style, play icon, and paint), the duration badge, and the
  accent alpha. Reversal dots come from `deriveReversals` in
  `@tka/sequence-engine` on both sides.
- The QR is authored as a 600px styled SVG on both sides (`PRINT_QR_RENDER_SIZE`)
  and scaled into the cell; the MCP rasterizes it with resvg after unquoting
  `clip-path="url('#id')"`, which resvg otherwise ignores.
- `@tka/render-core` and canonical static data own pictograph positioning.
- Browser and MCP use the exact same bundled Gelasio WOFF2 files. MCP uses Skia,
  with explicit font registration; host-installed fonts are not a requirement.
- `mcp-server-pkg/scripts/sync-card-assets.mjs` copies canonical font/glyph/prop
  assets into the distributable package. Do not edit the copies independently.

Web App CI runs the cross-renderer test and rejects stale packaged assets.
Its required `Composer and MCP Card Parity` check also installs the release
tarball into an isolated directory and runs every comparison against that
installed renderer. A missing installed renderer fails the check; it never
falls back to the source checkout.

## Publishing and policy review

Run `npm run release:verify --prefix mcp-server-pkg` to build, pack, install,
and compare a release without publishing it. The tested archive and its
SHA-512 receipt are saved in `mcp-server-pkg/.release/` and uploaded by CI.
From a clean committed checkout, `npm run release:publish --prefix mcp-server-pkg`
runs the same gate and publishes those exact tested bytes. It never rebuilds
after verification. Direct directory publishing is blocked by `prepublishOnly`.
An account owner can still deliberately bypass local hooks; repository scripts
cannot revoke that authority.

`Card Render Policy Review` is a separate required status. Its workflow runs
from the trusted base branch, inspects changed filenames without executing PR
code, and requires Austen's approval in the `card-render-policy-review` GitHub
environment when fixtures, tolerances, or gate code change. Approval is tied to
that run and head commit; a new commit starts a new review. Changes to ordinary
rendering code need passing comparisons but do not need this manual step.

When changing card rendering, update the shared owner and add a representative
fixture for any new option. Do not widen tolerances to accept a visible defect.
Small rasterization differences are distinct from missing content or displaced
geometry; inspect the saved difference image before changing a tolerance.

## Live card ⇄ PNG export gate

`npm run test:live-card-png-parity` mounts the actual `LiveExportCard` and
screenshots its `ChoreoCard` through Chromium at the export's native dimensions.
It compares that DOM image with the real Composer PNG through the same
header/body/footer/Start hand-colour-key regions used above. The compact matrix
covers light and dark cards, footer, metadata with footer disabled, custom titles,
durations, custom colors, mixed props, QR plus mandala, column layout, a complete
visibility/header-off snapshot, and Auto.

Auto is deliberately a two-phase check: it first records the live container's
winner, asserts that the mounted DOM chose it, then freezes that winner in a
fresh native-size live mount before comparing it to the PNG. CSS preview size
is not mistaken for canvas resolution. QR tests use the already published
fixture URLs in `card-parity-cases.ts`; they never mint a code or upload data.

The test includes negative controls that remove the real header glyph and shift
the mounted card. Both must fail the regional limits. This runs in the required
CI parity job through `test:card-mcp-parity`; it is not an orphaned test file.
CI retains the live image, PNG export, and difference image for each case in its
`live-card-parity` artifact, including failed runs. The same gate exercises
Download intent, source replacement, retry, Auto sizing, phone containment, and
QR-independent readiness through the real components.

These browser test files run sequentially. Native MCP rendering executes
synchronously in the browser-command server; running it alongside the live
tests blocks their asset requests and can cause unrelated readiness timeouts.

The `composer` and `print` profiles intentionally have different dimensions and
badge scales. Compare matching profiles and options. This suite covers image
exports, not every interactive card state. The QR fixtures carry the real
viewer deep link for the steps on the card (`DEMO_SEQUENCE_LINKS`); short-code
minting stays outside the comparison.
