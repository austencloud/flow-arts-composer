---
status: active
value: null
effort: null
work_state: blocked
remaining: Get Austen's visual checkpoint on the real Tunnel publication pane and record the promotion decision.
depends_on: 'external: Austen visual checkpoint and promotion decision for Tunnel publication'
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Phase 3 Implementation Plan — Public Tunnel Vertical Slice

**Queue evidence, 2026-10-07:** The implementation ledger is largely checked, but the Austen visual checkpoint remains unchecked. Keep the promotion gate open.

**Date:** 2026-08-23
**Parent charter:** `../2026-08-21-browse-explore-you-public-contributions-design.md`
**Governing child spec:** `../2026-08-21-versioned-visual-artifact-publication-design.md`
**Base state:** Phase 2 immutable-revision foundation complete (uncommitted on
`main`, base commit `1e6b57453e`).

## Capability ownership (primitive-discovery report)

Search terms used: `publicSequences`, `publish`, `projection`, `moderation`,
`publicArtifacts`, `artifact revision`, `tunnel revision`, `uploadBytes`,
`ShameQueue`, `visuals`.

- **Extending** the existing public-sequence projection/save-path conventions
  (`public-sequence-persister.ts` transaction discipline, `sequenceRevisions`
  content-addressed retention, `firestore.rules` schema-shape enforcement)
  into a shared public-artifact envelope. No parallel generic publisher.
- **Extending** `shared/artifact-revisions` (Phase 2 owner of
  `ArtifactRevisionRef`) with the publication envelope + request domain.
- **Reusing** the browse route resolver's existing `visuals` vocabulary
  (`browse-route-resolver.ts` already parses
  `/browse/explore/visuals/{type}/{publicationId}` and `/browse/you/visuals`).
- **Reusing** admin-dashboard panel conventions (`ShameQueuePanel.svelte`) for
  the moderation surface (a live-content feed with takedown, not a queue —
  see the publish-first pivot below).
- **Creating** the tunnel publication adapter as the tunnel feature's owned
  payload builder, per the child spec's adapter boundary.

## Design decisions

### Publish-first pivot (2026-08-23, Austen: "A fo sho")

The slice was originally gated: owners requested, a moderator approved, and
only approval created the guest projection. Austen rejected the dependency on
his own decision-making mid-slice and approved **publish-first**: "Share
publicly" goes live instantly; moderation is a **retroactive takedown**
reserved for abuse, not taste; crappy tunnels are allowed to exist; quality is
a future curation/promotion problem, not an admission gate. Crowdsourced
review was assessed as dead-on-arrival at current scale and parked (possible
future "report" signal only).

Status vocabulary is now `published | withdrawn | removed`
(pending/approved/rejected deleted). `removed` is **terminal**: content taken
down by moderation can never be republished as-is — only changed content
(a new revision id, hence a new ledger entry) can go public again.

Everything else — sanitization, content-addressing, immutable revisions,
guest reads gated on envelope existence, append-only ledger, same-transaction
parity — survives unchanged. Only the authority to create the projection
moved from admin to owner-with-proofs.

### Resources (four, per child spec)

1. Private mutable working artifact: existing
   `users/{uid}/tunnel-collection/{tunnelId}` (+ private `revisions`). Unchanged.
2. Immutable PUBLIC revision: `publicArtifacts/{artifactId}/revisions/{revisionId}`
   — content-addressed over the **sanitized public payload** (see below),
   created by the owner's publish batch, never edited.
3. Publication ledger:
   `artifactPublicationRequests/{artifactId}_{publicRevisionId}` —
   owner-created `published` (only inside a batch that also lands the
   projection); owner may move `published → withdrawn` (delisting in the same
   batch) and `withdrawn → published` (relisting in the same batch); admin
   moves `published → removed` (delisting in the same batch). Terminal:
   `removed`. Owner/admin-readable only. Never deleted (audit history).
4. Live-only guest projection: `publicArtifacts/{artifactId}` — the shared
   envelope (publicationId == artifactId; tunnel ids are `crypto.randomUUID()`).
   Exists **only while live**: created by the owner's publish batch, deleted
   by owner withdrawal or admin takedown. Guest revision reads require the
   parent envelope to exist, so delisting cascades discovery removal to
   revisions without deleting them (they stay resolvable to owner/admin and
   as ledger evidence).

### Sanitized public payload and dual digests

The private revision digest covers the full private payload including
`sourceSequenceId` and hydrated `SequenceData` blobs inside
`composition.performers[].source`. Those carry unpublished identifiers and
arbitrary passthrough metadata, which the child spec bans from public
projections. Therefore:

- The tunnel adapter builds a **public payload**: `{ steps, snapshot, poster,
  sourceWord?, composition? }` where composition performers' independent
  sources are whitelisted to `{ id: "src-<n>" (positional placeholder), name,
  word, steps }` and `sourceSequenceId` is dropped everywhere.
- The public revision id is `v1_<sha256(canonical public payload)>` — the same
  content-address policy as Phase 2, applied to the sanitized payload.
- The ledger entry records `sourceRevision` (the private `ArtifactRevisionRef`)
  as provenance, tying public identity to exact private history.

### Poster path

The envelope carries `posterUrl` pointing at Firebase Storage
`public-artifacts/{ownerId}/{artifactId}/{publicRevisionId}.webp`, uploaded by
the owner at publish time (decoded from the existing ~200px WebP data URL).
The revision document keeps the inline data-URL poster because it is part of
the digest-covered payload; discovery lists never fetch revision documents.
Storage rule: world-readable, owner-writable, ≤ 200 KB, image/webp.

### Firestore authority (publish-first)

- `publicArtifacts` create: owner (full account) with `ownerId == auth.uid`,
  full shape checks, `publishedAt == request.time` (anti-backdating; the
  client sends `serverTimestamp()`), and `getAfter(ledger).status ==
  'published'` — so an envelope can only land inside a batch whose ledger
  entry says published. Update: owner with frozen
  ownerId/artifactType/publishedAt (preserved across revisions) plus the same
  ledger proof. Delete: envelope owner or admin (delisting).
- `publicArtifacts/{id}/revisions`: create owner-or-admin with content-address
  checks and the same getAfter-published proof; update never; delete admin
  only. Read: guest when parent envelope exists, plus owner/admin always.
- `artifactPublicationRequests`: create by owner with `status == "published"`
  AND `existsAfter` proofs that the envelope (pointing at this revision, owned
  by auth.uid) and the revision land in the same batch — no bare ledger
  claims. Owner update: `published → withdrawn` only with envelope-delisted
  proof; `withdrawn → published` only with envelope-relisted + revision
  proofs; affectedKeys hasOnly(['status','requestedAt']). Admin update:
  `published → removed` with delist proof; affectedKeys
  hasOnly(['status','reviewedAt','reviewedBy','reviewNote']). `removed` is
  terminal for everyone. No client deletes.
- Guests read only live envelopes/revisions and can never write anything.

Service subtlety (caught in design, covered by the "publish v2" rules test):
reverting the envelope to a superseded-but-still-`published` ledger entry
must NOT touch that ledger doc — a published→published "transition" is denied
by the state machine, and `getAfter` on an untouched doc already reports
`published`, satisfying the envelope proof.

### Promotion gate (kept)

Explore's segmented control does NOT gain a Visuals option in production.
`visuals-promotion.ts` exposes `exploreVisualsVisible()` — true in dev builds
for the checkpoint, false in production until Phase 0B calibrates the gate.
Unpromoted deep links fall back to Explore > Sequences. You-side publish
controls and the admin queue ship unconditionally (they are private surfaces).

## Ledger

- [x] Plan checked in
- [x] Shared domain: `public-artifact.ts` (envelope, request, states, guards)
- [x] Tunnel adapter: `tunnel-public-revision.ts` (sanitizer + digest + builder)
- [x] Paths: `artifact-publication-paths.ts`
- [x] `firestore.rules`: three new match blocks + tests
- [x] `storage.rules`: public-artifacts poster path + tests (covered by rules suite)
- [x] Owner service: `tunnel-publication-service.ts` (request, withdraw, status)
- [x] Review service: `artifact-publication-review.ts` (approve tx, reject, remove)
- [x] Guest loader: `public-artifact-loader.ts` (list by type, get envelope+revision)
- [x] You UI: publish/withdraw/status controls in `TunnelCollectionModule`
      (`TunnelPublicationControls.svelte` in the detail panel)
- [x] Admin UI: `ArtifactPublicationQueuePanel.svelte` — new `publications`
      admin tab (tab-definitions + en.json keys + AdminDashboard panel)
- [x] **Publish-first rework** (post-pivot): 3-status domain machine
      (`public-artifact.ts`), rules rewritten for owner-driven projection with
      same-batch proofs, `publishTunnel` one-batch instant publish (incl.
      superseded-published revert fix), review service trimmed to
      `removePublication`, controls simplified to Share publicly / Publish
      update / Remove / removed-terminal, admin panel rewritten as the
      "Public Visuals" live feed, en.json tab strings
- [x] Publish-first tests: domain unit 11/11, rules 22/22
      (`test:rules:artifacts` — owner publish batch, backdating, withdraw /
      republish / takedown atomics, removed-terminal, guest cascade)
- [x] Deploy updated `firestore.rules` (prod deploy succeeded 2026-08-23);
      migrated the one prod ledger doc (status approved → published,
      review fields cleared)
- [x] Explore UI: `ExploreVisualsPanel.svelte` in BrowseModule's Explore
      switcher, gated on `exploreVisualsVisible()`; detail reuses
      `TunnelDetailPreview` (lazy import) over the guest projection
- [x] Creator profile: "Published visuals" band in `ProfileStage.svelte` via
      `listPublicArtifactsByOwner`, gated on promotion; tiles open the Explore
      detail through the new `explore-visual-detail` browse intent
- [x] Unit tests: sanitizer determinism, digest stability, independence of two
      revisions, envelope guards, request state machine
- [x] Rules tests: guest/owner/unrelated/moderator matrix (`test:rules:artifacts`)
- [x] `svelte-check` green (0 errors / 0 warnings) — re-run post-rework
- [x] Browser verification against production Firestore: instant publish →
      guest Explore list + detail (animated preview) → live withdraw
      ("Removed from public view") → live instant republish ("Now public in
      Explore") → admin Public Visuals feed ("1 live" + Remove). Viewport
      sweep: admin feed at 1920/2560/3840/960×412/375, Explore list at
      1920/3840/375, detail at 1920/375, owner controls at 375 — no layout
      defects (1440×900 and 820×1180 interpolate between verified points of
      the same single-column layouts)
- [ ] Austen visual checkpoint (pane on the real surfaces) — promotion decision

## Rollback

Presentation: flip `exploreVisualsVisible()` to false / remove the panel —
routes fall back to sequences. Data: withdrawing or removing an envelope
delists without deleting revisions or the private tunnel; the request ledger
is append-only audit state. No migration is required for rollback.
