---
status: active
value: null
effort: null
remaining: "Verify Post Share Sheet — Handoff against src/lib/shared/share/components/PostShareSheet.svelte before resuming implementation. Prior recorded remainder: Reconcile the PostShareSheet handoff open-item list against current share flow and test the remaining transitions."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Post Share Sheet — Handoff

**Written for a fresh agent picking this up cold.** Read this, then the design
doc: `docs/superpowers/specs/active/2026-08-09-social-post-handoff-design.md`.
The design doc says what we are building and why. This says what exists, what
is proven, what is still wrong, and which traps have already been paid for.

Date: 2026-08-10. Branch: `main`. Feature lives in `src/lib/shared/share/`.

---

## 1. The job

Austen wants the distance between *"I like this animation"* and *"it's on my
Instagram"* to be as short as the platforms allow. He picked **approach C**:
ship the handoff rail first (zero Meta dependency), add the auto-post API
behind it. Then: *"fully implement, ask me if u need help."*

## 2. His decisions — treat these as settled, do not re-ask

| Question | His answer |
|---|---|
| Device | Desktop and phone, roughly equally |
| Accounts | Personal IG + personal FB, an IG Business/Creator account, and a Facebook Page |
| Artifact | Both card and video; he picks at post time |
| Render wait | "Sheet opens instantly, video fills in" |
| Caption | Selectable at post time **and** pickable from pre-created options: word + tka.run link + hashtags |
| Public upload URL | **No warning, no consent gate.** He rejected one explicitly: *"these are just sequences maybe it doesn't even matter... This isn't personal data... there's no privacy concerns here."* Presigned/unguessable URLs, and that is the end of it. Do not add a privacy affordance. |

Generated/humor-profile taglines are excluded from captions. Generated voice
posting as Austen was rejected during the ghost-presenter work; that judgment
carries here.

## 3. What exists today

All committed on `main`. Local `main` is **ahead of `origin/main`** — see §7.

| Commit | What landed |
|---|---|
| `7d5893355c` | The sheet itself: artifact pick, caption, device-resolved destinations, R2 `uploadShareArtifact` |
| `3966415de1` | Sheet reworked into a real share sheet (one filled CTA + tile row) |
| `4b6ae658ce` | Phase 2 client + `firebase-functions/src/share/` (`startMetaConnect`, `completeMetaConnect`, `disconnectMetaAccount`, `publishToMeta`) |
| `89ea20b216` | `META_POSTING_ENABLED` gate |
| `0b1148f39f` | Reachability crash fix + the appearance pass (§5) |
| `eaf649ab21` | The tka.run caption fix (§6) — **swept into another session's commit**, see §7 |

Component: `src/lib/shared/share/components/PostShareSheet.svelte`
Services: `post-handoff.ts`, `meta-publish.ts`, `r2-video-uploader.ts`
Caption store: `src/lib/shared/share/state/caption-presets.svelte.ts`
Visual harness: `src/routes/test/post-share-sheet/+page.svelte`
(<https://localhost:5173/test/post-share-sheet>)

Rendered **only** from `SequenceViewerShell` (`.claude/rules/sequence-viewer-shell.md`),
so the drawer, `/q/[code]` and `/sequence/[id]` get it by construction.

### The feature flag

`META_POSTING_ENABLED = import.meta.env.DEV` in `meta-publish.ts`. On at
localhost so the whole sheet is testable; off in builds, because pushing `main`
deploys Cloudflare Pages but **firebase-functions deploy is manual**
(`reference_prod_stale_deploy_publish_broken`) — an ungated connect chip would
reach production ahead of its callable. Hardcode `true` once Meta app review
lands. `metaStatusOverride` is the harness's seam for reaching all three
connection states while the flag is off.

## 4. How the sheet is wired (the two load-bearing behaviors)

1. **It never blocks on a render.** The card blob is cached
   (`sharer.getCardImageBlob`, `stepSize: 240` → a 480×795 PNG) and lands
   immediately. Picking Video kicks the export off; destinations stay
   disabled-with-progress until the blob exists.
2. **Nothing resizes when state changes** (`.claude/rules/no-layout-shift.md`).
   The preview stage is a fixed box, the status line reserves its row, the QR
   view swaps inside a min-height stage.

## 5. The appearance pass (his defect list, and what was done)

He rejected the sheet bluntly. Each item and its fix:

| His words | Fix |
|---|---|
| "doesn't even jive with the rest of the styles of my app" | Rebuilt on app primitives and tokens throughout |
| "what's this fucking image icon for facebook" | `copy-image-facebook` now carries `brand: "facebook"` and renders the inline Facebook SVG the app has shipped since sign-in |
| "I'm not even in a page where I can test it" | Real crash: `getShareUrl is not a function`. Two lines added to `viewer-orchestrator-context-state.svelte.ts` (handler type + exposure). Fixed and verified. |
| "this made up card" | Now the real cached card render |
| "Switcher... looks like you hand rolled it" | `SegmentedControl` (`.claude/rules/chip-primitives.md`) |
| "I don't know if you're using my Canonical chips" | `FilterChipBase` |
| "letters for the word... not rendering in the TKA font" | `TKAWordGlyph` |
| "the word share at the top fucking for no reason" | Eyebrow deleted |
| "a giant ass X up at the top right" | Down to a normal close control |

Also fixed in that pass, found only by looking at frames: 765px of dead column
around a 480px card at 3840 (stage track pinned to `32rem`/`34rem`, 3200 tier
pulled to `96rem`); 204px of empty drawer at 2160 (`Drawer.css` floors bottom
sheets at `min-height: 50dvh` — scoped `min-height: 0` override); a 174×288
card on an 820×1180 tablet with 260px of viewport unspent (`--stage-h` raised
so the `30vh` cap binds).

**Do not repeat this experiment:** at the fold tier (960×412) the stage column
was made `auto` / `min-content`, and `.stage { width: min-content }` was tried.
All three shrink the stage *box* to 144px but leave the *track* at 299px,
opening a 155px hole between card and controls — worse than the card centered
in its column. The second grid track is content-floored by the CTA (477px
min-content), so the first track is just "the leftover". Reverted; tracks are
back to 356.5 / 419.5.

## 6. The caption link (done today) — and why it is NOT tka.run

He saw the long viewer URL in the caption: *"we need to use the short code that
is abysmal."* He is right — `getShareUrl()` returns a `buildViewerShareDetails`
URL that carries the whole sequence inline and runs past 200 characters.

Then he named the danger in using the code: *"the short code's supposed to be
reserved for QR scans only. So maybe we should use tkaflowarts.com/q/CODE."*
The instinct is right and the destination is not — **`/q/` IS the scan route**,
and tka.run redirects into it. `qr/utils/scan-detection.ts` says so in its own
header: browser navigation timing cannot tell a camera scan from a clicked
link, so *the route is the attribution boundary*. Proven on a dev server: a
plain browser visit to `/q/EHWE` wrote `tka:scanned:EHWE:legacy` to
sessionStorage and entered the scan funnel. Every click from an Instagram
caption would have counted as a physical-card scan.

The share route is `/sequence/[id]` — no scan tracking, and it already tries
`resolveShortCode(id)` before anything else. So the caption link is
**`https://tkaflowarts.com/sequence/CODE`**, built by `buildPostLink` in
`post-handoff.ts`. It is also exactly what the page emits as its own canonical
URL (`routes/sequence/[id]/sequence-seo.ts`), and it puts the real domain in
the caption instead of an unrecognized shortener.

**That route was broken.** `/sequence/<anything that is not an inline blob>`
threw `getShortCodeManager(): call configureShortCodeManager() first` and
dead-ended at "Failed to load sequence" — short codes, library doc ids and
sync-room ids alike. Cause: the root layout only imports `composition-root` in
app mode, and this standalone route never got the registration. Fixed in
`SequenceViewerPage.svelte`'s `onMount` with the same guarded stub-loader
pattern `/q/[code]` and the store's `hero-scan-code.ts` already use.

The rest of the caption behavior:

- The sheet mints `createShortCode(sequence, { embedSequenceData: true })` on
  open — the same call `ShareButton.svelte` makes. Content-deduped, so an
  existing code comes straight back.
- Until it lands the caption is **just the word**. The long URL never appears,
  not even for a frame.
- The `shareUrl` prop is used only when it is already a post link (`isPostLink`
  — prefix plus a 4–6 char code). The harness passes one; the viewer's long URL
  is dropped.
- Captions lowercase scheme and host (`forCaption` in `caption-presets`). Codes
  are minted `HTTPS://TKA.RUN/CODE` because uppercase is what QR alphanumeric
  mode encodes densely; `new URL(...).toString()` lowercases scheme+host and
  leaves the path alone. **The code's case must survive** — the resolver reads
  `doc(firestore, SHORTCODES_COLLECTION, code)`, which is case-sensitive.
- Short codes are **signed-in only**, and a sequence that mixes one-hand and
  two-hand choreography throws `MIXED_CHOREOGRAPHY_UNSUPPORTED`. Both are
  ordinary: the caption carries the word alone and the share still works.

Verified on a dev server: `/sequence/EHWE` loads the right sequence (word A)
and writes **no** scan key; the viewer's sheet settles to
`"A — https://tkaflowarts.com/sequence/EHWE"`; the harness reads
`"FΨ — https://tkaflowarts.com/sequence/A3F9"`. `svelte-check` 0/0, 344 share +
shell-contract tests pass.

## 7. Repo state — read before you commit

- Local `main` is **13 commits ahead of `origin/main`** and nothing here has
  been pushed. Pushing `main` deploys the Cloudflare Pages site
  (`reference_cf_pages_deploy_topology`), and most of those 13 belong to other
  sessions, so the push is Austen's call, not yours.
- `eaf649ab21` (authored by another session, Fable 5, 12:47 today) **swept the
  in-progress caption files into its own commit** along with unrelated QR
  encoder, ViewerHeader and test changes. The caption work is safe and correct,
  just filed under someone else's message. Per
  `.claude/rules/commit-only-your-own-changes.md`, history is not to be
  rewritten while parallel agents are running — Austen reconciles if he cares.
- Many unrelated 3D/scene files are dirty from other sessions. **Commit with an
  explicit pathspec** (`git commit -m "…" -- path/a path/b`), never a bare
  commit.

## 8. Open items, in the order they matter

1. **The visual bar is not settled.** After the appearance pass he still said
   the sheet was *"completely inconsistent with the rest of my program."* That
   judgment is from the pre-fix build, but treat it as unresolved until he
   says otherwise. One thing visible in the current 1920 frame: the caption
   textarea is ~200px tall holding one line of text, because its grid row takes
   the `1fr` slack from the tall card column. It is a compose field so the size
   is defensible, but it is the biggest pool of dead space in the sheet.
   **Screenshot before you touch anything** — the required viewports are in
   `.claude/rules/visual-verification-mandatory.md`, and note the DevTools
   emulate DPR quirk in §9.
2. **Phase 2 needs Meta app review** before `META_POSTING_ENABLED` can be
   hardcoded true. External steps: `docs/reference/meta-posting-e2e-checklist.md`.
   The functions exist but are **not deployed** (manual deploy).
3. **Real end-to-end proof is still owed** per the design doc's verification
   list: `navigator.share` reaching the Instagram app with a real video File on
   a phone, and a QR scanned on a real phone saving the video to the camera
   roll. Neither can be done from this machine — they need Austen's phone.
4. **Link previews on `/sequence/CODE` are generic.** Its `+page.server.ts`
   resolves SEO meta by published-doc id, so a short code misses and the OG
   card falls back to the default image. `/q/[code]`'s server load reads the
   shortcode doc and gets the real thumbnail. It does not bite the main flow —
   Instagram ignores links in captions, and a Facebook photo post renders the
   photo, not a link card — but a bare link shared anywhere else looks plain.
   The fix is teaching the `/sequence` server load to resolve a code the way
   `/q` does.
5. Phase 3 (post history, scheduling, carousels) is deliberately unscoped.

## 9. Traps already paid for

- **DevTools `emulate` DPR quirk** (`reference_devtools_emulate_dpr`):
  non-mobile viewports need target × 1.1 — `2112x1188x1` → `innerWidth` 1920,
  `1584x990` → 1440, `1056x453` → 960, `902x1298` → 820, `2816x1584` → 2560,
  `4224x2376` → 3840. Mobile emulation (`375x667x1,mobile,touch`) honors the
  value exactly **but remounts the app and closes the drawer** — take the phone
  frame from the test harness route instead.
- **The Browser pane could not composite** during this work ("the Browser pane
  is not displayed"), so verification ran through Chrome DevTools MCP against
  an existing agent dev server on `:5174`. `:5173` is Austen's — never touch it.
- **Vitest needs its config**: `npx vitest run <path> --config tests/config/vitest.config.ts`.
  A bare invocation picks the wrong environment.
- **The card preview is a fixed raster** and its aspect is data-dependent (more
  steps → more rows → taller). No fixed aspect ratio can be hardcoded, and it
  cannot be upscaled without blur or a forked render.
- **Don't drive Austen's signed-in browser session** to test minting. Codes are
  a Firestore write on his account.

## 10. Related

- `docs/superpowers/specs/active/2026-08-09-social-post-handoff-design.md` — the design
- `docs/reference/meta-posting-e2e-checklist.md` — Phase 2 external setup
- `.claude/rules/sequence-viewer-shell.md` — why the sheet lives in the shell
- `.claude/rules/visual-verification-mandatory.md`, `4k-native-layout.md`,
  `no-layout-shift.md`, `chip-primitives.md`, `simplified-word-display.md`,
  `commit-only-your-own-changes.md`
- Memory: `project_social_post_handoff`
