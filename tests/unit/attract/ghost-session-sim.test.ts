/**
 * Session simulator — watch the presenter for a few hundred decisions and
 * write down what it actually did.
 *
 * Austen (2026-08-05): "he'll set a turn value and say I wonder let's see what
 * turns but then he won't apply an option, or he'll apply one option and then
 * he'll play it and then he'll clear the sequence. He won't build a whole
 * sequence... I'm not even seeing him mess with generate."
 *
 * Those are claims about decision ORDER, and decision order is produced by
 * `appeal x novelty x freshness x momentum` against a set of preconditions —
 * no pixels involved. So this runs the REAL mind, the REAL scoring and the REAL
 * intention bag against a simulated app (sim/app-model.ts) on a virtual clock,
 * and reports the session the way you would judge a stranger using the app.
 *
 * The assertions below are the personality contract. They are deliberately
 * about behaviour a person would notice from across a room, not about
 * implementation.
 *
 * `GHOST_SIM_REPORT=1` writes the full transcript to
 * `test-results/ghost-session.md`.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("$lib/shared/attract/services/sensors", () => ({
  isVisible: () => true,
  visibleAll: (selector: string) => [
    ...document.querySelectorAll<HTMLElement>(selector),
  ],
  createSensors: () => ({ sense: () => ({}) }),
  readRoute: () => ({ moduleId: null, tabId: null }),
}));

import { CONCEPTS } from "$lib/shared/attract/domain/intention";
import { PLAYBACK_REVISIT_MS } from "$lib/shared/attract/domain/episodic-memory";
import {
  analyze,
  runSession,
  type SessionRecord,
  type Stats,
} from "./sim/run-session";

const SESSION_TEST_TIMEOUT_MS = 60_000;

interface AuditedDecision {
  record: SessionRecord;
  presses: Array<{ kind: string; label: string; moduleId: string | null }>;
}

async function runToRealPresses(
  seed: number,
  targetPresses: number
): Promise<{
  session: ReturnType<typeof runSession>;
  decisions: AuditedDecision[];
}> {
  const session = runSession(seed, 1);
  const decisions: AuditedDecision[] = [];
  let ticks = 0;

  while (
    session.app.presses.length < targetPresses &&
    ticks < targetPresses * 4
  ) {
    const logStart = session.log.length;
    const pressStart = session.app.presses.length;
    await session.run();
    ticks += 1;

    const record = session.log[logStart];
    if (record) {
      decisions.push({
        record,
        presses: session.app.presses.slice(pressStart),
      });
    }
  }

  return { session, decisions };
}

function report(stats: Stats, log: SessionRecord[]): string {
  const rank = (m: Map<string, number>) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(
        ([k, v]) =>
          `| ${k} | ${v} | ${((v / stats.decisions) * 100).toFixed(1)}% |`
      )
      .join("\n");

  return [
    `# Ghost session — ${stats.decisions} decisions over ~${stats.minutes} simulated minutes`,
    ``,
    `- peak sequence length: **${stats.peakSeqLen}**`,
    `- longest unbroken run of building: **${stats.longestBuildRun}**`,
    `- sequence length when cleared: ${stats.seqLenAtClear.join(", ") || "never cleared"}`,
    `- failed performs: ${stats.failures}`,
    ``,
    `## What it came to understand`,
    ``,
    ...CONCEPTS.map((c) => `- **${c}**: ${stats.concepts.get(c) ?? "unaware"}`),
    ``,
    `## By intention`,
    ``,
    `| intention | n | share |`,
    `|---|---|---|`,
    rank(stats.byIntention),
    ``,
    `## By category`,
    ``,
    `| category | n | share |`,
    `|---|---|---|`,
    rank(stats.byCategory),
    ``,
    `## Where it spent its time`,
    ``,
    `| module | ticks | share |`,
    `|---|---|---|`,
    rank(stats.moduleTicks),
    ``,
    process.env.GHOST_SIM_REPORT
      ? `## Every decision`
      : `## First 80 decisions`,
    ``,
    ...log
      .slice(0, process.env.GHOST_SIM_REPORT ? Infinity : 80)
      .map(
        (r) =>
          `${String(Math.round(r.t / 1000)).padStart(4)}s  [${r.moduleId ?? "-"}${
            r.tabId ? "/" + r.tabId : ""
          }] len=${r.seqLen} fx=${r.effects}  ${r.intentionId}${r.ok ? "" : " (FAILED)"} — "${r.thought}"`
      ),
  ].join("\n");
}

describe("ghost session simulation", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it(
    "plays a long session and reports what it did",
    async () => {
      // GHOST_SIM_SEED reproduces a specific session — the fleet reports seeds,
      // and a seed you cannot replay is a bug report with no repro.
      const seed = Number(process.env.GHOST_SIM_SEED ?? 7);
      const session = runSession(seed, 400);
      await session.run();
      const stats = analyze(
        session.log,
        session.app.state.peakSeqLen,
        session.mind.memory.concepts
      );
      const text = report(stats, session.log);

      if (process.env.GHOST_SIM_REPORT) {
        const { writeFileSync, mkdirSync } = await import("node:fs");
        mkdirSync("test-results", { recursive: true });
        writeFileSync("test-results/ghost-session.md", text, "utf8");
      }
      // Always visible in the run output — this file exists to be read.
      console.log(text);

      expect(stats.decisions).toBeGreaterThan(100);
    },
    SESSION_TEST_TIMEOUT_MS
  );

  it(
    "builds sequences a person would recognise as sequences",
    async () => {
      const session = runSession(11, 300);
      await session.run();
      // A presenter that never gets past three steps is demonstrating a
      // start-placement picker, not a composer.
      expect(session.app.state.peakSeqLen).toBeGreaterThanOrEqual(6);
    },
    SESSION_TEST_TIMEOUT_MS
  );

  // Aggregated across seeds on purpose. A single seed's share of any one module
  // swings widely — tuning until one lucky seed clears a threshold would be
  // fitting the test to the run rather than measuring the behaviour.
  it(
    "spends real time in generate, not just construct",
    async () => {
      let generate = 0;
      let total = 0;
      for (const seed of [7, 23, 41]) {
        const session = runSession(seed, 300);
        await session.run();
        const stats = analyze(
          session.log,
          session.app.state.peakSeqLen,
          session.mind.memory.concepts
        );
        generate += stats.moduleTicks.get("create/generate") ?? 0;
        total += stats.decisions;
      }
      expect(generate / total).toBeGreaterThan(0.04);
    },
    SESSION_TEST_TIMEOUT_MS
  );

  it(
    "uses the sequence actions it can now reach",
    async () => {
      const session = runSession(7, 400);
      await session.run();
      const stats = analyze(
        session.log,
        session.app.state.peakSeqLen,
        session.mind.memory.concepts
      );
      // Extend is the LOOP payoff and the single most impressive press in the
      // app. Before 2026-08-06 none of this surface was annotated, so the count
      // here was structurally zero in every run ever recorded.
      expect(stats.byIntention.get("extend-it") ?? 0).toBeGreaterThan(0);
      expect(stats.byIntention.get("transform-it") ?? 0).toBeGreaterThan(0);
    },
    SESSION_TEST_TIMEOUT_MS
  );

  it(
    "arrives at an understanding rather than starting with one",
    async () => {
      const session = runSession(7, 400);
      await session.run();
      const concepts = session.mind.memory.concepts;
      // Every belief must be EARNED from a measured before/after delta, so a
      // fresh mind believes nothing and a long session believes several things.
      const fresh = runSession(7, 0);
      expect(fresh.mind.memory.concepts.size).toBe(0);
      expect(
        [...concepts.values()].filter((s) => s === "understood").length
      ).toBeGreaterThanOrEqual(4);
    },
    SESSION_TEST_TIMEOUT_MS
  );

  it(
    "does not fiddle turns more often than it adds steps",
    async () => {
      const session = runSession(5, 300);
      await session.run();
      const stats = analyze(
        session.log,
        session.app.state.peakSeqLen,
        session.mind.memory.concepts
      );
      const turns = stats.byIntention.get("fiddle-turns") ?? 0;
      const steps = stats.byIntention.get("add-step") ?? 0;
      expect(turns).toBeLessThan(steps);
    },
    SESSION_TEST_TIMEOUT_MS
  );

  it(
    "keeps a coherent mind through 400 real presses",
    async () => {
      const { session, decisions } = await runToRealPresses(7, 400);
      const presses = session.app.presses.slice(0, 400);
      const stepPresses = presses.filter((press) => press.kind === "step-nav");
      const latePresses = presses.slice(-100);
      const lateStepPresses = latePresses.filter(
        (press) => press.kind === "step-nav"
      );

      expect(session.app.presses.length).toBeGreaterThanOrEqual(400);
      expect(session.log.every((record) => record.ok)).toBe(true);
      expect(stepPresses.length / presses.length).toBeLessThan(0.2);
      expect(lateStepPresses.length / latePresses.length).toBeLessThan(0.25);

      for (const decision of decisions.filter(
        ({ record }) => record.intentionId === "step-through-it"
      )) {
        const labels = decision.presses.map((press) => press.label);
        if (labels[0] === "Restart") {
          expect(
            labels.slice(1).every((label) => label.startsWith("Next"))
          ).toBe(true);
        } else {
          expect(new Set(labels).size).toBe(1);
        }
      }

      let consecutiveNavigation = 0;
      let longestNavigationRun = 0;
      const navigationRuns: string[][] = [];
      let navigationRun: string[] = [];
      for (const { record } of decisions) {
        if (record.intentionId === "go-to-module") {
          consecutiveNavigation += 1;
          navigationRun.push(`${record.moduleId ?? "-"}:${record.thought}`);
          longestNavigationRun = Math.max(
            longestNavigationRun,
            consecutiveNavigation
          );
        } else {
          if (navigationRun.length > 1) navigationRuns.push(navigationRun);
          navigationRun = [];
          consecutiveNavigation = 0;
        }
      }
      if (navigationRun.length > 1) navigationRuns.push(navigationRun);
      expect(
        longestNavigationRun,
        JSON.stringify(navigationRuns)
      ).toBeLessThanOrEqual(1);

      for (const [index, { record }] of decisions.entries()) {
        if (!["go-to-module", "change-tab"].includes(record.intentionId)) {
          continue;
        }
        expect(decisions[index - 1]?.record.intentionId).toBe(
          "consider-navigation"
        );
      }

      let libraryOpens = 0;
      for (const { record } of decisions) {
        if (record.moduleId === "library") {
          if (record.intentionId === "open-someone-elses") libraryOpens += 1;
        } else if (libraryOpens > 0) {
          expect(libraryOpens).toBeLessThanOrEqual(1);
          libraryOpens = 0;
        }
      }
      if (libraryOpens > 0) expect(libraryOpens).toBeLessThanOrEqual(1);

      if (process.env.GHOST_CLICK_REPORT) {
        const count = (values: string[]) =>
          Object.fromEntries(
            [...new Set(values)]
              .map(
                (value) =>
                  [
                    value,
                    values.filter((candidate) => candidate === value).length,
                  ] as const
              )
              .sort((a, b) => b[1] - a[1])
          );
        console.log(
          "GHOST_CLICK_REPORT\n" +
            JSON.stringify(
              {
                seed: 7,
                realPresses: session.app.presses.length,
                decisions: decisions.length,
                simulatedMinutes: Number(
                  ((decisions.at(-1)?.record.t ?? 0) / 60_000).toFixed(2)
                ),
                peakSequenceLength: session.app.state.peakSeqLen,
                clears: session.app.state.clears,
                stepPressShare: Number(
                  (stepPresses.length / presses.length).toFixed(3)
                ),
                finalHundredStepPressShare: Number(
                  (lateStepPresses.length / latePresses.length).toFixed(3)
                ),
                longestNavigationRun,
                byIntention: count(
                  decisions.map(({ record }) => record.intentionId)
                ),
                byPressKind: count(presses.map((press) => press.kind)),
                activitiesCompleted: Object.fromEntries(
                  session.mind.memory.activities.completed
                ),
                activitiesAbandoned: Object.fromEntries(
                  session.mind.memory.activities.abandoned
                ),
                finalDecisions: decisions
                  .slice(-20)
                  .map(({ record, presses }) => ({
                    atSeconds: Math.round(record.t / 1000),
                    module: record.moduleId,
                    intention: record.intentionId,
                    presses: presses.map(
                      (press) => `${press.kind}:${press.label}`
                    ),
                  })),
              },
              null,
              2
            )
        );
      }
    },
    SESSION_TEST_TIMEOUT_MS
  );

  it(
    "retains episodic judgment through 1,000 real presses",
    async () => {
      const { session, decisions } = await runToRealPresses(7, 1_000);
      const plays = decisions.filter(
        ({ record }) => record.intentionId === "play-it"
      );
      const prematureReplays: Array<{
        previous: SessionRecord;
        current: SessionRecord;
      }> = [];

      for (let index = 1; index < plays.length; index++) {
        const previous = plays[index - 1]!.record;
        const current = plays[index]!.record;
        if (
          current.presentationRevision === previous.presentationRevision &&
          current.playbackSurface === previous.playbackSurface &&
          current.t - previous.t < PLAYBACK_REVISIT_MS
        ) {
          prematureReplays.push({ previous, current });
        }
      }

      const barrenEpisodes = [...session.mind.memory.barrenModules].map(
        (moduleId) => ({
          moduleId,
          ...session.mind.memory.moduleEpisodes.get(moduleId),
        })
      );
      const navigation = session.mind.memory.navigation;
      const experience = session.mind.memory.experience;
      const recentPredictionEpisodes = experience.episodes.slice(-30);
      const initialPredictionError =
        experience.initialPredictionErrorTotal /
        experience.initialPredictionCount;
      const recentPredictionError =
        recentPredictionEpisodes.reduce(
          (total, episode) => total + episode.predictionError,
          0
        ) / recentPredictionEpisodes.length;
      const endedActivities = [
        ...session.mind.memory.activities.completed.values(),
        ...session.mind.memory.activities.abandoned.values(),
      ].reduce((total, count) => total + count, 0);

      if (process.env.GHOST_1000_DEBUG) {
        const values = experience.episodes.map(({ value }) => value);
        console.log(
          "GHOST_1000_DEBUG " +
            JSON.stringify({
              recorded: experience.recorded,
              lowValueEpisodes: experience.lowValueEpisodes,
              minEpisodeValue: Math.min(...values),
              meanEpisodeValue:
                values.reduce((total, value) => total + value, 0) /
                values.length,
              counterfactualSelections: experience.counterfactualSelections,
              counterfactualDivergences: experience.counterfactualDivergences,
              suppressedFutures: experience.suppressedFutures,
              reducedSelections: experience.reducedSelections,
              boostedSelections: experience.boostedSelections,
              minForecastValue: Math.min(
                ...experience.episodes.map(({ prediction }) => prediction.value)
              ),
              byActivity: experience.episodes.reduce<Record<string, number>>(
                (acc, { activityId, variantId }) => {
                  const key = `${activityId}:${variantId}`;
                  acc[key] = (acc[key] ?? 0) + 1;
                  return acc;
                },
                {}
              ),
            })
        );
      }
      expect(session.app.presses.length).toBeGreaterThanOrEqual(1_000);
      expect(session.log.every((record) => record.ok)).toBe(true);
      expect(prematureReplays).toEqual([]);
      expect(navigation.recognizedReads).toBeGreaterThan(0);
      expect(navigation.recognizedReads).toBeGreaterThan(
        navigation.deliberateReads
      );
      expect(session.mind.memory.barrenModules.has("play")).toBe(true);
      expect(session.mind.memory.barrenModules.has("learn")).toBe(true);
      expect(
        barrenEpisodes.every(
          ({ visits, productiveVisits }) =>
            (visits ?? 0) - (productiveVisits ?? 0) === 1
        ),
        JSON.stringify(barrenEpisodes)
      ).toBe(true);
      expect(session.mind.memory.budgets.galleryOpens).toBe(8);
      expect(
        session.mind.memory.performed.get("browse-gallery") ?? 0
      ).toBeGreaterThan(8);
      expect(experience.recorded).toBe(endedActivities);
      expect(experience.predictionsRecorded).toBe(experience.recorded);
      expect(experience.initialPredictionCount).toBe(30);
      expect(experience.informedSelections).toBeGreaterThan(0);
      expect(experience.boostedSelections).toBeGreaterThan(0);
      // Negative judgment now acts in three places: reducing a chosen
      // activity, passing over an imagined future forecast below neutral, or
      // dropping a step the step ledger has proven does nothing here. Any of
      // them is experience talking the ghost out of something.
      expect(
        experience.reducedSelections +
          experience.suppressedFutures +
          experience.prunedSteps
      ).toBeGreaterThan(0);
      expect(experience.counterfactualSelections).toBeGreaterThan(0);
      // Step-level credit assignment: the ghost knows which steps do nothing
      // WHERE, and composes a plan without them.
      expect(experience.stepStats.size).toBeGreaterThan(0);
      expect(experience.prunedSteps).toBeGreaterThan(0);
      expect(
        [...experience.stepStats.values()].every(
          (stat) =>
            stat.attempts > 0 &&
            stat.productive <= stat.attempts &&
            stat.visible <= stat.attempts
        )
      ).toBe(true);
      expect(experience.exploratorySelections).toBeGreaterThan(0);
      expect(experience.accuratePredictions).toBeGreaterThan(0);
      expect(experience.highValueEpisodes).toBeGreaterThan(0);
      expect(experience.lowValueEpisodes).toBeGreaterThan(0);
      expect(recentPredictionError).toBeLessThan(initialPredictionError);
      expect(
        experience.episodes.every(
          ({
            value,
            novelty,
            achievement,
            prediction,
            predictionError,
            predictionAccuracy,
          }) =>
            value >= 0 &&
            value <= 1 &&
            novelty >= 0 &&
            novelty <= 1 &&
            achievement >= 0 &&
            achievement <= 1 &&
            prediction.value >= 0 &&
            prediction.value <= 1 &&
            prediction.uncertainty >= 0 &&
            prediction.uncertainty <= 1 &&
            predictionError >= 0 &&
            predictionError <= 1 &&
            predictionAccuracy >= 0 &&
            predictionAccuracy <= 1
        )
      ).toBe(true);

      if (process.env.GHOST_1000_REPORT) {
        console.log(
          "GHOST_1000_REPORT\n" +
            JSON.stringify(
              {
                seed: 7,
                realPresses: session.app.presses.length,
                decisions: decisions.length,
                simulatedMinutes: Number(
                  ((decisions.at(-1)?.record.t ?? 0) / 60_000).toFixed(2)
                ),
                plays: plays.length,
                prematureReplays: prematureReplays.length,
                sidebar: {
                  deliberateReads: navigation.deliberateReads,
                  recognizedReads: navigation.recognizedReads,
                },
                barrenEpisodes,
                library: {
                  paidOpens: session.mind.memory.budgets.galleryOpens,
                  browseOnlyVisits:
                    (session.mind.memory.performed.get("browse-gallery") ?? 0) -
                    session.mind.memory.budgets.galleryOpens,
                },
                experience: {
                  recorded: experience.recorded,
                  retained: experience.episodes.length,
                  informedSelections: experience.informedSelections,
                  boostedSelections: experience.boostedSelections,
                  reducedSelections: experience.reducedSelections,
                  averageValue: Number(
                    (experience.valueTotal / experience.recorded).toFixed(3)
                  ),
                  lowValueEpisodes: experience.lowValueEpisodes,
                  highValueEpisodes: experience.highValueEpisodes,
                  predictionsRecorded: experience.predictionsRecorded,
                  exploratorySelections: experience.exploratorySelections,
                  accuratePredictions: experience.accuratePredictions,
                  confidentMisses: experience.confidentMisses,
                  averagePredictionError: Number(
                    (
                      experience.predictionErrorTotal /
                      experience.predictionsRecorded
                    ).toFixed(3)
                  ),
                  initialPredictionError: Number(
                    initialPredictionError.toFixed(3)
                  ),
                  recentPredictionError: Number(
                    recentPredictionError.toFixed(3)
                  ),
                  lastPrediction: experience.lastPrediction,
                },
                activitiesCompleted: Object.fromEntries(
                  session.mind.memory.activities.completed
                ),
                activitiesAbandoned: Object.fromEntries(
                  session.mind.memory.activities.abandoned
                ),
              },
              null,
              2
            )
        );
      }
    },
    SESSION_TEST_TIMEOUT_MS
  );
});
