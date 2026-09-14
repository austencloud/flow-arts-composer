<!--
WordHeader.svelte

Word/sequence name display for animation area.
Displays ABOVE the canvas as a full-width header (matches image export style).

Uses simplifyAndTruncate to match the workspace WordLabel's shortened display.
Truncates to 12 letter units max to reduce visual overwhelm during playback.
Dark mode: Controlled via prop (for preview isolation) or falls back to :root.dark class.
Supports letter highlighting during animation playback.
-->
<script lang="ts">
  import {
    simplifyAndTruncate,
    compressWord,
  } from "$lib/shared/foundation/utils/word-simplifier";
  import { untrack } from "svelte";
  import DifficultyBadge from "$lib/shared/components/DifficultyBadge.svelte";
  import LOOPIconStrip from "$lib/shared/components/LOOPIconStrip.svelte";
  import type { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
  import type { Period } from "$lib/shared/foundation/domain/models/generation/circular-models";
  import type { LoopReflectionAxis } from "@tka/render-composition";
  import { getGlyphCache } from "$lib/shared/render/get-glyph-cache";
  import {
    isDashLetter,
    getBaseLetter,
  } from "$lib/shared/pictograph/tka-glyph/utils/letter-image-getter";
  import { browser } from "$app/environment";
  import { fade } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { motionDuration } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";

  const cache = browser ? getGlyphCache() : null;
  let glyphLoadVersion = $state(0);

  function getGlyphUrl(letter: string): string | null {
    void glyphLoadVersion;
    if (!cache) return null;
    const base = isDashLetter(letter) ? getBaseLetter(letter) : letter;
    return cache.getGlyphDataUrl(base);
  }

  function isAlphaGlyph(letter: string): boolean {
    const base = isDashLetter(letter) ? getBaseLetter(letter) : letter;
    return base === "α";
  }

  let {
    word = null,
    visible = true,
    darkMode = false,
    presentation = "canvas",
    activeStepNumber = null,
    difficultyLevel = null,
    loopComponents = null,
    rotationPeriod,
    inversionPeriod,
    reflectionAxis,
    overlayComponents,
  }: {
    word?: string | null;
    visible?: boolean;
    darkMode?: boolean;
    presentation?: "canvas" | "chrome";
    activeStepNumber?: number | null;
    difficultyLevel?: number | null;
    loopComponents?: Set<LOOPComponent> | null;
    rotationPeriod?: Period;
    inversionPeriod?: Period;
    reflectionAxis?: LoopReflectionAxis;
    /**
     * Components rendered LAST in the icon strip, after one faded separator
     * dot — same segment grammar as the group-dot in the word text above.
     */
    overlayComponents?: Set<LOOPComponent> | null;
  } = $props();

  // Animation state machine: "idle" | "exiting" | "entering"
  let animationPhase = $state<"idle" | "exiting" | "entering">("idle");

  // The word currently being displayed (may lag behind `word` during transitions)
  let displayedWord = $state<string | null>(null);

  // Track for detecting changes (not reactive - only read/written inside the effect)
  let wasVisible = false;
  let lastWord: string | null = null;

  // Timers live at component level so cleanup doesn't race with effect re-runs
  let exitTimer: ReturnType<typeof setTimeout> | undefined;
  let enterTimer: ReturnType<typeof setTimeout> | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  function clearAnimationTimers() {
    clearTimeout(exitTimer);
    clearTimeout(enterTimer);
    clearTimeout(idleTimer);
    exitTimer = enterTimer = idleTimer = undefined;
  }

  // Exit animation duration (per letter stagger + base)
  const EXIT_DURATION_BASE = 80;
  const EXIT_STAGGER_PER_LETTER = 40;
  const ENTER_DELAY = 100; // Gap between exit and enter

  function startWordTransition() {
    clearAnimationTimers();
    animationPhase = "exiting";

    const oldLetterCount = displayedWord
      ? simplifyAndTruncate(displayedWord, 12).length
      : 1;
    const exitDuration =
      EXIT_DURATION_BASE + oldLetterCount * EXIT_STAGGER_PER_LETTER;

    exitTimer = setTimeout(() => {
      // `word` is intentionally read when the exit finishes. Several sequence
      // changes can arrive during the animation, and only the newest title
      // should enter.
      displayedWord = word;
      animationPhase = "entering";

      enterTimer = setTimeout(() => {
        animationPhase = "idle";
        if (visible && displayedWord !== word) startWordTransition();
      }, 400);
    }, exitDuration + ENTER_DELAY);
  }

  // Handle visibility and word changes with proper exit → enter sequencing.
  // Only tracks `word` and `visible` props. Internal state (animationPhase,
  // displayedWord, wasVisible, lastWord) is read via untrack() to prevent
  // the effect from re-triggering when it writes to them.
  $effect(() => {
    // Track these two props as dependencies
    const currentWord = word;
    const currentlyVisible = visible;

    // Read internal state without tracking - this effect manages these values,
    // so re-triggering on its own writes would cause a cleanup race condition
    // that clears animation timers before they fire.
    const prevWord = untrack(() => lastWord);
    const prevVisible = untrack(() => wasVisible);
    const currentDisplayedWord = untrack(() => displayedWord);
    const currentPhase = untrack(() => animationPhase);

    const wordChanged =
      currentWord !== prevWord && currentWord !== null && prevWord !== null;
    const becameVisible = currentlyVisible && !prevVisible;
    const initialMount =
      currentlyVisible && currentDisplayedWord === null && currentWord !== null;

    if (wordChanged && currentlyVisible && currentPhase === "idle") {
      // Word changed while visible: exit old, then enter new
      startWordTransition();
    } else if ((becameVisible || initialMount) && currentPhase === "idle") {
      // First appearance: just enter
      clearAnimationTimers();
      displayedWord = currentWord;
      animationPhase = "entering";

      idleTimer = setTimeout(() => {
        animationPhase = "idle";
        if (visible && displayedWord !== word) startWordTransition();
      }, 400);
    } else if (!currentlyVisible && prevVisible) {
      // Hiding: reset state
      clearAnimationTimers();
      animationPhase = "idle";
    } else if (currentWord !== prevWord && currentPhase === "idle") {
      // Word changed but wasn't visible before, just update
      displayedWord = currentWord;
    }

    wasVisible = currentlyVisible;
    lastWord = currentWord;
  });

  // Unmount-only timer cleanup. The effect above intentionally does NOT return
  // a cleanup (it would clear timers on every re-run - the race documented
  // there), so this dependency-free effect handles destroy instead.
  $effect(() => {
    return clearAnimationTimers;
  });

  // Derive display text from displayedWord (the word currently showing)
  // Uses simplifyAndTruncate to match the workspace WordLabel's shortened display
  const displayText = $derived(
    displayedWord ? simplifyAndTruncate(displayedWord, 12) : null
  );

  // Compressed-segment display: repeated runs collapse to their pattern with a
  // faded dot between segments (e.g. BΦ-BΦ-BΦ-BΦ-AΦ-AΦ-AΦ-AΦ- → BΦ- · AΦ-).
  // Matches TKAWordGlyph and the export renderHeader path. Null → fall back to
  // the simplifyAndTruncate display above.
  const compressedSegments = $derived.by(() => {
    if (!displayedWord) return null;
    const segments = compressWord(displayedWord);
    if (!segments.some((s) => s.repeat > 1)) return null;
    const letterCount = segments.reduce((n, s) => n + s.tokens.length, 0);
    if (letterCount > 12) return null;
    return segments;
  });

  // Computed: Whether animation highlighting is active
  const hasActiveHighlighting = $derived(
    activeStepNumber !== null && activeStepNumber >= 1
  );

  /**
   * Parse display text into TKA letter units (handles dash-letters like "Λ-")
   */
  const parsedLetters = $derived.by(() => {
    if (!displayText) return [];
    const letters: string[] = [];
    for (let i = 0; i < displayText.length; i++) {
      const char = displayText[i]!;
      const nextChar = displayText[i + 1];
      // Check if this is a dash-letter (e.g., "Λ-", "X-")
      if (nextChar === "-") {
        letters.push(char + "-");
        i++; // Skip the dash on next iteration
      } else {
        letters.push(char);
      }
    }
    return letters;
  });

  type DisplayUnit =
    | { kind: "letter"; letter: string; letterIdx: number }
    | { kind: "dot" };

  const displayUnits = $derived.by((): DisplayUnit[] => {
    if (compressedSegments) {
      const units: DisplayUnit[] = [];
      let letterIdx = 0;
      compressedSegments.forEach((seg, si) => {
        if (si > 0) units.push({ kind: "dot" });
        for (const token of seg.tokens) {
          units.push({ kind: "letter", letter: token, letterIdx: letterIdx++ });
        }
      });
      return units;
    }
    return parsedLetters.map((letter, i) => ({
      kind: "letter" as const,
      letter,
      letterIdx: i,
    }));
  });

  /**
   * Roughly how many `em` of width this word needs, so CSS can pick a font size
   * that fits instead of letting flex crush the glyphs.
   *
   * A flat per-unit average cannot work here, because a dash-letter is nearly
   * twice as wide as a plain one: the glyph itself averages ~0.8em (they run 0.6
   * for F to 1.2 for W-), and a dash adds `.dash-bar`'s 0.70em plus the 0.08em
   * gap on top. Counting the two kinds separately is what makes the estimate
   * tight rather than a compromise that overflows wide words and shrinks narrow
   * ones for nothing.
   *
   * Deliberately an estimate and not a measurement: measuring means rendering,
   * reading `scrollWidth`, then restyling, and this component sits in an
   * animation loop.
   */
  const wordEmWidth = $derived.by(() => {
    let em = 0;
    for (const unit of displayUnits) {
      if (unit.kind === "dot") {
        em += 0.43; // 0.15em dot + 0.2em margins + gap
      } else if (isDashLetter(unit.letter)) {
        // 0.96em glyph + 0.70em bar + two 0.08em gaps. The glyph term is higher
        // than the alphabet-wide 0.8 average on purpose: dash-letters skew to the
        // wide Greek forms (W- is 1.2, Ω- is 1.1), and using the average left
        // real titles 6% short and still overflowing.
        em += 1.82;
      } else {
        em += 0.9; // ~0.82em glyph + gap
      }
    }
    return Math.max(em, 0.88);
  });

  const neededBaseLetters = $derived.by(() => [
    ...new Set(
      displayUnits.flatMap((unit) =>
        unit.kind === "letter"
          ? [
              isDashLetter(unit.letter)
                ? getBaseLetter(unit.letter)
                : unit.letter,
            ]
          : []
      )
    ),
  ]);

  // The global glyph warmup runs while the browser is idle. Playback can
  // start first, so load this header's letters immediately and repaint when
  // the shared, non-reactive cache receives them.
  $effect(() => {
    if (!cache) return;
    const missing = neededBaseLetters.filter(
      (letter) => letter && !cache.getGlyphDataUrl(letter)
    );
    if (missing.length === 0) return;

    cache.loadGlyphsByLetter(missing).then(() => {
      glyphLoadVersion++;
    });
  });

  /**
   * Active letter index with wrapping for circular sequences (0-indexed).
   * With compressed segments, the step number walks the EXPANDED word
   * (each segment spans tokens.length × repeat steps) and maps back to the
   * segment's displayed tokens, so the highlight cycles within the pattern.
   */
  const activeLetterIndex = $derived.by(() => {
    if (!hasActiveHighlighting) return -1;
    if (compressedSegments) {
      const total = compressedSegments.reduce(
        (n, s) => n + s.tokens.length * s.repeat,
        0
      );
      if (total === 0) return -1;
      let s0 = (activeStepNumber! - 1) % total;
      let offset = 0;
      for (const seg of compressedSegments) {
        const span = seg.tokens.length * seg.repeat;
        if (s0 < span) return offset + (s0 % seg.tokens.length);
        s0 -= span;
        offset += seg.tokens.length;
      }
      return -1;
    }
    if (parsedLetters.length === 0) return -1;
    // activeStepNumber is 1-indexed, modulo to wrap around
    return (activeStepNumber! - 1) % parsedLetters.length;
  });
</script>

{#if visible && displayUnits.length > 0}
  <svelte:element
    this={presentation === "chrome" ? "span" : "div"}
    class="word-header"
    class:dark-mode={darkMode}
    class:chrome={presentation === "chrome"}
    data-controlled="true"
    out:fade={{ duration: motionDuration(DURATION.normal), easing: cubicOut }}
  >
    {#if difficultyLevel != null}
      <div class="badge-wrapper">
        <DifficultyBadge
          level={difficultyLevel}
          size="clamp(24px, 7cqw, 34px)"
          fontSize="clamp(12px, 4cqw, 18px)"
        />
      </div>
    {/if}

    <!-- `--word-em` lets the CSS shrink the WHOLE word to fit rather than letting
         flex squeeze the glyphs individually. See .word-text. -->
    <span class="word-text" style="--word-em: {wordEmWidth.toFixed(2)}">
      {#if hasActiveHighlighting && displayUnits.length > 0 && animationPhase === "idle"}
        {#each displayUnits as unit, index (index)}
          {#if unit.kind === "dot"}
            <span class="group-dot"></span>
          {:else}
            {@const url = getGlyphUrl(unit.letter)}
            <span
              class="letter"
              class:active={activeLetterIndex === unit.letterIdx}
            >
              {#if url}
                <img
                  src={url}
                  alt={unit.letter}
                  class="glyph-img"
                  class:alpha-baseline={isAlphaGlyph(unit.letter)}
                  draggable="false"
                />
                {#if isDashLetter(unit.letter)}<span class="dash-bar"
                  ></span>{/if}
              {:else}{unit.letter}{/if}
            </span>
          {/if}
        {/each}
      {:else}
        {#each displayUnits as unit, index (index)}
          {#if unit.kind === "dot"}
            <span
              class="group-dot animated"
              class:entering={animationPhase === "entering"}
              class:exiting={animationPhase === "exiting"}
              class:visible={animationPhase === "idle"}
              style="--letter-index: {index}; --total-letters: {displayUnits.length}; --reverse-index: {displayUnits.length -
                1 -
                index}"
            ></span>
          {:else}
            {@const url = getGlyphUrl(unit.letter)}
            <span
              class="letter animated"
              class:entering={animationPhase === "entering"}
              class:exiting={animationPhase === "exiting"}
              class:visible={animationPhase === "idle"}
              style="--letter-index: {index}; --total-letters: {displayUnits.length}; --reverse-index: {displayUnits.length -
                1 -
                index}"
            >
              {#if url}
                <img
                  src={url}
                  alt={unit.letter}
                  class="glyph-img"
                  class:alpha-baseline={isAlphaGlyph(unit.letter)}
                  draggable="false"
                />
                {#if isDashLetter(unit.letter)}<span class="dash-bar"
                  ></span>{/if}
              {:else}{unit.letter}{/if}
            </span>
          {/if}
        {/each}
      {/if}
    </span>

    {#if loopComponents}
      <div class="loop-icon-badge">
        <LOOPIconStrip
          activeComponents={loopComponents}
          {rotationPeriod}
          {inversionPeriod}
          {reflectionAxis}
          overlayComponents={overlayComponents ?? undefined}
          size={20}
          {darkMode}
          showFreeformWhenEmpty={false}
        />
      </div>
    {/if}
  </svelte:element>
{/if}

<style>
  /* Full-width header attached to canvas (matches image export style) */
  .word-header {
    /*
      Be the box this header's own `cqw` measures.

      Every `cqw` below — the type size, the padding, the badge insets — was
      written to mean "a share of this header". Without a container declared here
      they resolved against the nearest ancestor that happened to declare one,
      which on a profile tile is `.stage`: a 338px tile asked a 677px box how big
      to be, got twice the answer, and the word overflowed. Deeper into an
      AnimatorCanvas or a landing hero it resolved somewhere else again, so the
      header was never sized to itself anywhere.
    */
    container-type: inline-size;

    width: 100%;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    flex-shrink: 0;
    background: var(--theme-panel-bg, rgb(240, 240, 240));
    border-bottom: 1px solid var(--theme-stroke, rgba(0, 0, 0, 0.08));
    /* Smooth transition synced with canvas background (150ms) */
    transition:
      background 150ms ease-out,
      border-color 150ms ease-out;
  }

  .badge-wrapper {
    position: absolute;
    left: clamp(6px, 3cqw, 12px);
    top: 50%;
    transform: translateY(-50%);
  }

  .loop-icon-badge {
    position: absolute;
    right: clamp(6px, 3cqw, 12px);
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    padding: 2px 4px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
    height: clamp(24px, 7cqw, 34px);
  }

  .word-header.dark-mode .loop-icon-badge {
    background: rgba(255, 255, 255, 0.1);
  }

  .word-text {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.08em;

    /*
      Two bounds, and the smaller wins.

      The first is the design size. The second is what actually FITS: `--word-em`
      is this word's width in `em`, summed per unit in the script above (a
      dash-letter is nearly twice a plain one), and the padding either side eats
      ~8cqw — so the largest em that fits is `92cqw / --word-em`. The floor sits
      at 10px rather than 12 because a 15-unit title in a 160px archive tile
      cannot fit above that.

      Without that second bound a long word overflowed, and because these letters
      are flex items they absorbed it by SHRINKING — every glyph kept its 28px
      height while its box was squeezed to a sliver. Measured on a 12-unit title:
      `W-` (a 120×100 glyph) and `Θ-` (79×100) both rendered 21.8px wide, and O,
      Y, E, Z, D collapsed to 0. On another, 65×100 glyphs came out 5.6px. That is
      the mangling — not a font problem, a layout one. The whole word now scales
      down together and every glyph keeps its own aspect ratio.
    */
    font-size: min(
      clamp(10px, 6cqw, 28px),
      calc(92cqw / max(var(--word-em, 1), 1))
    );

    /* Belt to the braces above: with the fit-to-width font size the word should
       never exceed its box, but a wildly narrow container (or a glyph far wider
       than the 0.8em estimate) must clip rather than crush. */
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;

    /* The image path is exactly 1em tall; the FONT fallback path (a cache miss,
       and the "..." truncation marker) inherits a normal line-height and came out
       42px against the images' 28px, making the header taller than its
       neighbours in a row of tiles. */
    line-height: 1;

    padding: clamp(6px, 3cqw, 12px) clamp(8px, 4cqw, 16px);
  }

  .word-header.dark-mode {
    background: var(--theme-panel-bg, rgb(15, 15, 20));
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  /* Viewer chrome uses the same glyph loading, compression, entrance motion,
     and active-letter treatment without bringing the canvas band along. */
  .word-header.chrome,
  .word-header.chrome.dark-mode {
    min-height: 28px;
    background: transparent;
    border-bottom: 0;
  }

  .word-header.chrome .word-text {
    width: 100%;
    padding: 0;
    font-size: min(
      clamp(18px, 40cqw, 28px),
      calc(98cqw / max(var(--word-em, 1), 1))
    );
  }

  :global(:root.dark) .word-header:not([data-controlled]) {
    background: var(--theme-panel-bg, rgb(15, 15, 20));
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .glyph-img {
    height: 1em;
    width: auto;
    display: block;
    /* Hold the glyph's own aspect ratio. `width: auto` alone does not survive
       being a flex item in a container that is out of room — the default
       `flex-shrink: 1` overrides it and squashes the box. */
    flex-shrink: 0;
  }

  .glyph-img.alpha-baseline {
    transform: translateY(10%);
  }

  .word-header.dark-mode .glyph-img,
  :global(:root.dark) .word-header:not([data-controlled]) .glyph-img {
    filter: invert(0.9);
  }

  .dash-bar {
    display: inline-block;
    height: 0.2em;
    width: 0.7em;
    background: currentColor;
    border-radius: 9999px;
    flex-shrink: 0;
  }

  .letter {
    display: inline-flex;
    align-items: center;
    gap: 0.08em;
    /* Never absorb the parent's overflow. `.dash-bar` and `.group-dot` already
       declared this; the letters themselves — the things most visibly damaged by
       it — did not. */
    flex-shrink: 0;
    font-family: "TKA Letters", var(--font-sans, sans-serif);
    font-feature-settings:
      "liga" 1,
      "dlig" 1;
    font-weight: normal;
    opacity: 0.2;
    /* Opacity only. Tweening `filter` meant a drop-shadow blur convolution per
       letter per frame, and this header re-marks its active letter on every
       step of playback — the most frequently restyled text on the page. The
       glow now snaps in with the opacity ramp: one raster per state change
       instead of one per frame. */
    transition: opacity 0.15s ease;
  }

  .letter.active {
    opacity: 1;
    filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.3));
  }

  /* Segment separator for compressed words (BΦ- · AΦ-). Matches TKAWordGlyph. */
  .group-dot {
    display: inline-block;
    width: 0.15em;
    height: 0.15em;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.4;
    margin: 0 0.1em;
    flex-shrink: 0;
  }

  .letter.animated,
  .group-dot.animated {
    opacity: 0;
    transform: translateY(8px) scale(0.8);
  }

  .letter.animated {
    display: inline-flex;
  }

  .letter.animated.entering,
  .group-dot.animated.entering {
    animation: letterEnter var(--duration-emphasis)
      cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    animation-delay: calc(
      var(--letter-index) * (180ms / max(var(--total-letters), 4))
    );
  }

  .letter.animated.exiting,
  .group-dot.animated.exiting {
    opacity: 1;
    transform: translateY(0) scale(1);
    animation: letterExit var(--duration-normal) cubic-bezier(0.4, 0, 1, 1)
      forwards;
    animation-delay: calc(
      var(--letter-index) * (120ms / max(var(--total-letters), 4))
    );
  }

  .letter.animated.visible,
  .group-dot.animated.visible {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  /* The dot rests at 0.4 opacity, so its enter/exit keyframes target that
     instead of letterEnter/letterExit's fill-forwards opacity of 1. */
  .group-dot.animated.entering {
    animation-name: dotEnter;
  }

  .group-dot.animated.exiting {
    opacity: 0.4;
    animation-name: dotExit;
  }

  .group-dot.animated.visible {
    opacity: 0.4;
  }

  @keyframes dotEnter {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.8);
    }
    to {
      opacity: 0.4;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes dotExit {
    from {
      opacity: 0.4;
      transform: translateY(0) scale(1);
    }
    to {
      opacity: 0;
      transform: translateY(-6px) scale(0.85);
    }
  }

  @keyframes letterEnter {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.8);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes letterExit {
    from {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    to {
      opacity: 0;
      transform: translateY(-6px) scale(0.85);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .letter.animated,
    .letter.animated.entering,
    .letter.animated.exiting,
    .letter.animated.visible {
      animation: none;
      opacity: 1;
      transform: none;
    }

    .group-dot.animated,
    .group-dot.animated.entering,
    .group-dot.animated.exiting,
    .group-dot.animated.visible {
      animation: none;
      opacity: 0.4;
      transform: none;
    }
  }
</style>
