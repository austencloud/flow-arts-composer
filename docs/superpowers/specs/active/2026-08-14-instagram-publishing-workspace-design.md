---
status: active
value: null
effort: null
remaining: "Verify current publishing workspace gates and Meta app capabilities; obtain account review before any live publish path."
depends_on: "external: Meta app permissions and Austen account review for publishing"
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: blocked
---
# Instagram Publishing Workspace and Delivery Contract

**Date:** 2026-08-14

**Status:** Proposed. This document defines the implementation target but does
not mark any gate as implemented.

**Short review:** [Instagram Publishing: Austen Review Brief](./2026-08-14-instagram-publishing-austen-review.md)

**Capability owners:**

- `MediaCompositionProject` owns rendered pixels, rendered audio, timing, and
  reusable composition structure.
- `src/lib/shared/share/` owns post drafts, captions, destination choices,
  handoff, and publication records.
- `firebase-functions/src/share/metaGraphClient.ts` remains the only owner of
  outbound Instagram Graph requests.

**Extends:**

- [Post Studio Composition and Time Mapping](./2026-08-13-post-studio-composition-design.md)
- [Social Post Handoff](./2026-08-09-social-post-handoff-design.md)
- [Post Share Sheet Handoff](./2026-08-10-post-share-sheet-handoff.md)
- [Meta Posting Checklist](../../../reference/meta-posting-e2e-checklist.md)

## Decision

Build Instagram delivery as a capability-aware layer around Post Studio, not as
another media editor.

Post Studio continues to answer: **What will TKA render?**

Instagram Review answers: **How will Instagram receive and distribute it?**

Published Posts answers: **What happened after it left TKA?**

Those three questions use separate state and separate persistence. A saved post
draft references an immutable render revision. It does not copy the composition
timeline or take ownership of animation, card, crop, transition, BPM, or export
behavior.

The normal path stays short:

```text
Share
  -> preview and caption
  -> Review for Instagram
  -> Post now
```

Post Studio, carousel assembly, music selection, Trial Reels, scheduling,
collaborators, tags, disclosures, and post management appear when the chosen
format and connected account support them. Unsupported controls do not render.

`Finish in Instagram` remains available on every account. It is the correct path
for personal accounts and for native-only music, stickers, filters, text, and
effects.

## Product outcome

A person can prepare one Instagram post from a TKA sequence, performance video,
card, animation, or saved composition and know all of the following before
publishing:

- The exact pixels and TKA-rendered audio in the exported asset.
- The destination format: image, Reel, carousel, Story, or Trial Reel.
- The caption, cover, Feed placement, accessibility text, tags, collaborators,
  location, disclosures, and API-attached audio that Meta will receive.
- Which details remain for Instagram's native editor.
- Whether the account can publish directly, needs a Facebook connection for the
  selected feature, or must use handoff.
- Whether the post is ready, scheduled, publishing, published, or waiting for
  attention.

After publication, the same sequence can show its Instagram permalink, post
history, comments, and available performance metrics. TKA must not imply that a
single format choice caused a metric change without enough comparable posts.

## Scope

### Included

- Capability-aware publishing for Instagram professional accounts.
- A durable post-delivery draft that references a rendered artifact revision.
- Direct image, Reel, carousel, and Story publishing where Meta reports support.
- Trial Reel publishing with manual or performance-based graduation settings.
- Reel cover image or cover-frame selection.
- Reel distribution to the Reels tab or Feed plus Reels.
- Image and carousel-item alternative text.
- Account tags, location, collaborators, product tags, paid-partnership labels,
  and AI disclosure where the active Meta route supports them.
- Instagram Audio API search, preview, attachment, and volume controls after the
  Facebook Login proof gate passes.
- Reusable post recipes that bind a composition preset to delivery defaults.
- Post-now and scheduled delivery.
- Publication history, permalink recovery, comments, and insights.
- Handoff for personal accounts and native-only Instagram controls.
- Real-account proof for Creator, Business, Instagram Login, and Facebook Login
  capability combinations used by the product.

### Excluded

- Rebuilding Instagram's native editor.
- Claiming access to Instagram's full licensed music catalog.
- Baking API-attached Instagram music into TKA's exported MP4.
- Native filters, AR effects, animated Instagram text, GIF stickers, polls,
  questions, quizzes, link stickers, or Story sticker placement.
- Publishing to Instagram personal accounts through the Graph API.
- Blind retries after an unknown publish result.
- Automatic selection of copyrighted music.
- A second composition timeline, card renderer, video encoder, BPM engine, or
  caption-preset system.
- Instagram ads creation or campaign management.
- Creator Marketplace discovery.

## Confirmed Meta contract on 2026-08-14

The fields in this section come from Meta's official documentation. Runtime
capability checks still decide what a connected account may use. A documented
field is not permission to show it before app review, account eligibility, and
one live publish have passed.

### Account and access matrix

| Account or app state                                      | Direct publish                       | Product behavior                                                                                                                                                        |
| --------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personal Instagram account                                | No                                   | Keep download and `Finish in Instagram`. Do not keep offering a failing direct connection.                                                                              |
| Creator or Business with Instagram Login                  | Base content publishing              | Show only fields proven on `graph.instagram.com` with granted `instagram_business_*` permissions.                                                                       |
| Creator or Business with Facebook Login and a linked Page | Base plus Facebook-only capabilities | Enable authorized audio, collaborators, product tagging, partnership labels, hashtag search, and richer cross-platform data only after each capability passes its gate. |
| App user who owns or manages the Meta app                 | Standard Access can be sufficient    | Suitable for development and owned-account proof.                                                                                                                       |
| General TKA user with no app role                         | Advanced Access required             | Requires App Review and Business Verification before direct publishing appears.                                                                                         |

The current TKA Instagram path uses Instagram Login and requests
`instagram_business_basic` plus `instagram_business_content_publish`. The
current Facebook Login for Business configuration is for Page posting. It does
not prove Audio API, collaborator, insight, or Instagram publishing permissions.

### Publishable formats

| Format      | Meta contract                                                                                                                                            | TKA contract                                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Feed image  | JPEG, 8 MB maximum, 4:5 through 1.91:1, 320 through 1440 px wide                                                                                         | Export or convert once, validate before upload, preview Instagram crop, support alt text.                               |
| Reel        | MOV or MP4, H.264 or HEVC, AAC when audio exists, 23 through 60 FPS, 3 seconds through 15 minutes, 300 MB maximum in the current IG User Media reference | Use the existing Post Studio exporter, validate the encoded file, then create and poll one Reel container.              |
| Carousel    | Up to 10 image/video children; Reels cannot be carousel children                                                                                         | Render each item independently, preserve order, validate every child, create children first, then one parent container. |
| Story image | JPEG, 8 MB maximum, 9:16 recommended                                                                                                                     | Use a Story-safe preset and show native handoff for stickers or link decoration.                                        |
| Story video | MOV or MP4, 3 through 60 seconds, 100 MB maximum, 9:16 recommended                                                                                       | Use a Story-specific validator and account capability gate.                                                             |
| Trial Reel  | Reel plus `trial_params.graduation_strategy`                                                                                                             | Offer `MANUAL` or `SS_PERFORMANCE`. Do not invent a TKA graduation endpoint.                                            |

When two current official sources disagree, the newest and stricter endpoint
reference controls validation until a live request proves otherwise.

### Publish-time fields

| Field                         | Applies to                               | Product rule                                                                                                                               |
| ----------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `caption`                     | Image, Reel, carousel                    | Maximum 2,200 characters, 30 hashtags, and 20 account mentions. Carousel children do not receive their own captions through this endpoint. |
| `alt_text`                    | Single image and image carousel children | Maximum 1,000 characters. Do not show for Reels or Stories.                                                                                |
| `share_to_feed`               | Reel                                     | Plain-language choices: `Feed + Reels` or `Reels only`. Do not imply that Meta guarantees distribution.                                    |
| `cover_url`                   | Reel                                     | Preferred when a designed cover exists. Must be a public JPEG that passes Reel-cover validation.                                           |
| `thumb_offset`                | Reel or video                            | Frame time in milliseconds. `cover_url` wins when both are present.                                                                        |
| `audio_name`                  | Reel original audio                      | Can be renamed once. Keep separate from Instagram Audio API music attachment.                                                              |
| `collaborators`               | Feed image, Reel, carousel               | Up to three usernames. Facebook Login for Business only. Not supported for Stories.                                                        |
| `user_tags`                   | Supported image, video, and Story routes | Store normalized coordinates. Display only after the active host, permission set, and live proof support the format.                       |
| `location_id`                 | Supported feed media                     | Resolve a real location Page ID. A typed place name is not sufficient.                                                                     |
| `product_tags`                | Eligible feed media                      | Facebook Login, catalog permissions, shop ownership, and product validation required.                                                      |
| `is_paid_partnership`         | Eligible Facebook Login posts            | Show only when the relevant permission and account relationship are proven.                                                                |
| `branded_content_sponsor_ids` | Eligible Facebook Login posts            | Up to two professional-account sponsor IDs.                                                                                                |
| `is_ai_generated`             | Supported media and carousel parent      | Available on Instagram Login and Facebook Login. Carousel children must not carry it.                                                      |

### Instagram Audio API

Meta's Instagram Audio API is available through Facebook Login only. It can:

- Search `music` or `original_sound` assets.
- Return trending results when no search query is supplied.
- Return title, artist, duration, artwork, audio ID, an Instagram preview link,
  and sometimes a temporary download URL.
- Attach an audio ID to a Reel through `audio_configuration`.
- Set attached-audio and original-video volume from 1 through 100.

The API does not provide a final Reel preview with attached audio. The available
selection can differ from Instagram's native picker. The documented
`audio_configuration` does not expose a song start offset or a clip selector.

TKA may create a local timing preview from an authorized temporary preview URL,
but the UI must label it as a timing preview. It must not claim frame-accurate
parity with Instagram's published result.

The Audio API result does not include BPM. Existing audio analysis may estimate
tempo from the preview URL after CORS, rights, URL lifetime, and decoding are
proven. Low-confidence estimates remain editable suggestions.

Temporary preview URLs expire after roughly one and a half days. Persist the
audio ID and stable metadata, not the temporary URL. Resolve a new preview when
the draft reopens.

### Post-publication capabilities

Meta exposes:

- Media permalink and metadata.
- Comments, replies, hide/unhide, deletion, and enable/disable comment state.
- Media metrics including views, reach, likes, comments, saves, shares, total
  interactions, average Reel watch time, total Reel watch time, and estimated
  three-second skip rate.
- Story navigation, replies, profile activity, and link clicks where the login
  route and account support them.
- Account metrics and follower breakdowns, with restrictions for small
  accounts and delayed data.
- Mentions, comment, message, and Story insight webhooks where supported.

Insights may be delayed by up to 48 hours. Missing data is not the same as zero.
Story metrics expire quickly, and the insights webhook is not available through
Instagram Login. The repository must retain collection timestamps and source
route so cached values are not presented as live values.

### Native-only boundary

Direct publishing does not expose Instagram's full editor. The following stay
in `Finish in Instagram` unless Meta adds and TKA proves an official field:

- The full licensed music library and Instagram's native clip selector.
- Filters, camera effects, native text styling, and animated text.
- Story polls, questions, quizzes, link stickers, music stickers, and sticker
  placement.
- Instagram templates and the full Remix editor.
- Manual Trial Reel graduation.
- Per-post Reel remix settings at publish time.

### Quotas and lifecycle

- An Instagram account may publish up to 100 API posts in a rolling 24-hour
  period. A carousel counts as one post.
- An account may create up to 400 containers in a rolling 24-hour period.
- Containers expire after 24 hours.
- Media must remain fetchable from a public HTTPS URL while Meta ingests it.
- Video processing is asynchronous. A container ID does not prove a successful
  upload or publication.

Scheduling is therefore a TKA queue, not a Meta scheduling field. Rendered
assets can be prepared early, but Instagram containers are created close to the
scheduled publish time.

## Repository capability ledger

| Need                                 | Closest repository owner                          | Relationship                           | Decision                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spatial and temporal composition     | `src/lib/shared/media-composition/`               | Reuse                                  | Post delivery references a rendered revision. It does not copy or extend timeline math.                                                                   |
| Post Studio editing                  | `PostStudio.svelte` and its existing child panels | Extend                                 | Add API-audio selection only because it affects timing preview. Keep destination metadata out of the composition inspector.                               |
| Caption and destination choice       | `PostShareSheet.svelte`                           | Extend                                 | Add an Instagram Review step inside the existing `ShareSheetFrame`. Do not open a second modal.                                                           |
| Caption presets                      | `caption-presets.svelte.ts`                       | Reuse                                  | A post recipe may reference a caption preset. No new caption editor or preset store.                                                                      |
| Direct connection and publish client | `meta-publish.ts`                                 | Extend                                 | Add richer draft requests, capability snapshots, publication status, and reconnect reasons.                                                               |
| Graph calls                          | `metaGraphClient.ts`                              | Extend                                 | Keep every outbound Meta endpoint and parameter in this file or focused sibling clients called only by it.                                                |
| Callable orchestration               | `publishToMeta.ts`                                | Extend and decompose                   | Preserve one public publish intent while moving format-specific protocols into narrow orchestrators before the file becomes a monolith.                   |
| Token storage                        | `metaConnectionStore.ts`                          | Extend                                 | Migrate toward one Facebook Business grant record that can expose Pages and linked Instagram accounts without duplicating the underlying user token.      |
| Token-free client status             | `metaPublishStatus` mirror                        | Extend                                 | Publish capability reasons, account identifiers, login route, expiry, and last verification time. Never mirror tokens.                                    |
| Carousel assembly                    | Dormant `MediaBundler`                            | Replace behavior, retain no false path | It has no consumers and its GIF method returns a static image. Carousel assembly must consume real rendered revisions rather than revive the placeholder. |
| Post recipes                         | No current durable owner                          | Create                                 | `PostRecipeRepository` owns structure plus delivery defaults. It references composition and caption presets.                                              |
| Post draft state                     | No current owner                                  | Create                                 | `createPostDeliveryState` is a factory distributed through context. No module singleton.                                                                  |
| Scheduling and publication history   | Explicitly deferred in the earlier handoff spec   | Create                                 | `PublicationRepository` owns drafts, attempts, final records, and reconciliation state.                                                                   |
| Comments and insights                | No Instagram management owner                     | Create after publish proof             | `InstagramPostReader` performs read operations through the server. UI composes cached records and webhook updates.                                        |
| BPM estimation                       | Existing shared composition/audio analysis path   | Reuse                                  | Analyze an Audio API preview only after it is decodable. No Audio-API-specific BPM implementation.                                                        |

### Ownership statement required before implementation

Implementation must report these relationships before adding components:

- Reusing `MediaCompositionProject` for pixels, time, and rendered audio.
- Extending `PostShareSheet` with target-specific Instagram Review.
- Extending `metaGraphClient` as the Graph protocol owner.
- Creating `PostDeliveryDraft` because no existing model owns durable target
  metadata, schedule intent, or publication state.
- Creating `PostRecipeRepository` because composition presets and caption
  presets do not own delivery defaults.
- Replacing the dormant carousel placeholder with an assembler that consumes
  real render revisions.

## Data contracts

All durable contracts use strict Zod schemas, explicit versions, server
timestamps, and migrations. Unknown fields fail validation on writes and remain
preserved only through an explicit migration path.

### Rendered artifact revision

Post Studio produces an immutable manifest after a successful export:

```ts
interface RenderedArtifactRevisionV1 {
  schemaVersion: 1;
  id: string;
  ownerId: string;
  compositionProjectId: string | null;
  compositionRevisionId: string;
  sourceSequenceId: string | null;
  kind: "image" | "video";
  mimeType: "image/jpeg" | "video/mp4";
  width: number;
  height: number;
  durationSeconds: number | null;
  hasAudio: boolean;
  byteLength: number;
  sha256: string;
  storageObjectId: string;
  createdAt: Timestamp;
}
```

Blob URLs are preview details and never durable identities. Updating a
composition creates a new render revision and marks dependent post drafts
stale. It does not mutate the asset already attached to a published record.

### Post delivery draft

```ts
interface PostDeliveryDraftV1 {
  schemaVersion: 1;
  id: string;
  ownerId: string;
  sourceSequenceId: string | null;
  recipeId: string | null;
  format: "image" | "reel" | "carousel" | "story";
  items: PostMediaItemDraftV1[];
  caption: string;
  instagram: InstagramPublishOptionsV1;
  delivery: DeliveryIntentV1;
  selectedAccountId: string | null;
  capabilitySnapshotId: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface PostMediaItemDraftV1 {
  id: string;
  artifactRevisionId: string;
  order: number;
  altText: string | null;
  cropPreviewRevision: string;
}
```

The draft stores one caption because Meta's carousel endpoint accepts the
caption on the parent container. Any text baked into a slide remains part of
that slide's rendered pixels.

### Instagram publish options

```ts
interface InstagramPublishOptionsV1 {
  shareToFeed: boolean | null;
  cover:
    | { kind: "designed"; artifactRevisionId: string }
    | { kind: "frame"; offsetMs: number }
    | null;
  originalAudioName: string | null;
  attachedAudio: {
    audioId: string;
    title: string;
    artist: string | null;
    durationMs: number;
    audioVolume: number;
    videoVolume: number;
  } | null;
  trial: { graduationStrategy: "MANUAL" | "SS_PERFORMANCE" } | null;
  collaborators: string[];
  userTags: Array<{ username: string; x: number | null; y: number | null }>;
  locationId: string | null;
  productTags: Array<{ productId: string; x: number | null; y: number | null }>;
  aiGenerated: boolean | null;
  paidPartnership: boolean;
  sponsorIds: string[];
}
```

Null means the field does not apply or has not been chosen. `false` remains a
deliberate choice and must not collapse into null during serialization.

### Delivery intent

```ts
type DeliveryIntentV1 =
  | { mode: "handoff" }
  | { mode: "publish-now" }
  | {
      mode: "scheduled";
      scheduledForUtc: string;
      displayTimeZone: string;
    };
```

Timezone conversion happens once at input and is displayed with the stored
timezone. Daylight-saving transitions require explicit tests.

### Capability snapshot

The server derives a token-free snapshot:

```ts
interface InstagramCapabilitySnapshotV1 {
  schemaVersion: 1;
  id: string;
  accountId: string;
  username: string;
  accountType: "BUSINESS" | "CREATOR" | "UNKNOWN";
  route: "instagram-login" | "facebook-login";
  graphVersion: string;
  appAccess: "standard" | "advanced" | "unknown";
  permissions: Record<string, "granted" | "declined" | "expired" | "unknown">;
  features: Record<InstagramFeatureKey, CapabilityResult>;
  verifiedAtMs: number;
  expiresAtMs: number;
}

interface CapabilityResult {
  available: boolean;
  reasonCode: string | null;
  recoveryAction:
    | "none"
    | "connect-instagram"
    | "connect-facebook"
    | "reconnect"
    | "upgrade-account"
    | "app-review-pending"
    | "finish-in-instagram";
}
```

Feature keys include image, Reel, carousel, Story, Trial Reel, alt text,
cover, Feed distribution, user tags, location, collaborators, product tags,
partnership labels, AI disclosure, API audio, comments, insights, and schedule.

The client never derives a privileged capability from the existence of a token
or account name. The server checks account type, login route, granted
permissions, app access, feature switch, and live endpoint proof.

### Publication record

```ts
interface InstagramPublicationRecordV1 {
  schemaVersion: 1;
  id: string;
  ownerId: string;
  draftSnapshot: PostDeliveryDraftV1;
  accountId: string;
  username: string;
  route: "instagram-login" | "facebook-login";
  state: PublicationState;
  attemptId: string;
  leaseExpiresAt: Timestamp | null;
  containerIds: string[];
  mediaId: string | null;
  permalink: string | null;
  scheduledFor: Timestamp | null;
  publishedAt: Timestamp | null;
  lastError: PublicationErrorV1 | null;
  lastReconciledAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

Publication states:

```text
draft -> rendering -> ready
ready -> publishing -> published
ready -> scheduled -> publishing
rendering | ready | scheduled -> canceled
publishing -> needs_attention | failed
needs_attention -> publishing | published | failed
```

Published records are immutable except for recovered permalink, comments,
insight snapshots, and reconciliation timestamps.

## Connection architecture

### Keep the low-friction route

Instagram Login remains the base connection. It does not require a linked
Facebook Page and is the correct entry point for professional users who only
need supported base publishing.

### Extend the existing Facebook Business grant

The existing Facebook Login for Business token is already the owner of Page
posting. The implementation should migrate `FacebookPublishConnection` into a
versioned `FacebookBusinessConnection` containing:

- The long-lived Facebook user token.
- Granted and declined permissions.
- Managed Pages and selected Page.
- Linked Instagram professional accounts returned by those Pages.
- The selected linked Instagram account for Facebook-only features.
- App configuration ID and verification timestamp.

Do not store a second copy of the same Facebook user token under a new
Instagram field. If Meta requires a separate login configuration, record that
configuration inside the same connection object and prove how grants merge,
reselect, revoke, and reconnect before shipping it.

### Account identity rule

When an Instagram Login account and a Facebook-linked Instagram account are
both present, compare the stable Instagram user ID before combining
capabilities. Matching usernames are not sufficient.

If the IDs differ, the UI states which account each connection controls and
requires an explicit target choice. A post must never switch accounts because
an advanced option was selected.

### Per-post route selection

One Instagram post uses one Graph host and one token route from container
creation through publication.

- Base-only draft: prefer the already proven Instagram Login route.
- Draft containing API audio, collaborators, product tags, or partnership
  labels: require a Facebook Login route whose linked Instagram user matches
  the selected target.
- If the chosen field loses eligibility, keep the draft and mark the field as
  needing attention. Do not silently drop metadata and publish a different
  post.

### Connection copy

Use factual labels:

- `Connect Instagram`
- `Connect Facebook for music and collaborators`
- `Direct posting needs an Instagram creator or business account.`
- `This Facebook connection controls @username.`
- `Reconnect Instagram before this post can publish.`

Do not show a generic `Meta couldn't complete that` when the server has an
error code or recovery action.

## Experience design

### Quick Share stays quick

The existing share sheet still opens with the current artifact, caption, and
destinations. It does not open on a wall of Instagram fields.

For a connected Instagram account, the network action becomes
`Review for Instagram`. It opens a target-specific step inside the same
`ShareSheetFrame` and preserves the current preview, caption, render, and
connection state.

The review step has one primary action: `Post now`. `Schedule` is a secondary
button with equal visual weight to other delivery alternatives, not a faint
text link.

### Instagram Review

The first review screen shows:

- Final media preview or carousel swipe preview.
- Connected account and active login route.
- Format and duration.
- Caption with its character, hashtag, and account-mention limits.
- Reel cover and Feed placement when applicable.
- Sound summary when applicable.
- A compact list of selected tags, collaborators, location, and disclosures.
- `Edit in Post Studio` when the rendered pixels or timing need revision.
- `Post now`, `Schedule`, and `Finish in Instagram`.

The default screen does not show empty sections. Sound is absent for silent
images and silent cards. Cover controls are absent outside Reels. Alternative
text appears only for image media. Story sticker explanations appear only on
the Story handoff path.

### Progressive controls

Keep these visible when they apply:

- Format.
- Caption.
- Reel cover.
- Reel destination: `Feed + Reels` or `Reels only`.
- Sound choice.
- Delivery time.

Place less common fields under `More Instagram options`:

- Collaborators and people tags.
- Location and product tags.
- Original-audio name.
- Trial Reel graduation.
- AI and partnership disclosures.

The disclosure contains controls, not another timeline. Post Studio remains the
only timeline surface.

### Post Studio sound choices

The Sound panel renders only when the active composition or selected Instagram
audio makes sound relevant. Available choices are capability-driven:

- `Original sound`
- `Add a track in TKA`
- `Choose Instagram audio`
- `Add music in Instagram`

`Choose Instagram audio` opens a picker with search, trending results, artwork,
artist, duration, preview, attached-audio volume, and original-video volume.
Only one result previews at a time.

Selecting an audio result adds a target-audio lane to the existing timeline
preview. It does not add the music to the exported MP4. The lane uses the same
sequence time map and shared BPM analysis as other audio sources.

The preview states:

`Instagram attaches this track when the Reel publishes. Timing may differ from Instagram's final result.`

If a precise clip or lyric section matters, the available action is
`Choose the clip in Instagram` and the delivery mode becomes handoff.

### Carousel assembly

Carousel assembly is a reorderable list of two through ten real artifact
revisions. It is not the old `MediaBundler` fixture.

Initial post recipes can produce:

- `Swipeable lesson`: title, full card, selected beat breakdowns, QR ending.
- `Performance + card`: performance video first, card or breakdown slides
  after it.
- `Card walkthrough`: one group of card cells per slide with shared visual
  styling.

Each item supports:

- Preview.
- Reorder.
- Remove.
- Replace.
- Image alternative text.
- `Edit in Post Studio` for video items or composed stills.

All children use a compatible aspect ratio chosen before rendering. Changing
the carousel aspect rerenders incompatible draft items; it does not stretch
them at publish time.

The parent owns caption, location, collaborators, and disclosure metadata.
Child images own alternative text. Reels are rejected as children; an MP4 video
child uses the carousel-video contract.

### Trial Reels

Trial mode appears only for eligible Reels. The control label is
`Test with non-followers first`.

Graduation choices:

- `Decide in Instagram` maps to `MANUAL`.
- `Share to followers if it performs well` maps to `SS_PERFORMANCE`.

TKA records the chosen strategy and post ID. Manual graduation opens the native
Instagram post because the current publishing documentation does not expose a
manual graduation endpoint.

Insights for Trial Reels remain behind a live proof gate. The interface must not
promise a Trial-specific report until the connected account returns those
metrics.

### Post recipes

A post recipe binds reusable choices without retaining one post's media:

```ts
interface PostRecipeV1 {
  schemaVersion: 1;
  id: string;
  ownerId: string;
  name: string;
  format: "image" | "reel" | "carousel" | "story";
  compositionPresetId: string | null;
  carouselStructure: CarouselRecipeItemV1[] | null;
  captionPresetId: string | null;
  deliveryDefaults: InstagramPublishDefaultsV1;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

A recipe may store Feed placement, cover strategy, audio mode, carousel role
order, and Trial strategy. It must not store access tokens, temporary audio
preview URLs, concrete artifact revisions, or a publish-ready capability claim.

When a recipe reopens, source roles rebind, the active account is rechecked,
and unsupported defaults remain visible as needs-attention items rather than
disappearing.

### Scheduling

Scheduling uses a server queue and a lease-based worker.

At schedule time:

1. Validate the draft and selected account.
2. Persist an immutable draft snapshot and artifact revision IDs.
3. Verify that public asset URLs remain valid through the publish and retry
   window.
4. Store UTC time plus the display timezone.
5. Do not create Instagram containers yet.

Near publish time:

1. Claim the record with a short lease in a Firestore transaction.
2. Refresh or verify the capability snapshot and token.
3. Revalidate rate-limit headroom and every referenced artifact.
4. Create child and parent containers as needed, storing each ID immediately.
5. Poll asynchronous media until it is ready.
6. Publish once.
7. Store media ID, permalink, publication time, and the final draft snapshot.

Meta does not provide an idempotency key for this flow. If the worker loses its
response after `media_publish`, it must not issue the call again automatically.
The record enters `needs_attention`, then reconciliation queries the container,
recent account media, and known artifact metadata before deciding whether a
retry is safe.

Editing a scheduled post creates a new draft revision. The queue swaps to that
revision only through a transaction before the worker lease begins. Once
publishing starts, edits create a separate future post.

### Published Posts

The first management surface is scoped to posts created by TKA. It does not try
to become a general social inbox.

Entry points:

- A published state in the share sheet.
- `Published posts` on a sequence with at least one publication record.
- A user-level list of scheduled and recently published TKA posts.

Each record can show:

- Instagram permalink and account.
- Published or scheduled time.
- Final preview and caption snapshot.
- Trial and attached-audio metadata.
- Current comments with reply, hide, or delete actions.
- Metric snapshot time.
- Views, reach, saves, shares, watch time, skip rate, and interactions when the
  format and route return them.

Comment webhooks are preferred over polling. Insight reads happen on demand and
at a small set of server checkpoints, then cache with a collected-at timestamp.
An empty Meta response renders `Not available yet`, not zero.

Comparison language stays observational:

- `This Reel held viewers longer than your previous three TKA Reels.`
- `The skip rate was lower for this preset.`

Avoid causal claims such as `This layout caused more shares` unless a future
experiment system controls the comparison.

## Desktop, 4K, and mobile composition

The quick share sheet remains content-sized. Short selectors and buttons must
not stretch across the viewport.

Instagram Review uses the existing expanded `ShareSheetFrame` rather than a new
page-sized dialog:

- At 1440 and 1920 CSS pixels, preview and post details sit side by side.
- At 2560, the preview gains space while the form keeps a readable control
  width. Extra width may expose the post summary without widening text fields.
- At 3840, type and controls scale through Post Studio's container tiers. The
  form remains bounded; the frame uses the height for preview, carousel, and
  publication state rather than producing long empty rails.
- At tablet and phone widths, Preview and Post Details are explicit views in
  the same sheet. Primary delivery actions remain visible without horizontal
  scrolling.
- At 960 by 412, the media preview can collapse to a thumbnail while the active
  decision and delivery buttons stay in view.

Dynamic publish status, percentages, times, and counters reserve their widest
slots and use tabular numbers. Switching from `Processing video` to `Published`
must not move the primary action or account controls.

## Error and recovery contract

Every server error contains a stable reason code, safe diagnostic details, and
one recovery action. Tokens, authorization codes, app secrets, signed media
URLs, and raw Meta response bodies never enter client-visible details.

Required states include:

| Condition                                                     | Visible message                                                              | Recovery                                        |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------- |
| Personal account                                              | `Direct posting needs an Instagram creator or business account.`             | `Finish in Instagram`                           |
| Base account chooses Facebook-only field                      | `Connect Facebook to use Instagram audio and collaborators.`                 | Facebook connection flow                        |
| Connected Facebook account controls another Instagram account | `This Facebook connection controls @otheraccount.`                           | Choose the intended account or reconnect        |
| Permission declined                                           | Name the missing capability                                                  | Reopen consent with the correct configuration   |
| Token expired before schedule                                 | `Reconnect Instagram before this post can publish.`                          | Preserve draft and schedule; request reconnect  |
| Rate limit reached                                            | Show next safe retry time when Meta provides enough data                     | Keep scheduled and retry after the window       |
| Media validation failure                                      | Name the file and violated constraint                                        | Return to Post Studio or replace item           |
| Container processing failure                                  | Show format-safe Meta reason                                                 | Re-render or retry container creation once safe |
| Unknown publish outcome                                       | `Instagram may have published this post. TKA is checking before it retries.` | Reconciliation, never blind retry               |
| Insight absent                                                | `Not available yet`                                                          | Show collection time and refresh later          |

The old generic fallback remains only for an unmapped provider failure. Logging
must retain the safe endpoint, Graph error code, subcode, request ID, format,
route, and attempt ID.

## Security and retention

- All Meta tokens remain server-only in an Admin-SDK-only collection.
- Client-readable status contains no credential or signed media URL.
- OAuth state remains single-use, requester-bound, expiring, and excluded from
  logs.
- Facebook-linked and Instagram Login account IDs must match before combining
  capabilities.
- Publish requests reference server-owned artifact IDs. The server resolves and
  allowlists the public URL; clients cannot submit arbitrary fetch URLs.
- User-provided captions and metadata are validated and encoded by the server.
- Temporary Audio API preview URLs are never persisted.
- Public media object names remain unguessable and expire after the schedule,
  publish, reconciliation, and retry window.
- Performance videos can contain people. Storage cleanup and access lifetime
  must no longer assume every shared artifact is an abstract sequence image.
- Webhook signatures are verified before comment, message, or insight events
  update publication records.
- Scheduled jobs use leases and transactions; only one worker may own an
  attempt at a time.

## Proposed code ownership

Exact filenames may change during the contract gate, but ownership may not.

```text
src/lib/shared/share/
  domain/instagram/
    instagram-capability-schema.ts
    instagram-post-draft-schema.ts
    instagram-post-policy.ts
    instagram-publication-schema.ts
    post-recipe-schema.ts
  state/
    post-delivery-state.svelte.ts
    post-delivery-context.ts
  components/instagram/
    InstagramPostReview.svelte
    InstagramFormatSummary.svelte
    InstagramReelOptions.svelte
    InstagramCarouselAssembler.svelte
    InstagramAudioPicker.svelte
    InstagramDeliveryActions.svelte
    InstagramPublicationCard.svelte
  services/
    post-recipe-repository.ts
    publication-repository.ts
    instagram-post-reader.ts

firebase-functions/src/share/
  instagramCapabilities.ts
  instagramAudio.ts
  instagramCarouselPublisher.ts
  instagramPublicationQueue.ts
  instagramPublicationReconciler.ts
  instagramPostReader.ts
```

`PostShareSheet.svelte`, `meta-publish.ts`, `metaConnect.ts`,
`metaConnectionStore.ts`, `metaGraphClient.ts`, and `publishToMeta.ts` are
extended. The Graph client stays the endpoint boundary even when focused
protocol files are added.

The UI state follows factory plus context:

```text
PostShareSheet
  -> createPostDeliveryState(repositories, publishers, initialDraft)
  -> setPostDeliveryContext(state)
  -> Instagram Review children consume context
```

State factories receive repositories and publishers as arguments. No new
module-level singleton, state ref, or callback-initialized manager is allowed.

## Implementation gates

Each gate ends in proof before work proceeds to the next one.

### Gate 0: Contract and Graph-version audit

- Diff Graph v23 behavior used by TKA against current v26 endpoints.
- Update validators from the current official endpoint references.
- Record every field by format, host, permission, account type, and app access.
- Add the versioned draft, capability, recipe, and publication schemas.
- Decide migration from the existing Instagram and Facebook connection records.

**Proof:** schema round trips, migration fixtures, official-source ledger, and
read-only capability calls against owned Creator and Business accounts.

### Gate 1: Capability-aware Review

- Add server-derived capability snapshots.
- Replace direct one-click network posting with `Review for Instagram`.
- Show only relevant format fields and exact recovery actions.
- Preserve quick handoff for every account.
- Persist a draft locally during the open sheet; add durable saving only after
  schema proof.

**Proof:** all capability combinations in a test matrix, no generic errors for
mapped states, and screenshots at every required viewport.

### Gate 2: Reel delivery controls

- Add Feed placement, cover image, cover-frame offset, original-audio name,
  alternative eligibility, AI disclosure, people tags, and location as proven.
- Keep sound hidden for silent media.
- Publish a real Reel through Instagram Login.
- Save the publication record and recover its permalink.

**Proof:** Graph request log without credentials, live Reel on the owned test
account, exact draft snapshot, and post-reload permalink state.

### Gate 3: Carousel and Story

- Replace the dormant carousel placeholder with real artifact-revision
  assembly.
- Add child container polling, parent creation, item ordering, and alt text.
- Add Story image/video validation and account gating.
- Keep native Story stickers in handoff.

**Proof:** live mixed-media carousel in the intended order, live eligible Story,
per-item validation failures, and no orphan containers after a controlled child
failure.

### Gate 4: Trial Reels

- Add graduation strategy to the draft and publisher.
- Publish one manual Trial Reel and one performance-based Trial Reel on an
  eligible owned account.
- Determine which Trial metrics Meta actually returns.

**Proof:** live non-follower Trial behavior, stored strategy, native manual
graduation handoff, and an evidence note for metric availability.

### Gate 5: Facebook-linked Instagram capabilities

- Extend the Facebook Login for Business configuration and connection record.
- Verify linked Instagram account identity.
- Prove collaborators, product tags, partnership labels, and any user/location
  tagging that differs by route.
- Preserve Page posting and reselect behavior.

**Proof:** reconnect, revoke, Page selection, account mismatch, one collaborator
post, and one no-partner paid label on owned test accounts. Product-tag proof is
required before that field appears.

### Gate 6: Instagram Audio API

- Search music and original sound.
- Preview through stable Instagram links or temporary authorized downloads.
- Prove whether the existing BPM analyzer can decode the preview path.
- Attach audio to a real Reel with independently chosen music and video volume.
- Compare the local timing preview with the published result and document the
  measured difference.

**Proof:** live audio-attached Reel, volume behavior, expired-preview recovery,
catalog mismatch behavior, and UI copy that does not claim exact parity.

### Gate 7: Scheduling and reconciliation

- Add durable drafts, immutable schedule snapshots, leases, and rate-limit
  checks.
- Create containers near publish time.
- Simulate worker interruption before and after `media_publish`.
- Reconcile unknown outcomes without duplicate publication.

**Proof:** scheduled live post, timezone and daylight-saving fixtures, expired
token recovery, lease contention test, and an interrupted publish with no
duplicate on the account.

### Gate 8: Published Posts

- Add post history for TKA-created posts.
- Add comment webhooks and moderation actions.
- Add cached insights with collection timestamps and unavailable states.
- Add comparison language only after enough related records exist.

**Proof:** live comment, reply, hide, delete, comment-disable behavior, delayed
insight handling, Story metric expiry handling, and post history after reload.

### Gate 9: General-user release

- Complete App Review and Business Verification for every public capability.
- Move from owned-account Standard Access proof to Advanced Access.
- Turn on capabilities from server configuration, not a client-only build flag.
- Keep emergency switches per capability.

**Proof:** a professional account with no role on the Meta app connects,
publishes, reloads, refreshes credentials, and recovers from a declined optional
permission without losing handoff.

## Verification contract

### Silent logic tests

- Schema parsing, migrations, null-versus-false preservation, and round trips.
- Field eligibility by format, route, account type, permission, and app access.
- Caption, hashtag, mention, collaborator, sponsor, item-count, duration, size,
  codec, aspect, coordinate, and alternative-text limits.
- Facebook-linked and Instagram Login account identity matching.
- Carousel child ordering and parent construction.
- Trial strategy serialization.
- Attached-audio volume bounds and expired-preview recovery.
- Timezone conversion and daylight-saving boundaries.
- Publication state transitions, worker leases, stale lease takeover, and
  reconciliation decisions.
- Empty insight response versus numeric zero.
- Post recipe rebinding and unsupported-default recovery.

### Integration proof

- Test-mode Graph client fixtures for every request shape and error mapping.
- Firebase emulator tests for token isolation, owner access, schedule leases,
  and webhook signature rejection.
- Live owned-account calls for every field that reaches the UI.
- Real Meta request IDs captured in protected logs for failed live cases.

### Visual proof

Every visual gate is checked at:

- 1920 by 1080.
- 2560 by 1440.
- 3840 by 2160.
- 1440 by 900.
- 820 by 1180.
- 960 by 412.
- 375 by 667.

At each viewport inspect control width, preview size, empty rail, vertical use,
carousel navigation, focus order, dynamic status stability, and horizontal
overflow. The 4K frame must use the canvas without stretching short controls or
turning the details form into a full-width spreadsheet.

### Accessibility proof

- Format and delivery choices use `SegmentedControl` only for exactly-one
  selection.
- Independent options use the established toggle primitive, never a native
  checkbox or a hand-rolled chip.
- Reorder controls have keyboard alternatives and announce item position.
- Audio preview, stop, and selection work without pointer input.
- Status changes use the correct live-region priority and do not repeat on
  every processing poll.
- Every media preview has a reserved box and meaningful accessible name.
- Minimum touch target and text sizes follow the design system.

## Risks and controls

| Risk                                                     | Control                                                                                                     |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| UI advertises a field the account cannot publish         | Server capability snapshots, live proof per field, and per-capability switches.                             |
| Facebook connection points at another Instagram account  | Compare stable Instagram user IDs and require an explicit target decision.                                  |
| Attached music preview differs from the post             | Label it as a timing preview, measure live behavior, and retain native handoff.                             |
| Scheduled retry creates a duplicate                      | Persist attempt and container IDs, use leases, and reconcile unknown outcomes before another publish call.  |
| Carousel partially creates containers                    | Persist every child state, stop before parent creation, and clean up or let unpublished containers expire.  |
| Draft silently loses unsupported metadata                | Keep needs-attention fields visible and block publish until resolved.                                       |
| Insight delay looks like poor performance                | Distinguish unavailable from zero and show collection time.                                                 |
| Post Studio becomes an Instagram clone                   | Keep target metadata in Instagram Review and composition behavior in `MediaCompositionProject`.             |
| Existing Page posting breaks when Facebook scopes expand | Migrate one Facebook Business connection and rerun Page connect, select, post, revoke, and reconnect proof. |
| Public media URL outlives its need                       | Time-bound unguessable objects and cleanup after the schedule, retry, and reconciliation window.            |
| Performance video contains personal footage              | Apply short storage lifetime and owner-only records; do not rely on the old abstract-card assumption.       |
| Meta changes version or field behavior                   | Pin Graph version deliberately, record the official source date, and keep field-level switches.             |

## Rejected approaches

- Adding every Instagram option to the normal Post Studio inspector.
- Treating Instagram Review as another composition timeline.
- Reviving `MediaBundler.generateSequenceGif` as a carousel implementation.
- Hiding direct publishing from every user because personal accounts are
  ineligible.
- Showing direct publishing to personal accounts and letting Meta reject it.
- Connecting Facebook before a person asks for a Facebook-only capability.
- Storing temporary audio preview URLs in post recipes.
- Claiming the Audio API exposes Instagram's full music picker.
- Baking third-party Instagram audio into the MP4.
- Creating containers when a post is scheduled days in advance.
- Retrying an uncertain `media_publish` call without reconciliation.
- Dropping invalid collaborators, tags, audio, or disclosures and publishing
  the remainder.
- Using a compile-time client flag as the source of account capability.
- Building a general social inbox before TKA-created post management works.

## Acceptance criteria

The work described by this spec is complete only when:

1. Personal accounts see a working handoff path and no dead direct-publish
   promise.
2. A general-user professional account can connect after Advanced Access and
   publish without a role on the Meta app.
3. Image, Reel, carousel, Story, and Trial Reel fields appear only where current
   Meta capabilities support them.
4. Post Studio remains the sole owner of rendered pixels, time, and rendered
   audio.
5. Instagram Review shows the final artifact, exact caption, applicable
   metadata, selected account, and delivery intent before publication.
6. A Reel can select a cover and Feed placement and retain those choices across
   reload.
7. A carousel publishes two through ten real items in the saved order with
   image alt text intact.
8. An eligible Trial Reel publishes with the selected graduation strategy.
9. A Facebook-linked account can use only the Facebook-only fields that passed
   live proof.
10. An Audio API Reel publishes with the selected audio ID and volume settings,
    while TKA labels its local preview accurately.
11. A scheduled post survives reload, token expiry, and worker contention
    without duplicate publication.
12. A published post has a durable media ID, permalink, final draft snapshot,
    and publication timestamp.
13. Comments and available metrics load with source and collection timestamps.
14. Mapped Meta failures name the recovery step and never fall through to the
    generic provider message.
15. Every visual surface passes the seven-viewport proof with no unintended
    scrollbar, stretched short control, clipped action, or empty 4K layout.

## Research references

- [Instagram Platform overview](https://developers.facebook.com/docs/instagram-platform/overview)
- [Instagram content publishing](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing)
- [IG User Media endpoint](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media)
- [Instagram Audio API](https://developers.facebook.com/documentation/instagram-platform/content-publishing/audio-api)
- [Instagram Media Insights](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-media/insights)
- [Instagram Account Insights](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/insights)
- [Instagram comment moderation](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/comment-moderation)
- [Official Meta Instagram API collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api)
- [Meta Reels publishing samples](https://github.com/fbsamples/reels_publishing_apis)
- [Instagram audio help](https://www.facebook.com/help/instagram/329208821595430)
- [Instagram licensed music access](https://www.facebook.com/help/instagram/402084904469945)

## First implementation recommendation

Start with Gate 0 and Gate 1. Do not begin Audio API, scheduling, or post
management until the capability snapshot and Instagram Review can truthfully
describe the current Instagram Login account.

The first visible slice should take the existing direct Reel flow, route it
through `Review for Instagram`, add the final cover and Feed placement contract,
publish through the proven account, and persist the resulting publication
record. That slice establishes the data model and UI seam used by every later
capability.
