/**
 * The fleet — many sessions at once, for the patterns one session cannot show.
 *
 * A single transcript answers "what did it do". It cannot answer "what does it
 * USUALLY do", and the difference matters because selection is weighted-random:
 * every number in a one-session report carries seed noise, and tuning against
 * one run is fitting the ghost to a coin flip. Three findings need a fleet:
 *
 *   1. Intentions that NEVER fire. An intention that loses on every seed is
 *      dead code wearing a personality, and it is invisible from one run where
 *      it merely happened not to come up.
 *   2. Variance. "Peak sequence 16" means nothing without knowing whether the
 *      spread is 14-18 or 4-28.
 *   3. Rare disasters. A trap that strands the ghost on one seed in twenty is
 *      a four-hour jam ruined, and a single run finds it one time in twenty.
 *
 * Env-gated (`GHOST_FLEET=1`) because it runs tens of sessions; CI runs the
 * single-session contract instead. Writes test-results/ghost-fleet.md.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("#lib/shared/attract/services/sensors.js", () => ({
  isVisible: () => true,
  visibleAll: (selector: string) => [
    ...document.querySelectorAll<HTMLElement>(selector),
  ],
  createSensors: () => ({ sense: () => ({}) }),
  readRoute: () => ({ moduleId: null, tabId: null }),
}));

import { ALL_INTENTIONS } from "#lib/shared/attract/intentions/index.js";
import {
  CONCEPTS,
  type ConceptId,
} from "#lib/shared/attract/domain/intention.js";
import { PLAYBACK_REVISIT_MS } from "#lib/shared/attract/domain/episodic-memory.js";
import { analyze, runSession } from "./sim/run-session";

const SESSIONS = Number(process.env.GHOST_FLEET_SESSIONS ?? 60);
const TICKS = Number(process.env.GHOST_FLEET_TICKS ?? 400);

interface FleetRow {
  seed: number;
  decisions: number;
  /** Ticks that produced no action, including deliberate presentation waits. */
  deadTicks: number;
  /** No-action ticks intentionally yielded to a module's own presentation. */
  presentingTicks: number;
  peakSeqLen: number;
  clears: number;
  longestBuildRun: number;
  failures: number;
  byIntention: Map<string, number>;
  moduleShare: Map<string, number>;
  concepts: Map<ConceptId, string>;
  /** Module visits where it did nothing but navigate away. */
  emptyVisits: number;
  visits: number;
  prematureReplays: number;
  barrenVisitOverruns: number;
  deliberateSidebarReads: number;
  recognizedSidebarReads: number;
  activityEpisodeMismatch: number;
  informedSelections: number;
  boostedSelections: number;
  reducedSelections: number;
  exploratorySelections: number;
  lowValueEpisodes: number;
  highValueEpisodes: number;
  predictionEpisodeMismatch: number;
  accuratePredictions: number;
  confidentMisses: number;
  initialPredictionError: number;
  recentPredictionError: number;
}

async function flyFleet(): Promise<FleetRow[]> {
  const rows: FleetRow[] = [];
  for (let i = 0; i < SESSIONS; i++) {
    const seed = 1000 + i * 7;
    document.body.innerHTML = "";
    const session = runSession(seed, TICKS);
    await session.run();
    const stats = analyze(
      session.log,
      session.app.state.peakSeqLen,
      session.mind.memory.concepts
    );

    // Module visits, grouped by module id only — the tab suffix would split a
    // single stay in `create` into several phantom visits.
    let visits = 0;
    let emptyVisits = 0;
    let current: string | null = null;
    let actions = 0;
    for (const r of session.log) {
      const mod = (r.moduleId ?? "none").split("/")[0]!;
      if (mod !== current) {
        if (current !== null) {
          visits++;
          if (actions === 0) emptyVisits++;
        }
        current = mod;
        actions = 0;
      }
      const intention = ALL_INTENTIONS.find(
        (candidate) => candidate.id === r.intentionId
      );
      if (
        intention?.operation !== "perceive" &&
        !["go-to-module", "escape-room"].includes(r.intentionId)
      ) {
        actions++;
      }
    }
    if (current !== null) {
      visits++;
      if (actions === 0) emptyVisits++;
    }

    const moduleShare = new Map<string, number>();
    for (const [key, n] of stats.moduleTicks) {
      const mod = key.split("/")[0]!;
      moduleShare.set(mod, (moduleShare.get(mod) ?? 0) + n);
    }

    let prematureReplays = 0;
    const plays = session.log.filter(
      ({ intentionId }) => intentionId === "play-it"
    );
    for (let index = 1; index < plays.length; index++) {
      const previous = plays[index - 1]!;
      const currentPlay = plays[index]!;
      if (
        currentPlay.presentationRevision === previous.presentationRevision &&
        currentPlay.playbackSurface === previous.playbackSurface &&
        currentPlay.t - previous.t < PLAYBACK_REVISIT_MS
      ) {
        prematureReplays++;
      }
    }

    const barrenVisitOverruns = [...session.mind.memory.barrenModules].filter(
      (moduleId) => {
        const episode = session.mind.memory.moduleEpisodes.get(moduleId);
        return (episode?.visits ?? 0) - (episode?.productiveVisits ?? 0) > 1;
      }
    ).length;
    const endedActivities = [
      ...session.mind.memory.activities.completed.values(),
      ...session.mind.memory.activities.abandoned.values(),
    ].reduce((total, count) => total + count, 0);
    const experience = session.mind.memory.experience;
    const recentPredictionEpisodes = experience.episodes.slice(-30);

    rows.push({
      seed,
      decisions: stats.decisions,
      deadTicks: TICKS - stats.decisions,
      presentingTicks: session.telemetry.presentingIdleTicks,
      peakSeqLen: stats.peakSeqLen,
      clears: stats.seqLenAtClear.length,
      longestBuildRun: stats.longestBuildRun,
      failures: stats.failures,
      byIntention: stats.byIntention,
      moduleShare,
      concepts: new Map(stats.concepts),
      emptyVisits,
      visits,
      prematureReplays,
      barrenVisitOverruns,
      deliberateSidebarReads: session.mind.memory.navigation.deliberateReads,
      recognizedSidebarReads: session.mind.memory.navigation.recognizedReads,
      activityEpisodeMismatch: endedActivities - experience.recorded,
      informedSelections: experience.informedSelections,
      boostedSelections: experience.boostedSelections,
      reducedSelections: experience.reducedSelections,
      exploratorySelections: experience.exploratorySelections,
      lowValueEpisodes: experience.lowValueEpisodes,
      highValueEpisodes: experience.highValueEpisodes,
      predictionEpisodeMismatch:
        experience.recorded - experience.predictionsRecorded,
      accuratePredictions: experience.accuratePredictions,
      confidentMisses: experience.confidentMisses,
      initialPredictionError:
        experience.initialPredictionErrorTotal /
        experience.initialPredictionCount,
      recentPredictionError:
        recentPredictionEpisodes.reduce(
          (total, episode) => total + episode.predictionError,
          0
        ) / recentPredictionEpisodes.length,
    });
  }
  return rows;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
}

function fleetReport(rows: FleetRow[]): string {
  const ids = ALL_INTENTIONS.map((i) => i.id);
  const totals = new Map<string, number>();
  const sessionsFired = new Map<string, number>();
  for (const id of ids) {
    totals.set(id, 0);
    sessionsFired.set(id, 0);
  }
  for (const r of rows) {
    for (const id of ids) {
      const n = r.byIntention.get(id) ?? 0;
      totals.set(id, totals.get(id)! + n);
      if (n > 0) sessionsFired.set(id, sessionsFired.get(id)! + 1);
    }
  }
  const allDecisions = sum(rows.map((r) => r.decisions));

  const modules = new Set<string>();
  for (const r of rows) for (const m of r.moduleShare.keys()) modules.add(m);

  const dist = (label: string, xs: number[]) =>
    `| ${label} | ${mean(xs).toFixed(1)} | ${quantile(xs, 0.1)} | ${quantile(xs, 0.5)} | ${quantile(xs, 0.9)} | ${Math.min(...xs)} | ${Math.max(...xs)} |`;

  return [
    `# Ghost fleet — ${rows.length} sessions x ${TICKS} ticks`,
    ``,
    `## Distributions (mean, p10, p50, p90, min, max)`,
    ``,
    `| measure | mean | p10 | p50 | p90 | min | max |`,
    `|---|---|---|---|---|---|---|`,
    dist(
      "decisions per session",
      rows.map((r) => r.decisions)
    ),
    dist(
      "ticks without a ghost action",
      rows.map((r) => r.deadTicks)
    ),
    dist(
      "ticks watching a module presentation",
      rows.map((r) => r.presentingTicks)
    ),
    dist(
      "unexplained idle ticks",
      rows.map((r) => r.deadTicks - r.presentingTicks)
    ),
    dist(
      "peak sequence length",
      rows.map((r) => r.peakSeqLen)
    ),
    dist(
      "clears",
      rows.map((r) => r.clears)
    ),
    dist(
      "longest build run",
      rows.map((r) => r.longestBuildRun)
    ),
    dist(
      "failed performs",
      rows.map((r) => r.failures)
    ),
    dist(
      "module visits",
      rows.map((r) => r.visits)
    ),
    dist(
      "visits doing nothing",
      rows.map((r) => r.emptyVisits)
    ),
    dist(
      "premature unchanged replays",
      rows.map((r) => r.prematureReplays)
    ),
    dist(
      "repeat visits after a room proved barren",
      rows.map((r) => r.barrenVisitOverruns)
    ),
    dist(
      "sidebar reads recognized from memory",
      rows.map((r) => r.recognizedSidebarReads)
    ),
    dist(
      "activity choices informed by experience",
      rows.map((r) => r.informedSelections)
    ),
    dist(
      "activity choices reduced by experience",
      rows.map((r) => r.reducedSelections)
    ),
    dist(
      "low-value activity episodes",
      rows.map((r) => r.lowValueEpisodes)
    ),
    dist(
      "uncertain activities deliberately explored",
      rows.map((r) => r.exploratorySelections)
    ),
    dist(
      "accurate activity predictions",
      rows.map((r) => r.accuratePredictions)
    ),
    dist(
      "confident prediction misses",
      rows.map((r) => r.confidentMisses)
    ),
    dist(
      "initial prediction error",
      rows.map((r) => r.initialPredictionError)
    ),
    dist(
      "recent prediction error",
      rows.map((r) => r.recentPredictionError)
    ),
    ``,
    `## Intentions — how often, and in how many sessions`,
    ``,
    `| intention | total | share | sessions firing |`,
    `|---|---|---|---|`,
    ...ids
      .map((id) => ({
        id,
        n: totals.get(id)!,
        s: sessionsFired.get(id)!,
      }))
      .sort((a, b) => b.n - a.n)
      .map(
        (r) =>
          `| ${r.id} | ${r.n} | ${((r.n / allDecisions) * 100).toFixed(2)}% | ${r.s}/${rows.length} |`
      ),
    ``,
    `## Where the time goes`,
    ``,
    `| module | share |`,
    `|---|---|`,
    ...[...modules]
      .map((m) => ({
        m,
        n: sum(rows.map((r) => r.moduleShare.get(m) ?? 0)),
      }))
      .sort((a, b) => b.n - a.n)
      .map((r) => `| ${r.m} | ${((r.n / allDecisions) * 100).toFixed(1)}% |`),
    ``,
    `## Concepts reaching each stage`,
    ``,
    `| concept | understood | confused | never met |`,
    `|---|---|---|---|`,
    ...CONCEPTS.map((c) => {
      const u = rows.filter((r) => r.concepts.get(c) === "understood").length;
      const k = rows.filter((r) => r.concepts.get(c) === "confused").length;
      return `| ${c} | ${u}/${rows.length} | ${k}/${rows.length} | ${rows.length - u - k}/${rows.length} |`;
    }),
  ].join("\n");
}

describe("ghost fleet", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it.skipIf(!process.env.GHOST_FLEET)(
    "flies a fleet and reports the aggregate",
    async () => {
      const rows = await flyFleet();
      const text = fleetReport(rows);
      const { writeFileSync, mkdirSync } = await import("node:fs");
      mkdirSync("test-results", { recursive: true });
      writeFileSync("test-results/ghost-fleet.md", text, "utf8");
      console.log(text);

      // An intention that never wins on ANY seed is dead code wearing a
      // personality. This is the finding a fleet exists for.
      const never = ALL_INTENTIONS.filter((i) =>
        rows.every((r) => (r.byIntention.get(i.id) ?? 0) === 0)
      ).map((i) => i.id);
      expect(never, "intentions that never fired in any session").toEqual([]);

      // No session may end up unable to act. A ghost with nothing to do is a
      // ghost standing still in front of strangers.
      const stranded = rows.filter((r) => r.decisions < TICKS * 0.2);
      expect(
        stranded.map((r) => r.seed),
        "sessions where the ghost was idle for most of its ticks"
      ).toEqual([]);

      expect(
        rows.filter((r) => r.failures > 0).map((r) => r.seed),
        "sessions with failed actions"
      ).toEqual([]);
      expect(
        rows
          .filter((r) => r.deadTicks !== r.presentingTicks)
          .map((r) => r.seed),
        "sessions with unexplained idle ticks"
      ).toEqual([]);
      expect(
        rows.filter((r) => r.prematureReplays > 0).map((r) => r.seed),
        "sessions that replayed an unchanged presentation too soon"
      ).toEqual([]);
      expect(
        rows.filter((r) => r.barrenVisitOverruns > 0).map((r) => r.seed),
        "sessions that revisited a room after it proved barren"
      ).toEqual([]);
      expect(
        rows.filter((r) => r.recognizedSidebarReads === 0).map((r) => r.seed),
        "sessions that never recognized a previously read sidebar"
      ).toEqual([]);
      expect(
        rows.filter((r) => r.activityEpisodeMismatch !== 0).map((r) => r.seed),
        "sessions that ended an activity without recording its outcome"
      ).toEqual([]);
      expect(
        rows
          .filter((r) => r.predictionEpisodeMismatch !== 0)
          .map((r) => r.seed),
        "activity episodes without a prediction evaluation"
      ).toEqual([]);
      expect(
        rows.filter((r) => r.informedSelections === 0).map((r) => r.seed),
        "sessions where experience never changed activity selection"
      ).toEqual([]);
      expect(
        rows.reduce((total, row) => total + row.boostedSelections, 0),
        "fleet choices reinforced by useful outcomes"
      ).toBeGreaterThan(0);
      expect(
        rows.reduce((total, row) => total + row.reducedSelections, 0),
        "fleet choices tempered by disappointing outcomes"
      ).toBeGreaterThan(0);
      expect(
        rows.filter((r) => r.exploratorySelections === 0).map((r) => r.seed),
        "sessions that never tested an uncertain prediction"
      ).toEqual([]);
      expect(
        rows.filter((r) => r.accuratePredictions === 0).map((r) => r.seed),
        "sessions where the predictor never became accurate"
      ).toEqual([]);
      expect(
        mean(rows.map((r) => r.recentPredictionError)),
        "recent forecasts should beat the cold-start calibration window"
      ).toBeLessThan(mean(rows.map((r) => r.initialPredictionError)));
      expect(
        rows
          .filter((r) => r.lowValueEpisodes === 0 || r.highValueEpisodes === 0)
          .map((r) => r.seed),
        "sessions that never distinguished useful and disappointing outcomes"
      ).toEqual([]);

      const invitations = rows.map((r) =>
        ["offer-the-wheel", "point-it-out", "everything-is-live"].reduce(
          (total, id) => total + (r.byIntention.get(id) ?? 0),
          0
        )
      );
      expect(
        mean(invitations),
        "average invitations per simulated half-hour"
      ).toBeLessThan(5);
    },
    600_000
  );
});
