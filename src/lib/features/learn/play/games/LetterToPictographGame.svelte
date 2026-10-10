<!--
Letter to Pictograph Game — Play arcade port of the legacy
quiz/components/LetterToPictographQuiz.svelte.

Shows a letter, asks the player to identify the correct pictograph. The
arcade session engine owns scoring/streak/completion; this component owns
question loading and per-question feedback, reporting each answer via
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
  import QuizGlyphCard from "../../quiz/components/shared/QuizGlyphCard.svelte";
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
  let currentGap = $state<DetectedGap | null>(null);

  let questionLetter = $derived(questionData?.questionContent as string);

  // Fixed answer slots - using indices as keys keeps components persistent
  // so arrows/props animate smoothly when pictograph data changes. Slot count
  // follows the challenge's optionCount constraint.
  const answerSlots = Array.from(
    { length: constraints.optionCount ?? 4 },
    (_, i) => i
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
        QuizType.LETTER_TO_PICTOGRAPH,
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
        quizType: QuizType.LETTER_TO_PICTOGRAPH,
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
        quizType: QuizType.LETTER_TO_PICTOGRAPH,
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
{:else if questionData && questionLetter}
  <QuizContainer>
    <QuizPrompt text={t("learn_ui_prompt_letter_pictograph")} />

    <div class="quiz-content">
      <!-- Glyph card handles its own crossfade transitions -->
      <QuizGlyphCard letter={questionLetter} />

      <div class="answer-section">
        <div class="answer-grid">
          <!-- Use fixed slot indices as keys so components persist and arrows/props animate -->
          {#each answerSlots as slotIndex (slotIndex)}
            {@const option = questionData.answerOptions[slotIndex]}
            {#if option}
              <QuizPictographButton
                pictograph={option.content as PictographData}
                state={getButtonState(option.id, option.isCorrect)}
                disabled={isAnswered}
                showTKA={isAnswered}
                onclick={() => handleAnswerClick(option.id, option.isCorrect)}
              />
            {/if}
          {/each}
        </div>

        {#if showFeedback}
          <QuizFeedbackBanner
            isCorrect={isCorrectAnswer}
            correctMessage={t("learn_ui_correct_letter", {
              letter: questionLetter,
            })}
            incorrectMessage={t("learn_ui_answer_pictograph_highlighted")}
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
    grid-template-columns: repeat(2, 130px);
    justify-content: center;
    gap: 0.75rem;
  }

  @media (min-width: 600px) {
    .quiz-content {
      max-width: 420px;
      gap: 2rem;
    }

    .answer-grid {
      grid-template-columns: repeat(2, 150px);
      gap: 1rem;
    }
  }

  @media (min-width: 900px) {
    .quiz-content {
      max-width: 520px;
      gap: 2.5rem;
    }

    .answer-grid {
      grid-template-columns: repeat(2, 180px);
      gap: 1.25rem;
    }
  }

  @media (min-width: 1200px) {
    .quiz-content {
      max-width: 600px;
    }

    .answer-grid {
      grid-template-columns: repeat(2, 200px);
      gap: 1.5rem;
    }
  }

  @media (min-width: 1920px) {
    .quiz-content {
      max-width: 780px;
    }

    .answer-grid {
      grid-template-columns: repeat(2, 260px);
    }
  }

  @media (min-width: 2560px) {
    .quiz-content {
      max-width: clamp(940px, 60vw, 1160px);
      gap: 3rem;
    }

    .answer-grid {
      grid-template-columns: repeat(2, clamp(320px, 20vw, 380px));
      gap: 1.75rem;
    }
  }
</style>
