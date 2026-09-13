---
status: active
value: 4
effort: S
remaining: "Phases 1 and 2 are built and in the tree; nothing here needs implementing. What is left is Austen's: the Meta app configuration and review for instagram_business_content_publish, pages_manage_posts and publish_video (docs/reference/meta-posting-e2e-checklist.md), after which META_POSTING_ENABLED flips. Also unrecorded: the four device proofs under Verification (phone navigator.share of a real video File into Instagram; desktop QR scanned to a real camera roll; prefilled caption with a simplified LOOP word; sheet interactive within one frame while a render runs) and the seven-viewport sweep of the sheet."
depends_on: "external: Meta app review for instagram_business_content_publish, pages_manage_posts, publish_video"
plan_path: ""
tags: [share, social, meta, instagram, blocked-external]
last_triaged: 2026-09-13
---

# Social Post Handoff — Design

**Date:** 2026-08-09
**Status:** Phase 1 and Phase 2 BUILT; blocked only on Meta app review. This
header read "Approved, unimplemented" until 2026-09-13 even though the Phase 2
section below has listed what shipped since 2026-08-09 and Post Studio was wired
into the sheet on 2026-08-23. Corrected during spec reconciliation.

**Reconciliation evidence (2026-09-13):** every path in the Phase 2 "What
shipped" table exists -- `firebase-functions/src/share/metaConnect.ts`,
`publishToMeta.ts`, `metaGraphClient.ts`, `metaPublishPolicy.ts`,
`src/lib/shared/share/services/meta-publish.ts`,
`src/lib/server/auth/meta-oauth-proxy.ts`, and
`docs/reference/meta-posting-e2e-checklist.md`. The sheet lives at
`src/lib/shared/share/components/PostShareSheet.svelte` and still gates on
`META_POSTING_ENABLED` (lines 60, 327, 617). `sharePost()` is the Post Studio
seam at `sequence-viewer/state/viewer-shell-share-state.svelte.ts:117`. The kill
switch is deliberately off and must stay off until review lands -- that is a
preserved gate, not drift.

**Goal:** Collapse the distance between "I'm looking at this animation in the sequence viewer" and "it's posted on my Instagram/Facebook" to one tap on phone and roughly three clicks on desktop.

---

## The problem, measured

Today's desktop path to a Facebook post is ten steps and two waits:

open export drawer → pick settings → export → **wait for render** → file lands in
Downloads → new tab → facebook.com → Create Post → locate file → upload →
**wait for Meta transcode** → write caption → Post

The phone path looks like it should already work, and doesn't. `handleShare` in
`src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte:1196`
calls:

```ts
navigator.share({ title, text, url })
```

That is a **link-only** share. Instagram does not accept a URL share as a feed
post, so the OS share sheet is a dead end for the exact case this design exists
to serve. The mechanism is 90% built and aimed at the wrong payload.
`navigator.share({ files: [videoFile] })` is the fix.

### The three real friction sources

1. **The render wait.** Video export is the longest blocking step, and today it
   only *starts* after you've decided to post.
2. **The desktop→phone gap.** Composition happens on a 4K monitor; Instagram
   lives on a phone. That transfer is manual.
3. **The blank caption box.** Every time.

Auto-posting through the Meta API removes only the last four of the ten steps.
It is worth doing, but it is not where the pain is, and it is gated behind Meta
app review. Hence the staging below.

---

## Platform constraints (non-negotiable, verified)

| Target | API publishing | Consequence |
|---|---|---|
| **Facebook personal profile** | **Impossible.** Meta removed `publish_actions` in 2018 and never restored it. | Assist-only, forever. Render + prefill + handoff is the theoretical floor. |
| **Instagram personal** | Not supported — Graph API publishing requires Business/Creator. | Assist-only. |
| **Instagram Business/Creator** | Supported (`instagram_content_publish`). Requires media at a fetchable URL. | True one-click, after app review. |
| **Facebook Page** | Supported (`pages_manage_posts`), text/photo/video. | True one-click, after app review. |

Austen has all four account types, so both assist and auto-post paths have a
real consumer.

### Why a hosted URL is needed, and when

| Path | Upload required |
|---|---|
| Phone → OS share sheet → IG/FB app | **No.** The file is local; `navigator.share` transfers the bytes directly. Nothing touches R2. |
| Desktop → phone handoff | **Yes.** The phone must fetch the bytes from somewhere. |
| Graph API auto-post (Phase 2) | **Yes, mandatory.** Meta does not accept an upload; it fetches from a URL you supply. |

**Decision:** use `r2-presigner.ts` — unguessable key, expiring signature. Not
listed, not indexed, dead after expiry. No user-facing privacy warning: the
artifacts are abstract sequence animations containing no people and no personal
data. Do not add a consent gate for this.

---

## Architecture

One new capability owner, in the module that already owns sharing:

```
src/lib/shared/share/
  components/PostShareSheet.svelte     ← new: the sheet
  services/post-handoff.ts             ← new: destination resolution + dispatch
  state/caption-presets.svelte.ts      ← new: preset store (persisted)
```

Rendered from `SequenceViewerShell.svelte`, never from a host. This is required
by `.claude/rules/sequence-viewer-shell.md`: all viewer chrome lives in the
shell so the drawer, `/q/[code]`, and `/sequence/[id]` are identical by
construction. Hosts get deltas through the prop seam only.

**Seam change:** `handleShare` stops calling `navigator.share({ url })` and
opens the sheet instead. The overflow menu's **Copy Link** action is unchanged.

### Reuse ledger (per `never-hand-roll.md`)

Everything below is **reuse** or **compose**. The only **create** is the sheet
itself and the caption-preset store — no existing owner covers either.

| Need | Owner | Relationship |
|---|---|---|
| Artifact selector (Card/Video, exactly one) | `SegmentedControl` | Reuse |
| Caption preset chips (tap to fill) | `FilterChipBase` `mode="action"` | Reuse |
| Video render | `sequence-modal-exporter.svelte.ts` | Reuse |
| Card image | `Sharer.getCardImageBlob` (already cached) | Reuse |
| Presigned upload | `r2-presigner.ts`, `r2-video-uploader.ts` | Reuse |
| Short link | existing `tka.run` short-code system | Reuse |
| QR render | existing branded QR renderer (`qr` skill path) | Reuse |
| Word for caption | `simplifyRepeatedWord` | Reuse — mandatory, see below |
| State swap without layout shift | `Crossfade` (`fill`) | Reuse |

---

## The sheet

### 1. Artifact — `SegmentedControl`: Card · Video

**Card is the default.** `getCardImageBlob` is already cached, so the card path
is instantly actionable with zero wait — it is the lowest-friction thing that
can ship.

Selecting **Video** starts the render immediately and **does not block the
sheet**. Destination buttons render disabled with live progress and enable when
the blob lands. The user is never staring at a spinner with nothing to do.

Rejected: pre-rendering video on viewer open (a GPU render every open, mostly
wasted) and blocking on the render (today's behavior).

### 2. Caption

An **editable textarea** seeded by **preset chips**. The textarea is the source
of truth; chips only fill it. Presets:

- `{word} — tkaflowarts.com/sequence/{code}` — always correct, no authoring.
  **Not** `tka.run/{code}` or `/q/{code}`: those are the QR-scan route, which
  cannot tell a camera scan from a clicked link, so caption clicks would post
  as physical-card scans. See `buildPostLink` in `post-handoff.ts`.
- the above **plus the saved hashtag set** (edited once in settings, applies
  forever)
- any custom preset the user saves from the current text

The word **must** pass through `simplifyRepeatedWord`
(`.claude/rules/simplified-word-display.md`) — a LOOP caption must read `FΨ`,
never `FΨFΨFΨFΨ`.

**Explicitly excluded:** generated/humor-profile taglines. Generated voice
posting as Austen was rejected during the ghost-presenter work
(`project_ghost_presenter`), and that judgment carries here.

### 3. Destinations — resolved by device capability

**Phone** (`navigator.canShare({ files })` true):

- One **Share** button → `navigator.share({ files: [file], text: caption })` →
  the real OS sheet → Instagram / Facebook app. The caption rides along, so IG
  opens pre-filled. **This is the one-tap post.**

**Desktop:**

- **Copy image + open Facebook** — image to clipboard, caption to clipboard,
  composer opens in a new tab.
- **Send to phone** — QR of the presigned R2 URL. Scan → save to camera roll →
  post. This is what deletes the manual file transfer.

Every destination is a **button**, never a text link
(`.claude/rules/clickables-look-like-buttons.md`).

---

## Phases (do not lose these)

### Phase 1 — Handoff rail *(this spec, ships first)*

- Replace link-only `navigator.share` with the file-bearing sheet.
- Non-blocking video render with progress on the destination buttons.
- Caption composer + presets + persisted hashtag set.
- Phone: file share sheet. Desktop: clipboard+composer, and QR handoff.
- Presigned R2 upload **only** on the desktop-QR path (the phone path has the
  file locally and must not upload).
- Zero Meta dependency. Zero app review. No account connection required.

### Phase 2 — Auto-post to Business IG + Facebook Page *(built 2026-08-09)*

Additive, as planned: the post buttons appear in the same column once accounts
are connected, and Phase 1's shape did not need rewriting. Phase 1's handoff
tiles stay — they demote to the secondary row rather than disappearing, because
they still work when a token expires or review lapses.

**What shipped**

| Piece | Path |
|---|---|
| Connect handshake (start · callback · complete · disconnect · select Page · refresh) | `firebase-functions/src/share/metaConnect.ts` |
| Publish callable, one entry point for both targets | `firebase-functions/src/share/publishToMeta.ts` |
| Graph protocol (IG container→poll→publish; Page photo; Page reel 3-phase) | `firebase-functions/src/share/metaGraphClient.ts` |
| Pure policy — caption, media allowlist, status, error map, refresh window | `firebase-functions/src/share/metaPublishPolicy.ts` |
| Token + status stores | `metaConnectionStore.ts`, `metaConnectStateStore.ts` |
| Scheduled long-lived-token refresh (24h) | `refreshMetaTokens.ts` |
| Client seam — status subscription, callables, error copy | `src/lib/shared/share/services/meta-publish.ts` |
| Sheet UI — post CTAs, Page picker, setup row | `PostShareSheet.svelte` |
| Kill switch, off until review passes — `META_POSTING_ENABLED` | `meta-publish.ts` |
| Worker proxy (renamed, now carries both flows) | `src/lib/server/auth/meta-oauth-proxy.ts` |

**Decisions worth keeping**

- One `publishToMeta` callable for both targets. The caller's decision is "post
  this there", not "run the container protocol"; the protocol split lives in
  `metaGraphClient`.
- Meta fetches the media from R2 — it accepts no upload — so `publishToMeta`
  validates the URL against the app's own host before handing it over. A
  lookalike host (`media.tkaflowarts.com.evil.example`) is rejected.
- Instagram's container endpoint takes JPEG only; the card renders PNG, so the
  sheet converts before upload. Video must be H.264 MP4 and the sheet refuses
  anything else locally rather than letting Meta reject it minutes later.
- Tokens live in `metaPublishConnections` (Admin SDK only, `allow read: false`).
  The UI subscribes to a token-free mirror, `metaPublishStatus`.
- The Page picker is a `FilterChipBase` dropdown, not a `SegmentedControl` —
  Page names are unbounded user data and laying them side by side is what pushed
  the setup row past the sheet's width.
- Per Austen's call, **no public-URL warning and no consent gate.** These are
  sequences, not personal data.

- Posting ships behind `META_POSTING_ENABLED = false`. Pushing `main` deploys
  the site but not the functions, so an ungated connect chip would reach
  production ahead of the callable it opens.

**Still Austen's, and still the long pole:** the Meta app configuration and
review for `instagram_business_content_publish`, `pages_manage_posts` and
`publish_video`. Full checklist: `docs/reference/meta-posting-e2e-checklist.md`.
Nothing posts until that lands, and the handoff rail keeps working meanwhile.

Personal FB and personal IG stay assist-only. There is no version of this phase
that changes that.

### Phase 3 — Deferred, not scoped here

- Post history / "already posted" marker on a sequence.
- Scheduled posting.
- Multi-image carousel (`media-bundler.ts` already models this).

### Post Studio hands off through this sheet (added 2026-08-23)

Post Studio's render used to terminate at "Download MP4" — the studio composed
the post, then abandoned it one step short of the sheet built to deliver it.
Now the finished render leads with **Share post**, which opens this sheet as a
session about that file (`sharePost()` in `viewer-shell-share-state`), landing
on Video with the composed post in the slot, captions and destinations exactly
as specced above. The header's Share does the same while the studio is the
active pane. Download and Render again remain as secondary actions. A post
render left behind by the studio no longer stands in for a 3D scene share —
scene sessions record their own take.

---

## Verification

Per `.claude/rules/visual-verification-mandatory.md`, the sheet is a new
surface: screenshot at **1920, 2560, 3840, 1440×900, 820×1180, 960×412, 375×667**
before it is called done. Watch specifically for the wide-control failure — a
`SegmentedControl` of two short labels must size to its labels, not span the
sheet.

Functional proof required before any "done" claim:

1. Phone: `navigator.share` with a real video `File` reaching the Instagram app.
2. Desktop: QR scanned on a real phone, video saved to camera roll.
3. Caption arriving pre-filled, with a LOOP word rendering simplified.
4. Sheet interactive within one frame of opening while a video render runs.

---

## Related

- `docs/reference/meta-posting-e2e-checklist.md` — Phase 2 external setup
- `.claude/rules/sequence-viewer-shell.md` — why the sheet lives in the shell
- `.claude/rules/never-hand-roll.md`, `chip-primitives.md` — the reuse ledger
- `.claude/rules/simplified-word-display.md` — caption word handling
- `.claude/rules/clickables-look-like-buttons.md` — destination buttons
- `src/lib/shared/share/` — the module that owns this capability
