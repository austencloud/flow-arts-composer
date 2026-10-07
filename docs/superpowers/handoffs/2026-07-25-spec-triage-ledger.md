# Spec Triage Ledger — 2026-07-25

All 155 specs in `docs/superpowers/specs/{active,backlog}` audited by reading each
spec and verifying its named deliverables against the working tree.

**APPLIED 2026-08-02.** All 55 SHIP and 18 ARCHIVE verdicts are now on disk (20
had been applied in a later 07-25 pass; the remaining 53 were moved 08-02).
`active` + `backlog` went 123 → 63. Seven spent audit logs from the REFERENCE
section were filed to `specs/audits/`, resolving judgment call 11; the five
REFERENCE docs holding real open work stayed in the queue (hardening
reconciliation, q-scan instrumentation, reversal-derivation Option B, mandala
roadmap, presence register).

A few of the 20 earlier moves landed in the opposite bucket from their verdict
(SHIP→`archived/`, ARCHIVE→`shipped/`). Both are out of the queue, so this was
left alone rather than relitigated.

**Still unapplied: the 37 BANNER verdicts.** Those are the rebuild hazards — do
them next. The original text below is unchanged.

## Method + confidence

Nine subagents (Sonnet), one per domain bucket, each given the same protocol:
read the spec fully, verify deliverables on disk (Glob/Grep/Read/`git log`),
emit one verdict per spec with concrete evidence. Read-only; all file moves were
reserved for the controller.

**Confidence tiers — treat these differently:**

| Tier | What | Trust |
|---|---|---|
| A | Verified directly by the controller this session | High — repro steps in the handoff |
| B | Agent-reported with specific file paths / commit SHAs / grep results cited | Good — spot-check before irreversible action |
| C | Agent-reported inference without a cited artifact | Verify before acting |

Everything below is tier B unless marked. The **12 specs already moved to
`shipped/` earlier in the session are NOT in this ledger** — those were closed
before the audit and are already committed.

## Known detector blind spots (why reading beat tooling)

`scripts/spec-drift-detector.cjs` rated many of these `OK` or `NO_STATE`. Its
file-existence signal is structurally unreliable in this repo:

- **Sweeping PascalCase→kebab-case rename.** `AvatarAnimator.ts` →
  `avatar-animator.ts`. Named deliverables read as missing.
- **Extraction to external packages.** `hover-expand-overlay-sidebar` read as 60%
  missing; the whole sidebar now lives in `@austencloud/sidebar`.
- **Module renames.** `features/shop` → `features/store`; choreo-sheet work lives
  in `features/write/`.
- **Same-day ships.** `beta-offset-swap` shipped the day it was written, then got
  renamed twice, so it read as zero commits on its named files.
- **False "100% missing".** `festival-hub` was reported fully absent; the module
  is built and live in navigation.

Corollary: **do not archive on "deliverables missing" alone.** Glob the basename.

---

## SHIP — deliverables verified present, success criteria met (55)

Action: `git mv` to `shipped/`, clear `remaining`, set `last_triaged`.

| Spec | Note |
|---|---|
| active/2026-05-21-viewer-popover-architecture-design.md | Bits UI migration, dark-mode prop SVGs, registry categories all live; `forceIndividual` gone |
| active/2026-05-28-export-fidelity-and-share-design.md | Both goals met; Feature 1 via the P3+P5 offscreen path, not its own named files |
| active/2026-05-29-3d-trail-parity-design.md | All deletions confirmed; tier-gated bloom live in any scene |
| active/2026-05-29-p3p5-unified-render-context-export-design.md | Every locked decision + dead-code purge verified; resize hack gone |
| active/2026-05-31-card-arrow-fix-design.md | Fix Arrows mode live via existing StepGrid; no dirty-flag optimization (optional) |
| active/2026-06-04-effects-preset-data-consolidation-design.md | `presets/types.ts` present, `effects-preset.ts` deleted; spec's "50 tests" overstates count |
| active/2026-06-21-art-settings-panel-design.md | Full export call chain wired; spec's spy unit test never written |
| active/2026-06-22-qr-scan-to-play-design.md | Parts A+C shipped, C beyond spec; Part B (print caption) dropped by documented in-code decision |
| active/2026-06-22-tunnel-effects-layer-coverage-design.md | `emitter-tip.ts` + `buildEmitterTips`; `buildFourPosTips` deleted |
| active/2026-06-23-effect-tuner-design.md | Clean⇄Tunnel toggle, STAFF default, copy-JSON; preset localStorage block removed |
| active/2026-06-27-variation-picker-polish-design.md | All 4 changes + the verify-only item |
| active/2026-06-29-create-tutorial-mobile-fullscreen-design.md | Exact `max-width:900px` block as designed |
| active/2026-06-29-create-tutorial-type1-and-tap-play-design.md | Type-1 grid, hideFilters, tap-to-play; kept an extra card↔canvas toggle |
| active/2026-06-29-fire-switch-prewarm-design.md | All 3 triggers (startup warm, hover intent, keep-warm) + dedicated test |
| active/2026-06-29-instant-scan-card-pictographs-design.md | All 5 parts; Part 2 stronger than spec (render-at-QR-creation) |
| active/2026-06-30-account-deletion-provider-aware-reauth-design.md | Plus an extra Instagram branch |
| active/2026-06-30-add-to-collection-ux-design.md | MVP both entry points, unit + component tests |
| active/2026-06-30-choreo-sheet-design.md | Exceeded: collections, size controls, packing modes, Acts dock |
| active/2026-06-30-content-hash-v2-rollout.md | `CONTENT_HASH_VERSION = V2` live; all 5 named commits exist |
| active/2026-06-30-creator-profile-readability-density-design.md | All 4 changes; max-width 1920 not 920 (later 4K pass) |
| active/2026-06-30-minimal-2d-player-chrome-design.md | Seek-enabled bar, always-on chrome, transport bar removed |
| active/2026-06-30-save-to-library-polish-design.md | All 4 changes verified |
| active/2026-07-01-choreo-act-playback-design.md | `buildActSequence` + ActPlayer docked |
| active/2026-07-01-choreo-sheet-v2-design.md | All 4 gaps closed + tests + PDF parity |
| active/2026-07-01-my-collections-tab-design.md | Base list/detail + foreign read-only path |
| active/2026-07-02-gallery-thumbnail-warm-pass-design.md | All 4 units; dead endpoint deleted |
| active/2026-07-02-library-home-design.md | Phase 1, 2, v2, and the collection-group addendum |
| active/2026-07-02-scan-card-to-collection-design.md | Every named unit + `barcode-detector` dep |
| active/2026-07-02-sw-update-flow-design.md | All 3 seams + tests (absorbed into existing harness) |
| active/2026-07-02-whats-new-toast-design.md | Reuses the toast `action` primitive |
| active/2026-07-03-scan-handoff-desktop-to-phone-design.md | All units + matching unit tests |
| active/2026-07-03-sectioned-virtual-gallery-design.md | Windowing wrapper + external-scroll integration |
| active/2026-07-05-hover-expand-overlay-sidebar-design.md | Shipped bigger: extracted to `@austencloud/sidebar` |
| active/2026-07-05-shortcode-dup-mint-fix-design.md | Every layer verbatim incl. rules + backfill script. **Approach C did land — no re-mint risk** |
| active/2026-07-06-max-turn-intensity-filter-design.md | Filter + chip + drill section + smart-collection inheritance |
| active/2026-07-06-smart-collections-design.md | Model, detail branch, both entry points |
| active/2026-07-07-founding-smart-collections-design.md | All 6 changes + count-check test |
| active/2026-07-08-collections-ia-mine-joint-others-design.md | Both units; tab relabeled discover→Collections |
| active/2026-07-08-reversal-pattern-smart-collections-design.md | All 3 units + tests |
| active/2026-07-13-shop-cart-order-doc-design.md | Server-authoritative orders; legacy path has no callers |
| active/2026-07-14-multi-select-turn-editing-design.md | Shipped in StepControlsZone, not the spec's SelectionToolbar (still dead code) |
| active/2026-07-17-poi-legal-composer-filtering-design.md | Hook point, per-hand semantics, DEV/admin gate, 7 tests |
| active/2026-05-20-per-performer-prop-sizing-design.md | All deliverables incl. the external scene-3d patch; Popover→Hub rename |
| backlog/2026-03-23-festival-hub-design.md | Module live and registered. **Detector said 100% missing — wrong** |
| backlog/2026-04-10-timeline-sequence-integration.md | Both phases; POV Pattern Lab |
| backlog/2026-04-24-level-1-guide-redesign.md | Fully shipped under renamed route/section architecture |
| backlog/2026-05-05-edge-ssr-migration-design.md | adapter-cloudflare + wrangler; SSR OG tags verified by curl |
| backlog/2026-05-12-beta-offset-swap-design.md | All 9 files under kebab-case paths; shipped same day |
| backlog/2026-05-13-left-rail-2d-3d-split-design.md | `animation-3d` content type; RenderModeToggle removed |
| backlog/2026-05-23-social-sharing-ssr-design.md | Shipped; sitemap solved more durably (dynamic server route) |
| backlog/2026-05-27-multi-axis-deck-picker-design.md | Test page built, one extra axis |
| backlog/2026-05-29-museum-keepalive-persistence-design.md | Generalized beyond spec to 3 modules |
| backlog/2026-05-30-box-mode-axis-design.md | Helper, seam, descriptor, UI, tests |
| backlog/2026-05-30-parity-harness-unification-design.md | Shipped and extended past scope |
| backlog/2026-06-17-tka-explanation-single-source-design.md | Shipped same day; one test-guarded deviation |

---

## ARCHIVE — dead, reverted, or superseded (18)

Action: `git mv` to `archived/`, add `superseded_by`, add an ARCHIVED banner.

| Spec | Why |
|---|---|
| active/2026-04-15-sequence-viewer-redesign-design.md | Architecture rebuilt **twice** since (performer-rail → performer-hub). Every named file obsolete. → `shipped/2026-05-23-performer-hub-design.md` |
| active/sequence-viewer-redesign-notes.md | Companion notes to the above; archive alongside |
| active/2026-05-30-loop-composer-deoverwhelm-design.md | 3-column design prototyped, never shipped; production shipped a bento redesign instead |
| active/2026-06-22-qr-minimal-viewer-parity-design.md | /q structurally rebuilt on SequenceViewerShell; the described problem is now impossible |
| active/2026-06-30-crossfade-primitive-design.md | Stale duplicate of the same-day `crossfade-consolidation` spec, which shipped |
| active/2026-07-02-viewer-scan-chrome-unification-design.md | Goal met by a superseding design (one shared shell). Its 3 proposed files never existed |
| active/2026-07-08-creators-to-social-design.md | Body says "Superseded 2026-07-25". Creators shipped as standalone `/creators` with legacy redirects. **File is dirty from another session — coordinate before moving** |
| backlog/2026-03-10-store-screenshot-capture-design.md | Never built; a more general Lab screenshot system solves the need differently |
| backlog/2026-03-16-media-workspace-design.md | Whole video-panel lifecycle shipped under renamed terminology inside a bigger collab-video feature |
| backlog/2026-03-26-card-designer-split-screen-design.md | Built then deleted wholesale (`dd8420258d`); Card Designer no longer exists |
| backlog/2026-03-28-fuse-tab-v2-design.md | v2 built then explicitly reverted (`9cc19b0b0e`); Fuse rebuilt on unrelated architecture |
| backlog/2026-03-28-merge-card-view-into-decks-design.md | Both source and destination tabs since retired |
| backlog/2026-04-01-physical-merch-store-design.md | Absorbed in expanded form by shop-spin-up + shop-cart-order-doc |
| backlog/2026-04-01-view-sequence-mcp-tool-design.md | Never built and now **forbidden by CLAUDE.md's MCP-only rendering rule** |
| backlog/2026-04-06-arrange-tab-unified-sidebar-design.md | UX problem solved by a shipped pill-nav design; `ArrangeSidebar.svelte` never existed |
| backlog/2026-05-25-ocean-scene-cache-layers-design.md | Target architecture (runtime placement) replaced by baked GLB — nothing left to cache. Its own "already implemented" Layers 1-2 are also absent |
| backlog/2026-05-27-half-step-midpoints-design.md | Idea re-derived and shipped 2 months later as `build-halved-step.ts` → `2026-07-14-halved-pictograph-pipeline-design.md` |
| backlog/2026-05-27-tka-classification-duality-design.md | Zero implementation; integration target rewritten. Lives on as memory-tracked `project_hand_vs_prop_duality` |

---

## BANNER — partly shipped, spec misreports state (rebuild hazards) (37)

Action: add a DRIFT WARNING beside the stale status claim, lead frontmatter
`remaining` with the corrected state. **Do not delete the stale line** — correct
the record without destroying it. 5 specs already carry banners from earlier in
the session (marked ✓).

| Spec | Real state / what remains | V/E |
|---|---|---|
| active/2026-04-15… ✓ | (see ARCHIVE — banner exists, upgrade to archive) | — |
| active/2026-04-20-sequence-engine-unification-design.md | Phases 0-2 shipped via a **different** subtype architecture; Phase 3 (delete 5 app-side LOOP executors) still open — the bug that motivated the spec | 5/L |
| active/2026-04-24-native-mobile-integration-design.md | Android + deep links + Capgo OTA + native Google sign-in shipped; **no `ios/` dir at all**, no store listings, no SQLite/share/BLE/NFC | 5/XL |
| active/2026-05-04-god-file-decomposition-design.md | Says "Draft"; real decomposition landed unevenly. ChoreoCard 2090→287. Museum3DScene 1770→1374 (target 600). Orchestrator + library-repository untouched | 3/L |
| active/2026-05-12-anatomical-ik-constraints-design.md | Constraint math written + unit-tested but **imported only by its own test** — never wired into the live IK solve | 3/S |
| active/2026-05-12-spatial-lab-design.md | Shipped as a full **3D Threlte** scene, directly contradicting the spec's "pure 2D SVG, no Three.js" decision. No tests | 2/S |
| active/2026-05-20-scene-composer-design.md | Phases 1-3 live in Scene Lab Compose mode; museum editor migration (the dedup point) never happened | 3/M |
| active/2026-05-28-animation-engine-rearchitecture-design.md | 5 managers + plugin registry + HMR fix shipped; `StateSynchronizer` was **relocated, not dissolved** as specced | 3/S |
| active/2026-05-28-inspect-panel-redesign-design.md | Shipped, relocated to a footer dock; 4-tier picker narrowed to 2 and Default became editable, both undocumented | 2/S |
| active/2026-05-31-ceremony-phase5-stateless-isolated-design.md | Phase C rename ~complete (173→13 files); Phase 5 + Phase 3 show no measurable progress | 2/M |
| active/2026-05-31-unified-generation-vocabulary-design.md | Phases 1-2 shipped past spec; Phase 0's actual goal (collapse 3 reversal + 2 turn representations) and Phases 3-4 unstarted | 2/M |
| active/2026-06-12-canon-prop-creators-redesign.md | 5 of 6 shipped; mobile title-row hide not done, and the panel was since redesigned | 2/XS |
| active/2026-06-16-effect-leg-bolstering-design.md | 3 of 4 legs survive; Echo's rework was **deleted** and replaced by Ghost | 2/S |
| active/2026-06-16-modular-kit-museum-design.md | Kit instancing live for institutional wall-section only; corners/doorways never authored | 3/M |
| active/2026-06-16-user-onboarding-overhaul-umbrella.md | Slices A, B shipped; D shipped copy-only; **Slice C unbuilt** — the only live gap | 3/M |
| shipped/2026-06-20-real-flow-notation-aruco-design.md | Resolved 2026-08-03: LED record shipped, ArUco plan archived, and real-clip validation remains tracked elsewhere | 4/S |
| active/2026-06-21-personal-museum-design.md | Entire data/service/state/component layer **and both hard rendering seams** built and tested — but **no `/my-museum` route**, so unreachable | 3/S |
| active/2026-06-23-shop-spin-up-design.md ✓ | Everything functional shipped; A1's literal folder rename (`features/store` → `features/shop`) never done | 5/XS |
| active/2026-06-26-shop-operations-go-live-design.md ✓ | Tax, shipping, preorder swap, product art, fulfillment all live; general `/shop` catalog still admin-gated (per-product pages are public) | 5/S |
| active/2026-06-26-shop-transitions-design.md | Items 1-4 shipped past spec; item 5 (grid entrance stagger) never built. Its `depends_on` WSL blocker is stale | 3/XS |
| active/2026-07-01-gallery-drill-content-peek-design.md ✓ | Drill v7 shipped and iterated to v8.3 | — |
| active/2026-07-01-gallery-front-door-phase1-design.md ✓ | **Zero named files exist.** Netflix-shelf architecture superseded outright by drill v7. Candidate for ARCHIVE, not banner | — |
| active/2026-07-03-fable-mandala-signature-identity-design.md | 1 of 5 tasks shipped (art presets); other 4 deliberately parked by Austen | 2/M |
| active/2026-07-05-qr-account-funnel-design.md | Download gating shipped; the always-present sign-in chip never built — `ctx.openSignInPrompt` is dead code with zero consumers | 4/S |
| active/2026-07-14-image-seo-google-images-design.md | **Retired 2026-08-02.** The duplicate public letter index, image bake, sitemap entries, and active spec were removed; the in-app Guide Codex remains. | removed |
| active/2026-07-22-first-session-activation-design.md | Says "awaiting re-review"; SP1/SP2/SP3 substantially built and tested. Remaining: retro-login anonymous guard; 3 SP3 ledger items unverified | 5/M |
| backlog/2026-04-01-museum-interior-design-system.md | 3 of 4 systems shipped verbatim; TV display system (Section 2) does not exist | 3/M |
| backlog/2026-04-05-unified-view-toggle-and-perf-harness.md | Q-cycle shipped exactly; perf harness never built | 2/S |
| backlog/2026-04-11-turn-in-place-animation-design.md | Large IK framework shipped in external scene-3d, **zero app-side consumers**; 2 of 7 clips exist (frontmatter's "no clips" is stale) | 3/M |
| backlog/2026-05-23-3d-scene-performance-design.md | Shader warm-up + most material sharing shipped; LOD, ObsidianPillars instancing, shadow-caster limiting did not | 3/M |
| backlog/2026-05-23-error-boundary-system-design.md | Own 2026-05-31 trailer accurate and verified; only the documented P3 residual remains. Nearly SHIP | 1/XS |
| backlog/2026-05-23-security-hardening-design.md | Its own "PARTIALLY SHIPPED" table is accurate 6 weeks on. F1/F5 need Austen's product decision on guest/anon access | 4/M |
| backlog/2026-05-23-utility-deduplication-design.md | Phase 4 (word-simplifier) shipped independently; `math.ts`/`format.ts` never created, ~12 `lerp` definitions remain | 2/M |
| backlog/2026-05-25-prop-selection-redesign-design.md | Visual half shipped verbatim; popover half abandoned for a flat per-variant grid. Vestigial badge code is dead | 2/S |
| archived/2026-05-25-stage-locomotion-design.md | Full Stage module shipped with **motion matching** (beyond spec's blend tree); own ledger 0/17 checked; prop-overlay unverified | 3/M |
| backlog/2026-05-25-stage-locomotion-polish-backlog.md | Item 1 (inertialization) shipped; items 2-5 unbuilt | 2/M |
| active/effects-unification-deferred-items.md | Of 6 items: 1 fixed, **2 moot** (referenced code deleted), 3 genuinely open | 2/S |
| backlog/2026-04-15-unified-gpu-render-pipeline-design.md | Phases 0-1 shipped and **live in production by default** (WebGL2 trails); Phase 2 half-built unwired; Phase 3 built then **orphaned** (zero mounts); Phase 4 unused scaffolding | 4/L |

---

## KEEP — genuinely open, spec accurate (16)

Action: refresh `value`/`effort`/`remaining`/`last_triaged`. No move.

| Spec | Remaining | V/E |
|---|---|---|
| active/2026-05-30-deriver-collapse-design.md | **All sub-jobs.** Documents a real divergence; note the mcp-server half is now FIXED (see handoff) so re-scope before starting. Assemble-lab target moved | 4/L |
| active/2026-06-04-header-pattern-glyphs-design.md | Everything; accurate "specced, not started" | 2/M |
| active/2026-06-21-tutorial-coach-mark-start-position-design.md | Spotlight/coach-mark; the duplicate picker is still mounted | 3/S |
| active/2026-06-24-effect-defaults-tuning-progress.md | 15 effects; the 1/√N normalization helper genuinely absent; bloom radius 36-vs-50 unresolved | 3/L |
| active/2026-07-22-trail-hand-tracking-mode.md | Feature shipped; the thumb/pinky bug is real and its prescribed dev-log was never added | 4/XS |
| active/2026-07-25-sequence-public-parity-repair-design.md | Entire 5-phase rollout; 1 day old, explicitly requests Opus 5 review | 5/XL |
| backlog/2026-04-11-collision-lab-future-work.md | Changes 2 + 5; `three-mesh-bvh` is installed but has zero imports | 2/L |
| backlog/2026-05-23-accessibility-fixes-design.md | All 10 issues; only 2 of 65+ 3D files honor reduced-motion | 3/M |
| backlog/2026-05-23-cross-feature-decoupling-design.md | All 4 phases; no ESLint rule, cross-feature imports still present | 3/L |
| backlog/2026-05-23-firebase-cost-optimization-design.md | All 4 fixes; unbounded `getDocs` and `get()`-based role checks still live | 3/M |
| backlog/2026-05-23-spacing-token-system-design.md | All 6 phases; theme still 0.1.0, no codemod | 3/L |
| backlog/2026-05-24-viewer-orchestrator-state-machine-design.md | The state machine; a lighter consolidation shipped instead — decide if that's enough | 2/L |
| backlog/2026-05-25-mandala-phase2-trails-design.md | Whole feature; **integration target stale** (`MandalaViewerControls.svelte` no longer exists) | 2/M |
| backlog/2026-05-25-mandala-phase3-shareable-links-design.md | Entire feature; 0% built (worse than detector's 64%) | 4/M |
| backlog/2026-05-27-dyads-fused-pictographs-design.md | Everything; zero code. Fallback-render slice doesn't need Austen's arrow SVGs | 1/L |
| backlog/2026-05-29-glb-environment-registry-design.md | Full build; the hardcoded 10-case switch is exactly as diagnosed | 3/M |

---

## BLOCKED — open, gated outside the repo (12)

Action: set `depends_on: "external: <blocker>"`, keep in `active/`.

| Spec | Blocker |
|---|---|
| active/2026-07-03-fable-loop-detection-audit-fixes-design.md | Elevated `Restart-Service FlowArtsKnowledgeMCP` + `@tka/domain` rebuild |
| active/2026-07-03-fable-practice-judgment-loop-design.md | Camera + gated behind the parked real-flow perception core |
| active/2026-07-03-fable-real-flow-notation-validation-design.md | A labeled ground-truth video clip from Austen |
| active/2026-07-23-first-session-exception-remediation.md | A clean deploy window — code complete, 274 tests pass |
| active/2026-07-23-gallery-thumbnail-tail-latency-design.md | Signed-in admin fan warm + iPhone/desktop benchmark |
| active/2026-07-23-inbox-ios-focus-zoom-design.md | Physical iPhone |
| active/2026-07-23-inbox-multiline-message-rendering-design.md | Signed-in Inbox session |
| active/2026-07-23-train-screen-wake-lock-design.md | Physical iPhone with short Auto-Lock |
| active/2026-06-21-enchanted-autumn-dusk-design.md | 3 Meshy GLBs never generated (`terrain-shell`, `hero-tree-a/b`) — scene loads missing models |
| backlog/2026-04-04-arrow-tip-z-promotion-design.md | Manual Illustrator split of 60-62 SVGs; the algorithmic splitter was tried and deleted |
| backlog/2026-04-14-festival-qr-offline-audit.md | Apple Team ID (`TEAMID` placeholder still in AASA) + no `ios/` scaffold |
| backlog/2026-04-27-kickstarter-campaign-design.md | Physical proof-run photos/video |

---

## REFERENCE — not work items (17)

Action: decide per doc whether it belongs in `specs/` at all. Audit logs and
ledgers arguably belong in `docs/reference/` or `handoffs/`.

| Spec | Kind / still-open content |
|---|---|
| active/2026-06-16-codebase-quality-audit-operation.md | Rolling audit ledger, stalled at wave 9 for 5+ weeks |
| active/2026-06-16-performance-audit-design.md | Handoff. Hero-video poster fix is unblocked; three.js-off-boot blocked on a package release |
| active/2026-06-18-first-time-user-audit.md | Audit; findings have drifted (some fixed, one refuted). Still open: publish-gate timing, deep-link dead-ends, blocked-tab silence |
| active/2026-06-19-wave9-flagged-findings.md | Findings list; doom-loader SRI + transition-graph dedup + ~40 minor items open |
| active/2026-06-25-remote-hardening-session.md | Session log, accurate; 5 test/env decisions unresolved |
| active/2026-06-28-hardening-audit-findings.md | Superseded by the 07-11 reconciliation, except a confirmed-live LAN-sync joiner bug |
| active/2026-06-28-hardening-audit-wave2.md | Superseded by the 07-11 reconciliation; work from that doc instead |
| active/2026-07-11-hardening-verification-reconciliation.md | **The current authoritative hardening ledger.** S5/S7 open; F6 since fixed by shop work; F11 confirmed open |
| active/2026-07-03-fable-dispatch-index.md | Index; every spec it points to has since moved |
| active/2026-07-11-fable-parallel-dispatch-tonight.md | Single-night dispatch plan, spent |
| active/2026-07-20-q-scan-instrumentation-ledger.md | Generated inventory: 90 controls, 75 events, **100% unbuilt**. Real value — consider promoting to a scheduled spec |
| active/2026-06-30-reversal-derivation-reconciliation-findings.md | Memo. Options A and C both shipped elsewhere; **Option B never executed** and is a real gap |
| active/2026-07-01-presence-as-signal-register.md | Living policy doc, actively consulted (modified 2026-07-21) |
| active/2026-07-05-content-hash-v2-checkpoint-package.md | Post-hoc audit of already-shipped work |
| active/2026-05-25-mandala-roadmap.md | Honest roadmap; Phase 1 done, 2-11 unstarted |
| backlog/2026-04-20-mandala-canonical-form-scoping-memo.md | Pre-brainstorm memo; its own next step never ran |
| backlog/2026-07-17-flow-arts-seo-landscape-research.md | Strategy memo; 3 recommended actions not executed |
| active/sequence-viewer-redesign-notes.md | (also in ARCHIVE — move with its parent spec) |

---

## Judgment calls the agents escalated

Each needs a product decision, not more verification.

1. **`/shop` catalog gate** — permanently admin-gated with public per-product pages, or is full public catalog release still wanted?
2. **`features/store` → `features/shop` rename** — cosmetic; keep the "URL says Shop, code says store" split?
3. **Kickstarter vs. live Stripe preorders** — does the live shop change whether the campaign happens?
4. **iOS leg** — still a business priority, or re-scope native to Android + web?
5. **`gallery-front-door-phase1`** — archive outright (nothing built, superseded), or is a shelf home still wanted alongside the drill?
6. **`unified-gpu-render-pipeline`** — finish Phase 2 wiring and integrate-or-delete the orphaned Phase 3 `UnifiedViewerCanvas`?
7. **`personal-museum` / `anatomical-ik`** — both fully built and unreachable. Write the route / wire the solver, or delete the dead code?
8. **`enchanted-autumn-dusk`** — run the 3 remaining Meshy jobs? Scene is otherwise complete.
9. **`turn-in-place-animation`** — wire the framework now at 2/7 clips, or wait for the capture session?
10. **Security F1/F5** — guest QR-video upload and anonymous `tika/sequence` access: keep open or require auth?
11. **REFERENCE docs** — relocate audit logs/ledgers out of `specs/` so the queue stops scoring them?
12. **`sequence-public-parity-repair`** — queue as an Opus 5 *review* task, not an implementation task, as it asks.
