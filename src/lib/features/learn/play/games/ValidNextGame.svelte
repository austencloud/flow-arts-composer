<!--
Valid Next Game — Play arcade port of the legacy
quiz/components/ValidNextPictographQuiz.svelte.

Shows a pictograph and asks which pictograph can follow it (next start
placement must match the current end placement). The arcade session engine
owns scoring/streak/completion; this component owns question loading and
per-question feedback, reporting each answer via session.submitAnswer()
with the exact QuizAnswerEvent shape gap detection depends on. The shell
owns back-navigation chrome — the legacy QuizBackButton is gone.
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import { detectSingleError } from "$lib/features/learn/services/gap-detector";
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
  import QuizPictographButton from "../../quiz/components/shared/QuizPictographButton.svelte";
  import QuizFeedbackBanner from "../../quiz/components/shared/QuizFeedbackBanner.svelte";
  import MisconceptionHint from "../../quiz/components/shared/MisconceptionHint.svelte";
  import type { DetectedGap } from "../../services/types";
  import { getArcadeSession } from "../state/arcade-session-state.svelte";
  import type { QuestionConstraints } from "../domain/arcade-types";

  let { constraints }: { constraints: QuestionConstraints } = $props();

  const session = getArcadeSession();
  let hapticService: HapticFeedback;

  let hapticTimer: ReturnType<typeof setTimeout> | null = null;
  let nextQuestionTimer: ReturnType<typeof setTimeout> | null = null;

  onDestroy(() => {
    if (hapticTimer !== null) clearTimeout(hapticTimer);
    if (nextQuestionTimer !== null) clearTimeout(nextQuestionTimer);
  });

  let questionData = $state<QuizQuestionData | null>(null);
  let selectedAnswerId = $state<string | null>(null);
  let isAnswered = $state(false);
  let showFeedback = $state(false);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let questionKey = $state(0);
  let currentGap = $state<DetectedGap | null>(null);

  let currentPictograph = $derived(
    questionData?.questionContent as PictographData | null
  );
  let isCorrectAnswer = $derived(
    selectedAnswerId
      ? (questionData?.answerOptions.find((o) => o.id === selectedAnswerId)
          ?.isCorrect ?? false)
      : false
  );

  onMount(async () => {
    hapticService = getHapticFeedback();
    await loadQuestion();
  });

  async function loadQuestion() {
    isLoading = true;
    error = null;
    try {
      questionData = await QuestionGenerator.generateQuestion(
        QuizType.VALID_NEXT_PICTOGRAPH,
        constraints
      );
      questionKey++;
      session.markQuestionShown();
    } catch (err) {
      console.error("Failed to load question:", err);
      error = err instanceof Error ? err.message : "Failed to load question";
    } finally {
      isLoading = false;
    }
  }

  function handleAnswerClick(optionId: string, isCorrect: boolean) {
    if (isAnswered) return;
    hapticService?.trigger("selection");
    selectedAnswerId = optionId;
    isAnswered = true;
    showFeedback = true;

    // Detect misconception gap on wrong answers
    currentGap = null;
    if (!isCorrect && questionData) {
      const selectedOption = questionData.answerOptions.find(
        (o) => o.id === optionId
      );
      const correctOption = questionData.answerOptions.find((o) => o.isCorrect);
      const gap = detectSingleError({
        isCorrect: false,
        questionData,
        selectedOptionId: optionId,
        selectedContent: selectedOption?.content ?? null,
        correctContent: correctOption?.content ?? null,
        quizType: QuizType.VALID_NEXT_PICTOGRAPH,
        answeredAt: new Date(),
      });
      if (gap) {
        currentGap = gap;
      }
    }

    hapticTimer = setTimeout(() => {
      hapticService?.trigger(isCorrect ? "success" : "error");
    }, 100);

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
        quizType: QuizType.VALID_NEXT_PICTOGRAPH,
        answeredAt: new Date(),
      });
    }
    const feedbackDuration = currentGap ? 5000 : 1200;
    nextQuestionTimer = setTimeout(handleNextQuestion, feedbackDuration);
  }

  async function handleNextQuestion() {
    // Engine completion (fixed-count reached, countdown expired) ends the
    // self-advance loop — never load a question the player won't see.
    if (session.phase.name !== "playing") return;
    selectedAnswerId = null;
    isAnswered = false;
    showFeedback = false;
    currentGap = null;
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
    <QuizPrompt text="Which pictograph can follow this one?" />

    <div class="quiz-content">
      {#key questionKey}
        <QuizPictographCard pictograph={currentPictograph} showArrow={true} />
      {/key}

      <div class="answer-section">
        <div
          class="answer-grid"
          class:six-up={questionData.answerOptions.length > 4}
        >
          {#each questionData.answerOptions as option (option.id)}
            <QuizPictographButton
              pictograph={option.content as PictographData}
              state={getButtonState(option.id, option.isCorrect)}
              disabled={isAnswered}
              onclick={() => handleAnswerClick(option.id, option.isCorrect)}
            />
          {/each}
        </div>

        {#if showFeedback}
          <QuizFeedbackBanner
            isCorrect={isCorrectAnswer}
            correctMessage="Correct!"
            incorrectMessage=""
          />
          {#if currentGap}
            <MisconceptionHint gap={currentGap} />
          {/if}
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
    gap: 0.75rem;
    width: 100%;
    max-width: 320px;
  }

  .answer-section {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
  }

  .answer-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
    width: 100%;
  }

  /* Six-option challenges: 3-up columns keep the grid to two rows so the stage
     never scrolls mid-question. */
  .answer-grid.six-up {
    grid-template-columns: repeat(3, 1fr);
  }

  @media (min-width: 600px) {
    .quiz-content {
      max-width: 380px;
      gap: 1rem;
    }

    .answer-grid {
      gap: 0.75rem;
    }
  }

  @media (min-width: 900px) {
    .quiz-content {
      max-width: 440px;
      gap: 1.25rem;
    }

    .answer-grid {
      gap: 1rem;
    }
  }

  @media (min-width: 1200px) {
    .quiz-content {
      max-width: 500px;
      gap: 1.5rem;
    }
  }

  @media (min-width: 1920px) {
    .quiz-content {
      max-width: 680px;
    }
  }

  @media (min-width: 2560px) {
    .quiz-content {
      max-width: clamp(820px, 55vw, 1000px);
      gap: 1.25rem;
    }

    .answer-section {
      gap: 1.25rem;
    }
  }
</style>
