<!--
  The selected letter, at a size worth selecting for.

  The rejected board inverted the master-detail relationship: index cells were
  135px and the detail's variation cells were 85px, so choosing a letter showed
  you SMALLER pictures than the index already had. Here the hero and every
  variation are sized from tokens the host sets, and each board sets them so the
  detail is at least as large as its own cells.

  Composition only: GuidePictograph renders, letterQueryHandler (in the host)
  owns the variations query, codex-groups owns the identity facts.
-->
<script lang="ts">
  import GuidePictograph from "../../../guide/level-1/_components/GuidePictograph.svelte";
  import { codexData } from "../../../guide/codex/_data/codex-groups";
  import type { CodexLetterInfo } from "./codex-letters";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

  let {
    info,
    description = "",
    variations,
    isLoading,
    loadError,
    onRetry,
    showHero = true,
  }: {
    info: CodexLetterInfo;
    /** One domain-backed description of the selected letter. The overlay uses
     *  it in place of repeating the index pictograph at hero scale. */
    description?: string;
    variations: PictographData[];
    isLoading: boolean;
    loadError: boolean;
    onRetry: () => void;
    /** Stage keeps the large teaching view. The overlay already starts from a
     *  full-size index cell, so it opens directly on the useful variations. */
    showHero?: boolean;
  } = $props();

  const heroData = $derived(codexData(info.id));
</script>

<div class="inspector" class:without-hero={!showHero}>
  {#if showHero}
    <div class="lede">
      <div class="hero">
        <GuidePictograph
          data={heroData}
          size="lg"
          showGrid={true}
          showArrows={true}
          showTKA={true}
          showNonRadialPoints={false}
          forceTheme="dark"
          eager={true}
        />
      </div>
      <div class="ident">
        <span class="ident-name" style:color={info.typeColor}
          >{info.typeName}</span
        >
        {#if info.name}<span class="ident-greek">{info.name}</span>{/if}
        <span class="ident-transition">{info.transition}</span>
      </div>
    </div>
  {:else if description}
    <p class="description">{description}</p>
  {/if}

  <div class="vars">
    {#if isLoading}
      <p class="state">
        <i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i>
        Loading variations…
      </p>
    {:else if loadError}
      <p class="state">
        <span>The variations did not load.</span>
        <button type="button" class="retry" onclick={onRetry}>Try again</button>
      </p>
    {:else if variations.length === 0}
      <p class="state">No variations recorded for {info.label}.</p>
    {:else}
      <div class="var-grid" aria-label="{info.label} variations">
        {#each variations as pictograph, index (pictograph.id ?? index)}
          <figure class="var-cell">
            <GuidePictograph
              data={pictograph}
              size="sm"
              showGrid={true}
              showArrows={true}
              showTKA={true}
              showNonRadialPoints={false}
              forceTheme="dark"
              eager={true}
            />
            <figcaption class="sr-only">
              {info.label} variation {index + 1}
            </figcaption>
          </figure>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .inspector {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    min-width: 0;
    --pictograph-border: none;
  }
  .inspector.without-hero {
    gap: 1rem;
  }

  .description {
    margin: 0;
    color: var(--theme-text-muted, oklch(0.78 0.015 270));
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.65;
    text-wrap: pretty;
  }

  .lede {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    flex: 0 0 auto;
  }

  .hero {
    width: var(--codex-hero-size, 15rem);
    aspect-ratio: 1;
    box-sizing: border-box;
    border: 1px solid var(--theme-stroke, oklch(0.42 0.04 270 / 0.42));
    background: var(--theme-panel-bg, oklch(0.16 0.02 270));
  }
  /* GuidePictograph caps its wrapper per size class (lg is 280px, sm is 140px)
     because the guide's prose columns are narrow. A codex stage is not a prose
     column - at 4K the hero box is 731px, and the cap left a 280px drawing
     floating in the middle of it. The size class has to be in the selector:
     without it this override ties with .guide-pictograph.size-lg
     .pictograph-wrapper on specificity and loses on source order. */
  .hero :global(.guide-pictograph) {
    width: 100%;
    height: 100%;
    gap: 0;
  }
  .hero :global(.guide-pictograph.size-lg .pictograph-wrapper) {
    width: 100%;
    height: 100%;
    max-width: none;
  }

  /* The letter itself is NOT repeated here as a text badge - it is already the
     TKA glyph inside the hero pictograph, which is where it belongs. */
  .ident {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
    text-align: center;
    max-width: var(--codex-hero-size, 15rem);
  }
  .ident-name {
    font-size: 0.85rem;
    font-weight: 700;
  }
  .ident-greek {
    font-size: 0.85rem;
    color: var(--theme-text, oklch(0.96 0.01 270));
  }
  .ident-transition {
    font-size: 0.85rem;
    color: var(--theme-text-muted, oklch(0.72 0.015 270));
  }

  .vars {
    flex: 1 1 auto;
    min-width: 0;
  }

  /* Letters carry 8 or 16 variations, so a column count that divides both
     never leaves a row holding one. The host picks it. */
  .var-grid {
    display: grid;
    grid-template-columns: repeat(
      var(--codex-var-cols, 4),
      var(--codex-var-size, 7rem)
    );
    justify-content: var(--codex-var-justify, start);
    gap: 0;
  }
  .var-cell {
    margin: 0;
    width: var(--codex-var-size, 7rem);
    aspect-ratio: 1;
    box-sizing: border-box;
    border: 1px solid var(--theme-stroke, oklch(0.42 0.04 270 / 0.42));
    margin-inline-end: -1px;
    margin-block-end: -1px;
    background: var(--theme-panel-bg, oklch(0.16 0.02 270));
    overflow: hidden;
  }
  .var-cell :global(.guide-pictograph) {
    width: 100%;
    height: 100%;
    gap: 0;
  }
  .var-cell :global(.guide-pictograph.size-sm .pictograph-wrapper) {
    width: 100%;
    height: 100%;
    max-width: none;
  }

  .state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    margin: 0;
    padding: 1.5rem 1rem;
    color: var(--theme-text-muted, oklch(0.72 0.015 270));
    text-align: center;
  }
  .retry {
    min-height: 44px;
    padding: 0.5rem 1.1rem;
    border: 1px solid var(--theme-stroke, oklch(0.42 0.04 270 / 0.3));
    border-radius: 999px;
    background: transparent;
    color: var(--theme-text, oklch(0.96 0.01 270));
    font: 600 0.85rem/1 inherit;
    cursor: pointer;
  }
  .retry:hover {
    border-color: var(--theme-accent, #6366f1);
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
</style>
