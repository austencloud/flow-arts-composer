<!--
  Trace the Card — the inverse of Mandala Match: a real choreo card is the
  question, and the answers are real mandalas (MandalaOptionGrid). Same
  generator, same 8-count catalog pool; only which side of the card↔mandala
  pairing you're reading changes.

  No misconception-hint pass: gap detection is letter-based, no signal here.
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { onDestroy, onMount } from "svelte";
  import { generateSequenceMatchQuestion } from "../../quiz/services/sequence-question-generator";
  import { QuizType } from "../../quiz/domain/enums/quiz-enums";
  import type {
    QuizAnswerOption,
    QuizQuestionData,
  } from "../../quiz/domain/models/quiz-models";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import QuizContainer from "../../quiz/components/shared/QuizContainer.svelte";
  import QuizLoadingState from "../../quiz/components/shared/QuizLoadingState.svelte";
  import QuizErrorState from "../../quiz/components/shared/QuizErrorState.svelte";
  import QuizPrompt from "../../quiz/components/shared/QuizPrompt.svelte";
  import QuizFeedbackBanner from "../../quiz/components/shared/QuizFeedbackBanner.svelte";
  import ScorePopAnimation from "../../quiz/components/shared/ScorePopAnimation.svelte";
  import ChoreoCard from "$lib/features/choreo-card/components/ChoreoCard.svelte";
  import MandalaOptionGrid from "../components/MandalaOptionGrid.svelte";
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
  let isInitialLoading = $state(true);
  let error = $state<string | null>(null);
  let showScorePop = $state(false);

  const challengeNumber = $derived(
    session.phase.name === "playing"
      ? session.phase.challenge.challengeNumber
      : 1
  );

  let currentSequence = $derived(
    questionData?.questionContent as SequenceData | null
  );
  let correctWord = $derived(
    currentSequence ? simplifyRepeatedWord(currentSequence.word) : ""
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
    error = null;
    try {
      questionData = await generateSequenceMatchQuestion(generateQuestionId(), {
        optionCount: constraints.optionCount,
        stepCount: constraints.stepCount,
        similarDistractors: challengeNumber === 3,
        lessonType: QuizType.CARD_TO_MANDALA,
      });
      session.markQuestionShown();
    } catch (err) {
      console.error("Failed to load question:", err);
      error = err instanceof Error ? err.message : "Failed to load question";
    } finally {
      isInitialLoading = false;
    }
  }

  function generateQuestionId(): string {
    return `q_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  function handlePick(option: QuizAnswerOption) {
    if (isAnswered || !questionData) return;
    hapticService?.trigger("selection");
    selectedAnswerId = option.id;
    isAnswered = true;
    showFeedback = true;

    const isCorrect = option.isCorrect;
    if (isCorrect) {
      showScorePop = true;
      scorePopTimer = setTimeout(() => {
        showScorePop = false;
      }, 800);
    }

    hapticTimer = setTimeout(() => {
      hapticService?.trigger(isCorrect ? "success" : "error");
    }, 100);

    const picked = option.content as SequenceData;
    session.submitAnswer({
      isCorrect,
      questionData,
      selectedOptionId: option.id,
      selectedContent: simplifyRepeatedWord(picked.word),
      correctContent: correctWord,
      quizType: QuizType.CARD_TO_MANDALA,
      answeredAt: new Date(),
    });

    nextQuestionTimer = setTimeout(handleNextQuestion, 1600);
  }

  async function handleNextQuestion() {
    if (session.phase.name !== "playing") return;
    selectedAnswerId = null;
    isAnswered = false;
    showFeedback = false;
    await loadQuestion();
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
    <QuizPrompt text="Read the card. Pick the mandala it traces." />

    <div class="quiz-content">
      <div class="card-column">
        <div class="question-card">
          <ChoreoCard
            sequence={currentSequence}
            showQRCodes={false}
            includeStartPlacement={false}
          />
        </div>
        <ScorePopAnimation
          visible={showScorePop}
          score={1}
          streakCount={session.streak}
        />
        {#if showFeedback}
          <QuizFeedbackBanner
            isCorrect={isCorrectAnswer}
            correctMessage={`Correct! "${correctWord}" traces that bloom`}
            incorrectMessage={`"${correctWord}" traces the highlighted mandala`}
            streakCount={session.streak}
          />
        {/if}
      </div>

      <div class="options-column">
        <MandalaOptionGrid
          options={questionData.answerOptions}
          selectedId={selectedAnswerId}
          {isAnswered}
          onPick={handlePick}
        />
      </div>
    </div>
  </QuizContainer>
{/if}

<style>
  /* Stacked (foldable/tablet/phone): card on top, mandalas below, both at
     natural size and centered together as a group. Row split only at ≥1024. */
  .quiz-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: clamp(1rem, 3svh, 2rem);
    width: 100%;
    max-width: 560px;
    flex: 1;
    min-height: 0;
  }

  .card-column {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    width: min(74vw, 300px);
    flex: 0 0 auto;
    min-height: 0;
  }

  /* Natural card aspect (wordcard renders to its own ratio) — forcing 2.5:3.5
     left white voids above/below the content. */
  .question-card {
    width: 100%;
    height: fit-content;
  }

  /* Fills the space under the card; MandalaOptionGrid reads this bounded
     height and sizes its tiles to fit (capped, centered). */
  .options-column {
    width: 100%;
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    align-items: stretch;
    justify-content: center;
  }

  @media (min-width: 1024px) {
    .quiz-content {
      flex-direction: row;
      align-items: center;
      justify-content: center;
      max-width: 1000px;
      gap: 2.5rem;
    }

    .card-column {
      flex: 0 0 320px;
      width: auto;
      justify-content: center;
    }

    .options-column {
      flex: 0 1 auto;
      max-width: 520px;
    }
  }

  @media (min-width: 1440px) {
    .quiz-content {
      max-width: 1250px;
    }

    .card-column {
      flex-basis: 400px;
    }

    .options-column {
      max-width: 620px;
    }
  }

  @media (min-width: 2560px) {
    .quiz-content {
      max-width: clamp(1250px, 52vw, 1650px);
    }

    .card-column {
      flex-basis: 500px;
    }

    .options-column {
      max-width: 760px;
    }
  }
</style>
