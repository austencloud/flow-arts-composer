# QR reuse verification — September 8, 2026

Sequence QR generation now checks a prepared-artifact cache before warming
pictographs or allocating a short code. Only a successful strict warm of both
themes can populate this cache. Fresh publishers probe existing cloud cells
before rendering. The viewer invalidates its QR when encoded motions change,
even if the sequence ID stays the same.

The cache persists SVG artwork and its short link in IndexedDB and shares them
as `prepared-qrs/{hash}.json` in Firebase Storage. Keys include encoded sequence
content, both themes' canonical cell keys (including renderer revisions), prop
configuration, view mode, attribution parameters and artwork options. Existing
QR images without a readiness record take the preparation path once.

Verification:

- 28 focused unit tests passed across the generator, cache, cell preparation
  and viewer QR lifecycle.
- Three Storage emulator tests passed against the isolated `demo-qr-reuse`
  project: public reads; authenticated, bounded creation; and rejection of
  replacement, deletion and listing by later viewers.
- Svelte check reported zero errors and zero warnings.
- In a task-owned browser, the real QR generator produced an SVG, which was
  returned by a simulated shared-cache response. The first retrieval took
  1.7 ms; reopening through a new cache instance and real IndexedDB took 0.9 ms.
  There was one shared-cache read, zero cell warmer calls, zero short-code calls,
  and identical artwork. These are local fixture timings, not production
  network measurements. The resulting QR was visually inspected.
- No production data, Storage rules or application deployment was changed
  during verification. The temporary browser fixture and server were removed.

The `prepared-qrs` Storage rules were deployed on September 8 after explicit
authorization. The live rules were preserved outside that added block. Public
downloads were verified against the deployed bucket. Production viewers use
the new lookup path after the application change goes through the normal release.

## Bulk baking

A read-only inventory on September 8 found 22,070 durable Firestore shortcodes
and no objects under `prepared-qrs/`. The standard viewer uses 200px modern QR
artwork; baking the saved prop configuration in both themes means at most
44,140 images before content deduplication. Other prop selections, view modes
or export sizes remain generated on demand.

`startScanQrBake` in `shared`'s consumer
`src/lib/features/library/services/warm-all-scan-cells.ts` extends the existing
backfill with QR publication. It preserves each existing code via
`ShortCodeManager.urlForExistingCode`, rather than allocating replacement
links. Both scan themes must finish warming before artwork is published;
publication is checked against public Storage independently of local caches.
Four sequence lanes bound QR work. Cancellation and failed-code lists reuse
the existing backfill contract; pass a failed-code list through `listCodes` to
retry. Already published artwork is reused.

The completed implementation passed 39 focused tests after updating from main,
plus the Node publication-error regression. Svelte check reported zero errors
and warnings.

## Admin runner

`scripts/bake-existing-qrs.mjs` runs the same payload hydrator, canonical cell
keys, pictograph preparer/compositor and QR styling owner in Node. The Node
adapter provides Canvas, local static assets and SVG decoding; it does not
duplicate drawing geometry. Four worker threads draw QR SVGs from the options
supplied by `QRCodeGenerator`. Their eight concurrent test results decoded to
the expected existing link in both themes.

Four additional workers prepare and compose missing pictographs through Vite's
ModuleRunner transport, sharing the existing module loader without starting
HTTP servers. Eight worker results matched the original Node composition path
byte for byte. A warmed parallel sample rendered 48 cells in 694 ms. Uploads
are capped at 32 concurrent requests and identical cells join one pending job.

The runner reads shortcode records in pages of 500 and keeps a local snapshot
for resumable passes. `--refresh` replaces that snapshot with a fresh read.
It inventories existing Storage objects, fills missing canonical cells, then
publishes both QR themes. Render diagnostics and missing prepared props reject
the cell before upload. All writes are create-only with a generation
precondition; no shortcode records, ownership or scan counters are changed.

Required arguments are `--credentials`, `--canvas-module` (an installation of
`@napi-rs/canvas`) and `--output-dir`. `--apply` enables artifact writes; omitting
it performs an inventory. `--limit` bounds a sample and `--concurrency` accepts
1–8 sequence lanes. The output directory contains `shortcodes.json`,
`report.json` and `artifact-manifest.json`. Retain it for retries and keep its
sequence snapshot out of version control. The runner exits with code 2 if any
records failed. It starts no application HTTP listener and closes Vite's
websocket, watcher, renderer and workers.
Creating an empty `STOP` file in the output directory stops cleanly between
sequences; remove it before resuming. A regression test verifies that missing
assets and repeated decode errors still reject publication when interactive
drawing code catches those errors.

The production sample covered 10 codes: 20 QR images and 173 missing canonical
cells were published. All 20 public QR downloads decoded to their exact stored
shortcode URL and prop parameters. The full snapshot subsequently contained
22,072 codes, including two created during inventory.

The full pass found `C4OF` carrying `centere` where the rotation lookup expects
`centerE`. Both prop-angle entry points now reuse the existing
`canonicalOrientation` owner. A narrowly scoped `orientation-case-v1` revision
invalidates old images for those spellings while preserving normal cell keys.
A census of the snapshot found only `C4OF` affected. Four regression tests cover
both angle entry points and the scoped invalidation, and its restored right
prop was directly inspected through the public image in a fresh browser tab.

## Final cloud audit

The initial full pass processed all 22,072 records. A follow-up inventory found
one newly created code and baked it too. Combining that pass with the orientation
repair gives **22,069 ready links out of 22,073**.

- **38,316** distinct prepared QR artifacts exist in public Storage. Identical
  sequence/configuration keys share artwork across historical duplicate codes.
- **123,596** canonical pictograph objects were verified present.
- No prepared QR artifacts or unexpected canonical cells were missing.
- **42** public QR downloads, including both repaired `C4OF` themes, decoded to
  their exact existing short links and prop parameters.
- The final full pass alone uploaded 87,710 missing pictographs; earlier
  preparation and repair passes filled additional cells.

Four legacy records remain excluded from readiness. Their 18 unresolved cell
hashes are retained in the failure report; publishing a ready QR would falsely
claim its scan assets were complete.

| Code     | Existing blocker                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| `EbMSwi` | Shift-arrow data contains a same-location `e → e` pair. The alternate encoded payload has no usable steps. |
| `VxjWho` | Shift-arrow data contains an unsupported `w → e` pair.                                                     |
| `GMT6`   | Requires the absent `anti_8.0.svg` arrow artwork.                                                          |
| `JPO9`   | Requires the same absent eight-turn arrow artwork.                                                         |

No choreography, shortcode ownership, destinations, or scan counters were
rewritten. Evidence and resumable snapshots are in the task-owned
`E:/tka-qr-bake-runtime` directory: `final-verification.json`,
`reconciled-report.json`, and `reconciled-manifest.json`.
