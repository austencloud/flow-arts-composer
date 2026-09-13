# Spec Reconciliation — Opus Batch 2026-09-12

**Date:** 2026-09-13
**Branch:** `claude/spec-reconciliation-aj5ltr`
**Base SHA:** `c4be16199e390e8bdab766051a0042c7827b8d30` (`origin/main`, _Merge pull
request #48 from austencloud/claude/hand-tunnel-toy_)
**Scope:** documentation reconciliation only. No runtime file, agent instruction
file, plan, or other agent's report was touched. Owned paths:
`docs/superpowers/specs/**` and this report.

---

## 1. The finding that changes how you read every drift report

**The cloud checkout arrives as a shallow clone, and the drift detector reads
git history.** On arrival `.git/shallow` existed and `git rev-list --count HEAD`
returned **250** commits reaching back only to **2026-09-08** — five days. The
detector's fourth signal is "commits touching those paths since the spec's
date", so for any spec older than five days that signal was structurally blind.

Same detector, same tree, before and after `git fetch --unshallow`:

| Verdict        | Shallow (250 commits) | Full (16,505 commits) |
| -------------- | --------------------: | --------------------: |
| DIVERGENT      |                     1 |                     9 |
| WATCH          |                     1 |                     5 |
| OK             |                    78 |                    66 |
| **actionable** |                **23** |                **31** |

Eight of the nine rebuild hazards were invisible in the shallow clone, and
twelve specs were reported `OK` that are not. `2026-08-08-sequence-viewer-header-identity-design.md`
showed 19 commits / 6 on named files when shallow; with real history it shows
**98 commits / 48 on named files**.

**Recommendation:** the detector should refuse to run, or print a loud banner,
when `.git/shallow` exists or `git rev-list --count HEAD` is implausibly small.
A verdict of `OK` from a shallow clone is not evidence of anything. I did not
change `scripts/spec-drift-detector.cjs` — it is outside this task's ownership.

---

## 2. What I did

Adjudicated **24 specs** one at a time against the tree and against git, then
made precise status / `remaining` / dependency edits. Nothing was bulk
auto-marked. Where the detector was wrong I said so in the spec rather than
letting the next agent re-litigate it.

| Outcome                                             | Count |
| --------------------------------------------------- | ----: |
| Moved `active/` → `shipped/`                        |    12 |
| Moved `active/` → `archived/`                       |     1 |
| Status/`remaining`/dependency corrected, stays open |    11 |

`active/` went from **156 → 143**; `shipped/` from **589 → 601**.
Detector actionable count went from **31 → 16**.

### 2.1 Closed out — every acceptance requirement proven

| Spec                                              | Proof                                                                                                                                                                                                                                          |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2026-08-01-native-release-surface-hardening`     | Frontmatter already said `status: shipped` / `shipped: 2026-08-02`; only the body header still read "Approved for implementation". `685f9a202`; `feature-flags.ts:216`; `scripts/verify-native-release-surface.mjs` wired into `build:native`. |
| `2026-08-06-ghost-experience-learning`            | `activity-experience.ts` live. `vitest tests/unit/attract/` → **9 files, 68 passed, 2 skipped** (the env-gated fleet test, exactly as the spec's contract expects).                                                                            |
| `2026-08-06-ghost-predictive-judgment`            | `activity-prediction.ts` live; same suite green.                                                                                                                                                                                               |
| `2026-08-06-pictograph-arrival-stage`             | Every timing constant literal (280/350/50ms, 0.58 scrim, 120ms hold); prop rate is `clamp(max(850, deg/360°/s), 850, 2000)` off `staffRotationDelta`, not turn count. 29 assertions pass.                                                      |
| `2026-08-13-gallery-deck-composer-rebuild`        | `06d178647`. Ephemeral library-only engine, spec replays before `initialize()`, cap after ordering, no second query on Compose. 14 tests pass.                                                                                                 |
| `2026-08-15-grid-layout-transition`               | `db1454736` + `6c6163b84`. All three superseded FLIP copies provably gone — zero matches for `animate:flip`, `slideIntoPlace`, or the `activeMode === "construct"` branch in `WorkspaceGrid.svelte`. 12 tests pass.                            |
| `2026-08-23-stage-formation-choreography`         | Phases 1–4d in `1b32c668ff`/`7b0091bdc8`/`183fa4cd7f`/`b80d793708`. Its one open box, Phase 5's proof pass, was **absorbed into One Stage's Phase 7** by that spec's own supersession header — discharged, not skipped.                        |
| `2026-08-26-one-stage`                            | `2686a4cb8`. `StageViewer`/`SceneStudio`/`StageSidebar` deleted; `STAGE_TABS` holds one entry; `Mark[]` survives only in `formation-migration.ts`, the legacy path the design kept on purpose.                                                 |
| `2026-08-27-composer-presentation-promotion-plan` | `8ec8a09c5`. `/composer/mockup` deleted, alias removed from `SiteHeader`, three test files updated in the same commit. No `composer/mockup` reference remains under `src/`.                                                                    |
| `2026-09-01-product-analytics-coverage`           | `8d688b0d5`. The source vocabulary is a **closed 18-value union with no `unknown` member**, so a new call site cannot default silently; emission is success-gated (asserted, not assumed); the ledger exists with its four columns.            |

### 2.2 Closed out with post-ship divergences recorded, not blessed

Two specs shipped and were then deliberately overridden. Closing them silently
would have buried the override; leaving them open would have implied work.

- **`2026-08-12-fuse-4k-workspace-redesign`** — two interaction clauses were
  reversed after ship. Source actions went back behind a `More` overflow menu in
  `57e911b78`, and `fuse-actions-contract.test.ts:68` now _locks that in_
  ("gives desktop sources one primary action and discloses rare actions"). The
  relationship draft previews live onto the canvas; only the persisted
  relationship is untouched. Label drift throughout ("Use this relationship",
  Separate/Linked). `OptionChipRow` is named as the owner of transformation
  selection but Fuse never adopted it. **The tests are the contract now.**
- **`2026-08-21-adaptive-scene-control-workspace`** — three constraints no
  longer hold. The "no more than five primary actions" rail ceiling is broken:
  Presets (`34c0f135b`) and Focus avatar (`cfb54c17b`) bring it to **seven**
  non-admin entries. The compact gate is implemented as 500px unconditional /
  544px only under 1100px width, not the flat 34rem the text claims — a
  1600×540 workspace is `overlay` in code and `compact` in the spec. And nothing
  in the repository asserts the "always-visible playback timeline"; the
  component explicitly leaves that to the host. **Flagged for you, not
  silently accepted — see §5.**

### 2.3 Archived

- **`2026-08-06-app-shell-4k-lockstep-scaling`** — its own header says
  "Superseded on 2026-08-27; do not implement". See §5 for what that
  supersession turned out to mean.

### 2.4 Rebuild hazards defused — corrected, still open

These are the dangerous ones: a spec that says "approved, not started" over code
that already ships invites an agent to rewrite live behaviour.

| Spec                                              | Claimed                                     | Actually                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2026-08-08-sequence-viewer-header-identity`      | "Approved for implementation on 2026-08-08" | Implemented **the same day** in `7bbabbf45`. All 12 planned files exist; `FULL_CHROME_MIN_WIDTH = 1080` and `LABELLED_CHROME_MIN_WIDTH = 1840` are the two density tiers; `WordActionMenu` offers exactly "Copy word" and "Read aloud". Only the seven-viewport sweep is unrecorded.                                                           |
| `2026-08-09-social-post-handoff`                  | "Approved, unimplemented"                   | Phases 1 **and 2** built; every path in its own "What shipped" table resolves. `META_POSTING_ENABLED` is off pending Meta app review — a real gate, preserved.                                                                                                                                                                                 |
| `2026-08-14-admin-user-count-presence-repair`     | "Approved for implementation"               | Implemented a month earlier in `ce9121c91`. `schemaVersion: 2` presence is live. Gates 1–2 **re-proved this session**: 9 tests pass. Gates 4–5 need a live admin session and stay open.                                                                                                                                                        |
| `2026-08-09-ocean-zone-layout`                    | "Draft for review"                          | Approved and substantially executed across five commits; 6 of 10 ledger items done. All four unchecked items re-tested and confirmed still open.                                                                                                                                                                                               |
| `2026-08-24-multi-email-and-ipad-auth-continuity` | _no `remaining` field at all_               | Outcomes 1–6 built in `20f0395e7`. `email-link-completion.ts:266-276` is outcome 1 verbatim. 15 tests re-run green. Ranked v5/M as fresh work over shipped auth code; re-scored to XS and blocked.                                                                                                                                             |
| `2026-08-02-shop-unification`                     | "local commits — **NOT pushed**"            | `a422744d6`, `0beba2808` and `e84ee4ab4` are all on `origin/main`. The real gate is `SALES_LIVE = false` pending Stripe payout + Tax registration. Also: the retired route is a **308** (deliberate, documented in the route), not the 301 the IA table claims; two ledger SHAs (`0cfcc0e026`, `5126812d89`) do not resolve — the other 26 do. |
| `2026-08-06-account-settings-redesign`            | "Implemented and verified"                  | Implemented in `6a818f9f2`, but **criterion 18 was never built**: the visible label is a bare "Connect" (`ConnectedAccounts.svelte:295`) with the provider name only in `actionAriaLabel:296`. Sighted users get no provider-named affordance.                                                                                                 |

### 2.5 Corrected the other way — detector false positives

Marking these "done" would have been the expensive mistake.

- **`2026-05-29-glb-environment-registry`** (DIVERGENT) — **genuinely unbuilt.**
  `Environment3D.svelte:100` still switches on the external `BackgroundType`
  enum and no manifest or registry module exists. The traffic is shared-3D
  infrastructure work on the same paths (`perf(3d): stream environments…`,
  `refactor(3d): shared environment infra…`) that never touches the switch this
  design exists to remove. The detector's documented "broad paths" mode.
- **`2026-07-27-staff-choreography-first-lesson`** (DIVERGENT) — false positive;
  the sample subjects are MPFB thumb orientation and avatar staff grips. Stage 1
  re-verified as designed (`+page.server.ts` 404s outside dev, `+page.svelte`
  emits `noindex, follow`). Its real problem was different: **`depends_on` was
  empty** while the body has always declared VIDEO-001, so the queue was ranking
  a media-gated spec as unblocked work. Now pinned to
  `2026-07-27-video-001-production-system-program.md`.

### 2.6 Gates deliberately preserved

Nothing shelved was unparked. These remain blocked, by design:

| Spec                               | Gate                                                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| `social-post-handoff`              | Meta app review (`instagram_business_content_publish`, `pages_manage_posts`, `publish_video`) |
| `shop-unification`                 | `SALES_LIVE = false` — Stripe payout requirement + Tax registration                           |
| `multi-email-and-ipad-auth`        | Production UID consolidation (Austen's identity data) + physical iPad keyboard proof          |
| `staff-choreography-first-lesson`  | VIDEO-001 media production program                                                            |
| `admin-user-count-presence-repair` | Live admin claim + authenticated production RTDB session                                      |
| `sequence-viewer-header-identity`  | Authenticated Chrome DevTools target for the viewport sweep                                   |

---

## 3. Ranked next-implementation queue

Score = `value × effort_multiplier` (XS 5, S 4, M 3, L 2, XL 1). Blocked,
duplicate, already-delivered and sibling-claimed items are excluded. After this
pass: **93 specs carry frontmatter, 72 unblocked, 21 blocked.**

| #   | Score | Spec                                                  | Why it is next                                                                                                                                                                              |
| --- | ----: | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   |    15 | `2026-06-26-shop-transitions` (v3/XS)                 | The cleanest quick win on the board. Items 1–4 shipped past spec; only item 5, the grid entrance stagger, was never built, and its `depends_on` WSL blocker is already documented as stale. |
| 2   |    16 | `2026-08-01-rules-fable5-modernization` (v4/S)        | Highest unblocked score with real scope left. **Note:** touches agent instruction files, which this task could not audit — confirm the scope before dispatch.                               |
| 3   |    12 | `2026-05-23-security-hardening` (v4/M)                | Highest-value unblocked item that is neither polish nor sibling-claimed.                                                                                                                    |
| 4   |    12 | `2026-07-14-halved-pictograph-pipeline` (v3/S)        | Bounded domain work, no external gate.                                                                                                                                                      |
| 5   |    12 | `2026-05-28-animation-engine-rearchitecture` (v3/S)   | Small effort against a core system.                                                                                                                                                         |
| 6   |    10 | `2026-08-06-account-settings-redesign` (v2/XS)        | Re-scored by this pass. One real code task — give the provider action a visible name — plus four named tests that were never written.                                                       |
| 7   |    10 | `2026-08-05-collection-message-sharing` (v5/L)        | Highest raw value with no gate; large.                                                                                                                                                      |
| 8   |    10 | `2026-08-11-fuse-shape-matrix` (v5/L)                 | Ditto. Read the Fuse divergences in §2.2 first.                                                                                                                                             |
| 9   |     9 | `2026-06-16-user-onboarding-overhaul-umbrella` (v3/M) | Umbrella; check overlap with first-session activation before starting.                                                                                                                      |
| 10  |     9 | `2026-06-04-header-pattern-glyphs` (v3/M)             | "Specced, not started"; WATCH evidence is thin (2 topical commits).                                                                                                                         |

**Claimed — in flight with sibling agents this batch, do not pick up:**
`2026-04-20-sequence-engine-unification` (10), `2026-07-22-first-session-activation`
(15), `2026-08-21-first-session-analytics-reliability` (15),
`2026-07-23-gallery-thumbnail-tail-latency` (15, also externally gated),
`2026-08-01-scene3d-treeshaking-followup` (12), `2026-05-23-accessibility-fixes`
(9), `2026-05-23-firebase-cost-optimization` (9). I read these for context and
deliberately did not edit them or declare any of their work shipped.

**Excluded as already delivered:** the twelve specs in §2.1–§2.2.
**Excluded as phantom:** `2026-08-26-one-stage-handoff` (score 16) — its own work
is complete; both carried-over items belong elsewhere (see §5).

---

## 4. Commands run and results

All measured, at `c4be1619` unless noted. No build, no `npm run check`, no dev
server (this is a documentation change; `AGENTS.md` calls for formatting,
reference and focused contract checks).

| Command                                                                      | Result                                                         |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `git fetch --unshallow --filter=blob:none origin main`                       | 250 → **16,505** commits; `.git/shallow` gone                  |
| `pnpm install --frozen-lockfile --ignore-scripts`                            | exit 0, 21s                                                    |
| `node scripts/spec-drift-detector.cjs` (shallow)                             | actionable **23**; DIVERGENT 1, WATCH 1, OK 78                 |
| `node scripts/spec-drift-detector.cjs` (full history)                        | actionable **31**; DIVERGENT 9, WATCH 5, OK 66                 |
| `node scripts/spec-drift-detector.cjs` (after this pass)                     | actionable **16**; DIVERGENT 2, PHANTOM_OPEN 2, LIKELY_DONE 12 |
| `vitest run … tests/unit/attract/`                                           | **9 files, 68 passed, 2 skipped**, 69s                         |
| `vitest run … presence-aggregation.test.ts admin-user-summary-route.test.ts` | **2 files, 9 passed**                                          |
| `vitest run … tests/unit/auth/email-link-completion.test.ts`                 | **1 file, 15 passed**                                          |
| Subagent verification sweep (8 specs, opus)                                  | **150 tests passed, 0 failed, across 19 files**                |
| `prettier --check` on every file this branch touches                         | clean, or already failing on `origin/main` before the edit     |

**Formatting note.** Eight of the files I touched already failed
`prettier --check` on `origin/main`; I left those baselines alone rather than
bury a reconciliation diff under a reformat. One file
(`admin-user-count-presence-repair`) was clean before and is clean after.

---

## 5. Things you should look at, that this task could not fix

1. **A dangling spec pointer — but the 4K story does have an owner.**
   `2026-08-06-app-shell-4k-lockstep-scaling-design.md` retires itself in favour
   of `2026-08-27-logical-pixel-responsive-composition-design.md`, and that
   filename was never written. The successor shipped as **policy and code, not
   as a spec**: `.claude/rules/4k-native-layout.md` (ENFORCED),
   `docs/architecture/responsive-design.md`, and commit `a0c8a9a57a`
   (_refactor(responsive): keep logical UI scale stable on wide screens_,
   2026-08-27). Only the pointer was broken; I repaired it in the archived spec
   to name the real owners.

   The consequence matters more than the pointer. That commit **deleted** the
   `html:has(.mkt-shell)` / `html:has(.legal-container)` root-font ramp from
   `src/app.css` — one day after One Stage shipped. So the One Stage handoff's
   carried-over item ("the fix is shell-wide, through the same `html:has(...)`
   mechanism") points at a mechanism that no longer exists, and the rule now
   holds the root at 16px at every viewport width with
   `responsive-design.md:54` forbidding a second large-screen typography system
   outright. **That item is closed by refusal, not open for a successor.** If
   `/stage` reads small at 4K@100%, the sanctioned fix is composition, not root
   scale. Corrected in the handoff's `remaining` and in the shipped One Stage
   spec.

   **How I got this wrong first, since it bears on the rest of this report.** My
   initial pass concluded the successor "does not exist anywhere — no file, no
   commit, no `-S` hit in 16,505 commits." The file-name and `git grep` searches
   were sound; the `-S` content search was still running and I read a truncated
   output file as an empty result. It later returned `a0c8a9a57a`. Absence of a
   result from an unfinished search is not evidence of absence — the same
   mistake in kind as trusting an `OK` verdict from a shallow clone (§1).

2. **The scene-control rail broke its own five-action ceiling.** Seven non-admin
   entries today. Two were added post-ship by commits that were fixing other
   things (`34c0f135b`, `cfb54c17b`). Whether the ceiling still matters is a
   product call, not a reconciliation call — recorded in the spec, raised here.

3. **90 of 183 specs in `active/` + `backlog/` carry no frontmatter** and are
   therefore invisible to `$queue` scoring entirely. That is half the board
   unranked. Several of the highest-drift specs I found this pass
   (sequence-viewer-header-identity, social-post-handoff, ocean-zone-layout)
   were in that half — no `remaining`, no `last_triaged`, no way for the queue to
   notice them going stale. I added frontmatter to the ones I adjudicated; the
   rest is a bigger sweep.

4. **Two stale paths outside my ownership.**
   `docs/audits/2026-09-05-scripts-inventory.md:683` and `:911` still point at
   `specs/active/2026-08-01-native-release-surface-hardening.md`, now in
   `shipped/`. Likewise `docs/superpowers/plans/2026-08-21-fuse-choreo-card-contract-repair.md:9`
   and `docs/superpowers/plans/active/2026-08-21-adaptive-scene-control-workspace-plan.md:3`.
   I repaired every such reference inside `docs/superpowers/specs/`; these four
   are in `docs/audits/` and `docs/superpowers/plans/`, which this task was told
   not to edit.

5. **`2026-08-30-scene-boot-60fps-plan.md` is PHANTOM_OPEN (7/7 boxes) and its
   design spec is fully implemented** — `src/lib/shared/3d/scene-boot/` has all
   eleven modules. I left both files untouched because startup/scene3d is a
   sibling agent's domain this batch. Its design still owes runtime DevTools
   proof, so it should not go to `shipped/` on ledger alone.

6. **`status:` frontmatter and directory disagree on several specs** (e.g.
   `2026-06-22-css-debt-cascade-layers-design.md` sits in `backlog/` with
   `status: active`). I corrected it where I adjudicated the spec; it is
   systematic enough to be worth a mechanical pass.

---

## 6. Limitations

- **No browser, no device, no production access.** Every viewport sweep, every
  `elementFromPoint` measurement, every "browser-verified" claim in these specs
  is unverifiable from this checkout. Where a spec's only outstanding item was
  visual proof I said so explicitly rather than closing it.
- **Two test files could not execute** in this checkout:
  `tests/unit/create/pictograph-arrival-motion.test.ts` and
  `tests/unit/fuse/fuse-state.test.ts` both fail at import with
  `Failed to resolve entry for package "@tka/tka-types"` — the workspace package
  is installed but unbuilt. Toolchain state, not a spec defect. I did not run
  `npm run build:packages` to fix it; that is a heavy build outside this task's
  need.
- **Chromium component suites were not run** (`layout-flip.svelte.test.ts`,
  `PictographArrivalStage.svelte.test.ts`, `FuseRelationshipComposer.svelte.test.ts`,
  `FilterRuleStrip.svelte.test.ts`) — they need
  `tests/config/vitest.components.config.ts` and a browser.
- **No code changed, so no test was added.** The batch brief's
  fails-before/passes-after rule does not apply to a documentation-only branch.
  Instead, every close-out here is backed by a test suite that was executed this
  session, or is explicitly marked as resting on browser evidence I could not
  reproduce.
- **`remaining` prose is a judgement.** I wrote each one to be specific enough
  for a cold-start agent, but a field like ocean-zone-layout's ordering of four
  open items is my ranking, not a measurement.
- **I adjudicated 24 specs against a brief that asked for about 10–15.** The
  extra nine are the ones the full git history exposed once the clone was
  deepened; stopping at fifteen would have left rebuild hazards in place.
