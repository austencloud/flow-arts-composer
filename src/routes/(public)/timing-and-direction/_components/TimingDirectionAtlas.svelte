<script lang="ts">
  import { browser } from "$app/environment";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import TransportControls from "$lib/shared/animation-engine/components/controls/TransportControls.svelte";
  import TimingDirectionIntro from "$lib/features/learn/components/interactive/motions/TimingDirectionIntro.svelte";
  import { reducedMotion } from "$lib/shared/transitions/motion";
  import HandMotionPlayer from "$lib/features/learn/components/interactive/foundations/HandMotionPlayer.svelte";
  import { DEFAULT_VIEWER_CUSTOM_COLORS } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";
  import type { DirectionValue } from "../_data/timing-direction-articles";
  import {
    getTimingDirectionState,
    timingDirectionPreviews as modes,
  } from "../_state/timing-direction-state.svelte";

  const directions: readonly DirectionValue[] = ["Same", "Opposite"];
  const playback = getTimingDirectionState();
  const selectedCode = $derived(playback.selected.article.code);
  let detailHeading: HTMLHeadingElement | null = $state(null);
  const selected = $derived(playback.selected);

  function selectMode(code: string): void {
    playback.select(
      modes.find((mode) => mode.article.code === code)!.article.slug
    );
    // On phones the larger player is below the grid; bring the result into view.
    if (window.matchMedia("(max-width: 900px)").matches) {
      detailHeading?.focus({ preventScroll: true });
      detailHeading?.scrollIntoView({
        behavior: reducedMotion() ? "instant" : "smooth",
        block: "start",
      });
    }
  }
</script>

<section class="atlas" aria-label="Six timing and direction modes">
  <div class="atlas-toolbar">
    <PanelButton href="#timing-basics">
      <i class="fa-regular fa-circle-question" aria-hidden="true"></i>
      Learn the basics
    </PanelButton>
    <div
      class="playback-control"
      role="group"
      aria-label="Playback for all six modes"
    >
      {#if browser}
        <TransportControls
          isPlaying={playback.playing}
          onPlaybackToggle={() => (playback.playing = !playback.playing)}
        />
      {/if}
      <span>All animations</span>
    </div>
  </div>

  <div class="atlas-body">
    <div
      id="mode-comparison"
      class="comparison"
      aria-label="Compare all six modes"
    >
      <div class="timing-headings" aria-hidden="true">
        <span></span>
        {#each modes.filter((mode) => mode.article.direction === "Same") as mode}
          <span>{mode.article.timing}</span>
        {/each}
      </div>
      <div class="direction-rows">
        {#each directions as direction}
          <div
            class="direction-group"
            role="group"
            aria-label={`${direction} direction`}
          >
            <h2>{direction}</h2>
            <div class="mode-row">
              {#each modes.filter((mode) => mode.article.direction === direction) as mode (mode.article.code)}
                <article
                  class="mode"
                  class:selected={selectedCode === mode.article.code}
                  style:--mode-accent={mode.motion.element.accentColor}
                  aria-label={mode.article.name}
                >
                  <button
                    class="preview"
                    type="button"
                    aria-label={`Preview ${mode.article.name}`}
                    aria-pressed={selectedCode === mode.article.code}
                    aria-controls="timing-detail"
                    onclick={() => selectMode(mode.article.code)}
                  >
                    <span class="preview-label">
                      <strong>{mode.article.code}</strong>
                      <i
                        class="fa-solid fa-check"
                        class:shown={selectedCode === mode.article.code}
                        aria-hidden="true"
                      ></i>
                    </span>
                    <span class="preview-animation">
                      {#if browser}
                        <HandMotionPlayer
                          primaryPropColors={DEFAULT_VIEWER_CUSTOM_COLORS}
                          sequence={mode.motion.sequence}
                          showElementalGlyph
                          ariaLabel={mode.article.name}
                          interactive={false}
                          externalPlaying={playback.playing}
                          externalStep={playback.step}
                          framed={false}
                        />
                      {/if}
                    </span>
                  </button>
                </article>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>

    <section
      id="timing-detail"
      class="detail"
      aria-label="Selected mode"
      style:--mode-accent={selected.motion.element.accentColor}
    >
      <header class="detail-heading" aria-live="polite" aria-atomic="true">
        <h2 bind:this={detailHeading} tabindex="-1">
          <span><small>Timing</small>{selected.article.timing}</span>
          <span><small>Direction</small>{selected.article.direction}</span>
        </h2>
      </header>
      <div class="detail-animation" use:playback.registerTarget></div>
      <div class="detail-footer">
        <PanelButton
          href={selected.href}
          ariaLabel={`Read ${selected.article.name} article`}
          accentColor={selected.motion.element.accentColor}
        >
          <i class="fa-solid fa-book-open" aria-hidden="true"></i>
          Read {selected.article.code} article
        </PanelButton>
      </div>
      <div class="compare-action">
        <PanelButton href="#mode-comparison">
          <i class="fa-solid fa-arrow-up" aria-hidden="true"></i>
          All six modes
        </PanelButton>
      </div>
    </section>
  </div>
  <section
    id="timing-basics"
    class="intro"
    aria-label="Timing and direction lesson"
  >
    {#if browser}
      <TimingDirectionIntro />
    {/if}
    <div class="lesson-link">
      <PanelButton href="/learn/concepts/timing-and-direction">
        <i class="fa-solid fa-graduation-cap" aria-hidden="true"></i>
        Open full lesson
      </PanelButton>
    </div>
  </section>
</section>

<style>
  .atlas {
    --sequence-seek-target-size: 48px;
    --direction-label-width: 5rem;
    display: grid;
    gap: 1rem;
    min-width: 0;
  }

  .atlas-toolbar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .playback-control {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--theme-text-dim);
    font-size: 0.875rem;
  }

  .intro {
    container-type: inline-size;
    width: min(100%, 96rem);
    margin-inline: auto;
    margin-top: 2rem;
    scroll-margin-top: 6rem;
  }

  .lesson-link {
    display: flex;
    justify-content: center;
    margin-top: 1rem;
  }

  .atlas-toolbar :global(.panel-btn) {
    flex-shrink: 0;
  }

  .atlas-body {
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr);
    grid-template-rows: auto auto auto;
    gap: 0.75rem clamp(1.5rem, 3vw, 3rem);
    align-items: stretch;
  }

  .comparison {
    display: grid;
    grid-row: 1 / 3;
    grid-template-rows: subgrid;
    min-width: 0;
    scroll-margin-top: 5.5rem;
  }

  .mode-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: clamp(0.4rem, 1vw, 0.85rem);
  }

  .timing-headings {
    display: grid;
    grid-template-columns: var(--direction-label-width) repeat(
        3,
        minmax(0, 1fr)
      );
    align-content: end;
    align-items: end;
    gap: 0.5rem clamp(0.4rem, 1vw, 0.85rem);
    text-align: center;
    color: var(--theme-text);
    font-size: 1rem;
    font-weight: 700;
  }

  .direction-rows {
    display: grid;
    grid-template-rows: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .direction-group {
    display: grid;
    grid-template-columns: var(--direction-label-width) minmax(0, 1fr);
    align-items: center;
    gap: clamp(0.4rem, 1vw, 0.85rem);
    min-width: 0;
  }

  .direction-group h2 {
    margin: 0;
    color: var(--theme-text);
    font-size: 0.875rem;
    font-weight: 650;
    line-height: 1.25;
    text-align: center;
  }

  .mode {
    min-width: 0;
    border: 1px solid var(--theme-stroke-strong);
    border-radius: var(--radius-lg, 0.75rem);
    background: var(--theme-panel-bg);
  }

  .mode {
    background: color-mix(
      in srgb,
      var(--mode-accent) 9%,
      var(--theme-panel-bg)
    );
    border-color: color-mix(
      in srgb,
      var(--mode-accent) 45%,
      var(--theme-stroke-strong)
    );
    transition:
      border-color var(--transition-normal),
      background-color var(--transition-normal);
  }

  .mode.selected {
    background: color-mix(
      in srgb,
      var(--mode-accent) 17%,
      var(--theme-panel-bg)
    );
    border-color: var(--mode-accent);
    box-shadow: 0 0 0 1px var(--mode-accent);
  }

  .preview {
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    border-radius: var(--radius-lg, 0.75rem);
    background: transparent;
    color: var(--theme-text);
    cursor: pointer;
  }

  .preview:hover {
    background: color-mix(in srgb, var(--mode-accent) 10%, transparent);
  }

  .preview-label {
    position: relative;
    display: block;
    text-align: center;
    padding: 0.75rem 1.5rem 0;
    font-size: 1rem;
    line-height: 1.25;
  }

  .preview-label i {
    position: absolute;
    top: 0.75rem;
    right: 0.5rem;
    visibility: hidden;
    color: var(--theme-text);
  }

  .preview-label strong {
    color: var(--theme-text);
    display: grid;
    gap: 0.125rem;
    font-weight: 650;
  }

  .preview-label i.shown {
    visibility: visible;
  }

  .preview-animation {
    display: block;
    width: 100%;
    aspect-ratio: 1.15;
    overflow: hidden;
    border-radius: inherit;
  }

  .preview:focus-visible {
    outline: 3px solid var(--theme-accent);
    outline-offset: 3px;
  }

  .detail {
    display: grid;
    grid-column: 2;
    grid-row: 1 / 4;
    grid-template-rows: subgrid;
    min-width: 0;
  }

  .detail-heading {
    text-align: center;
    align-self: end;
  }

  .detail-heading h2 {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    margin: 0;
    color: var(--theme-text);
    font-size: clamp(1.25rem, 1rem + 0.4vw, 1.65rem);
    line-height: 1.25;
    font-weight: 700;
    scroll-margin-top: 7rem;
  }

  .detail-heading h2 > span {
    display: grid;
    gap: 0.25rem;
  }
  .detail-heading small {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--theme-text-dim);
  }

  .detail-heading h2:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 4px;
  }

  .detail-animation {
    width: 100%;
    min-height: 0;
  }

  .detail-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
    padding: 0.25rem 0;
  }

  .detail-footer :global(.panel-btn) {
    min-height: 48px;
    font-size: 1rem;
    font-weight: 650;
  }

  .compare-action {
    display: none;
    justify-content: center;
    padding: 0 1rem 0.75rem;
  }

  @media (max-width: 900px) {
    .atlas-body {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto auto;
      row-gap: 1.5rem;
    }

    .comparison {
      grid-row: auto;
      grid-template-rows: auto auto;
      gap: 0.75rem;
    }

    .detail {
      grid-column: 1;
      grid-row: auto;
      grid-template-rows: auto auto auto auto;
      gap: 0.75rem;
      width: min(100%, 36rem);
      justify-self: center;
    }

    .detail-animation {
      aspect-ratio: 1.08;
    }

    .compare-action {
      display: flex;
    }
  }

  @media (max-width: 480px) {
    .atlas {
      gap: 0.75rem;
      --direction-label-width: 4rem;
    }

    .atlas-toolbar {
      gap: 0.5rem;
    }

    .atlas-toolbar :global(.panel-btn) {
      padding: 0.5rem 0.6rem;
    }

    .timing-headings {
      font-size: 0.875rem;
    }

    .preview-label {
      padding: 0.65rem 0.2rem 0;
    }
    .preview-label i {
      top: 0.15rem;
      right: 0.2rem;
      font-size: 0.75rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mode {
      transition: none;
    }
  }
</style>
