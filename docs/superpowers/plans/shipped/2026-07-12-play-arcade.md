# Play Arcade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release the Learn module's Play tab as a polished arcade: rebuilt runes-based session engine (kills the coin-flip scoring bug), per-game level progression with stars, personal bests, live-preview hub, 4 ported + 2 new games.

**Architecture:** New `src/lib/features/learn/play/` subtree. A discriminated-union runes FSM (`arcade-session-state.svelte.ts`, factory + context per the state-management skill) owns ALL session truth (phase, score, streak, clock); game components are dumb question renderers that emit `QuizAnswerEvent`. Pure modules (`scoring.ts`, `progression.ts`) are unit-tested. Persistence mirrors concept-progress-tracker: localStorage-first, Firestore `users/{uid}/playProgress/current` on auth. Legacy class services + dual-session views are deleted.

**Tech Stack:** Svelte 5 runes, `svelte/motion` Spring, View Transitions API (feature-detected wrapper), container queries, `@starting-style`, `content-visibility`, existing primitives (Crossfade, ProgressRing, SelectionHit, delight-orchestrator, SequenceMandala).

**Spec:** `docs/superpowers/specs/2026-07-12-play-arcade-design.md`

**Ground rules for every executor:**
- Re-read this plan file at the start of your task. The plan is authority.
- Commit with explicit pathspec: `git commit -m "..." -- <your files only>`. NEVER bare `git commit`, never `git add -A`.
- No `<input type="checkbox">`, no raw `class="chip"` buttons, no `--theme-*`/`--semantic-*` declarations (consuming via `var()` is fine), all touch targets ≥44px (`var(--min-touch-target)`), DURATION tokens not raw ms in JS (CSS may use `var(--duration-*)`).
- Any displayed sequence word goes through `simplifyRepeatedWord`.
- Prove completion with tool output (test run / grep) in your report.
- Do not run `npm run check` (cold, 2-3 min) mid-task; targeted `npx vitest run <file>` only. One full check happens in the final task.

---

## Execution waves

| Wave | Tasks | Parallel? |
|---|---|---|
| 1 | Task 1 (types+scoring+progression+registry+generator patch), Task 2 (engine) | sequential within one agent (2 depends on 1) |
| 2 | Task 3 (progress store + rules), Task 4 (GameShell + 4 game ports), Task 5 (Hub + cards + previews), Task 6 (ArcadeResults + LevelPicker) | 4 agents in parallel (all depend on wave 1 only) |
| 3 | Task 7 (LearnTab wiring + deletions), Task 8 (Speed Blitz), Task 9 (Mandala Match) | 3 agents in parallel (depend on wave 2) |
| 4 | Task 10 (regression component test, contract greps, full check, fixes) | single agent / main loop |

---

### Task 1: Pure domain modules + game registry + question-generator constraints

**Files:**
- Create: `src/lib/features/learn/play/domain/arcade-types.ts`
- Create: `src/lib/features/learn/play/domain/scoring.ts`
- Create: `src/lib/features/learn/play/domain/progression.ts`
- Create: `src/lib/features/learn/play/domain/game-registry.ts`
- Modify: `src/lib/features/learn/quiz/services/question-generator.ts` (add constraint options)
- Test: `tests/unit/play/scoring.test.ts`, `tests/unit/play/progression.test.ts`

- [ ] **Step 1: Write `arcade-types.ts`**

```typescript
/**
 * Play Arcade domain types.
 *
 * A "game" is a registry entry with a ladder of levels. A "level" pins the
 * question constraints, the win condition, and star thresholds. Session
 * results are computed by the engine (scoring.ts) — games never self-score
 * beyond reporting per-question correctness.
 */
import type { Component } from "svelte";
import type { QuizType } from "../../quiz/domain/enums/quiz-enums";
import type { QuizAnswerEvent } from "../../quiz/domain/models/quiz-models";

export type GameId =
  | "pictograph-to-letter"
  | "letter-to-pictograph"
  | "valid-next"
  | "performer-word"
  | "speed-blitz"
  | "mandala-match";

/** Win condition: answer N questions, or survive a countdown clock. */
export type LevelMode =
  | { kind: "fixed"; questionCount: number }
  | { kind: "countdown"; seconds: number }
  | { kind: "survival"; maxMisses: number };

export interface QuestionConstraints {
  /** Restrict the question pool to these letters (registry uses @tka/domain groupings). */
  letters?: string[];
  /** Number of answer options to render (default 4). */
  optionCount?: number;
  /** Word length for sequence-based games (performer-word, mandala-match). */
  wordLength?: number;
  /** Escalation curve for speed-blitz: seconds allowed per question at start/end. */
  paceStartSeconds?: number;
  paceEndSeconds?: number;
}

export interface StarThresholds {
  /** Minimum session score for 1/2/3 stars. */
  one: number;
  two: number;
  three: number;
}

export interface LevelDefinition {
  levelNumber: number; // 1-based
  title: string;
  mode: LevelMode;
  constraints: QuestionConstraints;
  stars: StarThresholds;
}

export interface GameDefinition {
  id: GameId;
  title: string;
  tagline: string;
  /** Local accent, consumed as var(--game-accent). Hex string from the shared palette. */
  accentColor: string;
  quizType: QuizType;
  levels: LevelDefinition[];
}

export interface AnswerRecord {
  event: QuizAnswerEvent;
  /** ms from question shown to answer. */
  answerTimeMs: number;
  pointsAwarded: number;
  streakAfter: number;
}

export interface ArcadeSessionResult {
  gameId: GameId;
  levelNumber: number;
  score: number;
  correctCount: number;
  totalCount: number;
  accuracyPercentage: number;
  longestStreak: number;
  bestCombo: number;
  grade: Grade;
  starsEarned: 0 | 1 | 2 | 3;
  isNewBest: boolean;
  durationSeconds: number;
  completedAt: Date;
}

export type Grade = "S" | "A" | "B" | "C" | "D";

export interface GameProgress {
  bestScore: number;
  bestGrade: Grade | null;
  /** starsByLevel["1"] = 0-3 */
  starsByLevel: Record<string, 0 | 1 | 2 | 3>;
  levelsUnlocked: number; // highest unlocked level number
  totalPlays: number;
}

export interface PlayProgress {
  games: Partial<Record<GameId, GameProgress>>;
  lastUpdated: string; // ISO
}
```

- [ ] **Step 2: Write failing tests for scoring**

`tests/unit/play/scoring.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  BASE_POINTS,
  computeGrade,
  scoreAnswer,
  speedBonus,
  streakMultiplier,
} from "$lib/features/learn/play/domain/scoring";

describe("speedBonus", () => {
  it("full bonus under 1.5s", () => expect(speedBonus(1000)).toBe(50));
  it("half bonus under 3.5s", () => expect(speedBonus(3000)).toBe(25));
  it("no bonus at/after 6s", () => expect(speedBonus(6000)).toBe(0));
});

describe("streakMultiplier", () => {
  it("x1 below 3-streak", () => expect(streakMultiplier(2)).toBe(1));
  it("x1.5 at 3", () => expect(streakMultiplier(3)).toBe(1.5));
  it("x2 at 6", () => expect(streakMultiplier(6)).toBe(2));
  it("caps at x3 for 10+", () => {
    expect(streakMultiplier(10)).toBe(3);
    expect(streakMultiplier(50)).toBe(3);
  });
});

describe("scoreAnswer", () => {
  it("wrong answer = 0 points", () =>
    expect(scoreAnswer({ isCorrect: false, answerTimeMs: 500, streakBefore: 5 })).toBe(0));
  it("right answer = (base + speed) * multiplier, rounded", () =>
    // (100 + 50) * 1.5 = 225 (streakBefore 3 → ×1.5)
    expect(scoreAnswer({ isCorrect: true, answerTimeMs: 1000, streakBefore: 3 })).toBe(225));
  it("slow right answer = base only at x1", () =>
    expect(scoreAnswer({ isCorrect: true, answerTimeMs: 9000, streakBefore: 0 })).toBe(BASE_POINTS));
});

describe("computeGrade", () => {
  it("S needs >=95% accuracy", () => {
    expect(computeGrade(0.95)).toBe("S");
    expect(computeGrade(0.949)).toBe("A");
  });
  it("boundaries A/B/C/D", () => {
    expect(computeGrade(0.85)).toBe("A");
    expect(computeGrade(0.7)).toBe("B");
    expect(computeGrade(0.5)).toBe("C");
    expect(computeGrade(0.49)).toBe("D");
    expect(computeGrade(0)).toBe("D");
  });
});
```

- [ ] **Step 3: Run tests, verify fail**

Run: `npx vitest run tests/unit/play/scoring.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Write `scoring.ts`**

```typescript
/**
 * Pure scoring math for the Play arcade. No runes, no IO — unit-testable.
 *
 * Points: (BASE + speed bonus) × streak multiplier, rounded. Wrong = 0.
 * Grade: accuracy bands, same letter language as Train's ResultsScreen.
 */
export const BASE_POINTS = 100;

/** Answer-time bands → bonus points. Bands chosen so a snappy player ~1.5x's base. */
export function speedBonus(answerTimeMs: number): number {
  if (answerTimeMs < 1500) return 50;
  if (answerTimeMs < 3500) return 25;
  if (answerTimeMs < 6000) return 10;
  return 0;
}

/** Streak multiplier steps at 3/6/10, capped ×3 to keep scores readable. */
export function streakMultiplier(streakBefore: number): number {
  if (streakBefore >= 10) return 3;
  if (streakBefore >= 6) return 2;
  if (streakBefore >= 3) return 1.5;
  return 1;
}

export function scoreAnswer(input: {
  isCorrect: boolean;
  answerTimeMs: number;
  streakBefore: number;
}): number {
  if (!input.isCorrect) return 0;
  return Math.round(
    (BASE_POINTS + speedBonus(input.answerTimeMs)) * streakMultiplier(input.streakBefore)
  );
}

import type { Grade } from "./arcade-types";

/** accuracy is 0..1 */
export function computeGrade(accuracy: number): Grade {
  if (accuracy >= 0.95) return "S";
  if (accuracy >= 0.8) return "A";
  if (accuracy >= 0.6) return "B";
  if (accuracy >= 0.5) return "C";
  return "D";
}
```

Note: test asserts `computeGrade(0.85) === "A"` and `computeGrade(0.7) === "B"` — bands above match (A ≥ 0.8, B ≥ 0.6, C ≥ 0.5). Keep imports at top of file (move the `Grade` import up when writing the real file).

- [ ] **Step 5: Write failing tests for progression**

`tests/unit/play/progression.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { computeStars, mergeProgress, applyResult } from "$lib/features/learn/play/domain/progression";
import type { GameProgress, PlayProgress } from "$lib/features/learn/play/domain/arcade-types";

const stars = { one: 500, two: 1000, three: 1500 };

describe("computeStars", () => {
  it("0 below one-star threshold", () => expect(computeStars(499, stars)).toBe(0));
  it("thresholds inclusive", () => {
    expect(computeStars(500, stars)).toBe(1);
    expect(computeStars(1000, stars)).toBe(2);
    expect(computeStars(1500, stars)).toBe(3);
  });
});

describe("applyResult", () => {
  const base: GameProgress = {
    bestScore: 800, bestGrade: "B", starsByLevel: { "1": 2 }, levelsUnlocked: 2, totalPlays: 3,
  };
  it("keeps best score/stars when result is worse", () => {
    const next = applyResult(base, { levelNumber: 1, score: 400, starsEarned: 1, grade: "C" });
    expect(next.bestScore).toBe(800);
    expect(next.starsByLevel["1"]).toBe(2);
    expect(next.totalPlays).toBe(4);
  });
  it("upgrades best + stars + unlocks next level on >=1 star", () => {
    const next = applyResult(base, { levelNumber: 2, score: 1200, starsEarned: 2, grade: "A" });
    expect(next.bestScore).toBe(1200);
    expect(next.starsByLevel["2"]).toBe(2);
    expect(next.levelsUnlocked).toBe(3);
  });
  it("no unlock on 0 stars", () => {
    const next = applyResult(base, { levelNumber: 2, score: 100, starsEarned: 0, grade: "D" });
    expect(next.levelsUnlocked).toBe(2);
  });
});

describe("mergeProgress", () => {
  it("newer lastUpdated wins per the concept-progress convention", () => {
    const local: PlayProgress = { games: { "speed-blitz": { bestScore: 10, bestGrade: "D", starsByLevel: {}, levelsUnlocked: 1, totalPlays: 1 } }, lastUpdated: "2026-07-12T10:00:00Z" };
    const remote: PlayProgress = { games: { "speed-blitz": { bestScore: 99, bestGrade: "A", starsByLevel: {}, levelsUnlocked: 2, totalPlays: 5 } }, lastUpdated: "2026-07-12T11:00:00Z" };
    expect(mergeProgress(local, remote)).toBe(remote);
    expect(mergeProgress(remote, local)).toBe(remote);
  });
});
```

- [ ] **Step 6: Run, verify fail; write `progression.ts`**

```typescript
/**
 * Pure progression rules: stars from score thresholds, best-tracking,
 * level unlocks (>=1 star unlocks the next level), lastUpdated-wins merge.
 */
import type { GameProgress, Grade, PlayProgress, StarThresholds } from "./arcade-types";

export function computeStars(score: number, t: StarThresholds): 0 | 1 | 2 | 3 {
  if (score >= t.three) return 3;
  if (score >= t.two) return 2;
  if (score >= t.one) return 1;
  return 0;
}

const GRADE_ORDER: Grade[] = ["D", "C", "B", "A", "S"];

export function betterGrade(a: Grade | null, b: Grade): Grade {
  if (a === null) return b;
  return GRADE_ORDER.indexOf(b) > GRADE_ORDER.indexOf(a) ? b : a;
}

export function emptyGameProgress(): GameProgress {
  return { bestScore: 0, bestGrade: null, starsByLevel: {}, levelsUnlocked: 1, totalPlays: 0 };
}

export function applyResult(
  progress: GameProgress,
  result: { levelNumber: number; score: number; starsEarned: 0 | 1 | 2 | 3; grade: Grade }
): GameProgress {
  const key = String(result.levelNumber);
  const prevStars = progress.starsByLevel[key] ?? 0;
  const starsByLevel = {
    ...progress.starsByLevel,
    [key]: Math.max(prevStars, result.starsEarned) as 0 | 1 | 2 | 3,
  };
  const unlocked =
    result.starsEarned >= 1
      ? Math.max(progress.levelsUnlocked, result.levelNumber + 1)
      : progress.levelsUnlocked;
  return {
    bestScore: Math.max(progress.bestScore, result.score),
    bestGrade: betterGrade(progress.bestGrade, result.grade),
    starsByLevel,
    levelsUnlocked: unlocked,
    totalPlays: progress.totalPlays + 1,
  };
}

export function mergeProgress(a: PlayProgress, b: PlayProgress): PlayProgress {
  return a.lastUpdated >= b.lastUpdated ? a : b;
}
```

- [ ] **Step 7: Run both test files, verify pass**

Run: `npx vitest run tests/unit/play/scoring.test.ts tests/unit/play/progression.test.ts`
Expected: PASS.

- [ ] **Step 8: Extend question-generator with constraints**

Modify `src/lib/features/learn/quiz/services/question-generator.ts`:
`generateQuestion` gains an optional second param. Filtering happens on the
letter pool; option count controls distractor count. Do NOT change existing
call sites (param optional, default behavior identical).

```typescript
export interface GenerationOptions {
  /** Restrict correct answers + distractors to this letter subset (string form). */
  letters?: string[];
  /** Total answer options including the correct one (default 4). */
  optionCount?: number;
}

export async function generateQuestion(
  quizType: QuizType,
  options: GenerationOptions = {}
): Promise<QuizQuestionData> {
```

Inside, where the current code picks from `availableLetters`, derive:

```typescript
const pool = options.letters
  ? availableLetters.filter((l) => options.letters!.includes(String(l)))
  : availableLetters;
const optionCount = options.optionCount ?? 4;
```

…and thread `pool`/`optionCount` through the per-type generation paths in
place of `availableLetters`/hardcoded 4. If a filtered pool has fewer letters
than `optionCount`, fall back to `availableLetters` for distractors only (the
correct answer stays in-pool). Read the whole file first; keep its
no-repeat-previous-letter behavior working on the filtered pool.

- [ ] **Step 9: Write `game-registry.ts`**

```typescript
/**
 * The Play arcade game roster. Adding a game = adding an entry here plus a
 * game component route in GameShell. Level pools use @tka/domain groupings —
 * no hand-rolled letter lists.
 */
import { getLettersByType, ALL_LETTERS } from "@tka/domain";
import { QuizType } from "../../quiz/domain/enums/quiz-enums";
import type { GameDefinition } from "./arcade-types";

const TYPE1 = getLettersByType(1).map(String);
const SHIFT_LETTERS = [1, 2, 3].flatMap((t) => getLettersByType(t as 1 | 2 | 3)).map(String);
const ALL = ALL_LETTERS.map(String);

export const GAME_REGISTRY: GameDefinition[] = [
  {
    id: "pictograph-to-letter",
    title: "Name That Pictograph",
    tagline: "See the pictograph. Call the letter.",
    accentColor: "#38bdf8",
    quizType: QuizType.PICTOGRAPH_TO_LETTER,
    levels: [
      { levelNumber: 1, title: "Type 1", mode: { kind: "fixed", questionCount: 10 }, constraints: { letters: TYPE1 }, stars: { one: 600, two: 1000, three: 1400 } },
      { levelNumber: 2, title: "All Shifts", mode: { kind: "fixed", questionCount: 15 }, constraints: { letters: SHIFT_LETTERS }, stars: { one: 900, two: 1500, three: 2100 } },
      { levelNumber: 3, title: "Full Alphabet", mode: { kind: "fixed", questionCount: 20 }, constraints: { letters: ALL }, stars: { one: 1200, two: 2000, three: 2800 } },
      { levelNumber: 4, title: "Countdown", mode: { kind: "countdown", seconds: 90 }, constraints: { letters: ALL }, stars: { one: 1500, two: 2500, three: 3500 } },
    ],
  },
  {
    id: "letter-to-pictograph",
    title: "Picture This",
    tagline: "See the letter. Pick its pictograph.",
    accentColor: "#a78bfa",
    quizType: QuizType.LETTER_TO_PICTOGRAPH,
    levels: [
      { levelNumber: 1, title: "Type 1", mode: { kind: "fixed", questionCount: 10 }, constraints: { letters: TYPE1 }, stars: { one: 600, two: 1000, three: 1400 } },
      { levelNumber: 2, title: "All Shifts", mode: { kind: "fixed", questionCount: 15 }, constraints: { letters: SHIFT_LETTERS }, stars: { one: 900, two: 1500, three: 2100 } },
      { levelNumber: 3, title: "Full Alphabet", mode: { kind: "fixed", questionCount: 20 }, constraints: { letters: ALL }, stars: { one: 1200, two: 2000, three: 2800 } },
      { levelNumber: 4, title: "Countdown", mode: { kind: "countdown", seconds: 90 }, constraints: { letters: ALL }, stars: { one: 1500, two: 2500, three: 3500 } },
    ],
  },
  {
    id: "valid-next",
    title: "What Comes Next",
    tagline: "Which pictograph can legally follow?",
    accentColor: "#34d399",
    quizType: QuizType.VALID_NEXT_PICTOGRAPH,
    levels: [
      { levelNumber: 1, title: "Four Options", mode: { kind: "fixed", questionCount: 10 }, constraints: { optionCount: 4 }, stars: { one: 600, two: 1000, three: 1400 } },
      { levelNumber: 2, title: "Six Options", mode: { kind: "fixed", questionCount: 12 }, constraints: { optionCount: 6 }, stars: { one: 750, two: 1250, three: 1750 } },
      { levelNumber: 3, title: "Countdown", mode: { kind: "countdown", seconds: 90 }, constraints: { optionCount: 6 }, stars: { one: 1200, two: 2000, three: 3000 } },
    ],
  },
  {
    id: "performer-word",
    title: "Read the Performer",
    tagline: "Watch the flow. Name the word.",
    accentColor: "#fb923c",
    quizType: QuizType.SEQUENCE_TO_WORD,
    levels: [
      { levelNumber: 1, title: "Short Words", mode: { kind: "fixed", questionCount: 6 }, constraints: { wordLength: 2 }, stars: { one: 350, two: 600, three: 850 } },
      { levelNumber: 2, title: "Longer Words", mode: { kind: "fixed", questionCount: 8 }, constraints: { wordLength: 3 }, stars: { one: 500, two: 800, three: 1100 } },
      { levelNumber: 3, title: "Full Phrases", mode: { kind: "fixed", questionCount: 10 }, constraints: { wordLength: 4 }, stars: { one: 600, two: 1000, three: 1400 } },
    ],
  },
  {
    id: "speed-blitz",
    title: "Speed Blitz",
    tagline: "The letters come faster. Keep up.",
    accentColor: "#f472b6",
    quizType: QuizType.PICTOGRAPH_TO_LETTER,
    levels: [
      { levelNumber: 1, title: "Warm Up", mode: { kind: "fixed", questionCount: 15 }, constraints: { letters: TYPE1, paceStartSeconds: 6, paceEndSeconds: 3 }, stars: { one: 900, two: 1500, three: 2200 } },
      { levelNumber: 2, title: "Fast Ramp", mode: { kind: "fixed", questionCount: 20 }, constraints: { letters: ALL, paceStartSeconds: 5, paceEndSeconds: 2 }, stars: { one: 1300, two: 2200, three: 3200 } },
      { levelNumber: 3, title: "Survival", mode: { kind: "survival", maxMisses: 3 }, constraints: { letters: ALL, paceStartSeconds: 5, paceEndSeconds: 1.5 }, stars: { one: 1500, two: 3000, three: 5000 } },
    ],
  },
  {
    id: "mandala-match",
    title: "Mandala Match",
    tagline: "One mandala. One word made it. Find it.",
    accentColor: "#fbbf24",
    quizType: QuizType.SEQUENCE_TO_WORD,
    levels: [
      { levelNumber: 1, title: "Four Choices", mode: { kind: "fixed", questionCount: 8 }, constraints: { optionCount: 4 }, stars: { one: 500, two: 800, three: 1100 } },
      { levelNumber: 2, title: "Six Choices", mode: { kind: "fixed", questionCount: 10 }, constraints: { optionCount: 6 }, stars: { one: 650, two: 1050, three: 1450 } },
      { levelNumber: 3, title: "Lookalikes", mode: { kind: "fixed", questionCount: 10 }, constraints: { optionCount: 6 }, stars: { one: 700, two: 1150, three: 1600 } },
    ],
  },
];

export function getGame(id: string): GameDefinition | undefined {
  return GAME_REGISTRY.find((g) => g.id === id);
}
```

Verify `@tka/domain` exports resolve from app code the way Tika imports them
(grep `from "@tka/domain"` in `src/lib/features/tika/` and copy that import
form — if the app imports a subpath, match it).

- [ ] **Step 10: Run tests + commit**

Run: `npx vitest run tests/unit/play/`
Expected: PASS.

```bash
git add src/lib/features/learn/play/domain tests/unit/play src/lib/features/learn/quiz/services/question-generator.ts
git commit -m "feat(play): arcade domain — types, scoring, progression, game registry, generator constraints" -- src/lib/features/learn/play/domain tests/unit/play src/lib/features/learn/quiz/services/question-generator.ts
```

---

### Task 2: Arcade session engine

**Files:**
- Create: `src/lib/features/learn/play/state/arcade-session-state.svelte.ts`
- Create: `src/lib/features/learn/play/state/view-transition.ts`
- Test: `tests/unit/play/arcade-session.test.ts` (runs in vitest jsdom; runes work in `.test.ts` via svelte compile — follow the pattern of existing `*.svelte.test.ts`/state tests: check `src/lib/features/learn/codex/state/` for the existing persisted-state test and mirror its setup. If runes-in-test friction appears, extract the transition logic into pure helpers and test those.)

- [ ] **Step 1: Write `view-transition.ts`**

```typescript
/**
 * Same-document View Transitions wrapper (Baseline 2025). Not router
 * navigation — SvelteKit onNavigate does not apply to component-state screen
 * changes. Skips under prefers-reduced-motion (the API does not honor it
 * natively).
 */
export function withViewTransition(mutate: () => void): void {
  const reduced =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  const start = (document as Document & {
    startViewTransition?: (cb: () => void) => unknown;
  }).startViewTransition;
  if (reduced || typeof start !== "function") {
    mutate();
    return;
  }
  start.call(document, mutate);
}
```

- [ ] **Step 2: Write the session factory**

`arcade-session-state.svelte.ts` — the FSM. Complete contract:

```typescript
/**
 * Arcade session engine — THE single source of truth for a play session.
 * Discriminated-union phase FSM on runes. Games render questions and emit
 * QuizAnswerEvent; the engine scores, streaks, clocks, and completes.
 *
 * Replaces the deleted QuizSessionManager (which scored by coin flip) and the
 * QuizTab/QuizWorkspaceView dual-session split.
 */
import { getContext, setContext } from "svelte";
import type { QuizAnswerEvent } from "../../quiz/domain/models/quiz-models";
import type {
  AnswerRecord, ArcadeSessionResult, GameDefinition, LevelDefinition,
} from "../domain/arcade-types";
import { computeGrade, scoreAnswer } from "../domain/scoring";
import { computeStars } from "../domain/progression";

export type ArcadePhase =
  | { name: "hub" }
  | { name: "level-select"; game: GameDefinition }
  | { name: "playing"; game: GameDefinition; level: LevelDefinition }
  | { name: "results"; game: GameDefinition; level: LevelDefinition; result: ArcadeSessionResult };

export function createArcadeSession() {
  let phase = $state<ArcadePhase>({ name: "hub" });
  let score = $state(0);
  let streak = $state(0);
  let longestStreak = $state(0);
  let misses = $state(0);
  let records = $state<AnswerRecord[]>([]);
  let questionIndex = $state(0);
  let questionShownAt = 0; // ms epoch, not reactive
  let startedAt = 0;
  // countdown clock
  let timeRemaining = $state(0);
  let clockHandle: ReturnType<typeof setInterval> | null = null;

  const accuracy = $derived(
    records.length === 0 ? 0 : records.filter((r) => r.event.isCorrect).length / records.length
  );

  function selectGame(game: GameDefinition) { /* phase -> level-select */ }
  function startLevel(game: GameDefinition, level: LevelDefinition) {
    // reset score/streak/misses/records/questionIndex, startedAt = Date.now()
    // if level.mode.kind === "countdown": timeRemaining = seconds, start 250ms
    // drift-corrected interval that derives remaining from Date.now() - startedAt
    // and calls complete() at <= 0.
  }
  function markQuestionShown() { questionShownAt = Date.now(); }
  function submitAnswer(event: QuizAnswerEvent) {
    // answerTimeMs = Date.now() - questionShownAt
    // points = scoreAnswer({ isCorrect: event.isCorrect, answerTimeMs, streakBefore: streak })
    // streak = event.isCorrect ? streak + 1 : 0; longestStreak = max
    // misses += event.isCorrect ? 0 : 1
    // records.push({...}); score += points; questionIndex++
    // completion checks:
    //   fixed: records.length >= mode.questionCount -> complete()
    //   survival: misses >= mode.maxMisses -> complete()
    //   countdown: clock owns completion
  }
  function complete() {
    // stop clock; build ArcadeSessionResult (grade = computeGrade(accuracy),
    // starsEarned = computeStars(score, level.stars), isNewBest: false — the
    // store computes the real value and PlayHub passes it to ArcadeResults as
    // a prop); phase -> results (wrap phase mutations in withViewTransition
    // at the component layer, not here — engine stays DOM-free)
  }
  function quitToHub() { /* stop clock, phase -> hub */ }
  function backToLevels() { /* phase -> level-select for current game */ }
  function destroy() { /* clear interval */ }

  return {
    get phase() { return phase; },
    get score() { return score; },
    get streak() { return streak; },
    get longestStreak() { return longestStreak; },
    get misses() { return misses; },
    get records() { return records; },
    get questionIndex() { return questionIndex; },
    get timeRemaining() { return timeRemaining; },
    get accuracy() { return accuracy; },
    selectGame, startLevel, markQuestionShown, submitAnswer,
    complete, quitToHub, backToLevels, destroy,
  };
}

export type ArcadeSession = ReturnType<typeof createArcadeSession>;

const KEY = Symbol("arcade-session");
export function setArcadeSessionContext(s: ArcadeSession) { setContext(KEY, s); }
export function getArcadeSession(): ArcadeSession {
  const s = getContext<ArcadeSession>(KEY);
  if (!s) throw new Error("Arcade session context missing — PlayHub must set it");
  return s;
}
```

Implement every commented body fully. The countdown clock derives remaining
time from wall-clock delta (`Math.max(0, seconds - (Date.now() - startedAt) / 1000)`),
never decrement-by-tick (drift). Survival mode: countdown-per-question pacing
(paceStartSeconds→paceEndSeconds) is owned by the Speed Blitz game component
(Task 8), NOT the engine — engine only tracks misses.

- [ ] **Step 3: Write engine tests**

`tests/unit/play/arcade-session.test.ts` — test via the factory directly
(vitest + fake timers). Cover, minimum:
- right answer increments score by `scoreAnswer` amount and streak by 1
- wrong answer zeros streak, increments misses, adds 0 points
- fixed mode completes after N answers with correct grade + stars
- survival completes at maxMisses
- countdown completes when clock hits 0 (vi.useFakeTimers + advance)
- longestStreak survives a streak reset

Use a minimal fake `QuizAnswerEvent` (only `isCorrect` matters to the engine):

```typescript
function evt(isCorrect: boolean): QuizAnswerEvent {
  return {
    isCorrect,
    questionData: { questionId: "q", questionContent: null, answerOptions: [], correctAnswer: null, questionType: "letter" as never, answerType: "button" as never, lessonType: "pictograph_to_letter" as never },
    selectedOptionId: "a", selectedContent: null, correctContent: null,
    quizType: "pictograph_to_letter" as never, answeredAt: new Date(),
  };
}
```

If `$state` in a plain `.test.ts` fails to compile, rename the test
`arcade-session.svelte.test.ts` — this repo's vitest is configured for
`.svelte.test.ts` runes tests (see `docs/reference/component-testing.md`
naming footgun note; check an existing example under
`src/lib/features/learn/codex/state/`).

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run tests/unit/play/`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(play): arcade session engine — runes FSM, real scoring, engine-owned clock" -- src/lib/features/learn/play/state tests/unit/play
```

(`git add` those paths first; pathspec on commit regardless.)

---

### Task 3: Progress store + Firestore rules

**Files:**
- Create: `src/lib/features/learn/play/services/play-progress-store.ts`
- Modify: `src/lib/features/learn/data/firestore-paths.ts` (add playProgress path helper)
- Modify: `firestore.rules` (add playProgress rule next to learningProgress)
- Test: `tests/unit/play/play-progress-store.test.ts`

- [ ] **Step 1: Read the reference implementation**

Read `src/lib/features/learn/services/concept-progress-tracker.ts` (dual-write
pattern) and `src/lib/features/learn/services/user-knowledge-profile-persister.ts`
(Firestore side) end to end before writing anything.

- [ ] **Step 2: Write the store**

`play-progress-store.ts` — module-level singleton via getter (follow
`get-concept-progress-tracker.ts` naming/getter convention; service-naming
skill: no "Service" suffix). Public API:

```typescript
export interface PlayProgressStore {
  /** Synchronous read from memory (hydrated from localStorage at first get). */
  getProgress(): PlayProgress;
  getGameProgress(gameId: GameId): GameProgress;
  /** Applies a session result; persists localStorage immediately, Firestore
   *  fire-and-forget when signed in. Returns updated progress + isNewBest. */
  recordResult(result: Omit<ArcadeSessionResult, "isNewBest">): { progress: GameProgress; isNewBest: boolean };
  /** Wire Firestore sync after sign-in; merges by lastUpdated (mergeProgress). */
  initializeForUser(userId: string): Promise<void>;
  reset(): void; // test hook
}
```

- localStorage key: `tka_play_progress`, JSON `PlayProgress`.
- Firestore doc: `users/{uid}/playProgress/current` via
  `firestoreGet`/`firestoreSet` helpers (`src/lib/shared/firestore/firestore-crud.ts`)
  with `merge: true`.
- `isNewBest` = result.score > previous `bestScore` for that game.
- Guests: localStorage only; `initializeForUser` never called.

- [ ] **Step 3: Tests**

`tests/unit/play/play-progress-store.test.ts`: mock localStorage (jsdom has
it), do NOT hit Firestore (mock the firestore-crud module with `vi.mock`).
Cover: first-play creates progress; worse-result keeps best; new-best flag;
merge picks newer lastUpdated on initializeForUser (mock remote fetch).

Run: `npx vitest run tests/unit/play/play-progress-store.test.ts` → PASS.

- [ ] **Step 4: firestore-paths + rules**

`firestore-paths.ts`: add

```typescript
export function getUserPlayProgressPath(userId: string): string {
  return `users/${userId}/playProgress/current`;
}
```

`firestore.rules`: find the `learningProgress` match block under
`users/{userId}` (~line 433) and clone it as `playProgress`:

```
match /playProgress/{docId} {
  allow read: if isOwner(userId) || isAdmin();
  allow create, update: if isOwner(userId);
  allow delete: if false;
}
```

Match the exact function names/conditions used by the adjacent
`learningProgress` block — read it first, mirror precisely.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(play): personal-best progress store — localStorage-first, Firestore sync, playProgress rules" -- src/lib/features/learn/play/services tests/unit/play/play-progress-store.test.ts src/lib/features/learn/data/firestore-paths.ts firestore.rules
```

---

### Task 4: GameShell + port the 4 existing games

**Files:**
- Create: `src/lib/features/learn/play/components/GameShell.svelte`
- Create: `src/lib/features/learn/play/games/` — move+adapt: `PictographToLetterGame.svelte` (from `quiz/components/PictographToLetterQuiz.svelte`), `LetterToPictographGame.svelte`, `ValidNextGame.svelte`, `PerformerWordGame.svelte`
- The shared question-render kit stays where it is (`quiz/components/shared/*`) — games import it from there. Do NOT duplicate those files.

- [ ] **Step 1: GameShell contract**

`GameShell.svelte` renders during `phase.name === "playing"`. Gets session
via `getArcadeSession()`. Layout:

- Top bar (fixed height, no layout shift): back button (44px, quit-confirms
  via existing modal kit ONLY if mid-level with answers recorded), level
  label, question progress (`{questionIndex + 1}/{count}` for fixed mode,
  tabular-nums; miss pips for survival; nothing for countdown), score
  (tabular-nums, `svelte/motion` Spring on the displayed value), streak flame
  (reserved slot, `visibility: hidden` below 3-streak; flame + count at 3+),
  timer ring for countdown levels (`ProgressRing` percent =
  timeRemaining/total, plus mm:ss via `format-time.ts`).
- Stage: fixed flex-grown area; question components crossfade via the shared
  `Crossfade` primitive, `fill` mode, key = questionIndex.
- Game routing by `phase.game.quizType` + `phase.game.id` (speed-blitz and
  mandala-match get their own components in Tasks 8-9; wire the four ports
  now with a `{#if}` chain like QuizWorkspaceView had).
- Per-game accent: `style="--game-accent: {phase.game.accentColor}"` on the
  shell root. Consume in CSS via `var(--game-accent)`. Never redeclare
  `--theme-*`.

- [ ] **Step 2: Port the four games**

For each: copy the quiz component to `play/games/<Name>Game.svelte`, then:
1. Delete local streak state (`currentStreak`, streak-based confetti) — the
   engine owns streak; shell owns streak display. Keep per-answer haptics +
   feedback banner + misconception hint + ScorePopAnimation.
2. On question shown (after `loadQuestion` resolves), call
   `session.markQuestionShown()`.
3. Replace `onAnswerSubmit?.(event)` prop-drilling with
   `getArcadeSession().submitAnswer(event)` (keep the event construction
   exactly as-is — gap detection depends on its shape). After the feedback
   pause, advance to the next question (each game already self-advances via
   its next-question timer; keep that, but read
   `session.phase.name === "playing"` before loading the next question so
   completion stops the loop).
4. Accept `constraints: QuestionConstraints` as a prop; pass
   `{ letters, optionCount }` through to
   `QuestionGenerator.generateQuestion(type, constraints)`.
   `PerformerWordGame` passes `wordLength` to the sequence generator — add a
   `wordLength` filter inside `sequence-question-generator.ts`'s
   `pickRandomSequence` path: prefer sequences whose simplified word length
   === wordLength; fall back to any if fewer than 4 available (log nothing,
   soft constraint).
5. Remove `onBack`/`onNextQuestion` props (shell owns chrome).

- [ ] **Step 3: Manual smoke via vitest compile**

Run: `npx vitest run tests/unit/play/` (still green) and
`npx svelte-check --threshold error --filter src/lib/features/learn/play 2>/dev/null || true` —
if the repo has no scoped-check script, skip; type errors surface in Task 10's
full check.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(play): GameShell chrome + four games ported onto the arcade engine" -- src/lib/features/learn/play/components/GameShell.svelte src/lib/features/learn/play/games src/lib/features/learn/quiz/services/sequence-question-generator.ts
```

---

### Task 5: PlayHub + GameCard + live previews

**Files:**
- Create: `src/lib/features/learn/play/components/PlayHub.svelte`
- Create: `src/lib/features/learn/play/components/GameCard.svelte`
- Create: `src/lib/features/learn/play/components/previews/PictographShufflePreview.svelte`, `LetterStreamPreview.svelte`, `MandalaBloomPreview.svelte`, `PerformerPulsePreview.svelte`, `SequenceFlowPreview.svelte`, `OptionPulsePreview.svelte`

**Design bar:** this is the magnet surface. Consult the frontend-design skill.
Dark stage, per-game accent glow, live motion. But: tokens only, no
`--theme-*` declarations, reduced-motion = static first frame.

- [ ] **Step 1: PlayHub**

- Sets the arcade session context: `const session = createArcadeSession();
  setArcadeSessionContext(session);` and owns phase routing:
  hub grid → `LevelPicker` (Task 6) → `GameShell` → `ArcadeResults` (Task 6),
  all mutations wrapped in `withViewTransition`.
- Hero: title ("Play"), one-line sub ("Six games. Your best scores are
  waiting."). Copy must pass the fire-jam test — no hype adjectives.
- Grid: `display: grid`, container query on the hub
  (`container-type: inline-size`): 1 col < 640px, 2 cols ≥ 640px, 3 cols ≥ 1024px.
  `content-visibility: auto` + `contain-intrinsic-size` on cards.
- Card entrance: `@starting-style` opacity/translate rise with per-card
  `transition-delay: calc(var(--card-index) * 40ms)`.

- [ ] **Step 2: GameCard**

Props: `game: GameDefinition`, `progress: GameProgress`, `index: number`,
`onSelect: () => void`. A single `<button>` (whole card clickable,
button-styled). Contents:
- Preview stage: fixed `aspect-ratio: 16/10` box (reserved — no shift), the
  game's preview component inside, accent-tinted radial glow behind.
- Title + tagline.
- Stats row (reserved height even when empty): best score (tabular-nums) +
  grade chip when `progress.totalPlays > 0`, star count `★ n/⟨3×levels⟩`,
  level indicator. Use small `ProgressRing` for stars/levels ratio.
- Hover: translateY(-4px) + accent glow shadow; active: scale(0.98);
  transitions on transform/box-shadow only (compositor).

- [ ] **Step 3: Previews (6 tiny components)**

Shared rules: pure SVG/CSS keyframes on transform/opacity ONLY. Each accepts
`accent: string`. Pause offscreen: one shared `IntersectionObserver` in
PlayHub toggling a `data-paused` attr on cards; previews style
`[data-paused] * { animation-play-state: paused; }`. Reduced-motion: media
query sets `animation: none` (static first frame).

- `PictographShufflePreview`: 3 letter glyphs (styled text, TKA Letters font
  if trivially available, else system) cycling opacity/position.
- `LetterStreamPreview`: letters scrolling leftward at increasing speed
  (two staggered rows, CSS marquee via transform keyframes).
- `MandalaBloomPreview`: static `SequenceMandala` render of a hardcoded small
  sequence is NOT available cheaply here — instead concentric SVG circles/arcs
  rotating slowly (accent-stroked), evoking the mandala. Do not mount the real
  SequenceMandala on hub cards (cost).
- `PerformerPulsePreview`: SVG stick-figure silhouette with two accent dots
  orbiting (CSS rotate on wrapper groups).
- `SequenceFlowPreview` (valid-next): three small rounded squares, the third
  pulsing between two candidate positions.
- `OptionPulsePreview`: spare — 2x2 dot grid with a highlight ring hopping
  cells. Use for valid-next if SequenceFlowPreview reads poorly; otherwise
  unused (delete before commit if unused).

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(play): live arcade hub — game cards with animated previews, container-query grid" -- src/lib/features/learn/play/components
```

---

### Task 6: ArcadeResults + LevelPicker

**Files:**
- Create: `src/lib/features/learn/play/components/ArcadeResults.svelte`
- Create: `src/lib/features/learn/play/components/LevelPicker.svelte`

- [ ] **Step 1: LevelPicker**

Rendered at `phase.name === "level-select"`. Header: game title + tagline +
best score. Level ladder: one row per `LevelDefinition` — level number, title,
mode summary ("10 questions" / "90 seconds" / "3 misses"), earned stars
(★★☆), locked state (lock glyph + disabled) for levels >
`progress.levelsUnlocked`. Rows are `<button>`s (44px+). Locked rows:
`aria-disabled`, no click. Back button → `session.quitToHub()` via
`withViewTransition`.

- [ ] **Step 2: ArcadeResults**

Rendered at `phase.name === "results"`. Sequence (staggered reveals, DURATION
tokens):
1. Grade letter (large, accent-colored, spring scale-in via `svelte/motion`
   Spring on scale).
2. Score count-up: reuse `AnimatedScoreCounter` — MOVE the file from
   `quiz/components/AnimatedScoreCounter.svelte` to
   `play/components/AnimatedScoreCounter.svelte` (it survives the Task 7
   purge; update its imports if any).
3. Stars: three star glyphs, earned ones pop in staggered (200ms apart,
   heavier 400ms beat on the last earned star).
4. Best delta line (reserved height): "New best!" when `result.isNewBest`,
   else "Best: {bestScore}".
5. Stats row: accuracy %, longest streak, duration (format-time).
6. Misconception summary: reuse `analyzeErrors` from
   `$lib/features/learn/services/gap-detector` on wrong-answer records and
   render via the existing `QuizMisconceptionSummary.svelte` — MOVE it to
   `play/components/` as well (it's results-only chrome; keep its internals).
7. Actions: Replay level / Next level (if unlocked) / Back to games — real
   buttons, 44px.

On mount: call `playProgressStore.recordResult(...)` exactly once with the
session result (PlayHub passes the store result back in so `isNewBest` is
known BEFORE render — wire: PlayHub effect on phase change to results calls
recordResult, stores `{progress, isNewBest}` in hub-local state, passes to
ArcadeResults as props. ArcadeResults itself stays side-effect-free).
Confetti: `delight-orchestrator.celebrate(...)` when isNewBest or 3 stars.
Persist attempt via `quiz-history-recorder.recordAttempt` with REAL score
(same shape QuizTab used — port the `persistQuizAttempt` logic from
`QuizTab.svelte:189-221` into PlayHub's results effect, replacing its
score/total with engine values; keep the `getEffectiveUserId()` guest guard).

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(play): level picker + arcade results — grade reveal, stars, best tracking, real persistence" -- src/lib/features/learn/play/components
```

---

### Task 7: LearnTab wiring + legacy deletion

**Files:**
- Modify: `src/lib/features/learn/LearnTab.svelte` (play mode → PlayHub)
- Delete: `quiz/components/QuizTab.svelte`, `QuizWorkspaceView.svelte`, `QuizSelectorView.svelte`, `LessonButton.svelte`, `QuizModeToggle.svelte`, `QuizTimer.svelte`, `QuizResultsView.svelte`, `QuizResultsHeader.svelte`, `QuizStatsGrid.svelte`, `QuizResultsActions.svelte`, `QuizPerformanceGrade.svelte`, `AchievementUnlockOverlay.svelte`, `QuizAchievementsBadges.svelte`, `PerfectQuizCelebration.svelte`
- Delete: `quiz/services/quiz-session-manager.ts`, `quiz/services/quiz-repo-manager.ts`, `quiz/domain/achievement-definitions.ts`
- Delete: `src/lib/features/learn/quiz/get-quiz-session-manager.ts`, `get-quiz-repo-manager.ts` (confirm paths via glob `**/get-quiz-*.ts`)
- Keep: `quiz/components/shared/*` (question-render kit used by games), `quiz/services/question-generator.ts`, `sequence-question-generator.ts`, `quiz-configurator.ts` IF still imported (grep; delete if orphaned), `quiz/domain/{enums,models,constants}` (enums/models used by games; constants — grep `LESSON_INFO` and `quiz-constants` consumers; delete dead exports, keep used ones), `quiz-results-analyzer.ts` — grep consumers; if only deleted components used it, delete it too.

- [ ] **Step 1: Rewire LearnTab**

In `LearnTab.svelte` (~line 212): replace `<QuizTab />` with `<PlayHub />`
(import from `./play/components/PlayHub.svelte`). Legacy mode aliases
`"quiz"`/`"drills"` → `"play"` at lines ~80-85 stay untouched.

- [ ] **Step 2: Delete, then chase imports**

Delete the listed files. Then:

```bash
grep -rn "QuizTab\|QuizWorkspaceView\|QuizSelectorView\|quiz-session-manager\|quiz-repo-manager\|QuizTimer\|QuizResultsView\|achievement-definitions\|AchievementUnlockOverlay\|PerfectQuizCelebration\|QuizAchievementsBadges" src/ --include=*.ts --include=*.svelte
```

Expected: zero hits outside `play/` (and zero there except this plan's own
components). Fix any stragglers (e.g. `QuizPerformanceGrade` imports inside
kept files) by removing the dead import path or moving the small component
into `play/components/` if a ported game legitimately uses it.

- [ ] **Step 3: Scoped type sanity**

Run: `npx vitest run tests/unit/play/` → PASS. Full `svelte-check` happens in
Task 10; here just ensure no test regressions and grep shows no dead imports.

- [ ] **Step 4: Commit**

```bash
git add -u src/lib/features/learn
git commit -m "feat(play): wire PlayHub into LearnTab; delete coin-flip session manager and legacy quiz chrome" -- src/lib/features/learn
```

(The `-u` add is scoped to `src/lib/features/learn`; the commit pathspec keeps
it to your own tree. Deletions must be committed via the pathspec too.)

---

### Task 8: Speed Blitz

**Files:**
- Create: `src/lib/features/learn/play/games/SpeedBlitzGame.svelte`

Mechanics reference: read `src/lib/features/learn/components/interactive/positions/SpeedRounds.svelte`
first (positions-scoped speed round — mechanics inspiration, zero code reuse
of its position specifics).

- [ ] **Step 1: Build the game**

- Uses `QuestionGenerator.generateQuestion(QuizType.PICTOGRAPH_TO_LETTER, { letters })`
  — same render kit as PictographToLetterGame (QuizPictographCard +
  QuizLetterButton kit from `quiz/components/shared/`).
- Per-question countdown: allowed time interpolates linearly from
  `paceStartSeconds` to `paceEndSeconds` across the level
  (`questionCount` for fixed; across 20 questions rolling for survival).
  Slim progress bar under the pictograph drains (CSS transform scaleX driven
  by a rAF loop or WAAPI — transform only). Time-out counts as a wrong answer:
  construct a `QuizAnswerEvent` with `isCorrect: false`,
  `selectedOptionId: "timeout"`, `selectedContent: null` and submit it.
- Answer or timeout → brief feedback flash (correct letter highlighted) →
  next question after 500ms (shorter than standard games — blitz pacing).
- Survival mode: on 3rd miss the engine completes; game must stop its
  per-question clock when `session.phase.name !== "playing"`.

- [ ] **Step 2: Register in GameShell routing** (`{:else if phase.game.id === "speed-blitz"}`).

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(play): Speed Blitz — escalating per-question clock, survival mode" -- src/lib/features/learn/play/games/SpeedBlitzGame.svelte src/lib/features/learn/play/components/GameShell.svelte
```

---

### Task 9: Mandala Match

**Files:**
- Create: `src/lib/features/learn/play/games/MandalaMatchGame.svelte`
- Modify: `src/lib/features/learn/quiz/services/sequence-question-generator.ts` (distractor count + lookalike option)

- [ ] **Step 1: Extend sequence-question-generator**

`generateSequenceToWordQuestion(questionId)` gains options:

```typescript
export interface SequenceQuestionOptions {
  optionCount?: number; // default 4
  /** Prefer distractor words sharing letters with the target (lookalikes). */
  similarDistractors?: boolean;
  wordLength?: number; // soft filter, added in Task 4
}
export async function generateSequenceToWordQuestion(
  questionId: string,
  options: SequenceQuestionOptions = {}
): Promise<QuizQuestionData> {
```

`pickDistractorWords(word, n)` already exists — thread `optionCount - 1`
through. `similarDistractors`: sort candidate words by shared-letter count
with the target (descending) before taking n; keep the existing
distinct-word guarantee. All words already flow through
`simplifyRepeatedWord` — preserve that.

- [ ] **Step 2: Build the game**

- Question: `generateSequenceToWordQuestion(id, { optionCount, similarDistractors: levelNumber === 3 })`.
- Render the target: `SequenceMandala` (from
  `$lib/shared/mandala/components/SequenceMandala.svelte`) with
  `sequence={questionData.questionContent as SequenceData}`, `mode="gallery"`,
  sized to the stage (square, max ~min(60cqh, 90cqw)). Optional slow
  `animate` only if reduced-motion is off.
- Answers: word buttons (reuse `QuizWordButton` from
  `quiz/components/shared/`). Words are ALREADY simplified by the generator —
  render as-is, never re-derive from `seq.word`.
- Same submit/feedback/advance flow as the ported games
  (markQuestionShown → submitAnswer → feedback → next).

- [ ] **Step 3: Register in GameShell routing; commit**

```bash
git commit -m "feat(play): Mandala Match — sequence mandala target, lookalike distractors" -- src/lib/features/learn/play/games/MandalaMatchGame.svelte src/lib/features/learn/play/components/GameShell.svelte src/lib/features/learn/quiz/services/sequence-question-generator.ts
```

---

### Task 10: Regression test + contract greps + full verification

**Files:**
- Create: `src/lib/features/learn/play/components/GameShell.svelte.test.ts` (component test, vitest-browser-svelte — see `docs/reference/component-testing.md` for setup + the `.svelte.test.ts` naming requirement)

- [ ] **Step 1: The coin-flip regression component test**

One browser test locking the bug class that broke Play: mount PlayHub (or a
minimal harness setting arcade context + a stub game), simulate one correct
and one incorrect answer via `session.submitAnswer(evt(true/false))`, assert
displayed score equals `scoreAnswer` output and NOT a random value, and that
completing a 2-question fixed level lands in results with
`correctCount === 1, totalCount === 2`. If mounting the full hub proves
heavy, test the session factory + a thin harness component instead — the
assertion that matters: submitted correctness flows to displayed results 1:1.

- [ ] **Step 2: Contract greps (all must be clean)**

```bash
grep -rn 'type="checkbox"' src/lib/features/learn/play/            # expect: nothing
grep -rn 'class="chip"\|class="pill"' src/lib/features/learn/play/ # expect: nothing
grep -rn -- '--theme-[a-z-]*:' src/lib/features/learn/play/        # expect: nothing (declarations)
grep -rn 'Math.random() >' src/lib/features/learn/                 # expect: nothing scoring-related
grep -rn '\.word' src/lib/features/learn/play/ | grep -v simplifyRepeatedWord | grep -v '// data'  # audit each hit
```

- [ ] **Step 3: Full check + unit suite**

```bash
npm run check > /tmp/check.log 2>&1
grep -ciE "error" /tmp/check.log   # expect 0 errors (grep the log, don't re-run)
npx vitest run tests/unit/play/ --config tests/config/vitest.config.ts
```

(The `--config` flag is required — bare `npx vitest run` misses the jsdom
setup and falsely fails the store test on missing localStorage.)

Fix anything red. Repeat the single check only after fixes if errors were
found.

- [ ] **Step 4: Final commit**

```bash
git commit -m "test(play): coin-flip regression component test + contract greps green" -- src/lib/features/learn/play/components/GameShell.svelte.test.ts
```

---

## Ledger

- [x] Task 1 — domain modules + registry + generator constraints (c91695a774; Component import dropped as unused)
- [x] Task 2 — session engine (552f2d6513; $derived accuracy → computeAccuracy() plain fn, real recompute bug repro'd; bestCombo = longestStreak placeholder; test stays plain .test.ts — tests/unit excludes .svelte.test.ts)
- [x] Task 3 — progress store + rules (67bbd75cfe; getter at play/get-play-progress-store.ts; rules mirror learningProgress exactly incl. its delete clause; agent commit perms rejected → orchestrator committed staged work)
- [x] Task 4 — GameShell + 4 ports (7e4bdbd584; Crossfade keyed on playing-phase object NOT questionIndex — index increments synchronously at answer, keying it would remount mid-feedback; wordLength threaded through question-generator too; six-branch routing incl. placeholder branches for T8/T9)
- [x] Task 5 — PlayHub + cards + previews (d301337d77; wrapped-session context = view transitions on phase mutations only; results side effects in $effect.pre w/ identity guard; OptionPulsePreview kept for letter-to-pictograph; :global pause rule in PlayHub — Svelte prunes unmatched selectors)
- [x] Task 6 — ArcadeResults + LevelPicker (6beac42b7d; side-effect-free per pin; inline SVG stars — no shared star primitive exists; third action = "Back to levels" matching backToLevels(); old importers left broken-on-purpose for Task 7 deletion)
- [x] Task 7 — LearnTab wiring + deletions (899ca28d29; 26 files/-6819 lines; DEVIATION: quiz-repo-manager.ts + get-quiz-repo-manager.ts KEPT — load-bearing for Codex/Guide (get-codex.ts imports getQuizRepoManager); 9 extra orphans deleted w/ grep evidence incl. pre-port game originals)
- [x] Task 8 — Speed Blitz (13e3a87b2b; drift-corrected rAF drain bar, timeout = synthetic wrong-answer event so QuizLetterButton renders correct-letter state for free; no MisconceptionHint — 5s read time incompatible with 500ms blitz pause)
- [x] Task 9 — Mandala Match (0760099805; agent hit session limit pre-commit, orchestrator verified — compile smoke + 36/36 tests — and committed; calls sequence generator directly (dispatcher lacks optionCount/similarDistractors threading); ResizeObserver stage sizing per MandalaPane technique)
- [x] Task 10 — regression test + verification (331d3f5255 component test via GameShellTestHarness — GameShell renders nothing in results phase, harness renders raw engine truth; 1/1 in Chromium, component suite 35/35; contract greps clean; full svelte-check 0 errors 0 warnings)

## Post-plan additions (Austen, 2026-07-12)

- [x] 4K survival pass (5a636794bf) — 1920/2560 media tiers across games, hub, shell, shared kit
- [x] 4K-native layout pass (df50b7c1d1) — vertical centering (margin-block auto shells), fluid top-end scaling (clamp/cqi), type scale, drain-track widened; check green after
- Browser verification at 3840×2160 (pre-native-pass): hub + Name That Pictograph + Mandala Match render; scoring verified live (correct answer → exactly BASE_POINTS 100, 1/10→2/10); full 8-question Mandala run → results (D, 100, "New best!", 13% accuracy = 1/8) → hub card "Best 100 D" → localStorage record correct. Austen does the visual pass on the native layout.

## Known follow-ups (not in this plan's scope)

1. **firestore.rules deploy** — playProgress rule exists locally only; production sync fails w/ permission warn (localStorage fallback works). Deploy rules before release.
2. **A11y answer leak** — pictograph alt text names the letter ("Letter E, beta to alpha...") on quiz questions; screen readers get the answer. Shared kit tradeoff; needs a quiz-context alt suppression.
3. **Transient hub-bounce** — one unreproduced fall-back-to-hub after level-select during automated clicking mid-view-transition; zero console errors; watch for it in manual testing.
4. Phase 2 per spec: leaderboards endpoint + rules + indexes, Memory Pairs, Sequence Builder.

## Out of scope (phase 2 — do NOT build)

Leaderboards (`/api/play/score`, `playLeaderboards`), Memory Pairs, Sequence
Builder Puzzle, any XP/achievement/streak-persistence surface.
