# Per-Sequence Preview Image (Design, Not Built)

Status: proposal, 2026-11-10. Nothing here is implemented. Prices marked
"unverified" were not checked against a current price page.

## What exists today

- `/sequence/[id]` and `/q/[code]` already put a per-sequence image in
  `og:image` when the record carries one. `firstTrustedThumbnail`
  (`src/routes/sequence/[id]/published-meta.ts`) takes the first `thumbnails`
  entry on a catalog or public record; a short code's own `thumbnailUrl`, or
  its source sequence's, is used the same way
  (`src/routes/sequence/[id]/short-code-meta.ts`). Both go through
  `toTrustedThumbnailUrl`, which accepts only HTTPS URLs on Firebase Storage,
  Google Cloud Storage or `tkaflowarts.com`.
- Everything else falls back to `/branding/og-image.png`.
- Thumbnails are drawn in the browser, never on the server. A save renders the
  card through the share service and uploads it
  (`LibrarySaveService.generateAndUploadThumbnail`, then
  `LibraryRepository.attachThumbnail`, which mirrors the list onto the public
  record). `ThumbnailRenderOrchestrator` reads static, IndexedDB and cloud
  caches and renders with Canvas2D as a last resort, all client-side.
- `src/routes/render-pictographs` is a browser harness that exposes a render
  function for scripts; it is not a server renderer. `src/routes/oembed`
  returns oEmbed JSON from the same published meta and renders no image.
- No server-side card or pictograph render exists in the Worker.

Coverage: no code or doc records what share of records carries a thumbnail.
A public sequence saved while signed in normally gets one (the upload runs
after the save); records saved before that path existed, codes minted without
`thumbnailUrl`, and codes whose source is not a published record (ACCT: its
`sourceSequenceId` is the word "Δ-ΛRZ") get the default image. Finding the
real share needs one counting query against production, which this design did
not run.

## Recommendation, cheapest first

1. **Use the stored thumbnail (zero cost, already live).** Keep it as the
   first choice. The work left is filling gaps without new services: when a
   short code is minted from a saved sequence, copy that sequence's first
   trusted thumbnail onto the code record, so the link preview needs no second
   read. This raises no metered usage beyond the write that already mints the
   code.
2. **Backfill missing thumbnails from the browser (zero new service).** When a
   signed-in owner opens one of their own public sequences that has no
   thumbnail, render and upload it through the existing save path. Costs the
   same Firebase Storage write and egress a normal save does.
3. **Server-rendered image (adds metered usage; only if 1 and 2 leave too
   many gaps).** Described below.

## Option 3: what, where, cache

- **What to show.** The card front, the same image a save uploads, so a
  preview matches what people print and share. A pictograph strip would need
  a second layout and a second visual review.
- **Where it renders.** Not in the page Worker. The card render is Canvas2D
  plus fonts and SVG assets; doing that in a Worker means a WASM rasteriser
  (for example resvg) and is very likely past the Workers Free 10 ms CPU limit
  per request (unverified for this workload). The cheaper place is a one-time
  render when the code or public record is written (a Cloud Function or the
  saving browser), stored once, then served as a static file.
- **Caching at the edge.** Serve the stored PNG with a long
  `Cache-Control: public, max-age=31536000, immutable` under a content-hashed
  name, so Cloudflare's CDN keeps it and crawlers rarely reach the origin.
  The page HTML itself stays uncached as today; only the image is cached.

## What would add or raise metered usage

| Piece                              | Service                           | Free allowance                                                         | Beyond it                                                    |
| ---------------------------------- | --------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| Render in the page Worker          | Workers                           | Free plan: 100,000 requests/day, 10 ms CPU each                        | Paid plan $5/month plus usage (unverified)                   |
| Store rendered PNGs                | R2                                | 10 GB stored, 1M writes, 10M reads a month; no egress fee (unverified) | about $0.015/GB-month, $4.50 per million writes (unverified) |
| Resize or convert on the fly       | Cloudflare Images transformations | 5,000 unique transformations a month (unverified)                      | about $0.50 per 1,000 (unverified)                           |
| Serve existing thumbnails          | Firebase Storage egress           | Blaze free tier, amount not confirmed (unverified)                     | per-GB egress (unverified)                                   |
| Look up the record per crawler hit | Firestore reads                   | 50,000 reads/day (unverified)                                          | about $0.03 to $0.06 per 100,000 (unverified)                |

Notes on the table:

- Firestore reads per crawler hit already happen today: `/sequence/<code>`
  reads the public record, the short code and at most one source record, plus
  the release manifest list cached per isolate;
  `/q/<code>` reads the code and at most one source record. Option 1 removes
  the source read for new codes. Option 3 adds no read if the image URL is
  stored on the record.
- A crawler fetches `og:image` once per share in most apps, then caches it, so
  image egress grows with shares, not with views.
- Firebase Storage egress is the one cost options 1 and 2 keep. Pointing
  `og:image` at a CDN-cached copy would cut it but adds R2 storage.

## Decisions for Austen

- Whether gaps are common enough to justify option 3 at all. Measuring that
  takes one production count query.
- If option 3 goes ahead: R2 plus a write-time render (small, mostly inside
  free allowances) versus a Workers Paid plan for render-on-request.
