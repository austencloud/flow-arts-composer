# Repo Janitor — Full Cruft Audit (2026-08-16)

Method: parallel audits of `docs/` (2,917 files), `src/routes/test/` (173 dirs),
`scripts/` (1,105 files), static assets (`static/`, `public/`, `assets/`), the
repo top level, plus a full `knip` unused-code scan. Analysis only — nothing was
deleted, moved, or edited. Every claim below is backed by git dates, reference
greps, or config reads from this session.

## Headline numbers

| Metric | Value |
|---|---|
| Local-only (gitignored) disk reclaimable | **~20 GB** (blender backups ~11 GB, static `_raw.glb` intermediates ~5 GB, Tauri `target/` 1.9 GB, Android `build/` 2.5 GB, `tmp/`+`scratchpad/`+friends ~0.55 GB) |
| Git-tracked files that are one-shot artifacts | **~950+** (586 shipped specs, 83 legacy plans, ~52 consumed handoffs, ~192 dead scripts, ~14 dead test pages, 21 empty dirs, 8 stale sketches) |
| Unused source files (knip) | **1,103** (≈1,000 in `src/`), plus 1,921 unused exports, 779 unused exported types |
| Real bugs found in passing | **5** (listed at the bottom) |

---

## A. Definitive garbage (delete-safe, evidence attached)

### A1. Local gitignored residue — zero git risk, pure disk

| Item | Size | Evidence |
|---|---|---|
| `tmp/` | 353 MB, 39k files | Old vite logs, session review dirs, CI logs. All gitignored. |
| `scratchpad/` | 129 MB | contact-lab preview logs ×12, old harnesses. Gitignored. |
| `artifacts/` | 35 MB | Graybox GLBs/reports/logs from museum gate runs. Gitignored. |
| `output/` | 23 MB | One-off ghost-brain export + deck PDF + **a personal Cirque Aflame performance contract PDF** (see bugs). Gitignored. |
| `feedback-images/` | 9 MB | 7 mobile screenshots dated 2026-05-27 — closed feedback evidence. |
| `test-results/`, `seo-reports/`, `firestore-debug.log` | <1 MB | Stale outputs. |
| `scripts/_archive/` | 86 files | Self-quarantined one-shot backfills; only referenced from past-tense shipped specs. |
| `scripts/__pycache__/`, `scripts/.cache/` | 99 files | Build artifacts. |
| `blender/` snapshots | **~11 GB** | Five `ocean_scene.pre-*.blend` (1.7 GB each) + 13 `.blend1` auto-backups. Only 3 blender files are git-tracked; final `ocean_scene.blend`/`ocean_composed.blend` stay. |
| `src-tauri/target/` | 1.9 GB | Rust build cache, regenerates on demand. |
| `android/app/build/` | 2.5 GB | Gradle build output, gitignored, regenerates. |

### A2. Empty directories (21 total)

- 13 empty dirs under `src/routes/test/` with no files and no git history:
  `trail-envelope`, `prop-picker`, `petals-environment-contrast`,
  `petals-3d-integration`, `petal-airflow-proof`, `parity-audit-report`,
  `parity-audit-handoff`, `message-replies`, `message-edit`,
  `mandala-straight-line`, `contextual-auth`, `codex-start-history-motion`,
  `account-setup-proof`
- 3 empty docs dirs: `docs/migration/`, `docs/superpowers/sketches/`,
  `docs/superpowers/specs/instagram-publishing/evidence/gate-1/`
- Untracked, empty at repo root: `bomcheck/`, `rename-probe/`, `visual-tests/`

### A3. Git-tracked one-shot documents

| Item | Count | Evidence |
|---|---|---|
| `docs/superpowers/specs/shipped/` | 586 files, 7.3 MB | Post-hoc design docs for shipped work, Mar–Aug. Only **2** are cited by live rules — `2026-05-30-chip-consolidation-design.md` and `2026-06-30-crossfade-consolidation-design.md` — carve those out (plus `2026-07-05-viewer-shell-anti-drift-design.md` and `2026-07-09-fable-routing-scaffolding-design.md` cited from rules at the specs root). |
| `docs/superpowers/handoffs/` | 53 files | Consumed-once by design; 52 are old, only `2026-08-04-ghost-mind-handoff.md` is recent enough to maybe be pending pickup. |
| `docs/plans/` (top-level) | 83 files | Legacy pre-superpowers planning dir, files dated Feb–Mar; `docs/superpowers/plans/` owns this function now. |
| `docs/images/Screenshots/` | 8 files, 12 MB | Ad-hoc `localhost_5173_*.png` captures from May. |
| `docs/mockups/` | 1 file | Superseded by the sketch workflow. |

### A4. Dead test pages (imports still compile; nothing references them)

One-shot verification pages for closed work, untouched since 2026-05-31 or
earlier in a directory that otherwise iterates in days:
`loop-labeler` (Feb!), `math-foundations`, `rainbow-border-compare`,
`override-migration` (StepData migration CLOSED), `codex-parity` (superseded),
`cell-crossfade` (predates the Crossfade primitive), `card-back-capture`,
`card-back-print` (both superseded by `card-back-parity`), `render-graph`,
`tip-point-playground` (superseded by `prop-3d-studio`), `download-dock`,
`pictograph-cli`.

Plus **`numpad-lab`**: `docs/audits/2026-07-19-assemble-tab-audit.md` states its
imports (`AssembleLabModule`, `ReplayTransport`, `TimingControlsPanel`,
`timing-state`, `timing-interpreter`, `StepStrip`) are dead for the live tab —
this page is the only thing keeping them importable. Deleting page + components
together is the real win.

### A5. Dead scripts

- **`ceremony-*` codemod cluster** — 25 files, all committed May 2026, zero
  references anywhere. One-time class→fn migration tooling. Keep the
  still-referenced siblings: `ceremony-audit.js`, `ceremony-inventory.mjs`,
  `ceremony-manifest.js`, `ceremony-flatten-kebab.cjs`.
- **~167 old unreferenced root scripts** (pre-June, sample-read confirmed
  one-shot): `cdp-*` (3), `extract-tree-*`/`extract-*` (8), `download-*` (5),
  `trace-kit*` (4), `phase5-*` (3), old render experiments
  (`render-pine-trees.cjs`, `render-pictograph.js`, `compare-render-methods.js`),
  `preview-birthday-migration.cjs`, `inspect-glb.js`+`.cjs` duplicate pair,
  `benchmark-*`, `consolidate-releases.js`, strays
  (`scripts/output/loop-explorer-verification-report.md`,
  `scripts/i18n-drafts/zh.new.json`, `scripts/card-designer-screenshot.png`).
- **`scripts/migrations/backups/`** — 152 files, **~110 MB, growing 3+ files
  every day** with no retention policy (daily parity-audit + shortcode-relabel
  snapshots since ~2026-07-10). Old snapshots are delete-safe (gitignored), but
  the real fix is a retain-last-N-days policy in the producing job.

### A6. Stale sketches and tracked binaries

- `static/sketches/`: 8 files >2 months old by name-date (six `2026-05-30-*`,
  one `2026-05-31-*`, `2026-06-14-zap-directions.html`) — throwaway by
  convention.
- `public/` — 9.7 MB **git-tracked**, an abandoned earlier generation of ocean
  fauna GLBs. Zero config references (checked vite/svelte/wrangler/firebase/
  capacitor configs; SvelteKit serves `static/`), zero filename overlap with the
  live `static/models/ocean/`. The only real git-repo-bloat delete in the
  static-asset audit.

---

## B. Needs your judgment

1. **Three Android-shaped shells.** Tauri (`src-tauri/` + 8 deps + 3 npm
   scripts), Capacitor (`android/`, active Aug 13), and `android-twa/` (signed
   `.apk`/`.aab` **committed to git**, last touched July 12). Capacitor is the
   active spec (T6). Is Tauri (desktop?) still a target? Is the TWA superseded?
   Each dead shell drags deps, config, and CI surface.
2. **MCP triplets.** `.mcp.json` wires `mcp-server-pkg/` (live, Aug 16).
   `mcp-server/` (185 MB, last commit Aug 3) may be the NSSM :3333 deploy source
   — confirm before touching. `tka-feedback-mcp/` (272 MB, **untouched since
   Mar 31**) — still registered anywhere?
3. **Museum gate evidence — the single biggest tracked-size lever.** ~1.14 GB
   under `docs/superpowers/specs/` codename dirs, 94% in `moonlit-firefly-forest`
   (942 MB, 467 files). Active project — not garbage — but every rejected/
   superseded gate revision (`-r1-rejected`, `-r2-superseded`) is kept forever.
   Decision needed: prune superseded revisions once a gate passes (a rule the
   `museum-scene-production` skill could own).
4. **knip's ~1,000 unused src files.** Hotspots: `features/create` 125,
   `shared/3d` 114, `features/lab` 84, `features/museum` 69,
   `shared/voice-control` 37 (whole subsystem?), `features/video` 31,
   `features/compose` 29, `features/skel2tka` 27, `features/poi` 20 (Poi Lab is
   planned-not-built — likely intent, not rot). Knip can't see dynamic imports;
   these need scope-by-scope verification (the `ac-deadcode` claim system exists
   for exactly this and has only ever scanned 1 of 172 scopes). Full list:
   knip output preserved in the session scratchpad; re-run with `npx knip`.
5. **`docs/specs/` (top-level, 10 files)** — orphaned from the queue lifecycle.
   4 are a "TKA Village" 3D-avatar-village spec set that appears in no project
   index; others (`god-component-decomposition.md`,
   `firestore-data-access-layer.md`, `enterprise-ceremony-retirement.md`,
   `naming-convention-enforcement.md`) read as standing architecture proposals.
   Yes/no pass needed.
6. **Spec/plan backlogs** — `docs/superpowers/specs/backlog/` (61 files, 28
   May-dated) and `plans/backlog/` (34 files, 2 months stale): still wanted?
7. **Test-route clusters** likely holding superseded duplicates: guide
   (`guide-motion-bake`/`guide-redesign`/`guide-proof`/`guide-reader`), notation
   (6 pages vs a ✅-done project), effects (`effect-tuner` is the sanctioned one;
   `effect-grid`/`effect-thumbs`/`effects-mobile` maybe fold in), parity (4 pages
   that a shipped spec said should consolidate), `profile-redesign` vs
   `profile-stage`, `mandala-mobile`/`mandala-paths`, `disassemble`
   (assemble-lab orphaned per memory), `deck-variation` (marked FORBIDDEN in
   ceremony tooling — protected legacy), `element-stickers`/`elemental-cards`,
   `deck-picker`, `half-arrows`.
8. **`static/models` avatar raws** (~717 MB, mtime Apr 5) vs the July
   `_optimized/` pass — delete raws once the optimized set is confirmed
   complete. The 3.5 GB of `_raw.glb` and 1.4 GB tree-candidate pool have
   Aug 13–14 mtimes — likely mid-pipeline forest work; settle first.
9. **Firestore migrations** (`scripts/migrations/*.ts`, 40 files) — mix of done
   and still-live; the shortcode-relabel job is running daily as of today.
   Needs a done/live pass before any pruning, plus the retention fix (A5).
10. **Research prototypes** — `scripts/combinator-research/` (7),
    `scripts/plantfactory/` (3), `docs/research/interactive-prototypes/` (8).
11. **`docs/superpowers/specs/audits/`** (39 files) — skim for fully-actioned
    ones before archiving.

---

## C. Forgotten value (buried, worth surfacing)

- **`LEGACY.md`** — the digital-estate letter. Alive and excellent; just noting
  it so nobody ever mistakes it for cruft.
- **`docs/adr/001-004`** — four real ADRs cited by nothing, despite the
  standing preference for ADRs. Worth linking from `canonical-capabilities.md`
  or the architecture index.
- **`docs/audits/2026-07-16` and `2026-07-19`** — real audit findings with no
  evidence they were fully actioned (the 07-19 one is what identified the
  `numpad-lab` dead-component chain).
- **The dead-code infrastructure itself** — `knip` is installed and configured
  but apparently never run (1,103 findings waiting); `ac-deadcode` has a
  171-scope backlog. The tools exist; they're just not part of any cadence.
- **`docs/reference/archive/`** (121 files) — already triaged, fine as-is.

---

## D. Bugs found in passing (not cruft — real defects)

1. **`/test/*` ships to production with only a client-side guard.**
   `svelte.config.js`'s Cloudflare `routes.exclude` does not exclude `/test/*`,
   and the guard in `src/routes/test/+layout.ts` is a universal load on an
   `ssr:false` subtree — the `if (!dev) redirect(307, ...)` runs after
   hydration, so raw requests likely get a 200 shell. All 173 test routes are in
   the deployed route set. Verify against prod, then either exclude the subtree
   from the build or move the guard server-side.
2. **Broken asset path:** `ocean-composer-plugin.ts:155` references
   `/models/ocean/kelp_plant.glb`, which exists only in dead `public/` and in
   gitignored `static/models/ocean/.sources/` — not at the served path.
3. **17 skill-cited doc paths point at nothing**, notably `docs/archived-labs/`
   referenced by the `lab` skill. Skill-file rot.
4. **A personal business contract PDF is inside the repo tree**
   (`output/pdf/Cirque-Aflame-Romito-Residence-Performance-Agreement-2026-09-26.pdf`).
   Gitignored, but it doesn't belong in a code checkout at all.
5. **`scripts/ceremony-manifest.json` is a stale snapshot** still referencing
   deleted routes (`test/coven-hub`, `test/museum-cave-3d`) — anything consuming
   it gets wrong answers.

---

## Suggested execution order

1. **Zero-risk local sweep** (~20 GB): A1 + A2 empty dirs + old
   `migrations/backups` snapshots. No git surface at all. (Hold `_raw.glb`/tree
   candidates until forest work settles; hold the two `.pre-*` blender saves if
   any are wanted as restore points.)
2. **Tracked one-shot docs** (A3): archive-or-delete decision on shipped specs +
   handoffs + legacy plans — biggest file-count win, needs one policy call from
   you (delete vs `git rm` into history-only).
3. **Dead test pages + dead scripts** (A4/A5): mechanical, verifiable deletes,
   plus the `numpad-lab` component chain.
4. **Retention fix** for `scripts/migrations/backups/` so the daily job stops
   accumulating forever.
5. **Judgment queue** (B1–B11): a 20-minute pass from Austen answers most of
   them; the answers unlock another ~1 GB tracked and clarify the platform
   story.
6. **knip/ac-deadcode cadence**: burn down the 1,103-file list scope-by-scope
   with the existing claim tooling.

---

## Resolutions (2026-08-16 evening pass)

- **B1 shells**: Tauri is ALIVE (desktop app: live `desktop-build.yml` release CI,
  updater keys, OAuth bridge, imports in `src/lib/shared/desktop/`, last commit
  Aug 6) — keep. `android-twa/` removed (48 files incl. committed apk/aab and the
  old tka-scribe keystore; superseded `com.tkacomposer.app` identity;
  `assetlinks.json` untouched). Capacitor remains the active mobile shell.
- **B2 MCP triplet**: `mcp-server-pkg/` = local stdio server in `.mcp.json`, live.
  `mcp-server/` = deploy source for the NSSM `FlowArtsKnowledgeMCP` service on
  :3333 behind mcp.tkaflowarts.com (claude.ai connector) — KEEP, production.
  `tka-feedback-mcp/` = orphaned (zero local registrations; capability duplicated
  by `/submitfb` → `scripts/submit-feedback.js`) BUT it was deployed as a
  Cloudflare Worker 2026-03-22 and is presumably still live — awaiting ruling on
  deleting the dir + tearing down the Worker.
- **B3 museum evidence**: 941 MB is 99.9% PNGs; the decision record is 18 .md
  files (72 KB) whose verdicts stand alone. 804 MB sits in candidate-only/pilot/
  rejected revisions. Proposal (awaiting ruling): keep all .md + final-revision
  evidence (~137 MB), delete non-final images. Note: working-tree deletion does
  not shrink `.git` (~7.3 GB) without a history rewrite.
- **B4 knip**: NOT bulk-actionable — 12/24 stratified sample were false
  positives. Two causes: dynamic-import blind spot (LabModule/MainApplication
  lazy tabs poison lab/voice-control/voice-sessions buckets, 9 of 12 live Lab
  tabs flagged) and knip missing plain static imports in very large .svelte
  files (museum, shared/3d). Also: the saved knip list truncates 620/1103 paths
  with `…`. Treat as lead list only; per-file verification required.
- **B6 backlogs + A3 specs/handoffs/plans**: ruling = keep everything,
  archive-only policy; nothing deleted.
- **B8 avatar raws**: keep — gitignored (0 tracked), deploy-trimmed, and the
  lossy `_optimized/` pass can't be regenerated upward without them.
- **B7 / B10 / B11** (test-route clusters, research prototypes, audits): queued
  for focused passes before any ruling.
