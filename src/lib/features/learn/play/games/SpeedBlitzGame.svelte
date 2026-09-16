<!--
Speed Blitz — pictograph-to-letter, but the clock is the game. Shares the
render kit with PictographToLetterGame (QuizPictographCard + QuizLetterButton
+ feedback banner + score pop) — same submit/feedback/advance shape, no new
answer primitives. Two things make this a distinct game rather than a challenge
variant of PictographToLetterGame:

1. A per-question clock that drains a slim bar under the pictograph, paced by
   the challenge's paceStartSeconds -> paceEndSeconds curve (fixed mode ramps
   across the challenge's full questionCount; survival mode ramps across a
   rolling 20-question window, then holds at paceEndSeconds). The bar is a
   plain rAF loop recomputing `remaining` from a performance.now() delta each
   frame (same drift-correction technique as the placements SpeedRounds
   reference) — never decrement-by-tick, so a dropped frame can't slow the
   clock down. Cancelled on answer, on timeout, on unmount, and reactively
   whenever the session phase stops being "playing" (survival completing
   mid-question on the 3rd miss).
2. A 500ms feedback pause instead of the standard games' 1200-5000ms — blitz
   pacing. That's too tight to also show a misconception hint (which needs
   the reader time the ported games borrow by extending the pause), so this
   game skips MisconceptionHint entirely rather than fake-extend the pause
   and break the pace curve's assumptions.

A timed-out question is scored as a wrong answer with a synthetic
selectedOptionId of "timeout" (matches no real option id, so the answer grid
renders the correct letter highlighted and every other option dimmed — the
existing QuizLetterButton state machine already gives us "incorrect shows the
correct letter" for free).
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { onDestroy, onMount } from "svelte";
  import * as QuestionGenerator from "../../quiz/services/question-generator";
  import { QuizType } from "../../quiz/domain/enums/quiz-enums";
  import type { QuizQuestionData } from "../../quiz/domain/models/quiz-models";
  import QuizContainer from "../../quiz/components/shared/QuizContainer.svelte";
  import QuizLoadingState from "../../quiz/components/shared/QuizLoadingState.svelte";
  import QuizErrorState from "../../quiz/components/shared/QuizErrorState.svelte";
  import QuizPrompt from "../../quiz/components/shared/QuizPrompt.svelte";
  import QuizPictographCard from "../../quiz/components/shared/QuizPictographCard.svelte";
  import QuizLetterButton from "../../quiz/components/shared/QuizLetterButton.svelte";
  import QuizFeedbackBanner from "../../quiz/components/shared/QuizFeedbackBanner.svelte";
  import ScorePopAnimation from "../../quiz/components/shared/ScorePopAnimation.svelte";
  import { getArcadeSession } from "../state/arcade-session-state.svelte";
  import type { QuestionConstraints } from "../domain/arcade-types";

  let { constraints }: { constraints: QuestionConstraints } = $props();

  const session = getArcadeSession();
  let hapticService: HapticFeedback;

  /** Blitz pacing — much shorter than the ported games' 1200-5000ms pause. */
  const FEEDBACK_PAUSE_MS = 500;
  /** Score-pop must fully clear before the next question loads, or it bleeds
   * into the new question's answer section. */
  const SCORE_POP_MS = 350;
  /** Survival has no fixed question count to ramp across, so the pace curve
   * ramps over this many questions, then holds flat at paceEndSeconds. */
  const SURVIVAL_RAMP_QUESTIONS = 20;
  const DEFAULT_PACE_START_SECONDS = 5;
  const DEFAULT_PACE_END_SECONDS = 2;

  let scorePopTimer: ReturnType<typeof setTimeout> | null = null;
  let hapticTimer: ReturnType<typeof setTimeout> | null = null;
  let nextQuestionTimer: ReturnType<typeof setTimeout> | null = null;
  let clockRafId: number | null = null;

  onDestroy(() => {
    if (scorePopTimer !== null) clearTimeout(scorePopTimer);
    if (hapticTimer !== null) clearTimeout(hapticTimer);
    if (nextQuestionTimer !== null) clearTimeout(nextQuestionTimer);
    cancelClock();
  });

  let questionData = $state<QuizQuestionData | null>(null);
  let selectedAnswerId = $state<string | null>(null);
  let isAnswered = $state(false);
  let showFeedback = $state(false);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let showScorePop = $state(false);
  /** 1 = full time left, 0 = drained. Written every rAF frame. */
  let drainScale = $state(1);

  // Fixed answer slots so letter buttons persist across questions (same
  // technique as PictographToLetterGame — avoids remounting the grid).
  const answerSlots = Array.from(
    { length: constraints.optionCount ?? 4 },
    (_, i) => i
  );

  let currentPictograph = $derived(
    questionData?.questionContent as PictographData | null
  );
  let correctAnswer = $derived(questionData?.correctAnswer as string);
  let isCorrectAnswer = $derived(
    selectedAnswerId
      ? (questionData?.answerOptions.find((o) => o.id === selectedAnswerId)
          ?.isCorrect ?? false)
      : false
  );
  let isTimeout = $derived(selectedAnswerId === "timeout");
  let isUrgent = $derived(drainScale < 0.3);

  // Rendered only while session.phase.name === "playing" (GameShell routes
  // on that), so this narrows safely for the pace curve's challenge.mode lookup.
  const challengeMode = $derived(
    session.phase.name === "playing" ? session.phase.challenge.mode : null
  );

  // Stop the clock the instant the phase stops being "playing" — survival
  // mode can complete on the 3rd miss from inside submitAnswer(), which runs
  // synchronously from this component's own handlers (already followed by a
  // cancelClock() there), but this effect is the backstop for any other path
  // out of "playing" (e.g. the shell's back/quit) while a clock is armed.
  $effect(() => {
    if (session.phase.name !== "playing") {
      cancelClock();
    }
  });

  onMount(async () => {
    hapticService = getHapticFeedback();
    await loadQuestion();
  });

  /** Linear ramp from paceStartSeconds to paceEndSeconds. `index` is
   * 0-based — how many questions have already been answered this run. */
  function paceSecondsForQuestion(index: number): number {
    const start = constraints.paceStartSeconds ?? DEFAULT_PACE_START_SECONDS;
    const end = constraints.paceEndSeconds ?? DEFAULT_PACE_END_SECONDS;
    const rampSpan =
      challengeMode?.kind === "fixed"
        ? Math.max(challengeMode.questionCount - 1, 1)
        : SURVIVAL_RAMP_QUESTIONS - 1;
    const t = Math.min(index, rampSpan) / rampSpan;
    return start + (end - start) * t;
  }

  async function loadQuestion() {
    isLoading = true;
    error = null;
    try {
      questionData = await QuestionGenerator.generateQuestion(
        QuizType.PICTOGRAPH_TO_LETTER,
        constraints
      );
      session.markQuestionShown();
      startClock(paceSecondsForQuestion(session.questionIndex));
    } catch (err) {
      console.error("Failed to load question:", err);
      error = err instanceof Error ? err.message : "Failed to load question";
    } finally {
      isLoading = false;
    }
  }

  function cancelClock() {
    if (clockRafId !== null) {
      cancelAnimationFrame(clockRafId);
      clockRafId = null;
    }
  }

  function startClock(seconds: number) {
    cancelClock();
    drainScale = 1;
    const durationMs = seconds * 1000;
    const startedAt = performance.now();

    function tick(now: number) {
      if (session.phase.name !== "playing") {
        clockRafId = null;
        return;
      }
      // Drift-corrected: remaining is recomputed from the wall-clock delta
      // every frame, never decremented tick-by-tick.
      const elapsed = now - startedAt;
      const remaining = Math.max(0, 1 - elapsed / durationMs);
      drainScale = remaining;
      if (remaining <= 0) {
        clockRafId = null;
        handleTimeout();
        return;
      }
      clockRafId = requestAnimationFrame(tick);
    }
    clockRafId = requestAnimationFrame(tick);
  }

  function handleAnswerClick(optionId: string, isCorrect: boolean) {
    if (isAnswered) return;
    cancelClock();
    hapticService?.trigger("selection");
    selectedAnswerId = optionId;
    isAnswered = true;
    showFeedback = true;

    if (isCorrect) {
      showScorePop = true;
      if (scorePopTimer !== null) clearTimeout(scorePopTimer);
      scorePopTimer = setTimeout(() => {
        showScorePop = false;
      }, SCORE_POP_MS);
    }

    hapticTimer = setTimeout(() => {
      hapticService?.trigger(isCorrect ? "success" : "error");
    }, 50);

    if (questionData) {
      const selectedOption = questionData.answerOptions.find(
        (o) => o.id === optionId
      );
      const correctOption = questionData.answerOptions.find((o) => o.isCorrect);
      session.submitAnswer({
        isCorrect,
        questionData,
        selectedOptionId: optionId,
        selectedContent: selectedOption?.content ?? null,
        correctContent: correctOption?.content ?? null,
        quizType: QuizType.PICTOGRAPH_TO_LETTER,
        answeredAt: new Date(),
      });
    }

    nextQuestionTimer = setTimeout(handleNextQuestion, FEEDBACK_PAUSE_MS);
  }

  function handleTimeout() {
    if (isAnswered || !questionData) return;
    selectedAnswerId = "timeout";
    isAnswered = true;
    showFeedback = true;

    hapticTimer = setTimeout(() => {
      hapticService?.trigger("error");
    }, 50);

    const correctOption = questionData.answerOptions.find((o) => o.isCorrect);
    session.submitAnswer({
      isCorrect: false,
      questionData,
      selectedOptionId: "timeout",
      selectedContent: null,
      correctContent: correctOption?.content ?? null,
      quizType: QuizType.PICTOGRAPH_TO_LETTER,
      answeredAt: new Date(),
    });

    nextQuestionTimer = setTimeout(handleNextQuestion, FEEDBACK_PAUSE_MS);
  }

  async function handleNextQuestion() {
    // The engine may have completed the challenge (last survival miss, or the
    // last fixed-mode question) while this timer was pending.
    if (session.phase.name !== "playing") return;
    selectedAnswerId = null;
    isAnswered = false;
    showFeedback = false;
    showScorePop = false;
    await loadQuestion();
  }

  function getButtonState(
    optionId: string,
    isCorrect: boolean
  ): "default" | "correct" | "incorrect" | "dimmed" {
    if (!isAnswered) return "default";
    if (isCorrect) return "correct";
    if (selectedAnswerId === optionId) return "incorrect";
    return "dimmed";
  }
</script>

{#if isLoading}
  <QuizContainer>
    <QuizLoadingState />
  </QuizContainer>
{:else if error}
  <QuizContainer>
    <QuizErrorState {error} onRetry={loadQuestion} />
  </QuizContainer>
{:else if questionData && currentPictograph}
  <QuizContainer>
    <QuizPrompt text="Name the letter — fast." />

    <div
      class="quiz-content"
      class:flash-correct={isAnswered && isCorrectAnswer}
      class:flash-wrong={isAnswered && !isCorrectAnswer}
    >
      <QuizPictographCard pictograph={currentPictograph} />

      <div class="drain-track" role="img" aria-label="Time remaining">
        <div
          class="drain-fill"
          class:urgent={isUrgent}
          style="transform: scaleX({drainScale})"
        ></div>
      </div>

      <div class="answer-section">
        <div class="answer-grid">
          {#each answerSlots as slotIndex (slotIndex)}
            {@const option = questionData.answerOptions[slotIndex]}
            {#if option}
              <QuizLetterButton
                letter={option.content as string}
                state={getButtonState(option.id, option.isCorrect)}
                disabled={isAnswered}
                onclick={() => handleAnswerClick(option.id, option.isCorrect)}
              />
            {/if}
          {/each}
        </div>

        <ScorePopAnimation
          visible={showScorePop}
          score={1}
          streakCount={session.streak}
        />

        {#if showFeedback}
          <QuizFeedbackBanner
            isCorrect={isCorrectAnswer}
            correctMessage={`Correct! This is "${correctAnswer}"`}
            incorrectMessage={isTimeout
              ? `Too slow — it's "${correctAnswer}"`
              : `The correct letter is "${correctAnswer}"`}
            streakCount={session.streak}
          />
        {/if}
      </div>
    </div>
  </QuizContainer>
{/if}

<style>
  .quiz-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    width: 100%;
    max-width: 360px;
    padding: 0.5rem;
    border-radius: 20px;
  }

  /* Reserved height regardless of scale — scaleX never changes the box's
     footprint, so nothing around it shifts as time drains. */

  .drain-track {
    width: 100%;
    max-width: 200px;
    height: 6px;
    border-radius: 3px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    overflow: hidden;
  }

  .drain-fill {
    width: 100%;
    height: 100%;
    border-radius: 3px;
    transform-origin: left center;
    background: var(--game-accent, var(--theme-accent));
  }

  .drain-fill.urgent {
    background: var(--semantic-error);
  }

  /* ── Quick correct/incorrect flash (Blitz feel) ─────────────────── */

  @keyframes flash-correct-pulse {
    0% {
      background: color-mix(in srgb, var(--semantic-success) 20%, transparent);
    }
    100% {
      background: transparent;
    }
  }

  @keyframes flash-wrong-pulse {
    0% {
      background: color-mix(in srgb, var(--semantic-error) 20%, transparent);
    }
    100% {
      background: transparent;
    }
  }

  .quiz-content.flash-correct {
    animation: flash-correct-pulse 300ms ease-out;
  }

  .quiz-content.flash-wrong {
    animation: flash-wrong-pulse 300ms ease-out;
  }

  .answer-section {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    width: 100%;
  }

  .answer-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(60px, 80px));
    justify-content: center;
    gap: 0.625rem;
  }

  @media (min-width: 600px) {
    .quiz-content {
      max-width: 420px;
      gap: 1.25rem;
    }

    .answer-grid {
      grid-template-columns: repeat(2, minmax(70px, 100px));
      gap: 0.875rem;
    }

    .drain-track {
      max-width: 240px;
    }
  }

  @media (min-width: 900px) {
    .quiz-content {
      max-width: 480px;
      gap: 1.5rem;
    }

    .answer-grid {
      grid-template-columns: repeat(2, minmax(90px, 120px));
      gap: 1rem;
    }

    .drain-track {
      max-width: 280px;
    }
  }

  @media (min-width: 1200px) {
    .quiz-content {
      max-width: 520px;
    }

    .answer-grid {
      grid-template-columns: repeat(2, minmax(100px, 140px));
    }

    .drain-track {
      max-width: 320px;
    }
  }

  @media (min-width: 1920px) {
    .quiz-content {
      max-width: 680px;
    }

    .answer-grid {
      grid-template-columns: repeat(2, minmax(120px, 170px));
    }

    .drain-track {
      max-width: 360px;
      height: 8px;
    }
  }

  @media (min-width: 2560px) {
    .quiz-content {
      max-width: clamp(820px, 55vw, 1000px);
      gap: 2.25rem;
    }

    .answer-grid {
      grid-template-columns: repeat(2, minmax(170px, 240px));
      gap: 1.25rem;
    }

    .drain-track {
      max-width: clamp(440px, 30vw, 560px);
      height: 9px;
      border-radius: 4px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .quiz-content.flash-correct,
    .quiz-content.flash-wrong {
      animation: none;
    }
  }
</style>
