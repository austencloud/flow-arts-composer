<!--
ConstructionQuiz - Orchestrates a 10-question quiz where users build placements
by placing hands on the grid. Adaptive difficulty ramps from diamond-only to mixed grids.
Wrong answers receive semantic feedback explaining WHAT they built vs. WHAT was requested.
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { onDestroy } from "svelte";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import {
    PLACEMENT_TYPE_INFO,
    type PlacementType,
    type HandPosition,
  } from "../../../domain/constants/placement-quiz-data";
  import type { PlacementsExperienceStateManager } from "./placement-experience-state.svelte";
  import PlacementGrid from "./PlacementGrid.svelte";
  import QuizPrompt from "./construction-quiz/QuizPrompt.svelte";
  import SemanticFeedback from "./construction-quiz/SemanticFeedback.svelte";
  import StreakDisplay from "./construction-quiz/StreakDisplay.svelte";

  interface Props {
    experienceState: PlacementsExperienceStateManager;
  }

  let { experienceState }: Props = $props();

  // Haptic feedback

  let hapticService: { trigger: (type: string) => void } | null = null;
  try {
    hapticService = getHapticFeedback() as {
      trigger: (type: string) => void;
    } | null;
  } catch {
    // Haptic not available
  }

  // Placement type detection

  const OPPOSITE_PAIRS: Record<string, string> = {
    N: "S",
    S: "N",
    E: "W",
    W: "E",
    NE: "SW",
    SW: "NE",
    NW: "SE",
    SE: "NW",
  };

  function detectPlacementType(left: string, right: string): PlacementType {
    if (left === right) return "beta";
    if (OPPOSITE_PAIRS[left] === right) return "alpha";
    return "gamma";
  }

  // Question generation with adaptive difficulty

  interface ConstructionQuestion {
    targetType: PlacementType;
    gridMode: GridMode;
    difficulty: number;
  }

  const PLACEMENT_TYPES: PlacementType[] = ["alpha", "beta", "gamma"];

  function generateQuestions(): ConstructionQuestion[] {
    const questions: ConstructionQuestion[] = [];

    // Phase 1 (Q1-3): Diamond grid only, one of each type
    const phase1Types = shuffleArray([...PLACEMENT_TYPES]);
    for (const type of phase1Types) {
      questions.push({ targetType: type, gridMode: GridMode.DIAMOND, difficulty: 1 });
    }

    // Phase 2 (Q4-6): Box grid introduced, one of each type
    const phase2Types = shuffleArray([...PLACEMENT_TYPES]);
    for (const type of phase2Types) {
      questions.push({ targetType: type, gridMode: GridMode.BOX, difficulty: 2 });
    }

    // Phase 3 (Q7-8): Mixed grids, random types
    for (let i = 0; i < 2; i++) {
      const type = PLACEMENT_TYPES[Math.floor(Math.random() * PLACEMENT_TYPES.length)]!;
      const grid = Math.random() < 0.5 ? GridMode.DIAMOND : GridMode.BOX;
      questions.push({ targetType: type, gridMode: grid, difficulty: 3 });
    }

    // Phase 4 (Q9-10): Harder - less common types (gamma-heavy since it's trickiest)
    const hardTypes: PlacementType[] = ["gamma", "gamma", "alpha"];
    for (let i = 0; i < 2; i++) {
      const type = hardTypes[Math.floor(Math.random() * hardTypes.length)]!;
      const grid = Math.random() < 0.5 ? GridMode.DIAMOND : GridMode.BOX;
      questions.push({ targetType: type, gridMode: grid, difficulty: 4 });
    }

    return questions;
  }

  function shuffleArray<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    return arr;
  }

  // Quiz state

  let currentQuestion = $state(0);
  let questions = $state<ConstructionQuestion[]>(generateQuestions());
  let feedbackState = $state<"idle" | "correct" | "incorrect">("idle");
  let userPlacement = $state<{ left: HandPosition; right: HandPosition } | null>(null);
  let builtType = $state<PlacementType | null>(null);
  let advanceTimer: ReturnType<typeof setTimeout> | null = null;

  // Key for forcing PlacementGrid reset (toggled on each question advance)
  let gridKey = $state(0);

  const isComplete = $derived(currentQuestion >= questions.length);
  const passed = $derived(experienceState.quizScore >= 7);
  const currentQ = $derived(
    currentQuestion < questions.length ? questions[currentQuestion]! : null,
  );

  // Cleanup

  onDestroy(() => {
    if (advanceTimer !== null) clearTimeout(advanceTimer);
  });

  // Handlers

  function handlePlacementComplete(left: HandPosition, right: HandPosition) {
    if (feedbackState !== "idle" || !currentQ) return;

    userPlacement = { left, right };
    const detected = detectPlacementType(left, right);
    builtType = detected;

    if (detected === currentQ.targetType) {
      // Correct
      feedbackState = "correct";
      experienceState.recordQuizAnswer(true);
      hapticService?.trigger("success");

      advanceTimer = setTimeout(() => {
        advanceToNext();
      }, 1000);
    } else {
      // Incorrect - show semantic feedback
      feedbackState = "incorrect";
      experienceState.recordQuizAnswer(false);
      hapticService?.trigger("error");

      advanceTimer = setTimeout(() => {
        advanceToNext();
      }, 3000);
    }
  }

  function advanceToNext() {
    feedbackState = "idle";
    userPlacement = null;
    builtType = null;
    currentQuestion++;
    gridKey++;

    if (isComplete && experienceState.quizScore >= 7) {
      experienceState.passQuiz();
    }
  }

  function handleRetry() {
    currentQuestion = 0;
    questions = generateQuestions();
    feedbackState = "idle";
    userPlacement = null;
    builtType = null;
    gridKey++;
  }

  function handleAdvanceToSpeedRounds() {
    experienceState.advanceToSpeedRounds();
  }
</script>

<div class="construction-quiz" role="region" aria-label="Construction Quiz">
  {#if !isComplete && currentQ}
    <!-- Header: progress + streak -->
    <div class="quiz-header">
      <div class="progress-info">
        <span class="question-counter">
          {currentQuestion + 1} / {questions.length}
        </span>
        <div class="progress-bar">
          <div
            class="progress-fill"
            style="width: {((currentQuestion) / questions.length) * 100}%;"
          ></div>
        </div>
      </div>
      <StreakDisplay
        streak={experienceState.currentStreak}
        bestStreak={experienceState.bestStreak}
      />
    </div>

    <!-- Prompt -->
    <QuizPrompt targetType={currentQ.targetType} />

    <!-- Grid (with flash overlay for correct/incorrect) -->
    <div
      class="grid-area"
      class:flash-correct={feedbackState === "correct"}
      class:flash-incorrect={feedbackState === "incorrect"}
    >
      {#key gridKey}
        <PlacementGrid
          gridMode={currentQ.gridMode}
          onPlacementComplete={handlePlacementComplete}
          disabled={feedbackState !== "idle"}
        />
      {/key}
    </div>

    <!-- Semantic feedback for wrong answers -->
    {#if feedbackState === "incorrect" && builtType && userPlacement}
      <SemanticFeedback
        builtType={builtType}
        targetType={currentQ.targetType}
        leftHand={userPlacement.left}
        rightHand={userPlacement.right}
        gridMode={currentQ.gridMode}
      />
    {/if}

    <!-- Brief correct feedback -->
    {#if feedbackState === "correct"}
      <div class="correct-feedback" role="status">
        <span class="correct-icon" aria-hidden="true">&#x2713;</span>
        <span class="correct-text">Correct!</span>
      </div>
    {/if}
  {:else}
    <!-- Quiz complete screen -->
    <div class="quiz-complete">
      <div class="complete-header">
        {#if passed}
          <span class="complete-icon pass" aria-hidden="true">&#x2713;</span>
          <h2 class="complete-title">Quiz Passed</h2>
        {:else}
          <span class="complete-icon fail" aria-hidden="true">&#x21BB;</span>
          <h2 class="complete-title">Keep Practicing</h2>
        {/if}
      </div>

      <div class="score-display">
        <span class="score-number">{experienceState.quizScore}</span>
        <span class="score-separator">/</span>
        <span class="score-total">{questions.length}</span>
      </div>

      <p class="score-description">
        {#if passed}
          You can identify placements by placing hands on the grid.
          Ready for speed rounds?
        {:else}
          You need 7 correct answers to pass. Review the placement types and try again.
        {/if}
      </p>

      {#if experienceState.bestStreak > 0}
        <p class="best-streak-note">
          Best streak: {experienceState.bestStreak}
        </p>
      {/if}

      <div class="complete-actions">
        {#if passed}
          <button class="action-button primary" onclick={handleAdvanceToSpeedRounds}>
            Speed Rounds
          </button>
        {:else}
          <button class="action-button primary" onclick={handleRetry}>
            Try Again
          </button>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Accessibility: live announcements -->
  <div class="sr-only" aria-live="polite" aria-atomic="true">
    {#if feedbackState === "correct"}
      Correct! Moving to next question.
    {:else if feedbackState === "incorrect" && builtType}
      Incorrect. You built {PLACEMENT_TYPE_INFO[builtType].label}
      instead of {currentQ ? PLACEMENT_TYPE_INFO[currentQ.targetType].label : ""}.
    {:else if isComplete}
      Quiz complete. Score: {experienceState.quizScore} out of {questions.length}.
      {passed ? "You passed!" : "You need 7 to pass."}
    {/if}
  </div>
</div>

<style>
  .construction-quiz {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    max-width: 480px;
    margin: 0 auto;
    padding: 0.5rem;
  }

  /* Header: progress + streak side by side */
  .quiz-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: 0.75rem;
  }

  .progress-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .question-counter {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text, rgba(255, 255, 255, 0.5));
    font-weight: 600;
    letter-spacing: 0.05em;
  }

  .progress-bar {
    height: 4px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--theme-accent, #60a5fa);
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  /* Grid area with flash overlays */
  .grid-area {
    width: 100%;
    position: relative;
    border-radius: 12px;
    transition: box-shadow 0.2s ease;
  }

  .grid-area.flash-correct {
    box-shadow: inset 0 0 0 2px var(--semantic-success, #22c55e),
      0 0 20px rgba(34, 197, 94, 0.2);
    animation: flash-green 0.5s ease-out;
  }

  .grid-area.flash-incorrect {
    box-shadow: inset 0 0 0 2px var(--semantic-error, #ef4444),
      0 0 20px rgba(239, 68, 68, 0.2);
    animation: flash-red 0.3s ease-out;
  }

  @keyframes flash-green {
    0% {
      box-shadow: inset 0 0 0 3px var(--semantic-success, #22c55e),
        0 0 30px rgba(34, 197, 94, 0.4);
    }
    100% {
      box-shadow: inset 0 0 0 2px var(--semantic-success, #22c55e),
        0 0 20px rgba(34, 197, 94, 0.2);
    }
  }

  @keyframes flash-red {
    0% {
      box-shadow: inset 0 0 0 3px var(--semantic-error, #ef4444),
        0 0 30px rgba(239, 68, 68, 0.4);
    }
    100% {
      box-shadow: inset 0 0 0 2px var(--semantic-error, #ef4444),
        0 0 20px rgba(239, 68, 68, 0.2);
    }
  }

  /* Correct feedback */
  .correct-feedback {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    color: var(--semantic-success, #22c55e);
    animation: fade-in 0.2s ease;
  }

  .correct-icon {
    font-size: 1.5rem;
    font-weight: 700;
  }

  .correct-text {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* Quiz complete screen */
  .quiz-complete {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 2rem 1rem;
    text-align: center;
  }

  .complete-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .complete-icon {
    font-size: 2.5rem;
    line-height: 1;
  }

  .complete-icon.pass {
    color: var(--semantic-success, #22c55e);
  }

  .complete-icon.fail {
    color: var(--semantic-warning, #f59e0b);
  }

  .complete-title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--theme-text, #ffffff);
  }

  .score-display {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
  }

  .score-number {
    font-size: 3rem;
    font-weight: 800;
    color: var(--theme-accent, #60a5fa);
    line-height: 1;
  }

  .score-separator {
    font-size: 1.5rem;
    color: var(--theme-text, rgba(255, 255, 255, 0.3));
  }

  .score-total {
    font-size: 1.5rem;
    color: var(--theme-text, rgba(255, 255, 255, 0.5));
    font-weight: 600;
  }

  .score-description {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text, rgba(255, 255, 255, 0.6));
    max-width: 300px;
    line-height: 1.5;
  }

  .best-streak-note {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text, rgba(255, 255, 255, 0.4));
    font-weight: 500;
  }

  .complete-actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  .action-button {
    padding: 0.75rem 1.5rem;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    border-radius: 10px;
    cursor: pointer;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #ffffff);
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .action-button:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  .action-button.primary {
    background: var(--theme-accent, #60a5fa);
    border-color: var(--theme-accent, #60a5fa);
    color: #000;
  }

  .action-button.primary:hover {
    opacity: 0.9;
  }

  /* Screen reader only */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .grid-area {
      transition: none;
    }

    .grid-area.flash-correct,
    .grid-area.flash-incorrect {
      animation: none;
    }

    .correct-feedback {
      animation: none;
    }

    .progress-fill {
      transition: none;
    }

    .action-button {
      transition: none;
    }
  }
</style>
