<script lang="ts" module>
  export type CapLevel = "name" | "letters" | "vtg";
</script>

<script lang="ts">
  /**
   * The essay's one live figure: a CAP playing, with a readout that changes
   * with the section being read. At the name level it is just "a CAP"; at the
   * letters level each beat's letter lights as it plays; at the VTG level the
   * playing beat shows its timing and direction (the TnD element) and each
   * hand's spin as the flower that spin draws, with its ratio.
   *
   * Built from the Guide's own pieces: InlineAnimationPlayer (as
   * SequenceShowcase mounts it), GuideStepStrip with the live beat ring,
   * GuidePictograph, TKAWordGlyph, the TnD element table and the Shape
   * Engine's flower painter.
   */
  import { onMount } from "svelte";
  import { browser } from "$app/env";
  import InlineAnimationPlayer from "#lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte";
  import GuideStepStrip from "../../level-1/_components/GuideStepStrip.svelte";
  import GuidePictograph from "../../level-1/_components/GuidePictograph.svelte";
  import TKAWordGlyph from "#lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import ShapeMatrixMandalaArt from "#lib/shared/shape-matrix/components/ShapeMatrixMandalaArt.svelte";
  import { stripToSequence } from "../../level-1/_data/guide-sequence-adapter";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    CLUB_ARTWORK_PAINTER,
    headerArtworkSrc,
  } from "#lib/shared/shape-matrix/services/shape-matrix-artwork.js";
  import {
    loadShapeMatrix,
    type ShapeMatrixData,
  } from "#lib/shared/shape-matrix/services/shape-matrix-flowers.js";
  import {
    flowerKey,
    flowerPetals,
    type RotatingFlower,
  } from "#lib/shared/shape-matrix/domain/flower-signature.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import {
    capBeats,
    capStrip,
    type Cap,
    type CapSpin,
  } from "#lib/shared/guide-topics/caps-topic.js";

  let {
    cap,
    level,
    picTheme = "dark",
    position,
    total,
    onNext,
  }: {
    cap: Cap;
    level: CapLevel;
    picTheme?: "light" | "dark";
    /** 1-based place of this CAP in the list, for "3 of 72". */
    position: number;
    total: number;
    onNext: () => void;
  } = $props();

  const items = $derived(capStrip(cap));
  const sequence = $derived(
    stripToSequence(items, { word: cap.word, name: cap.word })
  );
  const beats = $derived(capBeats(cap));

  let liveStep = $state(0);
  const activeBeat = $derived(liveStep < 1 ? 0 : Math.floor(liveStep));
  // The beat the readout describes: the playing one, or beat 1 at rest.
  const shownBeat = $derived(beats[Math.max(0, activeBeat - 1)]!);
  $effect(() => {
    void cap;
    liveStep = 0;
  });

  const render = $derived({
    propType: PropType.STAFF,
    showTKA: level !== "name",
    showElemental: level === "vtg",
  });

  // Mount the player once the figure is near the screen; play it while it is
  // on screen unless the reader prefers reduced motion.
  let rootEl: HTMLElement | undefined = $state();
  let near = $state(false);
  let reducedMotion = $state(false);
  onMount(() => {
    reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const el = rootEl;
    if (!el || typeof IntersectionObserver === "undefined") {
      near = true;
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) near = entry.isIntersecting;
      },
      { rootMargin: "100% 0px", threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  });

  // The flowers a CAP hand draws, painted by the Shape Engine once the
  // VTG level is first reached. A staff has two ends; these are the outer
  // end's flowers, since at 1:1 the inner end stays in place and draws only
  // a point (see /guide/ratios).
  const FLOWERS: Record<CapSpin, RotatingFlower> = {
    extension: {
      style: "pro",
      turns: 0,
      ori: "out",
      grid: "diamond",
      petals: flowerPetals({ style: "pro", turns: 0 }),
    },
    antispin: {
      style: "anti",
      turns: 1,
      ori: "out",
      grid: "diamond",
      petals: flowerPetals({ style: "anti", turns: 1 }),
    },
    prospin: {
      style: "pro",
      turns: 1,
      ori: "out",
      grid: "diamond",
      petals: flowerPetals({ style: "pro", turns: 1 }),
    },
  };
  let shapes = $state<ShapeMatrixData | null>(null);
  let shapesRequested = false;
  $effect(() => {
    if (level !== "vtg" || shapesRequested || !browser) return;
    shapesRequested = true;
    loadShapeMatrix(PropType.STAFF).then((data) => (shapes = data));
  });
  const paintFlower =
    (spin: CapSpin, hand: "left" | "right") => (size: number) =>
      shapes
        ? headerArtworkSrc(
            shapes,
            FLOWERS[spin],
            hand,
            size,
            CLUB_ARTWORK_PAINTER
          )
        : "";

  const SPIN_WORD = {
    extension: "guide_caps_spin_extension",
    antispin: "guide_caps_spin_antispin",
    prospin: "guide_caps_spin_prospin",
  } as const;
  const spinWord = (spin: CapSpin) => t(SPIN_WORD[spin]);
  const element = $derived(shownBeat.element);
</script>

<figure class="cap-figure level-{level}" bind:this={rootEl}>
  <div class="stage">
    <div class="canvas-box">
      {#if browser && near}
        <InlineAnimationPlayer
          {sequence}
          displayWord={level === "name" ? null : cap.word}
          chrome="minimal"
          fill={true}
          autoPlay={!reducedMotion}
          leftPropType={PropType.STAFF}
          rightPropType={PropType.STAFF}
          scrubbable
          beatIndicators={false}
          hideTkaGlyph={level === "name"}
          onStepChange={(step: number) => (liveStep = step)}
        />
      {/if}
    </div>

    <div class="readout" aria-live="polite">
      <div class="beat-pic">
        {#if items[activeBeat]}
          <GuidePictograph
            data={items[activeBeat]!}
            eager
            forceTheme={picTheme}
            propType={PropType.STAFF}
            showTKA={render.showTKA}
            showElemental={render.showElemental}
          />
        {/if}
      </div>

      {#if level === "name"}
        <div class="panel">
          <p class="big">{t("guide_caps_figure_name")}</p>
          <p class="meta">
            {t("guide_caps_figure_count", { n: position, total })}
          </p>
          <button type="button" class="next" onclick={onNext}>
            {t("guide_caps_show_another")}
          </button>
        </div>
      {:else if level === "letters"}
        <div class="panel">
          <ol class="letters" aria-label={cap.word}>
            {#each beats as beat (beat.beat)}
              <li class:active={beat.beat === activeBeat}>
                {#if browser}
                  <TKAWordGlyph
                    word={beat.letter}
                    height={22}
                    darkMode={picTheme === "dark"}
                  />
                {:else}
                  {beat.letter}
                {/if}
              </li>
            {/each}
          </ol>
          <p class="meta">
            {t("guide_caps_figure_beat", { n: shownBeat.beat })}
          </p>
        </div>
      {:else}
        <div class="panel vtg">
          {#if element}
            <p class="element">
              <img src={element.iconPath} alt="" width="28" height="28" />
              <span>{element.name}</span>
            </p>
          {/if}
          <div class="hands">
            {#each [["left", shownBeat.left], ["right", shownBeat.right]] as const as [hand, reading] (hand)}
              <div class="hand {hand}">
                <span class="flower">
                  <ShapeMatrixMandalaArt
                    paint={paintFlower(reading.spin, hand)}
                    artKey={`${hand}-${flowerKey(FLOWERS[reading.spin])}-${shapes ? 1 : 0}`}
                    alt=""
                  />
                </span>
                <span class="ratio">{reading.ratio}</span>
                <span class="spin">{spinWord(reading.spin)}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>

  <div class="strip">
    <GuideStepStrip {items} {render} {picTheme} {activeBeat} />
  </div>
</figure>

<style>
  .cap-figure {
    container-type: inline-size;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }
  .stage {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: clamp(0.75rem, 3cqw, 1.25rem);
    align-items: start;
  }
  .canvas-box {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    contain: size;
    border-radius: 14px;
    overflow: hidden;
    background: color-mix(in oklab, var(--theme-text) 6%, transparent);
    border: 1.5px solid
      color-mix(in srgb, var(--semantic-warning) 42%, transparent);
  }
  .canvas-box :global(.inline-animation-player) {
    width: 100%;
    height: 100%;
  }
  .readout {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    min-width: 0;
  }
  .beat-pic {
    width: min(100%, 132px);
    aspect-ratio: 1;
  }
  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    min-width: 0;
  }
  .panel p {
    margin: 0;
  }
  .big {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--theme-text);
  }
  .meta {
    font-size: 0.875rem;
    color: var(--theme-text-muted);
  }
  .next {
    align-self: flex-start;
    min-height: 44px;
    padding: 0 1rem;
    border-radius: 999px;
    border: 1px solid color-mix(in oklab, var(--theme-text) 22%, transparent);
    background: color-mix(in oklab, var(--theme-text) 6%, transparent);
    color: var(--theme-text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .next:hover {
    background: color-mix(in oklab, var(--theme-text) 12%, transparent);
  }
  .next:focus-visible {
    outline: 2px solid var(--semantic-warning);
    outline-offset: 2px;
  }

  .letters {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(6, 26px);
    gap: 3px;
  }
  .letters li {
    display: grid;
    place-items: center;
    height: 32px;
    border-radius: 7px;
    border: 1px solid color-mix(in oklab, var(--theme-text) 12%, transparent);
    transition: box-shadow var(--duration-fast, 120ms)
      var(--ease-standard, ease);
  }
  .letters li.active {
    box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.9);
  }

  .element {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
    color: var(--theme-text);
  }
  .hands {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .hand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }
  .flower {
    display: block;
    width: min(100%, 64px);
    aspect-ratio: 1;
  }
  .ratio {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .hand.left .ratio {
    color: color-mix(
      in oklab,
      var(--dm-motion-blue, #3575e2) 72%,
      var(--theme-text)
    );
  }
  .hand.right .ratio {
    color: color-mix(
      in oklab,
      var(--dm-motion-red, #ed1c24) 72%,
      var(--theme-text)
    );
  }
  .spin {
    font-size: 0.8125rem;
    color: var(--theme-text-muted);
  }

  .strip :global(.guide-step-strip) {
    margin: 0;
  }

  /* A narrow figure keeps the player and the readout; the beat's pictograph
     and the full strip need the room a wide column gives them. */
  @container (max-width: 459px) {
    .strip,
    .beat-pic {
      display: none;
    }
    .stage {
      grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
    }
  }
</style>
