<!--
Read the Performer — Play arcade port of the legacy
quiz/components/SequenceToWordQuiz.svelte.

A 3D performer flows through a sequence; the player names the word. The
arcade session engine owns scoring/streak/completion; this component owns
question loading, the performer stage (scene picker + diagnostic copy), and
per-question feedback, reporting each answer via session.submitAnswer() with
the exact QuizAnswerEvent shape gap detection depends on. The challenge's
wordLength constraint rides through the question generator as a soft filter.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { detectSingleError } from "#lib/features/learn/services/gap-detector.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import { onDestroy, onMount } from "svelte";
  import * as QuestionGenerator from "../../quiz/services/question-generator";
  import { QuizType } from "../../quiz/domain/enums/quiz-enums";
  import type { QuizQuestionData } from "../../quiz/domain/models/quiz-models";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { DetectedGap } from "../../services/types";
  import QuizContainer from "../../quiz/components/shared/QuizContainer.svelte";
  import QuizLoadingState from "../../quiz/components/shared/QuizLoadingState.svelte";
  import QuizErrorState from "../../quiz/components/shared/QuizErrorState.svelte";
  import QuizPrompt from "../../quiz/components/shared/QuizPrompt.svelte";
  import QuizPerformerStage from "../../quiz/components/shared/QuizPerformerStage.svelte";
  import QuizWordButton from "../../quiz/components/shared/QuizWordButton.svelte";
  import QuizFeedbackBanner from "../../quiz/components/shared/QuizFeedbackBanner.svelte";
  import MisconceptionHint from "../../quiz/components/shared/MisconceptionHint.svelte";
  import ScorePopAnimation from "../../quiz/components/shared/ScorePopAnimation.svelte";
  import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
  import { BackgroundType } from "@austencloud/backgrounds";
  import { ANIMATED_BACKGROUNDS } from "#lib/shared/settings/utils/public-page-backgrounds.js";
  import { getCatalogIdForSequence } from "../../quiz/services/sequence-question-generator";
  import { getArcadeSession } from "../state/arcade-session-state.svelte";
  import type { QuestionConstraints } from "../domain/arcade-types";

  let { constraints }: { constraints: QuestionConstraints } = $props();

  const session = getArcadeSession();
  let hapticService: HapticFeedback;

  let scorePopTimer: ReturnType<typeof setTimeout> | null = null;
  let hapticTimer: ReturnType<typeof setTimeout> | null = null;
  let nextQuestionTimer: ReturnType<typeof setTimeout> | null = null;
  let copiedDiagTimer: ReturnType<typeof setTimeout> | null = null;

  onDestroy(() => {
    if (scorePopTimer !== null) clearTimeout(scorePopTimer);
    if (hapticTimer !== null) clearTimeout(hapticTimer);
    if (nextQuestionTimer !== null) clearTimeout(nextQuestionTimer);
    if (copiedDiagTimer !== null) clearTimeout(copiedDiagTimer);
  });

  let questionData = $state<QuizQuestionData | null>(null);
  let selectedAnswerId = $state<string | null>(null);
  let isAnswered = $state(false);
  let showFeedback = $state(false);
  let isInitialLoading = $state(true);
  let error = $state<string | null>(null);

  // Score-pop "+1" flourish only — streak truth lives on the session; the
  // shell renders the real streak flame. No local streak state here.
  let showScorePop = $state(false);
  let currentGap = $state<DetectedGap | null>(null);

  // Fixed answer slots — count follows the challenge's optionCount constraint.
  const answerSlots = Array.from(
    { length: constraints.optionCount ?? 4 },
    (_, i) => i
  );

  let quizScene = $state<BackgroundType>(
    settingsService.settings.backgroundType ?? BackgroundType.COSMIC
  );

  function selectScene(type: BackgroundType) {
    quizScene = type;
  }

  let copiedDiag = $state(false);

  async function copyDiagnostic() {
    if (!currentSequence) return;
    const catalogId = getCatalogIdForSequence(currentSequence.id) ?? "unknown";
    const diag = {
      sequenceId: currentSequence.id,
      catalogId,
      word: currentSequence.word, // data — diagnostics carry the raw expanded word on purpose
      stepCount: currentSequence.steps?.length ?? 0,
      gridMode: currentSequence.gridMode ?? "unknown",
    };
    await navigator.clipboard.writeText(JSON.stringify(diag, null, 2));
    copiedDiag = true;
    if (copiedDiagTimer !== null) clearTimeout(copiedDiagTimer);
    copiedDiagTimer = setTimeout(() => {
      copiedDiag = false;
    }, 1500);
  }

  let currentSequence = $derived(
    questionData?.questionContent as SequenceData | null
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
    error = null;
    try {
      questionData = await QuestionGenerator.generateQuestion(
        QuizType.SEQUENCE_TO_WORD,
        constraints
      );
      session.markQuestionShown();
    } catch (err) {
      console.error("Failed to load question:", err);
      error = err instanceof Error ? err.message : "Failed to load question";
    } finally {
      isInitialLoading = false;
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
        quizType: QuizType.SEQUENCE_TO_WORD,
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
        quizType: QuizType.SEQUENCE_TO_WORD,
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

{#if isInitialLoading}
  <QuizContainer>
    <QuizLoadingState />
  </QuizContainer>
{:else if error}
  <QuizContainer>
    <QuizErrorState {error} onRetry={loadQuestion} />
  </QuizContainer>
{:else if questionData && currentSequence}
  <QuizContainer>
    <QuizPrompt text={t("learn_ui_prompt_performer_word")} />

    <div class="quiz-content">
      <div class="stage-column">
        <div class="stage-panel">
          <QuizPerformerStage
            sequence={currentSequence}
            backgroundType={quizScene}
          />
        </div>
        <div class="stage-toolbar">
          <div class="scene-strip">
            {#each ANIMATED_BACKGROUNDS as bg}
              <button
                class="scene-chip accessible-touch-target"
                class:active={quizScene === bg.type}
                onclick={() => selectScene(bg.type)}
                aria-pressed={quizScene === bg.type}
                aria-label={bg.label}
                title={bg.label}
              >
                <i class="fas {bg.icon}" aria-hidden="true"></i>
              </button>
            {/each}
          </div>
          <button
            class="diag-btn"
            class:copied={copiedDiag}
            onclick={copyDiagnostic}
            title="Copy sequence diagnostic"
          >
            <span class="diag-label">
              <span class="diag-sizer" aria-hidden="true">Copy Diag</span>
              <span class="diag-live"
                >{copiedDiag ? "Copied" : "Copy Diag"}</span
              >
            </span>
          </button>
        </div>
      </div>

      <div class="answer-section">
        <div class="answer-grid">
          {#each answerSlots as slotIndex (slotIndex)}
            {@const option = questionData.answerOptions[slotIndex]}
            {#if option}
              <QuizWordButton
                word={option.content as string}
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
            correctMessage={t("learn_ui_correct_word", { word: correctAnswer })}
            incorrectMessage={t("learn_ui_answer_word", {
              word: correctAnswer,
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
    gap: 1.25rem;
    width: 100%;
    max-width: 420px;
    flex: 1;
    min-height: 0;
  }

  .stage-column {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 100%;
    flex: 1;
    min-height: 0;
  }

  .stage-panel {
    width: 100%;
    flex: 1;
    min-height: 200px;
    border-radius: 16px;
    overflow: hidden;
  }

  .stage-toolbar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .scene-strip {
    display: flex;
    gap: 4px;
  }

  .diag-btn {
    padding: 4px 10px;
    border-radius: 8px;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
    color: var(--theme-text-dim);
    cursor: pointer;
    font-size: var(--font-size-compact);
    font-weight: 500;
    transition: all 150ms ease;
    white-space: nowrap;
  }

  /* Ghost-sizer: reserve width for the longest label variant so the
     "Copy Diag" / "Copied" swap never resizes the button */
  .diag-label {
    display: inline-grid;
  }

  .diag-sizer {
    grid-area: 1 / 1;
    visibility: hidden;
  }

  .diag-live {
    grid-area: 1 / 1;
    justify-self: center;
  }

  .diag-btn:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .diag-btn.copied {
    background: color-mix(in srgb, var(--semantic-success) 20%, transparent);
    border-color: color-mix(in srgb, var(--semantic-success) 40%, transparent);
    color: var(--semantic-success);
  }

  .scene-chip {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
    color: var(--theme-text-dim);
    cursor: pointer;
    transition: all 150ms ease;
    font-size: 12px;
    padding: 0;
  }

  .scene-chip:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .scene-chip.active {
    background: color-mix(in srgb, var(--theme-accent) 25%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent) 50%, transparent);
    color: var(--theme-accent);
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
    grid-template-columns: 1fr 1fr;
    gap: 0.625rem;
    width: 100%;
  }

  /* Desktop: horizontal split layout */
  @media (min-width: 768px) {
    .quiz-content {
      flex-direction: row;
      align-items: stretch;
      max-width: 900px;
      gap: 2rem;
    }

    .stage-column {
      flex: 1;
      min-height: 360px;
    }

    .answer-section {
      flex: 0 0 260px;
      justify-content: center;
    }

    .answer-grid {
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }

    .scene-chip {
      width: 36px;
      height: 36px;
      font-size: 13px;
    }
  }

  @media (min-width: 1024px) {
    .quiz-content {
      max-width: 1000px;
    }

    .answer-section {
      flex: 0 0 300px;
    }

    .answer-grid {
      gap: 0.875rem;
    }
  }

  @media (min-width: 1440px) {
    .quiz-content {
      max-width: 1400px;
      gap: 3rem;
    }

    .stage-column {
      min-height: 500px;
    }

    .answer-section {
      flex: 0 0 380px;
    }

    .answer-grid {
      gap: 1rem;
    }

    .scene-chip {
      width: 40px;
      height: 40px;
      font-size: 14px;
      border-radius: 10px;
    }

    .scene-strip {
      gap: 6px;
    }
  }

  @media (min-width: 1920px) {
    .quiz-content {
      max-width: 1800px;
      gap: 4rem;
    }

    .stage-column {
      min-height: 600px;
    }

    .answer-section {
      flex: 0 0 440px;
    }

    .answer-grid {
      gap: 1.25rem;
    }
  }

  @media (min-width: 2560px) {
    .quiz-content {
      max-width: 2200px;
      gap: 5rem;
    }

    .stage-column {
      min-height: 700px;
    }

    .answer-section {
      flex: 0 0 520px;
    }
  }

  @media (max-width: 480px) {
    .quiz-content {
      gap: 1rem;
    }

    .answer-grid {
      gap: 0.5rem;
    }
  }
</style>
