<script lang="ts">
  import { onMount } from "svelte";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { getCodexLetterMappingRepo } from "$lib/features/learn/codex/get-codex-letter-mapping-repo";
  import type { Letter } from "$lib/shared/foundation/domain/models/letter";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import { letterQueryHandler } from "$lib/shared/pictograph/tka-glyph/services/letter-query-handler";
  import type { ExperienceViewMode } from "../../../../domain/types";
  import { getExperiencePersistence } from "../../../../state/experience-persistence.svelte";
  import ExperienceProgressIndicator from "../../ExperienceProgressIndicator.svelte";
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

  const haptic = getHapticFeedback();
  const persistence = getExperiencePersistence("type1-abc-ghi");
  const saved = persistence.load();

  let phase = $state(Math.min(3, Math.max(1, saved.step || 1)));
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
  const activeQuestion = $derived(TYPE1_QUESTIONS[questionIndex]);
  const answerLetter = $derived(
    TYPE1_LESSON_LETTERS.find(
      (item) => item.letter === activeQuestion.answer
    ) ?? TYPE1_LESSON_LETTERS[0]
  );
  const selectedAnswerData = $derived(
    TYPE1_LESSON_LETTERS.find((item) => item.letter === selectedAnswer) ?? null
  );

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
        .filter(
          (result): result is { letter: Letter; pictograph: PictographData } =>
            Boolean(result.pictograph)
        )
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
    phase = Math.min(3, Math.max(1, nextPhase));
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

  export function handleBack() {
    if (phase > 1) {
      goToPhase(phase - 1);
      return;
    }
    onBack?.();
  }
</script>

<div
  class="experience"
  class:review-mode={viewMode === "scroll"}
  style:--type-one={TYPE1_ACCENTS[0]}
  style:--type-one-pair={TYPE1_ACCENTS[1]}
>
  {#if phase === 1}
    <section class="explore-grid" aria-labelledby="type1-title">
      <div class="copy-column">
        <p class="eyebrow">Type 1 letters</p>
        <h1 id="type1-title">Same path family. Different spins.</h1>
        <p class="lede">
          A, B, and C stay in the alpha placement family. G, H, and I repeat
          those same spin patterns in beta. Select any letter to compare the
          real pictographs.
        </p>

        <div class="letter-groups">
          <div class="letter-family">
            <div class="family-label">
              <span>Alpha family</span>
              <small>A · B · C</small>
            </div>
            <div class="letter-row" aria-label="Alpha-family Type 1 letters">
              {#each TYPE1_LESSON_LETTERS.filter((item) => item.placementFamily === "alpha") as item}
                <button
                  type="button"
                  class:active={selectedLetter === item.letter}
                  aria-pressed={selectedLetter === item.letter}
                  onclick={() => chooseLetter(item.letter)}
                >
                  <strong>{item.letter}</strong>
                  <small>{TYPE1_PATTERN_LABELS[item.pattern]}</small>
                </button>
              {/each}
            </div>
          </div>

          <div class="letter-family">
            <div class="family-label">
              <span>Beta family</span>
              <small>G · H · I</small>
            </div>
            <div class="letter-row" aria-label="Beta-family Type 1 letters">
              {#each TYPE1_LESSON_LETTERS.filter((item) => item.placementFamily === "beta") as item}
                <button
                  type="button"
                  class:active={selectedLetter === item.letter}
                  aria-pressed={selectedLetter === item.letter}
                  onclick={() => chooseLetter(item.letter)}
                >
                  <strong>{item.letter}</strong>
                  <small>{TYPE1_PATTERN_LABELS[item.pattern]}</small>
                </button>
              {/each}
            </div>
          </div>
        </div>

        <div class="current-reading">
          <span class="big-letter">{activeLetter.letter}</span>
          <div>
            <strong>{TYPE1_PATTERN_LABELS[activeLetter.pattern]}</strong>
            <p>
              Both hands shift within the {activeLetter.placementFamily} family.
            </p>
          </div>
        </div>

        <button
          class="primary-action"
          type="button"
          onclick={() => goToPhase(2)}
        >
          Check the pattern
          <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
        </button>
      </div>

      <div class="visual-column">
        <div class="type-stripe" aria-label="Canonical Type 1 colors">
          <span></span><span></span>
        </div>
        <LessonPictographStage
          pictograph={pictographs[activeLetter.letter] ?? null}
          {loading}
          accent={activeLetter.pattern === "anti-anti"
            ? TYPE1_ACCENTS[1]
            : TYPE1_ACCENTS[0]}
        />
        <p>
          The arrows are the source of truth. The labels describe what the
          canonical pictograph is already showing.
        </p>
      </div>
    </section>
  {:else if phase === 2}
    <section class="challenge" aria-labelledby="type1-check-title">
      <div class="challenge-header">
        <p class="eyebrow">
          Letter check · {questionIndex + 1} of {TYPE1_QUESTIONS.length}
        </p>
        <h1 id="type1-check-title">{activeQuestion.prompt}</h1>
        <p>
          Choose a letter. Its real pictograph appears as soon as you answer.
        </p>
      </div>

      <div class="challenge-grid">
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
          <div class="letter-answers" aria-label="Choose a letter">
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
                <strong>{selectedAnswerData.letter}</strong> is
                {TYPE1_PATTERN_LABELS[selectedAnswerData.pattern].toLowerCase()} in
                {selectedAnswerData.placementFamily}. Look for
                <strong
                  >{TYPE1_PATTERN_LABELS[
                    answerLetter.pattern
                  ].toLowerCase()}</strong
                >
                in {answerLetter.placementFamily}.
              </p>
            </div>
          {:else if answerState === "correct"}
            <div class="feedback correct-feedback" role="status">
              <i class="fa-solid fa-check" aria-hidden="true"></i>
              <p>
                <strong>{answerLetter.letter}</strong> is
                {TYPE1_PATTERN_LABELS[answerLetter.pattern].toLowerCase()} in
                {answerLetter.placementFamily}.
              </p>
            </div>
          {/if}

          <button
            class="primary-action"
            type="button"
            disabled={answerState !== "correct"}
            onclick={nextQuestion}
          >
            {questionIndex === TYPE1_QUESTIONS.length - 1
              ? "See the letter map"
              : "Next pattern"}
            <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </section>
  {:else}
    <section class="summary" aria-labelledby="type1-summary-title">
      <p class="eyebrow">Letter map</p>
      <h1 id="type1-summary-title">Three patterns, two placement families</h1>
      <p class="summary-lede">
        The A/B/C pattern repeats as G/H/I. The placement family changes; the
        pairing of pro and anti stays recognizable.
      </p>

      <div class="pattern-map">
        <div class="map-heading">Pattern</div>
        <div class="map-heading">Alpha</div>
        <div class="map-heading">Beta</div>
        {#each [{ pattern: "pro-pro", alpha: "A", beta: "G" }, { pattern: "anti-anti", alpha: "B", beta: "H" }, { pattern: "hybrid", alpha: "C", beta: "I" }] as row}
          <div class="pattern-name">
            {TYPE1_PATTERN_LABELS[
              row.pattern as keyof typeof TYPE1_PATTERN_LABELS
            ]}
          </div>
          <div class="mapped-letter">{row.alpha}</div>
          <div class="mapped-letter">{row.beta}</div>
        {/each}
      </div>

      <button
        class="primary-action complete-action"
        type="button"
        onclick={complete}
      >
        Complete these letters
        <i class="fa-solid fa-check" aria-hidden="true"></i>
      </button>
    </section>
  {/if}

  <ExperienceProgressIndicator currentStep={phase} totalSteps={3} />
</div>

<style>
  .experience {
    --lesson-max: 80rem;
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

  .explore-grid,
  .challenge,
  .summary {
    width: min(100%, var(--lesson-max));
    margin: auto;
  }

  .explore-grid {
    display: grid;
    grid-template-columns: minmax(20rem, 0.95fr) minmax(22rem, 1.05fr);
    align-items: center;
    gap: clamp(2rem, 5vw, 5rem);
  }

  .copy-column {
    display: grid;
    align-content: center;
    gap: 1.15rem;
    min-width: 0;
  }

  .eyebrow {
    margin: 0;
    background: linear-gradient(90deg, var(--type-one), var(--type-one-pair));
    background-clip: text;
    color: transparent;
    font-size: clamp(0.72rem, 0.8vw, 0.9rem);
    font-weight: 850;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  h1 {
    max-width: 18ch;
    margin: 0;
    color: var(--theme-text);
    font-size: clamp(2rem, 4.1cqw, 4.4rem);
    font-weight: 850;
    letter-spacing: -0.045em;
    line-height: 0.98;
    text-wrap: balance;
  }

  .lede,
  .summary-lede,
  .challenge-header > p:last-child {
    max-width: 58ch;
    margin: 0;
    color: var(--theme-text-dim);
    font-size: clamp(1rem, 1.35cqw, 1.16rem);
    line-height: 1.55;
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
    box-shadow: inset 0 -3px 0 var(--type-one);
  }

  .current-reading {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 0.9rem;
    padding: 0.9rem 1rem;
    border-left: 4px solid var(--type-one);
    border-radius: 0 0.9rem 0.9rem 0;
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

  .primary-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    justify-self: start;
    gap: 0.65rem;
    min-height: 3.2rem;
    padding: 0.75rem 1.2rem;
    border: 1px solid color-mix(in srgb, var(--type-one) 70%, white 14%);
    border-radius: 0.85rem;
    background: var(--type-one);
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

  .challenge {
    display: grid;
    align-content: center;
    gap: clamp(1.3rem, 3vw, 2.4rem);
  }

  .challenge-header {
    display: grid;
    justify-items: center;
    gap: 0.55rem;
    text-align: center;
  }

  .challenge-header h1 {
    max-width: 22ch;
    font-size: clamp(1.8rem, 3.5cqw, 3.4rem);
  }

  .challenge-grid {
    display: grid;
    grid-template-columns: minmax(18rem, 1fr) minmax(18rem, 0.85fr);
    align-items: center;
    gap: clamp(1.5rem, 4vw, 4rem);
  }

  .answer-panel {
    display: grid;
    gap: 1rem;
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
    box-shadow: inset 0 -4px 0 var(--semantic-success);
  }

  .letter-answers button.wrong {
    border-color: var(--semantic-error);
    box-shadow: inset 0 -4px 0 var(--semantic-error);
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

  .feedback p {
    margin: 0;
    color: var(--theme-text-dim);
    font-size: 0.9rem;
    line-height: 1.5;
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

  .complete-action {
    justify-self: center;
  }

  :global(.experience > .progress-indicator) {
    justify-self: center;
  }

  @container (max-width: 760px) {
    .explore-grid,
    .challenge-grid {
      grid-template-columns: 1fr;
    }

    .visual-column {
      order: -1;
    }

    h1 {
      font-size: clamp(2rem, 10cqw, 3.4rem);
    }
  }

  @container (max-width: 480px) {
    .experience {
      padding: 4rem 0.75rem 0.75rem;
    }

    .letter-family {
      grid-template-columns: 1fr;
    }

    .family-label {
      grid-template-columns: auto 1fr;
      align-items: baseline;
    }
  }

  @media (max-height: 560px) and (min-width: 700px) {
    .experience {
      padding-top: 3.9rem;
    }

    .explore-grid,
    .challenge-grid {
      align-items: start;
    }

    .copy-column {
      gap: 0.6rem;
    }

    h1 {
      font-size: clamp(1.7rem, 4cqw, 2.6rem);
    }

    .lede,
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
    .primary-action,
    button {
      transition: none;
    }
  }
</style>
