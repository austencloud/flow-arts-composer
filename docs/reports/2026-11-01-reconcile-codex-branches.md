# Reconcile the unmerged `codex/*` branches

Date: 2026-11-01. Branch: `claude/reconcile-codex`, based on `origin/main`
at `cadc83ce8` ("Publish local main a667ba9744").

Four `codex/*` branches on origin were never merged. This report records what
each one still holds against today's `origin/main`.

## Summary

| Branch                      | Own commits             | Outcome                                      | Re-apply effort |
| --------------------------- | ----------------------- | -------------------------------------------- | --------------- |
| `codex/sequence-link-ota`   | 1                       | Already on main, byte-identical              | none            |
| `codex/fuse-recipe-stage`   | 1 (handoff doc only)    | Superseded; product code was never committed | none possible   |
| `codex/post-studio-rebuild` | 13 by SHA, 0 by content | Landed; tip tree equals main at `fd665fbb3`  | none            |
| `codex/sync-main-0925`      | 12 by SHA, 2 by content | Landed in evolved form                       | none            |

Nothing needs re-applying. The one open product question is in the Fuse
section.

### Correction to the brief

The brief said three of the branches share no merge base with `origin/main`.
In this clone every branch has a merge base that is an ancestor of
`origin/main`:

| Branch                      | Merge base  | Ahead | Behind |
| --------------------------- | ----------- | ----- | ------ |
| `codex/sequence-link-ota`   | `630eda367` | 1     | 6      |
| `codex/fuse-recipe-stage`   | `b5233021d` | 1     | 8464   |
| `codex/post-studio-rebuild` | `fd665fbb3` | 13    | 4489   |
| `codex/sync-main-0925`      | `9e2529148` | 12    | 4512   |

"Ahead" counts commits unreachable from `origin/main`. The snapshot
("Publish local main") commits sit on top of the older merge history rather
than replacing it, so content comparison below was done per file against both
the merge base and today's main.

## Part 1: `codex/sequence-link-ota`

Commit `3f05cb650` (2026-10-27), "Native deep links: open shared sequence
links in the in-app viewer". It touches two files:

- `src/lib/shared/platform/services/native-deep-link-target.ts`
- `tests/unit/platform/native-deep-link-target.test.ts`

`git cherry-pick -x 3f05cb650` onto this branch produced an empty commit.
Both files are byte-identical between the branch commit and `origin/main`.
Main received the change through snapshot `c6a2ec326` (2026-10-27, "Publish
local main 4637b02369"), which carries the same 29 insertions and 3 deletions.

The cherry-pick was abandoned with `git cherry-pick --quit`, leaving the tree
clean. No commit was made for Part 1. As evidence that main's copy is live,
the touched test was run against main's content:

```
npx vitest run --config tests/config/vitest.config.ts tests/unit/platform/native-deep-link-target.test.ts
Test Files  1 passed (1)
Tests       6 passed (6)
```

`npm run test:changed` and a scoped tsc were not run because there is no diff
to check. The branch can be deleted whenever Austen wants; this session did
not touch it.

## Part 2: `codex/fuse-recipe-stage`

Last commit `8c27b1956` (2026-09-01), "docs: hand off Fuse recipe stage
redesign". Merge base `b5233021d` is on main; everything below the tip is
inherited history.

### Own commits

| SHA         | Date       | Subject                                   |
| ----------- | ---------- | ----------------------------------------- |
| `8c27b1956` | 2026-09-01 | docs: hand off Fuse recipe stage redesign |

### Files touched and their state on main

| File                                                             | State   | Note                                           |
| ---------------------------------------------------------------- | ------- | ---------------------------------------------- |
| `docs/superpowers/specs/2026-09-01-fuse-recipe-stage-handoff.md` | missing | Main has no file matching `fuse-recipe-stage`. |

That is the only file. The handoff itself says no product code or design spec
was ever committed. The seven working files it lists lived uncommitted in the
worktree `E:\tka-platform-fuse-recipe-stage`:

- `src/lib/features/fuse/components/FuseAnimationPreview.svelte`
- `src/lib/features/fuse/components/FusePreviewStage.svelte`
- `src/lib/features/fuse/components/FuseRecipeSettings.svelte`
- `src/lib/features/fuse/components/FuseRelationshipComposer.svelte`
- `src/lib/features/fuse/components/FuseRecipeOverview.svelte` (new)
- `src/lib/features/fuse/components/FuseRelationshipSummary.svelte` (new)
- `docs/superpowers/specs/active/2026-09-01-fuse-recipe-stage-design.md` (new)

None of those two new components or the design spec exist on main or on the
branch. Unless that worktree still exists on Austen's machine, the code is
gone.

### What the handoff says remains

The mission was to turn the right-hand Fuse recipe column into a full-height
recipe inspector and let the assembled result animation use the shared
`glyphFrame="stage"` framing from Shape Matrix. It reports:

- Nothing verified as done. Only Prettier, `git diff --check`, and one
  pre-existing overlay-frame unit test passed.
- Believed done but unverified: a `FuseRecipeOverview` landing surface for
  `SettingsDrillPanel`, a `FuseRelationshipSummary` extracted from the
  relationship composer, stage framing while assembled, and a decomposed-state
  marker on the preview stage.
- Open loose ends: audit the dirty diff against main, get a trustworthy type
  check (`check:fast` cascaded 966 errors), stand up a working preview server,
  investigate a production build that exited 0 without producing output,
  inspect seven viewports, then commit and run `wt:finish` with
  `--route /create/fuse`.
- Decisions: Austen approved the redesign on 2026-09-01 ("sure, but make no
  mistakes"). The column is an inspector, not a taller menu. Existing Fuse
  state and drill owners stay the behavior owners. Fuse uses the engine's
  stage framing rather than local annotation offsets.

### What main did instead

Main's Fuse components directory was reworked on 2026-09-29 by the
`codex/caps-rewrite` merge (`9ade0fc37`), which added `FuseRecipeColumn`,
`FuseRecipeRail`, `FuseRecipeBasics`, `FuseRecipePopover`,
`FuseRecipeChoiceField`, and `FuseRecipeSettingContent`. Fuse components have
been touched eight more times since, through 2026-10-23. `FuseAnimationPreview`
and `FusePreviewStage` on main size the frame through a `fuse-frame` size
container and CSS variables. Neither passes `glyphFrame` to the animator; the
`glyphFrame` prop still exists on `AnimatorCanvas` and `CanvasSurface`.

### Recommendation

`superseded by` the Fuse recipe column rework in `codex/caps-rewrite`
(`9ade0fc37`, 2026-09-29) and the later Fuse commits on main. The handoff
document describes work that no longer matches main's component set, and the
code it describes was never committed, so there is nothing to re-apply.

Effort: none possible from the branch. If Austen still wants the one idea main
did not adopt, the assembled Fuse result using the engine's `glyphFrame="stage"`
framing, that is a fresh task against today's `FuseAnimationPreview`. Rough
size M, because the frame-track CSS on main is now the geometry owner.

`needs Austen`: confirm the handoff document can be dropped rather than
archived under `docs/superpowers/handoffs/archived/`. Main archived the other
2026-07 handoffs there on 2026-10-14 (`ef45be8bc`).

## Part 2: `codex/post-studio-rebuild`

Last commit `c2f6768f6` (2026-09-25), "Merge the Post Studio tutorial-builder
rebuild onto the sync branch". Merge base `fd665fbb3` ("Merge branch
'codex/maps-key-optional'", 2026-09-25) is on main.

### Own commits

Thirteen commits are unreachable from `origin/main` by SHA. Nine are merge
commits that pulled main into `codex/sync-main-0924`. The four with content:

| SHA         | Date       | Subject                                                            |
| ----------- | ---------- | ------------------------------------------------------------------ |
| `16c25f132` | 2026-09-25 | fix(maps): let builds without a Maps key succeed                   |
| `4260fb09c` | 2026-09-24 | Clarify notation demo captions and page copy (#85)                 |
| `51b5791c3` | 2026-09-24 | style(notation): remove AI writing patterns from prop pages (#84)  |
| `9c1ff31b8` | 2026-09-24 | fix(glyph): stop TurnsColumn reading its letter prop after unmount |

The Post Studio topic commits near the tip (`edccd8a47`, `6ea8eec32`,
`cbd011240`, `e4d606bd7`, `4bc097f6a`, and the `codex/post-studio-mapping`
merge `9779dc5cf`) are all reachable from `origin/main`. They reached main
through `codex/post-studio-mapping` and the `sync-main-post-studio-fold`
pull request (#82). The branch did not author them.

### Files touched and their state on main

`git diff fd665fbb3 origin/codex/post-studio-rebuild` is empty: the branch
tip's tree is identical to a commit on main. Every file the four content
commits touched is therefore `landed` as of `fd665fbb3`. Main has edited all
of them since, which is normal drift, not a missing change:

| File                                                                                       | State                                                               |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `src/lib/shared/maps/google-maps-api-key.ts`                                               | landed, evolved (see sync branch)                                   |
| `src/lib/features/admin/components/ActiveUsersPanel.svelte`                                | landed, evolved                                                     |
| `src/lib/features/choreo-card/components/scan-activity/ScanActivityTab.svelte`             | landed, evolved                                                     |
| `src/lib/features/community/Community.svelte`                                              | landed, evolved                                                     |
| `src/lib/features/community/get-geocoding-service.ts`                                      | landed, evolved                                                     |
| `src/lib/features/creators/components/CreatorsPanel.svelte`                                | landed, evolved                                                     |
| `src/lib/features/festivals/components/map/FestivalMap.svelte`                             | landed, evolved                                                     |
| `src/routes/(public)/notation/{buugeng,caps,clubs,fans,poi,staves}/+page.svelte`           | landed, evolved                                                     |
| `src/routes/(public)/notation/caps/_components/CapsHub.svelte`                             | landed, evolved                                                     |
| `src/routes/(public)/notation/caps/_components/construction/ConstructionProvenance.svelte` | landed, evolved                                                     |
| `src/routes/(public)/notation/caps/_components/construction/ConstructionRail.svelte`       | landed, evolved                                                     |
| `.agents/skills/ai-bust/SKILL.md`, `.agents/skills/ai-bust/ai_bust.py`                     | landed, evolved                                                     |
| `.claude/skills/ai-bust/SKILL.md`, `.claude/skills/ai-bust/ai_bust.py`                     | landed, evolved                                                     |
| `.codex/claude-skill-sync-manifest.json`                                                   | landed, evolved                                                     |
| `src/lib/shared/landing/components/OpenChapter.svelte`                                     | landed, evolved                                                     |
| `src/lib/shared/pictograph/tka-glyph/components/TurnsColumn.svelte`                        | landed, evolved; the unmount guard comment is still present on main |

Post Studio itself continued on main after this branch: timeline editor,
keyframes with easing curves, and the tool row all landed 2026-09-26. The
feature now lives under `src/lib/features/post`.

### Handoff documents

The branch wrote none. The `docs/superpowers/handoffs/*` and
`docs/superpowers/plans/*` files present on the branch but absent from main
are all inherited from the merge base. Main archived the handoffs under
`docs/superpowers/handoffs/archived/` and pruned those plans on 2026-10-14
(`ef45be8bc`, "docs(plans): sort evidenced plans and archive superseded
handoffs"). The test route `src/routes/test/construct-solo-handoff/` is also
inherited and was removed on main.

### Recommendation

`superseded by` main at `fd665fbb3` and everything after it. The branch's
content is a strict subset of main's history. Effort: none. The branch can be
deleted.

## Part 2: `codex/sync-main-0925`

Last commit `2c249e35d` (2026-09-25), "test(engine): tolerate the feasibility
limit in the overlay re-roll test". Merge base `9e2529148` ("Merge branch
'codex/ci-test-guards'", 2026-09-24) is on main.

### Own commits

Twelve commits are unreachable from `origin/main` by SHA. Ten are shared with
`codex/post-studio-rebuild` (the same merge plumbing and the #83, #84, #85
commits listed above). The two commits specific to this branch:

| SHA         | Date       | Subject                                                                  |
| ----------- | ---------- | ------------------------------------------------------------------------ |
| `2c249e35d` | 2026-09-25 | test(engine): tolerate the feasibility limit in the overlay re-roll test |
| `16c25f132` | 2026-09-25 | fix(maps): let builds without a Maps key succeed                         |

### Files touched and their state on main

`git diff 9e2529148 origin/codex/sync-main-0925` touches eight files.

| File                                                                           | State           | How main differs                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/sequence-engine/tests/generation/overlay-seed-reroll.test.ts`        | landed, evolved | Main has the `MAX_INFEASIBLE = 3` tolerance, the try/catch, and the two `expect` checks on the error message verbatim. Main also split the cases into `UNSTRUCTURED_CASES` (now expected to throw `GenerationInfeasibleError`) and `STRUCTURED_CASES` on 2026-10-22, feedback `n3H02keo8KuXX5mJng4E`. |
| `src/lib/shared/maps/google-maps-api-key.ts`                                   | landed, evolved | Main keeps the namespace-import trick. It imports from `$app/env/public` instead of `$env/static/public` (SvelteKit 3 migration, 2026-10-10) and defaults to `""`.                                                                                                                                    |
| `src/lib/features/admin/components/ActiveUsersPanel.svelte`                    | landed, evolved | Imports from `#lib/shared/maps/google-maps-api-key.js` instead of `$lib/shared/maps/google-maps-api-key`.                                                                                                                                                                                             |
| `src/lib/features/choreo-card/components/scan-activity/ScanActivityTab.svelte` | landed, evolved | Same import-alias change.                                                                                                                                                                                                                                                                             |
| `src/lib/features/community/Community.svelte`                                  | landed, evolved | Same import-alias change.                                                                                                                                                                                                                                                                             |
| `src/lib/features/community/get-geocoding-service.ts`                          | landed, evolved | Same import-alias change.                                                                                                                                                                                                                                                                             |
| `src/lib/features/creators/components/CreatorsPanel.svelte`                    | landed, evolved | Same import-alias change.                                                                                                                                                                                                                                                                             |
| `src/lib/features/festivals/components/map/FestivalMap.svelte`                 | landed, evolved | Same import-alias change.                                                                                                                                                                                                                                                                             |

The Maps-key fix reached main as `f4e3a9294` via `codex/maps-key-optional`
(same subject, same day). The overlay test tolerance reached main by
2026-09-29 (`9ade0fc37`).

### Handoff documents

None authored by the branch. The inherited `handoffs/*` and `plans/*` files
are the same set described for `codex/post-studio-rebuild`.

### Recommendation

`superseded by` `f4e3a9294` (Maps key) and the overlay test on main as of
`9ade0fc37`. Effort: none. The branch can be deleted.

## Method

- `git fetch --depth=300 origin <branch>` for each branch.
- Own commits: `git log <merge-base>..origin/<branch>`.
- File state: `git diff --quiet` of each touched path against `origin/main`,
  then a hunk-level read of main's version where the file differed, to tell
  "evolved after landing" from "never landed".
- Handoff sweep: `git ls-tree -r` on each branch for `docs/handoffs/`,
  `docs/superpowers/plans/`, and `*handoff*`, filtered to paths missing on
  main, then checked against the merge-base tree to separate inherited files
  from branch-authored ones.
- No branch was modified, deleted, or force-pushed.
