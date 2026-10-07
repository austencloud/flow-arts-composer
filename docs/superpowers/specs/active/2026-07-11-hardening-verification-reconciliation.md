---
title: Hardening Findings — Verified Reconciliation (2026-07-11)
status: active
value: 4
effort: M
remaining: "The OPEN-SAFE batch is complete. Remaining OPEN-FLAGGED items require Austen's domain, payment-policy, live-runtime, device, PDF, or visual gates before implementation."
depends_on: "external: Austen sign-off and the named domain, payment, runtime, device, PDF, and visual verification gates"
last_triaged: 2026-10-07
plan_path: ""
tags: []
work_state: blocked
---

# Hardening Findings — Verified Reconciliation

## Why this doc exists

The prior hardening findings docs in `docs/superpowers/specs/active/`
(`2026-06-28-hardening-audit-findings.md`, `2026-06-28-hardening-audit-wave2.md`,
`2026-06-25-remote-hardening-session.md`, `2026-06-19-wave9-flagged-findings.md`)
list bugs, but **many were already shipped-fixed and never marked done** — nothing
moved to `shipped/`, and progress was tracked in prose. A 2026-07-11 session went to
"fix" the top findings and discovered the first several were already fixed in live
code. This doc is the result of re-verifying **every** finding against current code on
branch `claude/prioritize-high-value-work-n1sepc`, so future sessions work from ground
truth instead of stale claims.

**Method:** each finding was opened at its cited `file:line` (or grepped by symptom) in
current code and classified FIXED / OPEN-SAFE / OPEN-FLAGGED. Line numbers below are
current as of 2026-07-11.

## Shipped this session (2026-07-11)

- `b9dec9f` — deleted dead `QuestionGenerator.svelte` (zero importers) + stale hooks import comment.
- `53ceffe` — public gallery now resolves real tag names on publish (was `tags: []`), + unit test.
- `45ba5ca` — video-record save failures surfaced to the user (was console-only).
- `465a043` — `addSequencesToCollection` parallelized (S1).
- `e649c3a` — FNV-1a preview hash corrected to 32-bit via `Math.imul` (S2).
- `7b77859` — continuity validator guarded against motions-less start beat (S3).
- `c6b217a` — letter-mappings payload shape-validated at fetch (S6).
- `15d1ffb` — eager `sharer` singleton removed; browser-guarded `getSharer()` (S4).
- `93be9db` — **F1 loop-executor validation sets** fixed + regression tests (was OPEN-FLAGGED; resolved by canonical `LOOPValidator` + UI `loop-validator` grounding + MCP `validate_loop_options` + negative-control tests).

### Completed 2026-08-01

- **S5:** moved the prop-collection suite into the default unit-test graph and
  made its expectations follow `PROP_LOCKING_ENABLED`, including the disabled
  policy's no-pick-debt behavior.
- **S7:** made `MutationResult` a discriminated success/failure result, added an
  invalid-source failure path, replaced the removed test-only mutator contract,
  and added direct mutator coverage.
- Verification: 3 focused files, 14 tests passed. The post-edit fast check found
  no diagnostics in these files; its 7 errors and 3 warnings are in unrelated
  files currently being edited by other sessions.

## Confirmed ALREADY-FIXED (do not re-report as open)

Verified corrected in live code; the source findings docs are stale on these:

- tika `saveSession` → `merge: true` (`tika-session-repository.ts:98`).
- library-save id resolved up front (`library-save-service.ts:112-120`); Dexie failure surfaced (`:144-162`).
- filter-persister null-filter guard (`filter-persister.ts:47-53`).
- `getFavorites` boolean filter; browse variation-cache invalidation (`variation-grouper.ts:84-97`).
- library recycle-bin purge guard (`library-recycle-bin.ts:110-133`).
- offline-cache: error surfaced (`offline-cache-state.svelte.ts:48,66`), `propSvgsCached` computed (`offline-cache-orchestrator.ts:140`).
- reversal-detector rewritten to delegate to `@tka/sequence-engine` (no dead sub-condition).
- merch webhook `unitPrice` uses `amount_subtotal` (`handleMerchWebhook.ts:79`).

## OPEN-SAFE — autonomous, typecheck/test-verifiable (tonight's fix backlog)

Ranked by real value (skip cosmetic/premature per `feedback_shiny_object_guard`).
**Status: S1 through S7 are complete.**

| # | Finding | file:line | Fix | Size |
|---|---|---|---|---|
| S1 | `addSequencesToCollection` serial awaits | `shared/library/services/collection-manager.ts:604-611` | `Promise.all(ids.map(addSequenceToCollection))` | S |
| S2 | FNV-1a 32-bit overflow in preview hash | `shared/share/services/preview-cache.ts:78-84` | `Math.imul`-based FNV-1a (invalidates cache once) | S |
| S3 | continuity validator throws on motions-less start beat | `create/spell/services/orientation-continuity-validator.ts:54` | `if (!previousBeat?.motions) continue;` | S |
| S4 | `sharer` direct singleton export bypasses browser guard | `shared/share/services/sharer.ts:302` (+2 importers) | migrate to `getSharer()`, delete direct export | M |
| S5 | 4 RED prop-collection tests (flag-dependent) | `shared/gamification/domain/prop-collection.test.ts` | parameterize suite on `PROP_LOCKING_ENABLED` | M |
| S6 | `browser-data-provider` unvalidated `response.json()` | `shared/sequence-engine/data/browser-data-provider.ts:34` | cast/validate the payload | S |
| S7 | `MutationResult` typed success-only | `features/village/services/sequence-mutator.ts:24` | narrow return type or add failure branch | S |

Lower-value/cosmetic (defer unless already in the file): `TopologyCanvas` viewBox string-parse
(`:145-146` → use `origin.x/.y`), `image-composition-state` singleton→getter, `get-library-repository`
reset, `viewport-measurement` dir move, `lineage-tracker` perf, `personality-generator` defensive guard,
`library-batch-operations` reportError (changes toast→modal UX). These are churn, not value.

## OPEN-FLAGGED — need Austen (do NOT auto-ship)

High value, but each crosses a gate the agent can't clear autonomously.

### TKA generation domain (verify vs canonical validation sets / MCP)
- **F1. Loop-executor wrong validation sets** — ✅ SHIPPED `93be9db`. Both executors now gate on the correct sets, verified against canonical `LOOPValidator`/UI `loop-validator` + MCP + regression tests.
- **F2. `MIRRORED_ROTATED_SWAPPED` unhandled** in `loop-executor-selector.ts` (no case → default throw); enum member + detector still emit it. Wire an executor or coordinate enum removal. M-L.
- **F3. Float directional-tuple dead branches (90° wrong)** — `directional-tuple-processor.ts:75-94` (diamond) & `:133-153` (box): `indexOf` on wrong-grid `order` returns -1 → every float takes the CCW transform. M. Gate: positioning + visual before/after.
- **F4. Spell `maxReversals` never enforced** (`variation-constraint-builder.ts:32` + `random-sequence-generator.ts:550-552`); **`highContinuity` no-op** (`:36`, `minContinuityScore` has zero readers). M each. Gate: generation behavior.
- **F5. Arrow `getDiagnostics` legacy ori-bucket / turnsTuple key** — `arrow-adjustment-calculator.ts:256,322,356,619`. S each. Gate: confirm Inspect/WASD doesn't write from diagnostics.

### Payments (payment-path gate)
- **F6. Merch webhook no idempotency** — `handleMerchWebhook.ts:86` unconditional `.add(order)`; Stripe re-delivery double-fulfills. Fix: `.doc(session.id).set(order)`. S. HIGH value.
- **F7. `past_due` client/server disagreement** — client counts it active (`subscription-manager.ts:178`), server revokes premium (`index.ts:98-124`). Grace-period policy decision. S.
- **F8. Active product w/ empty `stripePriceId`** → Stripe throws (`createMerchCheckout.ts:101-103`). Fails safe; add early reject. S.

### Auth / data-loss (runtime gate)
- **F9. Anon→collision leaves child services on discarded uid** — `auth-state.svelte.ts:500-502` flag reset only in `signOut()`; collision branches (`anonymous-upgrade.ts:132,155,190`) re-auth without sign-out. Track bound uid, reset+re-init on uid change. M.
- **F10. prop-unlock load/persist auth-race** clobbers member data — `prop-unlock-manager.ts:39-84` no `loadedAsUid` (masked today by `PROP_LOCKING_ENABLED=false`). M.

### 2-device / LAN (needs two devices)
- **F11. LAN-sync joiner receive-only** — `peer-connection-manager.ts:198-208`. M.

### Deck / print (PDF-output gate)
- **F12. Null render holes desync cards from element sheets** — `PrintPreviewPages.svelte:546` filters nulls, shrinking emitted pairs. M.
- **F13. Printed recipe reflects live dials, not viewed release** — `DeckReleaserTab.svelte:295-333` `buildDeckMeta` reads live `rs.*` not `rs.viewingRelease?.recipe`. M.

### Visual / theming (visual gate)
- `TopologyCanvas.svelte:87-89,133` hardcoded hex + blank empty-state; `topology-presets.ts:73-90` 2-box vs diagonal-box build identically (TKA-domain: what should diagonal-box build?).

## Fresh bug-hunt (2026-07-11 wave 4 — new findings, verified vs live code)

Parallel hunters swept create/generate, sequence-viewer, browse/gallery, library, persistence.

### Being fixed this session (fix wave in flight / committed)
- **Video count caches 0 on fetch failure** (`browse/services/video-count-manager.ts:37,54-65`) — session-singleton pins count at 0 after one transient error. S.
- **Same-word variation loads ignore sequenceId** (`browse/services/sequence-detail-loader.ts:24-40` + consumers `sequence-motion-loader.ts:21`, `browse-event-handler.ts:123`, `claude-code-copier.ts:36`, `SequencePanel.svelte:194`) — viewer/playback/edit show the WRONG variation for repeated words. HIGH, S.
- **Cloud-URL invalidation omits showQRCode** (`browse/components/PropAwareThumbnail.svelte:292,471`) — invalidates wrong cache key for QR thumbs. S.
- **Render-queue timeout never aborts** (`browse/services/thumbnail-render-queue.ts:143-163`) — hung render keeps running, real concurrency exceeds cap. S.
- **deleteCellCache key never matches stored key** (`sequence-viewer/services/preview-cell-renderer.ts:259-267` vs store sites) — "Force re-render" is a silent no-op; stale render read back. HIGH, S.
- **CellPreWarmer activeWarms delete-by-key race** (`sequence-viewer/services/cell-pre-warmer.ts:197,215`) — evicts newer controller. S.
- **emptyRecycleBin >500-op batch** (`library-recycle-bin.ts:173-185`, BOTH shared+features copies) — public seqs double the op count; recycle bin fails to empty at scale. HIGH, S.
- **deleteSequences unchunked batch** (`library-batch-operations.ts:74-91`, BOTH copies) — selectAll delete >500 ops fails entirely. HIGH, S.
- **Migrated tags never reach listeners on first save** (`library-repository.ts:532-554`) — `finalSequence` reassigned in async `.then` but notify/public-sync read it synchronously first; undercuts the tag fix shipped earlier. MEDIUM-HIGH, S.

### Deferred (real but lower value / uncertain / needs care) — next session
- **saveUserWork read-modify-write race** (`persistence/services/dexie-persistence-service.ts:336-345`) — no txn, no unique `(type,tabId)` index → duplicate userWork rows / stale reads. Fix: wrap in a Dexie transaction or add a unique compound index. M.
- **savedHashCache never invalidated after save/delete** (`sequence-viewer/state/library-action-handler.svelte.ts`) — save affordance shows stale state for the mount. Fix: set/clear the hash entry + `isSaved` in handleSave/handleDelete. S. (Flagged in viewer fix wave.)
- **orderBy on optional engagement fields drops legacy docs** (`library-repository.ts:875-877`) — Firestore excludes docs missing `viewCount`/`forkCount`/`starCount`. UNCERTAIN a UI path passes these sortBy to the server query (client-side sort in library-state may cover it). Verify before fixing.
- **addSequenceToCollection increments count unconditionally** (`collection-manager.ts:435-438`) — `increment(1)` fires even when `arrayUnion` de-dupes → count drift. LATENT (callers check membership first). S.
- **3D recording countdown is dead** (`sequence-viewer/components/export-coordinator.svelte.ts:50`) — `const countdownValue = $state(0)` never written; overlay branch unreachable. Feature-incomplete, not a clear fix — product call.
- **loadViewMode drops `"image"` mode** (`sequence-viewer/services/sequence-modal-persistence.ts`) — coerces persisted `image`→`split`. Likely deprecation leftover.
- **tag rename can create duplicate-named tag** (`tag-manager.ts:163` updateTag) — no same-name check like createUserTag. Data-hygiene.

### Create/generate flow (hunter A — verified vs live code)

Being fixed this session (create fix wave in flight):
- **Autosave restores the OLDEST stale draft (data loss)** (`create/shared/services/autosaver.ts:63-69,112-115`) — `db.userWork.put` with no id on a `++id` table inserts a new row every save; `loadDraft.first()` returns the oldest near-empty snapshot, discarding later work + unbounded growth. HIGH, S.
- **config-mapper force-downgrades quartered→halved** for `rotated_inverted`/`rotated_swapped` (`shared/create/utils/config-mapper.ts:99-112`) — substring test out of sync with canonical `ROTATED_LOOP_TYPES`; user's Quartered choice silently discarded → period-2 loop. HIGH, S.
- **Spell preferences persisted but never restored** (`spell/components/SpellPanel.svelte:104-114` vs `:135-147`) — reload resets circular/loopType/preset to defaults. MEDIUM-HIGH, S.
- **Autosaver dirty-flag race** (`autosaver.ts:49-50,72`) — edit during in-flight save is erased. MEDIUM, S.

Deferred (real, but need care/design/intent) — next session:
- **Redo is a permanent no-op across the whole Create module** (`create/shared/services/undo-manager.ts:194-234` never sets `afterState`; `undo-controller.svelte.ts:166-170` redo bails on undefined `afterState`). Redo dead in Construct/Generate/Spell. Fix: snapshot current state into `afterState` during `undo()`. HIGH but M — needs care with undo/redo stack semantics.
- **`mapDifficultyToLevel` has no SKEWED case** (`shared/create/services/sequence-metadata-manager.ts:31-42` + generate copy) → SKEWED builds at level 2, contradicting `config-mapper.difficultyToLevel(SKEWED)=4`. Latent (LevelCard clamps at 3). Decide the clamp-vs-level-4 contradiction too. S.
- **orientationContinuityValidator injected but never invoked** in both spell generators (`word-sequence-generator.ts:43`, `random-sequence-generator.ts:47`) — dead-wired. NOTE: the S3 crash-guard shipped this session hardened this validator, which turns out to be uncalled. Wire-in (M) or remove (S) — intent decision. Ties to F4/OPEN-FLAGGED spell controls.
- **Spell `highContinuity`/`maxReversals`/`minContinuityScore` dead** (`variation-constraint-builder.ts:26,32,36`) — same as F4. Intent decision.

## Separately observed
- `npm run check` requires `build:packages` first — otherwise `@tka/domain` fails to resolve and cascades ~13 errors into `tika/*` + `Type1HybridPage.svelte`. Not code bugs; a check-baseline note (they resolve once packages are built).
