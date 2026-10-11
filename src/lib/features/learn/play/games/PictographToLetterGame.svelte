<!--
Pictograph to Letter Game — Play arcade port of the legacy
quiz/components/PictographToLetterQuiz.svelte.

Shows a pictograph, asks the player to identify the letter. This component
owns question loading and its own per-question feedback flow (unchanged from
the legacy quiz); the arcade session engine (arcade-session-state.svelte.ts)
owns scoring, streak, and challenge completion. Each answer is reported via
session.submitAnswer() with the exact QuizAnswerEvent shape gap detection
depends on.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import { detectSingleError } from "#lib/features/learn/services/gap-detector.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
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
  import MisconceptionHint from "../../quiz/components/shared/MisconceptionHint.svelte";
  import ScorePopAnimation from "../../quiz/components/shared/ScorePopAnimation.svelte";
  import type { DetectedGap } from "../../services/types";
  import { getArcadeSession } from "../state/arcade-session-state.svelte";
  import type { QuestionConstraints } from "../domain/arcade-types";

  let { constraints }: { constraints: QuestionConstraints } = $props();

  const session = getArcadeSession();
  let hapticService: HapticFeedback;

  let scorePopTimer: ReturnType<typeof setTimeout> | null = null;
  let hapticTimer: ReturnType<typeof setTimeout> | null = null;
  let nextQuestionTimer: ReturnType<typeof setTimeout> | null = null;

  onDestroy(() => {
    if (scorePopTimer !== null) clearTimeout(scorePopTimer);
    if (hapticTimer !== null) clearTimeout(hapticTimer);
    if (nextQuestionTimer !== null) clearTimeout(nextQuestionTimer);
  });

  let questionData = $state<QuizQuestionData | null>(null);
  let selectedAnswerId = $state<string | null>(null);
  let isAnswered = $state(false);
  let showFeedback = $state(false);
  let isLoading = $state(true);
  let error = $state<string | null>(null);

  // Score-pop "+1" flourish only — streak truth lives on the session; the
  // shell renders the real streak flame. No local streak state here.
  let showScorePop = $state(false);

  // Misconception hint state
  let currentGap = $state<DetectedGap | null>(null);

  // Fixed answer slots - using indices keeps components persistent for smooth
  // transitions. Slot count follows the challenge's optionCount constraint.
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

  onMount(async () => {
    hapticService = getHapticFeedback();
    await loadQuestion();
  });

  async function loadQuestion() {
    isLoading = true;
    error = null;
    try {
      questionData = await QuestionGenerator.generateQuestion(
        QuizType.PICTOGRAPH_TO_LETTER,
        constraints
      );
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

    if (isCorrect) {
      showScorePop = true;
      scorePopTimer = setTimeout(() => {
        showScorePop = false;
      }, 800);
    }

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
        quizType: QuizType.PICTOGRAPH_TO_LETTER,
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
        quizType: QuizType.PICTOGRAPH_TO_LETTER,
        answeredAt: new Date(),
      });
    }
    // Give extra time when a misconception hint is showing so the user can read it
    const feedbackDuration = currentGap ? 5000 : 1200;
    nextQuestionTimer = setTimeout(handleNextQuestion, feedbackDuration);
  }

  async function handleNextQuestion() {
    // The engine may have completed the challenge (last question in fixed mode,
    // or the countdown clock hit 0) while this timer was pending — stop the
    // self-advance loop instead of generating a question nobody will see.
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
    <QuizPrompt text={t("learn_ui_prompt_pictograph_letter")} />

    <div class="quiz-content">
      <!-- Pictograph card - arrows/props animate smoothly when data changes -->
      <QuizPictographCard pictograph={currentPictograph} />

      <div class="answer-section">
        <div class="answer-grid">
          <!-- Use fixed slot indices as keys so letter buttons persist -->
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

        <!-- Score pop animation -->
        <ScorePopAnimation
          visible={showScorePop}
          score={1}
          streakCount={session.streak}
        />

        {#if showFeedback}
          <QuizFeedbackBanner
            isCorrect={isCorrectAnswer}
            correctMessage={t("learn_ui_correct_letter", {
              letter: correctAnswer,
            })}
            incorrectMessage={t("learn_ui_answer_letter", {
              letter: correctAnswer,
            })}
            streakCount={session.streak}
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
    gap: 1.5rem;
    width: 100%;
    max-width: 360px;
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
      gap: 2rem;
    }

    .answer-grid {
      grid-template-columns: repeat(2, minmax(70px, 100px));
      gap: 0.875rem;
    }
  }

  @media (min-width: 900px) {
    .quiz-content {
      max-width: 480px;
      gap: 2.5rem;
    }

    .answer-grid {
      grid-template-columns: repeat(2, minmax(90px, 120px));
      gap: 1rem;
    }
  }

  @media (min-width: 1200px) {
    .quiz-content {
      max-width: 520px;
    }

    .answer-grid {
      grid-template-columns: repeat(2, minmax(100px, 140px));
    }
  }

  @media (min-width: 1920px) {
    .quiz-content {
      max-width: 680px;
    }

    .answer-grid {
      grid-template-columns: repeat(2, minmax(120px, 170px));
    }
  }

  @media (min-width: 2560px) {
    .quiz-content {
      max-width: clamp(820px, 55vw, 1000px);
      gap: 3rem;
    }

    .answer-grid {
      grid-template-columns: repeat(2, minmax(170px, 240px));
      gap: 1.25rem;
    }
  }
</style>
