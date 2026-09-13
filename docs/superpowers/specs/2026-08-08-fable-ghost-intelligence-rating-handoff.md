# Ghost Intelligence Rating - Handoff (2026-08-08)

## Mission

Rate the Ghost's current intelligence from observed behavior and code, without
accepting the previous 7.5 label as the answer. Define the rubric first, then
judge whether the system earns its score. The current design is documented in
[the predictive judgment spec](shipped/2026-08-06-ghost-predictive-judgment-design.md),
which extends the earlier [activity intelligence](2026-08-06-ghost-activity-intelligence-design.md)
and [experience learning](shipped/2026-08-06-ghost-experience-learning-design.md)
specs. This handoff is for a read-only assessment. Do not change the Ghost until
Austen explicitly approves the next half-point.

## Done - verified

- Commit `792176a725` added the coherent activity planner, physical sidebar
  reading, session memory, developer HUD, activity episodes, and typed activity
  predictions. The key owners are
  `src/lib/shared/attract/domain/activities.ts`,
  `activity-experience.ts`, `activity-prediction.ts`, and
  `services/mind.svelte.ts`.
- Commits `98f5204fb3`, `638fdf7c41`, and `a006fee71c` added and formatted the
  permanent prediction contracts. Commit `d03fd0d887` recorded the verified
  design status.
- Fresh 1,000-click proof on 2026-08-08:
  `GHOST_1000_REPORT=1 pnpm exec vitest run --environment jsdom tests/unit/attract/ghost-session-sim.test.ts -t "retains episodic judgment through 1,000 real presses"`
  passed. Seed 7 produced 1,000 real presses and 1,087 decisions over 94.22
  simulated minutes. It recorded 260 predictions, retained 200 episodes,
  explored 76 uncertain choices, and counted 231 predictions at or above 75%
  accuracy. Mean prediction error was 0.157. The first 30 episodes averaged
  0.260 error; the latest 30 averaged 0.122. There were two confident misses,
  zero premature replays, eight paid gallery opens, and 14 browse-only passes.
- Fresh fleet proof on 2026-08-08:
  `GHOST_FLEET=1 GHOST_FLEET_SESSIONS=12 GHOST_FLEET_TICKS=400 pnpm exec vitest run --environment jsdom tests/unit/attract/ghost-fleet.test.ts`
  passed one test in 48.48 seconds. All 12 sessions had zero failed performs,
  zero unexplained idle ticks, zero premature unchanged replays, and zero
  repeat visits after a room proved barren. Initial prediction error averaged
  about 0.26; recent error ranged from 0.156 to 0.210. Every intention fired
  somewhere in the fleet.
- The ordinary Attract run on 2026-08-08 passed 62 tests across eight files,
  including all eight session-simulation contracts. One separate annotation
  integrity test failed because of live option-picker edits listed below, so the
  whole directory is not currently green.

## Believed done - unverified

- The current live-browser experience was not re-tested on 2026-08-08. The
  evidence above uses the real mind and intention code against the synthetic app
  model, not a 1,000-click Chrome session.
- The sidebar hover choreography and developer overlay were implemented in
  `792176a725`, but intervening Create UI work may have changed the DOM contract.
  Treat their present runtime behavior as unverified until inspected.
- The service publishes full candidate forecasts to `GhostMindStatus`, but the
  visible overlay footer currently renders only candidate id and final score.
  Forecast dimensions are inspectable in state, not fully visible in the HUD.

## In flight

- There are no uncommitted changes under `src/lib/shared/attract/` or
  `tests/unit/attract/` at handoff time.
- The shared `main` checkout contains many unrelated edits from other live
  sessions. Do not revert or absorb them into Ghost work.
- `tests/unit/attract/ghost-safety.test.ts` currently fails
  `never annotates a kind without also marking it safe`. The offenders are
  `OptionInteractionHint.svelte` and `OptionPickerContent.svelte`, both part of
  concurrent option-picker work. This was not caused by the Ghost commits, but
  it may affect the live annotation contract once that work lands.
- `test-results/ghost-fleet.md` is a freshly generated, ignored report from the
  12-session run. `static/ghost-brain-model.html` and
  `output/ghost-brain-model.html` are also ignored local exports. On Austen's
  current dev server the model is available at
  `https://localhost:5173/ghost-brain-model.html`.

## Loose ends (ranked)

1. Define an intelligence rubric before assigning a number. Separate coherent
   presentation behavior, memory, prediction, learning, planning depth,
   generalization, and autonomy.
2. Decide whether `activity-prediction.ts` is truly counterfactual intelligence
   or a contextual outcome estimator. It predicts aggregate activity outcomes
   from similar episodes and goal priors. It does not simulate alternative
   future world states or compare different step sequences inside an activity.
3. Audit the evidence for score inflation. In the 1,000-click run, average
   episode value was 0.91, 217 of 260 episodes were high value, only five were
   low value, and experience reduced only three selections. The synthetic world
   may be too forgiving to strongly test negative learning.
4. Inspect the fleet's diversity. Every 400-tick seed produced exactly 347
   decisions and 53 presentation waits. Actions varied by seed, but the shared
   timing skeleton is deterministic. Judge how much that limits the result.
5. Explain the last forecast: six same-activity matches still yielded 0.246
   confidence and 0.754 uncertainty. Determine whether that is healthy caution,
   a context-similarity artifact, or under-confident calibration.
6. If the score is below 7.5, name the smallest behavioral capability that
   would earn the next half-point. Do not implement it without Austen's approval.

## Decisions already made

- Austen chose an iterative intelligence ladder on 2026-08-06: creep toward
  10.0 in 0.5-point increments. The latest approved implementation target was
  7.5.
- Austen requires the Ghost to physically move to the sidebar, trigger the real
  desktop hover expansion, read the rendered labels, pause, and then choose.
  Stored labels may speed recognition later, but cannot replace the first read.
- The Ghost's intelligence remains deterministic, local, inspectable, and
  session-scoped. No remote model call or persistent user profiling was added.
- Learned judgment may change selection odds but cannot imprison behavior. The
  prediction multiplier is bounded from 0.75 to 1.25, and selection remains a
  weighted draw from the top four activities.
- No shared Fish/Ghost intelligence core was extracted in this tranche. The
  current learning code is Ghost-specific pure domain logic.
- Fable's job is to rate first. A lower score is useful if the reasoning is tied
  to observed behavior and architectural limits.

## Gotchas

- Read `activity-prediction.ts` closely. The name "prediction" is accurate, but
  the model is a weighted episodic estimator, not a learned transition model.
- Activity memory is capped at 200 retained episodes and resets with a new
  `createMemory` session. Lifetime counters survive trimming, not page reloads.
- The predictor falls back from same-activity evidence to weaker same-goal
  evidence, then to a hard-coded goal prior with zero confidence.
- Prediction error is a weighted absolute error across completion,
  achievement, visible change, discovery, novelty, and value. Improvement on
  that metric partly reflects the stable simulator and increasingly familiar
  activity contexts.
- The Ghost commits to an authored multi-step activity plan. It can skip an
  optional step or abandon on a missing required step, but it does not re-plan
  the remaining sequence by imagining alternatives.
- The fleet spent 82.2% of decisions in Create, 12.8% in Library, 2.4% in Play,
  2.1% in Learn, and 0.6% in Museum. Breadth exists, but depth is concentrated.
- Port 5173 is Austen's HTTPS dev server. Do not start, stop, or restart it. Any
  browser assessment requires the Chrome DevTools workflow and the current
  permission rules in `AGENTS.md`.
