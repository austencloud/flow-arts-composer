<script lang="ts">
  /**
   * What a CAP's showcase says beside its canvas while it plays. At the
   * letters level each beat's letter lights as it plays; at the VTG level the
   * playing beat shows its timing and direction (the TnD element) and each
   * hand's spin as the flower that spin draws, with its ratio.
   *
   * The canvas and the strip belong to the Guide's SequenceShowcase; this
   * only reads the beat it reports. Built from TKAWordGlyph, the TnD element
   * table and the Shape Engine's flower painter.
   */
  import { browser } from "$app/env";
  import TKAWordGlyph from "#lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import ShapeMatrixMandalaArt from "#lib/shared/shape-matrix/components/ShapeMatrixMandalaArt.svelte";
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
    type Cap,
    type CapSpin,
  } from "#lib/shared/guide-topics/caps-topic.js";

  let {
    cap,
    level,
    step,
    picTheme = "dark",
  }: {
    cap: Cap;
    level: "letters" | "vtg";
    /** The showcase player's live beat: 0 on the start pose, then 1..12. */
    step: number;
    picTheme?: "light" | "dark";
  } = $props();

  const beats = $derived(capBeats(cap));
  const activeBeat = $derived(step < 1 ? 0 : Math.floor(step));
  // The beat the readout describes: the playing one, or beat 1 at rest.
  const shownBeat = $derived(beats[Math.max(0, activeBeat - 1)]!);

  // The flowers a CAP hand draws, painted by the Shape Engine once the VTG
  // readout first mounts. A staff has two ends; these are the outer end's
  // flowers, since at 1:1 the inner end stays in place and draws only a
  // point (see /guide/ratios).
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

<div class="readout" aria-live="polite">
  {#if level === "letters"}
    <ol class="letters" aria-label={cap.word}>
      {#each beats as beat (beat.beat)}
        <li class:active={beat.beat === activeBeat}>
          {#if browser}
            <TKAWordGlyph
              word={beat.letter}
              height={24}
              darkMode={picTheme === "dark"}
            />
          {:else}
            {beat.letter}
          {/if}
        </li>
      {/each}
    </ol>
    <p class="meta">{t("guide_caps_figure_beat", { n: shownBeat.beat })}</p>
  {:else}
    <p class="element">
      {#if element}
        <img src={element.iconPath} alt="" width="28" height="28" />
        <span>{element.name}</span>
      {/if}
    </p>
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
  {/if}
</div>

<style>
  .readout {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    min-width: 0;
  }
  .readout p {
    margin: 0;
  }
  .meta {
    font-size: 0.875rem;
    color: var(--theme-text-muted);
  }

  .letters {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(6, 32px);
    gap: 4px;
  }
  .letters li {
    display: grid;
    place-items: center;
    height: 38px;
    border-radius: 8px;
    border: 1px solid color-mix(in oklab, var(--theme-text) 12%, transparent);
    transition: box-shadow var(--duration-fast, 120ms)
      var(--ease-standard, ease);
  }
  .letters li.active {
    box-shadow: 0 0 0 2px
      color-mix(in srgb, var(--semantic-warning) 90%, transparent);
  }

  /* The element line keeps its height while the start pose shows none. */
  .element {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 28px;
    font-weight: 600;
    color: var(--theme-text);
  }
  .hands {
    display: grid;
    grid-template-columns: repeat(2, 96px);
    gap: 1rem;
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
    width: 80px;
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
</style>
