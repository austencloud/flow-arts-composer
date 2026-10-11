<!--
QuizGlyphCard - Displays TKA glyph with smooth crossfade transitions between letters
-->
<script lang="ts">
  import TKAGlyph from "#lib/shared/pictograph/tka-glyph/components/TKAGlyph.svelte";
  import {
    preloadLetterDimensions,
    getLetterDimensions,
  } from "#lib/shared/pictograph/tka-glyph/components/TKAGlyph.svelte";
  import { isDashLetter } from "#lib/shared/pictograph/tka-glyph/utils/letter-image-getter.js";
  import { onMount } from "svelte";

  let { letter }: { letter: string } = $props();

  // Track displayed letter for crossfade (separate from incoming prop)
  let displayedLetter = $state<string | null>(null);
  let outgoingLetter = $state<string | null>(null);
  let isTransitioning = $state(false);
  let isLoaded = $state(false);

  // Dimensions for the displayed letter
  let glyphDimensions = $state({ width: 100, height: 100 });

  // Check if displayed letter has a dash
  const hasDash = $derived(isDashLetter(displayedLetter));
  const dashExtraWidth = 60;
  const totalGlyphWidth = $derived(
    hasDash ? glyphDimensions.width + dashExtraWidth : glyphDimensions.width
  );

  // SVG viewBox dimensions
  const viewBoxWidth = 220;
  const viewBoxHeight = 150;

  // Calculate centered position
  const glyphX = $derived((viewBoxWidth - totalGlyphWidth) / 2);
  const glyphY = $derived((viewBoxHeight - glyphDimensions.height) / 2);

  // Transition duration (ms)
  const transitionDuration = 250;

  onMount(async () => {
    if (letter) {
      await preloadLetterDimensions([letter]);
      glyphDimensions = getLetterDimensions(letter);
      displayedLetter = letter;
      isLoaded = true;
    }
  });

  // Handle letter changes with crossfade
  $effect(() => {
    if (!letter) return;

    let cancelled = false;
    let clearTimer: ReturnType<typeof setTimeout> | null = null;

    // First load - no transition needed
    if (displayedLetter === null) {
      preloadLetterDimensions([letter]).then(() => {
        if (cancelled) return;
        glyphDimensions = getLetterDimensions(letter);
        displayedLetter = letter;
        isLoaded = true;
      });
      return () => {
        cancelled = true;
      };
    }

    // Same letter - no transition needed
    if (letter === displayedLetter) return;

    // Different letter - start crossfade transition
    const newLetter = letter;

    // Preload the new letter
    preloadLetterDimensions([newLetter]).then(() => {
      if (cancelled) return;
      // Start crossfade: fade out current, fade in new
      outgoingLetter = displayedLetter;
      isTransitioning = true;

      // Update dimensions and displayed letter
      glyphDimensions = getLetterDimensions(newLetter);
      displayedLetter = newLetter;

      // Clear outgoing letter after transition completes
      clearTimer = setTimeout(() => {
        if (cancelled) return;
        outgoingLetter = null;
        isTransitioning = false;
      }, transitionDuration);
    });

    return () => {
      cancelled = true;
      if (clearTimer !== null) clearTimeout(clearTimer);
    };
  });
</script>

<div class="glyph-section" class:initial-load={!isLoaded}>
  <div class="glyph-card" class:loaded={isLoaded}>
    <svg
      viewBox="0 0 {viewBoxWidth} {viewBoxHeight}"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
    >
      <!-- Outgoing glyph (fading out) -->
      {#if outgoingLetter}
        <TKAGlyph
          letter={outgoingLetter}
          x={glyphX}
          y={glyphY}
          scale={1}
          visible={false}
          darkMode={true}
        />
      {/if}

      <!-- Current/incoming glyph -->
      {#if displayedLetter}
        <TKAGlyph
          letter={displayedLetter}
          x={glyphX}
          y={glyphY}
          scale={1}
          visible={!isTransitioning || displayedLetter !== outgoingLetter}
          darkMode={true}
        />
      {/if}
    </svg>
  </div>
</div>

<style>
  .glyph-section {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  /* Only animate on initial load, not every question */
  .glyph-section.initial-load {
    animation: glyphEntrance var(--duration-dramatic) cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes glyphEntrance {
    from {
      opacity: 0;
      transform: scale(0.92) translateY(10px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  .glyph-card {
    /* Wider aspect ratio to fit glyphs with dashes */
    width: 180px;
    height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent) 15%, transparent),
      color-mix(in srgb, var(--theme-accent) 8%, transparent)
    );
    border-radius: 20px;
    border: 2px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    box-shadow:
      0 8px 32px color-mix(in srgb, var(--theme-panel-bg) 12%, transparent),
      0 0 0 1px color-mix(in srgb, var(--theme-text) 8%, transparent),
      0 0 80px -20px color-mix(in srgb, var(--theme-accent) 15%, transparent);
    opacity: 0;
    transition: opacity var(--duration-emphasis) ease;
  }

  .glyph-card.loaded {
    opacity: 1;
  }

  .glyph-card svg {
    width: 100%;
    height: 100%;
  }

  @media (min-width: 600px) {
    .glyph-card {
      width: 210px;
      height: 140px;
      border-radius: 24px;
    }
  }

  @media (min-width: 900px) {
    .glyph-card {
      width: 240px;
      height: 160px;
      box-shadow:
        0 12px 50px color-mix(in srgb, var(--theme-panel-bg) 15%, transparent),
        0 0 0 1px color-mix(in srgb, var(--theme-text) 6%, transparent),
        0 0 120px -30px color-mix(in srgb, var(--theme-accent) 20%, transparent);
    }
  }

  @media (min-width: 1200px) {
    .glyph-card {
      width: 280px;
      height: 190px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .glyph-section.initial-load {
      animation: none;
    }
  }
</style>
