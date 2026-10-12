<!--
  Inline Quiz Component

  Interactive knowledge testing embedded in TIKA chat.
  Features:
  - Visual quizzes with clickable pictograph grids
  - Motion pattern matching with color-coded chips
  - Text-based multiple choice and true/false
  - Compact horizontal layout for 3-option text quizzes
  - Multi-question sessions with auto-advance and score summary
  - Duolingo-inspired micro-interactions (green check, red X, confetti)
  - WCAG 2.2 compliant (48px touch targets, keyboard nav, reduced motion)
-->
<script lang="ts">
  import { onMount } from "svelte";
  import type {
    InlineQuiz,
    QuizOption,
    TextQuizOption,
    PictographQuizOption,
    MotionPatternQuizOption,
  } from "../types";
  import InlinePictograph from "./InlinePictograph.svelte";

  // Props
  let {
    quiz,
    onQuizComplete,
  }: {
    quiz: InlineQuiz;
    onQuizComplete?: (quizId: string, topic: string, correct: boolean) => void;
  } = $props();

  // Session state for multi-question flow
  let currentQuestionIndex = $state(0);
  let sessionResults: boolean[] = $state([]);
  let sessionComplete = $state(false);

  const hasSession = $derived(
    quiz.followUpQuizzes !== undefined && quiz.followUpQuizzes.length > 0
  );
  const totalQuestions = $derived(1 + (quiz.followUpQuizzes?.length ?? 0));
  const currentQuiz: InlineQuiz = $derived(
    currentQuestionIndex === 0
      ? quiz
      : (quiz.followUpQuizzes?.[currentQuestionIndex - 1] ?? quiz)
  );
  const isCompact = $derived(
    currentQuiz.displayMode === "text" && currentQuiz.options.length === 3
  );

  // Per-question state
  type QuizState = "unanswered" | "processing" | "correct" | "incorrect";
  let quizState: QuizState = $state("unanswered");
  let selectedOptionId: string | null = $state(null);
  let showConfetti: boolean = $state(false);

  // Timer handles for cleanup
  let processingTimer: number | null = null;
  let confettiTimer: number | null = null;
  let advanceTimer: number | null = null;

  const _timer = window.setTimeout.bind(window);
  const scheduleTimeout = (fn: () => void, ms: number): number =>
    _timer(fn, ms);

  onMount(() => {
    return () => {
      if (processingTimer !== null) window.clearTimeout(processingTimer);
      if (confettiTimer !== null) window.clearTimeout(confettiTimer);
      if (advanceTimer !== null) window.clearTimeout(advanceTimer);
    };
  });

  let prefersReducedMotion: boolean = $state(false);

  $effect(() => {
    if (typeof window !== "undefined") {
      prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
    }
  });

  // Type guards
  function isTextOption(opt: QuizOption): opt is TextQuizOption {
    return opt.type === "text";
  }

  function isPictographOption(opt: QuizOption): opt is PictographQuizOption {
    return opt.type === "pictograph";
  }

  function isMotionPatternOption(
    opt: QuizOption
  ): opt is MotionPatternQuizOption {
    return opt.type === "motion-pattern";
  }

  function selectOption(option: QuizOption) {
    if (quizState !== "unanswered") return;

    selectedOptionId = option.id;
    quizState = "processing";

    processingTimer = scheduleTimeout(() => {
      processingTimer = null;
      const isCorrect = option.correct;

      if (isCorrect) {
        quizState = "correct";
        if (!prefersReducedMotion) {
          showConfetti = true;
          confettiTimer = scheduleTimeout(() => {
            confettiTimer = null;
            showConfetti = false;
          }, 1500);
        }
      } else {
        quizState = "incorrect";
      }

      onQuizComplete?.(
        currentQuiz.id,
        currentQuiz.topic || currentQuiz.id,
        isCorrect
      );

      // Auto-advance after 1.5s if in a multi-question session
      if (hasSession) {
        advanceTimer = scheduleTimeout(() => {
          advanceTimer = null;
          sessionResults = [...sessionResults, isCorrect];

          if (currentQuestionIndex >= totalQuestions - 1) {
            sessionComplete = true;
          } else {
            currentQuestionIndex++;
            quizState = "unanswered";
            selectedOptionId = null;
            showConfetti = false;
          }
        }, 1500);
      }
    }, 100);
  }

  function restartSession() {
    currentQuestionIndex = 0;
    sessionResults = [];
    sessionComplete = false;
    quizState = "unanswered";
    selectedOptionId = null;
    showConfetti = false;
  }

  function handleKeydown(event: KeyboardEvent, option: QuizOption) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectOption(option);
    }
  }

  function getOptionClass(option: QuizOption): string {
    if (quizState === "unanswered" || quizState === "processing") {
      return selectedOptionId === option.id ? "selected" : "";
    }
    if (option.correct) return "correct";
    if (selectedOptionId === option.id && !option.correct) return "incorrect";
    return "faded";
  }

  // Score color thresholds
  const scorePercent = $derived(
    sessionResults.length > 0
      ? sessionResults.filter(Boolean).length / sessionResults.length
      : 0
  );
  const scoreColorClass = $derived(
    scorePercent >= 0.8
      ? "score-good"
      : scorePercent >= 0.6
        ? "score-ok"
        : "score-poor"
  );
</script>

<figure
  class="inline-quiz"
  role="group"
  aria-labelledby="quiz-question-{currentQuiz.id}"
>
  {#if sessionComplete}
    <!-- Session Summary -->
    <div class="session-summary" role="status" aria-live="polite">
      <div class="summary-score {scoreColorClass}">
        {sessionResults.filter(Boolean).length}/{sessionResults.length}
      </div>
      <p class="summary-label">
        {scorePercent >= 0.8
          ? "Nice work!"
          : scorePercent >= 0.6
            ? "Getting there."
            : "Keep practicing."}
      </p>
      <div
        class="summary-dots"
        aria-label="Results: {sessionResults
          .map((r, i) => `Question ${i + 1}: ${r ? 'correct' : 'incorrect'}`)
          .join(', ')}"
      >
        {#each sessionResults as result, i}
          <span
            class="summary-dot {result ? 'correct' : 'incorrect'}"
            aria-hidden="true"
          ></span>
        {/each}
      </div>
      <button class="restart-button" onclick={restartSession}>
        Try again
      </button>
    </div>
  {:else}
    <!-- Progress indicator for multi-question sessions -->
    {#if hasSession}
      <div
        class="session-progress"
        aria-label="Question {currentQuestionIndex + 1} of {totalQuestions}"
      >
        <span class="progress-label"
          >Question {currentQuestionIndex + 1} of {totalQuestions}</span
        >
        <div class="progress-track">
          <div
            class="progress-fill"
            style="width: {((currentQuestionIndex + 1) / totalQuestions) *
              100}%"
          ></div>
        </div>
      </div>
    {/if}

    <!-- Optional pictograph context (shown above question) -->
    {#if currentQuiz.pictograph}
      <div class="quiz-visual">
        <InlinePictograph
          pictograph={{
            type: "inline-pictograph",
            letter: currentQuiz.pictograph.letter,
            variation: currentQuiz.pictograph.variation,
            propType: currentQuiz.pictograph.propType,
          }}
          size={180}
        />
      </div>
    {/if}

    <!-- Question -->
    <h4 class="quiz-question" id="quiz-question-{currentQuiz.id}">
      <span class="question-icon" aria-hidden="true">
        {#if currentQuiz.quizType === "true-false"}
          <i class="fas fa-balance-scale"></i>
        {:else if currentQuiz.quizType === "pick-letter" || currentQuiz.quizType === "odd-one-out"}
          <i class="fas fa-hand-pointer"></i>
        {:else if currentQuiz.quizType === "match-motion"}
          <i class="fas fa-arrows-alt"></i>
        {:else}
          <i class="fas fa-question-circle"></i>
        {/if}
      </span>
      {currentQuiz.question}
    </h4>

    <!-- Options - different rendering based on displayMode -->
    {#if currentQuiz.displayMode === "pictograph-grid"}
      <!-- Pictograph Grid Display -->
      <div
        class="quiz-pictograph-grid"
        role="radiogroup"
        aria-labelledby="quiz-question-{currentQuiz.id}"
      >
        {#each currentQuiz.options as option (option.id)}
          {#if isPictographOption(option)}
            <button
              aria-label="Letter {option.letter}"
              class="quiz-pictograph-option {getOptionClass(option)}"
              onclick={() => selectOption(option)}
              onkeydown={(e) => handleKeydown(e, option)}
              disabled={quizState !== "unanswered"}
              role="radio"
              aria-checked={selectedOptionId === option.id}
            >
              <div class="pictograph-wrapper">
                <InlinePictograph
                  pictograph={{
                    type: "inline-pictograph",
                    letter: option.letter,
                    variation: option.variation,
                  }}
                  size={120}
                />
              </div>
              <span class="pictograph-label">{option.letter}</span>
              {#if quizState !== "unanswered"}
                <span class="option-overlay" aria-hidden="true">
                  {#if option.correct}
                    <i class="fas fa-check"></i>
                  {:else if selectedOptionId === option.id}
                    <i class="fas fa-times"></i>
                  {/if}
                </span>
              {/if}
            </button>
          {/if}
        {/each}
      </div>
    {:else if currentQuiz.displayMode === "motion-chips"}
      <!-- Motion Pattern Chips Display -->
      <div
        class="quiz-motion-chips"
        role="radiogroup"
        aria-labelledby="quiz-question-{currentQuiz.id}"
      >
        {#each currentQuiz.options as option (option.id)}
          {#if isMotionPatternOption(option)}
            <button
              aria-label="Left {option.leftMotion}, Right {option.rightMotion}"
              class="quiz-motion-chip {getOptionClass(option)}"
              onclick={() => selectOption(option)}
              onkeydown={(e) => handleKeydown(e, option)}
              disabled={quizState !== "unanswered"}
              role="radio"
              aria-checked={selectedOptionId === option.id}
            >
              <span class="motion-blue">
                <span class="motion-dot blue"></span>
                {option.leftMotion}
              </span>
              <span class="motion-separator">+</span>
              <span class="motion-red">
                <span class="motion-dot red"></span>
                {option.rightMotion}
              </span>
              {#if quizState !== "unanswered"}
                <span class="chip-indicator" aria-hidden="true">
                  {#if option.correct}
                    <i class="fas fa-check"></i>
                  {:else if selectedOptionId === option.id}
                    <i class="fas fa-times"></i>
                  {/if}
                </span>
              {/if}
            </button>
          {/if}
        {/each}
      </div>
    {:else}
      <!-- Text Options Display (default) -->
      <div
        class="quiz-options {isCompact ? 'compact' : ''}"
        role="radiogroup"
        aria-labelledby="quiz-question-{currentQuiz.id}"
      >
        {#each currentQuiz.options as option, index (option.id)}
          {#if isTextOption(option)}
            <button
              aria-label={option.text}
              class="quiz-option {getOptionClass(option)}"
              onclick={() => selectOption(option)}
              onkeydown={(e) => handleKeydown(e, option)}
              disabled={quizState !== "unanswered"}
              role="radio"
              aria-checked={selectedOptionId === option.id}
              aria-disabled={quizState !== "unanswered"}
            >
              {#if !isCompact}
                <span class="option-letter" aria-hidden="true">
                  {String.fromCharCode(65 + index)}
                </span>
              {/if}
              <span class="option-text">{option.text}</span>
              {#if !isCompact}
                <span class="option-indicator" aria-hidden="true">
                  {#if quizState !== "unanswered" && option.correct}
                    <i class="fas fa-check"></i>
                  {:else if quizState === "incorrect" && selectedOptionId === option.id}
                    <i class="fas fa-times"></i>
                  {/if}
                </span>
              {/if}
            </button>
          {/if}
        {/each}
      </div>
    {/if}

    <!-- Feedback -->
    {#if quizState === "correct" || quizState === "incorrect"}
      <div class="quiz-feedback {quizState}" role="status" aria-live="polite">
        <div class="feedback-header">
          {#if quizState === "correct"}
            <span class="feedback-icon correct" aria-hidden="true">
              <i class="fas fa-check-circle"></i>
            </span>
            <span class="feedback-title">Correct!</span>
          {:else}
            <span class="feedback-icon incorrect" aria-hidden="true">
              <i class="fas fa-times-circle"></i>
            </span>
            <span class="feedback-title">Not quite</span>
          {/if}
        </div>
        <p class="feedback-message">
          {quizState === "correct"
            ? currentQuiz.correctFeedback
            : currentQuiz.incorrectFeedback}
        </p>
        {#if currentQuiz.explanation && quizState === "incorrect"}
          <p class="feedback-explanation">{currentQuiz.explanation}</p>
        {/if}
      </div>
    {/if}

    <!-- Confetti (only shown briefly on correct answer) -->
    {#if showConfetti}
      <div class="confetti-container" aria-hidden="true">
        {#each Array(8) as _, i}
          <span
            class="confetti"
            style="--delay: {i * 0.1}s; --x: {(i - 4) * 15}px;"
          ></span>
        {/each}
      </div>
    {/if}
  {/if}
</figure>

<style>
  .inline-quiz {
    margin: 16px 0;
    padding: 0;
    position: relative;
    width: 100%;
  }

  .quiz-visual {
    display: flex;
    justify-content: center;
    margin-bottom: 16px;
  }

  .quiz-question {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin: 0 0 16px 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--theme-text, #ffffff);
    line-height: 1.4;
  }

  .question-icon {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--theme-accent, #6366f1);
    font-size: 18px;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     Session Progress
     ═══════════════════════════════════════════════════════════════════════════ */
  .session-progress {
    margin-bottom: 16px;
  }

  .progress-label {
    display: block;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    margin-bottom: 6px;
  }

  .progress-track {
    height: 4px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--theme-accent, #6366f1);
    border-radius: 2px;
    transition: width var(--duration-emphasis) var(--ease-standard);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     Session Summary
     ═══════════════════════════════════════════════════════════════════════════ */
  .session-summary {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 24px 16px;
    animation: fadeIn var(--duration-emphasis) var(--ease-standard);
  }

  .summary-score {
    font-size: 36px;
    font-weight: 800;
    line-height: 1;
  }

  .summary-score.score-good {
    color: var(--semantic-success, #22c55e);
  }

  .summary-score.score-ok {
    color: var(--semantic-warning, #f59e0b);
  }

  .summary-score.score-poor {
    color: var(--semantic-error, #ef4444);
  }

  .summary-label {
    margin: 0;
    font-size: 15px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.7));
  }

  .summary-dots {
    display: flex;
    gap: 6px;
  }

  .summary-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .summary-dot.correct {
    background: var(--semantic-success, #22c55e);
  }

  .summary-dot.incorrect {
    background: var(--semantic-error, #ef4444);
  }

  .restart-button {
    margin-top: 4px;
    padding: 10px 24px;
    background: var(--theme-accent, #6366f1);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity var(--duration-fast) var(--ease-standard);
  }

  .restart-button:hover {
    opacity: 0.85;
  }

  .restart-button:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     Pictograph Grid Display
     ═══════════════════════════════════════════════════════════════════════════ */
  .quiz-pictograph-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    max-width: 320px;
    margin: 0 auto;
  }

  .quiz-pictograph-option {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 2px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      opacity var(--duration-fast) var(--ease-standard);
  }

  .quiz-pictograph-option:hover:not(:disabled) {
    border-color: var(--theme-accent, #6366f1);
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 10%,
      transparent
    );
  }

  .quiz-pictograph-option:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .quiz-pictograph-option:disabled {
    cursor: default;
  }

  .pictograph-wrapper {
    width: 120px;
    height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pictograph-label {
    font-size: 18px;
    font-weight: 700;
    color: var(--theme-text, #ffffff);
  }

  .option-overlay {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    color: white;
  }

  .quiz-pictograph-option.correct .option-overlay {
    background: var(--semantic-success, #22c55e);
  }

  .quiz-pictograph-option.incorrect .option-overlay {
    background: var(--semantic-error, #ef4444);
  }

  .quiz-pictograph-option.correct {
    border-color: var(--semantic-success, #22c55e);
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 15%,
      transparent
    );
    animation: pulse-correct var(--duration-emphasis) var(--ease-standard);
  }

  .quiz-pictograph-option.incorrect {
    border-color: var(--semantic-error, #ef4444);
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 15%,
      transparent
    );
    animation: shake var(--duration-emphasis) var(--ease-standard);
  }

  .quiz-pictograph-option.faded {
    opacity: 0.4;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     Motion Chips Display
     ═══════════════════════════════════════════════════════════════════════════ */
  .quiz-motion-chips {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .quiz-motion-chip {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    min-height: var(--min-touch-target);
    padding: 12px 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    color: var(--theme-text, #ffffff);
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      opacity var(--duration-fast) var(--ease-standard);
  }

  .quiz-motion-chip:hover:not(:disabled) {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .quiz-motion-chip:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .quiz-motion-chip:disabled {
    cursor: default;
  }

  .motion-blue,
  .motion-red {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .motion-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  .motion-dot.blue {
    background: var(--prop-blue, #3b82f6);
  }

  .motion-dot.red {
    background: var(--prop-red, #ef4444);
  }

  .motion-separator {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  .chip-indicator {
    position: absolute;
    right: 12px;
    font-size: 16px;
  }

  .quiz-motion-chip.correct {
    border-color: var(--semantic-success, #22c55e);
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 15%,
      transparent
    );
    animation: pulse-correct var(--duration-emphasis) var(--ease-standard);
  }

  .quiz-motion-chip.correct .chip-indicator {
    color: var(--semantic-success, #22c55e);
  }

  .quiz-motion-chip.incorrect {
    border-color: var(--semantic-error, #ef4444);
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 15%,
      transparent
    );
    animation: shake var(--duration-emphasis) var(--ease-standard);
  }

  .quiz-motion-chip.incorrect .chip-indicator {
    color: var(--semantic-error, #ef4444);
  }

  .quiz-motion-chip.faded {
    opacity: 0.5;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     Text Options Display
     ═══════════════════════════════════════════════════════════════════════════ */
  .quiz-options {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .quiz-options.compact {
    flex-direction: row;
    gap: 8px;
  }

  .quiz-option {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: var(--min-touch-target);
    padding: 12px 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    color: var(--theme-text, #ffffff);
    font-size: 15px;
    text-align: left;
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      opacity var(--duration-fast) var(--ease-standard);
  }

  .quiz-options.compact .quiz-option {
    flex: 1;
    justify-content: center;
    text-align: center;
    padding: 12px 8px;
    gap: 0;
  }

  .quiz-option:hover:not(:disabled) {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .quiz-option:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .quiz-option:disabled {
    cursor: default;
  }

  .option-letter {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border-radius: 6px;
    font-weight: 700;
    font-size: 13px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .option-text {
    flex: 1;
  }

  .quiz-options.compact .option-text {
    flex: none;
  }

  .option-indicator {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
  }

  .quiz-option.selected {
    border-color: var(--theme-accent, #6366f1);
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 10%,
      transparent
    );
  }

  .quiz-option.correct {
    border-color: var(--semantic-success, #22c55e);
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 15%,
      transparent
    );
    animation: pulse-correct var(--duration-emphasis) var(--ease-standard);
  }

  .quiz-option.correct .option-letter {
    background: var(--semantic-success, #22c55e);
    color: white;
  }

  .quiz-option.correct .option-indicator {
    color: var(--semantic-success, #22c55e);
  }

  .quiz-option.incorrect {
    border-color: var(--semantic-error, #ef4444);
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 15%,
      transparent
    );
    animation: shake var(--duration-emphasis) var(--ease-standard);
  }

  .quiz-option.incorrect .option-letter {
    background: var(--semantic-error, #ef4444);
    color: white;
  }

  .quiz-option.incorrect .option-indicator {
    color: var(--semantic-error, #ef4444);
  }

  .quiz-option.faded {
    opacity: 0.5;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     Feedback Section
     ═══════════════════════════════════════════════════════════════════════════ */
  .quiz-feedback {
    margin-top: 16px;
    padding: 14px 16px;
    border-radius: 10px;
    animation: fadeIn var(--duration-emphasis) var(--ease-standard);
  }

  .quiz-feedback.correct {
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 10%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-success, #22c55e) 30%, transparent);
  }

  .quiz-feedback.incorrect {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 10%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-error, #ef4444) 30%, transparent);
  }

  .feedback-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .feedback-icon {
    font-size: 20px;
  }

  .feedback-icon.correct {
    color: var(--semantic-success, #22c55e);
  }

  .feedback-icon.incorrect {
    color: var(--semantic-error, #ef4444);
  }

  .feedback-title {
    font-weight: 700;
    font-size: 15px;
    color: var(--theme-text, #ffffff);
  }

  .feedback-message {
    margin: 0;
    font-size: 14px;
    color: var(--theme-text, rgba(255, 255, 255, 0.9));
    line-height: 1.5;
  }

  .feedback-explanation {
    margin: 10px 0 0 0;
    padding-top: 10px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    font-size: 13px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.7));
    line-height: 1.5;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     Confetti Animation
     ═══════════════════════════════════════════════════════════════════════════ */
  .confetti-container {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .confetti {
    position: absolute;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    animation: confetti-fall var(--duration-scene) var(--ease-standard-out)
      forwards;
    animation-delay: var(--delay);
  }

  .confetti:nth-child(1) {
    background: var(--semantic-success, #22c55e);
  }
  .confetti:nth-child(2) {
    background: var(--theme-accent, #6366f1);
  }
  .confetti:nth-child(3) {
    background: var(--semantic-warning, #f59e0b);
  }
  .confetti:nth-child(4) {
    background: var(--semantic-error, #ec4899);
  }
  .confetti:nth-child(5) {
    background: var(--semantic-success, #22c55e);
  }
  .confetti:nth-child(6) {
    background: var(--theme-accent, #6366f1);
  }
  .confetti:nth-child(7) {
    background: var(--semantic-warning, #f59e0b);
  }
  .confetti:nth-child(8) {
    background: var(--semantic-error, #ec4899);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     Animations
     ═══════════════════════════════════════════════════════════════════════════ */
  @keyframes pulse-correct {
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.02);
    }
    100% {
      transform: scale(1);
    }
  }

  @keyframes shake {
    0%,
    100% {
      transform: translateX(0);
    }
    25% {
      transform: translateX(-3px);
    }
    75% {
      transform: translateX(3px);
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes confetti-fall {
    0% {
      transform: translate(var(--x), 0) rotate(0deg);
      opacity: 1;
    }
    100% {
      transform: translate(calc(var(--x) * 2), 80px) rotate(720deg);
      opacity: 0;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     Reduced Motion
     ═══════════════════════════════════════════════════════════════════════════ */
  @media (prefers-reduced-motion: reduce) {
    .quiz-option,
    .quiz-pictograph-option,
    .quiz-motion-chip,
    .quiz-feedback,
    .session-summary {
      animation: none;
      transition: none;
    }

    .progress-fill {
      transition: none;
    }

    .confetti {
      display: none;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     Mobile Adjustments
     ═══════════════════════════════════════════════════════════════════════════ */
  @media (max-width: 480px) {
    .quiz-pictograph-grid {
      max-width: 280px;
    }

    .pictograph-wrapper {
      width: 100px;
      height: 100px;
    }

    .quiz-option {
      padding: 10px 14px;
    }

    .option-letter {
      width: 26px;
      height: 26px;
      font-size: 12px;
    }

    .quiz-question {
      font-size: 15px;
    }
  }

  @media (max-width: 360px) {
    .quiz-options.compact {
      flex-direction: column;
    }
  }
</style>
