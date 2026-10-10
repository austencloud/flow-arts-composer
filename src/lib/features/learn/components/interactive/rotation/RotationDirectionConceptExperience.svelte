<script lang="ts">
  import { onMount } from "svelte";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { getCodexLetterMappingRepo } from "#lib/features/learn/codex/get-codex-letter-mapping-repo.js";
  import {
    Letter as TkaLetter,
    type Letter,
  } from "#lib/shared/foundation/domain/models/letter.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import { letterQueryHandler } from "#lib/shared/pictograph/tka-glyph/services/letter-query-handler.js";
  import type { ExperienceViewMode } from "../../../domain/types";
  import { getExperiencePersistence } from "../../../state/experience-persistence.svelte";
  import ExperienceProgressIndicator from "../ExperienceProgressIndicator.svelte";
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

  const haptic = getHapticFeedback();
  const persistence = getExperiencePersistence("rotation-direction");
  const saved = persistence.load();

  let phase = $state(Math.min(3, Math.max(1, saved.step || 1)));
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
  const activeQuestion = $derived(ROTATION_DIRECTION_QUESTIONS[questionIndex]);
  const questionRelationship = $derived(
    ROTATION_DIRECTION_LESSON.find(
      (item) => item.id === activeQuestion.answer
    ) ?? ROTATION_DIRECTION_LESSON[0]
  );
  const feedbackRelationship = $derived(
    ROTATION_DIRECTION_LESSON.find((item) => item.id === selectedAnswer) ?? null
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
        .filter(
          (result): result is { letter: Letter; pictograph: PictographData } =>
            Boolean(result.pictograph)
        )
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
    phase = Math.min(3, Math.max(1, nextPhase));
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

  export function handleBack() {
    if (phase > 1) {
      goToPhase(phase - 1);
      return;
    }
    onBack?.();
  }
</script>

<div class="experience" class:review-mode={viewMode === "scroll"}>
  {#if phase === 1}
    <section class="lesson-grid" aria-labelledby="rotation-title">
      <div class="lesson-copy">
        <p class="eyebrow">{tDynamic("learn_rotation_eyebrow")}</p>
        <h1 id="rotation-title">{tDynamic("learn_rotation_title")}</h1>
        <p class="lede">{tDynamic("learn_rotation_intro")}</p>

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
              <span class="choice-cue">{relationshipText(item.id, "cue")}</span>
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
              >{relationshipText(activeRelationship.id, "orientation")}</small
            >
          </div>
        </div>

        <button
          class="primary-action"
          type="button"
          onclick={() => goToPhase(2)}
        >
          {tDynamic("learn_rotation_try_check")}
          <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
        </button>
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
        <p class="visual-note">{tDynamic("learn_rotation_visual_note")}</p>
      </div>
    </section>
  {:else if phase === 2}
    <section class="challenge" aria-labelledby="rotation-check-title">
      <div class="challenge-header">
        <p class="eyebrow">
          {tDynamic("learn_rotation_direction_check", {
            current: questionIndex + 1,
            total: ROTATION_DIRECTION_QUESTIONS.length,
          })}
        </p>
        <h1 id="rotation-check-title">
          {tDynamic(`learn_rotation_question_${questionIndex + 1}`)}
        </h1>
        <p>{tDynamic("learn_rotation_check_hint")}</p>
      </div>

      <div class="challenge-grid">
        <div class="challenge-visual">
          <LessonPictographStage
            pictograph={pictographs[activeQuestion.letter] ?? null}
            {loading}
            accent={questionRelationship.accent}
          />
        </div>

        <div class="answer-panel">
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
                  meaning: relationshipText(feedbackRelationship.id, "meaning"),
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
          {/if}

          <button
            class="primary-action"
            type="button"
            disabled={answerState !== "correct"}
            onclick={nextQuestion}
          >
            {questionIndex === ROTATION_DIRECTION_QUESTIONS.length - 1
              ? tDynamic("learn_rotation_see_relationship")
              : tDynamic("learn_rotation_next_pictograph")}
            <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </section>
  {:else}
    <section class="summary" aria-labelledby="rotation-summary-title">
      <p class="eyebrow">{tDynamic("learn_rotation_found")}</p>
      <h1 id="rotation-summary-title">
        {tDynamic("learn_rotation_summary_title")}
      </h1>
      <p class="summary-lede">{tDynamic("learn_rotation_summary")}</p>

      <div class="summary-grid">
        {#each ROTATION_DIRECTION_LESSON as item}
          <article class="summary-card" style:--choice-accent={item.accent}>
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

      <button
        class="primary-action complete-action"
        type="button"
        onclick={complete}
      >
        {tDynamic("learn_rotation_complete")}
        <i class="fa-solid fa-check" aria-hidden="true"></i>
      </button>
    </section>
  {/if}

  <ExperienceProgressIndicator currentStep={phase} totalSteps={3} />
</div>

<style>
  .experience {
    --lesson-max: 78rem;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 1rem;
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: 4.75rem clamp(1rem, 3vw, 3rem) 1rem;
    overflow: auto;
    container-type: inline-size;
  }

  .lesson-grid,
  .challenge,
  .summary {
    width: min(100%, var(--lesson-max));
    margin: auto;
  }

  .lesson-grid {
    display: grid;
    grid-template-columns: minmax(18rem, 0.88fr) minmax(20rem, 1.12fr);
    align-items: center;
    gap: clamp(2rem, 5vw, 5.5rem);
  }

  .lesson-copy,
  .visual-column,
  .challenge-header,
  .answer-panel,
  .summary {
    min-width: 0;
  }

  .lesson-copy {
    display: grid;
    align-content: center;
    gap: 1.2rem;
  }

  .eyebrow {
    margin: 0;
    color: var(--theme-accent);
    font-size: clamp(0.72rem, 0.8vw, 0.9rem);
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  h1 {
    max-width: 17ch;
    margin: 0;
    color: var(--theme-text);
    font-size: clamp(2rem, 4.3cqw, 4.6rem);
    font-weight: 850;
    letter-spacing: -0.045em;
    line-height: 0.98;
    text-wrap: balance;
  }

  .lede,
  .challenge-header > p:last-child,
  .summary-lede {
    max-width: 58ch;
    margin: 0;
    color: var(--theme-text-dim);
    font-size: clamp(1rem, 1.45cqw, 1.2rem);
    line-height: 1.55;
  }

  .lede strong,
  .base-rotation-note strong {
    color: var(--theme-text);
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

  .primary-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    justify-self: start;
    gap: 0.65rem;
    min-height: 3.2rem;
    padding: 0.75rem 1.2rem;
    border: 1px solid color-mix(in srgb, var(--theme-accent) 70%, white 14%);
    border-radius: 0.85rem;
    background: var(--theme-accent);
    color: #061013;
    font: inherit;
    font-weight: 850;
    cursor: pointer;
  }

  .primary-action:hover:not(:disabled) {
    filter: brightness(1.12);
    transform: translateY(-1px);
  }

  .primary-action:disabled {
    cursor: not-allowed;
    filter: saturate(0.2);
    opacity: 0.38;
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

  .challenge {
    display: grid;
    align-content: center;
    gap: clamp(1.3rem, 3vw, 2.5rem);
  }

  .challenge-header {
    display: grid;
    justify-items: center;
    gap: 0.55rem;
    text-align: center;
  }

  .challenge-header h1 {
    max-width: 23ch;
    font-size: clamp(1.8rem, 3.6cqw, 3.5rem);
  }

  .challenge-grid {
    display: grid;
    grid-template-columns: minmax(18rem, 1fr) minmax(18rem, 0.9fr);
    align-items: center;
    gap: clamp(1.5rem, 4vw, 4rem);
  }

  .answer-panel {
    display: grid;
    gap: 1rem;
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
    align-content: center;
    justify-items: center;
    gap: 1.25rem;
    text-align: center;
  }

  .summary h1 {
    max-width: 18ch;
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
    color: var(--theme-accent);
    margin-top: 0.15rem;
  }

  .complete-action {
    justify-self: center;
  }

  :global(.experience > .progress-indicator) {
    justify-self: center;
  }

  @container (max-width: 760px) {
    .experience {
      grid-template-rows: auto auto;
      align-content: start;
    }

    .lesson-grid,
    .challenge-grid {
      grid-template-columns: 1fr;
    }

    .lesson-grid {
      gap: 1.5rem;
    }

    h1 {
      font-size: clamp(2rem, 10cqw, 3.4rem);
    }
  }

  @container (min-width: 1680px) {
    .lesson-grid {
      grid-template-columns: minmax(28rem, 0.72fr) minmax(64rem, 1.28fr);
      gap: clamp(4rem, 7vw, 9rem);
      width: min(100%, var(--shell-w));
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
    .experience {
      padding: 4rem 0.75rem 0.75rem;
    }

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
    .experience {
      grid-template-rows: auto auto;
      align-content: start;
      padding-top: 3.9rem;
    }

    .lesson-grid,
    .challenge-grid {
      align-items: start;
    }

    .lesson-copy {
      gap: 0.65rem;
    }

    h1 {
      font-size: clamp(1.7rem, 4cqw, 2.6rem);
    }

    .lede,
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
    .primary-action,
    .relationship-choice,
    .answer-button {
      transition: none;
    }
  }
</style>
