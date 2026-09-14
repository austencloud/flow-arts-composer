<script lang="ts">
  import { MediaQuery } from "svelte/reactivity";
  import SequenceHeroDemo from "$lib/shared/landing/components/SequenceHeroDemo.svelte";
  import SequenceMandala from "$lib/shared/mandala/components/SequenceMandala.svelte";
  import { createHeroAct } from "$lib/shared/landing/data/hero-act.svelte";
  import { FALLBACK_DEMO } from "$lib/shared/landing/data/per-visit-demo";
  import {
    HERO_TRAIL_PRESET,
    HERO_TIP_EFFECT_MAP,
  } from "$lib/shared/landing/data/hero-trail-preset";

  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";

  let { active = false }: { active?: boolean } = $props();

  // Reuse the homepage's sequence selection and prop cycle. Start only when
  // this record is selected; playback boundaries drive subsequent draws.
  const heroAct = createHeroAct();
  const reduceMotion = new MediaQuery("(prefers-reduced-motion: reduce)");
  $effect(() => {
    if (active) heroAct.start();
  });
  const posterSequence = $derived(heroAct.sequence ?? FALLBACK_DEMO);

  // The resting poster is the sequence's own mandala — the path both props
  // actually trace. A single letter said nothing about what the alphabet
  // writes; the mandala is the shape of the writing.
  const posterWord = $derived(simplifyRepeatedWord(posterSequence.word));
</script>

<div class="tka-artifact">
  {#if active}
    <div class="live">
      <SequenceHeroDemo
        sequence={heroAct.sequence}
        element={heroAct.element}
        note="a sequence in TKA notation"
        leftPropType={heroAct.propType}
        rightPropType={heroAct.propType}
        onSequenceBoundary={heroAct.offerSequenceBoundary}
        trailSettingsOverride={HERO_TRAIL_PRESET}
        tipEffectMap={HERO_TIP_EFFECT_MAP}
        externalBpm={60}
        autoPlay={!reduceMotion.current}
        showWordHeader
        showCaption={false}
        cornerToggle
      />
    </div>
  {:else}
    <div
      class="poster"
      role="img"
      aria-label={`The mandala traced by the sequence ${posterWord}`}
    >
      <div class="mandala-frame">
        <SequenceMandala
          sequence={posterSequence}
          size={520}
          darkMode={true}
          show="both"
        />
      </div>
      <span class="poster-sub">
        <span class="tka-font poster-word">{posterWord}</span>
        · the path both props trace
      </span>
    </div>
  {/if}
</div>

<style>
  .tka-artifact {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
  }

  .live {
    width: 100%;
    max-height: 100%;
    display: grid;
    place-items: center;
    /* SequenceHeroDemo caps itself at 26rem; give it the stage. */
    --hero-demo-max-width: min(var(--tka-preview-max-width, 32rem), 88cqh, 100cqw);
    --hero-demo-wide-max-width: var(--hero-demo-max-width);
  }

  .live :global(.hero-demo) {
    margin-top: 0;
  }

  .poster {
    width: 100%;
    height: 100%;
    max-height: 100%;
    overflow: hidden;
    display: grid;
    /* Definite column track so the mandala's `min(100%, Ncqh)` has a
		   percentage basis; an `auto` track lets the cqh arm win and overflow
		   a narrow stage. */
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
    justify-items: center;
    align-content: center;
    gap: 0.6rem;
    padding: clamp(0.5rem, 3cqi, 1.5rem);
    box-sizing: border-box;
  }

  /* The mandala fills the plate: it is the artifact, not a thumbnail. */
  .mandala-frame {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    place-items: center;
    width: 100%;
    min-height: 0;
  }

  /* SequenceMandala sizes its container with an inline px width/height from
	   its `size` prop; the inner SVG is already 100%/100%, so overriding the
	   box (and only the box) lets the artwork scale to whatever plate it is
	   in. !important is required to beat the inline style. */
  .mandala-frame :global(.mandala-container) {
    /* 78cqh, not 92: the caption row below shares the stage, so the square
		   has to leave it room or the pair overflows on short viewports. */
    width: min(100%, 78cqh) !important;
    max-width: 100% !important;
    height: auto !important;
    aspect-ratio: 1;
    filter: drop-shadow(0 0 26px oklch(0.6 0.18 305 / 0.3));
  }

  .poster-word {
    font-size: 1.15em;
    color: oklch(0.88 0.08 305);
  }

  .poster-sub {
    display: inline-flex;
    align-items: baseline;
    gap: 0.4rem;
    font-size: clamp(0.75rem, 2.2cqi, 0.95rem);
    font-style: italic;
    color: oklch(0.66 0.03 270);
  }

  /* Short stage: the mandala is the artifact, so the caption stands down and
	   the square takes the whole plate rather than being cropped. */
  @container (max-height: 220px) {
    .poster-sub {
      display: none;
    }
    .mandala-frame :global(.mandala-container) {
      width: min(100%, 96cqh) !important;
    }
  }
</style>
