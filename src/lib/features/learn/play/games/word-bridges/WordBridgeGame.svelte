<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import { getErrorHandler } from "$lib/shared/application/get-error-handler";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import type { Letter } from "$lib/shared/foundation/domain/models/letter";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import {
    getTransitionGraph,
    getWordGenerator,
  } from "$lib/features/create/spell/services/spell-service-loader";
  import {
    QuizAnswerFormat,
    QuizQuestionFormat,
    QuizType,
  } from "../../../quiz/domain/enums/quiz-enums";
  import type {
    QuizAnswerOption,
    QuizQuestionData,
  } from "../../../quiz/domain/models/quiz-models";
  import QuizContainer from "../../../quiz/components/shared/QuizContainer.svelte";
  import QuizErrorState from "../../../quiz/components/shared/QuizErrorState.svelte";
  import QuizLoadingState from "../../../quiz/components/shared/QuizLoadingState.svelte";
  import QuizPictographButton from "../../../quiz/components/shared/QuizPictographButton.svelte";
  import QuizWordButton from "../../../quiz/components/shared/QuizWordButton.svelte";
  import type { QuestionConstraints } from "../../domain/arcade-types";
  import { getArcadeSession } from "../../state/arcade-session-state.svelte";
  import {
    loadPlayPictographPool,
    type PlayPictographPool,
  } from "../../services/pictograph-pool";
  import BridgeFeedback from "./components/BridgeFeedback.svelte";
  import BridgeWordRail from "./components/BridgeWordRail.svelte";
  import {
    buildWordBridgeDeck,
    isRepairAnswerCorrect,
    type RepairChoice,
    type WordBridgeGraph,
    type WordBridgeQuestion,
  } from "./domain/word-bridge-questions";

  let { constraints }: { constraints: QuestionConstraints } = $props();

  const session = getArcadeSession();
  const task = constraints.bridgeTask ?? "validity";

  let haptics: HapticFeedback | null = null;
  let disposed = false;
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let deck = $state<WordBridgeQuestion[]>([]);
  let currentQuestion = $state<WordBridgeQuestion | null>(null);
  let pictographs = $state<PlayPictographPool>(new Map());
  let selectedAnswer = $state<boolean | number | string | null>(null);
  let answerWasCorrect = $state(false);
  let focusGapIndex = $state<number | null>(null);
  let wordDisplayElement = $state<HTMLElement | null>(null);
  let explanationPanel = $state<HTMLElement | null>(null);

  const isAnswered = $derived(selectedAnswer !== null);
  const displayWord = $derived(
    currentQuestion ? simplifyRepeatedWord(currentQuestion.analysis.word) : ""
  );
  const fixedQuestionCount = $derived(
    session.phase.name === "playing" &&
      session.phase.challenge.mode.kind === "fixed"
      ? session.phase.challenge.mode.questionCount
      : 0
  );
  const isFinalAnswer = $derived(
    isAnswered &&
      fixedQuestionCount > 0 &&
      session.questionIndex >= fixedQuestionCount
  );

  const prompt = $derived.by(() => {
    switch (currentQuestion?.task) {
      case "validity":
        return "This word can run exactly as written.";
      case "count":
        return "How many bridge letters does this word need?";
      case "repair":
        return "Which letter can bridge the marked gap?";
      default:
        return "Read the word";
    }
  });

  const kicker = $derived.by(() => {
    switch (currentQuestion?.task) {
      case "validity":
        return "True or false";
      case "count":
        return "Count every break";
      case "repair":
        return "Choose a bridge";
      default:
        return "Word bridges";
    }
  });

  const answerAnnouncement = $derived.by(() => {
    if (!isAnswered || !currentQuestion || selectedAnswer === null) return "";

    const result = answerWasCorrect ? "Correct." : "Not quite.";
    if (currentQuestion.task === "validity") {
      return currentQuestion.analysis.canRunAsWritten
        ? `${result} ${displayWord} runs exactly as written.`
        : `${result} ${displayWord} needs ${currentQuestion.analysis.requiredBridgeCount} ${currentQuestion.analysis.requiredBridgeCount === 1 ? "bridge" : "bridges"}.`;
    }

    if (currentQuestion.task === "count") {
      return `${result} ${displayWord} needs ${currentQuestion.correctAnswer} ${currentQuestion.correctAnswer === 1 ? "bridge" : "bridges"}.`;
    }

    const validBridges = currentQuestion.validBridges
      .map((bridge) => bridge.letter)
      .join(", ");
    return answerWasCorrect
      ? `${result} ${selectedAnswer} bridges ${currentQuestion.gap.from} to ${currentQuestion.gap.to}.`
      : `${result} ${selectedAnswer} does not bridge ${currentQuestion.gap.from} to ${currentQuestion.gap.to}. Valid bridges are ${validBridges}.`;
  });

  onMount(() => {
    haptics = getHapticFeedback();
    void initializeGame();
  });

  onDestroy(() => {
    disposed = true;
  });

  function adaptGraph(
    graph: Awaited<ReturnType<typeof getTransitionGraph>>
  ): WordBridgeGraph {
    const asLetter = (letter: string) => letter as Letter;
    return {
      canFollow: (from, to) => graph.canFollow(asLetter(from), asLetter(to)),
      getLetterPlacementInfo: (letter) => {
        const info = graph.getLetterPlacementInfo(asLetter(letter));
        return info
          ? {
              startPlacementGroup: String(info.startPlacementGroup),
              endPlacementGroup: String(info.endPlacementGroup),
            }
          : null;
      },
      findAllBridgeOptions: (from, to) =>
        graph.findAllBridgeOptions(asLetter(from), asLetter(to)).map(String),
      findBridgeLetters: (from, to) =>
        graph.findBridgeLetters(asLetter(from), asLetter(to)).map(String),
    };
  }

  async function initializeGame() {
    isLoading = true;
    error = null;

    try {
      if (
        session.phase.name !== "playing" ||
        session.phase.challenge.mode.kind !== "fixed"
      ) {
        throw new Error("Word bridges requires a fixed question challenge.");
      }

      const [transitionGraph, wordGenerator, loadedPictographs] =
        await Promise.all([
          getTransitionGraph(),
          getWordGenerator(),
          loadPlayPictographPool(),
        ]);

      if (loadedPictographs.size === 0) {
        throw new Error("The pictograph dataframe returned no letters.");
      }

      const questions = buildWordBridgeDeck({
        task,
        questionCount: session.phase.challenge.mode.questionCount,
        optionCount: constraints.optionCount,
        graph: adaptGraph(transitionGraph),
        availableLetters: new Set(loadedPictographs.keys()),
        parseWord: (word) => {
          const parsed = wordGenerator.parseWord(word);
          return parsed && !parsed.error ? parsed.letters.map(String) : null;
        },
      });

      if (disposed) return;
      pictographs = loadedPictographs;
      deck = questions;
      showQuestion(questions[0]!);
      await tick();
      session.markQuestionShown();
    } catch (cause) {
      if (disposed) return;
      console.error("[WordBridgeGame] Failed to load:", cause);
      error = "Bridge questions did not load.";
      getErrorHandler().showUserError({
        message: "Bridge questions did not load",
        technicalDetails:
          cause instanceof Error ? cause.message : String(cause),
        error: cause instanceof Error ? cause : new Error(String(cause)),
        severity: "error",
        context: {
          module: "learn",
          tab: "play",
          action: "loadWordBridgeGame",
        },
      });
    } finally {
      if (!disposed) isLoading = false;
    }
  }

  function showQuestion(question: WordBridgeQuestion) {
    currentQuestion = question;
    selectedAnswer = null;
    answerWasCorrect = false;
    focusGapIndex = question.task === "repair" ? question.gap.index : null;
  }

  function groupLabel(group: string): string {
    return group.charAt(0).toUpperCase() + group.slice(1);
  }

  function focusAndReveal(element: HTMLElement | null) {
    if (!element) return;
    element.focus({ preventScroll: true });

    const scroller = element.closest(".quiz-container");
    const elementBounds = element.getBoundingClientRect();
    const scrollerBounds = scroller?.getBoundingClientRect();
    const visibleTop = Math.max(elementBounds.top, scrollerBounds?.top ?? 0);
    const visibleBottom = Math.min(
      elementBounds.bottom,
      scrollerBounds?.bottom ?? window.innerHeight
    );
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);
    const availableHeight = scrollerBounds?.height ?? window.innerHeight;
    const targetHeight = Math.min(elementBounds.height, availableHeight);

    if (targetHeight > 0 && visibleHeight / targetHeight < 0.92) {
      element.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    }
  }

  function answerOptions(question: WordBridgeQuestion): QuizAnswerOption[] {
    switch (question.task) {
      case "validity":
        return [
          { id: "true", content: true, isCorrect: question.correctAnswer },
          { id: "false", content: false, isCorrect: !question.correctAnswer },
        ];
      case "count":
        return question.options.map((count) => ({
          id: `count-${count}`,
          content: count,
          isCorrect: count === question.correctAnswer,
        }));
      case "repair":
        return question.choices.map((choice) => ({
          id: `bridge-${choice.letter}`,
          content: choice.letter,
          isCorrect: choice.isCorrect,
        }));
    }
  }

  function quizQuestionData(question: WordBridgeQuestion): QuizQuestionData {
    return {
      questionId: question.id,
      questionContent: {
        word: question.analysis.word,
        bridgeCount: question.analysis.requiredBridgeCount,
        gapIndex: question.task === "repair" ? question.gap.index : null,
      },
      answerOptions: answerOptions(question),
      correctAnswer:
        question.task === "repair"
          ? question.validBridges.map((bridge) => bridge.letter)
          : question.correctAnswer,
      questionType: QuizQuestionFormat.TEXT,
      answerType:
        question.task === "repair"
          ? QuizAnswerFormat.PICTOGRAPH
          : QuizAnswerFormat.BUTTON,
      lessonType: QuizType.WORD_BRIDGES,
      generationTimestamp: new Date().toISOString(),
    };
  }

  async function submitAnswer(
    value: boolean | number | string,
    optionId: string,
    isCorrect: boolean
  ) {
    if (isAnswered || !currentQuestion) return;

    selectedAnswer = value;
    answerWasCorrect = isCorrect;
    focusGapIndex =
      currentQuestion.task === "repair"
        ? currentQuestion.gap.index
        : (currentQuestion.analysis.gaps.find((gap) => !gap.direct)?.index ??
          currentQuestion.analysis.gaps[0]?.index ??
          null);
    haptics?.trigger(isCorrect ? "success" : "error");

    const questionData = quizQuestionData(currentQuestion);
    session.submitAnswer({
      isCorrect,
      questionData,
      selectedOptionId: optionId,
      selectedContent: value,
      correctContent:
        currentQuestion.task === "repair"
          ? currentQuestion.validBridges.map((bridge) => bridge.letter)
          : currentQuestion.correctAnswer,
      quizType: QuizType.WORD_BRIDGES,
      answeredAt: new Date(),
    });

    await tick();
    focusAndReveal(explanationPanel);
  }

  function textAnswerState(
    value: boolean | number,
    isCorrect: boolean
  ): "default" | "correct" | "incorrect" | "dimmed" {
    if (!isAnswered) return "default";
    if (isCorrect) return "correct";
    if (selectedAnswer === value) return "incorrect";
    return "dimmed";
  }

  function repairAnswerState(
    choice: RepairChoice
  ): "default" | "correct" | "incorrect" | "dimmed" {
    if (!isAnswered) return "default";
    if (choice.isCorrect) return "correct";
    if (selectedAnswer === choice.letter) return "incorrect";
    return "dimmed";
  }

  async function handleContinue() {
    if (!isAnswered || session.phase.name !== "playing") return;
    haptics?.trigger("selection");

    if (isFinalAnswer) {
      session.complete();
      return;
    }

    const nextQuestion = deck[session.questionIndex];
    if (!nextQuestion) {
      session.complete();
      return;
    }

    showQuestion(nextQuestion);
    await tick();
    session.markQuestionShown();
    focusAndReveal(wordDisplayElement);
  }

  function inspectGap(index: number) {
    if (!isAnswered) return;
    haptics?.trigger("selection");
    focusGapIndex = index;
  }
</script>

{#if isLoading}
  <QuizContainer>
    <QuizLoadingState />
  </QuizContainer>
{:else if error}
  <QuizContainer>
    <QuizErrorState {error} onRetry={initializeGame} />
  </QuizContainer>
{:else if currentQuestion}
  <QuizContainer>
    <section class="bridge-game" aria-labelledby="bridge-question">
      <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {answerAnnouncement}
      </p>
      <header class="question-heading">
        <span class="question-kicker">{kicker}</span>
        <h2 id="bridge-question">{prompt}</h2>
      </header>

      <div class="game-layout">
        <div class="problem-panel">
          <div
            class="word-display"
            aria-label="{prompt} Word {displayWord}"
            tabindex="-1"
            bind:this={wordDisplayElement}
          >
            {displayWord}
          </div>

          <BridgeWordRail
            analysis={currentQuestion.analysis}
            reveal={isAnswered}
            revealAll={currentQuestion.task !== "repair"}
            {focusGapIndex}
            showFocusSocket={currentQuestion.task === "repair"}
            onSelectGap={currentQuestion.task === "count" && isAnswered
              ? inspectGap
              : null}
          />

          {#if currentQuestion.task === "validity"}
            {@const validityQuestion = currentQuestion}
            <div class="text-answer-grid binary">
              <QuizWordButton
                word="TRUE"
                subtitle="No bridge"
                ariaLabel="True, the word runs as written"
                state={textAnswerState(true, validityQuestion.correctAnswer)}
                disabled={isAnswered}
                onclick={() =>
                  submitAnswer(true, "true", validityQuestion.correctAnswer)}
              />
              <QuizWordButton
                word="FALSE"
                subtitle="Bridge needed"
                ariaLabel="False, the word needs a bridge"
                state={textAnswerState(false, !validityQuestion.correctAnswer)}
                disabled={isAnswered}
                onclick={() =>
                  submitAnswer(false, "false", !validityQuestion.correctAnswer)}
              />
            </div>
          {:else if currentQuestion.task === "count"}
            {@const countQuestion = currentQuestion}
            <div class="text-answer-grid count-grid">
              {#each countQuestion.options as count (count)}
                <QuizWordButton
                  word={String(count)}
                  ariaLabel={`${count} ${count === 1 ? "bridge" : "bridges"}`}
                  state={textAnswerState(
                    count,
                    count === countQuestion.correctAnswer
                  )}
                  disabled={isAnswered}
                  onclick={() =>
                    submitAnswer(
                      count,
                      `count-${count}`,
                      count === countQuestion.correctAnswer
                    )}
                />
              {/each}
            </div>
          {:else}
            {@const repairQuestion = currentQuestion}
            <div class="pictograph-answer-grid">
              {#each repairQuestion.choices as choice (choice.letter)}
                {@const pictograph = pictographs.get(choice.letter)?.[0]}
                {#if pictograph}
                  <QuizPictographButton
                    {pictograph}
                    caption={choice.letter}
                    ariaLabel={`Bridge letter ${choice.letter}, starts ${groupLabel(choice.startPlacementGroup)} and ends ${groupLabel(choice.endPlacementGroup)}`}
                    showPlacements={true}
                    state={repairAnswerState(choice)}
                    disabled={isAnswered}
                    onclick={() =>
                      submitAnswer(
                        choice.letter,
                        `bridge-${choice.letter}`,
                        isRepairAnswerCorrect(repairQuestion, choice.letter)
                      )}
                  />
                {/if}
              {/each}
            </div>
          {/if}
        </div>

        <aside
          class="explanation-panel"
          aria-label="Bridge explanation"
          tabindex="-1"
          bind:this={explanationPanel}
        >
          {#if isAnswered && selectedAnswer !== null}
            <BridgeFeedback
              question={currentQuestion}
              {selectedAnswer}
              isCorrect={answerWasCorrect}
              {focusGapIndex}
              {pictographs}
            />
            <button
              type="button"
              class="continue-button"
              onclick={handleContinue}
            >
              {isFinalAnswer ? "See results" : "Continue"}
              <span aria-hidden="true">→</span>
            </button>
          {:else}
            <div class="bridge-primer" role="note">
              <div class="match-rule" aria-hidden="true">
                <span>End</span>
                <strong>=</strong>
                <span>Start</span>
              </div>
              <h3>Check each gap</h3>
              <p>
                Matching placement groups connect directly. A mismatch needs a
                bridge letter between them.
              </p>
              <span class="take-time"
                >No timer. Study the word as long as needed.</span
              >
            </div>
          {/if}
        </aside>
      </div>
    </section>
  </QuizContainer>
{/if}

<style>
  .bridge-game {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: clamp(0.75rem, 2cqi, 1.4rem);
    width: min(100%, 1540px);
    margin: auto;
    padding-block: 0.25rem;
  }

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

  .question-heading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    text-align: center;
  }

  .question-kicker {
    color: var(--game-accent);
    font-size: var(--font-size-compact, 12px);
    font-weight: 800;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0;
    color: var(--theme-text);
    font-size: clamp(1.05rem, 4.8cqi, 2.1rem);
    line-height: 1.2;
  }

  .game-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: clamp(0.75rem, 2.2cqi, 1.5rem);
    width: 100%;
  }

  .problem-panel,
  .explanation-panel {
    min-width: 0;
    border: 1px solid var(--theme-stroke);
    border-radius: clamp(16px, 3cqi, 24px);
    background: color-mix(
      in srgb,
      var(--game-accent) 3%,
      var(--theme-panel-bg)
    );
  }

  .problem-panel {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: clamp(0.7rem, 2cqi, 1.25rem);
    padding: clamp(0.8rem, 3cqi, 2rem);
  }

  .word-display {
    min-height: 1.15em;
    color: var(--theme-text);
    font-family: "JetBrains Mono", "Fira Code", "SF Mono", monospace;
    font-size: clamp(2rem, 10cqi, 5.5rem);
    font-weight: 900;
    letter-spacing: 0.1em;
    line-height: 1.05;
    text-align: center;
    text-indent: 0.1em;
    text-wrap: balance;
    scroll-margin-block: 0.75rem;
  }

  .word-display:focus,
  .explanation-panel:focus {
    outline: none;
  }

  .text-answer-grid,
  .pictograph-answer-grid {
    display: grid;
    gap: clamp(0.5rem, 1.7cqi, 0.9rem);
    width: min(100%, 520px);
    margin-inline: auto;
  }

  .text-answer-grid.binary,
  .count-grid,
  .pictograph-answer-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .pictograph-answer-grid {
    width: min(100%, 390px);
  }

  .explanation-panel {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.75rem;
    min-height: 300px;
    padding: clamp(0.65rem, 2cqi, 1rem);
    scroll-margin-block: 0.75rem;
  }

  .bridge-primer {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    min-height: 260px;
    padding: 1rem;
    text-align: center;
  }

  .match-rule {
    display: flex;
    align-items: center;
    gap: 0.55rem;
  }

  .match-rule span {
    display: grid;
    place-items: center;
    min-width: 64px;
    min-height: 42px;
    padding: 0.45rem 0.7rem;
    border: 1px solid color-mix(in srgb, var(--game-accent) 45%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--game-accent) 9%, transparent);
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    font-weight: 750;
  }

  .match-rule strong {
    color: var(--semantic-success);
    font-size: 1.4rem;
  }

  .bridge-primer h3 {
    margin: 0.3rem 0 0;
    color: var(--theme-text);
    font-size: clamp(1.05rem, 3cqi, 1.4rem);
  }

  .bridge-primer p {
    max-width: 42ch;
    margin: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
    line-height: 1.5;
  }

  .take-time {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
  }

  .continue-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    padding: 0.75rem 1rem;
    border: 1px solid color-mix(in srgb, var(--game-accent) 75%, transparent);
    border-radius: 13px;
    background: var(--game-accent);
    color: #031216;
    cursor: pointer;
    font: inherit;
    font-size: var(--font-size-min, 14px);
    font-weight: 850;
    transition:
      transform var(--duration-fast) ease,
      filter var(--duration-fast) ease;
  }

  .continue-button:hover {
    transform: translateY(-2px);
    filter: brightness(1.08);
  }

  .continue-button:active {
    transform: translateY(0) scale(0.99);
  }

  .continue-button:focus-visible {
    outline: 2px solid var(--theme-text);
    outline-offset: 3px;
  }

  @container (min-width: 800px) {
    .game-layout {
      grid-template-columns: minmax(0, 0.92fr) minmax(360px, 1.08fr);
      align-items: stretch;
    }

    .problem-panel,
    .explanation-panel {
      min-height: clamp(430px, 46cqi, 610px);
    }

    .explanation-panel {
      padding: clamp(0.9rem, 1.8cqi, 1.5rem);
    }
  }

  @container (max-width: 519px) {
    .pictograph-answer-grid {
      width: min(100%, 220px);
    }
  }

  @container (min-width: 520px) and (max-width: 799px) {
    .count-grid,
    .pictograph-answer-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .count-grid {
      width: min(100%, 620px);
    }

    .pictograph-answer-grid {
      width: min(100%, 580px);
    }
  }

  @container (min-width: 1250px) {
    .game-layout {
      grid-template-columns: minmax(0, 0.86fr) minmax(0, 1.14fr);
    }

    .pictograph-answer-grid {
      width: min(100%, 460px);
    }
  }

  @media (max-height: 700px) {
    .bridge-game {
      gap: 0.6rem;
      padding-block: 0;
    }

    .question-heading {
      gap: 0.1rem;
    }

    .explanation-panel {
      min-height: 0;
      padding: 0.55rem;
    }

    .bridge-primer {
      gap: 0.4rem;
      min-height: 0;
      padding: 0.65rem;
    }
  }

  @media (max-height: 600px) {
    .problem-panel {
      gap: 0.5rem;
      padding: 0.65rem;
    }

    .word-display {
      font-size: clamp(1.8rem, 7cqi, 3.4rem);
    }

    @container (min-width: 520px) and (max-width: 799px) {
      .count-grid,
      .pictograph-answer-grid {
        width: min(100%, 380px);
      }
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .continue-button {
      transition: none;
    }

    .continue-button:hover {
      transform: none;
    }
  }
</style>
