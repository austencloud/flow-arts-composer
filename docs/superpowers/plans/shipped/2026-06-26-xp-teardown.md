# XP / Achievement System Teardown — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully remove the XP / achievement / streak / challenge-XP gamification system from TKA, leaving the prop-collection unlock feature and the Inbox untouched, with `npm run check` + `npm run build` green.

**Architecture:** Four staged phases, each independently compiles and commits. Phase 1 kills the user-visible symptom (the "+10 XP" toast + award calls). Phase 2 deletes the engine and dead display UI. Phase 3 removes the Train Challenges tab and rewrites the training session processor to keep only performance history. Phase 4 handles infrastructure: Dexie tables, Firestore rules, denormalized user fields, analytics, i18n.

**Tech Stack:** SvelteKit 5 (runes), TypeScript, Dexie (IndexedDB), Firebase/Firestore, vitest.

**Spec:** `docs/superpowers/specs/2026-06-26-xp-teardown-design.md`

**Verification command (used everywhere):** capture once, grep many —
```bash
npm run check > /tmp/check.log 2>&1; grep -niE "error|cannot find|is not exported" /tmp/check.log | head -50
```
Green = no `error`/`cannot find` lines. Do NOT re-run `check` to re-filter; grep the log.

**Commit rule (every commit in this plan):** explicit pathspec only. Never `git add -A`/`.`/`-u`. Use `git rm` for deletions, then `git commit -- <exact paths>`. The shared index may hold other agents' work — scope every commit to your own files. Confirm with Austen before the first commit of each phase if other agents are active.

**Files to KEEP inside `src/lib/shared/gamification/` (prop collection — verified isolated, zero XP-tree imports):**
`domain/prop-pool.ts` (+`.test`), `domain/prop-collection.ts` (+`.test`), `services/prop-unlock-manager.ts`, `services/prop-collection-persistence.ts` (+`.test`), `state/prop-collection-state.svelte.ts`, `state/prop-celebration-state.svelte.ts`, `get-prop-unlock-manager.ts`, `components/PropUnlockCelebration.svelte`, `data/prop-demo-loop.ts`.

> NOTE: `prop-collection-state.svelte.ts` imports `AchievementNotification` only as a passing reference (matched the grep). Verify during Task 2.1: if it imports a type from `achievement-models`, inline that type into the prop file rather than keeping the deleted module.

---

## Phase 1 — Stop awards + unmount toast

### Task 1.1: Remove XP award calls from library save

**Files:**
- Modify: `src/lib/shared/library/services/library-repository.ts` (lines 42, 80, 478-485, 868)
- Modify: `src/lib/shared/library/get-library-repository.ts` (lines 2, 28)

- [ ] **Step 1: Remove the `sequence_created` tracking block** in `library-repository.ts`. Delete the entire block (currently ~478-485):

```ts
    // Post-write: Track XP (async, non-blocking)
    if (isNewSequence) {
      this.achievementService
        .trackAction("sequence_created", {
          stepCount: sequence.steps.length ?? 0,
        })
        .catch((_e) => console.warn("Failed to track achievement:", _e));
    }
```

- [ ] **Step 2: Remove the `sequence_published` call** (~868):

```ts
        await this.achievementService.trackAction("sequence_published", {
```
Remove the statement and its surrounding `if`/await context that exists only to call it. (Read the enclosing block first; keep the publish side-effects that are NOT XP — e.g. the public-index sync. Only the `trackAction` call and any `isNewSequence`-style guard that wraps solely it are removed.)

- [ ] **Step 3: Remove the constructor param + type import.** Delete line 42 `import type { AchievementManager } from '$lib/shared/gamification/services/achievement-manager'` and the constructor parameter line 80 `private achievementService: AchievementManager,`.

- [ ] **Step 4: Remove the injection** in `get-library-repository.ts`: delete the import (line 2) `import { getAchievementManager } from '$lib/shared/gamification/get-achievement-manager';` and the argument (line 28) `getAchievementManager(),`.

- [ ] **Step 5: Verify**

```bash
npm run check > /tmp/check.log 2>&1; grep -niE "error|cannot find|achievementService" /tmp/check.log | head
grep -rn "achievementService\|trackAction" src/lib/shared/library/ || echo "CLEAN"
```
Expected: `CLEAN`, no check errors.

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor(library): stop awarding XP on sequence save/publish" -- src/lib/shared/library/services/library-repository.ts src/lib/shared/library/get-library-repository.ts
```

### Task 1.2: Remove XP award from feedback submission

**Files:**
- Modify: `src/lib/shared/feedback/services/feedback-submission-service.ts` (import + line 156)

- [ ] **Step 1:** Remove the import `import { trackXP } from "$lib/shared/gamification/init/gamification-initializer";` and the call (~156):

```ts
  trackXP("feedback_submitted", {
```
Remove the whole `trackXP(...)` statement (and any `.catch`/await wrapping only it).

- [ ] **Step 2: Verify**

```bash
npm run check > /tmp/check.log 2>&1; grep -niE "error|cannot find|trackXP" /tmp/check.log | head
grep -n "trackXP\|gamification" src/lib/shared/feedback/services/feedback-submission-service.ts || echo "CLEAN"
```

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor(feedback): stop awarding XP on feedback submit" -- src/lib/shared/feedback/services/feedback-submission-service.ts
```

### Task 1.3: Unmount toasts + remove gamification boot

**Files:**
- Modify: `src/lib/shared/application/components/MainApplication.svelte` (lines 27-28, 332-347, 612-613)

- [ ] **Step 1: Remove the two imports** (27-28):

```svelte
  import AchievementNotificationToast from "../../gamification/components/AchievementNotificationToast.svelte";
  import XPToast from "../../gamification/components/XPToast.svelte";
```

- [ ] **Step 2: Remove the two mounts** (612-613):

```svelte
    <AchievementNotificationToast />
    <XPToast />
```

- [ ] **Step 3: Remove the boot block** (332-347), the whole `if (authState.isAuthenticated)` gamification-init block:

```svelte
        // Initialize gamification system (authenticated users only - requires Firestore)
        if (authState.isAuthenticated) {
          window.__tkaLoadProgress?.(98, "Initializing achievements...");
          bootProfiler.mark("app:gamification");
          try {
            const { initializeGamification } =
              await import("../../gamification/init/gamification-initializer");
            await initializeGamification();
          } catch (gamError) {
            console.error(
              "⚠️ Gamification failed to initialize (non-blocking):",
              gamError
            );
          }
          bootProfiler.end("app:gamification");
        }
```

- [ ] **Step 4: Verify**

```bash
npm run check > /tmp/check.log 2>&1; grep -niE "error|cannot find" /tmp/check.log | head
grep -n "gamification\|XPToast\|AchievementNotificationToast\|initializeGamification" src/lib/shared/application/components/MainApplication.svelte || echo "CLEAN"
```
Expected: `CLEAN` (no remaining gamification refs in MainApplication).

- [ ] **Step 5: Runtime sanity** — on `https://localhost:5173`, save a sequence; toast must read plain "Sequence saved", no XP toast. (Manual; Austen confirms.)

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor(app): unmount XP/achievement toasts + remove gamification boot" -- src/lib/shared/application/components/MainApplication.svelte
```

---

## Phase 2 — Delete engine + dead display UI

### Task 2.1: Delete the XP sub-tree of `gamification/`

**Files — DELETE (git rm):**
```
src/lib/shared/gamification/domain/constants/xp-constants.ts
src/lib/shared/gamification/domain/constants/achievement-definitions.ts
src/lib/shared/gamification/domain/constants/skill-definitions.ts
src/lib/shared/gamification/domain/models/achievement-models.ts
src/lib/shared/gamification/domain/models/challenge-models.ts
src/lib/shared/gamification/services/achievement-manager.ts
src/lib/shared/gamification/services/streak-tracker.ts
src/lib/shared/gamification/services/daily-challenge-manager.ts
src/lib/shared/gamification/services/weekly-challenge-manager.ts
src/lib/shared/gamification/services/challenge-coordinator.ts
src/lib/shared/gamification/services/gamification-notifier.ts
src/lib/shared/gamification/services/skill-progression-tracker.ts
src/lib/shared/gamification/services/types.ts
src/lib/shared/gamification/services/skill-progression/   (whole dir)
src/lib/shared/gamification/state/notification-state.svelte.ts
src/lib/shared/gamification/state/xp-toast-state.svelte.ts
src/lib/shared/gamification/init/gamification-initializer.ts
src/lib/shared/gamification/data/firestore-collections.ts
src/lib/shared/gamification/get-achievement-manager.ts
src/lib/shared/gamification/get-challenge-coordinator.ts
src/lib/shared/gamification/get-daily-challenge-manager.ts
src/lib/shared/gamification/get-skill-progression-tracker.ts
src/lib/shared/gamification/get-streak-tracker.ts
src/lib/shared/gamification/get-weekly-challenge-manager.ts
src/lib/shared/gamification/components/XPToast.svelte
src/lib/shared/gamification/components/AchievementNotificationToast.svelte
```

- [ ] **Step 1: Confirm prop isolation before deleting.** Check the prop-collection files don't import any of the above:

```bash
grep -rn "achievement-models\|challenge-models\|xp-constants\|firestore-collections\|achievement-manager\|notification-state\|gamification-notifier" \
  src/lib/shared/gamification/domain/prop-collection.ts \
  src/lib/shared/gamification/state/prop-collection-state.svelte.ts \
  src/lib/shared/gamification/services/prop-unlock-manager.ts || echo "ISOLATED"
```
Expected: `ISOLATED`. If any match: inline the referenced type into the prop file, then proceed.

- [ ] **Step 2: Delete the files** with `git rm` (list above; `git rm -r` for `skill-progression/`).

- [ ] **Step 3: Find the breakage** (importers outside the prop tree — known set, fixed in 2.2–2.4 + Phase 3/4):

```bash
npm run check > /tmp/check.log 2>&1; grep -niE "cannot find|is not exported|error TS2307" /tmp/check.log | sort -u | head -60
```
This list MUST match exactly the files handled in Tasks 2.2, 2.3, 2.4, 3.x, 4.x. If a file appears that is NOT in those tasks, STOP and report it (unmapped consumer).

- [ ] **Step 4:** Do NOT commit yet — build is red until 2.2+ land. (Commit at end of Task 2.4.)

### Task 2.2: Delete dead display UI (rankings, leaderboard, community challenges)

**Files — DELETE (git rm):**
```
src/lib/features/browse/creators/components/profile/ProfileRankings.svelte
src/lib/shared/community/services/leaderboard-manager.ts
src/lib/shared/community/get-leaderboard-manager.ts
src/lib/shared/community/challenges/   (whole dir: ChallengesPanel, ChallengeStats, DailyChallengeCard, WeeklyChallengeCard, SkillProgressionList, etc.)
```

- [ ] **Step 1:** `git rm` the files/dir above.

- [ ] **Step 2: Remove any references to ProfileRankings / leaderboard.** Locate + remove:

```bash
grep -rn "ProfileRankings\|leaderboard-manager\|get-leaderboard-manager\|getLeaderboardManager\|community/challenges" src --include=*.ts --include=*.svelte | grep -v "DELETED"
```
ProfileRankings had no importer (orphan); leaderboard-manager's only importer was `challenge-coordinator` (already deleted in 2.1). Expected: no surviving references. Remove any that appear.

- [ ] **Step 3: Verify (partial — Phase 2 consumers only)**

```bash
npm run check > /tmp/check.log 2>&1; grep -niE "ProfileRankings|leaderboard|community/challenges" /tmp/check.log || echo "PHASE2-UI CLEAN"
```

### Task 2.3: Remove streak UI surfaces (Learn quiz + Watch header)

> Discovered via importer graph: two live components consume the deleted `streak-tracker`.

**Files — DELETE (git rm):**
```
src/lib/features/learn/quiz/components/StreakDisplay.svelte
src/lib/features/watch/components/header/StreakBadge.svelte
```
**Files — MODIFY (remove the mounts + imports):**
```
src/lib/features/learn/components/interactive/positions/ConstructionQuiz.svelte
src/lib/features/learn/components/interactive/positions/SpeedRounds.svelte
src/lib/features/learn/quiz/components/QuizTab.svelte
src/lib/features/watch/components/header/FloatingHeader.svelte
```

- [ ] **Step 1:** `git rm` `StreakDisplay.svelte` and `StreakBadge.svelte`.

- [ ] **Step 2:** In each of the 4 parents, remove the `import ... StreakDisplay`/`StreakBadge` line and the `<StreakDisplay ... />`/`<StreakBadge ... />` mount, plus any now-unused props/state feeding only that mount. Find each:

```bash
grep -rn "StreakDisplay\|StreakBadge\|get-streak-tracker\|getStreakTracker" src/lib/features/learn src/lib/features/watch --include=*.svelte
```

- [ ] **Step 3: Verify**

```bash
npm run check > /tmp/check.log 2>&1; grep -niE "StreakDisplay|StreakBadge|streak-tracker" /tmp/check.log || echo "STREAK-UI CLEAN"
```

### Task 2.4: Remove `COMMUNITY_TABS` challenges entry + commit Phase 2

**Files:**
- Modify: `src/lib/shared/navigation/config/tab-definitions.ts` (`COMMUNITY_TABS`, ~line 207)
- Modify: `src/lib/shared/navigation/state/navigation-state.svelte.ts` (if it references the removed tab id)

- [ ] **Step 1:** In `COMMUNITY_TABS`, remove the `challenges` section object (id `"challenges"`, ~205-214). If `COMMUNITY_TABS` has no live module consumer (it maps via `module-definitions` `community → social`; the Social module uses `SOCIAL_TABS`), confirm and, if fully unused, you may leave the now-shorter array as-is (do not delete the export — `navigation-state` imports it).

```bash
grep -rn "COMMUNITY_TABS" src --include=*.ts --include=*.svelte
```

- [ ] **Step 2: Full check (the whole engine + dead UI must now compile)**

```bash
npm run check > /tmp/check.log 2>&1; grep -niE "error|cannot find" /tmp/check.log | head -40
```
Remaining errors should now point ONLY to Phase 3 (Train) + Phase 4 (db/rules/profile/admin) consumers. If so, that's expected — but Phase 2's own surfaces must be clean. If you want Phase 2 to commit green on its own, Tasks 3.1–3.3 and 4.1–4.4 must land in the same working set before committing. (Recommended: treat Phases 2–4 as one red-to-green window, commit once at end of Phase 4. The per-task `git rm` keeps history granular via staging, but the single green commit happens after 4.x.)

> DECISION: Because deleting the engine (2.1) breaks Train + db consumers, **Phases 2, 3, and 4 form one red→green window.** Stage deletions/edits as you go; run the full green `check` + `build` only after Task 4.5; commit each phase's paths in its own `git commit -- <paths>` once green.

---

## Phase 3 — Remove the Train Challenges tab

### Task 3.1: Delete Train challenge files

**Files — DELETE (git rm):**
```
src/lib/features/train/components/challenges/         (ChallengesPanel.svelte, ChallengeCard.svelte)
src/lib/features/train/services/train-challenge-manager.ts
src/lib/features/train/get-train-challenge-manager.ts
src/lib/features/train/data/seed-challenges.ts
src/lib/features/train/domain/models/train-challenge-models.ts
src/lib/features/train/state/active-challenge-state.svelte.ts
src/lib/features/train/state/train-challenges-state.svelte.ts
```

- [ ] **Step 1:** `git rm` the above. Then enumerate remaining references:

```bash
grep -rn "train-challenge\|ChallengesPanel\|ChallengeCard\|active-challenge-state\|train-challenges-state\|getTrainChallengeManager\|seed-challenges" src/lib/features/train --include=*.ts --include=*.svelte
```

### Task 3.2: Rewrite `TrainModule.svelte` → Practice + Progress

**Files:**
- Modify: `src/lib/features/train/components/TrainModule.svelte`

- [ ] **Step 1:** Remove the `ChallengesPanel` import and the `challenges` branch. New body:

```svelte
  import PracticePanel from "./practice/PracticePanel.svelte";
  import ProgressPanel from "./progress/ProgressPanel.svelte";

  type TrainSection = "practice" | "progress";
  let activeSection = $state<TrainSection>("practice");

  $effect(() => {
    const navTab = navigationState.activeTab;
    if (navTab && ["practice", "progress"].includes(navTab)) {
      activeSection = navTab as TrainSection;
    }
  });
```
And the markup:

```svelte
      {#if activeSection === "practice"}
        <PracticePanel />
      {:else if activeSection === "progress"}
        <ProgressPanel />
      {/if}
```

- [ ] **Step 2:** In `src/lib/shared/navigation/config/tab-definitions.ts`, remove the `challenges` section from `TRAIN_TABS` (id `"challenges"`, ~285-290).

### Task 3.3: Rewrite `session-completion-processor.ts` (keep history, drop XP/challenges)

**Files:**
- Modify: `src/lib/features/train/services/session-completion-processor.ts`
- Modify: `src/lib/features/train/get-session-completion-processor.ts` (drop `getAchievementManager` import + arg, line ~import + injection)
- Modify: `src/lib/features/train/components/train/ResultsScreen.svelte`

- [ ] **Step 1:** In `session-completion-processor.ts` remove: the import of `notification-state.svelte` and `achievement-manager`; the `achievementManager` + `challengeManager` constructor deps; the methods `trackAchievements`, `processActiveChallenge`, `handleChallengeCompletion`, `showProgressNotification` and any `activeChallengeState` usage; and the `xpEarned`/`xpBreakdown` fields in the stored performance. Keep `savePerformance(storedPerformance)` and the accuracy/combo/grade computation. Remove calls to the deleted methods from the public entrypoint.

```bash
grep -n "achievementManager\|challengeManager\|activeChallenge\|trackAction\|xpBreakdown\|xpEarned\|notification-state" src/lib/features/train/services/session-completion-processor.ts
```
All matches must be gone (except a plain numeric `score`/`grade` that is unrelated).

- [ ] **Step 2:** In `get-session-completion-processor.ts` remove `import { getAchievementManager } from '$lib/shared/gamification/get-achievement-manager';` and the `getAchievementManager()` argument; likewise the train-challenge-manager arg if present.

- [ ] **Step 3:** In `ResultsScreen.svelte` remove the `XPBreakdown` interface (~line 12), the `xpBreakdown?` prop (~32), and the entire `<!-- XP Breakdown -->` block (`.xp-section`, ~195-260) plus its CSS. Keep accuracy / combo / score / grade.

```bash
grep -n "xp\|XP\|xpBreakdown" src/lib/features/train/components/train/ResultsScreen.svelte
```
Remaining matches: none.

- [ ] **Step 4: Verify Train compiles**

```bash
npm run check > /tmp/check.log 2>&1; grep -niE "train|challenge|session-completion|ResultsScreen" /tmp/check.log | grep -iE "error|cannot find" || echo "TRAIN CLEAN"
```

### Task 3.4: Remove admin challenge tooling

**Files — DELETE (git rm):**
```
src/lib/features/admin/components/TrainChallengeManager.svelte
src/lib/features/admin/components/challenge-scheduler/    (whole dir)
src/lib/features/admin/services/admin-challenge-manager.ts
```
**Files — MODIFY:**
- `src/lib/features/admin/domain/models/admin-models.ts` (remove `achievement-models` import + any challenge types)
- `src/lib/shared/navigation/config/tab-definitions.ts` `ADMIN_TABS` (remove `challenges` + `train-challenges` entries, ~395-410)
- Admin module/router that mounts `TrainChallengeManager` / scheduler (find + remove)

- [ ] **Step 1:** `git rm` the admin challenge files. Then:

```bash
grep -rn "TrainChallengeManager\|challenge-scheduler\|admin-challenge-manager\|ChallengeFormPanel\|SchedulerTimelineView" src/lib/features/admin --include=*.ts --include=*.svelte
```
Remove every surviving reference (imports, mounts, tab entries, router cases).

- [ ] **Step 2: Verify admin compiles**

```bash
npm run check > /tmp/check.log 2>&1; grep -niE "admin" /tmp/check.log | grep -iE "error|cannot find" || echo "ADMIN CLEAN"
```

---

## Phase 4 — Infrastructure + data

### Task 4.1: Remove gamification Dexie tables (version bump + migration)

**Files:**
- Modify: `src/lib/shared/persistence/database/tka-database.ts`
- Modify: `src/lib/shared/persistence/domain/constants/database_constants.ts`

Tables to remove (all gamification): `userAchievements`, `userXP`, `xpEvents`, `dailyChallenges`, `userChallengeProgress`, `userStreaks`, `achievementNotifications`, `weeklyChallenges`, `userWeeklyProgress`, `skillProgressions`, `userSkillProgress`. **KEEP** `trainPerformances`, `trainCalibrationProfiles` (practice history), all prop/sequence/settings tables.

- [ ] **Step 1: `database_constants.ts`** — bump `DATABASE_VERSION` from `6` to `7`. Remove the 11 gamification keys from `TABLE_INDEXES` and the `FIRESTORE_COLLECTIONS`/name constants for them (lines ~38-44 + the challenge index lines ~84, ~91).

- [ ] **Step 2: `tka-database.ts`** — remove the type imports from `achievement-models` (line ~15-... ) and `challenge-models` (line ~27): `UserAchievement, UserXP, XPGainEvent, DailyChallenge, UserChallengeProgress, UserStreak, AchievementNotification, WeeklyChallenge, UserWeeklyChallengeProgress, SkillProgression, UserSkillProgress`. Remove the 11 `EntityTable` field declarations (lines 65-77). Remove the 11 entries from the `clearAllData()` transaction list + `.clear()` calls (lines 144-176) and from the `DatabaseCounts` interface + `count()` helpers (lines 196-230).

- [ ] **Step 3: Add the deletion migration.** In the `constructor`, after the existing `this.version(DATABASE_VERSION).stores(TABLE_INDEXES);`, Dexie auto-drops tables absent from the new `TABLE_INDEXES` when the version increments — confirm `DATABASE_VERSION` is now 7 and the gamification keys are gone from `TABLE_INDEXES`. (Dexie removes a store when a higher version's schema omits it. No explicit `.stores({table: null})` needed because the whole `TABLE_INDEXES` object is the v7 schema and the version bumped.)

- [ ] **Step 4: Verify**

```bash
npm run check > /tmp/check.log 2>&1; grep -niE "tka-database|database_constants|UserXP|UserAchievement|XPGainEvent|DailyChallenge" /tmp/check.log | grep -iE "error|cannot find" || echo "DB CLEAN"
```

### Task 4.2: Strip denormalized XP fields from user model + repository

**Files:**
- Modify: `src/lib/shared/community/services/user-repository.ts` (imports of `firestore-collections`, `achievement-definitions`, `achievement-models`; any `totalXP`/`currentLevel`/`achievementCount` read/write)
- Modify: `src/lib/shared/community/domain/models/enhanced-user-profile.ts` (import + `totalXP`/`currentLevel`/`achievementCount` fields)
- Modify: `src/lib/shared/community/domain/models/user-firestore-schemas.ts` (same fields)
- Modify: `src/lib/shared/auth/services/user-document-manager.ts` (stop initializing xp fields)

- [ ] **Step 1:** Remove the gamification imports and the `totalXP` / `currentLevel` / `achievementCount` field definitions + any code that reads/writes them. Find:

```bash
grep -rn "totalXP\|currentLevel\|achievementCount\|gamification/" src/lib/shared/community src/lib/shared/auth/services/user-document-manager.ts --include=*.ts
```
Remove all. (Leave unrelated `level` fields that are not XP-level — verify each match's context.)

- [ ] **Step 2: Verify**

```bash
npm run check > /tmp/check.log 2>&1; grep -niE "user-repository|enhanced-user-profile|user-firestore|user-document-manager" /tmp/check.log | grep -iE "error|cannot find" || echo "USER MODEL CLEAN"
```

### Task 4.3: Remove XP from analytics

**Files:**
- Modify: `src/lib/shared/analytics/domain/models/activity-event.ts` (remove `"xp_earn"`, `"achievement_unlock"` event types; `"achievement"` category if now unused)
- Modify: `src/lib/shared/analytics/services/posthog-activity-logger.ts` (remove emit sites for those types)
- Modify: `src/lib/features/admin/services/user-metrics-analyzer.ts` (remove XP metrics)

- [ ] **Step 1:** Remove the listed types + their emit/usage sites. Find:

```bash
grep -rn "xp_earn\|achievement_unlock\|totalXP\|xpEarned" src/lib/shared/analytics src/lib/features/admin/services/user-metrics-analyzer.ts
```

- [ ] **Step 2: Verify**

```bash
npm run check > /tmp/check.log 2>&1; grep -niE "analytics|user-metrics" /tmp/check.log | grep -iE "error|cannot find" || echo "ANALYTICS CLEAN"
```

### Task 4.4: Firestore rules

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1:** Remove the root gamification blocks (137-222): `userAchievements`, `userXP`, `xpEvents`, `dailyChallenges`, `weeklyChallenges`, `skillProgressions`, `trainChallenges`, `userChallengeProgress`, `userStreaks`, `achievementNotifications`. **KEEP** `announcements` (191-195 — not gamification).

- [ ] **Step 2:** Remove the per-user gamification subcollection rules (~338-386): `achievements`, `xp`, `xpEvents`, `challengeProgress`, `streak`, `weeklyChallengeProgress`/`trainChallengeProgress` (497, 509). **KEEP** `gamification/{docId}` (376 — prop collection) and `notifications` (383 — shared with Inbox/moderation).

- [ ] **Step 3: Validate rules syntax**

```bash
grep -nE "match /userXP|match /userAchievements|match /xpEvents|match /userStreaks|match /dailyChallenges|match /weeklyChallenges|match /trainChallenges|match /skillProgressions|match /userChallengeProgress|match /achievementNotifications" firestore.rules || echo "ROOT RULES REMOVED"
grep -nE "match /gamification|match /notifications" firestore.rules
```
Expected: `ROOT RULES REMOVED`; the `gamification` + `notifications` matches still present.

> Rules deploy is a separate `firebase deploy --only firestore:rules` step Austen runs when ready — not part of this code commit.

### Task 4.5: i18n key cleanup + final green gate

**Files:**
- Modify: `messages/en.json` + `messages/{es,fr,de,pt,it,ru,ko,ar,zh}.json` (and any other locale present)

- [ ] **Step 1:** Remove orphaned keys. Identify them from `en.json` first:

```bash
grep -niE "\"(train_.*challenge|train_sort_xp|tab_.*challenges|tab_desc_.*challenges|module_.*challenge)" messages/en.json
grep -niE "\"(.*_xp_|xp_reward|achievement_|streak_|level_up|daily_challenge|weekly_challenge|skill_mastery)" messages/en.json | head -40
```
Cross-check each candidate key is no longer referenced in `src`:

```bash
# for a key K:  grep -rn "t(\"K\")\|\"K\"" src --include=*.svelte --include=*.ts
```
Remove only keys with zero `src` references. Apply the same deletions across all locale files (same keys).

- [ ] **Step 2: Full green gate**

```bash
npm run check > /tmp/check.log 2>&1; grep -niE "error|cannot find|is not exported" /tmp/check.log | head -40
npm run build > /tmp/build.log 2>&1; tail -20 /tmp/build.log
```
Both must be green. Then grep-proof the teardown:

```bash
grep -rn "trackAction\|trackXP\|XP_REWARDS\|getAchievementManager\|XPToast\|gamification/init\|gamification/services/achievement\|gamification/domain/models/achievement\|gamification/domain/models/challenge\|streak-tracker\|leaderboard-manager" src --include=*.ts --include=*.svelte | grep -v "prop-" || echo "TEARDOWN COMPLETE — no XP refs remain"
```
Expected: `TEARDOWN COMPLETE`.

- [ ] **Step 3: Commit Phases 2–4** (each phase's own paths; run these once green). Example final commit grouping:

```bash
# Phase 2
git commit -m "refactor(gamification): delete XP/achievement engine + dead display UI" -- <phase-2 deleted+modified paths>
# Phase 3
git commit -m "refactor(train): remove Challenges tab; keep Practice + Progress" -- <phase-3 paths>
# Phase 4
git commit -m "refactor(persistence,community,analytics): drop XP tables/fields/rules/i18n" -- <phase-4 paths>
```
List exact paths per commit from `git status --short` — only files you changed in this teardown. Leave any unrelated staged/modified files alone (other agents' work).

---

## Self-review coverage map (spec → tasks)

| Spec item | Task |
|---|---|
| Stop save/publish/feedback/login awards | 1.1, 1.2, 1.3 |
| Unmount toasts + remove boot | 1.3 |
| Delete engine sub-tree (keep prop) | 2.1 |
| Delete dead UI (rankings/leaderboard/community challenges) | 2.2 |
| Streak UI surfaces (NEW — found via importer graph) | 2.3 |
| COMMUNITY_TABS challenges | 2.4 |
| Train Challenges tab removal | 3.1, 3.2 |
| session-completion-processor rewrite + ResultsScreen XP | 3.3 |
| Admin challenge tooling | 3.4 |
| Dexie tables + version bump | 4.1 |
| Denormalized user fields | 4.2 |
| Analytics xp_earn/achievement_unlock | 4.3 |
| Firestore rules (keep prop + notifications) | 4.4 |
| i18n + final green gate | 4.5 |
| Prop collection + Inbox untouched | 2.1 Step 1, 4.4 Step 2 (verified) |

## Risks (carried from spec)
1. Inbox `/notifications` collision — KEEP the rule + collection (4.4 Step 2). Only the Dexie `achievementNotifications` table is gamification-only (4.1).
2. Prop isolation — re-verified in 2.1 Step 1 before deletion.
3. Dexie deletion = version bump 6→7 (4.1); Dexie drops omitted stores on upgrade.
4. Phases 2–4 are one red→green window (engine deletion breaks Train + db consumers); commit per-phase once the full `check`+`build` is green at 4.5.
