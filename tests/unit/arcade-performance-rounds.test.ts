/**
 * Performance rounds must be additive. The one thing that cannot move is quiz
 * scoring — eight shipped games depend on it and players have banked bests
 * against it.
 *
 * So the anchor here is a CHARACTERIZATION test: a scripted 12-question
 * session whose expected numbers are worked out by hand from scoring.ts and
 * hardcoded below. If a future refactor changes BASE_POINTS, a speed band, a
 * multiplier step, or the rounding, this test fails loudly instead of silently
 * repricing everyone's scores.
 *
 * The same script is then replayed through submitRound({kind:"choice"}) and
 * must land on identical numbers — that is the proof that submitAnswer became
 * an adapter and not a rewrite.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createArcadeSession } from "#lib/features/learn/play/state/arcade-session-state.svelte.js";
import { GAME_REGISTRY } from "#lib/features/learn/play/domain/game-registry.js";
import type {
  GameDefinition,
  ChallengeDefinition,
} from "#lib/features/learn/play/domain/arcade-types.js";
import type { QuizAnswerEvent } from "#lib/features/learn/quiz/domain/models/quiz-models.js";

function evt(isCorrect: boolean): QuizAnswerEvent {
  return {
    isCorrect,
    questionData: {
      questionId: "q",
      questionContent: null,
      answerOptions: [],
      correctAnswer: null,
      questionType: "letter" as never,
      answerType: "button" as never,
      lessonType: "pictograph_to_letter" as never,
    },
    selectedOptionId: "a",
    selectedContent: null,
    correctContent: null,
    quizType: "pictograph_to_letter" as never,
    answeredAt: new Date(),
  };
}

const QUIZ_GAME: GameDefinition = {
  id: "pictograph-to-letter",
  title: "Name That Pictograph",
  tagline: "test",
  accentColor: "#000",
  quizType: "pictograph_to_letter" as never,
  capabilities: { scoring: "quiz" },
  curriculum: { status: "unclassified" },
  challenges: [],
};

const PERF_GAME: GameDefinition = {
  id: "trace-paths",
  title: "Trace Paths",
  tagline: "test",
  accentColor: "#000",
  capabilities: {
    immersiveStage: true,
    requiresTouch: false,
    supportsTwoPointers: true,
    scoring: "performance",
  },
  curriculum: { status: "unclassified" },
  challenges: [],
};

/** Star thresholds pinned here so the expected star count below is stable. */
function fixedChallenge(questionCount: number): ChallengeDefinition {
  return {
    challengeNumber: 1,
    title: "Scripted Challenge",
    mode: { kind: "fixed", questionCount },
    constraints: {},
    stars: { one: 500, two: 1500, three: 3000 },
  };
}

/**
 * The script. Each entry is one question: how long the player took, and
 * whether they got it right.
 *
 * Hand-computed against scoring.ts (BASE_POINTS 100; speed bands
 * <1500 -> +50, <3500 -> +25, <6000 -> +10, else 0; multiplier steps at
 * streakBefore 3 -> x1.5, 6 -> x2, 10 -> x3):
 *
 *   #   ms     ok   streakBefore  mult   points            running
 *   1   1000   Y    0             1      (100+50)*1  = 150     150
 *   2   1000   Y    1             1      150               300
 *   3   1000   Y    2             1      150               450
 *   4   1000   Y    3             1.5    150*1.5     = 225     675
 *   5   3000   Y    4             1.5    (100+25)*1.5= 188*    863
 *   6   1000   Y    5             1.5    225               1088
 *   7   5000   Y    6             2      (100+10)*2  = 220     1308
 *   8   1000   N    7             -      0                 1308
 *   9   1000   Y    0             1      150               1458
 *  10   7000   Y    1             1      (100+0)*1   = 100     1558
 *  11   1000   Y    2             1      150               1708
 *  12   2000   N    3             -      0                 1708
 *
 *   * 187.5 rounds to 188 (Math.round, half up).
 */
const SCRIPT: Array<{ ms: number; ok: boolean }> = [
  { ms: 1000, ok: true },
  { ms: 1000, ok: true },
  { ms: 1000, ok: true },
  { ms: 1000, ok: true },
  { ms: 3000, ok: true },
  { ms: 1000, ok: true },
  { ms: 5000, ok: true },
  { ms: 1000, ok: false },
  { ms: 1000, ok: true },
  { ms: 7000, ok: true },
  { ms: 1000, ok: true },
  { ms: 2000, ok: false },
];

const EXPECTED = {
  score: 1708,
  streak: 0,
  longestStreak: 7,
  roundCount: 12,
  correctCount: 10,
  totalCount: 12,
  // 10/12 = 0.8333... -> 83.33 after the engine's 2-decimal rounding
  accuracyPercentage: 83.33,
  grade: "A", // 0.8333 clears the 0.8 A band, misses the 0.95 S band
  starsEarned: 2, // 1708 clears two:1500, misses three:3000
} as const;

type Session = ReturnType<typeof createArcadeSession>;

/** Drives the script through whichever submit entry point is under test. */
function runScript(
  session: Session,
  submit: (s: Session, ok: boolean) => void
) {
  for (const step of SCRIPT) {
    session.markQuestionShown();
    vi.advanceTimersByTime(step.ms);
    submit(session, step.ok);
  }
}

const viaSubmitAnswer = (s: Session, ok: boolean) => s.submitAnswer(evt(ok));
const viaSubmitRound = (s: Session, ok: boolean) =>
  s.submitRound({ kind: "choice", answer: evt(ok) });

function assertScriptedOutcome(session: Session) {
  expect(session.score).toBe(EXPECTED.score);
  expect(session.streak).toBe(EXPECTED.streak);
  expect(session.longestStreak).toBe(EXPECTED.longestStreak);
  expect(session.records.length).toBe(EXPECTED.roundCount);
  expect(session.rounds.length).toBe(EXPECTED.roundCount);

  expect(session.phase.name).toBe("results");
  if (session.phase.name !== "results") throw new Error("unreachable");
  const r = session.phase.result;
  expect(r.correctCount).toBe(EXPECTED.correctCount);
  expect(r.totalCount).toBe(EXPECTED.totalCount);
  expect(r.accuracyPercentage).toBe(EXPECTED.accuracyPercentage);
  expect(r.grade).toBe(EXPECTED.grade);
  expect(r.starsEarned).toBe(EXPECTED.starsEarned);
  expect(r.longestStreak).toBe(EXPECTED.longestStreak);
  expect(r.score).toBe(EXPECTED.score);
}

describe("arcade quiz scoring is unchanged by performance rounds", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("scripted quiz session through submitAnswer hits the hand-computed numbers", () => {
    vi.useFakeTimers();
    const session = createArcadeSession();
    session.startChallenge(QUIZ_GAME, fixedChallenge(SCRIPT.length));

    runScript(session, viaSubmitAnswer);

    assertScriptedOutcome(session);
  });

  it("the same script through submitRound({kind:'choice'}) is identical", () => {
    vi.useFakeTimers();
    const session = createArcadeSession();
    session.startChallenge(QUIZ_GAME, fixedChallenge(SCRIPT.length));

    runScript(session, viaSubmitRound);

    assertScriptedOutcome(session);
  });

  it("submitAnswer and submitRound produce the same per-round point ledger", () => {
    vi.useFakeTimers();
    const viaAnswer = createArcadeSession();
    viaAnswer.startChallenge(QUIZ_GAME, fixedChallenge(SCRIPT.length));
    runScript(viaAnswer, viaSubmitAnswer);
    const answerLedger = viaAnswer.rounds.map((r) => [
      r.pointsAwarded,
      r.streakAfter,
    ]);

    const viaRound = createArcadeSession();
    viaRound.startChallenge(QUIZ_GAME, fixedChallenge(SCRIPT.length));
    runScript(viaRound, viaSubmitRound);
    const roundLedger = viaRound.rounds.map((r) => [
      r.pointsAwarded,
      r.streakAfter,
    ]);

    expect(roundLedger).toEqual(answerLedger);
    // The exact ledger, pinned. Wrong answers score 0; see the table above.
    expect(answerLedger).toEqual([
      [150, 1],
      [150, 2],
      [150, 3],
      [225, 4],
      [188, 5],
      [225, 6],
      [220, 7],
      [0, 0],
      [150, 1],
      [100, 2],
      [150, 3],
      [0, 0],
    ]);
  });
});

describe("performance rounds", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("award exactly the points they carry — no speed bonus", () => {
    vi.useFakeTimers();
    const session = createArcadeSession();
    session.startChallenge(PERF_GAME, fixedChallenge(2));

    // 400ms would be the top speed band (+50) on the quiz path. It must not
    // apply here: the game already priced the round.
    session.submitRound({
      kind: "performance",
      isCorrect: true,
      points: 137,
      elapsedMs: 400,
      metrics: { coverage: 0.91, orderCorrect: true },
      questionData: { challengeNumber: 1 },
    });

    expect(session.score).toBe(137);
    expect(session.rounds.at(-1)?.pointsAwarded).toBe(137);
    expect(session.rounds.at(-1)?.answerTimeMs).toBe(400);
    // Performance rounds carry no QuizAnswerEvent, so the quiz log stays empty.
    expect(session.records.length).toBe(0);
  });

  it("are not scaled by the streak multiplier", () => {
    vi.useFakeTimers();
    const session = createArcadeSession();
    session.startChallenge(PERF_GAME, fixedChallenge(10));

    // Build a streak of 4 — past the x1.5 step the quiz path would apply.
    for (let i = 0; i < 4; i += 1) {
      session.submitRound({
        kind: "performance",
        isCorrect: true,
        points: 100,
        elapsedMs: 2000,
        metrics: {},
        questionData: {},
      });
    }
    expect(session.streak).toBe(4);
    expect(session.score).toBe(400); // not 400 * any multiplier

    session.submitRound({
      kind: "performance",
      isCorrect: true,
      points: 100,
      elapsedMs: 2000,
      metrics: {},
      questionData: {},
    });

    expect(session.score).toBe(500);
    expect(session.longestStreak).toBe(5); // streak still tracks, just doesn't pay
  });

  it("a missed performance round zeroes the streak and counts as a miss", () => {
    vi.useFakeTimers();
    const session = createArcadeSession();
    session.startChallenge(PERF_GAME, {
      ...fixedChallenge(10),
      mode: { kind: "survival", maxMisses: 2 },
    });

    session.submitRound({
      kind: "performance",
      isCorrect: true,
      points: 90,
      elapsedMs: 1000,
      metrics: {},
      questionData: {},
    });
    session.submitRound({
      kind: "performance",
      isCorrect: false,
      points: 0,
      elapsedMs: 1000,
      metrics: {},
      questionData: {},
    });
    expect(session.streak).toBe(0);
    expect(session.misses).toBe(1);
    expect(session.phase.name).toBe("playing");

    session.submitRound({
      kind: "performance",
      isCorrect: false,
      points: 0,
      elapsedMs: 1000,
      metrics: {},
      questionData: {},
    });
    expect(session.phase.name).toBe("results");
    if (session.phase.name !== "results") throw new Error("unreachable");
    expect(session.phase.result.totalCount).toBe(3);
    expect(session.phase.result.correctCount).toBe(1);
  });
});

describe("mixed sessions keep both paths intact", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a performance round between quiz answers corrupts neither ledger", () => {
    vi.useFakeTimers();
    const session = createArcadeSession();
    session.startChallenge(QUIZ_GAME, fixedChallenge(4));

    // Q1: correct at 1000ms, streakBefore 0 -> (100+50)*1 = 150
    session.markQuestionShown();
    vi.advanceTimersByTime(1000);
    session.submitAnswer(evt(true));
    expect(session.score).toBe(150);

    // A performance round in the middle: exactly its own points, streak -> 2
    session.submitRound({
      kind: "performance",
      isCorrect: true,
      points: 77,
      elapsedMs: 300,
      metrics: { coverage: 1 },
      questionData: {},
    });
    expect(session.score).toBe(227);
    expect(session.streak).toBe(2);

    // Q2: correct at 1000ms, streakBefore 2 -> still x1, so +150
    session.markQuestionShown();
    vi.advanceTimersByTime(1000);
    session.submitAnswer(evt(true));
    expect(session.score).toBe(377);
    expect(session.streak).toBe(3);

    // Q3: correct at 1000ms, streakBefore 3 -> x1.5, so +225. Completes at 4.
    session.markQuestionShown();
    vi.advanceTimersByTime(1000);
    session.submitAnswer(evt(true));

    expect(session.score).toBe(602);
    expect(session.rounds.length).toBe(4);
    expect(session.records.length).toBe(3); // the performance round isn't a quiz answer
    expect(session.phase.name).toBe("results");
    if (session.phase.name !== "results") throw new Error("unreachable");
    expect(session.phase.result.totalCount).toBe(4);
    expect(session.phase.result.correctCount).toBe(4);
    expect(session.phase.result.grade).toBe("S");
  });

  it("every quiz-log entry still carries a real QuizAnswerEvent", () => {
    vi.useFakeTimers();
    const session = createArcadeSession();
    session.startChallenge(QUIZ_GAME, fixedChallenge(3));

    session.markQuestionShown();
    session.submitAnswer(evt(true));
    session.submitRound({
      kind: "performance",
      isCorrect: false,
      points: 0,
      elapsedMs: 500,
      metrics: {},
      questionData: {},
    });
    session.markQuestionShown();
    session.submitAnswer(evt(false));

    // This is the guarantee gap analysis and quiz-history persistence rely on.
    for (const record of session.records) {
      expect(record.event).toBeDefined();
      expect(typeof record.event.isCorrect).toBe("boolean");
      expect(record.event.answeredAt).toBeInstanceOf(Date);
      expect(record.round.kind).toBe("choice");
    }
    expect(session.records.map((r) => r.event.isCorrect)).toEqual([
      true,
      false,
    ]);
  });
});

describe("game registry capabilities", () => {
  it("every game declares capabilities explicitly", () => {
    for (const game of GAME_REGISTRY) {
      expect(
        game.capabilities,
        `${game.id} is missing capabilities`
      ).toBeDefined();
      expect(["quiz", "performance"]).toContain(game.capabilities.scoring);
    }
  });

  it("every non-performance game is quiz-scored with a quiz type", () => {
    // Guards the invariant, not a head count: `trace-paths` is the only
    // performance game, and every other game — however many quiz games exist —
    // is quiz-scored and carries a quizType. A hardcoded length here broke on
    // every legitimately-added quiz game (word-bridges was the 9th); this
    // instead catches the real regression — an original game silently flipping
    // to performance scoring, or losing its quizType.
    const performanceGames = GAME_REGISTRY.filter(
      (g) => g.capabilities.scoring === "performance"
    );
    expect(performanceGames.map((g) => g.id)).toEqual(["trace-paths"]);

    const quizGames = GAME_REGISTRY.filter((g) => g.id !== "trace-paths");
    expect(quizGames.length).toBeGreaterThanOrEqual(8);
    for (const game of quizGames) {
      expect(game.capabilities.scoring, `${game.id} changed scoring mode`).toBe(
        "quiz"
      );
      expect(game.quizType, `${game.id} lost its quizType`).toBeDefined();
    }
  });

  it("trace-paths is registered as a two-pointer performance game", () => {
    const trace = GAME_REGISTRY.find((g) => g.id === "trace-paths");
    expect(trace).toBeDefined();
    expect(trace?.capabilities).toEqual({
      immersiveStage: true,
      requiresTouch: false,
      supportsTwoPointers: true,
      scoring: "performance",
    });
    // The eight progression chapters, in order.
    expect(trace?.challenges.map((l) => l.title)).toEqual([
      "Touch the Route",
      "Keep the Line",
      "Remember the Route",
      "Meet the Other Hand",
      "Hold and Move",
      "Chain the Beats",
      "Trace the Sequence",
      "Survival",
    ]);
  });
});

describe("regression: trace-paths star thresholds are reachable", () => {
  /**
   * A performance round is priced by `scoreTraceRound` and hard-capped at 100
   * points (quality is clamped to 1), and the engine takes that number verbatim
   * — no speed bonus, no streak multiplier. So a fixed challenge's ceiling is
   * exactly questionCount * 100. The ladder originally carried thresholds
   * copied from the quiz games, whose rounds stack both bonuses, and the third
   * star was arithmetically unearnable on seven of the eight challenges.
   */
  const PERFORMANCE_ROUND_CAP = 100;

  it("a flawless run clears three stars on every fixed challenge", () => {
    const trace = GAME_REGISTRY.find((g) => g.id === "trace-paths");
    expect(trace).toBeDefined();

    for (const challenge of trace!.challenges) {
      if (challenge.mode.kind !== "fixed") continue;
      const ceiling = challenge.mode.questionCount * PERFORMANCE_ROUND_CAP;
      expect(
        challenge.stars.three,
        `challenge ${challenge.challengeNumber} "${challenge.title}" caps at ${ceiling}`
      ).toBeLessThanOrEqual(ceiling);
      // And the ladder still climbs.
      expect(challenge.stars.one).toBeLessThan(challenge.stars.two);
      expect(challenge.stars.two).toBeLessThan(challenge.stars.three);
    }
  });
});
