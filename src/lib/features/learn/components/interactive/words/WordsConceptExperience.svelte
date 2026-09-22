<script lang="ts">
  import { onMount } from "svelte";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { loadFoundingCollectionSequences } from "$lib/features/browse/collections/config/founding-collections";
  import {
    TND_ELEMENTS,
    type TnDElement,
  } from "$lib/features/choreo-card/domain/tnd-element";
  import TKAWordGlyph from "$lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";
  import type { ExperienceViewMode } from "../../../domain/types";
  import { getExperiencePersistence } from "../../../state/experience-persistence.svelte";
  import LessonStageControls from "../LessonStageControls.svelte";
  import LearningWordStage from "./LearningWordStage.svelte";
  import {
    getLearningLetterTeachingContent,
    LEARNING_LETTER_TEACHING_CONTENT,
  } from "./learning-letter-teaching-content";
  import {
    LEARNING_LETTERS_CORE_WORDS,
    LEARNING_LETTERS_SCHEMA_VERSION,
    LEARNING_LETTERS_TOTAL_STEPS,
    normalizeLearningLettersProgress,
  } from "./learning-letters-progress";

  type LoadState = "loading" | "ready" | "error";

  interface LearningLettersFamily {
    element: TnDElement;
    sequences: readonly SequenceData[];
  }

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
  const persistence = getExperiencePersistence("words-alpha-beta");
  const recapStepIndex = LEARNING_LETTERS_TOTAL_STEPS - 1;

  let loadState = $state<LoadState>("loading");
  let loadError = $state<string | null>(null);
  let sequences = $state<readonly SequenceData[]>([]);
  let stepIndex = $state(0);
  let shellWidth = $state(0);
  let direction = $state<-1 | 1>(1);

  // TKAWordGlyph receives a pixel height, so only the canonical 1680/2600
  // big-screen seams can increase the rendered glyph size.
  const glyphScale = $derived(
    shellWidth >= 2600 ? 3.25 : shellWidth >= 1680 ? 1.15 : 1
  );

  const coreSequences = $derived(
    LEARNING_LETTERS_CORE_WORDS.flatMap((word) => {
      const match = sequences.find((sequence) => stripWordNotation(sequence.word) === word);
      return match ? [match] : [];
    })
  );
  const coreFamilies = $derived.by((): LearningLettersFamily[] =>
    TND_ELEMENTS.map((element) => ({
      element,
      sequences: coreSequences.filter(
        (sequence) => sequence.metadata["familyId"] === element.familyId
      ),
    })).filter((family) => family.sequences.length > 0)
  );
  const activeCoreIndex = $derived(stepIndex - 1);
  const activeCoreSequence = $derived(coreSequences[activeCoreIndex] ?? null);
  const activeCoreFamily = $derived(
    activeCoreSequence
      ? (coreFamilies.find(
          (family) =>
            family.element.familyId === activeCoreSequence.metadata["familyId"]
        ) ?? null)
      : null
  );
  const activeTeachingContent = $derived(
    activeCoreSequence
      ? getLearningLetterTeachingContent(stripWordNotation(activeCoreSequence.word))
      : null
  );

  const announcement = $derived.by(() => {
    if (stepIndex === 0) return "Learning Letters";
    if (stepIndex === recapStepIndex) return "Six-word recap";
    const sequence = coreSequences[activeCoreIndex];
    return sequence
      ? `Word ${activeCoreIndex + 1} of ${LEARNING_LETTERS_CORE_WORDS.length}: ${displayWord(sequence)}`
      : "";
  });

  function displayWord(sequence: SequenceData): string {
    return simplifyRepeatedWord(sequence.word || sequence.name);
  }

  function saveProgress(): void {
    persistence.saveStep(stepIndex + 1);
    persistence.savePhaseData("schemaVersion", LEARNING_LETTERS_SCHEMA_VERSION);
  }

  async function loadDeck(): Promise<void> {
    loadState = "loading";
    loadError = null;
    try {
      const loaded = await loadFoundingCollectionSequences("founding_tka-1");
      const wordsInDeck = new Set(loaded.map((sequence) => sequence.word));
      const missingCore = LEARNING_LETTERS_CORE_WORDS.filter(
        (word) => !wordsInDeck.has(word)
      );
      const wordsWithTeachingSlots = new Set<string>(
        LEARNING_LETTER_TEACHING_CONTENT.map((content) => content.word)
      );
      const missingTeachingSlots = loaded
        .map((sequence) => sequence.word)
        .filter((word) => !wordsWithTeachingSlots.has(word));
      if (missingCore.length > 0 || missingTeachingSlots.length > 0) {
        const details = [
          missingCore.length > 0 ? `core words: ${missingCore.join(", ")}` : "",
          missingTeachingSlots.length > 0
            ? `teaching slots: ${missingTeachingSlots.join(", ")}`
            : "",
        ].filter(Boolean);
        throw new Error(
          `Learning Letters deck is missing ${details.join("; ")}`
        );
      }

      sequences = loaded;
      const normalized = normalizeLearningLettersProgress(persistence.load());
      stepIndex = normalized.progress.stepIndex;
      if (normalized.migrated) {
        persistence.reset();
        saveProgress();
      }
      loadState = "ready";
    } catch (caught) {
      console.error("Learning Letters deck failed to load", caught);
      loadError = "The Learning Letters deck could not be loaded.";
      loadState = "error";
    }
  }

  onMount(() => {
    void loadDeck();
  });

  function goToStep(next: number): void {
    const clamped = Math.min(recapStepIndex, Math.max(0, next));
    if (clamped === stepIndex) return;
    direction = clamped > stepIndex ? 1 : -1;
    stepIndex = clamped;
    saveProgress();
    haptic?.trigger("selection");
  }

  function complete(): void {
    persistence.reset();
    haptic?.trigger("success");
    onComplete?.();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (viewMode !== "step" || loadState !== "ready") return;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      goToStep(stepIndex + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      handleBack();
    }
  }

  export function handleBack(): void {
    if (stepIndex > 0) {
      goToStep(stepIndex - 1);
      return;
    }
    onBack?.();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="experience"
  class:review-mode={viewMode === "scroll"}
  bind:clientWidth={shellWidth}
  onkeydown={handleKeydown}
  tabindex="0"
  role="application"
  aria-label="Learning Letters lesson, use arrow keys to navigate"
>
  {#if loadState === "loading"}
    <section class="load-state" role="status">
      <ProgressRing percent={-1} size={44} strokeWidth={3} />
      <p>Loading Learning Letters…</p>
    </section>
  {:else if loadState === "error"}
    <section class="load-state" role="alert">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
      <p>{loadError}</p>
      <PanelButton variant="secondary" onclick={loadDeck}>
        <i class="fa-solid fa-arrow-rotate-right" aria-hidden="true"></i>
        <span>Try again</span>
      </PanelButton>
    </section>
  {:else}
    <main class="lesson-shell">
      <div class="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <section
        class="lesson-studio"
        class:intro-layout={stepIndex === 0}
        class:word-layout={stepIndex > 0 && stepIndex < recapStepIndex}
        class:recap-layout={stepIndex === recapStepIndex}
      >
        <div class="lesson-content">
          {#if stepIndex === 0}
            <section
              class="intro-step"
              aria-labelledby="learning-letters-title"
            >
              <div class="intro-copy">
                <p class="chapter-label">TKA 1</p>
                <h1 id="learning-letters-title">Learning Letters</h1>
                <!-- Guide prose, verbatim from AlphaBetaWordsPage.svelte. -->
                <p class="guide-prose">
                  The first words we will learn correspond to VTG’s 1:1 motions.<br
                  />
                  To execute these,
                  <strong
                    ><em>you’ll need to use body turns and/or negative space</em
                    ></strong
                  >.
                </p>
              </div>

              <div
                class="family-preview"
                role="img"
                aria-label={`The six words: ${coreSequences.map(displayWord).join(", ")}`}
              >
                {#each coreFamilies as family (family.element.familyId)}
                  <section
                    class="preview-family"
                    style:--family-accent={family.element.accentColor}
                    aria-label={family.element.name}
                  >
                    <header class="preview-family-heading">
                      <img src={family.element.iconPath} alt="" />
                      <span>{family.element.name}</span>
                    </header>
                    <div class="word-preview">
                      {#each family.sequences as sequence (sequence.id)}
                        <span class="preview-glyph">
                          <TKAWordGlyph
                            word={displayWord(sequence)}
                            height={Math.round(52 * glyphScale)}
                            darkMode
                            fitToParent
                          />
                        </span>
                      {/each}
                    </div>
                  </section>
                {/each}
              </div>
            </section>
          {:else if activeCoreSequence && activeCoreFamily}
            <section
              class="word-step"
              aria-label={`Word ${activeCoreIndex + 1} of ${LEARNING_LETTERS_CORE_WORDS.length}: ${displayWord(activeCoreSequence)}`}
              style:--family-accent={activeCoreFamily.element.accentColor}
            >
              <header class="word-header">
                <Crossfade
                  key={stepIndex}
                  mode="swap"
                  motion="step"
                  {direction}
                >
                  <div class="word-heading-content">
                    <span class="family-identity">
                      <img src={activeCoreFamily.element.iconPath} alt="" />
                      <span>{activeCoreFamily.element.name}</span>
                    </span>
                    <span class="sequence-position">
                      Word {activeCoreIndex + 1} / {LEARNING_LETTERS_CORE_WORDS.length}
                    </span>
                  </div>
                </Crossfade>
              </header>
              <div class="word-stage">
                <LearningWordStage
                  sequence={activeCoreSequence}
                  content={activeTeachingContent}
                />
              </div>
            </section>
          {:else}
            <section
              class="recap-step"
              aria-labelledby="learning-letters-title"
            >
              <header class="recap-header">
                <div>
                  <p class="chapter-label">Lesson recap</p>
                  <h1 id="learning-letters-title">Six words</h1>
                </div>
                <!-- Guide prose, verbatim from AlphaBetaWordsPage.svelte. -->
                <p class="guide-prose practice-prose">
                  <strong
                    >Practice each word once in both directions, then again
                    starting with thumbs out.</strong
                  >
                </p>
              </header>

              <div class="recap-families">
                {#each coreFamilies as family (family.element.familyId)}
                  <section
                    class="recap-family"
                    style:--family-accent={family.element.accentColor}
                    aria-label={family.element.name}
                  >
                    <header class="family-heading">
                      <span class="family-identity">
                        <img src={family.element.iconPath} alt="" />
                        <span>{family.element.name}</span>
                      </span>
                      <span>{family.sequences.length} words</span>
                    </header>
                    <div class="recap-word-grid">
                      {#each family.sequences as sequence (sequence.id)}
                        {@const coreIndex = coreSequences.findIndex(
                          (candidate) => candidate.id === sequence.id
                        )}
                        <button
                          type="button"
                          class="recap-word"
                          aria-label={`Review ${displayWord(sequence)}`}
                          onclick={() => goToStep(coreIndex + 1)}
                        >
                          <TKAWordGlyph
                            word={displayWord(sequence)}
                            height={Math.round(44 * glyphScale)}
                            darkMode
                            fitToParent
                          />
                          <span>Word {coreIndex + 1}</span>
                        </button>
                      {/each}
                    </div>
                  </section>
                {/each}
              </div>
            </section>
          {/if}
        </div>

        <footer class="lesson-transport">
          <LessonStageControls
            label={stepIndex === recapStepIndex ? "Finish lesson" : "Next"}
            currentStep={stepIndex + 1}
            totalSteps={LEARNING_LETTERS_TOTAL_STEPS}
            onAction={stepIndex === recapStepIndex
              ? complete
              : () => goToStep(stepIndex + 1)}
            onPrevious={handleBack}
            previousDisabled={stepIndex <= 0}
            actionIcon={stepIndex === recapStepIndex ? "check" : "arrow"}
          />
        </footer>
      </section>
    </main>
  {/if}
</div>

<style>
  .experience {
    container: learning-letters / inline-size;
    width: 100%;
    height: 100%;
    overflow-y: auto;
    background: transparent;
    color: var(--theme-text, #fff);
    scrollbar-gutter: stable;
    outline: none;
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

  .lesson-shell {
    display: grid;
    place-items: start center;
    width: min(100%, 130rem);
    min-height: 100%;
    margin-inline: auto;
    padding: clamp(4.6rem, 5.5cqw, 6rem) clamp(0.75rem, 2.2cqw, 2.5rem)
      clamp(1rem, 2cqw, 2rem);
  }

  .lesson-studio {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    width: 100%;
    height: min(58rem, calc(100dvh - 10rem));
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-lg, 0.75rem);
    background: color-mix(in srgb, var(--theme-panel-bg) 86%, transparent);
    backdrop-filter: blur(1.5rem) saturate(1.08);
    box-shadow: 0 1.5rem 4rem color-mix(in srgb, black 22%, transparent);
  }

  .lesson-content {
    display: grid;
    min-width: 0;
    min-height: 0;
    overflow: auto;
  }

  .chapter-label {
    margin: 0;
    color: var(--theme-accent);
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 700;
  }

  h1 {
    margin: 0 !important;
    font-size: clamp(2.2rem, 2.4cqw, 3.25rem);
    line-height: 1;
    text-wrap: balance;
  }

  .guide-prose {
    margin: 0;
    color: var(--theme-text-dim);
    font-size: clamp(1rem, 1.3cqw, 1.2rem);
    line-height: 1.55;
  }

  .guide-prose strong,
  .guide-prose em {
    color: var(--theme-text);
  }

  .intro-step,
  .recap-step {
    width: 100%;
    min-height: 100%;
  }

  .intro-step {
    display: grid;
    grid-template-columns: minmax(21rem, 0.82fr) minmax(36rem, 1.18fr);
  }

  .intro-copy {
    display: grid;
    align-content: center;
    gap: clamp(0.9rem, 1.35cqw, 1.4rem);
    padding: clamp(2rem, 4cqw, 4.5rem);
    border-right: 1px solid var(--theme-stroke);
    background: color-mix(in srgb, var(--theme-card-bg) 72%, transparent);
  }

  .intro-copy .guide-prose {
    max-width: 42ch;
  }

  .family-preview {
    display: grid;
    align-content: center;
    gap: clamp(0.75rem, 1.25cqw, 1.25rem);
    padding: clamp(1.5rem, 3cqw, 3.5rem);
  }

  .preview-family {
    display: grid;
    grid-template-columns: minmax(9rem, 12rem) minmax(0, 1fr);
    align-items: center;
    min-width: 0;
    min-height: clamp(9rem, 12cqw, 13rem);
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-md, 0.5rem);
    background: color-mix(
      in srgb,
      var(--family-accent, var(--theme-accent)) 9%,
      var(--theme-card-bg)
    );
  }

  .preview-family-heading {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    align-self: stretch;
    padding: 1rem;
    border-right: 1px solid var(--theme-stroke);
    color: var(--theme-text);
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 700;
  }

  .preview-family-heading img {
    width: 1.5rem;
    height: 1.5rem;
    object-fit: contain;
  }

  .word-preview {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-self: stretch;
    min-width: 0;
  }

  .preview-glyph {
    display: grid;
    place-items: center;
    min-width: 0;
    min-height: 100%;
    padding: clamp(0.75rem, 1.4cqw, 1.5rem);
    overflow: hidden;
  }

  .preview-glyph + .preview-glyph {
    border-left: 1px solid var(--theme-stroke);
  }

  .word-step {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .word-header,
  .family-heading,
  .word-heading-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .word-header {
    min-height: 4rem;
    padding: 0.7rem 1.1rem;
    border-bottom: 1px solid var(--theme-stroke);
    background: color-mix(
      in srgb,
      var(--family-accent, var(--theme-accent)) 12%,
      var(--theme-card-bg)
    );
  }

  .word-heading-content {
    width: 100%;
  }

  .family-identity {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    color: var(--theme-text);
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 700;
  }

  .family-identity img {
    width: 1.25rem;
    height: 1.25rem;
    object-fit: contain;
  }

  .sequence-position {
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 0.875rem);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  .word-stage {
    display: grid;
    min-width: 0;
    min-height: 0;
  }

  .word-stage :global(.learning-word-stage) {
    height: 100%;
  }

  .recap-step {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .recap-header {
    display: grid;
    grid-template-columns: minmax(14rem, 0.65fr) minmax(24rem, 1.35fr);
    align-items: center;
    gap: clamp(1rem, 3cqw, 3rem);
    padding: clamp(1.25rem, 2.2cqw, 2.25rem);
    border-bottom: 1px solid var(--theme-stroke);
    background: color-mix(in srgb, var(--theme-card-bg) 72%, transparent);
  }

  .recap-header > div {
    display: grid;
    gap: 0.45rem;
  }

  .practice-prose {
    max-width: 68ch;
  }

  .recap-families {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: clamp(0.8rem, 1.2cqw, 1.25rem);
    min-height: 0;
    padding: clamp(1rem, 1.8cqw, 2rem);
  }

  .recap-family {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-md, 0.5rem);
    background: color-mix(
      in srgb,
      var(--family-accent, var(--theme-accent)) 6%,
      var(--theme-card-bg)
    );
  }

  .family-heading {
    min-height: 3.25rem;
    padding: 0.6rem 0.8rem;
    border-bottom: 1px solid var(--theme-stroke);
    background: transparent;
  }

  .family-heading > span:last-child {
    color: var(--theme-text-dim);
    font-size: var(--font-size-xs, 0.75rem);
    font-weight: 700;
  }

  .recap-word-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: stretch;
    gap: clamp(0.5rem, 0.8cqw, 0.8rem);
    padding: clamp(0.65rem, 1cqw, 1rem);
  }

  .recap-word {
    display: grid;
    place-items: center;
    align-content: center;
    gap: 0.65rem;
    min-width: 0;
    min-height: clamp(9rem, 13cqw, 15rem);
    padding: 0.75rem;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-md, 0.5rem);
    background: color-mix(in srgb, var(--theme-panel-bg) 72%, transparent);
    color: var(--theme-text-dim);
    font: inherit;
    font-size: var(--font-size-xs, 0.75rem);
    font-weight: 700;
    cursor: pointer;
    transition:
      border-color var(--transition-fast),
      background var(--transition-fast),
      transform var(--transition-fast);
  }

  .recap-word:hover {
    border-color: var(--theme-stroke-strong, var(--theme-accent));
    background: var(--theme-card-hover-bg);
    transform: translateY(-2px);
  }

  .recap-word:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .lesson-transport {
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--theme-stroke);
    background: color-mix(in srgb, var(--theme-card-bg) 82%, transparent);
  }

  .load-state {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 1rem;
    min-height: 100%;
    color: var(--theme-text-dim);
    text-align: center;
  }

  .load-state > i {
    color: var(--semantic-error);
    font-size: 1.8rem;
  }

  .load-state p {
    margin: 0;
    font-size: var(--font-size-min, 0.875rem);
  }

  @container learning-letters (max-width: 760px) {
    .lesson-shell {
      padding-top: 4.15rem;
      padding-inline: 0.55rem;
    }

    .lesson-studio {
      height: calc(100dvh - 8.75rem);
    }

    .intro-step {
      grid-template-columns: minmax(0, 1fr);
    }

    .intro-copy {
      gap: 0.75rem;
      padding: 1.25rem 1rem;
      border-right: 0;
      border-bottom: 1px solid var(--theme-stroke);
    }

    .family-preview {
      padding: 0.75rem;
    }

    .preview-family {
      grid-template-columns: minmax(0, 1fr);
      min-height: 10rem;
    }

    .preview-family-heading {
      align-self: auto;
      min-height: 2.75rem;
      padding: 0.55rem 0.75rem;
      border-right: 0;
      border-bottom: 1px solid var(--theme-stroke);
    }

    .word-header {
      min-height: 3.4rem;
      padding: 0.5rem 0.7rem;
    }

    .recap-header {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.75rem;
      padding: 1rem;
    }

    .recap-families {
      grid-template-columns: minmax(0, 1fr);
      padding: 0.75rem;
    }

    .recap-word {
      min-height: 7.5rem;
      padding: 0.5rem;
    }

    .lesson-transport {
      padding: 0.6rem;
    }
  }

  @container learning-letters (max-width: 420px) {
    h1 {
      font-size: 1.8rem;
    }

    .recap-word-grid {
      gap: 0.4rem;
      padding: 0.5rem;
    }

    .recap-word {
      gap: 0.35rem;
      min-height: 5rem;
    }

    .recap-header {
      gap: 0.35rem;
    }

    .recap-header .guide-prose {
      line-height: 1.35;
    }

    .recap-family .family-heading {
      min-height: 2.75rem;
    }
  }

  @container learning-letters (min-width: 1680px) {
    .lesson-shell {
      width: min(100%, 150rem);
    }

    .lesson-studio {
      height: min(70rem, calc(100dvh - 10rem));
    }
  }

  @container learning-letters (min-width: 2600px) {
    .lesson-shell {
      width: min(100%, 220rem);
    }

    .lesson-studio {
      height: min(96rem, calc(100dvh - 10rem));
    }

    .recap-families {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: repeat(2, minmax(0, 1fr));
    }

    .chapter-label {
      font-size: 1.1rem;
    }

    h1 {
      font-size: 4rem;
    }

    .guide-prose {
      font-size: 1.4rem;
    }

    .recap-family {
      grid-template-columns: 18rem minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr);
    }

    .family-heading {
      align-content: center;
      flex-direction: column;
      justify-content: center;
      border-right: 1px solid var(--theme-stroke);
      border-bottom: 0;
    }

    .family-identity,
    .sequence-position {
      font-size: 1.15rem;
    }

    .family-heading > span:last-child,
    .recap-word {
      font-size: 1rem;
    }

    .family-identity img {
      width: 1.6rem;
      height: 1.6rem;
    }

    .word-header {
      min-height: 5rem;
      padding-inline: 1.4rem;
    }

    .recap-word {
      min-height: 100%;
    }
  }

  @media (max-height: 620px) and (min-width: 761px) {
    .lesson-shell {
      padding-top: 3.9rem;
      padding-bottom: 0.5rem;
    }

    .lesson-studio {
      height: calc(100dvh - 8rem);
    }

    .intro-copy,
    .family-preview {
      padding-block: 1rem;
    }

    .preview-family {
      min-height: 7rem;
    }

    .lesson-transport {
      padding-block: 0.45rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .recap-word {
      transition: none;
    }
  }
</style>
