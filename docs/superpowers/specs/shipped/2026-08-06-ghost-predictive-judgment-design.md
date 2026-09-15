# The Ghost predicts what its choices will do

**Date:** 2026-08-06
**Status:** Shipped. Implemented and verified.
**Extends:** `2026-08-06-ghost-experience-learning-design.md`

**Reconciliation 2026-09-13:** the pure forecasting module this spec adds beside
activity experience is present at
`src/lib/shared/attract/domain/activity-prediction.ts`. Re-ran
`vitest run --config tests/config/vitest.config.ts tests/unit/attract/` against
`c4be1619`: 9 files, 68 tests passed, 2 skipped (env-gated fleet test). Moved
out of `active/`. Note: the fleet numbers quoted under Verification below are
the original 2026-08 measurements and were not re-measured in this pass.

## The 7.5 target

At 7.0 the Ghost can retrieve the value of similar past activities. That is
useful judgment, but it is still retrospective. One number cannot distinguish
"this usually changes the sequence" from "this usually teaches me something"
or show when the Ghost is guessing.

The 7.5 target is a small, inspectable world model:

```text
consider each available activity
  -> predict its observable consequences
  -> weigh expected value and uncertainty
  -> choose and carry out one activity
  -> compare the forecast with the measured result
  -> use prediction accuracy to calibrate later confidence
```

This follows the useful structure of model-based agents without introducing a
neural model, remote inference, hidden persistence, or unconstrained planning.
DreamerV3 separates predicted outcomes, their value, and action selection.
Uncertainty-aware planning research also treats uncertain regions as useful
exploration targets while limiting the influence of unreliable predictions.

## The forecast

Every available activity receives a forecast before selection:

- probability of completing the activity;
- expected goal achievement;
- probability of changing the visible presentation;
- probability of discovering a concept or control;
- expected result novelty;
- expected total value;
- confidence, reliability, and uncertainty;
- evidence source: the same activity, another activity with the same goal, or
  a cold-start goal prior.

The forecast is derived from measured activity episodes. It first retrieves
similar episodes for the same activity. If none exist, it may transfer weaker
evidence from activities with the same goal. If neither exists, a typed goal
prior makes the uncertainty explicit instead of pretending to know.

## Selection under uncertainty

The authored appeal, cooldown, and per-session repetition brake remain the
base personality. Prediction adds a bounded multiplier from 0.75 to 1.25.
Expected value moves the score up or down. An uncertain, novel option receives
a small exploration bonus so the Ghost can improve its model. Low reliability
limits how strongly confident predictions may influence selection.

The result stays stochastic. A forecast changes the odds; it never bans an
available activity or turns selection into a fixed argmax tour.

## Calibration by surprise

At the end of an activity, the Ghost builds the same six-dimensional outcome
vector from actual evidence and calculates weighted absolute prediction error.
Goal achievement and total value receive the most weight. Completion, visible
change, discovery, and novelty remain independently observable.

Each episode stores its forecast, error, accuracy, and surprising dimensions.
Later forecasts estimate reliability from the accuracy of their retrieved
episodes. A confident miss therefore lowers future trust in that prediction
path. A correct forecast raises it. Reliability is shrunk toward neutral while
evidence is sparse, so one result cannot create false certainty.

## Reuse decision

Internal searches for prediction, forecast, counterfactual, uncertainty, and
calibration found motion tracking, Glicko rating uncertainty, and the existing
Ghost experience retriever. None models activity consequences. This work
extends `activity-experience.ts` for observation and episode recording, and
adds one adjacent pure domain module for forecasting and calibration.

Current maintained agent frameworks are too broad for this deterministic,
session-local system and would obscure the evidence path. The implementation
therefore uses the project's existing pure-domain and seeded-memory patterns.

## Scope

- Add forecast and calibration types to the Ghost's domain memory.
- Add a pure activity prediction module beside activity experience.
- Pass the selected forecast into the active episode.
- Evaluate forecast accuracy when an activity completes or is abandoned.
- Expose each candidate's predicted effects and uncertainty in mind status.
- Extend unit, 1,000-click, and multi-seed simulation contracts.

The public monologue does not speak in probabilities. No new authored thought
lines, DOM controls, storage, network access, or visual layout are introduced.

## Behavioral contracts

- Every candidate has a forecast before selection, including cold starts.
- A cold-start forecast reports high uncertainty and receives only a small,
  bounded exploration bonus.
- Repeated productive activity episodes predict visible change and high value.
- Repeated empty episodes predict lower achievement and value.
- Same-goal transfer is weaker than same-activity evidence.
- A confident miss lowers later reliability.
- Every recorded episode has exactly one prediction evaluation.
- Recent prediction error improves over the initial calibration window in the
  1,000-click session and across the seeded fleet.
- Existing no-failure, no-premature-replay, barren-room, sidebar-memory, and
  activity-coverage contracts remain green.

## Verification

The seeded 1,000-click session recorded 260 evaluated predictions. Mean error
fell from 0.260 across the first 30 activities to 0.122 across the latest 30.
It produced 231 predictions at or above 75% accuracy, explored 76 uncertain
choices, and registered two confident misses that now temper later reliability.

Across 12 independent 400-tick sessions, recent error averaged about 0.17
against about 0.26 during cold start. The fleet retained zero failed actions,
zero unexplained idle ticks, zero premature unchanged replays, and zero repeat
visits after a room proved barren. All Attract tests passed: 63 tests across
nine files, with the env-gated fleet test skipped in the ordinary suite and
verified separately.
