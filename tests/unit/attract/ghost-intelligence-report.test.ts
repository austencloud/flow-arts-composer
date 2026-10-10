/**
 * The intelligence measurement harness.
 *
 * Not a contract — an instrument. It runs long sessions and writes one JSON
 * file of behavioural metrics so a change to the Ghost's mind can be argued
 * with numbers instead of vibes. Run it before a change and after, with the
 * same session count and length, then diff the two files.
 *
 *   GHOST_REPORT=1 GHOST_REPORT_LABEL=before pnpm exec vitest run \
 *     --environment jsdom tests/unit/attract/ghost-intelligence-report.test.ts
 *
 * The headline metric is WASTE: a step that landed, was not a perception, and
 * changed nothing observable in the world. A ghost that is learning should
 * waste less in the back half of a session than the front half, and a smarter
 * ghost should waste less overall. Everything else is there to explain why the
 * waste number moved — or to catch it moving for a bad reason (fewer wasted
 * steps because it stopped doing anything at all is not an improvement).
 *
 * Seeds do not survive a change to the mind: any edit shifts RNG consumption,
 * so seed 7 after is a different session from seed 7 before. That is why this
 * reports DISTRIBUTIONS over many sessions rather than a single replay.
 *
 * ---------------------------------------------------------------------------
 * FINDING, 2026-08-09 — the step-learning layer is a NULL RESULT. Read this
 * before spending another rung of work on the Ghost's planning.
 *
 * Measured A/B, 30 sessions per arm, 847 decisions each. The control arm was
 * produced with GHOST_MIN_STEP_EVIDENCE=999999, which puts the evidence bar out
 * of reach so no step is ever `proven` and nothing is pruned, re-planned, or
 * noticed as a dud. It is a clean switch: the pruned/noticed/replanned counters
 * read exactly 0 in control and non-zero in treatment.
 *
 *              control    treatment    SE of difference
 *   wasteRate   0.0920      0.0898         0.0032
 *   wasteLate   0.0882      0.0850         0.0036
 *   wasteDrift -0.0076     -0.0098         0.0052
 *
 * Every delta is inside one standard error. The layer fires (≈19 noticed duds,
 * 24 pruned steps, 7 re-plans per session) and changes no outcome.
 *
 * Two reasons, and the second is the one that matters:
 *
 *   1. Nothing rewards a lean plan. Episode value is
 *      achievement·0.6 + completion·0.2 + novelty·0.2 — there is no waste term
 *      anywhere. Pruning produces a variant plan that competes in
 *      `imagineActivityFutures` against the unpruned original and scores
 *      identically, so selection never converges on it. The Ghost can see the
 *      dead step and can build a plan without it, and has no reason to prefer
 *      that plan.
 *
 *   2. A THIRD OF THE WASTE SIGNAL IS THIS HARNESS, NOT THE GHOST.
 *      `jump-to-section` and `what-is-this-button` waste on 100% of ~600
 *      attempts because the synthetic app model below has no section anchors
 *      and no button-help surface — there is nothing there for them to move.
 *      Do not tune the value function against the waste number until the sim
 *      grows those surfaces; that is fitting the Ghost to a test double.
 *
 * The conclusion drawn with Austen: stop here. Strip the artifacts and real
 * waste is ~6%, most of it `play-it` replays that read to a viewer as a person
 * watching their sequence again — wanted behavior, not a defect. The Ghost's
 * planning is already finer-grained than anyone perceives in a 90-second glance
 * at a kiosk. The remaining gap is PRESENTATION, not cognition: the two changes
 * that visibly moved realism in this cycle (the pointer resting on what it
 * looks at instead of drifting to a screen corner, and the mind HUD covering
 * the Ghost) were both caught by eye in seconds and are invisible to every
 * metric in this file.
 * ---------------------------------------------------------------------------
 */

import { describe, expect, it, vi } from "vitest";

// jsdom has no layout, so the real visibility sensors reject every element and
// the ghost finds nothing to do. Same mock the fleet uses — without it every
// session dies after the first press.
vi.mock("#lib/shared/attract/services/sensors.js", () => ({
  isVisible: () => true,
  visibleAll: (selector: string) => [
    ...document.querySelectorAll<HTMLElement>(selector),
  ],
  createSensors: () => ({ sense: () => ({}) }),
  readRoute: () => ({ moduleId: null, tabId: null }),
}));

import { mkdirSync, writeFileSync } from "node:fs";
import { runSession, type SessionRecord } from "./sim/run-session";

const ENABLED = !!process.env.GHOST_REPORT;
const LABEL = process.env.GHOST_REPORT_LABEL ?? "run";
const SESSIONS = Number(process.env.GHOST_REPORT_SESSIONS ?? 10);
const DECISIONS = Number(process.env.GHOST_REPORT_DECISIONS ?? 900);

/** Did this step move ANYTHING in the app — drawer, overlay, filter, playback? */
function changedWorld(current: SessionRecord, previous: SessionRecord): boolean {
  return (
    current.fingerprint !== previous.fingerprint ||
    current.presentationRevision !== previous.presentationRevision
  );
}

/** Did this step change something the audience is actually looking at? */
function changedVisibly(
  current: SessionRecord,
  previous: SessionRecord
): boolean {
  return (
    current.seqLen !== previous.seqLen ||
    current.word !== previous.word ||
    current.effects !== previous.effects ||
    current.presentationRevision !== previous.presentationRevision
  );
}

interface WasteSlice {
  actions: number;
  wasted: number;
  rate: number;
}

function wasteOf(log: SessionRecord[], from: number, to: number): WasteSlice {
  let actions = 0;
  let wasted = 0;
  for (let index = Math.max(1, from); index < to; index++) {
    const record = log[index]!;
    if (!record.ok || record.operation === "perceive") continue;
    actions += 1;
    if (!changedWorld(record, log[index - 1]!)) wasted += 1;
  }
  return { actions, wasted, rate: actions ? wasted / actions : 0 };
}

function mean(values: number[]): number {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

/**
 * Standard error of the mean. Without it a 0.003 difference between two runs
 * reads as a result when it is the noise floor — every edit to the mind shifts
 * RNG consumption, so no two runs sample the same sessions.
 */
function sem(values: number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  const variance =
    values.reduce((total, value) => total + (value - average) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance / values.length);
}

function round(value: number, places = 4): number {
  return Number(value.toFixed(places));
}

describe.skipIf(!ENABLED)("ghost intelligence report", () => {
  it(
    "measures long sessions and writes the metrics file",
    { timeout: 30 * 60_000 },
    async () => {
      const sessions = [];

      for (let index = 0; index < SESSIONS; index++) {
        const seed = 1000 + index * 37;
        document.body.innerHTML = "";
        const session = runSession(seed, DECISIONS);
        await session.run();

        const log = session.log;
        const memory = session.mind.memory;
        const experience = memory.experience;
        const half = Math.floor(log.length / 2);

        const overall = wasteOf(log, 1, log.length);
        const early = wasteOf(log, 1, half);
        const late = wasteOf(log, half, log.length);

        // Landed, not a perception, and nothing the audience can see moved.
        let visibleActions = 0;
        let invisibleActions = 0;
        for (let i = 1; i < log.length; i++) {
          const record = log[i]!;
          if (!record.ok || record.operation === "perceive") continue;
          visibleActions += 1;
          if (!changedVisibly(record, log[i - 1]!)) invisibleActions += 1;
        }

        // Which intentions burn turns without moving the world, and how often.
        const byIntention: Record<string, { tried: number; wasted: number }> =
          {};
        for (let i = 1; i < log.length; i++) {
          const record = log[i]!;
          if (!record.ok || record.operation === "perceive") continue;
          const entry = (byIntention[record.intentionId] ??= {
            tried: 0,
            wasted: 0,
          });
          entry.tried += 1;
          if (!changedWorld(record, log[i - 1]!)) entry.wasted += 1;
        }

        const completed = [...memory.activities.completed.values()].reduce(
          (total, count) => total + count,
          0
        );
        const abandoned = [...memory.activities.abandoned.values()].reduce(
          (total, count) => total + count,
          0
        );
        const episodes = experience.episodes;
        const earlyEpisodes = episodes.slice(0, 30);
        const lateEpisodes = episodes.slice(-30);

        sessions.push({
          seed,
          decisions: log.length,
          minutes: round((log.at(-1)?.t ?? 0) / 60_000, 1),
          presses: session.app.presses.length,
          failedPerforms: log.filter((record) => !record.ok).length,
          idleTicks: session.telemetry.idleTicks,

          waste: {
            actions: overall.actions,
            wasted: overall.wasted,
            rate: round(overall.rate),
            earlyRate: round(early.rate),
            lateRate: round(late.rate),
            /** Negative = the ghost got more efficient as the session ran. */
            drift: round(late.rate - early.rate),
            /** Softer bar: moved the app, but not the picture. */
            invisibleRate: round(invisibleActions / Math.max(1, visibleActions)),
          },
          wasteByIntention: byIntention,

          activities: {
            completed,
            abandoned,
            abandonRate: round(abandoned / Math.max(1, completed + abandoned)),
            stepsPerCompleted: round(overall.actions / Math.max(1, completed), 2),
          },

          episodes: {
            recorded: experience.recorded,
            retained: episodes.length,
            /** Whole activities that finished having accomplished nothing. */
            futile: episodes.filter(
              ({ evidence }) =>
                !evidence.presentationChanged &&
                !evidence.sequenceChanged &&
                !evidence.effectsChanged &&
                evidence.conceptsLearned === 0 &&
                evidence.encountersLearned === 0
            ).length,
            meanValue: round(mean(episodes.map((e) => e.value))),
            earlyMeanValue: round(mean(earlyEpisodes.map((e) => e.value))),
            lateMeanValue: round(mean(lateEpisodes.map((e) => e.value))),
            low: experience.lowValueEpisodes,
            high: experience.highValueEpisodes,
          },

          prediction: {
            initialError: round(
              experience.initialPredictionErrorTotal /
                Math.max(1, experience.initialPredictionCount)
            ),
            recentError: round(mean(lateEpisodes.map((e) => e.predictionError))),
            accurate: experience.accuratePredictions,
            confidentMisses: experience.confidentMisses,
          },

          // How far the step ledger actually reaches. A mechanism that only
          // ever sees 2 samples per key can never act, and would look like a
          // failed idea when it is really a starvation problem.
          stepLedger: (() => {
            const stats = [...(experience.stepStats?.entries() ?? [])];
            const proven = stats.filter(([, s]) => s.attempts >= 4);
            return {
              keys: stats.length,
              proven: proven.length,
              deadProven: proven.filter(
                ([, s]) => s.productive / s.attempts <= 0.15
              ).length,
              meanAttempts: round(
                mean(stats.map(([, s]) => s.attempts)),
                2
              ),
              /** Keys with only one or two samples — evidence starvation. */
              starved: stats.filter(([, s]) => s.attempts < 4).length,
            };
          })(),
          repair: {
            prunedSteps: experience.prunedSteps ?? 0,
            repairedActivities: experience.repairedActivities ?? 0,
            noticedDuds: experience.noticedDuds ?? 0,
            replannedSteps: experience.replannedSteps ?? 0,
          },
          futileByGoal: episodes.reduce<Record<string, [number, number]>>(
            (acc, { goal, evidence }) => {
              const slot = (acc[goal] ??= [0, 0]);
              slot[1] += 1;
              if (
                !evidence.presentationChanged &&
                !evidence.sequenceChanged &&
                !evidence.effectsChanged &&
                evidence.conceptsLearned === 0 &&
                evidence.encountersLearned === 0
              )
                slot[0] += 1;
              return acc;
            },
            {}
          ),

          judgment: {
            informed: experience.informedSelections,
            boosted: experience.boostedSelections,
            reduced: experience.reducedSelections,
            exploratory: experience.exploratorySelections,
            counterfactual: experience.counterfactualSelections,
            divergences: experience.counterfactualDivergences,
            suppressed: experience.suppressedFutures,
          },
        });
      }

      const aggregate = {
        label: LABEL,
        sessions: SESSIONS,
        decisionsRequested: DECISIONS,
        wasteRate: round(mean(sessions.map((s) => s.waste.rate))),
        wasteRateSem: round(sem(sessions.map((s) => s.waste.rate))),
        wasteEarly: round(mean(sessions.map((s) => s.waste.earlyRate))),
        wasteLate: round(mean(sessions.map((s) => s.waste.lateRate))),
        wasteLateSem: round(sem(sessions.map((s) => s.waste.lateRate))),
        wasteDrift: round(mean(sessions.map((s) => s.waste.drift))),
        wasteDriftSem: round(sem(sessions.map((s) => s.waste.drift))),
        sessionsThatImproved: sessions.filter((s) => s.waste.drift < 0).length,
        invisibleRate: round(mean(sessions.map((s) => s.waste.invisibleRate))),
        futileEpisodeRate: round(
          mean(sessions.map((s) => s.episodes.futile / Math.max(1, s.episodes.retained)))
        ),
        abandonRate: round(mean(sessions.map((s) => s.activities.abandonRate))),
        stepsPerCompleted: round(
          mean(sessions.map((s) => s.activities.stepsPerCompleted)),
          2
        ),
        meanEpisodeValue: round(mean(sessions.map((s) => s.episodes.meanValue))),
        episodeValueDrift: round(
          mean(
            sessions.map((s) => s.episodes.lateMeanValue - s.episodes.earlyMeanValue)
          )
        ),
        predictionErrorInitial: round(
          mean(sessions.map((s) => s.prediction.initialError))
        ),
        predictionErrorRecent: round(
          mean(sessions.map((s) => s.prediction.recentError))
        ),
        ledgerKeys: round(mean(sessions.map((s) => s.stepLedger.keys)), 1),
        ledgerProven: round(mean(sessions.map((s) => s.stepLedger.proven)), 1),
        ledgerStarved: round(mean(sessions.map((s) => s.stepLedger.starved)), 1),
        ledgerDeadProven: round(
          mean(sessions.map((s) => s.stepLedger.deadProven)),
          1
        ),
        prunedSteps: round(mean(sessions.map((s) => s.repair.prunedSteps)), 1),
        repairedActivities: round(
          mean(sessions.map((s) => s.repair.repairedActivities)),
          1
        ),
        noticedDuds: round(mean(sessions.map((s) => s.repair.noticedDuds)), 1),
        replannedSteps: round(
          mean(sessions.map((s) => s.repair.replannedSteps)),
          1
        ),
        totalPresses: sessions.reduce((total, s) => total + s.presses, 0),
        totalFailedPerforms: sessions.reduce(
          (total, s) => total + s.failedPerforms,
          0
        ),
        meanDecisions: round(mean(sessions.map((s) => s.decisions)), 1),
      };

      mkdirSync("test-results", { recursive: true });
      writeFileSync(
        `test-results/ghost-intel-${LABEL}.json`,
        JSON.stringify({ aggregate, sessions }, null, 2)
      );
      console.log(`GHOST_INTEL ${JSON.stringify(aggregate)}`);

      // The instrument itself must be sound: no session may be a dud, or the
      // averages describe a ghost that was not running.
      expect(sessions.every((s) => s.decisions > 100)).toBe(true);
      expect(aggregate.totalFailedPerforms).toBe(0);
    }
  );
});
