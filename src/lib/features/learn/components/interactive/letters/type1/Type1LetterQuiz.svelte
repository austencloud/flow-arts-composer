<!--
Type1LetterQuiz - Coordinator for Type 1 (Dual-Shift) letter quiz
Shows pictograph, user identifies the motion pattern (Pro-Pro, Anti-Anti, or Hybrid)
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { letterQueryHandler } from "#lib/shared/pictograph/tka-glyph/services/letter-query-handler.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import { onMount, onDestroy } from "svelte";
  import {
    type MotionPattern,
    type Type1LetterQuestion,
    generateType1Questions,
  } from "../../../../domain/constants/type1-letter-questions";
  import Type1ProgressBar from "./type1-quiz/Type1ProgressBar.svelte";
  import Type1QuizSection from "./type1-quiz/Type1QuizSection.svelte";
  import Type1CompleteSection from "./type1-quiz/Type1CompleteSection.svelte";

  let { onComplete } = $props<{ onComplete?: () => void }>();

  const hapticService = getHapticFeedback();

  let answerTimer: ReturnType<typeof setTimeout> | null = null;

  onDestroy(() => {
    if (answerTimer !== null) clearTimeout(answerTimer);
  });

  type AnswerState = "idle" | "correct" | "incorrect";

  // Quiz state
  let currentQuestionIndex = $state(0);
  let score = $state(0);
  let answerState = $state<AnswerState>("idle");
  let selectedAnswer = $state<MotionPattern | null>(null);
  let isLoadingPictograph = $state(true);
  let currentPictographData = $state<PictographData | null>(null);
  let lastLoadedQuestionIndex = $state(-1);
  const questions = $state<Type1LetterQuestion[]>(generateType1Questions());

  const isComplete = $derived(currentQuestionIndex >= questions.length);

  // Load pictograph for current question
  async function loadCurrentPictograph(questionIndex: number) {
    if (questionIndex >= questions.length) return;

    isLoadingPictograph = true;
    currentPictographData = null;
    lastLoadedQuestionIndex = questionIndex;

    try {
      const currentQuestion = questions[questionIndex];
      if (!currentQuestion) return;

      const data = await letterQueryHandler.getPictographByLetter(
        currentQuestion.letter,
        GridMode.DIAMOND
      );

      if (lastLoadedQuestionIndex === questionIndex && data) {
        currentPictographData = data;
      }
    } catch (e) {
      console.error("Failed to load pictograph:", e);
    } finally {
      if (lastLoadedQuestionIndex === questionIndex) {
        isLoadingPictograph = false;
      }
    }
  }

  onMount(() => {
    loadCurrentPictograph(0);
  });

  let prevQuestionIndex = -1;
  $effect(() => {
    const idx = currentQuestionIndex;
    if (idx !== prevQuestionIndex && idx < questions.length) {
      prevQuestionIndex = idx;
      loadCurrentPictograph(idx);
    }
  });

  function getCurrentQuestion(): Type1LetterQuestion | null {
    return questions[currentQuestionIndex] ?? null;
  }

  function handleAnswer(answer: MotionPattern) {
    if (answerState !== "idle") return;

    selectedAnswer = answer;
    const question = getCurrentQuestion();
    if (!question) return;

    if (answer === question.pattern) {
      answerState = "correct";
      score++;
      hapticService?.trigger("success");
    } else {
      answerState = "incorrect";
      hapticService?.trigger("error");
    }

    answerTimer = setTimeout(() => {
      answerTimer = null;
      if (currentQuestionIndex < questions.length - 1) {
        currentQuestionIndex++;
        answerState = "idle";
        selectedAnswer = null;
      } else {
        answerState = "idle";
        currentQuestionIndex++;
      }
    }, 1500);
  }

  function restartQuiz() {
    currentQuestionIndex = 0;
    score = 0;
    answerState = "idle";
    selectedAnswer = null;
    lastLoadedQuestionIndex = -1;
    questions.length = 0;
    questions.push(...generateType1Questions());
    loadCurrentPictograph(0);
  }
</script>

<div class="type1-quiz">
  <Type1ProgressBar
    currentQuestion={currentQuestionIndex}
    totalQuestions={questions.length}
    {isComplete}
  />

  {#if !isComplete}
    {@const question = getCurrentQuestion()}
    {#if question}
      <Type1QuizSection
        {question}
        {isLoadingPictograph}
        pictographData={currentPictographData}
        {answerState}
        {selectedAnswer}
        onAnswer={handleAnswer}
      />
    {/if}
  {:else}
    <Type1CompleteSection
      {score}
      totalQuestions={questions.length}
      onRestart={restartQuiz}
      onComplete={() => onComplete?.()}
    />
  {/if}
</div>

<style>
  .type1-quiz {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1.5rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke);
    border-radius: 16px;
  }

  @media (max-width: 500px) {
    .type1-quiz {
      padding: 1rem;
    }
  }
</style>
