<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import {
    compressWord,
    parseWordNotation,
    simplifyAndTruncate,
  } from "#lib/shared/foundation/utils/word-simplifier.js";
  import WordActionMenu, {
    type WordActionTrigger,
  } from "#lib/shared/choreo-card/components/WordActionMenu.svelte";
  import type { LetterSource } from "#lib/shared/create/domain/spell-models.js";
  import { practiceAnimationStyle } from "../../../state/practice-animation-style.svelte";
  import { getGlyphCache } from "#lib/shared/render/get-glyph-cache.js";
  import {
    isDashLetter,
    getBaseLetter,
  } from "#lib/shared/pictograph/tka-glyph/utils/letter-image-getter.js";
  import { browser } from "$app/env";
  import { motionDuration } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { untrack } from "svelte";
  import { fitWordLabel, type WordLabelFit } from "./word-label-fit";

  const cache = browser ? getGlyphCache() : null;

  // A long word shrinks until its letters are this tall, then shortens.
  const MIN_LETTER_PX = 12;

  // Props

  let {
    word = "",
    scrollMode = false,
    letterSources = null,
    activeStepNumber = null,
    historyTransitionEpoch = 0,
    historyWordChanged = false,
  } = $props<{
    word?: string;
    scrollMode?: boolean;
    /** Optional: When provided, renders letters with different styles for original vs bridge */
    letterSources?: LetterSource[] | null;
    /** Optional: Current beat number during animation playback (1-indexed) for letter highlighting */
    activeStepNumber?: number | null;
    historyTransitionEpoch?: number;
    historyWordChanged?: boolean;
  }>();

  // Computed: Whether we have letter source data to render styled letters
  const hasLetterSources = $derived(
    letterSources !== null && letterSources.length > 0
  );

  // Computed: Whether animation highlighting is active
  const hasActiveHighlighting = $derived(
    activeStepNumber !== null && activeStepNumber >= 1
  );

  // State
  let labelElement: HTMLButtonElement | null = $state(null);
  // A hidden copy of the whole row at normal size. The visible row can't be
  // measured for this: once it is squeezed into its slot it reports the
  // squeezed width, never the word's own.
  let rulerElement: HTMLSpanElement | null = $state(null);

  // The fit the ruler last decided. `fitCount` null shows every unit.
  let fitScale = $state(1);
  let fitCount = $state<number | null>(null);
  let fitTruncated = $state(false);
  let fitMayAnimate = $state(false);
  let hasFitted = false;

  $effect(() => {
    const epoch = historyTransitionEpoch;
    if (!historyWordChanged || epoch === 0 || !labelElement) return;

    const duration = motionDuration(DURATION.normal);
    if (duration === 0) return;
    const animation = labelElement.animate(
      // Opacity only. A `brightness()` keyframe put the whole label behind a
      // filter surface for the length of the transition, which is paint per
      // frame for a cue that opacity already carries.
      [{ opacity: 0.5 }, { opacity: 1 }],
      {
        duration,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      }
    );
    return () => animation.cancel();
  });

  // Check if this is a contextual message (not a word)
  const isContextualMessage = $derived.by(() => {
    const contextualPhrases = [
      "Configure Your Settings",
      "Drawing Left Hand Path",
      "Drawing Right Hand Path",
      "Sequence Complete!",
      "Draw Hand Path",
      "Choose your start placement!",
      "Choose the left-hand starting location",
      "Configure sequence parameters",
      "Select your first step!",
      "Choose your 1st pictograph!",
    ];
    return contextualPhrases.some((phrase) => word.includes(phrase));
  });

  // The word's own slot, so a long label never borrows room reserved for the
  // workspace actions or the badges beside it.
  function findLabelHost(label: HTMLElement): HTMLElement | null {
    return (
      (label.closest(".word-label-slot") as HTMLElement | null) ??
      (label.closest(".word-label-area") as HTMLElement | null) ??
      label.parentElement
    );
  }

  function px(value: string): number {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /**
   * Measure the ruler and the slot, then let fitWordLabel decide. Runs after
   * the DOM updates and from ResizeObserver, both before the next paint, so a
   * row that does not fit is never drawn.
   */
  function measureFit() {
    const label = labelElement;
    const ruler = rulerElement;
    if (!label || !ruler) return;
    const host = findLabelHost(label);
    if (!host) return;

    // The button's hover and press scale reach getBoundingClientRect; divide
    // it back out so the widths are layout widths.
    const rulerBox = ruler.getBoundingClientRect().width;
    const zoom =
      ruler.offsetWidth > 0 && rulerBox > 0 ? rulerBox / ruler.offsetWidth : 1;
    const widthOf = (element: Element | null) =>
      element ? element.getBoundingClientRect().width / zoom : 0;

    const unitWidths = Array.from(
      ruler.querySelectorAll("[data-fit-unit]"),
      widthOf
    );
    const chevron = ruler.querySelector(".menu-indicator");
    const trailingWidth =
      widthOf(chevron) +
      (chevron ? px(getComputedStyle(chevron).marginLeft) : 0);

    const labelStyle = getComputedStyle(label);
    const fixedWidth =
      px(labelStyle.paddingLeft) +
      px(labelStyle.paddingRight) +
      px(labelStyle.borderLeftWidth) +
      px(labelStyle.borderRightWidth);
    const fontSize = px(labelStyle.fontSize);

    const hostStyle = getComputedStyle(host);
    const available =
      host.clientWidth - px(hostStyle.paddingLeft) - px(hostStyle.paddingRight);

    applyFit(
      fitWordLabel({
        unitWidths,
        gap: px(getComputedStyle(ruler).columnGap),
        ellipsisWidth: widthOf(ruler.querySelector(".ellipsis")),
        trailingWidth,
        fixedWidth,
        available,
        minScale: fontSize > 0 ? Math.min(1, MIN_LETTER_PX / fontSize) : 1,
        endsInEllipsis,
        separators: displayUnits.map((unit) => unit.kind === "dot"),
      })
    );
  }

  function applyFit(next: WordLabelFit) {
    const count = next.truncated ? next.visibleCount : null;
    if (
      next.scale === fitScale &&
      count === fitCount &&
      next.truncated === fitTruncated
    )
      return;
    // Only growing eases. A shrink that eased would spend its whole duration
    // wider than the slot, and the first fit after mount just lands.
    fitMayAnimate = hasFitted && next.scale > fitScale;
    hasFitted = true;
    fitScale = next.scale;
    fitCount = count;
    fitTruncated = next.truncated;
  }

  // Decide again whenever the units change. Glyphs landing later change the
  // ruler's width, which the ResizeObserver below catches.
  $effect(() => {
    void displayUnits;
    void endsInEllipsis;
    if (!labelElement || !rulerElement) return;
    untrack(measureFit);
  });

  // And whenever the slot or the ruler resizes.
  $effect(() => {
    const label = labelElement;
    const ruler = rulerElement;
    if (!label || !ruler) return;

    // A callback already queued can still arrive after teardown.
    let live = true;
    const resizeObserver = new ResizeObserver(() => {
      if (live) untrack(measureFit);
    });
    const host = findLabelHost(label);
    if (host) resizeObserver.observe(host);
    resizeObserver.observe(ruler);

    return () => {
      live = false;
      resizeObserver.disconnect();
    };
  });

  // Derived simplified word (only truncate actual words, not contextual messages)
  const displayWord = $derived(
    isContextualMessage ? word : simplifyAndTruncate(word, 12)
  );

  // A word longer than 12 letters comes back as its first 12 and "...". The
  // dots are drawn as the label's ellipsis, not as letters, so a word cut
  // again to fit its slot still shows one ellipsis.
  const WORD_ELLIPSIS = "...";
  const displayLetters = $derived(
    !isContextualMessage && displayWord.endsWith(WORD_ELLIPSIS)
      ? displayWord.slice(0, -WORD_ELLIPSIS.length)
      : displayWord
  );

  // LOOP transformations can produce adjacent repeated runs rather than one
  // repeated whole word. Show each run once with the same separator used by
  // animation headers, card glyphs, and exports.
  const compressedSegments = $derived.by(() => {
    if (!word || isContextualMessage) return null;
    const notationUnits = parseWordNotation(word);
    const skewedCount = notationUnits.filter((unit) => unit.skewed).length;
    if (skewedCount > 0 && skewedCount < notationUnits.length) return null;
    const segments = compressWord(word);
    if (segments.length < 2 && !segments.some((segment) => segment.repeat > 1))
      return null;
    const letterCount = segments.reduce(
      (count, segment) => count + segment.tokens.length,
      0
    );
    return letterCount <= 12 ? segments : null;
  });

  /**
   * Parse display word into TKA letter units (handles dash-letters like "Λ-")
   */
  const parsedLetters = $derived.by(() => {
    if (!displayLetters || isContextualMessage) return [];
    const letters: string[] = [];
    for (let i = 0; i < displayLetters.length; i++) {
      const char = displayLetters[i]!;
      const nextChar = displayLetters[i + 1];
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
    | {
        kind: "letter";
        letter: string;
        letterIdx: number;
        source: LetterSource | null;
      }
    | { kind: "dot" };

  const displayUnits = $derived.by((): DisplayUnit[] => {
    if (isContextualMessage) return [];

    if (compressedSegments) {
      const units: DisplayUnit[] = [];
      let letterIdx = 0;
      let sourceOffset = 0;

      compressedSegments.forEach((segment, segmentIdx) => {
        if (segmentIdx > 0) units.push({ kind: "dot" });
        segment.tokens.forEach((letter, tokenIdx) => {
          units.push({
            kind: "letter",
            letter,
            letterIdx: letterIdx++,
            source: letterSources?.[sourceOffset + tokenIdx] ?? null,
          });
        });
        sourceOffset += segment.tokens.length * segment.repeat;
      });

      return units;
    }

    if (hasLetterSources) {
      return letterSources!.map((source: LetterSource, letterIdx: number) => ({
        kind: "letter" as const,
        letter: source.letter,
        letterIdx,
        source,
      }));
    }

    return parsedLetters.map((letter, letterIdx) => ({
      kind: "letter" as const,
      letter,
      letterIdx,
      source: null,
    }));
  });

  // Only the plain-letters path above reads the cut 12-letter word.
  const endsInEllipsis = $derived(
    !isContextualMessage &&
      !compressedSegments &&
      !hasLetterSources &&
      displayLetters !== displayWord
  );

  // What the visible row draws: every unit, or the first N the fit allows.
  // A letter cut off here never highlights, since nothing draws it.
  const visibleUnits = $derived(
    fitCount === null ? displayUnits : displayUnits.slice(0, fitCount)
  );
  const showsEllipsis = $derived(endsInEllipsis || fitTruncated);

  /**
   * Active letter index with wrapping for circular sequences (0-indexed).
   * Compressed runs still follow the expanded beat count, then map each beat
   * back to the representative letters visible in the label.
   */
  const activeLetterIndex = $derived.by(() => {
    if (!hasActiveHighlighting) return -1;
    if (compressedSegments) {
      const total = compressedSegments.reduce(
        (count, segment) => count + segment.tokens.length * segment.repeat,
        0
      );
      if (total === 0) return -1;

      let expandedIndex = (activeStepNumber! - 1) % total;
      let displayOffset = 0;
      for (const segment of compressedSegments) {
        const span = segment.tokens.length * segment.repeat;
        if (expandedIndex < span) {
          return displayOffset + (expandedIndex % segment.tokens.length);
        }
        expandedIndex -= span;
        displayOffset += segment.tokens.length;
      }
      return -1;
    }

    const displayedLetterCount = displayUnits.filter(
      (unit) => unit.kind === "letter"
    ).length;
    if (displayedLetterCount === 0) return -1;
    // activeStepNumber is 1-indexed, modulo to wrap around
    return (activeStepNumber! - 1) % displayedLetterCount;
  });

  // Bumped when on-demand glyph loads resolve, so getGlyphUrl re-reads the
  // (non-reactive) GlyphCache and the rendered <img> swaps in once the SVG lands.
  let glyphLoadVersion = $state(0);

  // The letters this label needs glyphs for, from whichever source is active.
  const neededTokens = $derived.by<string[]>(() => {
    if (isContextualMessage) return [];
    return displayUnits.flatMap((unit) =>
      unit.kind === "letter" ? [unit.letter] : []
    );
  });

  // The global startup warm (+layout) is deferred to idle, so the cache is
  // usually cold when this label first paints — without this it falls back to
  // plain text and never recovers (the cache read isn't reactive). Load just
  // the letters this word needs on demand, then trigger a re-read.
  $effect(() => {
    const c = cache;
    if (!c) return;
    const tokens = neededTokens;
    if (tokens.length === 0) return;
    const bases = [
      ...new Set(tokens.map((t) => (isDashLetter(t) ? getBaseLetter(t) : t))),
    ];
    const missing = bases.filter((b) => b && !c.getGlyphDataUrl(b));
    if (missing.length === 0) return;
    c.loadGlyphsByLetter(missing).then(() => {
      glyphLoadVersion++;
    });
  });

  function getGlyphUrl(letter: string): string | null {
    void glyphLoadVersion; // re-read cache after on-demand loads resolve
    if (!cache) return null;
    const base = isDashLetter(letter) ? getBaseLetter(letter) : letter;
    return cache.getGlyphDataUrl(base);
  }

  function isAlphaGlyph(letter: string): boolean {
    const base = isDashLetter(letter) ? getBaseLetter(letter) : letter;
    return base === "α";
  }

  // Only show word label if there's an actual word (not empty, not default sequence names)
  const shouldShowWordLabel = $derived.by(() => {
    if (!word) return false;
    // Always show contextual messages
    if (isContextualMessage) return true;
    return true;
  });
</script>

<!-- One letter's artwork, shared by the visible row and the ruler so the two
     always measure alike. The ruler passes an empty alt. -->
{#snippet letterArt(letter: string, url: string | null, alt: string)}
  {#if url}
    <img
      src={url}
      {alt}
      class="glyph-img"
      class:alpha-baseline={isAlphaGlyph(letter)}
      draggable="false"
    />
    {#if isDashLetter(letter)}<span class="dash-bar"></span>{/if}
  {:else}{letter}{/if}
{/snippet}

{#if shouldShowWordLabel}
  <div class="word-label-container" class:scroll-mode={scrollMode}>
    {#snippet wordTrigger(actions: WordActionTrigger)}
      <button
        bind:this={labelElement}
        class="word-label"
        class:has-word={!!word && !isContextualMessage}
        class:contextual-message={isContextualMessage}
        class:has-letter-sources={hasLetterSources}
        disabled={isContextualMessage}
        onclick={actions.onclick}
        oncontextmenu={actions.oncontextmenu}
        onpointerdown={actions.onpointerdown}
        onpointermove={actions.onpointermove}
        onpointerup={actions.onpointerup}
        onpointercancel={actions.onpointercancel}
        onpointerleave={actions.onpointerleave}
        title={isContextualMessage
          ? word
          : t("viewer_header_word_actions_for", { word: actions.copyableWord })}
        aria-haspopup={isContextualMessage ? undefined : "menu"}
        aria-expanded={isContextualMessage ? undefined : actions.isOpen}
        aria-label={isContextualMessage
          ? word
          : t("viewer_header_current_word_actions", {
              word: actions.copyableWord,
            })}
      >
        {#if !isContextualMessage && displayUnits.length > 0}
          <!-- The fit lands as a font size, not a transform: every piece of
               the row is sized in em, so the row really is the size it looks
               and nothing past the slot's edge is left to crop. -->
          <span
            class="word-fit-row"
            class:fit-eases={fitMayAnimate}
            style:--word-fit-size="calc(1em * {fitScale})"
          >
            {#each visibleUnits as unit, index (index)}
              {#if unit.kind === "dot"}
                <span class="group-dot" aria-hidden="true"></span>
              {:else}
                {@const url = getGlyphUrl(unit.letter)}
                <span
                  class="letter"
                  class:original={unit.source?.isOriginal === true}
                  class:bridge={unit.source?.isOriginal === false}
                  class:playback={hasActiveHighlighting && unit.source === null}
                  class:active={hasActiveHighlighting &&
                    activeLetterIndex === unit.letterIdx}
                  class:active-intense={hasActiveHighlighting &&
                    activeLetterIndex === unit.letterIdx &&
                    practiceAnimationStyle.current === "intense"}
                  class:active-subtle={hasActiveHighlighting &&
                    activeLetterIndex === unit.letterIdx &&
                    practiceAnimationStyle.current === "subtle"}
                  class:active-glow-only={hasActiveHighlighting &&
                    activeLetterIndex === unit.letterIdx &&
                    practiceAnimationStyle.current === "glow-only"}
                  class:active-minimal={hasActiveHighlighting &&
                    activeLetterIndex === unit.letterIdx &&
                    practiceAnimationStyle.current === "minimal"}
                  class:active-wave={hasActiveHighlighting &&
                    activeLetterIndex === unit.letterIdx &&
                    practiceAnimationStyle.current === "wave"}
                >
                  {@render letterArt(unit.letter, url, unit.letter)}
                </span>
              {/if}
            {/each}
            {#if showsEllipsis}<span class="ellipsis" aria-hidden="true"
                >{WORD_ELLIPSIS}</span
              >{/if}
            <i class="fas fa-chevron-down menu-indicator" aria-hidden="true"
            ></i>
          </span>

          <!-- The ruler: the whole row at the button's own font size, never
               scaled and never cut, so the fit always knows the word's true
               width. Hidden from sight, pointer and screen reader alike. -->
          <span class="word-ruler-frame" aria-hidden="true" inert>
            <span class="word-ruler" bind:this={rulerElement}>
              {#each displayUnits as unit, index (index)}
                {#if unit.kind === "dot"}
                  <span class="group-dot" data-fit-unit></span>
                {:else}
                  <span class="letter" data-fit-unit>
                    {@render letterArt(
                      unit.letter,
                      getGlyphUrl(unit.letter),
                      ""
                    )}
                  </span>
                {/if}
              {/each}
              <span class="ellipsis">{WORD_ELLIPSIS}</span>
              <i class="fas fa-chevron-down menu-indicator"></i>
            </span>
          </span>
        {:else}
          {displayWord}
          {#if !isContextualMessage}
            <i class="fas fa-chevron-down menu-indicator" aria-hidden="true"
            ></i>
          {/if}
        {/if}
      </button>

      {#if actions.copied}
        <div class="copied-message" role="status" aria-live="polite">
          {t("create_word_copied", { word: actions.copyableWord })}
        </div>
      {/if}
    {/snippet}

    <WordActionMenu
      {word}
      enabled={!isContextualMessage}
      errorContext={{ module: "create", tab: "generate" }}
      trigger={wordTrigger}
    />
  </div>
{/if}

<style>
  .word-label-container {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    z-index: 10;
    pointer-events: none;
    /* Enable container queries for intrinsic sizing */
    container-type: inline-size;
    container-name: word-label;
    /* Constrain to parent width - prevents overflow into sibling buttons */
    max-width: 100%;
    overflow: visible;
  }

  .word-label {
    pointer-events: auto;
    font-family: Georgia, serif;
    font-weight: 600;
    /* Auto-scale font based on container width - shrinks for long words */
    font-size: clamp(1rem, 5cqi, 2.5rem);
    color: var(--text-color, #2c3e50);
    background: transparent;
    border: 1px solid transparent;
    cursor: pointer;
    transition:
      background-color var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      box-shadow var(--duration-normal) var(--ease-standard),
      transform var(--duration-normal) var(--ease-standard);
    border-radius: 8px;
    text-align: center;
    white-space: nowrap;
    /* Constrain to container and show ellipsis if needed.
       Using inline-block (not inline-flex) so text-overflow: ellipsis works
       and centering via text-align doesn't clip both sides. */
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    display: inline-block;
    vertical-align: middle;
    padding: 0 8px;
    margin: 0;
    touch-action: manipulation;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }

  .word-label:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    backdrop-filter: blur(4px);
    transform: scale(1.05);
  }

  .word-label:active {
    transform: scale(0.95);
  }

  /* A word never clips: the fit sizes and cuts the row to the slot, so the
     button only ever holds whole letters. Clipping here is what used to hide
     the letters a flex squeeze had already flattened. */
  .word-label.has-word {
    font-size: clamp(1.25rem, 6cqi, 2rem);
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: visible;
    text-overflow: clip;
    max-width: none;
    min-height: var(--min-touch-target, 44px);
    padding: 0.25rem 0.75rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .word-label.has-word[aria-expanded="true"] {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .word-label:focus-visible {
    outline: 2px solid var(--theme-accent, #a855f7);
    outline-offset: 2px;
  }

  /* The row the fit sizes. Its font size is the button's times the fit
     scale; every piece inside is in em, so all of it follows. */
  .word-fit-row {
    /* A word spells itself left to right in every language. */
    direction: ltr;
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 0.12em;
    /* The size is set on the element as the button's em times the scale. */
    font-size: var(--word-fit-size, 1em);
    white-space: nowrap;
  }

  .word-fit-row.fit-eases {
    transition: font-size var(--duration-normal) var(--ease-standard);
  }

  /* Sized like the button, clipping the ruler so its full width never adds
     scrollable room to anything around the label. */
  .word-ruler-frame {
    position: absolute;
    inset: 0;
    overflow: hidden;
    visibility: hidden;
    pointer-events: none;
  }

  .word-ruler {
    direction: ltr;
    position: absolute;
    top: 0;
    left: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.12em;
    width: max-content;
    white-space: nowrap;
  }

  .word-ruler > * {
    flex: none;
  }

  .ellipsis {
    flex: none;
    line-height: 1;
  }

  /* Contextual messages (hand path status, etc.) - Container-aware sizing */
  .word-label.contextual-message {
    font-family:
      -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-weight: 600;
    /* Intrinsic sizing based on container width - scales from 1rem at 300px to 2.5rem at 800px+ */
    font-size: clamp(1rem, 5cqi, 2.5rem);
    max-width: 100%;
    padding: 0.5rem 1rem;
    white-space: nowrap;
    color: var(--text-color, #2c3e50);
  }

  /* Fine-tune sizing at different container widths */
  @container word-label (min-width: 600px) {
    .word-label.contextual-message {
      font-size: clamp(1.25rem, 5.5cqi, 2.5rem);
    }
  }

  @container word-label (min-width: 800px) {
    .word-label.contextual-message {
      font-size: clamp(1.5rem, 6cqi, 3rem);
    }
  }

  .word-label.contextual-message:hover {
    background: transparent;
    transform: none;
    cursor: default;
  }

  .word-label.contextual-message:disabled {
    opacity: 1;
  }

  .menu-indicator {
    margin-left: 0.25em;
    font-size: 0.4em;
    opacity: 0.55;
    flex: none;
    transition: transform var(--duration-fast) var(--ease-standard);
  }

  .word-label[aria-expanded="true"] .menu-indicator {
    transform: rotate(180deg);
  }

  .copied-message {
    position: absolute;
    top: 110%;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(46, 204, 113, 0.95);
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 600;
    white-space: nowrap;
    animation: fadeInOut calc(var(--duration-scene) * 2.5) var(--ease-standard);
    pointer-events: none;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  @keyframes fadeInOut {
    0% {
      opacity: 0;
      transform: translateX(-50%) translateY(-10px);
    }
    15% {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    85% {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    100% {
      opacity: 0;
      transform: translateX(-50%) translateY(-10px);
    }
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .word-label {
      font-size: clamp(1.25rem, 5cqi, 2rem);
      padding: 0.2rem 0.5rem;
    }

    .copied-message {
      font-size: 0.8rem;
      padding: 0.4rem 0.8rem;
    }
  }

  /* Ultra-narrow screens */
  @media (max-width: 480px) {
    .word-label {
      font-size: clamp(1rem, 6vw, 1.75rem);
    }
  }

  /* A letter still waiting for its glyph renders as text in the same 1em box
     the glyph image takes, so the swap never changes the label's height. */
  /* Letters, dots and bars never give up width: a squeezed glyph image has
     no minimum and flattens to nothing. The fit makes the room instead. */
  .letter {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 0.08em;
    height: 1em;
    line-height: 1;
    /* Opacity only. The active-state glow is a static drop-shadow that paints
       once when the class flips; transitioning `filter` re-ran the shadow pass
       every frame for 300ms on every letter in the word. */
    transition: opacity var(--duration-emphasis) var(--ease-standard);
  }

  .glyph-img {
    height: 1em;
    width: auto;
    flex: none;
    display: block;
    filter: invert(0.9);
  }

  .glyph-img.alpha-baseline {
    transform: translateY(10%);
  }

  .dash-bar {
    display: inline-block;
    height: 0.2em;
    width: 0.7em;
    background: currentColor;
    border-radius: 9999px;
    flex: none;
  }

  /* Segment separator for compressed words (HΨ- · GΨ-). */
  .group-dot {
    display: inline-block;
    width: 0.15em;
    height: 0.15em;
    margin: 0 0.1em;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.4;
    flex: none;
  }

  .letter.original {
    opacity: 1;
  }

  .letter.bridge {
    opacity: 0.4;
  }

  /* When has letter sources, no extra spacing between letter spans */
  .word-label.has-letter-sources {
    word-spacing: 0;
    letter-spacing: 0;
  }

  .letter.playback {
    opacity: 0.25;
  }

  .letter.active {
    opacity: 1;
  }

  .letter.active-intense {
    filter: drop-shadow(0 0 14px rgba(255, 255, 255, 0.5))
      drop-shadow(0 0 28px rgba(255, 255, 255, 0.22));
    animation: letterPopIntense var(--duration-normal) var(--ease-spring);
  }

  /* Transform only: the glow is the static drop-shadow on `.active-intense`. */
  @keyframes letterPopIntense {
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.1);
    }
    100% {
      transform: scale(1);
    }
  }

  .letter.active-subtle {
    filter: drop-shadow(0 0 12px rgba(255, 255, 255, 0.5));
    animation: letterFadeSubtle var(--duration-normal) var(--ease-standard-out);
  }

  @keyframes letterFadeSubtle {
    0% {
      transform: scale(1);
      opacity: 0.5;
    }
    100% {
      transform: scale(1.02);
      opacity: 1;
    }
  }

  .letter.active-glow-only {
    filter: drop-shadow(0 0 16px rgba(255, 255, 255, 0.6));
    animation: letterGlowOnly var(--duration-fast) var(--ease-standard-out);
  }

  /* The glow itself is static on `.active-glow-only`; this reveals it with an
     opacity fade instead of tweening the shadow pass. */
  @keyframes letterGlowOnly {
    0% {
      opacity: 0.55;
    }
    100% {
      opacity: 1;
    }
  }

  .letter.active-minimal {
    filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.4));
    animation: letterMinimal var(--duration-instant) var(--ease-standard-out);
  }

  @keyframes letterMinimal {
    0% {
      opacity: 0.7;
    }
    100% {
      opacity: 1;
    }
  }

  .letter.active-wave {
    filter: drop-shadow(0 0 14px rgba(255, 255, 255, 0.5));
    animation: letterWave var(--duration-dramatic) var(--ease-standard-out);
  }

  /* Transform only: the glow is the static drop-shadow on `.active-wave`. */
  @keyframes letterWave {
    0% {
      transform: scale(0.95);
    }
    30% {
      transform: scale(1.08);
    }
    100% {
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .copied-message {
      animation: none;
    }
    .active-intense,
    .active-subtle,
    .active-glow-only,
    .active-minimal,
    .active-wave {
      animation: none;
    }
    .menu-indicator,
    .word-fit-row.fit-eases {
      transition: none;
    }
  }
</style>
