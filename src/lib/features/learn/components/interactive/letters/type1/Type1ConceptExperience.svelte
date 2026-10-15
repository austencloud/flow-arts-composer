<!--
  Type 1 letters on the shared lesson shell: pick any of A B C / G H I and
  compare the real pictographs, answer three letter checks (Next waits for
  the right answer), then the pattern map.
-->
<script lang="ts">
  import { lessonQuestion } from "./lesson-question.js";
  import { onMount } from "svelte";
  import { t, tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { getCodexLetterMappingRepo } from "#lib/features/learn/codex/get-codex-letter-mapping-repo.js";
  import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import { letterQueryHandler } from "#lib/shared/pictograph/tka-glyph/services/letter-query-handler.js";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import type { ExperienceViewMode } from "../../../../domain/types";
  import { getExperiencePersistence } from "../../../../state/experience-persistence.svelte";
  import LessonStageControls from "../../LessonStageControls.svelte";
  import LessonStageFrame from "../../LessonStageFrame.svelte";
  import LessonStageHeading from "../../LessonStageHeading.svelte";
  import {
    TYPE1_ACCENTS,
    TYPE1_LESSON_LETTERS,
    TYPE1_PATTERN_LABELS,
    TYPE1_QUESTIONS,
  } from "../../shared/canonical-lesson-content";
  import LessonPictographStage from "../../shared/LessonPictographStage.svelte";

  let {
    onComplete,
    onBack,
    viewMode = "step",
  }: {
    onComplete?: () => void;
    onBack?: () => void;
    viewMode?: ExperienceViewMode;
  } = $props();

  const PHASE_COUNT = 3;
  const haptic = getHapticFeedback();
  const persistence = getExperiencePersistence("type1-abc-ghi");
  const saved = persistence.load();
  const curriculumLabel = $derived(tDynamic("learn_ui_level_one"));

  let phase = $state(Math.min(PHASE_COUNT, Math.max(1, saved.step || 1)));
  let selectedLetter = $state<Letter>(
    persistence.getPhaseData<Letter>(
      "selectedLetter",
      TYPE1_LESSON_LETTERS[0].letter
    )
  );
  let questionIndex = $state(
    Math.min(
      TYPE1_QUESTIONS.length - 1,
      persistence.getPhaseData<number>("questionIndex", 0)
    )
  );
  let selectedAnswer = $state<Letter | null>(null);
  let answerState = $state<"correct" | "wrong" | null>(null);
  let pictographs = $state<Partial<Record<Letter, PictographData>>>({});
  let loading = $state(true);

  const activeLetter = $derived(
    TYPE1_LESSON_LETTERS.find((item) => item.letter === selectedLetter) ??
      TYPE1_LESSON_LETTERS[0]
  );
  const activeQuestion = $derived(
    lessonQuestion(TYPE1_QUESTIONS, questionIndex)
  );
  const answerLetter = $derived(
    TYPE1_LESSON_LETTERS.find(
      (item) => item.letter === activeQuestion.answer
    ) ?? TYPE1_LESSON_LETTERS[0]
  );
  const selectedAnswerData = $derived(
    TYPE1_LESSON_LETTERS.find((item) => item.letter === selectedAnswer) ?? null
  );
  const isLast = $derived(phase === PHASE_COUNT);
  const lastQuestion = $derived(questionIndex === TYPE1_QUESTIONS.length - 1);
  /** The quiz step waits for the right answer before Next opens. */
  const actionDisabled = $derived(phase === 2 && answerState !== "correct");
  const headingKey = $derived(phase === 2 ? `2-${questionIndex}` : phase);
  const title = $derived(
    phase === 1
      ? tDynamic("learn_type1_title")
      : phase === 2
        ? tDynamic(`learn_type1_question_${questionIndex + 1}`)
        : tDynamic("learn_type1_map_title")
  );
  const description = $derived(
    phase === 1
      ? tDynamic("learn_type1_intro")
      : phase === 2
        ? tDynamic("learn_type1_choose_instruction")
        : tDynamic("learn_type1_map_summary")
  );
  const actionLabel = $derived(
    phase === 1
      ? tDynamic("learn_type1_check_pattern")
      : phase === 2
        ? lastQuestion
          ? tDynamic("learn_type1_see_map")
          : tDynamic("learn_type1_next_pattern")
        : tDynamic("learn_type1_complete")
  );

  function patternLabel(pattern: keyof typeof TYPE1_PATTERN_LABELS): string {
    return tDynamic(`learn_type1_pattern_${pattern.replaceAll("-", "_")}`);
  }

  function familyLabel(family: "alpha" | "beta"): string {
    return tDynamic(`learn_type1_family_${family}`);
  }

  onMount(async () => {
    loading = true;
    getCodexLetterMappingRepo();
    const results = await Promise.all(
      TYPE1_LESSON_LETTERS.map(async ({ letter }) => ({
        letter,
        pictograph: await letterQueryHandler.getPictographByLetter(
          letter,
          GridMode.DIAMOND
        ),
      }))
    );

    pictographs = Object.fromEntries(
      results
        .filter((result) => result.pictograph !== null)
        .map((result) => [result.letter, result.pictograph])
    );
    loading = false;
  });

  function chooseLetter(letter: Letter) {
    selectedLetter = letter;
    persistence.savePhaseData("selectedLetter", letter);
    haptic?.trigger("selection");
  }

  function goToPhase(nextPhase: number) {
    phase = Math.min(PHASE_COUNT, Math.max(1, nextPhase));
    persistence.saveStep(phase);
    selectedAnswer = null;
    answerState = null;
    haptic?.trigger("selection");
  }

  function answerQuestion(letter: Letter) {
    selectedAnswer = letter;
    selectedLetter = letter;
    answerState = letter === activeQuestion.answer ? "correct" : "wrong";
    haptic?.trigger(answerState === "correct" ? "success" : "warning");
  }

  function nextQuestion() {
    if (questionIndex < TYPE1_QUESTIONS.length - 1) {
      questionIndex += 1;
      persistence.savePhaseData("questionIndex", questionIndex);
      selectedAnswer = null;
      answerState = null;
      haptic?.trigger("selection");
      return;
    }
    goToPhase(3);
  }

  function complete() {
    persistence.reset();
    haptic?.trigger("success");
    onComplete?.();
  }

  function handlePrimaryAction() {
    if (actionDisabled) return;
    if (phase === 1) goToPhase(2);
    else if (phase === 2) nextQuestion();
    else complete();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (viewMode !== "step" || event.defaultPrevented) return;
    if (
      event.target instanceof Element &&
      event.target.closest("button, input, select, textarea, [role='slider']")
    )
      return;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      handlePrimaryAction();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      handleBack();
    }
  }

  export function handleBack() {
    if (phase > 1) {
      goToPhase(phase - 1);
      return;
    }
    onBack?.();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="type1-experience"
  class:review-mode={viewMode === "scroll"}
  style:--type-one={TYPE1_ACCENTS[0]}
  style:--type-one-pair={TYPE1_ACCENTS[1]}
  onkeydown={handleKeydown}
  tabindex="0"
  role="application"
  aria-label={t("learn_ui_named_lesson_keyboard", {
    title: tDynamic("learn_concept_type1_abc_ghi_name"),
  })}
>
  <LessonStageFrame artifactLayout="workshop">
    {#snippet heading()}
      <LessonStageHeading
        key={headingKey}
        {title}
        eyebrow={tDynamic("learn_concept_type1_abc_ghi_name")}
      >
        <p>{description}</p>
      </LessonStageHeading>
    {/snippet}

    {#snippet artifact()}
      <Crossfade key={phase} duration={DURATION.normal}>
        {#if phase === 1}
          <section class="explore-grid" aria-label={title}>
            <div class="copy-column">
              <div class="letter-groups">
                <div class="letter-family">
                  <div class="family-label">
                    <span>{tDynamic("learn_type1_alpha_family")}</span>
                    <small>A · B · C</small>
                  </div>
                  <div
                    class="letter-row"
                    aria-label={tDynamic("learn_type1_alpha_letters_aria")}
                  >
                    {#each TYPE1_LESSON_LETTERS.filter((item) => item.placementFamily === "alpha") as item}
                      <button
                        type="button"
                        class:active={selectedLetter === item.letter}
                        aria-pressed={selectedLetter === item.letter}
                        onclick={() => chooseLetter(item.letter)}
                      >
                        <strong>{item.letter}</strong>
                        <small>{patternLabel(item.pattern)}</small>
                      </button>
                    {/each}
                  </div>
                </div>

                <div class="letter-family">
                  <div class="family-label">
                    <span>{tDynamic("learn_type1_beta_family")}</span>
                    <small>G · H · I</small>
                  </div>
                  <div
                    class="letter-row"
                    aria-label={tDynamic("learn_type1_beta_letters_aria")}
                  >
                    {#each TYPE1_LESSON_LETTERS.filter((item) => item.placementFamily === "beta") as item}
                      <button
                        type="button"
                        class:active={selectedLetter === item.letter}
                        aria-pressed={selectedLetter === item.letter}
                        onclick={() => chooseLetter(item.letter)}
                      >
                        <strong>{item.letter}</strong>
                        <small>{patternLabel(item.pattern)}</small>
                      </button>
                    {/each}
                  </div>
                </div>
              </div>

              <div class="current-reading">
                <span class="big-letter">{activeLetter.letter}</span>
                <div>
                  <strong>{patternLabel(activeLetter.pattern)}</strong>
                  <p>
                    {tDynamic("learn_type1_family_shift", {
                      family: familyLabel(activeLetter.placementFamily),
                    })}
                  </p>
                </div>
              </div>
            </div>

            <div class="visual-column">
              <div
                class="type-stripe"
                aria-label={tDynamic("learn_type1_colors_aria")}
              >
                <span></span><span></span>
              </div>
              <LessonPictographStage
                pictograph={pictographs[activeLetter.letter] ?? null}
                {loading}
                accent={activeLetter.pattern === "anti-anti"
                  ? TYPE1_ACCENTS[1]
                  : TYPE1_ACCENTS[0]}
              />
              <p>{tDynamic("learn_type1_visual_note")}</p>
            </div>
          </section>
        {:else if phase === 2}
          <section class="challenge-grid" aria-label={title}>
            <LessonPictographStage
              pictograph={pictographs[
                selectedAnswer ?? activeQuestion.choices[0]
              ] ?? null}
              {loading}
              accent={answerState === "wrong"
                ? "var(--semantic-error)"
                : TYPE1_ACCENTS[0]}
            />

            <div class="answer-panel">
              <p class="question-count">
                {tDynamic("learn_type1_letter_check", {
                  current: questionIndex + 1,
                  total: TYPE1_QUESTIONS.length,
                })}
              </p>
              <div
                class="letter-answers"
                aria-label={tDynamic("learn_type1_choose_letter_aria")}
              >
                {#each activeQuestion.choices as letter}
                  <button
                    type="button"
                    class:selected={selectedAnswer === letter}
                    class:correct={answerState !== null &&
                      letter === activeQuestion.answer}
                    class:wrong={answerState === "wrong" &&
                      selectedAnswer === letter}
                    disabled={answerState === "correct"}
                    onclick={() => answerQuestion(letter)}
                  >
                    {letter}
                  </button>
                {/each}
              </div>

              {#if answerState === "wrong" && selectedAnswerData}
                <div class="feedback wrong-feedback" role="status">
                  <i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i>
                  <p>
                    {tDynamic("learn_type1_wrong_feedback", {
                      letter: selectedAnswerData.letter,
                      pattern: patternLabel(selectedAnswerData.pattern),
                      family: familyLabel(selectedAnswerData.placementFamily),
                      targetPattern: patternLabel(answerLetter.pattern),
                      targetFamily: familyLabel(answerLetter.placementFamily),
                    })}
                  </p>
                </div>
              {:else if answerState === "correct"}
                <div class="feedback correct-feedback" role="status">
                  <i class="fa-solid fa-check" aria-hidden="true"></i>
                  <p>
                    {tDynamic("learn_type1_correct_feedback", {
                      letter: answerLetter.letter,
                      pattern: patternLabel(answerLetter.pattern),
                      family: familyLabel(answerLetter.placementFamily),
                    })}
                  </p>
                </div>
              {:else}
                <div class="feedback feedback-placeholder" aria-hidden="true">
                </div>
              {/if}
            </div>
          </section>
        {:else}
          <section class="summary" aria-label={title}>
            <div class="pattern-map">
              <div class="map-heading">
                {tDynamic("learn_type1_pattern_heading")}
              </div>
              <div class="map-heading">Alpha</div>
              <div class="map-heading">Beta</div>
              {#each [{ pattern: "pro-pro", alpha: "A", beta: "G" }, { pattern: "anti-anti", alpha: "B", beta: "H" }, { pattern: "hybrid", alpha: "C", beta: "I" }] as row}
                <div class="pattern-name">
                  {patternLabel(
                    row.pattern as keyof typeof TYPE1_PATTERN_LABELS
                  )}
                </div>
                <div class="mapped-letter">{row.alpha}</div>
                <div class="mapped-letter">{row.beta}</div>
              {/each}
            </div>
          </section>
        {/if}
      </Crossfade>
    {/snippet}

    {#snippet controls()}
      <LessonStageControls
        progressAppearance="steps"
        label={actionLabel}
        currentStep={phase}
        totalSteps={PHASE_COUNT}
        onAction={handlePrimaryAction}
        onPrevious={handleBack}
        previousDisabled={phase === 1}
        actionIcon={isLast ? "check" : "arrow"}
        {actionDisabled}
        {curriculumLabel}
      />
    {/snippet}
  </LessonStageFrame>
</div>

<style>
  .type1-experience {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    width: 100%;
    min-height: 100%;
    color: var(--theme-text);
    outline: none;
    container-type: inline-size;
  }

  .type1-experience :global(.lesson-stage-frame) {
    --lesson-workshop-max: 80rem;
    --lesson-controls-max: 64rem;
  }

  .explore-grid {
    display: grid;
    grid-template-columns: minmax(20rem, 0.95fr) minmax(22rem, 1.05fr);
    align-items: center;
    gap: clamp(2rem, 5vw, 5rem);
    width: 100%;
  }

  .copy-column {
    display: grid;
    align-content: center;
    gap: 1.15rem;
    min-width: 0;
  }

  .letter-groups {
    display: grid;
    gap: 0.65rem;
  }

  .letter-family {
    display: grid;
    grid-template-columns: 7.2rem 1fr;
    align-items: center;
    gap: 0.65rem;
  }

  .family-label {
    display: grid;
    gap: 0.15rem;
    color: var(--theme-text);
    font-size: 0.82rem;
    font-weight: 800;
  }

  .family-label small {
    color: var(--theme-text-dim);
    font-size: 0.68rem;
    letter-spacing: 0.08em;
  }

  .letter-row,
  .letter-answers {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .letter-row button {
    display: grid;
    place-items: center;
    gap: 0.1rem;
    min-height: 4rem;
    padding: 0.55rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.8rem;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font: inherit;
    cursor: pointer;
  }

  .letter-row button strong {
    font-size: 1.2rem;
  }

  .letter-row button small {
    color: var(--theme-text-dim);
    font-size: 0.66rem;
  }

  .letter-row button:hover,
  .letter-row button.active {
    border-color: var(--type-one);
    background:
      linear-gradient(var(--theme-card-bg), var(--theme-card-bg)) padding-box,
      linear-gradient(90deg, var(--type-one), var(--type-one-pair)) border-box;
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--type-one) 50%, transparent);
  }

  .current-reading {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 0.9rem;
    padding: 0.9rem 1rem;
    border: 1px solid color-mix(in srgb, var(--type-one) 45%, var(--theme-stroke));
    border-radius: 0.9rem;
    background: color-mix(in srgb, var(--type-one) 10%, var(--theme-card-bg));
  }

  .big-letter {
    display: grid;
    place-items: center;
    width: 3rem;
    aspect-ratio: 1;
    border-radius: 0.7rem;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--type-one) 28%, var(--theme-panel-bg)),
      color-mix(in srgb, var(--type-one-pair) 28%, var(--theme-panel-bg))
    );
    color: var(--theme-text);
    font-size: 1.55rem;
    font-weight: 900;
  }

  .current-reading strong {
    color: var(--theme-text);
  }

  .current-reading p {
    margin: 0.2rem 0 0;
    color: var(--theme-text-dim);
    font-size: 0.86rem;
  }

  button:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--type-one) 72%, white);
    outline-offset: 3px;
  }

  .visual-column {
    display: grid;
    justify-items: center;
    gap: 0.65rem;
    min-width: 0;
  }

  .visual-column > p {
    max-width: 48ch;
    margin: 0;
    color: var(--theme-text-dim);
    font-size: 0.8rem;
    line-height: 1.45;
    text-align: center;
  }

  .type-stripe {
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: min(20rem, 70%);
    height: 0.32rem;
    overflow: hidden;
    border-radius: 999px;
  }

  .type-stripe span:first-child {
    background: var(--type-one);
  }

  .type-stripe span:last-child {
    background: var(--type-one-pair);
  }

  .challenge-grid {
    display: grid;
    grid-template-columns: minmax(18rem, 1fr) minmax(18rem, 0.85fr);
    align-items: center;
    gap: clamp(1.5rem, 4vw, 4rem);
    width: 100%;
  }

  .answer-panel {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }

  .question-count {
    margin: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .letter-answers button {
    min-height: 5rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.9rem;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font: inherit;
    font-size: 1.45rem;
    font-weight: 900;
    cursor: pointer;
  }

  .letter-answers button:hover:not(:disabled),
  .letter-answers button.selected {
    border-color: var(--type-one);
    background: color-mix(in srgb, var(--type-one) 12%, var(--theme-card-bg));
  }

  .letter-answers button.correct {
    border-color: var(--semantic-success);
    box-shadow: 0 0 0 1px var(--semantic-success);
  }

  .letter-answers button.wrong {
    border-color: var(--semantic-error);
    box-shadow: 0 0 0 1px var(--semantic-error);
  }

  .feedback {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: start;
    gap: 0.7rem;
    min-height: 4.8rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.85rem;
    background: var(--theme-card-bg);
  }

  /* The feedback slot keeps its height before an answer, so the answer
     buttons do not jump when the feedback appears. */
  .feedback-placeholder {
    border-color: transparent;
    background: none;
  }

  .feedback p {
    margin: 0;
    color: var(--theme-text-dim);
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .wrong-feedback i {
    color: var(--semantic-warning, #f0b429);
  }

  .correct-feedback i {
    color: var(--semantic-success);
  }

  .summary {
    display: grid;
    justify-items: center;
    width: 100%;
  }

  .pattern-map {
    display: grid;
    grid-template-columns: minmax(9rem, 1.4fr) repeat(2, minmax(5rem, 1fr));
    width: min(100%, 38rem);
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: 1rem;
    background: var(--theme-card-bg);
  }

  .pattern-map > div {
    display: grid;
    place-items: center;
    min-height: 3.7rem;
    padding: 0.7rem;
    border-right: 1px solid var(--theme-stroke);
    border-bottom: 1px solid var(--theme-stroke);
  }

  .pattern-map > div:nth-child(3n) {
    border-right: 0;
  }

  .pattern-map > div:nth-last-child(-n + 3) {
    border-bottom: 0;
  }

  .map-heading {
    color: var(--theme-text-dim);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .pattern-name {
    justify-items: start !important;
    color: var(--theme-text);
    font-size: 0.88rem;
    font-weight: 750;
  }

  .mapped-letter {
    color: var(--theme-text);
    font-size: 1.35rem;
    font-weight: 900;
  }

  @container (max-width: 760px) {
    .explore-grid,
    .challenge-grid {
      grid-template-columns: 1fr;
    }

    .visual-column {
      order: -1;
    }
  }

  @container (max-width: 480px) {
    .letter-family {
      grid-template-columns: 1fr;
    }

    .family-label {
      grid-template-columns: auto 1fr;
      align-items: baseline;
    }
  }

  @media (max-height: 560px) and (min-width: 700px) {
    .explore-grid,
    .challenge-grid {
      align-items: start;
    }

    .copy-column {
      gap: 0.6rem;
    }

    .visual-column > p {
      font-size: 0.78rem;
    }

    .letter-row button {
      min-height: 3.2rem;
    }

    .current-reading {
      padding: 0.6rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
  }
</style>
