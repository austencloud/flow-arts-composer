<!--
  Rotation Direction on the shared lesson shell: pick pro or anti and compare
  the real pictographs, answer three direction checks (Next waits for the
  right answer), then the two relationships side by side.
-->
<script lang="ts">
  import { lessonQuestion } from "../letters/type1/lesson-question.js";
  import { onMount } from "svelte";
  import { t, tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { getCodexLetterMappingRepo } from "#lib/features/learn/codex/get-codex-letter-mapping-repo.js";
  import {
    Letter as TkaLetter,
    type Letter,
  } from "#lib/shared/foundation/domain/models/letter.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import { letterQueryHandler } from "#lib/shared/pictograph/tka-glyph/services/letter-query-handler.js";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import type { ExperienceViewMode } from "../../../domain/types";
  import { getExperiencePersistence } from "../../../state/experience-persistence.svelte";
  import LessonStageControls from "../LessonStageControls.svelte";
  import LessonStageFrame from "../LessonStageFrame.svelte";
  import LessonStageHeading from "../LessonStageHeading.svelte";
  import {
    ROTATION_DIRECTION_LESSON,
    ROTATION_DIRECTION_QUESTIONS,
    type RotationRelationship,
  } from "../shared/canonical-lesson-content";
  import LessonPictographStage from "../shared/LessonPictographStage.svelte";

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
  const persistence = getExperiencePersistence("rotation-direction");
  const saved = persistence.load();
  const curriculumLabel = $derived(tDynamic("learn_ui_level_one"));

  let phase = $state(Math.min(PHASE_COUNT, Math.max(1, saved.step || 1)));
  let selectedRelationship = $state<RotationRelationship>(
    persistence.getPhaseData<RotationRelationship>(
      "selectedRelationship",
      "pro"
    )
  );
  let questionIndex = $state(
    Math.min(
      ROTATION_DIRECTION_QUESTIONS.length - 1,
      persistence.getPhaseData<number>("questionIndex", 0)
    )
  );
  let selectedAnswer = $state<RotationRelationship | null>(null);
  let answerState = $state<"correct" | "wrong" | null>(null);
  let pictographs = $state<Partial<Record<Letter, PictographData>>>({});
  let loading = $state(true);

  const activeRelationship = $derived(
    ROTATION_DIRECTION_LESSON.find(
      (item) => item.id === selectedRelationship
    ) ?? ROTATION_DIRECTION_LESSON[0]
  );
  const activeQuestion = $derived(
    lessonQuestion(ROTATION_DIRECTION_QUESTIONS, questionIndex)
  );
  const questionRelationship = $derived(
    ROTATION_DIRECTION_LESSON.find(
      (item) => item.id === activeQuestion.answer
    ) ?? ROTATION_DIRECTION_LESSON[0]
  );
  const feedbackRelationship = $derived(
    ROTATION_DIRECTION_LESSON.find((item) => item.id === selectedAnswer) ?? null
  );
  const isLast = $derived(phase === PHASE_COUNT);
  const lastQuestion = $derived(
    questionIndex === ROTATION_DIRECTION_QUESTIONS.length - 1
  );
  /** The quiz step waits for the right answer before Next opens. */
  const actionDisabled = $derived(phase === 2 && answerState !== "correct");
  const headingKey = $derived(phase === 2 ? `2-${questionIndex}` : phase);
  const title = $derived(
    phase === 1
      ? tDynamic("learn_rotation_title")
      : phase === 2
        ? tDynamic(`learn_rotation_question_${questionIndex + 1}`)
        : tDynamic("learn_rotation_summary_title")
  );
  const description = $derived(
    phase === 1
      ? tDynamic("learn_rotation_intro")
      : phase === 2
        ? tDynamic("learn_rotation_check_hint")
        : tDynamic("learn_rotation_summary")
  );
  const actionLabel = $derived(
    phase === 1
      ? tDynamic("learn_rotation_try_check")
      : phase === 2
        ? lastQuestion
          ? tDynamic("learn_rotation_see_relationship")
          : tDynamic("learn_rotation_next_pictograph")
        : tDynamic("learn_rotation_complete")
  );

  function relationshipText(
    id: RotationRelationship,
    field: "cue" | "meaning" | "orientation"
  ): string {
    return tDynamic(`learn_rotation_${id}_${field}`);
  }

  onMount(async () => {
    loading = true;
    getCodexLetterMappingRepo();
    const letters = [TkaLetter.A, TkaLetter.B] as const;
    const results = await Promise.all(
      letters.map(async (letter) => ({
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

  function chooseRelationship(relationship: RotationRelationship) {
    selectedRelationship = relationship;
    persistence.savePhaseData("selectedRelationship", relationship);
    haptic?.trigger("selection");
  }

  function goToPhase(nextPhase: number) {
    phase = Math.min(PHASE_COUNT, Math.max(1, nextPhase));
    persistence.saveStep(phase);
    selectedAnswer = null;
    answerState = null;
    haptic?.trigger("selection");
  }

  function answerQuestion(answer: RotationRelationship) {
    selectedAnswer = answer;
    answerState = answer === activeQuestion.answer ? "correct" : "wrong";
    haptic?.trigger(answerState === "correct" ? "success" : "warning");
  }

  function nextQuestion() {
    if (questionIndex < ROTATION_DIRECTION_QUESTIONS.length - 1) {
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
  class="rotation-experience"
  class:review-mode={viewMode === "scroll"}
  onkeydown={handleKeydown}
  tabindex="0"
  role="application"
  aria-label={t("learn_ui_named_lesson_keyboard", {
    title: tDynamic("learn_concept_rotation_direction_name"),
  })}
>
  <LessonStageFrame artifactLayout="workshop">
    {#snippet heading()}
      <LessonStageHeading
        key={headingKey}
        {title}
        eyebrow={tDynamic("learn_concept_rotation_direction_name")}
      >
        <p>{description}</p>
      </LessonStageHeading>
    {/snippet}

    {#snippet artifact()}
      <Crossfade key={phase} duration={DURATION.normal}>
        {#if phase === 1}
          <section class="lesson-grid" aria-label={title}>
            <div class="lesson-copy">
              <div
                class="relationship-picker"
                aria-label={tDynamic("learn_rotation_choose_relationship_aria")}
              >
                {#each ROTATION_DIRECTION_LESSON as item}
                  <button
                    type="button"
                    class="relationship-choice"
                    class:active={selectedRelationship === item.id}
                    aria-pressed={selectedRelationship === item.id}
                    style:--choice-accent={item.accent}
                    onclick={() => chooseRelationship(item.id)}
                  >
                    <span class="choice-name">{item.name}</span>
                    <span class="choice-cue"
                      >{relationshipText(item.id, "cue")}</span
                    >
                  </button>
                {/each}
              </div>

              <div
                class="definition"
                style:--choice-accent={activeRelationship.accent}
              >
                <span
                  class="definition-letter"
                  aria-label={tDynamic("learn_rotation_letter_aria", {
                    letter: activeRelationship.letter,
                  })}
                >
                  {activeRelationship.letter}
                </span>
                <div>
                  <strong
                    >{activeRelationship.name}: {relationshipText(
                      activeRelationship.id,
                      "cue"
                    )}</strong
                  >
                  <p>{relationshipText(activeRelationship.id, "meaning")}</p>
                  <small
                    >{relationshipText(
                      activeRelationship.id,
                      "orientation"
                    )}</small
                  >
                </div>
              </div>
            </div>

            <div class="visual-column">
              <span class="visual-label"
                >{tDynamic("learn_rotation_visual_label")}</span
              >
              <div class="visual-pair">
                {#each ROTATION_DIRECTION_LESSON as item}
                  <article
                    class="visual-option"
                    class:active={selectedRelationship === item.id}
                    style:--choice-accent={item.accent}
                  >
                    <span class="option-label">
                      <strong>{item.letter}</strong>
                      {item.name} · {relationshipText(item.id, "cue")}
                    </span>
                    <LessonPictographStage
                      pictograph={pictographs[item.letter] ?? null}
                      {loading}
                      accent={item.accent}
                    />
                  </article>
                {/each}
              </div>
              <p class="visual-note">
                {tDynamic("learn_rotation_visual_note")}
              </p>
            </div>
          </section>
        {:else if phase === 2}
          <section class="challenge-grid" aria-label={title}>
            <div class="challenge-visual">
              <LessonPictographStage
                pictograph={pictographs[activeQuestion.letter] ?? null}
                {loading}
                accent={questionRelationship.accent}
              />
            </div>

            <div class="answer-panel">
              <p class="question-count">
                {tDynamic("learn_rotation_direction_check", {
                  current: questionIndex + 1,
                  total: ROTATION_DIRECTION_QUESTIONS.length,
                })}
              </p>
              <div
                class="answers"
                aria-label={tDynamic("learn_rotation_choose_answer_aria")}
              >
                {#each ROTATION_DIRECTION_LESSON as item}
                  <button
                    type="button"
                    class="answer-button"
                    class:selected={selectedAnswer === item.id}
                    class:correct={answerState !== null &&
                      item.id === activeQuestion.answer}
                    class:wrong={answerState === "wrong" &&
                      selectedAnswer === item.id}
                    disabled={answerState === "correct"}
                    style:--choice-accent={item.accent}
                    onclick={() => answerQuestion(item.id)}
                  >
                    <span>{item.name}</span>
                    <small>{relationshipText(item.id, "cue")}</small>
                  </button>
                {/each}
              </div>

              {#if answerState === "wrong" && feedbackRelationship}
                <div class="feedback wrong-feedback" role="status">
                  <i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i>
                  <p>
                    {tDynamic("learn_rotation_wrong_feedback", {
                      selected: feedbackRelationship.name,
                      meaning: relationshipText(
                        feedbackRelationship.id,
                        "meaning"
                      ),
                      correct: questionRelationship.name,
                    })}
                  </p>
                </div>
              {:else if answerState === "correct"}
                <div class="feedback correct-feedback" role="status">
                  <i class="fa-solid fa-check" aria-hidden="true"></i>
                  <p>
                    <strong>{questionRelationship.name}.</strong>
                    {relationshipText(questionRelationship.id, "meaning")}
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
            <div class="summary-grid">
              {#each ROTATION_DIRECTION_LESSON as item}
                <article
                  class="summary-card"
                  style:--choice-accent={item.accent}
                >
                  <span class="summary-letter">{item.letter}</span>
                  <div>
                    <h2>{item.name}</h2>
                    <p>{relationshipText(item.id, "meaning")}</p>
                  </div>
                </article>
              {/each}
            </div>

            <aside class="base-rotation-note">
              <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
              <p>{tDynamic("learn_rotation_base_note")}</p>
            </aside>
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
  .rotation-experience {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    width: 100%;
    min-height: 100%;
    color: var(--theme-text);
    outline: none;
    container-type: inline-size;
  }

  .rotation-experience :global(.lesson-stage-frame) {
    --lesson-workshop-max: 78rem;
    --lesson-controls-max: 64rem;
  }

  .lesson-grid {
    display: grid;
    grid-template-columns: minmax(18rem, 0.88fr) minmax(20rem, 1.12fr);
    align-items: center;
    gap: clamp(2rem, 5vw, 5.5rem);
    width: 100%;
  }

  .lesson-copy,
  .visual-column,
  .answer-panel,
  .summary {
    min-width: 0;
  }

  .lesson-copy {
    display: grid;
    align-content: center;
    gap: 1.2rem;
  }

  .relationship-picker {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;
  }

  .relationship-choice,
  .answer-button {
    min-height: 4.5rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.9rem;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .relationship-choice {
    display: grid;
    gap: 0.2rem;
    padding: 0.8rem;
  }

  .relationship-choice:hover,
  .relationship-choice.active {
    border-color: color-mix(in srgb, var(--choice-accent) 75%, white 10%);
    background: color-mix(
      in srgb,
      var(--choice-accent) 14%,
      var(--theme-card-bg)
    );
    box-shadow: 0 0 0 1px
      color-mix(in srgb, var(--choice-accent) 50%, transparent);
  }

  .choice-name {
    font-size: 1rem;
    font-weight: 800;
  }

  .choice-cue {
    color: var(--theme-text-dim);
    font-size: 0.78rem;
    line-height: 1.25;
  }

  .definition {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 0.9rem;
    padding: 1rem;
    border: 1px solid
      color-mix(in srgb, var(--choice-accent) 45%, var(--theme-stroke));
    border-radius: 0.9rem;
    background: color-mix(
      in srgb,
      var(--choice-accent) 10%,
      var(--theme-card-bg)
    );
  }

  .definition-letter,
  .summary-letter {
    display: grid;
    place-items: center;
    width: 3rem;
    aspect-ratio: 1;
    border-radius: 0.75rem;
    background: color-mix(
      in srgb,
      var(--choice-accent) 22%,
      var(--theme-panel-bg)
    );
    color: var(--theme-text);
    font-size: 1.55rem;
    font-weight: 900;
  }

  .definition strong {
    color: var(--theme-text);
    font-size: 1rem;
  }

  .definition p,
  .definition small {
    display: block;
    margin: 0.2rem 0 0;
    color: var(--theme-text-dim);
    font-size: 0.88rem;
    line-height: 1.45;
  }

  .definition small {
    font-size: 0.78rem;
  }

  button:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--theme-accent) 72%, white);
    outline-offset: 3px;
  }

  .visual-column {
    display: grid;
    justify-items: center;
    gap: 0.7rem;
    width: 100%;
  }

  .visual-label {
    color: var(--theme-text-dim);
    font-size: 0.76rem;
    font-weight: 750;
    letter-spacing: 0.08em;
    text-align: center;
    text-transform: uppercase;
  }

  .visual-note {
    max-width: 48ch;
    margin: 0;
    color: var(--theme-text-dim);
    font-size: 0.82rem;
    line-height: 1.45;
    text-align: center;
  }

  .visual-pair {
    display: grid;
    width: 100%;
  }

  .visual-option {
    display: none;
    min-width: 0;
  }

  .visual-option.active {
    display: grid;
    justify-items: center;
    gap: 0.55rem;
  }

  .option-label {
    color: var(--theme-text-dim);
    font-size: 0.78rem;
    line-height: 1.3;
    text-align: center;
  }

  .option-label strong {
    margin-right: 0.25rem;
    color: var(--choice-accent);
    font-size: 1rem;
  }

  .challenge-grid {
    display: grid;
    grid-template-columns: minmax(18rem, 1fr) minmax(18rem, 0.9fr);
    align-items: center;
    gap: clamp(1.5rem, 4vw, 4rem);
    width: 100%;
  }

  .answer-panel {
    display: grid;
    gap: 1rem;
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

  .answers {
    display: grid;
    gap: 0.65rem;
  }

  .answer-button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.85rem 1rem;
  }

  .answer-button span {
    font-weight: 850;
  }

  .answer-button small {
    color: var(--theme-text-dim);
  }

  .answer-button:hover:not(:disabled),
  .answer-button.selected {
    border-color: var(--choice-accent);
    background: color-mix(
      in srgb,
      var(--choice-accent) 12%,
      var(--theme-card-bg)
    );
  }

  .answer-button.correct {
    border-color: var(--semantic-success);
    box-shadow: 0 0 0 1px var(--semantic-success);
  }

  .answer-button.wrong {
    border-color: var(--semantic-error);
    box-shadow: 0 0 0 1px var(--semantic-error);
  }

  .feedback,
  .base-rotation-note {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: start;
    gap: 0.7rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.85rem;
    background: var(--theme-card-bg);
  }

  .feedback {
    min-height: 4.6rem;
  }

  /* The feedback slot keeps its height before an answer, so the answer
     buttons do not jump when the feedback appears. */
  .feedback-placeholder {
    border-color: transparent;
    background: none;
  }

  .feedback p,
  .base-rotation-note p {
    margin: 0;
    color: var(--theme-text-dim);
    font-size: 0.9rem;
    line-height: 1.45;
  }

  .feedback strong {
    color: var(--theme-text);
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
    gap: 1.25rem;
    width: 100%;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.8rem;
    width: 100%;
    max-width: 50rem;
  }

  .summary-card {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: start;
    gap: 0.9rem;
    padding: 1.1rem;
    border: 1px solid
      color-mix(in srgb, var(--choice-accent) 45%, var(--theme-stroke));
    border-radius: 1rem;
    background: color-mix(
      in srgb,
      var(--choice-accent) 9%,
      var(--theme-card-bg)
    );
    text-align: left;
  }

  .summary-card h2 {
    margin: 0;
    color: var(--theme-text);
    font-size: 1.05rem;
  }

  .summary-card p {
    margin: 0.35rem 0 0;
    color: var(--theme-text-dim);
    font-size: 0.84rem;
    line-height: 1.45;
  }

  .base-rotation-note {
    width: min(100%, 50rem);
    text-align: left;
  }

  .base-rotation-note i {
    margin-top: 0.15rem;
    color: var(--theme-accent);
  }

  @container (max-width: 760px) {
    .lesson-grid,
    .challenge-grid {
      grid-template-columns: 1fr;
    }

    .lesson-grid {
      gap: 1.5rem;
    }
  }

  @container (min-width: 1680px) {
    .lesson-grid {
      grid-template-columns: minmax(28rem, 0.72fr) minmax(40rem, 1.28fr);
      gap: clamp(4rem, 7vw, 9rem);
    }

    .visual-pair {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: clamp(1.25rem, 2vw, 2.5rem);
    }

    .visual-option,
    .visual-option.active {
      display: grid;
      justify-items: center;
      gap: 0.55rem;
    }

    .visual-option:not(.active) {
      opacity: 0.72;
    }
  }

  @container (max-width: 480px) {
    .relationship-picker,
    .summary-grid {
      grid-template-columns: 1fr;
    }

    .relationship-choice,
    .answer-button {
      min-height: 3.5rem;
    }
  }

  @media (max-height: 560px) and (min-width: 700px) {
    .lesson-grid,
    .challenge-grid {
      align-items: start;
    }

    .lesson-copy {
      gap: 0.65rem;
    }

    .visual-note {
      font-size: 0.8rem;
    }

    .relationship-choice {
      min-height: 3.5rem;
      padding: 0.55rem 0.7rem;
    }

    .definition {
      padding: 0.65rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .relationship-choice,
    .answer-button {
      transition: none;
    }
  }
</style>
