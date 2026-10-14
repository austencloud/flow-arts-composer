# Local branch disposition report

Date: 2026-10-14. Scope: committed Git history only; no fetch or branch-disposition changes were performed.

Observation: baseline `main` was pinned to `0dddc6bed3d885704db61479fe8ca77184a8baaa` before analysis. Other swarm sessions may advance shared refs after this snapshot. Each branch tip below is pinned separately. Initial `git status --short` was empty; current worker branch was `codex/swarm-branch-report`.

## Summary

Observation: 61 local branches = 44 scoped branches + 17 skipped branches. Verdicts: DELETE-SAFE: 20; SUPERSEDED: 2; SALVAGE: 20; UNKNOWN: 2.

Proposal: consider deleting only DELETE-SAFE refs after confirming no uncommitted work depends on them. Preserve SALVAGE refs for selective porting. SUPERSEDED is an evidence-backed inference about the old implementation, not proof that every research note is dispensable. Retain UNKNOWN refs pending the stated comparison.

## Method and limits

Observation: scope came from `git branch --list` and `git worktree list --porcelain`; machine enumeration used `git for-each-ref --format=%(refname:short) refs/heads`. Exclusions were main, codex/swarm-* and every checked-out branch. No other checkout was read or modified directly.

Commands below used the pinned main SHA for MAIN and the captured branch tip SHA for TIP (the stable equivalents of the requested branch names):

```text
git log -1 --format="%cs %an" TIP
git rev-list --count MAIN..TIP
git log --format="%h %s" -15 MAIN..TIP
git cherry MAIN TIP
git diff --stat MAIN...TIP
git diff --name-only MAIN...TIP
git log --format="%h %cs %s" --since=DATE MAIN -- DIRECTORY...
git log --format="%h %cs %s" --since=DATE MAIN -- FILE...
git log --format= --name-only MAIN..TIP
git merge-tree --write-tree MAIN TIP
git for-each-ref --format="%(refname:short)|%(symref)|%(objectname)|%(committerdate:short)" refs/remotes
```

Observation: unique counts include merge commits; git cherry does not evaluate merge resolutions. A nonempty all-minus cherry result meets the requested DELETE-SAFE rule. An empty cherry result with unique merges is UNKNOWN, not evidence of patch equivalence. Subjects are capped at 15, newest first. Date is committer date (%cs); author is %an.

Observation: diff statistics describe the net branch change from Git's selected merge base, not every historical intermediate edit. Main-directory counts include merges and broad shared directories; exact-file counts are a narrower cross-check. --since=DATE includes same-day work and is date-filtered history, not proof of a later rework. Rename-following is not automatic in these path queries. Zero net diff gives no directory to query; this is stated rather than guessed.

Observation: merge-tree was run for every branch with a cherry +. It creates Git objects but does not update refs, the index, or checked-out files. Exit 0 means conflict-free tree construction, not passing tests, type checks, runtime validity, or approval to merge. Exit 1 means conflicts; conflict lines are capped at eight per branch. No application tests/builds/checks were run.

## Disposition table

| Branch | Last commit (date / author) | Unique | Cherry + / - | Verdict | One-line note |
| --- | --- | ---: | ---: | --- | --- |
| `claude/ota-editor-pin` | 2026-10-13 Austen Cloud | 0 | 0 / 0 | DELETE-SAFE | Observation: zero unique commits; tip is reachable from baseline main. |
| `claude/sad-lewin-cbb116` | 2026-10-14 Austen Cloud | 0 | 0 / 0 | DELETE-SAFE | Observation: zero unique commits; tip is reachable from baseline main. |
| `codex/ark-drawer-prototype` | 2026-09-29 Austen Cloud | 1 | 1 / 0 | SALVAGE | Inference: Ark drawer adapter prototype and integration harness; preserve for selective porting. |
| `codex/browse-show-all-prototype` | 2026-10-07 Austen Cloud | 1 | 1 / 0 | SALVAGE | Inference: Results-first Browse Show all entry; small distinct prototype with a clean tree merge. |
| `codex/capgo-keep-bundles` | 2026-10-08 Austen Cloud | 0 | 0 / 0 | DELETE-SAFE | Observation: zero unique commits; tip is reachable from baseline main. |
| `codex/card-grid-handoff-wip` | 2026-09-07 Austen Cloud | 1 | 1 / 0 | SALVAGE | Inference: Card sizing/layout handoff, inspector reparenting and geometry tracing; unresolved WIP worth reviewing. |
| `codex/complete-german-support` | 2026-09-29 Austen Cloud | 2 | 1 / 0 | SALVAGE | Inference: German interface coverage and guide SSR locale; compare remaining gaps with current German work before porting. |
| `codex/construct-solo-authoring-wip` | 2026-09-07 Austen Cloud | 1 | 1 / 0 | SALVAGE | Inference: Solo authoring contract, proposal harness and sequence adapter; preserve contract before rewriting obsolete integration. |
| `codex/flowgeng-credit-tips` | 2026-10-14 Austen Cloud | 0 | 0 / 0 | DELETE-SAFE | Observation: zero unique commits; tip is reachable from baseline main. |
| `codex/fuse-recipe-stage` | 2026-09-03 Austen Cloud | 2 | 2 / 0 | SUPERSEDED | Inference: Archive explicitly calls this prototype superseded; newer Fuse rule/recipe workspace commits and three content conflicts support replacement. |
| `codex/ghost-dispose-contract` | 2026-10-07 Austen Cloud | 2 | 0 / 1 | DELETE-SAFE | Observation: every cherry patch is already on main; unique SHAs may include merges. |
| `codex/green-museum` | 2026-09-07 Austen Cloud | 1 | 1 / 0 | SUPERSEDED | Inference: Old museum guard re-baseline targets a retired Earth design; 33933bd0d7 deliberately deleted its test and replaced Water stand assumptions. |
| `codex/hand-mandala-card` | 2026-09-14 Austen Cloud | 1 | 1 / 0 | SALVAGE | Inference: Bare-hand mandala path tracing and alignment test; behavioral fix needs reconciliation with newer prop-tip logic. |
| `codex/led-shape-props-wip` | 2026-09-07 Austen Cloud | 1 | 1 / 0 | SALVAGE | Inference: LED shape props, SVG color handling, scene integration and preview assets; preserve WIP and handoff. |
| `codex/left-right-rock-solid` | 2026-09-01 Austen Cloud | 9 | 6 / 0 | SALVAGE | Inference: Left/right scene adapter, generator hardening, guest-share guards and contract tests; mixed changes need selective review. |
| `codex/museum-scene-decomposition` | 2026-08-09 Austen Cloud | 2 | 1 / 1 | SALVAGE | Inference: Museum decomposition patch is already equivalent on main; unique LOOP overlay decomposition still needs comparison and conflict resolution. |
| `codex/option-raf-wip` | 2026-09-07 Austen Cloud | 1 | 1 / 0 | SALVAGE | Inference: PositionGlyph rendering changes; port against renamed PlacementGlyph rather than reviving the old name. |
| `codex/performer-direct-manipulation-2026` | 2026-09-04 Austen Cloud | 2 | 2 / 0 | SALVAGE | Inference: Performer placement/drag precision prototype, geometry and tests; preserve as a porting reference. |
| `codex/performer-paste-diagnostics` | 2026-10-12 Austen Cloud | 1 | 0 / 1 | DELETE-SAFE | Observation: every cherry patch is already on main; unique SHAs may include merges. |
| `codex/picker-transitions-wip` | 2026-09-07 Austen Cloud | 1 | 1 / 0 | SALVAGE | Inference: Fan appearance picker, preview regeneration and prop preview assets; preserve for selective comparison. |
| `codex/portrait-director` | 2026-09-04 Austen Cloud | 1 | 1 / 0 | SALVAGE | Inference: Portrait screen-take director, camera, recorder, state and tests; distinct prototype with a clean tree merge. |
| `codex/post-auto-color-shadows` | 2026-09-29 Austen Cloud | 1 | 0 / 1 | DELETE-SAFE | Observation: every cherry patch is already on main; unique SHAs may include merges. |
| `codex/post-choreo-card-controls` | 2026-09-29 Austen Cloud | 1 | 0 / 1 | DELETE-SAFE | Observation: every cherry patch is already on main; unique SHAs may include merges. |
| `codex/post-crop-workflow` | 2026-09-29 Austen Cloud | 3 | 1 / 1 | SALVAGE | Inference: Live imported-video crop integration remains distinct; current package workspace deleted its old owners, so forward-port behavior. |
| `codex/post-effects-density` | 2026-09-29 Austen Cloud | 2 | 0 / 1 | DELETE-SAFE | Observation: every cherry patch is already on main; unique SHAs may include merges. |
| `codex/post-half-speed-start` | 2026-09-29 Austen Cloud | 2 | 1 / 0 | SALVAGE | Inference: Incoming take / linked animation start synchronization; old compiler and layers were deleted, so inspect the current package for this behavior. |
| `codex/post-inshot-adjustment-reference` | 2026-09-29 Austen Cloud | 1 | 0 / 1 | DELETE-SAFE | Observation: every cherry patch is already on main; unique SHAs may include merges. |
| `codex/post-pip-appearance` | 2026-09-29 Austen Cloud | 2 | 1 / 0 | SALVAGE | Inference: Scoped PiP animation appearance controls remain patch-distinct; reconcile with current TKA plugin and package UI. |
| `codex/post-pip-appearance-followup` | 2026-09-29 Austen Cloud | 1 | 0 / 1 | DELETE-SAFE | Observation: every cherry patch is already on main; unique SHAs may include merges. |
| `codex/post-pip-render-fix` | 2026-09-29 Austen Cloud | 2 | 0 / 2 | DELETE-SAFE | Observation: every cherry patch is already on main; unique SHAs may include merges. |
| `codex/post-pip-theme-hitarea` | 2026-09-29 Austen Cloud | 1 | 0 / 1 | DELETE-SAFE | Observation: every cherry patch is already on main; unique SHAs may include merges. |
| `codex/post-prop-picker-size` | 2026-09-29 Austen Cloud | 2 | 0 / 1 | DELETE-SAFE | Observation: every cherry patch is already on main; unique SHAs may include merges. |
| `codex/post-sequence-durable-save` | 2026-09-29 Austen Cloud | 1 | 0 / 1 | DELETE-SAFE | Observation: every cherry patch is already on main; unique SHAs may include merges. |
| `codex/post-static-card-highlight` | 2026-09-29 Austen Cloud | 1 | 1 / 0 | SALVAGE | Inference: Standalone Choreo Card highlight behavior and regression test; review against current plugin instead of wholesale merge. |
| `codex/post-studio-header` | 2026-09-29 Austen Cloud | 1 | 0 / 1 | DELETE-SAFE | Observation: every cherry patch is already on main; unique SHAs may include merges. |
| `codex/post-studio-rebuild` | 2026-09-25 Austen Cloud | 6 | 1 / 0 | UNKNOWN | Observation/unknown: Ambiguous history: one cherry + (Maps-key fix), six unique SHAs, empty three-dot diff with multiple merge bases; missing merge-resolution/effective-patch comparison. |
| `codex/post-timeline-layout` | 2026-09-29 Austen Cloud | 2 | 0 / 2 | DELETE-SAFE | Observation: every cherry patch is already on main; unique SHAs may include merges. |
| `codex/post-video-auto-adjust` | 2026-09-29 Austen Cloud | 2 | 1 / 1 | SALVAGE | Inference: Auto-color feature patch is already equivalent; unique test scoping edit remains, but targets extracted compiler tests. |
| `codex/post-video-color-controls` | 2026-09-29 Austen Cloud | 2 | 1 / 0 | SALVAGE | Inference: Manual video color controls remain patch-distinct; old owners were extracted into the package/plugin, requiring a forward port. |
| `codex/svelte-compile-gate` | 2026-09-26 Austen Cloud | 2 | 0 / 1 | DELETE-SAFE | Observation: every cherry patch is already on main; unique SHAs may include merges. |
| `codex/sync-main-0924` | 2026-09-25 Austen Cloud | 4 | 0 / 0 | UNKNOWN | Observation/unknown: Four unique merge commits, no cherry lines and empty three-dot diff with multiple merge bases; merge resolutions are not covered by cherry. |
| `codex/sync-main-0925` | 2026-09-25 Austen Cloud | 5 | 0 / 2 | DELETE-SAFE | Observation: every cherry patch is already on main; unique SHAs may include merges. |
| `codex/video-editor` | 2026-10-11 Austen Cloud | 0 | 0 / 0 | DELETE-SAFE | Observation: zero unique commits; tip is reachable from baseline main. |
| `codex/walk-lab-terminal-step` | 2026-08-29 Austen Cloud | 19 | 18 / 1 | SALVAGE | Inference: Terminal footprints/stops, grapevine assets and fail-closed gait diagnostics; preserve research and selective fixes, not a bulk merge. |

## SALVAGE

Proposal: preserve these branches until their distinct changes have been compared or ported. Clean tree merges still require focused verification; conflicted branches require selective reconciliation.

### codex/ark-drawer-prototype

Observation: tip `674f05c8da7de9b552cd36653b8b6f9b550e0df7`; last commit `2026-09-29 Austen Cloud`; unique commits 1; cherry + / - = 1 / 0.

Observation: `git diff --stat MAIN...TIP` summary: `17 files changed, 1623 insertions(+), 652 deletions(-)`.

Observation: top directories by net changed-file count (maximum eight): `src/lib/shared/foundation` (6); `(root)` (2); `src/lib/shared/sequence-viewer` (2); `docs/reports` (1); `src/lib/shared/3d` (1); `src/lib/shared/inbox` (1); `src/lib/shared/settings` (1); `src/lib/shared/share` (1).

Observation: changed paths (first eight of 17): `docs/reports/ark-drawer-prototype-2026-09-29.md`, `package.json`, `pnpm-lock.yaml`, `src/lib/shared/3d/components/Viewer3DCanvas.svelte`, `src/lib/shared/foundation/ui/Drawer.svelte`, `src/lib/shared/foundation/ui/Drawer.svelte.test.ts`, `src/lib/shared/foundation/ui/DrawerPrototype.svelte.test.ts`, `src/lib/shared/foundation/ui/DrawerPrototypeHarness.svelte`.

Observation: main history since `2026-09-29`: 601 commits in touched directories; 54 commits in exact changed-file paths. Directory pathspecs (first eight of 11): `package.json`, `pnpm-lock.yaml`, `docs/reports`, `src/lib/shared/3d`, `src/lib/shared/foundation`, `src/lib/shared/inbox`, `src/lib/shared/sequence-viewer`, `src/lib/shared/settings`.

Observation: directory-history sample (maximum six):

- `6711611f9f 2026-10-14 fix(share): centre the private link state`
- `0833efd742 2026-10-14 fix(share): give the short-tier row footer the specificity it needs`
- `a210437485 2026-10-14 fix(share): one-line hero and row composer on a short box`
- `073b87b8c4 2026-10-14 fix(share): let a short landing scroll and shorten the people row`
- `b50b42a12b 2026-10-14 fix(inbox): share sheet landing icon, shorter people row, fuller hero`
- `859e55921e 2026-10-14 feat(inbox): share collection sheet drills one screen at a time`

Observation: exact-file history sample (maximum six):

- `57cbbafa0c 2026-10-14 feat(props): credit Flow DNA on the buugeng Version 2 look`
- `7a2dd7f990 2026-10-13 chore(deps): install @austencloud/video-editor 0.1.2 from npm`
- `8ec5deb880 2026-10-13 fix(deps): lockfile records the vendored motion tarball as 0.2.1`
- `2b2028fec2 2026-10-13 chore(deps): vendor @austencloud/motion 0.2.1`
- `c96c0bcc2c 2026-10-12 Merge branch 'main' into codex/motion-r5`
- `c051107bec 2026-10-12 Merge branch 'main' into codex/motion-r4`

Observation: unique commit subjects (first 1 of 1):

- `674f05c8da feat: prototype Ark drawer adapter with integration evidence`

Observation: cherry lines (first 15 of 1):

```text
+ 674f05c8da7de9b552cd36653b8b6f9b550e0df7
```

Observation: `git merge-tree --write-tree MAIN TIP` exit 1; result tree `764d6e78d20856b399899ce485a0a6270e459945`; 2 conflict messages.

```text
CONFLICT (content): Merge conflict in pnpm-lock.yaml
CONFLICT (content): Merge conflict in src/lib/shared/foundation/ui/Drawer.svelte
```

Disposition: SALVAGE. Inference: Ark drawer adapter prototype and integration harness; preserve for selective porting.

### codex/browse-show-all-prototype

Observation: tip `87b35b96a29452d0d9df7e29f69d407439ab8b2e`; last commit `2026-10-07 Austen Cloud`; unique commits 1; cherry + / - = 1 / 0.

Observation: `git diff --stat MAIN...TIP` summary: `4 files changed, 23 insertions(+), 1 deletion(-)`.

Observation: top directories by net changed-file count (maximum eight): `src/lib/features/browse` (4).

Observation: changed paths (first eight of 4): `src/lib/features/browse/gallery-home/FilterWorkspace.svelte`, `src/lib/features/browse/gallery-home/GalleryDrill.svelte`, `src/lib/features/browse/gallery-home/GallerySplitPane.svelte`, `src/lib/features/browse/shared/components/BrowseModule.svelte`.

Observation: main history since `2026-10-07`: 13 commits in touched directories; 3 commits in exact changed-file paths. Directory pathspecs (first eight of 1): `src/lib/features/browse`.

Observation: directory-history sample (maximum six):

- `29d63e38b8 2026-10-14 feat(collections): sort chip for My Collections (recent, newest, A–Z)`
- `6b18a848c3 2026-10-13 Merge branch 'main' into codex/library-save-landing`
- `54b8c55c12 2026-10-13 feat(library): land the save toast where the sequence went, and tighten the You rail`
- `fd1f86ac00 2026-10-13 feat(collections): share a public collection by link and show your own in Explore`
- `b26b8b5c9e 2026-10-13 fix(motion): restore the timings the token sweep snapped`
- `6cd4ab6a8f 2026-10-12 feat(motion): align store, Tika, navigation, inbox, browse, and festivals`

Observation: exact-file history sample (maximum six):

- `54b8c55c12 2026-10-13 feat(library): land the save toast where the sequence went, and tighten the You rail`
- `6de7881545 2026-10-12 refactor(motion): the Composer's owners come from @austencloud/motion`
- `a97b743f05 2026-10-10 feat: migrate to SvelteKit 3, Vite 8 and TypeScript 6`

Observation: unique commit subjects (first 1 of 1):

- `87b35b96a2 Prototype results-first Browse Show all entry`

Observation: cherry lines (first 15 of 1):

```text
+ 87b35b96a29452d0d9df7e29f69d407439ab8b2e
```

Observation: `git merge-tree --write-tree MAIN TIP` exit 0; result tree `b8f494cf1072f56fab2eea1b3ab538c80dacd9af`; 0 conflict messages.

Disposition: SALVAGE. Inference: Results-first Browse Show all entry; small distinct prototype with a clean tree merge.

### codex/card-grid-handoff-wip

Observation: tip `c5a088db34647eb54372d1ef80a0d37dc58b3ca0`; last commit `2026-09-07 Austen Cloud`; unique commits 1; cherry + / - = 1 / 0.

Observation: `git diff --stat MAIN...TIP` summary: `10 files changed, 659 insertions(+), 18 deletions(-)`.

Observation: top directories by net changed-file count (maximum eight): `src/lib/shared/sequence-viewer` (4); `src/routes/test` (3); `src/lib/shared/choreo-card` (1); `tests/unit/choreo-card` (1); `tests/unit/sequence-viewer` (1).

Observation: changed paths (first eight of 10): `src/lib/shared/choreo-card/state/choreo-card-sizing-state.svelte.ts`, `src/lib/shared/sequence-viewer/components/ChoreoCard.svelte`, `src/lib/shared/sequence-viewer/components/ViewerCompanionSurface.svelte`, `src/lib/shared/sequence-viewer/components/card-layout-handoff.ts`, `src/lib/shared/sequence-viewer/components/reparent-to-inspector.ts`, `src/routes/test/sequence-viewer-transitions/_components/SequenceViewerTransitionReviewFrame.svelte`, `src/routes/test/sequence-viewer-transitions/_components/TransitionGeometryTrace.svelte`, `src/routes/test/sequence-viewer-transitions/transition-geometry-trace.ts`.

Observation: main history since `2026-09-07`: 537 commits in touched directories; 49 commits in exact changed-file paths. Directory pathspecs (first eight of 5): `src/lib/shared/choreo-card`, `src/lib/shared/sequence-viewer`, `src/routes/test`, `tests/unit/choreo-card`, `tests/unit/sequence-viewer`.

Observation: directory-history sample (maximum six):

- `b26b8b5c9e 2026-10-13 fix(motion): restore the timings the token sweep snapped`
- `f0a1fe1efa 2026-10-12 Merge branch 'main' into codex/motion-r2`
- `7d1dfff785 2026-10-12 feat(motion): move viewer, 3D, video and public surfaces onto the shared clock`
- `d7e0048b86 2026-10-12 Merge branch 'main' into codex/cell-grid-join`
- `36670b70a1 2026-10-12 feat(studio): an arrangement cell can carry its own grid join`
- `6de7881545 2026-10-12 refactor(motion): the Composer's owners come from @austencloud/motion`

Observation: exact-file history sample (maximum six):

- `7d1dfff785 2026-10-12 feat(motion): move viewer, 3D, video and public surfaces onto the shared clock`
- `758b132163 2026-10-10 feat(timing): transforms glide the sequence cards and the player`
- `a97b743f05 2026-10-10 feat: migrate to SvelteKit 3, Vite 8 and TypeScript 6`
- `82ac064dc6 2026-10-08 perf(viewer): stop per-frame rebuilds during playback`
- `fd5ef19911 2026-10-08 feat(post): a card's saved link reaches the Choreo Card's QR`
- `1af5941aab 2026-10-07 Make the grid join a sequence edit with a slide`

Observation: unique commit subjects (first 1 of 1):

- `c5a088db34 wip(sequence-viewer): stranded card layout handoff work`

Observation: cherry lines (first 15 of 1):

```text
+ c5a088db34647eb54372d1ef80a0d37dc58b3ca0
```

Observation: `git merge-tree --write-tree MAIN TIP` exit 1; result tree `ef6df69d3a57b229ef50c066657c3e3e6779e76d`; 5 conflict messages.

```text
CONFLICT (content): Merge conflict in src/lib/shared/choreo-card/state/choreo-card-sizing-state.svelte.ts
CONFLICT (content): Merge conflict in src/lib/shared/sequence-viewer/components/ChoreoCard.svelte
CONFLICT (content): Merge conflict in src/lib/shared/sequence-viewer/components/ViewerCompanionSurface.svelte
CONFLICT (content): Merge conflict in src/lib/shared/sequence-viewer/components/reparent-to-inspector.ts
CONFLICT (content): Merge conflict in src/routes/test/sequence-viewer-transitions/_components/TransitionGeometryTrace.svelte
```

Disposition: SALVAGE. Inference: Card sizing/layout handoff, inspector reparenting and geometry tracing; unresolved WIP worth reviewing.

### codex/complete-german-support

Observation: tip `411146e782a35a1830f7ef3081dc6a716763ff33`; last commit `2026-09-29 Austen Cloud`; unique commits 2; cherry + / - = 1 / 0.

Observation: `git diff --stat MAIN...TIP` summary: `51 files changed, 1382 insertions(+), 255 deletions(-)`.

Observation: top directories by net changed-file count (maximum eight): `src/routes/(public)` (16); `src/lib/shared/feedback` (5); `src/lib/features/create` (4); `src/lib/shared/navigation` (3); `src/lib/shared/shape-matrix` (3); `messages` (2); `src` (2); `src/lib/features/feedback` (2).

Observation: changed paths (first eight of 51): `messages/de.json`, `messages/en.json`, `src/app.d.ts`, `src/hooks.server.ts`, `src/lib/features/admin/services/announcement-manager.ts`, `src/lib/features/browse/shared/services/favorites-manager.ts`, `src/lib/features/create/generate/state/generate-actions.svelte.ts`, `src/lib/features/create/shared/components/CreateModule.svelte`.

Observation: main history since `2026-09-29`: 1565 commits in touched directories; 157 commits in exact changed-file paths. Directory pathspecs (first eight of 20): `messages`, `src`, `src/lib/features/admin`, `src/lib/features/browse`, `src/lib/features/create`, `src/lib/features/creators`, `src/lib/features/feedback`, `src/lib/shared/application`.

Observation: directory-history sample (maximum six):

- `6711611f9f 2026-10-14 fix(share): centre the private link state`
- `083f09b4ca 2026-10-14 Merge branch 'main' into codex/collection-share-drill-5`
- `1708bac942 2026-10-14 Merge branch 'main' into codex/zans-diamond-guide`
- `ee7d2866dc 2026-10-14 Merge branch 'main' into codex/zans-diamond-guide`
- `0833efd742 2026-10-14 fix(share): give the short-tier row footer the specificity it needs`
- `de49ab9e29 2026-10-14 Merge branch 'main' into codex/auth-artifact-split`

Observation: exact-file history sample (maximum six):

- `ee7d2866dc 2026-10-14 Merge branch 'main' into codex/zans-diamond-guide`
- `9f686deea2 2026-10-14 feat(guide): Zan's Diamond page, one hand path and all 24 variations playable`
- `a1614d829e 2026-10-14 Merge branch 'main' into codex/collection-picker-scale`
- `cb1d954c07 2026-10-14 feat(library): collection picker opens on a shelf, not the whole library`
- `073b87b8c4 2026-10-14 fix(share): let a short landing scroll and shorten the people row`
- `b50b42a12b 2026-10-14 fix(inbox): share sheet landing icon, shorter people row, fuller hero`

Observation: unique commit subjects (first 2 of 2):

- `411146e782 Merge main into German support branch`
- `5c13c07450 fix(i18n): complete German interface coverage and guide locale`

Observation: cherry lines (first 15 of 1):

```text
+ 5c13c07450c2901185540ee981af3aabe46bb2f5
```

Observation: `git merge-tree --write-tree MAIN TIP` exit 1; result tree `96e31e0d7c6fc1c052fa8a9417c1a742e633060b`; 27 conflict messages.

```text
CONFLICT (content): Merge conflict in messages/de.json
CONFLICT (content): Merge conflict in messages/en.json
CONFLICT (content): Merge conflict in src/hooks.server.ts
CONFLICT (content): Merge conflict in src/lib/features/admin/services/announcement-manager.ts
CONFLICT (content): Merge conflict in src/lib/features/browse/shared/services/favorites-manager.ts
CONFLICT (content): Merge conflict in src/lib/features/create/generate/state/generate-actions.svelte.ts
CONFLICT (content): Merge conflict in src/lib/features/create/shared/state/operations/sequence-step-operations.ts
CONFLICT (content): Merge conflict in src/lib/features/creators/components/UserProfilePanel.svelte
```

Disposition: SALVAGE. Inference: German interface coverage and guide SSR locale; compare remaining gaps with current German work before porting.

### codex/construct-solo-authoring-wip

Observation: tip `49edfde7393adf80b4e81b09d99348099bd5344b`; last commit `2026-09-07 Austen Cloud`; unique commits 1; cherry + / - = 1 / 0.

Observation: `git diff --stat MAIN...TIP` summary: `12 files changed, 1746 insertions(+), 889 deletions(-)`.

Observation: top directories by net changed-file count (maximum eight): `src/routes/test` (9); `src/lib/shared/create` (1); `src/lib/shared/foundation` (1); `tests/unit` (1).

Observation: changed paths (first eight of 12): `src/lib/shared/create/factories/create-start-position-data.ts`, `src/lib/shared/foundation/services/solo-prop-sequence-adapter.ts`, `src/routes/test/construct-solo-handoff/+layout@.svelte`, `src/routes/test/construct-solo-handoff/+page.svelte`, `src/routes/test/construct-solo-handoff/AUTHORING-CONTRACT.md`, `src/routes/test/construct-solo-handoff/SoloMotionChoices.svelte`, `src/routes/test/construct-solo-handoff/SoloPathPreview.svelte`, `src/routes/test/construct-solo-handoff/SoloStartChoices.svelte`.

Observation: main history since `2026-09-07`: 1887 commits in touched directories; 3 commits in exact changed-file paths. Directory pathspecs (first eight of 4): `src/lib/shared/create`, `src/lib/shared/foundation`, `src/routes/test`, `tests/unit`.

Observation: directory-history sample (maximum six):

- `a1614d829e 2026-10-14 Merge branch 'main' into codex/collection-picker-scale`
- `cb1d954c07 2026-10-14 feat(library): collection picker opens on a shelf, not the whole library`
- `b4ff2af586 2026-10-14 Merge branch 'main' into codex/eight-step-archive`
- `049b8c1780 2026-10-14 fix(learn): show topics on entry and restore live stars`
- `02f6ee82b4 2026-10-14 feat(history): add Gage DeMello's Eight Step to the archive`
- `4afa51c3a1 2026-10-14 Merge branch 'main' into codex/boot-bar-self-timing`

Observation: exact-file history sample (maximum six):

- `a97b743f05 2026-10-10 feat: migrate to SvelteKit 3, Vite 8 and TypeScript 6`
- `aaa3c76d07 2026-09-27 fix(test-routes): keep every /test harness under the production guard`
- `48050b5010 2026-09-15 refactor(domain): rename the two-hand "position" concept to "placement"`

Observation: unique commit subjects (first 1 of 1):

- `49edfde739 wip(create): stranded solo authoring contract and components`

Observation: cherry lines (first 15 of 1):

```text
+ 49edfde7393adf80b4e81b09d99348099bd5344b
```

Observation: `git merge-tree --write-tree MAIN TIP` exit 1; result tree `1e16e416ece93393319dd2c6944b0d2a2ad76671`; 4 conflict messages.

```text
CONFLICT (modify/delete): src/lib/shared/create/factories/create-start-position-data.ts deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in 49edfde7393adf80b4e81b09d99348099bd5344b.  Version 49edfde7393adf80b4e81b09d99348099bd5344b of src/lib/shared/create/factories/create-start-position-data.ts left in tree.
CONFLICT (content): Merge conflict in src/lib/shared/foundation/services/solo-prop-sequence-adapter.ts
CONFLICT (content): Merge conflict in src/routes/test/construct-solo-handoff/construct-solo-proposal.ts
CONFLICT (content): Merge conflict in src/routes/test/construct-solo-handoff/proposal/+page.svelte
```

Disposition: SALVAGE. Inference: Solo authoring contract, proposal harness and sequence adapter; preserve contract before rewriting obsolete integration.

### codex/hand-mandala-card

Observation: tip `855e615cb41e850f15e6c21629355ca043de4a51`; last commit `2026-09-14 Austen Cloud`; unique commits 1; cherry + / - = 1 / 0.

Observation: `git diff --stat MAIN...TIP` summary: `2 files changed, 238 insertions(+), 211 deletions(-)`.

Observation: top directories by net changed-file count (maximum eight): `src/lib/shared/mandala` (1); `tests/unit` (1).

Observation: changed paths (first eight of 2): `src/lib/shared/mandala/services/mandala-path-preparer.ts`, `tests/unit/mandala-overlay-prop-alignment.test.ts`.

Observation: main history since `2026-09-14`: 1403 commits in touched directories; 3 commits in exact changed-file paths. Directory pathspecs (first eight of 2): `src/lib/shared/mandala`, `tests/unit`.

Observation: directory-history sample (maximum six):

- `a1614d829e 2026-10-14 Merge branch 'main' into codex/collection-picker-scale`
- `cb1d954c07 2026-10-14 feat(library): collection picker opens on a shelf, not the whole library`
- `b4ff2af586 2026-10-14 Merge branch 'main' into codex/eight-step-archive`
- `049b8c1780 2026-10-14 fix(learn): show topics on entry and restore live stars`
- `02f6ee82b4 2026-10-14 feat(history): add Gage DeMello's Eight Step to the archive`
- `4afa51c3a1 2026-10-14 Merge branch 'main' into codex/boot-bar-self-timing`

Observation: exact-file history sample (maximum six):

- `a97b743f05 2026-10-10 feat: migrate to SvelteKit 3, Vite 8 and TypeScript 6`
- `d499b7c41a 2026-09-22 Tip points follow the drawn artwork for triad models and fan builds`
- `c4a5a03e9c 2026-09-17 fix(effects): mirror tip points for chirality-B buugeng-family props`

Observation: unique commit subjects (first 1 of 1):

- `855e615cb4 fix: trace bare hands in mandalas`

Observation: cherry lines (first 15 of 1):

```text
+ 855e615cb41e850f15e6c21629355ca043de4a51
```

Observation: `git merge-tree --write-tree MAIN TIP` exit 1; result tree `7c35ec6fe970f256b7f533c0225f84e5e98e69ac`; 2 conflict messages.

```text
CONFLICT (content): Merge conflict in src/lib/shared/mandala/services/mandala-path-preparer.ts
CONFLICT (content): Merge conflict in tests/unit/mandala-overlay-prop-alignment.test.ts
```

Disposition: SALVAGE. Inference: Bare-hand mandala path tracing and alignment test; behavioral fix needs reconciliation with newer prop-tip logic.

### codex/led-shape-props-wip

Observation: tip `f88f37f4041201b49ccc3beeadca10255dc1ffc2`; last commit `2026-09-07 Austen Cloud`; unique commits 1; cherry + / - = 1 / 0.

Observation: `git diff --stat MAIN...TIP` summary: `48 files changed, 2449 insertions(+), 326 deletions(-)`.

Observation: top directories by net changed-file count (maximum eight): `static/images/props` (10); `src/lib/shared/3d` (9); `src/lib/shared/pictograph` (5); `scripts` (4); `src/lib/shared/navigation` (2); `src/lib/shared/settings` (2); `src/routes/test` (2); `static/models/props` (2).

Observation: changed paths (first eight of 48): `docs/superpowers/specs/2026-09-04-led-shape-props-handoff.md`, `packages/render-core/src/svg-color.ts`, `packages/render-core/tests/svg-color.test.ts`, `patches/@austencloud__scene-3d@0.1.6.patch`, `pnpm-lock.yaml`, `scripts/build-fan-model.py`, `scripts/build-led-shape-models.py`, `scripts/verify-fan-glb.cjs`.

Observation: main history since `2026-09-07`: 1747 commits in touched directories; 194 commits in exact changed-file paths. Directory pathspecs (first eight of 19): `pnpm-lock.yaml`, `docs/superpowers/specs`, `packages/render-core/src`, `packages/render-core/tests`, `patches`, `scripts`, `src/lib/shared/3d`, `src/lib/shared/animation-engine`.

Observation: directory-history sample (maximum six):

- `ee7d2866dc 2026-10-14 Merge branch 'main' into codex/zans-diamond-guide`
- `9f686deea2 2026-10-14 feat(guide): Zan's Diamond page, one hand path and all 24 variations playable`
- `02f6ee82b4 2026-10-14 feat(history): add Gage DeMello's Eight Step to the archive`
- `bca00a3f23 2026-10-14 Merge branch 'main' into codex/three-levels-guide-spec`
- `e80970ec7f 2026-10-14 docs(spec): three ways to name a pattern guide page design`
- `ee9afcc474 2026-10-14 Merge branch 'main' into codex/boot-bar-self-timing`

Observation: exact-file history sample (maximum six):

- `7a2dd7f990 2026-10-13 chore(deps): install @austencloud/video-editor 0.1.2 from npm`
- `8ec5deb880 2026-10-13 fix(deps): lockfile records the vendored motion tarball as 0.2.1`
- `2b2028fec2 2026-10-13 chore(deps): vendor @austencloud/motion 0.2.1`
- `89f4232788 2026-10-12 Merge branch 'main' into codex/motion-package`
- `a3ed6b9f98 2026-10-12 build(deps): @austencloud/motion 0.2.0, vendored, with the Composer's named route morphs`
- `6de7881545 2026-10-12 refactor(motion): the Composer's owners come from @austencloud/motion`

Observation: unique commit subjects (first 1 of 1):

- `f88f37f404 wip(3d): stranded LED shape prop pipeline work`

Observation: cherry lines (first 15 of 1):

```text
+ f88f37f4041201b49ccc3beeadca10255dc1ffc2
```

Observation: `git merge-tree --write-tree MAIN TIP` exit 1; result tree `04d46de4065a56ef6b1e319de8f3df577ca144db`; 16 conflict messages.

```text
CONFLICT (content): Merge conflict in packages/render-core/src/svg-color.ts
CONFLICT (content): Merge conflict in patches/@austencloud__scene-3d@0.1.6.patch
CONFLICT (content): Merge conflict in pnpm-lock.yaml
CONFLICT (content): Merge conflict in src/lib/shared/3d/domain/scene-prop-catalog.test.ts
CONFLICT (content): Merge conflict in src/lib/shared/3d/effects/prop-build-tip-geometry-3d.ts
CONFLICT (content): Merge conflict in src/lib/shared/pictograph/prop/domain/fan-appearance.ts
CONFLICT (content): Merge conflict in src/lib/shared/pictograph/prop/domain/prop-type-display-registry.ts
CONFLICT (content): Merge conflict in src/lib/shared/render/core/constants/prop-classification.ts
```

Disposition: SALVAGE. Inference: LED shape props, SVG color handling, scene integration and preview assets; preserve WIP and handoff.

### codex/left-right-rock-solid

Observation: tip `5ae8d33578a9b9b54a981d6e69219e5011da7457`; last commit `2026-09-01 Austen Cloud`; unique commits 9; cherry + / - = 6 / 0.

Observation: `git diff --stat MAIN...TIP` summary: `57 files changed, 1395 insertions(+), 636 deletions(-)`.

Observation: top directories by net changed-file count (maximum eight): `src/lib/features/create` (41); `src/lib/shared/3d` (7); `tests/unit` (3); `docs/superpowers/specs` (1); `src/lib/shared/settings` (1); `tests/unit/3d-animation` (1); `tests/unit/3d` (1); `tests/unit/features` (1).

Observation: changed paths (first eight of 57): `docs/superpowers/specs/2026-09-01-left-right-rock-solid-handoff.md`, `src/lib/features/create/generate/circular/get-loop-executors.ts`, `src/lib/features/create/generate/components/CardBasedSettingsContainer.svelte`, `src/lib/features/create/generate/components/GenerateEmptyState.svelte`, `src/lib/features/create/generate/components/GeneratePanel.svelte`, `src/lib/features/create/generate/components/StyleExpandPanel.svelte`, `src/lib/features/create/generate/components/cards/BaseCard.svelte`, `src/lib/features/create/generate/components/cards/ConsolidatedLOOPCard.svelte`.

Observation: main history since `2026-09-01`: 3139 commits in touched directories; 166 commits in exact changed-file paths. Directory pathspecs (first eight of 9): `docs/superpowers/specs`, `src/lib/features/create`, `src/lib/shared/3d`, `src/lib/shared/settings`, `tests/unit`, `tests/unit/3d`, `tests/unit/3d-animation`, `tests/unit/features`.

Observation: directory-history sample (maximum six):

- `de49ab9e29 2026-10-14 Merge branch 'main' into codex/auth-artifact-split`
- `f40b379a87 2026-10-14 feat(auth): sign-in sheet splits into live art and a theme-colored column`
- `a1614d829e 2026-10-14 Merge branch 'main' into codex/collection-picker-scale`
- `cb1d954c07 2026-10-14 feat(library): collection picker opens on a shelf, not the whole library`
- `b4ff2af586 2026-10-14 Merge branch 'main' into codex/eight-step-archive`
- `049b8c1780 2026-10-14 fix(learn): show topics on entry and restore live stars`

Observation: exact-file history sample (maximum six):

- `02681791b3 2026-10-12 Merge branch 'main' into codex/customize-tiles`
- `de7a7a15e2 2026-10-12 Customize overview: real pictographs and real Style controls in the tiles`
- `43beba76ab 2026-10-12 Merge branch 'main' into codex/motion-route-port`
- `ecd5347998 2026-10-12 Merge branch 'main' into codex/motion-r1`
- `9596544bac 2026-10-12 Merge branch 'main' into codex/motion-route-port`
- `45390a6492 2026-10-12 feat(motion): create surfaces move on the shared motion clock`

Observation: unique commit subjects (first 9 of 9):

- `5ae8d33578 Merge branch 'main' into codex/left-right-rock-solid`
- `034f9e0629 Merge branch 'main' into codex/left-right-rock-solid`
- `5023fc093d fix: reconcile left/right adapter with main's share and plane contracts`
- `927f659a1c Merge branch 'main' into codex/left-right-rock-solid`
- `6bc7fc1e8b test: realign stale repository contracts with landed decisions`
- `6a9c74e2e8 fix(workspace,prop-studio): guard guest share and keep prop previews neutral`
- `0903cb11c7 refactor(3d): contain scene-3d blue/red prop API behind a left/right adapter`
- `c81ba907dc refactor(generate): explicit types, pure loop viability, canonical motion`
- `c97a389f63 docs(handoff): capture left-right hardening state`

Observation: cherry lines (first 15 of 6):

```text
+ c97a389f631da0d39c77f29b49fa71d4e2971975
+ c81ba907dcbd0ca432cc41961337ffc1db5a3187
+ 0903cb11c7d79bc6856d21be039cf1451ca324f9
+ 6a9c74e2e8ce6f98579831f828b239f6fccddcaa
+ 6bc7fc1e8b7dacfcc9b1712870a0a50b8704ad7b
+ 5023fc093d2cb4e6da1e83ee3383ff09954f09f6
```

Observation: `git merge-tree --write-tree MAIN TIP` exit 1; result tree `ed1ca36fbec8c4f0b9db09610f230245ecbada84`; 39 conflict messages.

```text
CONFLICT (modify/delete): src/lib/features/create/generate/circular/get-loop-executors.ts deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in 5ae8d33578a9b9b54a981d6e69219e5011da7457.  Version 5ae8d33578a9b9b54a981d6e69219e5011da7457 of src/lib/features/create/generate/circular/get-loop-executors.ts left in tree.
CONFLICT (content): Merge conflict in src/lib/features/create/generate/components/CardBasedSettingsContainer.svelte
CONFLICT (content): Merge conflict in src/lib/features/create/generate/components/GeneratePanel.svelte
CONFLICT (modify/delete): src/lib/features/create/generate/components/StyleExpandPanel.svelte deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in 5ae8d33578a9b9b54a981d6e69219e5011da7457.  Version 5ae8d33578a9b9b54a981d6e69219e5011da7457 of src/lib/features/create/generate/components/StyleExpandPanel.svelte left in tree.
CONFLICT (content): Merge conflict in src/lib/features/create/generate/components/cards/BaseCard.svelte
CONFLICT (content): Merge conflict in src/lib/features/create/generate/components/cards/ConsolidatedLOOPCard.svelte
CONFLICT (content): Merge conflict in src/lib/features/create/generate/components/cards/CustomizeCard.svelte
CONFLICT (content): Merge conflict in src/lib/features/create/generate/components/cards/CustomizeExpandedOverlay.svelte
```

Disposition: SALVAGE. Inference: Left/right scene adapter, generator hardening, guest-share guards and contract tests; mixed changes need selective review.

### codex/museum-scene-decomposition

Observation: tip `c08da4c9275b865c1af34346a81ae63b45f69f6f`; last commit `2026-08-09 Austen Cloud`; unique commits 2; cherry + / - = 1 / 1.

Observation: `git diff --stat MAIN...TIP` summary: `27 files changed, 3637 insertions(+), 2770 deletions(-)`.

Observation: top directories by net changed-file count (maximum eight): `src/lib/features/museum` (13); `src/lib/features/create` (6); `tests/unit/museum` (5); `docs/superpowers/specs` (2); `tests/unit/create` (1).

Observation: changed paths (first eight of 27): `docs/superpowers/specs/shipped/2026-08-09-loop-expanded-overlay-decomposition.md`, `docs/superpowers/specs/shipped/2026-08-09-museum-scene-decomposition.md`, `src/lib/features/create/generate/components/cards/LOOPExpandedOverlay.svelte`, `src/lib/features/create/generate/components/cards/LoopDetailPanel.svelte`, `src/lib/features/create/generate/components/cards/LoopOverlayHeader.svelte`, `src/lib/features/create/generate/components/cards/LoopRhythmConfigurator.svelte`, `src/lib/features/create/generate/components/cards/LoopSelectionSummary.svelte`, `src/lib/features/create/generate/components/cards/loop-expanded-overlay-model.ts`.

Observation: main history since `2026-08-09`: 1508 commits in touched directories; 30 commits in exact changed-file paths. Directory pathspecs (first eight of 5): `docs/superpowers/specs`, `src/lib/features/create`, `src/lib/features/museum`, `tests/unit/create`, `tests/unit/museum`.

Observation: directory-history sample (maximum six):

- `f40b379a87 2026-10-14 feat(auth): sign-in sheet splits into live art and a theme-colored column`
- `02f6ee82b4 2026-10-14 feat(history): add Gage DeMello's Eight Step to the archive`
- `bca00a3f23 2026-10-14 Merge branch 'main' into codex/three-levels-guide-spec`
- `04c8ce42df 2026-10-14 Merge branch 'main' into codex/three-levels-guide-spec`
- `e80970ec7f 2026-10-14 docs(spec): three ways to name a pattern guide page design`
- `9a3a4f0535 2026-10-14 Merge branch 'main' into codex/boot-bar-self-timing`

Observation: exact-file history sample (maximum six):

- `45390a6492 2026-10-12 feat(motion): create surfaces move on the shared motion clock`
- `a97b743f05 2026-10-10 feat: migrate to SvelteKit 3, Vite 8 and TypeScript 6`
- `5267da1bcc 2026-10-07 fix(create): compact LOOP picker layout`
- `bf31ba8e43 2026-10-06 Compact LOOP selection controls`
- `4b0f0e8ce0 2026-10-06 Refine generator choice panel layouts`
- `09622f6cb2 2026-09-27 fix(i18n): complete German visitor flows and audit translation contracts`

Observation: unique commit subjects (first 2 of 2):

- `c08da4c927 refactor(create): decompose LOOP expanded overlay`
- `8d9c4cd9a4 refactor(museum): decompose 3D scene runtime`

Observation: cherry lines (first 15 of 2):

```text
+ 8d9c4cd9a4bb9e4b87fbde4c80b02e3957319233
- c08da4c9275b865c1af34346a81ae63b45f69f6f
```

Observation: `git merge-tree --write-tree MAIN TIP` exit 1; result tree `dc9347ff1036dd120785f736614cfacbf5cf2f23`; 9 conflict messages.

```text
CONFLICT (content): Merge conflict in src/lib/features/create/generate/components/cards/LOOPExpandedOverlay.svelte
CONFLICT (add/add): Merge conflict in src/lib/features/create/generate/components/cards/LoopDetailPanel.svelte
CONFLICT (add/add): Merge conflict in src/lib/features/create/generate/components/cards/LoopOverlayHeader.svelte
CONFLICT (add/add): Merge conflict in src/lib/features/create/generate/components/cards/LoopRhythmConfigurator.svelte
CONFLICT (add/add): Merge conflict in src/lib/features/create/generate/components/cards/LoopSelectionSummary.svelte
CONFLICT (add/add): Merge conflict in src/lib/features/create/generate/components/cards/loop-expanded-overlay-model.ts
CONFLICT (content): Merge conflict in src/lib/features/museum/components/game/Museum3DScene.svelte
CONFLICT (modify/delete): src/lib/features/museum/services/museum-proximity-renderer.ts deleted in c08da4c9275b865c1af34346a81ae63b45f69f6f and modified in 0dddc6bed3d885704db61479fe8ca77184a8baaa.  Version 0dddc6bed3d885704db61479fe8ca77184a8baaa of src/lib/features/museum/services/museum-proximity-renderer.ts left in tree.
```

Disposition: SALVAGE. Inference: Museum decomposition patch is already equivalent on main; unique LOOP overlay decomposition still needs comparison and conflict resolution.

### codex/option-raf-wip

Observation: tip `36a6f53cd5054ebd656a12f7599078a6eb9ba968`; last commit `2026-09-07 Austen Cloud`; unique commits 1; cherry + / - = 1 / 0.

Observation: `git diff --stat MAIN...TIP` summary: `1 file changed, 47 insertions(+), 33 deletions(-)`.

Observation: top directories by net changed-file count (maximum eight): `src/lib/shared/pictograph` (1).

Observation: changed paths (first eight of 1): `src/lib/shared/pictograph/shared/components/PositionGlyph.svelte`.

Observation: main history since `2026-09-07`: 188 commits in touched directories; 1 commits in exact changed-file paths. Directory pathspecs (first eight of 1): `src/lib/shared/pictograph`.

Observation: directory-history sample (maximum six):

- `000f386760 2026-10-14 fix(buugeng): author the GLB long axis as the tip-to-tip chord`
- `57cbbafa0c 2026-10-14 feat(props): credit Flow DNA on the buugeng Version 2 look`
- `bb84dce6cb 2026-10-13 Recompose the Save to Library panel for wide screens`
- `0c64449e53 2026-10-13 Merge branch 'main' into codex/start-placement-morph`
- `e6133c497b 2026-10-13 feat(construct): the chosen start placement flies into the workspace`
- `b26b8b5c9e 2026-10-13 fix(motion): restore the timings the token sweep snapped`

Observation: exact-file history sample (maximum six):

- `48050b5010 2026-09-15 refactor(domain): rename the two-hand "position" concept to "placement"`

Observation: unique commit subjects (first 1 of 1):

- `36a6f53cd5 wip(pictograph): stranded PositionGlyph work from the option-raf worktree`

Observation: cherry lines (first 15 of 1):

```text
+ 36a6f53cd5054ebd656a12f7599078a6eb9ba968
```

Observation: `git merge-tree --write-tree MAIN TIP` exit 1; result tree `37c94fdfcba1c93a0a30e9f19ed4a3529545a69a`; 1 conflict messages.

```text
CONFLICT (content): Merge conflict in src/lib/shared/pictograph/shared/components/PlacementGlyph.svelte
```

Disposition: SALVAGE. Inference: PositionGlyph rendering changes; port against renamed PlacementGlyph rather than reviving the old name.

### codex/performer-direct-manipulation-2026

Observation: tip `d8399727883e6f8a747c0d905f9f66e18b87bbf0`; last commit `2026-09-04 Austen Cloud`; unique commits 2; cherry + / - = 2 / 0.

Observation: `git diff --stat MAIN...TIP` summary: `14 files changed, 1553 insertions(+), 326 deletions(-)`.

Observation: top directories by net changed-file count (maximum eight): `src/lib/shared/3d` (10); `docs/superpowers/specs` (2); `tests/unit/3d-viewer` (1); `tests/unit/3d` (1).

Observation: changed paths (first eight of 14): `docs/superpowers/specs/2026-09-01-performer-direct-manipulation-precision-design.md`, `docs/superpowers/specs/2026-09-01-performer-direct-manipulation-precision-handoff.md`, `src/lib/shared/3d/components/PerformerBadge3D.svelte`, `src/lib/shared/3d/components/Viewer3DScene.svelte`, `src/lib/shared/3d/components/controls/PerformerSpine.svelte`, `src/lib/shared/3d/components/controls/SceneControlWorkspace.svelte`, `src/lib/shared/3d/components/performer-interaction/PerformerDragGuide.svelte`, `src/lib/shared/3d/components/performer-interaction/PerformerHoverRing.svelte`.

Observation: main history since `2026-09-04`: 616 commits in touched directories; 33 commits in exact changed-file paths. Directory pathspecs (first eight of 4): `docs/superpowers/specs`, `src/lib/shared/3d`, `tests/unit/3d`, `tests/unit/3d-viewer`.

Observation: directory-history sample (maximum six):

- `02f6ee82b4 2026-10-14 feat(history): add Gage DeMello's Eight Step to the archive`
- `bca00a3f23 2026-10-14 Merge branch 'main' into codex/three-levels-guide-spec`
- `e80970ec7f 2026-10-14 docs(spec): three ways to name a pattern guide page design`
- `ee9afcc474 2026-10-14 Merge branch 'main' into codex/boot-bar-self-timing`
- `6a5331f4db 2026-10-14 docs(boot): format the boot bar spec for prettier`
- `7e3cdafaeb 2026-10-14 feat(boot): time the boot bar from the last boot's milestones`

Observation: exact-file history sample (maximum six):

- `f0a1fe1efa 2026-10-12 Merge branch 'main' into codex/motion-r2`
- `7d1dfff785 2026-10-12 feat(motion): move viewer, 3D, video and public surfaces onto the shared clock`
- `6e109f6d1e 2026-10-12 Keep keyboard focus on stage during performer placement`
- `dfe4d3cafa 2026-10-12 Simplify performer movement controls`
- `0095974000 2026-10-12 feat(3d): replace movement pill with compact grip and floor placement`
- `e374ed1914 2026-10-12 fix(3d): preserve garden and rendering through performer paste undo`

Observation: unique commit subjects (first 2 of 2):

- `d839972788 chore(archive): preserve performer placement prototype`
- `9b34b93c73 docs: hand off performer drag precision pass`

Observation: cherry lines (first 15 of 2):

```text
+ 9b34b93c73e143011b66bc314f4bc23077217fc9
+ d8399727883e6f8a747c0d905f9f66e18b87bbf0
```

Observation: `git merge-tree --write-tree MAIN TIP` exit 1; result tree `0b7d6576e332362c1e74f0f45d9a64314cf70f88`; 5 conflict messages.

```text
CONFLICT (content): Merge conflict in src/lib/shared/3d/components/Viewer3DScene.svelte
CONFLICT (content): Merge conflict in src/lib/shared/3d/components/controls/PerformerSpine.svelte
CONFLICT (content): Merge conflict in src/lib/shared/3d/components/performer-interaction/performer-pointer-interaction.svelte.ts
CONFLICT (content): Merge conflict in src/lib/shared/3d/state/viewer-3d-state.svelte.ts
CONFLICT (content): Merge conflict in tests/unit/3d/performer-pointer-interaction.test.ts
```

Disposition: SALVAGE. Inference: Performer placement/drag precision prototype, geometry and tests; preserve as a porting reference.

### codex/picker-transitions-wip

Observation: tip `e2efb215fd6f953fe1a6c64fc5fe526097434b40`; last commit `2026-09-07 Austen Cloud`; unique commits 1; cherry + / - = 1 / 0.

Observation: `git diff --stat MAIN...TIP` summary: `19 files changed, 274 insertions(+), 49 deletions(-)`.

Observation: top directories by net changed-file count (maximum eight): `static/images/props` (12); `src/lib/shared/pictograph` (3); `src/lib/shared/3d` (2); `src/lib/shared/settings` (2).

Observation: changed paths (first eight of 19): `src/lib/shared/3d/components/controls/PropBuildPicker.svelte`, `src/lib/shared/3d/domain/scene-prop-previews.test.ts`, `src/lib/shared/pictograph/prop/components/FanAppearancePicker.svelte`, `src/lib/shared/pictograph/prop/components/PropSvg.svelte`, `src/lib/shared/pictograph/prop/domain/fan-appearance.ts`, `src/lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte`, `src/lib/shared/settings/components/tabs/prop-type/FanStyleOptions.svelte`, `static/images/props/build-previews/fan-day-black-bare-complete.provenance.json`.

Observation: main history since `2026-09-07`: 541 commits in touched directories; 41 commits in exact changed-file paths. Directory pathspecs (first eight of 4): `src/lib/shared/3d`, `src/lib/shared/pictograph`, `src/lib/shared/settings`, `static/images/props`.

Observation: directory-history sample (maximum six):

- `000f386760 2026-10-14 fix(buugeng): author the GLB long axis as the tip-to-tip chord`
- `57cbbafa0c 2026-10-14 feat(props): credit Flow DNA on the buugeng Version 2 look`
- `bb84dce6cb 2026-10-13 Recompose the Save to Library panel for wide screens`
- `1e7a61b5ba 2026-10-13 Merge branch 'main' into codex/start-placement-morph`
- `ac75741aa9 2026-10-13 fix(assemble): touch rings take their contrast from the background`
- `0c64449e53 2026-10-13 Merge branch 'main' into codex/start-placement-morph`

Observation: exact-file history sample (maximum six):

- `7d1dfff785 2026-10-12 feat(motion): move viewer, 3D, video and public surfaces onto the shared clock`
- `6de7881545 2026-10-12 refactor(motion): the Composer's owners come from @austencloud/motion`
- `74eff7a000 2026-10-10 fix(pictograph): stop props spinning a full turn when motion playback ends`
- `a97b743f05 2026-10-10 feat: migrate to SvelteKit 3, Vite 8 and TypeScript 6`
- `8d883cfe97 2026-10-06 feat(prop-picker): name prop versions V1 and V2`
- `364ae19f04 2026-10-06 feat(prop-picker): fold Energy Staff into Double Staff and Energy Saber into Sword`

Observation: unique commit subjects (first 1 of 1):

- `e2efb215fd wip(props): stranded fan appearance picker and preview regeneration`

Observation: cherry lines (first 15 of 1):

```text
+ e2efb215fd6f953fe1a6c64fc5fe526097434b40
```

Observation: `git merge-tree --write-tree MAIN TIP` exit 1; result tree `86f80504c0ad21ab0bc0218fdfa7bd90e5106b89`; 4 conflict messages.

```text
CONFLICT (content): Merge conflict in src/lib/shared/pictograph/prop/components/FanAppearancePicker.svelte
CONFLICT (content): Merge conflict in src/lib/shared/pictograph/prop/components/PropSvg.svelte
CONFLICT (content): Merge conflict in src/lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte
CONFLICT (content): Merge conflict in src/lib/shared/settings/components/tabs/prop-type/FanStyleOptions.svelte
```

Disposition: SALVAGE. Inference: Fan appearance picker, preview regeneration and prop preview assets; preserve for selective comparison.

### codex/portrait-director

Observation: tip `9fbaa6396d00d20cd11dbec4bf7d7ae2e58cb5ad`; last commit `2026-09-04 Austen Cloud`; unique commits 1; cherry + / - = 1 / 0.

Observation: `git diff --stat MAIN...TIP` summary: `14 files changed, 2909 insertions(+)`.

Observation: top directories by net changed-file count (maximum eight): `src/lib/features/promo-generator` (10); `tests/unit/promo-generator` (2); `docs/superpowers/specs` (1); `src/routes/demo` (1).

Observation: changed paths (first eight of 14): `docs/superpowers/specs/2026-08-28-portrait-promo-director-design.md`, `src/lib/features/promo-generator/PortraitDirectorModule.svelte`, `src/lib/features/promo-generator/components/PortraitDirectorRail.svelte`, `src/lib/features/promo-generator/components/PortraitDirectorWorkbench.svelte`, `src/lib/features/promo-generator/context/portrait-director-context.ts`, `src/lib/features/promo-generator/domain/portrait-camera.ts`, `src/lib/features/promo-generator/domain/portrait-recording-error.ts`, `src/lib/features/promo-generator/get-portrait-take-recorder.ts`.

Observation: main history since `2026-09-04`: 326 commits in touched directories; 0 commits in exact changed-file paths. Directory pathspecs (first eight of 4): `docs/superpowers/specs`, `src/lib/features/promo-generator`, `src/routes/demo`, `tests/unit/promo-generator`.

Observation: directory-history sample (maximum six):

- `02f6ee82b4 2026-10-14 feat(history): add Gage DeMello's Eight Step to the archive`
- `bca00a3f23 2026-10-14 Merge branch 'main' into codex/three-levels-guide-spec`
- `e80970ec7f 2026-10-14 docs(spec): three ways to name a pattern guide page design`
- `ee9afcc474 2026-10-14 Merge branch 'main' into codex/boot-bar-self-timing`
- `6a5331f4db 2026-10-14 docs(boot): format the boot bar spec for prettier`
- `7e3cdafaeb 2026-10-14 feat(boot): time the boot bar from the last boot's milestones`

Observation: unique commit subjects (first 1 of 1):

- `9fbaa6396d chore(archive): preserve portrait screen-take prototype`

Observation: cherry lines (first 15 of 1):

```text
+ 9fbaa6396d00d20cd11dbec4bf7d7ae2e58cb5ad
```

Observation: `git merge-tree --write-tree MAIN TIP` exit 0; result tree `29418b8fb55abfcab64e8ad158f140edf3b2f870`; 0 conflict messages.

Disposition: SALVAGE. Inference: Portrait screen-take director, camera, recorder, state and tests; distinct prototype with a clean tree merge.

### codex/post-crop-workflow

Observation: tip `3142bf6307dc92e178487df1504b9f953abd08b7`; last commit `2026-09-29 Austen Cloud`; unique commits 3; cherry + / - = 1 / 1.

Observation: `git diff --stat MAIN...TIP` summary: `43 files changed, 2247 insertions(+), 369 deletions(-)`.

Observation: diff stderr: `warning: 0dddc6bed3d885704db61479fe8ca77184a8baaa...3142bf6307dc92e178487df1504b9f953abd08b7: multiple merge bases, using ef5a92d31e1205f03a334a1ca7b19b5b6ea9332b`.

Observation: top directories by net changed-file count (maximum eight): `src/lib/shared/share` (16); `src/lib/shared/animation-engine` (7); `src/lib/shared/media-composition` (6); `tests/unit/media-composition` (6); `messages` (2); `src/lib/shared/sequence-viewer` (2); `src/lib/shared/animation-panel` (1); `src/lib/shared/effects` (1).

Observation: changed paths (first eight of 43): `messages/de.json`, `messages/en.json`, `src/lib/shared/animation-engine/components/CanvasSurface.svelte`, `src/lib/shared/animation-engine/components/effects-panel/EffectSelector.svelte`, `src/lib/shared/animation-engine/components/settings-panels/DisplayPanel.svelte`, `src/lib/shared/animation-engine/components/settings-panels/EffortPanel.svelte`, `src/lib/shared/animation-engine/components/settings-panels/PathShapePanel.svelte`, `src/lib/shared/animation-engine/components/settings-panels/TrailsPanel.svelte`.

Observation: main history since `2026-09-29`: 1067 commits in touched directories; 393 commits in exact changed-file paths. Directory pathspecs (first eight of 10): `messages`, `src/lib/shared/animation-engine`, `src/lib/shared/animation-panel`, `src/lib/shared/effects`, `src/lib/shared/media-composition`, `src/lib/shared/sequence-viewer`, `src/lib/shared/share`, `tests/unit`.

Observation: directory-history sample (maximum six):

- `ee7d2866dc 2026-10-14 Merge branch 'main' into codex/zans-diamond-guide`
- `9f686deea2 2026-10-14 feat(guide): Zan's Diamond page, one hand path and all 24 variations playable`
- `a1614d829e 2026-10-14 Merge branch 'main' into codex/collection-picker-scale`
- `cb1d954c07 2026-10-14 feat(library): collection picker opens on a shelf, not the whole library`
- `435e0d7ba4 2026-10-14 Merge branch 'main' into codex/collection-share-drill-3`
- `073b87b8c4 2026-10-14 fix(share): let a short landing scroll and shorten the people row`

Observation: exact-file history sample (maximum six):

- `ee7d2866dc 2026-10-14 Merge branch 'main' into codex/zans-diamond-guide`
- `9f686deea2 2026-10-14 feat(guide): Zan's Diamond page, one hand path and all 24 variations playable`
- `a1614d829e 2026-10-14 Merge branch 'main' into codex/collection-picker-scale`
- `cb1d954c07 2026-10-14 feat(library): collection picker opens on a shelf, not the whole library`
- `073b87b8c4 2026-10-14 fix(share): let a short landing scroll and shorten the people row`
- `b50b42a12b 2026-10-14 fix(inbox): share sheet landing icon, shorter people row, fuller hero`

Observation: unique commit subjects (first 3 of 3):

- `3142bf6307 Apply imported video crop controls live`
- `02ac82076f Keep crop controls and editor tools available for imported clips`
- `5850e8ccc0 Merge commit 'd6e04f6589' into codex/post-crop-workflow`

Observation: cherry lines (first 15 of 2):

```text
- 02ac82076fa0771cdda9488e54509bef15cff574
+ 3142bf6307dc92e178487df1504b9f953abd08b7
```

Observation: `git merge-tree --write-tree MAIN TIP` exit 1; result tree `b2b24853b60c580d9ca1d7f00e304f86a83744ef`; 8 conflict messages.

```text
CONFLICT (modify/delete): src/lib/shared/media-composition/services/post-studio-frame-compositor.ts deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in 3142bf6307dc92e178487df1504b9f953abd08b7.  Version 3142bf6307dc92e178487df1504b9f953abd08b7 of src/lib/shared/media-composition/services/post-studio-frame-compositor.ts left in tree.
CONFLICT (modify/delete): src/lib/shared/share/components/post-studio/PostStudioMediaLayer.svelte deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in 3142bf6307dc92e178487df1504b9f953abd08b7.  Version 3142bf6307dc92e178487df1504b9f953abd08b7 of src/lib/shared/share/components/post-studio/PostStudioMediaLayer.svelte left in tree.
CONFLICT (modify/delete): src/lib/shared/share/components/post-studio/editor/PostEditorCanvas.svelte deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in 3142bf6307dc92e178487df1504b9f953abd08b7.  Version 3142bf6307dc92e178487df1504b9f953abd08b7 of src/lib/shared/share/components/post-studio/editor/PostEditorCanvas.svelte left in tree.
CONFLICT (modify/delete): src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in 3142bf6307dc92e178487df1504b9f953abd08b7.  Version 3142bf6307dc92e178487df1504b9f953abd08b7 of src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte left in tree.
CONFLICT (modify/delete): src/lib/shared/share/components/post-studio/editor/PostItemTool.svelte deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in 3142bf6307dc92e178487df1504b9f953abd08b7.  Version 3142bf6307dc92e178487df1504b9f953abd08b7 of src/lib/shared/share/components/post-studio/editor/PostItemTool.svelte left in tree.
CONFLICT (modify/delete): src/lib/shared/share/components/post-studio/editor/post-source-crop.ts deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in 3142bf6307dc92e178487df1504b9f953abd08b7.  Version 3142bf6307dc92e178487df1504b9f953abd08b7 of src/lib/shared/share/components/post-studio/editor/post-source-crop.ts left in tree.
CONFLICT (modify/delete): tests/unit/media-composition/post-source-crop.test.ts deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in 3142bf6307dc92e178487df1504b9f953abd08b7.  Version 3142bf6307dc92e178487df1504b9f953abd08b7 of tests/unit/media-composition/post-source-crop.test.ts left in tree.
CONFLICT (content): Merge conflict in tests/unit/media-composition/post-studio-frame-compositor.test.ts
```

Disposition: SALVAGE. Inference: Live imported-video crop integration remains distinct; current package workspace deleted its old owners, so forward-port behavior.

### codex/post-half-speed-start

Observation: tip `39804a9a0a8722c2b17562797ce2048d2ae9799b`; last commit `2026-09-29 Austen Cloud`; unique commits 2; cherry + / - = 1 / 0.

Observation: `git diff --stat MAIN...TIP` summary: `4 files changed, 86 insertions(+), 15 deletions(-)`.

Observation: top directories by net changed-file count (maximum eight): `src/lib/shared/share` (2); `src/lib/shared/media-composition` (1); `tests/unit/media-composition` (1).

Observation: changed paths (first eight of 4): `src/lib/shared/media-composition/domain/post-project-compiler.ts`, `src/lib/shared/share/components/post-studio/PostStudioMediaLayer.svelte`, `src/lib/shared/share/components/post-studio/PostStudioSequenceAnimationLayer.svelte`, `tests/unit/media-composition/post-project-compiler.test.ts`.

Observation: main history since `2026-09-29`: 410 commits in touched directories; 95 commits in exact changed-file paths. Directory pathspecs (first eight of 3): `src/lib/shared/media-composition`, `src/lib/shared/share`, `tests/unit/media-composition`.

Observation: directory-history sample (maximum six):

- `bb84dce6cb 2026-10-13 Recompose the Save to Library panel for wide screens`
- `f0a1fe1efa 2026-10-12 Merge branch 'main' into codex/motion-r2`
- `7d1dfff785 2026-10-12 feat(motion): move viewer, 3D, video and public surfaces onto the shared clock`
- `d7e0048b86 2026-10-12 Merge branch 'main' into codex/cell-grid-join`
- `36670b70a1 2026-10-12 feat(studio): an arrangement cell can carry its own grid join`
- `6de7881545 2026-10-12 refactor(motion): the Composer's owners come from @austencloud/motion`

Observation: exact-file history sample (maximum six):

- `139bd29335 2026-10-11 Merge main into codex/video-editor: arrangement phases 3 and 4 on the shared editor`
- `db023fcb94 2026-10-11 Merge branch 'main' into codex/arrangements-studio-p4`
- `a125483e24 2026-10-11 feat(arrangement): cells draw from the resolved appearance through per-cell effects state`
- `1dea42c756 2026-10-11 feat(post-studio): draw a text item with a callout as a speech bubble`
- `dc80268d85 2026-10-11 Merge tka main (SvelteKit 3, Studio arrangements) into codex/video-editor`
- `679f679479 2026-10-11 feat(studio): select, swap, resize and menu arrangement cells in the preview`

Observation: unique commit subjects (first 2 of 2):

- `39804a9a0a fix(post-studio): start linked animation with incoming take`
- `a29e548964 Merge commit '98c6c2a0c3' into codex/post-half-speed-start`

Observation: cherry lines (first 15 of 1):

```text
+ 39804a9a0a8722c2b17562797ce2048d2ae9799b
```

Observation: `git merge-tree --write-tree MAIN TIP` exit 1; result tree `002c2a2b479aea6dc68ce19832f435be7759a6d2`; 4 conflict messages.

```text
CONFLICT (modify/delete): src/lib/shared/media-composition/domain/post-project-compiler.ts deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in 39804a9a0a8722c2b17562797ce2048d2ae9799b.  Version 39804a9a0a8722c2b17562797ce2048d2ae9799b of src/lib/shared/media-composition/domain/post-project-compiler.ts left in tree.
CONFLICT (modify/delete): src/lib/shared/share/components/post-studio/PostStudioMediaLayer.svelte deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in 39804a9a0a8722c2b17562797ce2048d2ae9799b.  Version 39804a9a0a8722c2b17562797ce2048d2ae9799b of src/lib/shared/share/components/post-studio/PostStudioMediaLayer.svelte left in tree.
CONFLICT (modify/delete): src/lib/shared/share/components/post-studio/PostStudioSequenceAnimationLayer.svelte deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in 39804a9a0a8722c2b17562797ce2048d2ae9799b.  Version 39804a9a0a8722c2b17562797ce2048d2ae9799b of src/lib/shared/share/components/post-studio/PostStudioSequenceAnimationLayer.svelte left in tree.
CONFLICT (content): Merge conflict in tests/unit/media-composition/post-project-compiler.test.ts
```

Disposition: SALVAGE. Inference: Incoming take / linked animation start synchronization; old compiler and layers were deleted, so inspect the current package for this behavior.

### codex/post-pip-appearance

Observation: tip `bd9eecb800448919e183c4507b007dc9ba123a13`; last commit `2026-09-29 Austen Cloud`; unique commits 2; cherry + / - = 1 / 0.

Observation: `git diff --stat MAIN...TIP` summary: `44 files changed, 2125 insertions(+), 337 deletions(-)`.

Observation: diff stderr: `warning: 0dddc6bed3d885704db61479fe8ca77184a8baaa...bd9eecb800448919e183c4507b007dc9ba123a13: multiple merge bases, using ef5a92d31e1205f03a334a1ca7b19b5b6ea9332b`.

Observation: top directories by net changed-file count (maximum eight): `src/lib/shared/share` (17); `src/lib/shared/animation-engine` (7); `src/lib/shared/media-composition` (6); `tests/unit/media-composition` (4); `messages` (2); `src/lib/shared/pictograph` (2); `src/lib/shared/sequence-viewer` (2); `src/lib/shared/animation-panel` (1).

Observation: changed paths (first eight of 44): `messages/de.json`, `messages/en.json`, `src/lib/shared/animation-engine/components/CanvasSurface.svelte`, `src/lib/shared/animation-engine/components/effects-panel/EffectSelector.svelte`, `src/lib/shared/animation-engine/components/settings-panels/DisplayPanel.svelte`, `src/lib/shared/animation-engine/components/settings-panels/EffortPanel.svelte`, `src/lib/shared/animation-engine/components/settings-panels/PathShapePanel.svelte`, `src/lib/shared/animation-engine/components/settings-panels/TrailsPanel.svelte`.

Observation: main history since `2026-09-29`: 1093 commits in touched directories; 413 commits in exact changed-file paths. Directory pathspecs (first eight of 11): `messages`, `src/lib/shared/animation-engine`, `src/lib/shared/animation-panel`, `src/lib/shared/effects`, `src/lib/shared/media-composition`, `src/lib/shared/pictograph`, `src/lib/shared/sequence-viewer`, `src/lib/shared/share`.

Observation: directory-history sample (maximum six):

- `ee7d2866dc 2026-10-14 Merge branch 'main' into codex/zans-diamond-guide`
- `9f686deea2 2026-10-14 feat(guide): Zan's Diamond page, one hand path and all 24 variations playable`
- `a1614d829e 2026-10-14 Merge branch 'main' into codex/collection-picker-scale`
- `cb1d954c07 2026-10-14 feat(library): collection picker opens on a shelf, not the whole library`
- `435e0d7ba4 2026-10-14 Merge branch 'main' into codex/collection-share-drill-3`
- `073b87b8c4 2026-10-14 fix(share): let a short landing scroll and shorten the people row`

Observation: exact-file history sample (maximum six):

- `ee7d2866dc 2026-10-14 Merge branch 'main' into codex/zans-diamond-guide`
- `9f686deea2 2026-10-14 feat(guide): Zan's Diamond page, one hand path and all 24 variations playable`
- `a1614d829e 2026-10-14 Merge branch 'main' into codex/collection-picker-scale`
- `cb1d954c07 2026-10-14 feat(library): collection picker opens on a shelf, not the whole library`
- `073b87b8c4 2026-10-14 fix(share): let a short landing scroll and shorten the people row`
- `b50b42a12b 2026-10-14 fix(inbox): share sheet landing icon, shorter people row, fuller hero`

Observation: unique commit subjects (first 2 of 2):

- `bd9eecb800 feat(post-studio): expose scoped PiP animation appearance`
- `be940195a6 Merge commit 'd6e04f6589' into codex/post-pip-appearance`

Observation: cherry lines (first 15 of 1):

```text
+ bd9eecb800448919e183c4507b007dc9ba123a13
```

Observation: `git merge-tree --write-tree MAIN TIP` exit 1; result tree `e44d95089973af91f38de5cd49691ced62f80c4c`; 13 conflict messages.

```text
CONFLICT (content): Merge conflict in src/lib/shared/media-composition/domain/post-project-edits.ts
CONFLICT (modify/delete): src/lib/shared/media-composition/domain/post-project.ts deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in bd9eecb800448919e183c4507b007dc9ba123a13.  Version bd9eecb800448919e183c4507b007dc9ba123a13 of src/lib/shared/media-composition/domain/post-project.ts left in tree.
CONFLICT (content): Merge conflict in src/lib/shared/pictograph/shared/components/PictographRenderer.svelte
CONFLICT (file location): src/lib/shared/share/components/post-studio/editor/PostScopedEffectsPanel.svelte added in bd9eecb800448919e183c4507b007dc9ba123a13 inside a directory that was renamed in 0dddc6bed3d885704db61479fe8ca77184a8baaa, suggesting it should perhaps be moved to src/lib/shared/post-studio-plugin/ui/PostScopedEffectsPanel.svelte.
CONFLICT (add/add): Merge conflict in src/lib/shared/post-studio-plugin/ui/PostScopedEffectsPanel.svelte
CONFLICT (modify/delete): src/lib/shared/share/components/post-studio/PostStudioSequenceAnimationLayer.svelte deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in bd9eecb800448919e183c4507b007dc9ba123a13.  Version bd9eecb800448919e183c4507b007dc9ba123a13 of src/lib/shared/share/components/post-studio/PostStudioSequenceAnimationLayer.svelte left in tree.
CONFLICT (modify/delete): src/lib/shared/share/components/post-studio/editor/PostAnimationAppearanceTool.svelte deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in bd9eecb800448919e183c4507b007dc9ba123a13.  Version bd9eecb800448919e183c4507b007dc9ba123a13 of src/lib/shared/share/components/post-studio/editor/PostAnimationAppearanceTool.svelte left in tree.
CONFLICT (modify/delete): src/lib/shared/share/components/post-studio/editor/PostEditorCanvas.svelte deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in bd9eecb800448919e183c4507b007dc9ba123a13.  Version bd9eecb800448919e183c4507b007dc9ba123a13 of src/lib/shared/share/components/post-studio/editor/PostEditorCanvas.svelte left in tree.
```

Disposition: SALVAGE. Inference: Scoped PiP animation appearance controls remain patch-distinct; reconcile with current TKA plugin and package UI.

### codex/post-static-card-highlight

Observation: tip `54a9b80bba3ab1fcada157e8bc04a8857f5bdbfd`; last commit `2026-09-29 Austen Cloud`; unique commits 1; cherry + / - = 1 / 0.

Observation: `git diff --stat MAIN...TIP` summary: `7 files changed, 82 insertions(+), 8 deletions(-)`.

Observation: top directories by net changed-file count (maximum eight): `src/lib/shared/share` (4); `src/lib/shared/sequence-viewer` (2); `tests/unit/media-composition` (1).

Observation: changed paths (first eight of 7): `src/lib/shared/sequence-viewer/components/ViewerCompanionSurface.svelte`, `src/lib/shared/sequence-viewer/state/viewer-studio-surfaces.svelte.ts`, `src/lib/shared/share/components/post-studio/PostStudioChoreoLayer.svelte`, `src/lib/shared/share/components/post-studio/PostStudioMediaLayer.svelte`, `src/lib/shared/share/components/post-studio/editor/PostEditorCanvas.svelte`, `src/lib/shared/share/components/post-studio/post-card-highlight.ts`, `tests/unit/media-composition/post-static-card-highlight.test.ts`.

Observation: main history since `2026-09-29`: 454 commits in touched directories; 67 commits in exact changed-file paths. Directory pathspecs (first eight of 3): `src/lib/shared/sequence-viewer`, `src/lib/shared/share`, `tests/unit/media-composition`.

Observation: directory-history sample (maximum six):

- `bb84dce6cb 2026-10-13 Recompose the Save to Library panel for wide screens`
- `b26b8b5c9e 2026-10-13 fix(motion): restore the timings the token sweep snapped`
- `f0a1fe1efa 2026-10-12 Merge branch 'main' into codex/motion-r2`
- `7d1dfff785 2026-10-12 feat(motion): move viewer, 3D, video and public surfaces onto the shared clock`
- `d7e0048b86 2026-10-12 Merge branch 'main' into codex/cell-grid-join`
- `36670b70a1 2026-10-12 feat(studio): an arrangement cell can carry its own grid join`

Observation: exact-file history sample (maximum six):

- `dc80268d85 2026-10-11 Merge tka main (SvelteKit 3, Studio arrangements) into codex/video-editor`
- `679f679479 2026-10-11 feat(studio): select, swap, resize and menu arrangement cells in the preview`
- `a8c19493cc 2026-10-11 refactor(post): Post Studio renders the package workspace`
- `d4e5599e03 2026-10-10 refactor(post): the editor's panels come from the package`
- `c39e3fb42d 2026-10-10 refactor(post): the editor's modules come from the package`
- `2e881cfa1e 2026-10-10 refactor(post): the editor UI draws package icons, reads ve tokens and uses the package popover`

Observation: unique commit subjects (first 1 of 1):

- `54a9b80bba fix(post): leave standalone choreo cards unhighlighted`

Observation: cherry lines (first 15 of 1):

```text
+ 54a9b80bba3ab1fcada157e8bc04a8857f5bdbfd
```

Observation: `git merge-tree --write-tree MAIN TIP` exit 1; result tree `2c164ac77eeb71badb087a99b2a47e05e91fba0e`; 5 conflict messages.

```text
CONFLICT (content): Merge conflict in src/lib/shared/post-studio-plugin/ui/PostStudioChoreoLayer.svelte
CONFLICT (content): Merge conflict in src/lib/shared/sequence-viewer/state/viewer-studio-surfaces.svelte.ts
CONFLICT (modify/delete): src/lib/shared/share/components/post-studio/PostStudioMediaLayer.svelte deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in 54a9b80bba3ab1fcada157e8bc04a8857f5bdbfd.  Version 54a9b80bba3ab1fcada157e8bc04a8857f5bdbfd of src/lib/shared/share/components/post-studio/PostStudioMediaLayer.svelte left in tree.
CONFLICT (modify/delete): src/lib/shared/share/components/post-studio/editor/PostEditorCanvas.svelte deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in 54a9b80bba3ab1fcada157e8bc04a8857f5bdbfd.  Version 54a9b80bba3ab1fcada157e8bc04a8857f5bdbfd of src/lib/shared/share/components/post-studio/editor/PostEditorCanvas.svelte left in tree.
CONFLICT (add/add): Merge conflict in tests/unit/media-composition/post-static-card-highlight.test.ts
```

Disposition: SALVAGE. Inference: Standalone Choreo Card highlight behavior and regression test; review against current plugin instead of wholesale merge.

### codex/post-video-auto-adjust

Observation: tip `2ade24a55d13e8cb5968dd6647dbdd10407af9f3`; last commit `2026-09-29 Austen Cloud`; unique commits 2; cherry + / - = 1 / 1.

Observation: `git diff --stat MAIN...TIP` summary: `11 files changed, 299 insertions(+)`.

Observation: top directories by net changed-file count (maximum eight): `src/lib/shared/media-composition` (6); `src/lib/shared/share` (3); `tests/unit/media-composition` (1); `tests/unit` (1).

Observation: changed paths (first eight of 11): `src/lib/shared/media-composition/domain/media-composition-preset-schema.ts`, `src/lib/shared/media-composition/domain/post-project-compiler.ts`, `src/lib/shared/media-composition/domain/post-project-edits.ts`, `src/lib/shared/media-composition/domain/post-project.ts`, `src/lib/shared/media-composition/domain/post-video-color-grade.ts`, `src/lib/shared/media-composition/services/post-studio-frame-compositor.ts`, `src/lib/shared/share/components/post-studio/PostStudioMediaLayer.svelte`, `src/lib/shared/share/components/post-studio/editor/PostEditorCanvas.svelte`.

Observation: main history since `2026-09-29`: 893 commits in touched directories; 160 commits in exact changed-file paths. Directory pathspecs (first eight of 4): `src/lib/shared/media-composition`, `src/lib/shared/share`, `tests/unit`, `tests/unit/media-composition`.

Observation: directory-history sample (maximum six):

- `a1614d829e 2026-10-14 Merge branch 'main' into codex/collection-picker-scale`
- `cb1d954c07 2026-10-14 feat(library): collection picker opens on a shelf, not the whole library`
- `b4ff2af586 2026-10-14 Merge branch 'main' into codex/eight-step-archive`
- `049b8c1780 2026-10-14 fix(learn): show topics on entry and restore live stars`
- `02f6ee82b4 2026-10-14 feat(history): add Gage DeMello's Eight Step to the archive`
- `4afa51c3a1 2026-10-14 Merge branch 'main' into codex/boot-bar-self-timing`

Observation: exact-file history sample (maximum six):

- `36670b70a1 2026-10-12 feat(studio): an arrangement cell can carry its own grid join`
- `139bd29335 2026-10-11 Merge main into codex/video-editor: arrangement phases 3 and 4 on the shared editor`
- `b3b89842bf 2026-10-11 feat(video-editor): Studio arrangements run on the shared editor`
- `db023fcb94 2026-10-11 Merge branch 'main' into codex/arrangements-studio-p4`
- `f96c1bc322 2026-10-11 Merge branch 'main' into codex/walkthrough-zoom`
- `3359c9676c 2026-10-11 feat(arrangement): per-hand effect and effort edits, hand visibility, item speed and the cell look merge`

Observation: unique commit subjects (first 2 of 2):

- `2ade24a55d test(post-studio): keep color test scoped`
- `894ed39323 feat(post-studio): auto adjust video color`

Observation: cherry lines (first 15 of 2):

```text
+ 894ed393237fc0d0dcd505c7f46c40c430d7d139
- 2ade24a55d13e8cb5968dd6647dbdd10407af9f3
```

Observation: `git merge-tree --write-tree MAIN TIP` exit 1; result tree `e644c798ba26638cd9c8f3ee66a8b213ebbb1406`; 9 conflict messages.

```text
CONFLICT (modify/delete): src/lib/shared/media-composition/domain/media-composition-preset-schema.ts deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in 2ade24a55d13e8cb5968dd6647dbdd10407af9f3.  Version 2ade24a55d13e8cb5968dd6647dbdd10407af9f3 of src/lib/shared/media-composition/domain/media-composition-preset-schema.ts left in tree.
CONFLICT (modify/delete): src/lib/shared/media-composition/domain/post-project-compiler.ts deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in 2ade24a55d13e8cb5968dd6647dbdd10407af9f3.  Version 2ade24a55d13e8cb5968dd6647dbdd10407af9f3 of src/lib/shared/media-composition/domain/post-project-compiler.ts left in tree.
CONFLICT (content): Merge conflict in src/lib/shared/media-composition/domain/post-project-edits.ts
CONFLICT (modify/delete): src/lib/shared/media-composition/domain/post-project.ts deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in 2ade24a55d13e8cb5968dd6647dbdd10407af9f3.  Version 2ade24a55d13e8cb5968dd6647dbdd10407af9f3 of src/lib/shared/media-composition/domain/post-project.ts left in tree.
CONFLICT (modify/delete): src/lib/shared/media-composition/services/post-studio-frame-compositor.ts deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in 2ade24a55d13e8cb5968dd6647dbdd10407af9f3.  Version 2ade24a55d13e8cb5968dd6647dbdd10407af9f3 of src/lib/shared/media-composition/services/post-studio-frame-compositor.ts left in tree.
CONFLICT (modify/delete): src/lib/shared/share/components/post-studio/PostStudioMediaLayer.svelte deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in 2ade24a55d13e8cb5968dd6647dbdd10407af9f3.  Version 2ade24a55d13e8cb5968dd6647dbdd10407af9f3 of src/lib/shared/share/components/post-studio/PostStudioMediaLayer.svelte left in tree.
CONFLICT (modify/delete): src/lib/shared/share/components/post-studio/editor/PostEditorCanvas.svelte deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in 2ade24a55d13e8cb5968dd6647dbdd10407af9f3.  Version 2ade24a55d13e8cb5968dd6647dbdd10407af9f3 of src/lib/shared/share/components/post-studio/editor/PostEditorCanvas.svelte left in tree.
CONFLICT (modify/delete): src/lib/shared/share/components/post-studio/editor/PostItemTool.svelte deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in 2ade24a55d13e8cb5968dd6647dbdd10407af9f3.  Version 2ade24a55d13e8cb5968dd6647dbdd10407af9f3 of src/lib/shared/share/components/post-studio/editor/PostItemTool.svelte left in tree.
```

Disposition: SALVAGE. Inference: Auto-color feature patch is already equivalent; unique test scoping edit remains, but targets extracted compiler tests.

### codex/post-video-color-controls

Observation: tip `e99bddd57c077fdca95f0c3576ecf5473f456ac7`; last commit `2026-09-29 Austen Cloud`; unique commits 2; cherry + / - = 1 / 0.

Observation: `git diff --stat MAIN...TIP` summary: `41 files changed, 2139 insertions(+), 329 deletions(-)`.

Observation: diff stderr: `warning: 0dddc6bed3d885704db61479fe8ca77184a8baaa...e99bddd57c077fdca95f0c3576ecf5473f456ac7: multiple merge bases, using ef5a92d31e1205f03a334a1ca7b19b5b6ea9332b`.

Observation: top directories by net changed-file count (maximum eight): `src/lib/shared/share` (16); `src/lib/shared/animation-engine` (7); `src/lib/shared/media-composition` (6); `tests/unit/media-composition` (4); `messages` (2); `src/lib/shared/sequence-viewer` (2); `src/lib/shared/animation-panel` (1); `src/lib/shared/effects` (1).

Observation: changed paths (first eight of 41): `messages/de.json`, `messages/en.json`, `src/lib/shared/animation-engine/components/CanvasSurface.svelte`, `src/lib/shared/animation-engine/components/effects-panel/EffectSelector.svelte`, `src/lib/shared/animation-engine/components/settings-panels/DisplayPanel.svelte`, `src/lib/shared/animation-engine/components/settings-panels/EffortPanel.svelte`, `src/lib/shared/animation-engine/components/settings-panels/PathShapePanel.svelte`, `src/lib/shared/animation-engine/components/settings-panels/TrailsPanel.svelte`.

Observation: main history since `2026-09-29`: 1067 commits in touched directories; 391 commits in exact changed-file paths. Directory pathspecs (first eight of 10): `messages`, `src/lib/shared/animation-engine`, `src/lib/shared/animation-panel`, `src/lib/shared/effects`, `src/lib/shared/media-composition`, `src/lib/shared/sequence-viewer`, `src/lib/shared/share`, `tests/unit`.

Observation: directory-history sample (maximum six):

- `ee7d2866dc 2026-10-14 Merge branch 'main' into codex/zans-diamond-guide`
- `9f686deea2 2026-10-14 feat(guide): Zan's Diamond page, one hand path and all 24 variations playable`
- `a1614d829e 2026-10-14 Merge branch 'main' into codex/collection-picker-scale`
- `cb1d954c07 2026-10-14 feat(library): collection picker opens on a shelf, not the whole library`
- `435e0d7ba4 2026-10-14 Merge branch 'main' into codex/collection-share-drill-3`
- `073b87b8c4 2026-10-14 fix(share): let a short landing scroll and shorten the people row`

Observation: exact-file history sample (maximum six):

- `ee7d2866dc 2026-10-14 Merge branch 'main' into codex/zans-diamond-guide`
- `9f686deea2 2026-10-14 feat(guide): Zan's Diamond page, one hand path and all 24 variations playable`
- `a1614d829e 2026-10-14 Merge branch 'main' into codex/collection-picker-scale`
- `cb1d954c07 2026-10-14 feat(library): collection picker opens on a shelf, not the whole library`
- `073b87b8c4 2026-10-14 fix(share): let a short landing scroll and shorten the people row`
- `b50b42a12b 2026-10-14 fix(inbox): share sheet landing icon, shorter people row, fuller hero`

Observation: unique commit subjects (first 2 of 2):

- `e99bddd57c feat(post-studio): add manual video color controls`
- `9d5663e2db Merge commit 'd6e04f6589' into codex/post-video-color-controls`

Observation: cherry lines (first 15 of 1):

```text
+ e99bddd57c077fdca95f0c3576ecf5473f456ac7
```

Observation: `git merge-tree --write-tree MAIN TIP` exit 1; result tree `b2e5825d0f7d6be0cf38cf84dd010eca358dc408`; 7 conflict messages.

```text
CONFLICT (modify/delete): src/lib/shared/media-composition/domain/media-composition-preset-schema.ts deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in e99bddd57c077fdca95f0c3576ecf5473f456ac7.  Version e99bddd57c077fdca95f0c3576ecf5473f456ac7 of src/lib/shared/media-composition/domain/media-composition-preset-schema.ts left in tree.
CONFLICT (modify/delete): src/lib/shared/media-composition/domain/post-project.ts deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in e99bddd57c077fdca95f0c3576ecf5473f456ac7.  Version e99bddd57c077fdca95f0c3576ecf5473f456ac7 of src/lib/shared/media-composition/domain/post-project.ts left in tree.
CONFLICT (modify/delete): src/lib/shared/media-composition/domain/post-video-color-grade.ts deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in e99bddd57c077fdca95f0c3576ecf5473f456ac7.  Version e99bddd57c077fdca95f0c3576ecf5473f456ac7 of src/lib/shared/media-composition/domain/post-video-color-grade.ts left in tree.
CONFLICT (file location): src/lib/shared/share/components/post-studio/editor/PostVideoColorTool.svelte added in e99bddd57c077fdca95f0c3576ecf5473f456ac7 inside a directory that was renamed in 0dddc6bed3d885704db61479fe8ca77184a8baaa, suggesting it should perhaps be moved to src/lib/shared/post-studio-plugin/ui/PostVideoColorTool.svelte.
CONFLICT (modify/delete): src/lib/shared/share/components/post-studio/editor/PostItemTool.svelte deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in e99bddd57c077fdca95f0c3576ecf5473f456ac7.  Version e99bddd57c077fdca95f0c3576ecf5473f456ac7 of src/lib/shared/share/components/post-studio/editor/PostItemTool.svelte left in tree.
CONFLICT (content): Merge conflict in tests/unit/media-composition/post-project-compiler.test.ts
CONFLICT (modify/delete): tests/unit/post-video-color-grade.test.ts deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in e99bddd57c077fdca95f0c3576ecf5473f456ac7.  Version e99bddd57c077fdca95f0c3576ecf5473f456ac7 of tests/unit/post-video-color-grade.test.ts left in tree.
```

Disposition: SALVAGE. Inference: Manual video color controls remain patch-distinct; old owners were extracted into the package/plugin, requiring a forward port.

### codex/walk-lab-terminal-step

Observation: tip `3a18f72fff892386090bdb0863b887c541438b2e`; last commit `2026-08-29 Austen Cloud`; unique commits 19; cherry + / - = 18 / 1.

Observation: `git diff --stat MAIN...TIP` summary: `36 files changed, 20657 insertions(+), 2934 deletions(-)`.

Observation: top directories by net changed-file count (maximum eight): `tests/unit/3d` (10); `static/animations/locomotion-pack` (8); `src/lib/shared/3d` (7); `src/routes/test` (4); `static/animations/terminal-stops` (3); `docs/architecture` (1); `docs/superpowers/specs` (1); `patches` (1).

Observation: changed paths (first eight of 36): `docs/architecture/locomotion-research-canon.md`, `docs/superpowers/specs/2026-08-28-grapevine-locomotion-design.md`, `patches/@austencloud__scene-3d@0.1.6.patch`, `pnpm-lock.yaml`, `src/lib/shared/3d/components/ManualRaycaster.svelte`, `src/lib/shared/3d/diagnostics/gait/GaitOverlay.svelte`, `src/lib/shared/3d/diagnostics/gait/GaitReadout.svelte`, `src/lib/shared/3d/diagnostics/gait/gait-verdicts.ts`.

Observation: main history since `2026-08-29`: 1805 commits in touched directories; 144 commits in exact changed-file paths. Directory pathspecs (first eight of 9): `pnpm-lock.yaml`, `docs/architecture`, `docs/superpowers/specs`, `patches`, `src/lib/shared/3d`, `src/routes/test`, `static/animations/locomotion-pack`, `static/animations/terminal-stops`.

Observation: directory-history sample (maximum six):

- `02f6ee82b4 2026-10-14 feat(history): add Gage DeMello's Eight Step to the archive`
- `bca00a3f23 2026-10-14 Merge branch 'main' into codex/three-levels-guide-spec`
- `e80970ec7f 2026-10-14 docs(spec): three ways to name a pattern guide page design`
- `ee9afcc474 2026-10-14 Merge branch 'main' into codex/boot-bar-self-timing`
- `6a5331f4db 2026-10-14 docs(boot): format the boot bar spec for prettier`
- `7e3cdafaeb 2026-10-14 feat(boot): time the boot bar from the last boot's milestones`

Observation: exact-file history sample (maximum six):

- `7a2dd7f990 2026-10-13 chore(deps): install @austencloud/video-editor 0.1.2 from npm`
- `8ec5deb880 2026-10-13 fix(deps): lockfile records the vendored motion tarball as 0.2.1`
- `2b2028fec2 2026-10-13 chore(deps): vendor @austencloud/motion 0.2.1`
- `a3ed6b9f98 2026-10-12 build(deps): @austencloud/motion 0.2.0, vendored, with the Composer's named route morphs`
- `f3d66cca65 2026-10-12 build(deps): @austencloud/motion 0.1.3, the shared motion clock`
- `979e5d7d5b 2026-10-11 build(deps): @austencloud/video-editor 0.1.0 from the vendored tarball`

Observation: unique commit subjects (first 15 of 19):

- `3a18f72fff prototype(locomotion): audit captured reversal solve`
- `4daf1dc4b7 prototype(locomotion): audit official captured grapevine`
- `ef0b85eba7 fix(diagnostics): mark rejected gait unavailable`
- `629602ba9b chore(locomotion): sanitize scene 3d patch`
- `c0d377ba40 docs(locomotion): record fail-closed grapevine`
- `94c1a404b6 fix(locomotion): fail closed on unsafe grapevine`
- `c32e5fbc78 fix(locomotion): fair grapevine target continuity`
- `723e08e751 fix(locomotion): hold terminal clip final frame`
- `9953684e9d feat(locomotion): bind terminal footprints to stop data`
- `6bc1be4717 fix(3d): bind manual raycaster to canvas`
- `501c8a4bfd fix(walk-lab): orient planned footprints correctly`
- `3352c0d078 fix(locomotion): center authored footprints`
- `18e28752d0 feat(locomotion): realize explicit footprints`
- `fd838ae9d3 prototype(locomotion): harden grapevine continuity contract`
- `0c1d6497c0 feat(walk-lab): visualize exact footprint plans`

Observation: cherry lines (first 15 of 19):

```text
+ 5574ab9da2496587f55f952a67c8afce6572da0f
- 26c07b73f5220dabcd25e1b3cd252d1b09c6393f
+ a5815621bc46fccf945c5d023bd74c552fb26328
+ 09a4443e13b85976d1420393f49f79d75e803cac
+ 0c1d6497c082c3f85b9e71218c096dbdf698203b
+ fd838ae9d3f9375be0a508814ed474dfe1fc1b93
+ 18e28752d021099deb448ef2b40914b0c0b5a1a4
+ 3352c0d078d86a1b574de8775fe0aee8e6d710f6
+ 501c8a4bfd4c483cd1cefb90f8b76289f6894877
+ 6bc1be47174209cfcb573860eacc28e4e6091289
+ 9953684e9d8bf865bb45c0c16b08e1f87808fb2e
+ 723e08e7513bd92068f01b08c387efdd0bfd0daa
+ c32e5fbc78a0bae45c493b3a4df8c8da5919ecf7
+ 94c1a404b6d84a034d9559213b3fb613fe50e214
+ c0d377ba406a87050f6a8bff91f87deed2b8972e
```

Observation: `git merge-tree --write-tree MAIN TIP` exit 1; result tree `eabc623f298eff87409b4c4531fc99e933152ecd`; 14 conflict messages.

```text
CONFLICT (content): Merge conflict in docs/architecture/locomotion-research-canon.md
CONFLICT (content): Merge conflict in patches/@austencloud__scene-3d@0.1.6.patch
CONFLICT (content): Merge conflict in pnpm-lock.yaml
CONFLICT (content): Merge conflict in src/lib/shared/3d/components/ManualRaycaster.svelte
CONFLICT (content): Merge conflict in src/lib/shared/3d/locomotion/pattern-terminal-step-plan.ts
CONFLICT (content): Merge conflict in src/routes/test/walk-lab/+page.svelte
CONFLICT (content): Merge conflict in src/routes/test/walk-lab/WalkDriver.svelte
CONFLICT (content): Merge conflict in static/animations/locomotion-pack/grapevine-left.glb
```

Disposition: SALVAGE. Inference: Terminal footprints/stops, grapevine assets and fail-closed gait diagnostics; preserve research and selective fixes, not a bulk merge.

## Other branch evidence

### claude/ota-editor-pin

Observation: tip `7a2dd7f99090dd6a3b4b9804629f64eeae8af262`; last commit `2026-10-13 Austen Cloud`; unique commits 0; cherry + / - = 0 / 0.

Observation: `git diff --stat MAIN...TIP` summary: `(no diff)`.

Observation: net diff is empty; no net-touched directory or exact-file history query applies.

Disposition: DELETE-SAFE. Observation: zero unique commits; tip is reachable from baseline main.

### claude/sad-lewin-cbb116

Observation: tip `b7b21ef0ccd1bbf328280ece1c428aa0fc2ae6cf`; last commit `2026-10-14 Austen Cloud`; unique commits 0; cherry + / - = 0 / 0.

Observation: `git diff --stat MAIN...TIP` summary: `(no diff)`.

Observation: net diff is empty; no net-touched directory or exact-file history query applies.

Disposition: DELETE-SAFE. Observation: zero unique commits; tip is reachable from baseline main.

### codex/capgo-keep-bundles

Observation: tip `483e1b4dbd16b69d2334c57c707678c7be0abb42`; last commit `2026-10-08 Austen Cloud`; unique commits 0; cherry + / - = 0 / 0.

Observation: `git diff --stat MAIN...TIP` summary: `(no diff)`.

Observation: net diff is empty; no net-touched directory or exact-file history query applies.

Disposition: DELETE-SAFE. Observation: zero unique commits; tip is reachable from baseline main.

### codex/flowgeng-credit-tips

Observation: tip `000f38676093b6bd82185f4f51913c7f77ecedb0`; last commit `2026-10-14 Austen Cloud`; unique commits 0; cherry + / - = 0 / 0.

Observation: `git diff --stat MAIN...TIP` summary: `(no diff)`.

Observation: net diff is empty; no net-touched directory or exact-file history query applies.

Disposition: DELETE-SAFE. Observation: zero unique commits; tip is reachable from baseline main.

### codex/fuse-recipe-stage

Observation: tip `406e4f0660639a3dfb0e7582e8ec3e6ae1838404`; last commit `2026-09-03 Austen Cloud`; unique commits 2; cherry + / - = 2 / 0.

Observation: `git diff --stat MAIN...TIP` summary: `8 files changed, 1011 insertions(+), 225 deletions(-)`.

Observation: top directories by net changed-file count (maximum eight): `src/lib/features/fuse` (6); `docs/superpowers/specs` (2).

Observation: changed paths (first eight of 8): `docs/superpowers/specs/2026-09-01-fuse-recipe-stage-handoff.md`, `docs/superpowers/specs/active/2026-09-01-fuse-recipe-stage-design.md`, `src/lib/features/fuse/components/FuseAnimationPreview.svelte`, `src/lib/features/fuse/components/FusePreviewStage.svelte`, `src/lib/features/fuse/components/FuseRecipeOverview.svelte`, `src/lib/features/fuse/components/FuseRecipeSettings.svelte`, `src/lib/features/fuse/components/FuseRelationshipComposer.svelte`, `src/lib/features/fuse/components/FuseRelationshipSummary.svelte`.

Observation: main history since `2026-09-03`: 483 commits in touched directories; 16 commits in exact changed-file paths. Directory pathspecs (first eight of 2): `docs/superpowers/specs`, `src/lib/features/fuse`.

Observation: directory-history sample (maximum six):

- `02f6ee82b4 2026-10-14 feat(history): add Gage DeMello's Eight Step to the archive`
- `bca00a3f23 2026-10-14 Merge branch 'main' into codex/three-levels-guide-spec`
- `e80970ec7f 2026-10-14 docs(spec): three ways to name a pattern guide page design`
- `ee9afcc474 2026-10-14 Merge branch 'main' into codex/boot-bar-self-timing`
- `6a5331f4db 2026-10-14 docs(boot): format the boot bar spec for prettier`
- `7e3cdafaeb 2026-10-14 feat(boot): time the boot bar from the last boot's milestones`

Observation: exact-file history sample (maximum six):

- `7d6a590048 2026-10-12 feat(motion): compose fuse and write use the shared motion clock`
- `a97b743f05 2026-10-10 feat: migrate to SvelteKit 3, Vite 8 and TypeScript 6`
- `f1e68e07f7 2026-10-09 fix(theme): drop dead --theme-shadow color uses, restore broken backgrounds`
- `9c8e19e745 2026-09-30 fix(fuse): open share sheet directly from fused result`
- `5b6be291f4 2026-09-25 feat(fuse): keep linked rule controls visible`
- `15fa58c937 2026-09-23 style(fuse): three button weights, quiet tier for ways back and out`

Observation: unique commit subjects (first 2 of 2):

- `406e4f0660 chore(archive): preserve superseded Fuse recipe prototype`
- `8c27b19568 docs: hand off Fuse recipe stage redesign`

Observation: cherry lines (first 15 of 2):

```text
+ 8c27b195681554ceebd6cfe1d47eb383b6fd61c6
+ 406e4f0660639a3dfb0e7582e8ec3e6ae1838404
```

Observation: `git merge-tree --write-tree MAIN TIP` exit 1; result tree `7654f4f308eb4385e6a8cf57cabda418da123023`; 3 conflict messages.

```text
CONFLICT (content): Merge conflict in src/lib/features/fuse/components/FusePreviewStage.svelte
CONFLICT (content): Merge conflict in src/lib/features/fuse/components/FuseRecipeSettings.svelte
CONFLICT (content): Merge conflict in src/lib/features/fuse/components/FuseRelationshipComposer.svelte
```

Disposition: SUPERSEDED. Inference: Archive explicitly calls this prototype superseded; newer Fuse rule/recipe workspace commits and three content conflicts support replacement.

### codex/ghost-dispose-contract

Observation: tip `468a0a50b8156b97f81eb7bf8c7644f09c9536fa`; last commit `2026-10-07 Austen Cloud`; unique commits 2; cherry + / - = 0 / 1.

Observation: `git diff --stat MAIN...TIP` summary: `1 file changed, 10 insertions(+), 1 deletion(-)`.

Observation: top directories by net changed-file count (maximum eight): `tests/unit/effects` (1).

Observation: changed paths (first eight of 1): `tests/unit/effects/scene-effects-batching-contract.test.ts`.

Observation: main history since `2026-10-07`: 21 commits in touched directories; 2 commits in exact changed-file paths. Directory pathspecs (first eight of 1): `tests/unit/effects`.

Observation: directory-history sample (maximum six):

- `02d96b317c 2026-10-13 test: restore the Compose player strings and update the petal and ring tests`
- `edb399ca55 2026-10-12 feat(effects): 2D bubbles become soap film that matches 3D`
- `8100661426 2026-10-11 feat(effects): rebuild 2D Bloom as the 3D Bloom's light model`
- `6fcf77b201 2026-10-11 feat(effects): rebuild Zap as real lightning in 2D and 3D`
- `38b32380ae 2026-10-10 Merge main and preserve the consolidated 3D effect viewer`
- `9dbf4f7433 2026-10-10 feat(effects): let petals settle into a lasting ground carpet`

Observation: exact-file history sample (maximum six):

- `6fcf77b201 2026-10-11 feat(effects): rebuild Zap as real lightning in 2D and 3D`
- `b16285d688 2026-10-07 test(effects): follow Ghost per-mesh frost material disposal`

Observation: unique commit subjects (first 2 of 2):

- `468a0a50b8 Merge branch 'main' into codex/ghost-dispose-contract`
- `93ea66b338 test(effects): follow Ghost per-mesh frost material disposal`

Observation: cherry lines (first 15 of 1):

```text
- 93ea66b338c3d6dd389fe91a2f2e50bf731b8743
```

Disposition: DELETE-SAFE. Observation: every cherry patch is already on main; unique SHAs may include merges.

### codex/green-museum

Observation: tip `9d5b440312de79d575cb5761fec4c42d3b8704a3`; last commit `2026-09-07 Austen Cloud`; unique commits 1; cherry + / - = 1 / 0.

Observation: `git diff --stat MAIN...TIP` summary: `3 files changed, 34 insertions(+), 9 deletions(-)`.

Observation: top directories by net changed-file count (maximum eight): `tests/unit/museum` (2); `docs/superpowers/specs` (1).

Observation: changed paths (first eight of 3): `docs/superpowers/specs/2026-08-08-earth-root-chasm-blender-plan.json`, `tests/unit/museum/drowned-gallery-sightlines.test.ts`, `tests/unit/museum/earth-long-terrace-plan.test.ts`.

Observation: main history since `2026-09-07`: 256 commits in touched directories; 2 commits in exact changed-file paths. Directory pathspecs (first eight of 2): `docs/superpowers/specs`, `tests/unit/museum`.

Observation: directory-history sample (maximum six):

- `02f6ee82b4 2026-10-14 feat(history): add Gage DeMello's Eight Step to the archive`
- `bca00a3f23 2026-10-14 Merge branch 'main' into codex/three-levels-guide-spec`
- `e80970ec7f 2026-10-14 docs(spec): three ways to name a pattern guide page design`
- `ee9afcc474 2026-10-14 Merge branch 'main' into codex/boot-bar-self-timing`
- `6a5331f4db 2026-10-14 docs(boot): format the boot bar spec for prettier`
- `7e3cdafaeb 2026-10-14 feat(boot): time the boot bar from the last boot's milestones`

Observation: exact-file history sample (maximum six):

- `a97b743f05 2026-10-10 feat: migrate to SvelteKit 3, Vite 8 and TypeScript 6`
- `33933bd0d7 2026-09-07 fix(museum): clear the five stale museum tests, three ways`

Observation: unique commit subjects (first 1 of 1):

- `9d5b440312 test(museum): re-baseline the three guards the Cinder Court slice moved`

Observation: cherry lines (first 15 of 1):

```text
+ 9d5b440312de79d575cb5761fec4c42d3b8704a3
```

Observation: `git merge-tree --write-tree MAIN TIP` exit 1; result tree `c58f7d76a6e32d4b5c2c8c7ad1930503d00994e7`; 2 conflict messages.

```text
CONFLICT (content): Merge conflict in tests/unit/museum/drowned-gallery-sightlines.test.ts
CONFLICT (modify/delete): tests/unit/museum/earth-long-terrace-plan.test.ts deleted in 0dddc6bed3d885704db61479fe8ca77184a8baaa and modified in 9d5b440312de79d575cb5761fec4c42d3b8704a3.  Version 9d5b440312de79d575cb5761fec4c42d3b8704a3 of tests/unit/museum/earth-long-terrace-plan.test.ts left in tree.
```

Disposition: SUPERSEDED. Inference: Old museum guard re-baseline targets a retired Earth design; 33933bd0d7 deliberately deleted its test and replaced Water stand assumptions.

### codex/performer-paste-diagnostics

Observation: tip `87835dca49ec616cbdd77a38d2be7145f7b78504`; last commit `2026-10-12 Austen Cloud`; unique commits 1; cherry + / - = 0 / 1.

Observation: `git diff --stat MAIN...TIP` summary: `11 files changed, 523 insertions(+), 78 deletions(-)`.

Observation: top directories by net changed-file count (maximum eight): `src/lib/shared/3d` (8); `src/routes/test` (1); `tests/unit/3d-worker-renderer` (1); `tests/unit/3d` (1).

Observation: changed paths (first eight of 11): `src/lib/shared/3d/components/Viewer3DScene.svelte`, `src/lib/shared/3d/environments/scenes/BlossomScene.svelte`, `src/lib/shared/3d/environments/worlds/blossom/blossom-atmosphere.ts`, `src/lib/shared/3d/environments/worlds/blossom/blossom-environment-world.ts`, `src/lib/shared/3d/environments/worlds/blossom/blossom-lighting-rig.ts`, `src/lib/shared/3d/environments/worlds/blossom/blossom-river.ts`, `src/lib/shared/3d/environments/worlds/blossom/blossom-stage.ts`, `src/lib/shared/3d/state/performer-manager.svelte.ts`.

Observation: main history since `2026-10-12`: 1 commits in touched directories; 0 commits in exact changed-file paths. Directory pathspecs (first eight of 4): `src/lib/shared/3d`, `src/routes/test`, `tests/unit/3d`, `tests/unit/3d-worker-renderer`.

Observation: directory-history sample (maximum six):

- `b26b8b5c9e 2026-10-13 fix(motion): restore the timings the token sweep snapped`

Observation: unique commit subjects (first 1 of 1):

- `87835dca49 fix(3d): preserve garden and rendering through performer paste undo`

Observation: cherry lines (first 15 of 1):

```text
- 87835dca49ec616cbdd77a38d2be7145f7b78504
```

Disposition: DELETE-SAFE. Observation: every cherry patch is already on main; unique SHAs may include merges.

### codex/post-auto-color-shadows

Observation: tip `ca49fbe55c74d8a08ebf65fa1a81f2bd62996265`; last commit `2026-09-29 Austen Cloud`; unique commits 1; cherry + / - = 0 / 1.

Observation: `git diff --stat MAIN...TIP` summary: `2 files changed, 71 insertions(+), 17 deletions(-)`.

Observation: top directories by net changed-file count (maximum eight): `src/lib/shared/media-composition` (1); `tests/unit` (1).

Observation: changed paths (first eight of 2): `src/lib/shared/media-composition/domain/post-video-color-grade.ts`, `tests/unit/post-video-color-grade.test.ts`.

Observation: main history since `2026-09-29`: 796 commits in touched directories; 7 commits in exact changed-file paths. Directory pathspecs (first eight of 2): `src/lib/shared/media-composition`, `tests/unit`.

Observation: directory-history sample (maximum six):

- `a1614d829e 2026-10-14 Merge branch 'main' into codex/collection-picker-scale`
- `cb1d954c07 2026-10-14 feat(library): collection picker opens on a shelf, not the whole library`
- `b4ff2af586 2026-10-14 Merge branch 'main' into codex/eight-step-archive`
- `049b8c1780 2026-10-14 fix(learn): show topics on entry and restore live stars`
- `02f6ee82b4 2026-10-14 feat(history): add Gage DeMello's Eight Step to the archive`
- `4afa51c3a1 2026-10-14 Merge branch 'main' into codex/boot-bar-self-timing`

Observation: exact-file history sample (maximum six):

- `fe87fd3711 2026-10-09 test(post): move the tka-free video editor tests to the package`
- `17b2af0db0 2026-10-08 refactor(post): use the preset, plan and time-map core from @austencloud/video-editor`
- `9a90a41e84 2026-09-30 fix(post): Auto colour ignores sky that is already white`
- `93524c7b18 2026-09-30 fix(post): Auto colour matches InShot's Auto Adjust`
- `0707da1d41 2026-09-29 fix: preserve dark stages in Post Studio auto color`
- `b8a21b6fa7 2026-09-29 feat(post-studio): add manual video color controls`

Observation: unique commit subjects (first 1 of 1):

- `ca49fbe55c fix: preserve dark stages in Post Studio auto color`

Observation: cherry lines (first 15 of 1):

```text
- ca49fbe55c74d8a08ebf65fa1a81f2bd62996265
```

Disposition: DELETE-SAFE. Observation: every cherry patch is already on main; unique SHAs may include merges.

### codex/post-choreo-card-controls

Observation: tip `30b35f72c0dcccf669ff381215d00ee972921c85`; last commit `2026-09-29 Austen Cloud`; unique commits 1; cherry + / - = 0 / 1.

Observation: `git diff --stat MAIN...TIP` summary: `10 files changed, 285 insertions(+), 90 deletions(-)`.

Observation: top directories by net changed-file count (maximum eight): `src/lib/shared/share` (5); `src/lib/shared/media-composition` (2); `src/lib/shared/sequence-viewer` (2); `tests/unit/media-composition` (1).

Observation: changed paths (first eight of 10): `src/lib/shared/media-composition/domain/post-project-edits.ts`, `src/lib/shared/media-composition/domain/post-project.ts`, `src/lib/shared/sequence-viewer/components/ExportImagePanel.svelte`, `src/lib/shared/sequence-viewer/components/ViewerCompanionSurface.svelte`, `src/lib/shared/share/components/post-studio/PostStudioChoreoLayer.svelte`, `src/lib/shared/share/components/post-studio/editor/PostCardAppearanceTool.svelte`, `src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte`, `src/lib/shared/share/components/post-studio/editor/PostItemTool.svelte`.

Observation: main history since `2026-09-29`: 470 commits in touched directories; 174 commits in exact changed-file paths. Directory pathspecs (first eight of 4): `src/lib/shared/media-composition`, `src/lib/shared/sequence-viewer`, `src/lib/shared/share`, `tests/unit/media-composition`.

Observation: directory-history sample (maximum six):

- `bb84dce6cb 2026-10-13 Recompose the Save to Library panel for wide screens`
- `b26b8b5c9e 2026-10-13 fix(motion): restore the timings the token sweep snapped`
- `f0a1fe1efa 2026-10-12 Merge branch 'main' into codex/motion-r2`
- `7d1dfff785 2026-10-12 feat(motion): move viewer, 3D, video and public surfaces onto the shared clock`
- `d7e0048b86 2026-10-12 Merge branch 'main' into codex/cell-grid-join`
- `36670b70a1 2026-10-12 feat(studio): an arrangement cell can carry its own grid join`

Observation: exact-file history sample (maximum six):

- `b26b8b5c9e 2026-10-13 fix(motion): restore the timings the token sweep snapped`
- `f0a1fe1efa 2026-10-12 Merge branch 'main' into codex/motion-r2`
- `7d1dfff785 2026-10-12 feat(motion): move viewer, 3D, video and public surfaces onto the shared clock`
- `d7e0048b86 2026-10-12 Merge branch 'main' into codex/cell-grid-join`
- `36670b70a1 2026-10-12 feat(studio): an arrangement cell can carry its own grid join`
- `6de7881545 2026-10-12 refactor(motion): the Composer's owners come from @austencloud/motion`

Observation: unique commit subjects (first 1 of 1):

- `30b35f72c0 feat(post-studio): use viewer card controls for selected cards`

Observation: cherry lines (first 15 of 1):

```text
- 30b35f72c0dcccf669ff381215d00ee972921c85
```

Disposition: DELETE-SAFE. Observation: every cherry patch is already on main; unique SHAs may include merges.

### codex/post-effects-density

Observation: tip `3d198e58654e1c1ca6260e4e74d2cd2c55637068`; last commit `2026-09-29 Austen Cloud`; unique commits 2; cherry + / - = 0 / 1.

Observation: `git diff --stat MAIN...TIP` summary: `5 files changed, 17 insertions(+), 6 deletions(-)`.

Observation: top directories by net changed-file count (maximum eight): `messages` (2); `src/lib/shared/animation-engine` (1); `src/lib/shared/share` (1); `tests/unit/animation-engine` (1).

Observation: changed paths (first eight of 5): `messages/de.json`, `messages/en.json`, `src/lib/shared/animation-engine/domain/effect-catalog-fit.ts`, `src/lib/shared/share/components/post-studio/editor/PostStaffEffectsTool.svelte`, `tests/unit/animation-engine/effect-catalog-fit.test.ts`.

Observation: main history since `2026-09-29`: 485 commits in touched directories; 121 commits in exact changed-file paths. Directory pathspecs (first eight of 4): `messages`, `src/lib/shared/animation-engine`, `src/lib/shared/share`, `tests/unit/animation-engine`.

Observation: directory-history sample (maximum six):

- `ee7d2866dc 2026-10-14 Merge branch 'main' into codex/zans-diamond-guide`
- `9f686deea2 2026-10-14 feat(guide): Zan's Diamond page, one hand path and all 24 variations playable`
- `a1614d829e 2026-10-14 Merge branch 'main' into codex/collection-picker-scale`
- `cb1d954c07 2026-10-14 feat(library): collection picker opens on a shelf, not the whole library`
- `073b87b8c4 2026-10-14 fix(share): let a short landing scroll and shorten the people row`
- `b50b42a12b 2026-10-14 fix(inbox): share sheet landing icon, shorter people row, fuller hero`

Observation: exact-file history sample (maximum six):

- `ee7d2866dc 2026-10-14 Merge branch 'main' into codex/zans-diamond-guide`
- `9f686deea2 2026-10-14 feat(guide): Zan's Diamond page, one hand path and all 24 variations playable`
- `a1614d829e 2026-10-14 Merge branch 'main' into codex/collection-picker-scale`
- `cb1d954c07 2026-10-14 feat(library): collection picker opens on a shelf, not the whole library`
- `073b87b8c4 2026-10-14 fix(share): let a short landing scroll and shorten the people row`
- `b50b42a12b 2026-10-14 fix(inbox): share sheet landing icon, shorter people row, fuller hero`

Observation: unique commit subjects (first 2 of 2):

- `3d198e5865 fix(post-studio): compact video effect roster and clarify coverage`
- `483a8ecfdc Merge commit '98c6c2a0c3' into codex/post-effects-density`

Observation: cherry lines (first 15 of 1):

```text
- 3d198e58654e1c1ca6260e4e74d2cd2c55637068
```

Disposition: DELETE-SAFE. Observation: every cherry patch is already on main; unique SHAs may include merges.

### codex/post-inshot-adjustment-reference

Observation: tip `329b8e1daccae2cb359d9022c611a5eded33d056`; last commit `2026-09-29 Austen Cloud`; unique commits 1; cherry + / - = 0 / 1.

Observation: `git diff --stat MAIN...TIP` summary: `1 file changed, 32 insertions(+), 11 deletions(-)`.

Observation: top directories by net changed-file count (maximum eight): `src/lib/shared/share` (1).

Observation: changed paths (first eight of 1): `src/lib/shared/share/components/post-studio/editor/PostItemTool.svelte`.

Observation: main history since `2026-09-29`: 251 commits in touched directories; 44 commits in exact changed-file paths. Directory pathspecs (first eight of 1): `src/lib/shared/share`.

Observation: directory-history sample (maximum six):

- `bb84dce6cb 2026-10-13 Recompose the Save to Library panel for wide screens`
- `7d1dfff785 2026-10-12 feat(motion): move viewer, 3D, video and public surfaces onto the shared clock`
- `6de7881545 2026-10-12 refactor(motion): the Composer's owners come from @austencloud/motion`
- `b3b89842bf 2026-10-11 feat(video-editor): Studio arrangements run on the shared editor`
- `dc80268d85 2026-10-11 Merge tka main (SvelteKit 3, Studio arrangements) into codex/video-editor`
- `034044dce0 2026-10-11 feat(studio): Grid, Sequence, Layers and Offset panels for arrangements`

Observation: exact-file history sample (maximum six):

- `a8c19493cc 2026-10-11 refactor(post): Post Studio renders the package workspace`
- `d4e5599e03 2026-10-10 refactor(post): the editor's panels come from the package`
- `c39e3fb42d 2026-10-10 refactor(post): the editor's modules come from the package`
- `2e881cfa1e 2026-10-10 refactor(post): the editor UI draws package icons, reads ve tokens and uses the package popover`
- `9269c106a2 2026-10-10 refactor(post): the editor UI reads its strings through the package context`
- `57e091b9d5 2026-10-10 refactor(post): the item tool's TKA panels render from the plugin`

Observation: unique commit subjects (first 1 of 1):

- `329b8e1dac Clarify imported InShot adjustment reference`

Observation: cherry lines (first 15 of 1):

```text
- 329b8e1daccae2cb359d9022c611a5eded33d056
```

Disposition: DELETE-SAFE. Observation: every cherry patch is already on main; unique SHAs may include merges.

### codex/post-pip-appearance-followup

Observation: tip `324bccfaad3e447d5dd211045184131a3742ba7e`; last commit `2026-09-29 Austen Cloud`; unique commits 1; cherry + / - = 0 / 1.

Observation: `git diff --stat MAIN...TIP` summary: `3 files changed, 27 insertions(+), 4 deletions(-)`.

Observation: top directories by net changed-file count (maximum eight): `src/lib/shared/share` (2); `tests/unit/media-composition` (1).

Observation: changed paths (first eight of 3): `src/lib/shared/share/components/post-studio/editor/PostAnimationAppearanceTool.svelte`, `src/lib/shared/share/components/post-studio/editor/post-editor-tools.ts`, `tests/unit/media-composition/post-editor-tools.test.ts`.

Observation: main history since `2026-09-29`: 395 commits in touched directories; 54 commits in exact changed-file paths. Directory pathspecs (first eight of 2): `src/lib/shared/share`, `tests/unit/media-composition`.

Observation: directory-history sample (maximum six):

- `bb84dce6cb 2026-10-13 Recompose the Save to Library panel for wide screens`
- `f0a1fe1efa 2026-10-12 Merge branch 'main' into codex/motion-r2`
- `7d1dfff785 2026-10-12 feat(motion): move viewer, 3D, video and public surfaces onto the shared clock`
- `d7e0048b86 2026-10-12 Merge branch 'main' into codex/cell-grid-join`
- `36670b70a1 2026-10-12 feat(studio): an arrangement cell can carry its own grid join`
- `6de7881545 2026-10-12 refactor(motion): the Composer's owners come from @austencloud/motion`

Observation: exact-file history sample (maximum six):

- `c39e3fb42d 2026-10-10 refactor(post): the editor's modules come from the package`
- `6a60d3bc52 2026-10-10 refactor(post): tool rows, adds, labels, crop steps and the timeline join come from the plugin; the panels list library takes`
- `38c4dd9cfd 2026-10-10 refactor(post): the TKA layers and tools move under the plugin's ui folder`
- `32f1ee5675 2026-10-09 Merge main into codex/video-editor (step 2A sync)`
- `f1e68e07f7 2026-10-09 fix(theme): drop dead --theme-shadow color uses, restore broken backgrounds`
- `0a242bc1fd 2026-10-09 refactor(post): generic edits come from @austencloud/video-editor/core`

Observation: unique commit subjects (first 1 of 1):

- `324bccfaad fix(post-studio): show PiP appearance and scoped canvas theme`

Observation: cherry lines (first 15 of 1):

```text
- 324bccfaad3e447d5dd211045184131a3742ba7e
```

Disposition: DELETE-SAFE. Observation: every cherry patch is already on main; unique SHAs may include merges.

### codex/post-pip-render-fix

Observation: tip `dc7cedb46614c3efab77243512aa9285ca43be88`; last commit `2026-09-29 Austen Cloud`; unique commits 2; cherry + / - = 0 / 2.

Observation: `git diff --stat MAIN...TIP` summary: `14 files changed, 315 insertions(+), 14 deletions(-)`.

Observation: top directories by net changed-file count (maximum eight): `src/lib/shared/animation-engine` (5); `src/lib/shared/share` (4); `src/lib/shared/media-composition` (2); `tests/unit/media-composition` (2); `tests/unit/animation-engine` (1).

Observation: changed paths (first eight of 14): `src/lib/shared/animation-engine/domain/types/animation-render-types.ts`, `src/lib/shared/animation-engine/services/animation-render-loop.ts`, `src/lib/shared/animation-engine/services/canvas-2d-animation-renderer.ts`, `src/lib/shared/animation-engine/services/canvas2d/canvas-2d-grid-fade-manager.ts`, `src/lib/shared/animation-engine/services/canvas2d/canvas-2d-visibility-fade-manager.ts`, `src/lib/shared/media-composition/domain/post-project-compiler.ts`, `src/lib/shared/media-composition/services/post-studio-frame-compositor.ts`, `src/lib/shared/share/components/post-studio/PostStudioMediaLayer.svelte`.

Observation: main history since `2026-09-29`: 539 commits in touched directories; 218 commits in exact changed-file paths. Directory pathspecs (first eight of 5): `src/lib/shared/animation-engine`, `src/lib/shared/media-composition`, `src/lib/shared/share`, `tests/unit/animation-engine`, `tests/unit/media-composition`.

Observation: directory-history sample (maximum six):

- `bb84dce6cb 2026-10-13 Recompose the Save to Library panel for wide screens`
- `b26b8b5c9e 2026-10-13 fix(motion): restore the timings the token sweep snapped`
- `f779086787 2026-10-12 fix(ci): resolve release type-check errors`
- `fe4a53c583 2026-10-12 Merge branch 'main' into codex/motion-r2`
- `ecd5347998 2026-10-12 Merge branch 'main' into codex/motion-r1`
- `f0a1fe1efa 2026-10-12 Merge branch 'main' into codex/motion-r2`

Observation: exact-file history sample (maximum six):

- `3f0e5016b9 2026-10-12 feat(animation): overlaid layers share the sequence's joined grids`
- `139bd29335 2026-10-11 Merge main into codex/video-editor: arrangement phases 3 and 4 on the shared editor`
- `db023fcb94 2026-10-11 Merge branch 'main' into codex/arrangements-studio-p4`
- `cba90c9dc7 2026-10-11 feat(studio): Look, Effects, Effort and Speed panels for arrangements and cells`
- `a125483e24 2026-10-11 feat(arrangement): cells draw from the resolved appearance through per-cell effects state`
- `f96c1bc322 2026-10-11 Merge branch 'main' into codex/walkthrough-zoom`

Observation: unique commit subjects (first 2 of 2):

- `dc7cedb466 fix(animation): apply visibility immediately on virtual-time frames`
- `482c47708d fix(post-studio): render scoped Moves appearance in preview and export`

Observation: cherry lines (first 15 of 2):

```text
- 482c47708d5c52710373c073391c389595eb5e2a
- dc7cedb46614c3efab77243512aa9285ca43be88
```

Disposition: DELETE-SAFE. Observation: every cherry patch is already on main; unique SHAs may include merges.

### codex/post-pip-theme-hitarea

Observation: tip `1a13c84e5819a93f456e38a69da291f4f4fb4fcb`; last commit `2026-09-29 Austen Cloud`; unique commits 1; cherry + / - = 0 / 1.

Observation: `git diff --stat MAIN...TIP` summary: `1 file changed, 3 deletions(-)`.

Observation: top directories by net changed-file count (maximum eight): `src/lib/shared/share` (1).

Observation: changed paths (first eight of 1): `src/lib/shared/share/components/post-studio/editor/PostAnimationAppearanceTool.svelte`.

Observation: main history since `2026-09-29`: 251 commits in touched directories; 41 commits in exact changed-file paths. Directory pathspecs (first eight of 1): `src/lib/shared/share`.

Observation: directory-history sample (maximum six):

- `bb84dce6cb 2026-10-13 Recompose the Save to Library panel for wide screens`
- `7d1dfff785 2026-10-12 feat(motion): move viewer, 3D, video and public surfaces onto the shared clock`
- `6de7881545 2026-10-12 refactor(motion): the Composer's owners come from @austencloud/motion`
- `b3b89842bf 2026-10-11 feat(video-editor): Studio arrangements run on the shared editor`
- `dc80268d85 2026-10-11 Merge tka main (SvelteKit 3, Studio arrangements) into codex/video-editor`
- `034044dce0 2026-10-11 feat(studio): Grid, Sequence, Layers and Offset panels for arrangements`

Observation: exact-file history sample (maximum six):

- `38c4dd9cfd 2026-10-10 refactor(post): the TKA layers and tools move under the plugin's ui folder`
- `32f1ee5675 2026-10-09 Merge main into codex/video-editor (step 2A sync)`
- `f1e68e07f7 2026-10-09 fix(theme): drop dead --theme-shadow color uses, restore broken backgrounds`
- `0a242bc1fd 2026-10-09 refactor(post): generic edits come from @austencloud/video-editor/core`
- `f47b36a76b 2026-10-08 refactor(post): tka item kinds and fields as a video editor plugin`
- `8d883cfe97 2026-10-06 feat(prop-picker): name prop versions V1 and V2`

Observation: unique commit subjects (first 1 of 1):

- `1a13c84e58 fix(post-studio): keep appearance controls clear of section rail`

Observation: cherry lines (first 15 of 1):

```text
- 1a13c84e5819a93f456e38a69da291f4f4fb4fcb
```

Disposition: DELETE-SAFE. Observation: every cherry patch is already on main; unique SHAs may include merges.

### codex/post-prop-picker-size

Observation: tip `5e50b64aee9a4f2185d53f4c3b1de3a4d6d7eb23`; last commit `2026-09-29 Austen Cloud`; unique commits 2; cherry + / - = 0 / 1.

Observation: `git diff --stat MAIN...TIP` summary: `1 file changed, 1 insertion(+)`.

Observation: top directories by net changed-file count (maximum eight): `src/lib/shared/share` (1).

Observation: changed paths (first eight of 1): `src/lib/shared/share/components/post-studio/editor/PostAnimationAppearanceTool.svelte`.

Observation: main history since `2026-09-29`: 251 commits in touched directories; 41 commits in exact changed-file paths. Directory pathspecs (first eight of 1): `src/lib/shared/share`.

Observation: directory-history sample (maximum six):

- `bb84dce6cb 2026-10-13 Recompose the Save to Library panel for wide screens`
- `7d1dfff785 2026-10-12 feat(motion): move viewer, 3D, video and public surfaces onto the shared clock`
- `6de7881545 2026-10-12 refactor(motion): the Composer's owners come from @austencloud/motion`
- `b3b89842bf 2026-10-11 feat(video-editor): Studio arrangements run on the shared editor`
- `dc80268d85 2026-10-11 Merge tka main (SvelteKit 3, Studio arrangements) into codex/video-editor`
- `034044dce0 2026-10-11 feat(studio): Grid, Sequence, Layers and Offset panels for arrangements`

Observation: exact-file history sample (maximum six):

- `38c4dd9cfd 2026-10-10 refactor(post): the TKA layers and tools move under the plugin's ui folder`
- `32f1ee5675 2026-10-09 Merge main into codex/video-editor (step 2A sync)`
- `f1e68e07f7 2026-10-09 fix(theme): drop dead --theme-shadow color uses, restore broken backgrounds`
- `0a242bc1fd 2026-10-09 refactor(post): generic edits come from @austencloud/video-editor/core`
- `f47b36a76b 2026-10-08 refactor(post): tka item kinds and fields as a video editor plugin`
- `8d883cfe97 2026-10-06 feat(prop-picker): name prop versions V1 and V2`

Observation: unique commit subjects (first 2 of 2):

- `5e50b64aee fix(post-studio): enlarge appearance prop tiles`
- `b1e2241736 Merge commit '98c6c2a0c3' into codex/post-prop-picker-size`

Observation: cherry lines (first 15 of 1):

```text
- 5e50b64aee9a4f2185d53f4c3b1de3a4d6d7eb23
```

Disposition: DELETE-SAFE. Observation: every cherry patch is already on main; unique SHAs may include merges.

### codex/post-sequence-durable-save

Observation: tip `06c9764bde8e301e2d36db4fe1114ff46a85efa7`; last commit `2026-09-29 Austen Cloud`; unique commits 1; cherry + / - = 0 / 1.

Observation: `git diff --stat MAIN...TIP` summary: `2 files changed, 83 insertions(+), 16 deletions(-)`.

Observation: top directories by net changed-file count (maximum eight): `src/lib/shared/sequence-viewer` (1); `tests/unit/media-composition` (1).

Observation: changed paths (first eight of 2): `src/lib/shared/sequence-viewer/components/PostStudioPane.svelte`, `tests/unit/media-composition/post-draft-storage.test.ts`.

Observation: main history since `2026-09-29`: 347 commits in touched directories; 12 commits in exact changed-file paths. Directory pathspecs (first eight of 2): `src/lib/shared/sequence-viewer`, `tests/unit/media-composition`.

Observation: directory-history sample (maximum six):

- `b26b8b5c9e 2026-10-13 fix(motion): restore the timings the token sweep snapped`
- `f0a1fe1efa 2026-10-12 Merge branch 'main' into codex/motion-r2`
- `7d1dfff785 2026-10-12 feat(motion): move viewer, 3D, video and public surfaces onto the shared clock`
- `d7e0048b86 2026-10-12 Merge branch 'main' into codex/cell-grid-join`
- `36670b70a1 2026-10-12 feat(studio): an arrangement cell can carry its own grid join`
- `6de7881545 2026-10-12 refactor(motion): the Composer's owners come from @austencloud/motion`

Observation: exact-file history sample (maximum six):

- `dc80268d85 2026-10-11 Merge tka main (SvelteKit 3, Studio arrangements) into codex/video-editor`
- `7e721647c6 2026-10-11 feat(post): Post renders the package VideoEditor inside the TKA scope`
- `c39e3fb42d 2026-10-10 refactor(post): the editor's modules come from the package`
- `57bbda4996 2026-10-10 fix(studio): keep cloud saves and retries inside the account that edited`
- `12cdafc8af 2026-10-10 fix(studio): let software showcases start without a sequence`
- `a97b743f05 2026-10-10 feat: migrate to SvelteKit 3, Vite 8 and TypeScript 6`

Observation: unique commit subjects (first 1 of 1):

- `06c9764bde fix: persist Post Studio drafts from sequence viewer`

Observation: cherry lines (first 15 of 1):

```text
- 06c9764bde8e301e2d36db4fe1114ff46a85efa7
```

Disposition: DELETE-SAFE. Observation: every cherry patch is already on main; unique SHAs may include merges.

### codex/post-studio-header

Observation: tip `4f7921ea12944d401766a778cde36a8f8d1e01b3`; last commit `2026-09-29 Austen Cloud`; unique commits 1; cherry + / - = 0 / 1.

Observation: `git diff --stat MAIN...TIP` summary: `3 files changed, 115 insertions(+), 85 deletions(-)`.

Observation: top directories by net changed-file count (maximum eight): `src/lib/shared/share` (3).

Observation: changed paths (first eight of 3): `src/lib/shared/share/components/post-studio/editor/PostDraftStatus.svelte`, `src/lib/shared/share/components/post-studio/editor/PostEditorTopBar.svelte`, `src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte`.

Observation: main history since `2026-09-29`: 251 commits in touched directories; 107 commits in exact changed-file paths. Directory pathspecs (first eight of 1): `src/lib/shared/share`.

Observation: directory-history sample (maximum six):

- `bb84dce6cb 2026-10-13 Recompose the Save to Library panel for wide screens`
- `7d1dfff785 2026-10-12 feat(motion): move viewer, 3D, video and public surfaces onto the shared clock`
- `6de7881545 2026-10-12 refactor(motion): the Composer's owners come from @austencloud/motion`
- `b3b89842bf 2026-10-11 feat(video-editor): Studio arrangements run on the shared editor`
- `dc80268d85 2026-10-11 Merge tka main (SvelteKit 3, Studio arrangements) into codex/video-editor`
- `034044dce0 2026-10-11 feat(studio): Grid, Sequence, Layers and Offset panels for arrangements`

Observation: exact-file history sample (maximum six):

- `a8c19493cc 2026-10-11 refactor(post): Post Studio renders the package workspace`
- `8d34d83111 2026-10-11 refactor(post): the workspace types its editor as the package state and takes the host`
- `d4e5599e03 2026-10-10 refactor(post): the editor's panels come from the package`
- `c39e3fb42d 2026-10-10 refactor(post): the editor's modules come from the package`
- `2e881cfa1e 2026-10-10 refactor(post): the editor UI draws package icons, reads ve tokens and uses the package popover`
- `12e7ab7a34 2026-10-10 refactor(post): the media and export panels read take status and timing steps from the plugin`

Observation: unique commit subjects (first 1 of 1):

- `4f7921ea12 feat(post-studio): compact inspector header actions`

Observation: cherry lines (first 15 of 1):

```text
- 4f7921ea12944d401766a778cde36a8f8d1e01b3
```

Disposition: DELETE-SAFE. Observation: every cherry patch is already on main; unique SHAs may include merges.

### codex/post-studio-rebuild

Observation: tip `c2f6768f6dc2f44fb507a95a3a53cbef14d2f011`; last commit `2026-09-25 Austen Cloud`; unique commits 6; cherry + / - = 1 / 0.

Observation: `git diff --stat MAIN...TIP` summary: `(no diff)`.

Observation: diff stderr: `warning: 0dddc6bed3d885704db61479fe8ca77184a8baaa...c2f6768f6dc2f44fb507a95a3a53cbef14d2f011: multiple merge bases, using fd665fbb37635e31b4aa34e274f68ff1a8f5d57b`.

Observation: net diff is empty; no net-touched directory or exact-file history query applies.

Observation: non-merge unique-history paths despite empty net diff: `src/lib/features/admin/components/ActiveUsersPanel.svelte`, `src/lib/features/choreo-card/components/scan-activity/ScanActivityTab.svelte`, `src/lib/features/community/Community.svelte`, `src/lib/features/community/get-geocoding-service.ts`, `src/lib/features/creators/components/CreatorsPanel.svelte`, `src/lib/features/festivals/components/map/FestivalMap.svelte`, `src/lib/shared/maps/google-maps-api-key.ts`.

Observation: unique commit subjects (first 6 of 6):

- `c2f6768f6d Merge the Post Studio tutorial-builder rebuild onto the sync branch`
- `16c25f1327 fix(maps): let builds without a Maps key succeed`
- `c4c8c0f344 Merge branch 'main' into codex/sync-main-0924`
- `8540adb7e2 Merge branch 'main' into codex/sync-main-0924`
- `9f4abc8935 Merge branch 'main' into codex/sync-main-0924`
- `62a0ae4834 Merge remote-tracking branch 'origin/main' into codex/sync-main-0924`

Observation: cherry lines (first 15 of 1):

```text
+ 16c25f13275d178e08d40edbc0d9c906b678374d
```

Observation: `git merge-tree --write-tree MAIN TIP` exit 0; result tree `6d0cf4f4cca2f77be793fa65ac2f30ba5e798744`; 0 conflict messages.

Disposition: UNKNOWN. Observation/unknown: Ambiguous history: one cherry + (Maps-key fix), six unique SHAs, empty three-dot diff with multiple merge bases; missing merge-resolution/effective-patch comparison.

### codex/post-timeline-layout

Observation: tip `e68ebe44ec7146ffeafe5f62844ed9ed840b17b7`; last commit `2026-09-29 Austen Cloud`; unique commits 2; cherry + / - = 0 / 2.

Observation: `git diff --stat MAIN...TIP` summary: `4 files changed, 327 insertions(+), 168 deletions(-)`.

Observation: top directories by net changed-file count (maximum eight): `src/lib/shared/share` (4).

Observation: changed paths (first eight of 4): `src/lib/shared/share/components/post-studio/editor/PostDraftStatus.svelte`, `src/lib/shared/share/components/post-studio/editor/PostEditorTopBar.svelte`, `src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte`, `src/lib/shared/share/components/post-studio/editor/timeline/PostTimeline.svelte`.

Observation: main history since `2026-09-29`: 251 commits in touched directories; 114 commits in exact changed-file paths. Directory pathspecs (first eight of 1): `src/lib/shared/share`.

Observation: directory-history sample (maximum six):

- `bb84dce6cb 2026-10-13 Recompose the Save to Library panel for wide screens`
- `7d1dfff785 2026-10-12 feat(motion): move viewer, 3D, video and public surfaces onto the shared clock`
- `6de7881545 2026-10-12 refactor(motion): the Composer's owners come from @austencloud/motion`
- `b3b89842bf 2026-10-11 feat(video-editor): Studio arrangements run on the shared editor`
- `dc80268d85 2026-10-11 Merge tka main (SvelteKit 3, Studio arrangements) into codex/video-editor`
- `034044dce0 2026-10-11 feat(studio): Grid, Sequence, Layers and Offset panels for arrangements`

Observation: exact-file history sample (maximum six):

- `a8c19493cc 2026-10-11 refactor(post): Post Studio renders the package workspace`
- `8d34d83111 2026-10-11 refactor(post): the workspace types its editor as the package state and takes the host`
- `d4e5599e03 2026-10-10 refactor(post): the editor's panels come from the package`
- `c39e3fb42d 2026-10-10 refactor(post): the editor's modules come from the package`
- `2e881cfa1e 2026-10-10 refactor(post): the editor UI draws package icons, reads ve tokens and uses the package popover`
- `12e7ab7a34 2026-10-10 refactor(post): the media and export panels read take status and timing steps from the plugin`

Observation: unique commit subjects (first 2 of 2):

- `e68ebe44ec feat(post-studio): compact timeline controls and enable split resizing`
- `4f7921ea12 feat(post-studio): compact inspector header actions`

Observation: cherry lines (first 15 of 2):

```text
- 4f7921ea12944d401766a778cde36a8f8d1e01b3
- e68ebe44ec7146ffeafe5f62844ed9ed840b17b7
```

Disposition: DELETE-SAFE. Observation: every cherry patch is already on main; unique SHAs may include merges.

### codex/svelte-compile-gate

Observation: tip `b1234b9fbe007886e0e1be4006aca32c6478ed54`; last commit `2026-09-26 Austen Cloud`; unique commits 2; cherry + / - = 0 / 1.

Observation: `git diff --stat MAIN...TIP` summary: `3 files changed, 437 insertions(+), 1 deletion(-)`.

Observation: top directories by net changed-file count (maximum eight): `scripts` (2); `tests/unit/scripts` (1).

Observation: changed paths (first eight of 3): `scripts/svelte-compile-gate.mjs`, `scripts/worktree-automerge.mjs`, `tests/unit/scripts/svelte-compile-gate.test.ts`.

Observation: main history since `2026-09-26`: 120 commits in touched directories; 6 commits in exact changed-file paths. Directory pathspecs (first eight of 2): `scripts`, `tests/unit/scripts`.

Observation: directory-history sample (maximum six):

- `9f686deea2 2026-10-14 feat(guide): Zan's Diamond page, one hand path and all 24 variations playable`
- `c756becdd7 2026-10-14 Merge branch 'main' into codex/zans-diamond-variations`
- `d94460e324 2026-10-14 feat(scripts): write Zan's Diamond variations into the public collection`
- `40a42f0c0a 2026-10-14 fix(tests): keep the compile-gate fixture's git identity inside its temp repo`
- `000f386760 2026-10-14 fix(buugeng): author the GLB long axis as the tip-to-tip chord`
- `c5cf27eb89 2026-10-13 fix(ota): read the live site's public settings from /public-settings.json`

Observation: exact-file history sample (maximum six):

- `40a42f0c0a 2026-10-14 fix(tests): keep the compile-gate fixture's git identity inside its temp repo`
- `983cb069f1 2026-10-10 fix: settle the three suite failures the Vite 8 upgrade exposed`
- `a97b743f05 2026-10-10 feat: migrate to SvelteKit 3, Vite 8 and TypeScript 6`
- `eef57f02c0 2026-10-01 docs(worktrees): explain compile guard without stale incident claims`
- `824252d048 2026-10-01 fix(worktrees): compile changed components before finishing`
- `45a086954b 2026-10-01 fix(worktree): guard linked paths before removal`

Observation: unique commit subjects (first 2 of 2):

- `b1234b9fbe Merge branch 'main' into codex/svelte-compile-gate`
- `7c1f591490 fix(worktrees): compile changed components before finishing`

Observation: cherry lines (first 15 of 1):

```text
- 7c1f591490df4a67e7be101bfb9a67ac1f4154ea
```

Disposition: DELETE-SAFE. Observation: every cherry patch is already on main; unique SHAs may include merges.

### codex/sync-main-0924

Observation: tip `c4c8c0f3449cd0fe3a7786b5ae38bb16f7b47a1c`; last commit `2026-09-25 Austen Cloud`; unique commits 4; cherry + / - = 0 / 0.

Observation: `git diff --stat MAIN...TIP` summary: `(no diff)`.

Observation: diff stderr: `warning: 0dddc6bed3d885704db61479fe8ca77184a8baaa...c4c8c0f3449cd0fe3a7786b5ae38bb16f7b47a1c: multiple merge bases, using fd665fbb37635e31b4aa34e274f68ff1a8f5d57b`.

Observation: net diff is empty; no net-touched directory or exact-file history query applies.

Observation: unique commit subjects (first 4 of 4):

- `c4c8c0f344 Merge branch 'main' into codex/sync-main-0924`
- `8540adb7e2 Merge branch 'main' into codex/sync-main-0924`
- `9f4abc8935 Merge branch 'main' into codex/sync-main-0924`
- `62a0ae4834 Merge remote-tracking branch 'origin/main' into codex/sync-main-0924`

Disposition: UNKNOWN. Observation/unknown: Four unique merge commits, no cherry lines and empty three-dot diff with multiple merge bases; merge resolutions are not covered by cherry.

### codex/sync-main-0925

Observation: tip `2c249e35d7daaad54176c5e01237e1d84158beb5`; last commit `2026-09-25 Austen Cloud`; unique commits 5; cherry + / - = 0 / 2.

Observation: `git diff --stat MAIN...TIP` summary: `8 files changed, 49 insertions(+), 19 deletions(-)`.

Observation: diff stderr: `warning: 0dddc6bed3d885704db61479fe8ca77184a8baaa...2c249e35d7daaad54176c5e01237e1d84158beb5: multiple merge bases, using 9e25291485a466a2f9c01bb8bb6a835b0e0980ff`.

Observation: top directories by net changed-file count (maximum eight): `src/lib/features/community` (2); `packages/sequence-engine/tests` (1); `src/lib/features/admin` (1); `src/lib/features/choreo-card` (1); `src/lib/features/creators` (1); `src/lib/features/festivals` (1); `src/lib/shared/maps` (1).

Observation: changed paths (first eight of 8): `packages/sequence-engine/tests/generation/overlay-seed-reroll.test.ts`, `src/lib/features/admin/components/ActiveUsersPanel.svelte`, `src/lib/features/choreo-card/components/scan-activity/ScanActivityTab.svelte`, `src/lib/features/community/Community.svelte`, `src/lib/features/community/get-geocoding-service.ts`, `src/lib/features/creators/components/CreatorsPanel.svelte`, `src/lib/features/festivals/components/map/FestivalMap.svelte`, `src/lib/shared/maps/google-maps-api-key.ts`.

Observation: main history since `2026-09-25`: 31 commits in touched directories; 10 commits in exact changed-file paths. Directory pathspecs (first eight of 7): `packages/sequence-engine/tests`, `src/lib/features/admin`, `src/lib/features/choreo-card`, `src/lib/features/community`, `src/lib/features/creators`, `src/lib/features/festivals`, `src/lib/shared/maps`.

Observation: directory-history sample (maximum six):

- `c96c0bcc2c 2026-10-12 Merge branch 'main' into codex/motion-r5`
- `c051107bec 2026-10-12 Merge branch 'main' into codex/motion-r4`
- `7d1dfff785 2026-10-12 feat(motion): move viewer, 3D, video and public surfaces onto the shared clock`
- `b44d0acb4c 2026-10-12 feat(motion): align stage, library, premium, community, and support surfaces`
- `007426ad92 2026-10-12 feat(motion): align shared foundations, components, creators, and connect`
- `6cd4ab6a8f 2026-10-12 feat(motion): align store, Tika, navigation, inbox, browse, and festivals`

Observation: exact-file history sample (maximum six):

- `c96c0bcc2c 2026-10-12 Merge branch 'main' into codex/motion-r5`
- `b44d0acb4c 2026-10-12 feat(motion): align stage, library, premium, community, and support surfaces`
- `6cd4ab6a8f 2026-10-12 feat(motion): align store, Tika, navigation, inbox, browse, and festivals`
- `605e581c05 2026-10-12 feat(motion): lab, feedback, admin and settings use the shared motion clock`
- `6de7881545 2026-10-12 refactor(motion): the Composer's owners come from @austencloud/motion`
- `a97b743f05 2026-10-10 feat: migrate to SvelteKit 3, Vite 8 and TypeScript 6`

Observation: unique commit subjects (first 5 of 5):

- `2c249e35d7 test(engine): tolerate the feasibility limit in the overlay re-roll test`
- `16c25f1327 fix(maps): let builds without a Maps key succeed`
- `8540adb7e2 Merge branch 'main' into codex/sync-main-0924`
- `9f4abc8935 Merge branch 'main' into codex/sync-main-0924`
- `62a0ae4834 Merge remote-tracking branch 'origin/main' into codex/sync-main-0924`

Observation: cherry lines (first 15 of 2):

```text
- 16c25f13275d178e08d40edbc0d9c906b678374d
- 2c249e35d7daaad54176c5e01237e1d84158beb5
```

Disposition: DELETE-SAFE. Observation: every cherry patch is already on main; unique SHAs may include merges.

### codex/video-editor

Observation: tip `f83d23b46c19de9c79789ee001da82a2fba1c8ca`; last commit `2026-10-11 Austen Cloud`; unique commits 0; cherry + / - = 0 / 0.

Observation: `git diff --stat MAIN...TIP` summary: `(no diff)`.

Observation: net diff is empty; no net-touched directory or exact-file history query applies.

Disposition: DELETE-SAFE. Observation: zero unique commits; tip is reachable from baseline main.

### Replacement evidence for SUPERSEDED

Observation: `git show --format=fuller --stat codex/fuse-recipe-stage` identifies `406e4f0660` (2026-09-03), subject `chore(archive): preserve superseded Fuse recipe prototype`. Main subsequently changed `FuseRelationshipComposer.svelte` in `57e911b787` (responsive hierarchy), `e11697c68f` (recipe panel persistence), `3fcb8b4b9c` (rule editor pane/result framing), and `51ad11d812` (Invert/Rewind switches). The branch conflicts in FusePreviewStage, FuseRecipeSettings and FuseRelationshipComposer. Inference: the archived recipe-column implementation was replaced; preserve its handoff/design if historical intent is needed.

Observation: `git show --stat 33933bd0d7` identifies the 2026-09-07 main change `fix(museum): clear the five stale museum tests, three ways`. Its commit message explicitly retires Earth Root Chasm and Long Terrace designs, deletes `tests/unit/museum/earth-long-terrace-plan.test.ts`, and derives Water stand position from thresholdOpening instead of restamping old coordinates. The green-museum branch conflicts in the Water sightline test and attempts to modify the deleted Earth test. Inference: re-baselining those old guards no longer fits the current design.

Observation: current Post integration also changed ownership: `f47b36a76b` (2026-10-08) extracted the old post-project owner into a video-editor plugin, and `a8c19493cc` (2026-10-11) switched Post Studio to the package workspace. Post SALVAGE verdicts preserve behavioral ideas rather than asserting obsolete files should return. Their conflict lines document deleted owners.

## Remote-only refs

Observation: 57 stored remote-tracking refs have no local branch of the same name after removing the remote prefix. Dates are each stored tip's committer date; no fetch was performed, so remote existence/freshness is unverified. `origin/HEAD -> origin/main` is a symbolic alias, not a branch, and is omitted. `local-main` is a nonstandard ref under refs/remotes and is included literally. Remote main refs have a local main counterpart and are excluded.

- `d2/codex/effect-label-contrast` — 2026-10-11; tip `fe575e2deecf52b170be6d2db129c27802426eb7`.
- `d2/codex/effect-quick-switch` — 2026-10-10; tip `4d15073a2c8418da65f1547033d335f8daa58d78`.
- `d2/codex/effect-strip-polish` — 2026-10-11; tip `ae92e6b13b0f5e858a3f45af7573cad0e2d963aa`.
- `d2/d2-run/03e1709f75` — 2026-10-12; tip `03e1709f75d0ee961868bfa6734cbabd260fb265`.
- `d2/d2-run/0cdb506cbd` — 2026-10-13; tip `0cdb506cbdc2a301313bf37199d2cbb524e32e32`.
- `d2/d2-run/0e5a02272c` — 2026-10-12; tip `0e5a02272cb86f0de5359ec9ddfbc61d5ad33c7b`.
- `d2/d2-run/144df0e6ba` — 2026-10-14; tip `144df0e6ba098f7c08bdbaed11e1d06982e42857`.
- `d2/d2-run/246fb44a63` — 2026-10-10; tip `246fb44a63bb87c4c5d26dc1ef23eaf85183cf9b`.
- `d2/d2-run/288c2ff7d02f371c52bf26c7e0bed12cc31e9b1f` — 2026-10-12; tip `288c2ff7d02f371c52bf26c7e0bed12cc31e9b1f`.
- `d2/d2-run/2cd3ed2e8d` — 2026-10-12; tip `2cd3ed2e8de01455ba09a1e3c7bf57a66fbb8136`.
- `d2/d2-run/34de2660f8` — 2026-10-10; tip `34de2660f873b92fbfb31d4b68bcbda50f8bfad5`.
- `d2/d2-run/38e1004b38` — 2026-10-14; tip `38e1004b38f42de54db394611a2b51cfdb625c63`.
- `d2/d2-run/3923912cbb` — 2026-10-13; tip `3923912cbb24756da746d5fc6d0b8474a6cc6f59`.
- `d2/d2-run/3d3d07cb37` — 2026-10-14; tip `3d3d07cb376a2c8b3eb3822293f8bbf57bedd9e3`.
- `d2/d2-run/3e02687d08` — 2026-10-12; tip `3e02687d082fb50ef295428c3cfbcd6e710d12fa`.
- `d2/d2-run/3f186b87a5` — 2026-10-12; tip `3f186b87a5951f28df252381e2014a72d276da1c`.
- `d2/d2-run/4153855bb2` — 2026-10-13; tip `4153855bb20a3d73d7daa49145ca819b87ff5499`.
- `d2/d2-run/4e81b2d3bb` — 2026-10-10; tip `4e81b2d3bbc95bb4f504bedeb9647a2ac2f9596e`.
- `d2/d2-run/50a48f2c44` — 2026-10-13; tip `50a48f2c44382efbf8a38b8a21384d26d6f2784a`.
- `d2/d2-run/5a246d9d05` — 2026-10-14; tip `5a246d9d050d7372dc6e414895faad4af342f128`.
- `d2/d2-run/7073a3bad6` — 2026-10-13; tip `7073a3bad6e43dfd5eeb3d5bef440674b0a7149a`.
- `d2/d2-run/7296386963` — 2026-10-13; tip `729638696395fd02c1f6c0a455b9a89fd0f7c952`.
- `d2/d2-run/7b082ed521` — 2026-10-13; tip `7b082ed521ba1a7d42989ecf19e5a32a7a413ebb`.
- `d2/d2-run/7ea83ddf20` — 2026-10-12; tip `7ea83ddf20e72f894a2ad9d2cb9478d7c8e31c6d`.
- `d2/d2-run/88941e605d` — 2026-10-13; tip `88941e605de531fa74df1235fe9fee40448e047d`.
- `d2/d2-run/93406c93d0` — 2026-10-12; tip `93406c93d03ded113e0c1e93f508e36fa7f939e5`.
- `d2/d2-run/986a2c3733` — 2026-10-12; tip `986a2c37339391dc1b954fbf34ba043fdec1620e`.
- `d2/d2-run/9c6acb6f131c37eff39142c1a6b2433c5c1632ec` — 2026-10-12; tip `9c6acb6f131c37eff39142c1a6b2433c5c1632ec`.
- `d2/d2-run/9d7521509d` — 2026-10-10; tip `9d7521509d33210ee5819c42974ff30454b416ca`.
- `d2/d2-run/a14c70af83` — 2026-10-11; tip `a14c70af83372641cc28b60aa98c5f583fc4384c`.
- `d2/d2-run/a16610f6a3` — 2026-10-14; tip `a16610f6a3e055df6373f20d3c7b0d04cab9d139`.
- `d2/d2-run/ab6d69cfc9` — 2026-10-12; tip `ab6d69cfc90f73bf771cb28feaaabb1281281f33`.
- `d2/d2-run/ae78921df7` — 2026-10-12; tip `ae78921df7159162ec46c0e03014029acbcc2e62`.
- `d2/d2-run/ba472f4a49` — 2026-10-13; tip `ba472f4a498dd07201eb4b46921e4584bdb613d5`.
- `d2/d2-run/c2a118fe8a` — 2026-10-13; tip `c2a118fe8a47fe573e373a30b0463b0341139eb2`.
- `d2/d2-run/cb7148a91d` — 2026-10-12; tip `cb7148a91d2322118029c38b53750b1de2e422c5`.
- `d2/d2-run/cbf647ff6e` — 2026-10-12; tip `cbf647ff6efd3359200f81bce6dd8a2a0d9f97a3`.
- `d2/d2-run/cc5c65f328` — 2026-10-13; tip `cc5c65f328f5d6e484a102f7ddb84ad9a97c9414`.
- `d2/d2-run/cc97755dca` — 2026-10-12; tip `cc97755dcae0e890e80924b67a17fb3fa0d3cbae`.
- `d2/d2-run/dc1a7a5af8` — 2026-10-12; tip `dc1a7a5af8a2467ffadb57a4ce00395dea779545`.
- `d2/d2-run/de7a7a15e2` — 2026-10-12; tip `de7a7a15e2082a886eb7a1a15a17dfe962bbdc93`.
- `d2/d2-run/e62109cac0` — 2026-10-13; tip `e62109cac0cea7e67a01ebc5ff86fc1244818e0c`.
- `d2/d2-run/e700c9bee6` — 2026-10-14; tip `e700c9bee65c25198a9d2ec13c8e8ceb3ef02cb7`.
- `d2/d2-run/f024bbcd787bdd00d32b7adf060159440bced046` — 2026-10-12; tip `f024bbcd787bdd00d32b7adf060159440bced046`.
- `d2/d2-run/f509ece610` — 2026-10-12; tip `f509ece6108320776dd6a38d502bf35856dfbfd4`.
- `d2/d2-run/f5c1c84ff8` — 2026-10-13; tip `f5c1c84ff89e5a0c298221a7deb3ca397be9dd09`.
- `d2/incoming/effect-label-contrast` — 2026-10-11; tip `5cfe3fe323debef9f68fdc8e03d372afaa7839fd`.
- `d2/preview/effect-strip-polish` — 2026-10-11; tip `450e7e6290d93e80ef33e579ad5a08b60bf8c016`.
- `local-main` — 2026-10-06; tip `19b35695497a096714a3b0eb4787c996838f3cf4`.
- `origin/claude/accessibility-audit-shared-components-ma20hf` — 2026-09-13; tip `12784c4653082f4ee1b0610cab9f8f98f694f875`.
- `origin/claude/firebase-security-audit-03y1e7` — 2026-09-13; tip `1c54307d5ccd5d71cc8803c49050a3f3d14c2256`.
- `origin/claude/fix-export-lifecycle-issues-y7c45a` — 2026-09-13; tip `f8440e39995f45eaed54f35ef75c4bda80600bab`.
- `origin/claude/fuse-sequence-composition-fix-smdu2c` — 2026-09-13; tip `b862a08dd8f7a1788086e91299d2effb5b212f5d`.
- `origin/claude/guest-save-audit-iyayl1` — 2026-09-13; tip `a75cafa80480807857ab5c78066504d9b4d64f34`.
- `origin/claude/persistence-roundtrip-audit-uy8go8` — 2026-09-13; tip `8ad7f45a0194ea29a08cc717f91c6e5b1bd7deda`.
- `origin/claude/startup-performance-1h87b8` — 2026-09-13; tip `01dd04cfb3c5c80741f2a2ca417be83aad27b22c`.
- `origin/claude/thumbnail-latency-audit-1bmwwq` — 2026-09-13; tip `109163cd2cb1a15571fe2bb3f1b7c8510f52c383`.

## Skipped

- `claude/compassionate-rubin-4c9ecc` — checked out in a worktree.
- `claude/determined-panini-ecbc34` — checked out in a worktree.
- `claude/exciting-davinci-8b58b3` — checked out in a worktree.
- `claude/exciting-liskov-8c0ad2` — checked out in a worktree.
- `claude/gallant-elgamal-35065a` — checked out in a worktree.
- `claude/nervous-wright-91e7e7` — checked out in a worktree.
- `codex/auth-split-polish` — checked out in a worktree.
- `codex/creators-gpu-load` — checked out in a worktree.
- `codex/history-unlist` — checked out in a worktree.
- `codex/ship-1014-german` — checked out in a worktree.
- `codex/swarm-branch-report` — swarm branch; checked out in a worktree.
- `codex/swarm-docs-review` — swarm branch; checked out in a worktree.
- `codex/swarm-fb-publish-perms` — swarm branch; checked out in a worktree.
- `codex/swarm-plans-archive` — swarm branch; checked out in a worktree.
- `codex/swarm-spec-recon` — swarm branch; checked out in a worktree.
- `codex/swarm-svelte-check` — swarm branch; checked out in a worktree.
- `main` — main baseline; checked out in a worktree.

## Verification

Observation: snapshot coverage is 44 scoped branches, 44 table rows, 44 distinct table branches; missing = 0; extra = 0; duplicate = 0. 61 = 44 + 17. All 44 rows have date/author, unique count, cherry counts and a verdict. All 39 branches with unique commits have up to 15 subjects. All 23 cherry-plus branches received merge-tree checks.

Observation: report consistency, live scope equality, explicit path ownership and whitespace are checked before the scoped commit. No deletion, merge, fetch, push, install, dev server or application check is authorized by this report.

Proposal: review two UNKNOWN histories with merge-aware comparison before deciding their disposition; no product decision or approval was needed to produce this ledger.

Observation: revalidation saw 64 live local branches; scoped set remained exactly the same 44. Since capture, added checked-out/skipped refs: `codex/boot-bar-compositor-fill`, `codex/launchpad-notation-poster`, `codex/preview-header-fit`, `codex/translation-program`, `codex/zans-credit`. Removed originally skipped refs: `codex/auth-split-polish`, `codex/history-unlist`. Live main was `bc7810ceda85e8d25dbddb7e51c759e1ca6ea4c5`; baseline comparisons remain pinned. The skipped list above describes the original snapshot.

Observation: an initial verifier failed its fixed live-total assertion (61) after concurrent branch creation/removal. Revalidation compares scoped sets and records excluded-ref drift instead; all scoped coverage and remote-only checks passed.

Observation: `git diff --cached --check -- docs/reports/swarm-2026-10-14/branch-report.md` exited 0 with no whitespace errors after explicit staging. The initial no-index whitespace probe exited 1 for an added file and emitted only Git's CRLF-to-LF normalization warning.

Observation: commit `4d793c6368` (`docs: report local branch dispositions for swarm review`) contains only this report. Post-commit `git status --short` was empty; `git show --format= --name-only HEAD` printed only `docs/reports/swarm-2026-10-14/branch-report.md`.

Observation: a supplemental double-quoted PowerShell one-line verifier failed because PowerShell consumed regex backticks. It was rerun with literal quoting and a delimiter-based row parser; result: `PASS: 44 table branches, 0 duplicates`. The comprehensive scope/remote verifier had already passed before the report commit.

Exact supplemental verification command (PowerShell):

```powershell
python -c 'from pathlib import Path; t=Path("docs/reports/swarm-2026-10-14/branch-report.md").read_text(); s=t.split("## Disposition table")[1].split("## SALVAGE")[0]; b=[x.split("|")[1].strip() for x in s.splitlines() if x.startswith("| ")][2:]; assert len(b)==len(set(b))==44; print("PASS: 44 table branches, 0 duplicates")'
```
