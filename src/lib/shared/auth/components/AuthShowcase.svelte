<!--
  The sequence playing on the sign-in sheet's art. The sequence the person was
  saving or sharing plays when there is one, so the sheet shows what an account
  keeps. Otherwise the homepage's attract act plays: the same per-visit draws
  and prop cycle, through the same public player.
-->
<script lang="ts">
  import { MediaQuery } from "svelte/reactivity";
  import SequenceHeroDemo from "#lib/shared/landing/components/SequenceHeroDemo.svelte";
  import { createHeroAct } from "#lib/shared/landing/data/hero-act.svelte.js";
  import { FALLBACK_DEMO } from "#lib/shared/landing/data/per-visit-demo.js";
  import {
    HERO_TRAIL_PRESET,
    HERO_TIP_EFFECT_MAP,
  } from "#lib/shared/landing/data/hero-trail-preset.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

  let { sequence = null }: { sequence?: SequenceData | null } = $props();

  const heroAct = createHeroAct({ initialSequence: FALLBACK_DEMO });
  const reduceMotion = new MediaQuery("(prefers-reduced-motion: reduce)");

  $effect(() => {
    if (!sequence) heroAct.start();
  });
</script>

<div class="auth-showcase">
  {#if sequence}
    <SequenceHeroDemo
      {sequence}
      note="the sequence you are working on"
      trailSettingsOverride={HERO_TRAIL_PRESET}
      tipEffectMap={HERO_TIP_EFFECT_MAP}
      externalBpm={60}
      autoPlay={!reduceMotion.current}
      showWordHeader
      showCaption={false}
      loadPriority="immediate"
    />
  {:else}
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
      loadPriority="immediate"
    />
  {/if}
</div>

<style>
  /* The stage is the largest square that fits the art beside the column. */
  .auth-showcase {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    container-type: size;
    --hero-demo-max-width: min(30rem, 100cqw, 86cqh);
    --hero-demo-wide-max-width: var(--hero-demo-max-width);
  }

  .auth-showcase :global(.hero-demo) {
    margin-top: 0;
  }
</style>
