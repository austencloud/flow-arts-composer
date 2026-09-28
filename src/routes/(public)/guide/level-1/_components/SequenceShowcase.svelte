<script lang="ts">
  /**
   * The single way the guide flow view presents a word sequence: a banner -
   * square live animation canvas on the LEFT, the section's text on the right -
   * with the sequence's steps unrolled beneath as one full-width GuideStepStrip.
   * Spec: docs/superpowers/specs/2026-07-16-sequence-showcase-design.md.
   *
   * DOM order is text-then-canvas (prose first for SSR/readers); the canvas sits
   * visually left via row-reverse. The strip is always prerendered (crawlable);
   * only the animation is browser-gated and LAZY-MOUNTED - the player mounts
   * within one screen of the viewport and unmounts a screen away, so a page of
   * many showcases only runs the players near the reader (the player warns about
   * stacking 100+). The reserved square keeps mount/unmount from shifting layout.
   * The gold ring (the sequence viewer's playback recipe) marks the canvas while
   * it's in frame.
   */
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import InlineAnimationPlayer from "$lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte";
  import GuideStepStrip from "./GuideStepStrip.svelte";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { describePictograph } from "$lib/shared/pictograph/shared/domain/utils/pictograph-description";
  import { stripToSequence } from "../_data/guide-sequence-adapter";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { guideTurnDisplayWord } from "../_data/guide-turn-display-word";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import type { PictographRender, PoolEntry } from "../_data/guide-content-blocks";
  import type { Snippet } from "svelte";

  let {
    sequence,
    items,
    stepLabels,
    render,
    picTheme = "light",
    bpm = 60,
    variant = "feature",
    pool,
    text,
    strip,
  }: {
    /** Playable sequence for the animation canvas (the DEFAULT / entry-0 example). */
    sequence: SequenceData;
    /** The same sequence's pictographs, in reading order, for the step strip. */
    items: PictographData[];
    stepLabels?: string[];
    render?: PictographRender;
    picTheme?: "light" | "dark";
    bpm?: number;
    /**
     * Shape by content density:
     * - "feature": real section prose in the text slot → banner (canvas left,
     *   text column right) with the strip full-width beneath.
     * - "compact": caption-only text → one tight band that hugs its content:
     *   smaller canvas left, label + strip stacked right. A caption-sized label
     *   in the feature banner's text column leaves a void of empty space.
     */
    variant?: "feature" | "compact";
    /**
     * Refreshable example pool. `pool[0]` is the DEFAULT (this component's
     * `sequence`/`items` props - the print example that prerenders). The reader
     * cycles to `pool[1..N]` client-side; each entry carries its own prose. Omit
     * → behaviour is byte-identical to a single frozen example.
     */
    pool?: PoolEntry[];
    /** The text slot: heading + prose (feature) or word + caption (compact). */
    text?: Snippet;
    /**
     * Override for the strip: when provided, renders in place of the internal
     * GuideStepStrip in BOTH variants (e.g. level-2's TurnStrip breakdown -
     * start/halfway/end/combined - rather than a plain pictograph row). The
     * canvas still plays `sequence`; the override is presentation-only for the
     * strip slot. Pool cycling is unsupported with a strip override (the pool
     * exists to refresh GuideStepStrip's own items - a fixed strip snippet has
     * no per-entry variant to cycle to) - if both are passed, `pool` is ignored.
     */
    strip?: Snippet<[number]>;
  } = $props();

  const propType = $derived(render?.propType ?? PropType.HAND);

  // Index is CLIENT state (default 0), so entries 1+ never render server-side -
  // only the default example's strip prerenders (the SEO / page-weight split).
  // A `strip` override disables the pool (see the prop doc above).
  let exampleIndex = $state(0);
  const effectivePool = $derived(strip ? undefined : pool);
  const hasPool = $derived(!!effectivePool && effectivePool.length > 1);
  const total = $derived(effectivePool?.length ?? 1);
  const entry = $derived(effectivePool?.[exampleIndex]);
  // Current strip: the pool entry's items, or the plain `items` prop.
  const curItems = $derived(entry ? entry.items : items);
  // Current playable sequence: entry 0 reuses the SSR'd `sequence` prop
  // (byte-identical); entries 1+ build lazily via the same path FlowFrame uses.
  // $derived memoises, so this only rebuilds when the index changes (on cycle),
  // giving the player a referentially-stable sequence between cycles.
  const curSequence = $derived(
    entry && exampleIndex > 0
      ? stripToSequence(entry.items as unknown as StepData[], {
          word: entry.word,
          name: entry.word,
        })
      : sequence,
  );

  function nextExample() {
    if (!pool || pool.length < 2) return;
    exampleIndex = (exampleIndex + 1) % pool.length;
  }

  let rootEl: HTMLElement | undefined = $state();
  let near = $state(false);
  let inView = $state(false);

  // ── Loop etiquette (spec decision 3) ────────────────────────────────────
  // Play ONCE, the first time the canvas actually scrolls into view (not just
  // "near" — near only gates lazy-mount) — never on later re-scrolls, and
  // never at all under prefers-reduced-motion (static start pose + play badge
  // instead). `hasEnteredView` is sticky: it flips true once and stays there.
  let reducedMotion = $state(false);
  let hasEnteredView = $state(false);
  $effect(() => {
    if (inView && !hasEnteredView) hasEnteredView = true;
  });
  const shouldAutoPlay = $derived(!reducedMotion && hasEnteredView);

  // ── Playhead sync (spec decision 4 / ledger B1) ─────────────────────────
  // The live 1-based fractional beat from InlineAnimationPlayer.onStepChange,
  // converted to a 0..1 ratio across the whole sequence (same zero-based/
  // modulo-free shape as SequenceProgressBar's own `progress` derivation,
  // minus the loop-wrap modulo — single-play showcases never wrap) and to an
  // integer "beat N" (0 = start) for GuideStepStrip's per-cell highlight.
  let liveStep = $state(0);
  function handleStepChange(step: number) {
    liveStep = step;
  }
  const totalBeats = $derived(curSequence?.steps?.length ?? 0);
  const activeT = $derived.by(() => {
    if (totalBeats <= 0) return 0;
    const zeroBased = liveStep < 1 ? 0 : liveStep - 1;
    return Math.max(0, Math.min(1, zeroBased / totalBeats));
  });
  const activeBeat = $derived(liveStep < 1 ? 0 : Math.floor(liveStep));

  onMount(() => {
    if (typeof window !== "undefined" && "matchMedia" in window) {
      reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    const el = rootEl;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      near = true;
      inView = true;
      return;
    }
    // Mount/unmount gate - one screen of buffer each side (hysteresis so normal
    // scrolling doesn't churn the player).
    const nearIO = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) near = entry.isIntersecting;
      },
      { root: null, rootMargin: "100% 0px", threshold: 0 }
    );
    // Gold-ring gate - actual on-screen presence.
    const viewIO = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) inView = entry.isIntersecting;
      },
      { root: null, rootMargin: "0px", threshold: 0.15 }
    );
    nearIO.observe(el);
    viewIO.observe(el);
    return () => {
      nearIO.disconnect();
      viewIO.disconnect();
    };
  });
</script>

{#snippet player()}
  {#if browser && near}
    <!-- InlineAnimationPlayer reacts to sequence changes (its $effect reloads on
         id/word/name change), so cycling just hands it curSequence - no remount,
         no layout shift (the reserved square never moves). -->
    <InlineAnimationPlayer
      sequence={curSequence}
      displayWord={curSequence.word
        ? guideTurnDisplayWord(curSequence.word)
        : null}
      chrome="minimal"
      fill={true}
      autoPlay={shouldAutoPlay}
      externalBpm={bpm}
      leftPropType={propType}
      rightPropType={propType}
      scrubbable
      singlePlay
      beatIndicators={false}
      onStepChange={handleStepChange}
    />
  {/if}
{/snippet}

<!-- The cycle affordance + the per-example prose (ghost-sizer stacked so the
     column reserves the tallest variant - zero layout shift on cycle). -->
{#snippet poolControls()}
  {#if hasPool}
    <div class="example-prose" aria-live="polite">
      <!-- Ghost sizers: every variant, hidden, reserve the tallest height. -->
      {#each pool ?? [] as e, i (i)}
        <p class="ex-ghost" aria-hidden="true">{e.proseHtml}</p>
      {/each}
      <!-- The live prose sits atop the sizers; its text changes on cycle and the
           aria-live region announces it. -->
      <p class="ex-live">{entry?.proseHtml}</p>
    </div>
    <div class="cycle">
      <button
        type="button"
        class="cycle-btn"
        onclick={nextExample}
        aria-label={entry?.loopLabel
          ? t("guide_show_another_loop_example", { loop: entry.loopLabel })
          : t("guide_show_another_example")}
      >
        {t("guide_show_another_example")}
      </button>
      <span class="cycle-count" aria-hidden="true">{exampleIndex + 1} / {total}</span>
    </div>
  {/if}
{/snippet}

<section
  class="showcase"
  class:compact={variant === "compact"}
  class:has-strip={!!strip}
  bind:this={rootEl}
>
  {#if variant === "compact"}
    <!-- One tight band: canvas | (label over strip). Hugs its content and
         centres - a caption-sized label gets no empty text column. -->
    <div class="compact-band">
      <div class="canvas-box" class:in-view={inView}>
        {@render player()}
      </div>
      <div class="compact-right">
        {#if strip}
          {@render strip(activeT)}
        {:else}
          <!-- The label rides in the strip's start ROW - beside the start box,
               filling the band the tab layout leaves free. -->
          <GuideStepStrip {items} {stepLabels} {render} {picTheme} startAside={text} {activeBeat} />
        {/if}
      </div>
    </div>
  {:else}
    <div class="banner">
      <div class="banner-text">
        {@render text?.()}
        {@render poolControls()}
      </div>
      <div class="canvas-box" class:in-view={inView}>
        {@render player()}
      </div>
    </div>

    {#if strip}
      {@render strip(activeT)}
    {:else if hasPool}
      <!-- Every pool entry has the same step count → the same strip height, so a
           keyed Crossfade swaps cleanly with zero layout shift (crossfade rule:
           cheap identical-height content, not the heavy no-remount path). -->
      <Crossfade key={exampleIndex} duration={DURATION.normal}>
        <GuideStepStrip items={curItems} {stepLabels} {render} {picTheme} {activeBeat} />
      </Crossfade>
    {:else}
      <GuideStepStrip {items} {stepLabels} {render} {picTheme} {activeBeat} />
    {/if}
  {/if}

  <!-- Prerendered notation for crawlers + AT (standing rule: never drop it).
       The strip's own SSR aria-labels carry the same data; this block keeps the
       descriptions as continuous text. With a pool, ALL entries' descriptions +
       prose live here so the non-default examples stay crawlable even though
       only entry 0's strip renders visually server-side. -->
  <div class="sr-only">
    {#if hasPool}
      {#each pool ?? [] as e, ei (ei)}
        {#each e.items as pos, n (pos.id ?? `${ei}-${n}`)}
          <span>{describePictograph(pos)}</span>
        {/each}
        <span>{e.proseHtml}</span>
      {/each}
    {:else}
      {#each items as pos, n (pos.id ?? n)}
        <span>{describePictograph(pos)}</span>
      {/each}
    {/if}
  </div>
</section>

<style>
  .showcase {
    /* Its own inline-size container: the banner's stacking rules respond to the
       showcase's real width, wherever the host places it. Inline-size
       containment zeroes intrinsic width, so the showcase must fill its host
       (width: 100%) - a shrink-to-fit host collapses it to nothing. */
    container-type: inline-size;
    width: 100%;
    display: flex;
    flex-direction: column;
    /* The showcase's internal rhythm: banner ↔ strip. Deliberately TIGHTER than
       the space around the showcase (host margin-block), so canvas + text +
       strip read as one unit separated from the flow, not three strays. */
    gap: 0.85rem;
  }
  /* The strip is part of this unit - its standalone figure margins would stack
     on the gap above and double the space below. */
  .showcase :global(.guide-step-strip) {
    margin: 0;
  }

  /* Banner: canvas visually left (row-reverse; text is first in DOM), text
     column vertically centred against the square. */
  .banner {
    display: flex;
    flex-direction: row-reverse;
    align-items: center;
    gap: clamp(1.25rem, 4cqw, 2.5rem);
  }
  .banner-text {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  /* Per-example prose: ghost-sizer grid-stack (no-layout-shift technique 1) -
     every variant occupies one grid cell so the column reserves the TALLEST,
     and cycling never resizes the text box or shoves the strip below. */
  .example-prose {
    display: grid;
    margin-top: 0.15rem;
  }
  .example-prose > .ex-ghost,
  .example-prose > .ex-live {
    grid-area: 1 / 1;
    margin: 0;
    font-family: "Cormorant Garamond", Georgia, serif;
    font-size: 1.2rem;
    font-weight: 500;
    line-height: 1.6;
    color: var(--ink, #1a1a1a);
    text-align: left;
  }
  .example-prose > .ex-ghost {
    visibility: hidden;
    pointer-events: none;
  }

  /* The cycle control reads as a button (clickables-look-like-buttons): a
     bordered, padded, hoverable control with a 44px touch target. Styled in the
     editorial ink palette so it sits in the print-adjacent guide, not the dark
     app chrome - a guide-local button, chosen over FilterChipBase mode="action"
     because that primitive paints with the app's --theme-* tokens (card-bg /
     stroke / text-on-accent) which the white editorial column doesn't set, so it
     renders as a washed-out invisible pill here. */
  .cycle {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    margin-top: 0.7rem;
  }
  .cycle-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--min-touch-target, 44px);
    padding: 0.35rem 1.05rem;
    border-radius: 10px;
    border: 1.5px solid color-mix(in oklab, var(--ink, #1a1a1a) 30%, transparent);
    background: color-mix(in oklab, var(--ink, #1a1a1a) 5%, transparent);
    color: var(--ink, #1a1a1a);
    font-family: "Cormorant Garamond", Georgia, serif;
    font-size: 1.05rem;
    font-weight: 600;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease;
  }
  @media (hover: hover) and (pointer: fine) {
    .cycle-btn:hover {
      background: color-mix(in oklab, var(--ink, #1a1a1a) 12%, transparent);
      border-color: color-mix(in oklab, var(--ink, #1a1a1a) 55%, transparent);
    }
  }
  .cycle-btn:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--semantic-warning, #d4a017) 70%, transparent);
    outline-offset: 2px;
  }
  .cycle-count {
    font-family: "Cormorant Garamond", Georgia, serif;
    font-size: 1rem;
    color: var(--ink-dim, #555);
    font-variant-numeric: tabular-nums;
  }
  @container (max-width: 600px) {
    .example-prose > .ex-ghost,
    .example-prose > .ex-live {
      text-align: center;
    }
    .cycle {
      justify-content: center;
    }
  }

  /* Reserved square for the canvas - mounts/paints without shifting layout.
     Idle: quiet hairline. In frame: the sequence viewer's warm playback border.
     Pointed at: the full gold glow (one showcase lights at a time). */
  .canvas-box {
    position: relative;
    flex: 0 0 clamp(230px, 34cqw, 330px);
    aspect-ratio: 1;
    border-radius: 14px;
    overflow: hidden;
    background: color-mix(in oklab, var(--ink, #1a1a1a) 6%, transparent);
    border: 1.5px solid color-mix(in oklab, var(--ink, #1a1a1a) 12%, transparent);
    transition:
      border-color var(--duration-normal, 260ms) ease,
      box-shadow var(--duration-normal, 260ms) ease;
  }
  .canvas-box.in-view {
    border-color: color-mix(in srgb, var(--semantic-warning) 42%, transparent);
  }
  @media (hover: hover) and (pointer: fine) {
    .canvas-box:hover {
      border-color: color-mix(in srgb, var(--semantic-warning) 85%, transparent);
      box-shadow:
        0 0 12px color-mix(in srgb, var(--semantic-warning) 38%, transparent),
        0 0 24px color-mix(in srgb, var(--semantic-warning) 16%, transparent);
    }
  }
  .canvas-box :global(.inline-animation-player) {
    width: 100%;
    height: 100%;
  }

  /* ── Compact: canvas | (label over strip), the band hugging its content and
     centred in the column. The canvas is smaller - it accompanies a labelled
     strip here rather than anchoring a prose section. */
  .compact-band {
    display: flex;
    align-items: center;
    gap: clamp(1rem, 3cqw, 2rem);
    width: fit-content;
    max-width: 100%;
    margin-inline: auto;
  }
  .compact .canvas-box {
    flex: 0 0 clamp(190px, 24cqw, 250px);
  }
  /* Strip-override compact (e.g. level-2's TurnStrip breakdown): the band
     fills the host and the strip column grows beside the canvas. fit-content
     sizing is impossible here - the strip is itself an inline-size container
     with zero intrinsic width, so hugging it collapses the whole band. */
  .compact.has-strip .compact-band {
    width: 100%;
  }
  .compact.has-strip .canvas-box {
    flex: 0 0 clamp(220px, 26cqw, 320px);
  }
  .compact.has-strip .compact-right {
    flex: 1 1 0;
    min-width: 0;
  }
  .compact-right {
    display: flex;
    flex-direction: column;
    min-width: 0;
    max-width: 100%;
  }

  /* Narrow: stack - text (heading first), then the canvas centred at a capped
     width, then the strip below. */
  @container (max-width: 600px) {
    .banner {
      flex-direction: column;
      align-items: stretch;
      gap: 0.9rem;
    }
    .canvas-box,
    .compact .canvas-box {
      flex: none;
      width: min(100%, 20rem);
      margin-inline: auto;
    }
    .compact-band {
      flex-direction: column;
      align-items: stretch;
      width: 100%;
      gap: 0.9rem;
    }
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

  @media (prefers-reduced-motion: reduce) {
    .canvas-box {
      transition: none;
    }
  }
</style>
