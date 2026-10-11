<script lang="ts">
  /**
   * One axis of the shape matrix, drawn in QfT's own hand.
   *
   * Each button previews the flower the way this page draws everything else —
   * the path the head traces, computed from the knobs the bridge derives. That
   * is the point of the mode: the matrix's twelve flowers are twelve knob
   * settings, and seeing them as trails rather than as names is the argument.
   *
   * Twelve previews per axis rather than 144 per grid. A full cell grid would
   * be 288 traced paths on screen at once for a choice that is really two
   * independent choices, and the pair is drawn full size on the stage anyway.
   */
  import {
    ratioLabel,
    type Flower,
  } from "#lib/shared/shape-matrix/domain/flower-signature.js";
  import { flowerToKnobs } from "#lib/shared/notation/qft/qft-flower-bridge.js";
  import { tracePath } from "#lib/shared/notation/qft/qft-model.js";

  interface Props {
    label: string;
    flowers: Flower[];
    /** Null when a canonical preset, rather than a flower, owns the hand. */
    value: number | null;
    onchange: (index: number) => void;
    tone: "accent" | "blue" | "red";
  }

  let { label, flowers, value, onchange, tone }: Props = $props();

  /**
   * Coarser than the stage's 240. A preview a couple of centimetres across
   * cannot show the difference, and this runs twelve times per axis.
   */
  const PREVIEW_SAMPLES = 96;
  /** Half the preview viewBox. The head reaches radius + 1 = 2 prop lengths. */
  const HALF = 2.15;

  const previews = $derived(
    flowers.map((f) => {
      const points = tracePath(flowerToKnobs(f), PREVIEW_SAMPLES);
      return points
        .map(
          (p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(3)},${p.y.toFixed(3)}`
        )
        .join(" ");
    })
  );
</script>

<div class="picker" data-tone={tone}>
  <span class="axis-label" id={`axis-${tone}`}>{label}</span>
  <div class="row" role="radiogroup" aria-labelledby={`axis-${tone}`}>
    {#each flowers as f, i (`${f.style}-${f.turns}-${f.ori}-${f.grid}`)}
      <button
        type="button"
        class="flower"
        class:active={i === value}
        role="radio"
        aria-checked={i === value}
        onclick={() => onchange(i)}
      >
        <svg
          viewBox={`${-HALF} ${-HALF} ${HALF * 2} ${HALF * 2}`}
          aria-hidden="true"
        >
          <path d={previews[i]} />
        </svg>
        <span class="ratio">{ratioLabel(f.turns)}</span>
        <span class="meta"
          ><span class="petals">{f.petals}p · </span>{f.ori}</span
        >
      </button>
    {/each}
  </div>
</div>

<style>
  .picker {
    display: grid;
    gap: 0.4rem;
    --tone: var(--dm-motion-blue, #3575e2);
    /* Its own container, so the chips measure the axis they sit in rather than
       the column — the two axes sit side by side at some sizes, which halves
       the width available per chip without changing the column's. */
    container-type: inline-size;
    container-name: flower-axis;
  }

  .picker[data-tone="red"] {
    --tone: var(--dm-motion-red, #ed1c24);
  }

  .picker[data-tone="accent"] {
    --tone: var(--theme-accent, #8b5cf6);
  }

  .axis-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--tone);
  }

  /*
   * Wraps rather than scrolls. A horizontal rail of twelve is the thing this
   * page is moving away from — you cannot compare two flowers when half of
   * them are off the edge.
   */
  .row {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.35rem;
  }

  .flower {
    display: grid;
    justify-items: center;
    gap: 0.1rem;
    /*
     * Grid items default to `min-width: auto`, which is min-content — so a
     * `minmax(0, 1fr)` track that computed to 29px still rendered a 44px chip,
     * and twelve of them walked the last chip off the right edge of the axis.
     */
    min-width: 0;
    /* Touch-target floor, per the design system. */
    min-height: 44px;
    padding: 0.35rem 0.2rem;
    border-radius: 0.55rem;
    border: 1px solid var(--semantic-border, rgb(255 255 255 / 0.18));
    background: var(--semantic-surface-raised, rgb(0 0 0 / 0.22));
    color: var(--semantic-text-secondary, rgb(255 255 255 / 0.7));
    cursor: pointer;
    transition:
      border-color 140ms ease,
      background 140ms ease,
      color 140ms ease;
  }

  .flower:hover {
    border-color: color-mix(in srgb, var(--tone) 60%, transparent);
    color: var(--semantic-text-primary, #fff);
  }

  .flower.active {
    border-color: var(--tone);
    background: color-mix(in srgb, var(--tone) 22%, transparent);
    color: var(--semantic-text-primary, #fff);
  }

  .flower svg {
    display: block;
    width: 100%;
    /* Square, and capped so a wide column does not turn these into posters. */
    max-width: 3.2rem;
    aspect-ratio: 1;
  }

  .flower path {
    fill: none;
    stroke: var(--tone);
    stroke-width: 0.09;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.85;
  }

  .ratio {
    font-size: 0.78rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .meta {
    font-size: 0.64rem;
    opacity: 0.72;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /*
   * The petal count goes first when a chip runs out of room, because the
   * preview above it already shows the petals. `in`/`out` cannot be dropped:
   * the two differ by a half turn of prop phase, which leaves the traced shape
   * looking the same — the word is the only thing that tells them apart.
   */
  @container flower-axis (max-width: 34rem) {
    .petals {
      display: none;
    }
  }

  @media (max-width: 30rem) {
    .row {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  /*
   * Short windows — fold-open landscape, a 768px laptop, a squashed desktop.
   * Two axes of twelve plus a mode control is 311px of controls in a 245px
   * pane, and a cell has exactly that; at 1024x768 the same column ran 58px
   * past. The 44px touch floor stays; what goes is the air around the preview,
   * which is the part that was costing rows.
   */
  @media (max-height: 50rem) {
    .picker {
      gap: 0.25rem;
    }

    .axis-label {
      font-size: 0.72rem;
    }

    .flower {
      padding: 0.2rem 0.15rem;
      gap: 0;
    }

    .flower svg {
      max-width: 1.5rem;
    }

    .ratio {
      font-size: 0.7rem;
    }

    .meta {
      font-size: 0.56rem;
    }
  }

  /*
   * One row of twelve once the column is wide enough for it.
   *
   * Two rows of six per axis, twice over, is 460px of picker above a pair of
   * eight-row tables — more than the pane has, so the notation fell off the
   * bottom. Flat is also the better read: the axis runs simple to complex in
   * one direction, and wrapping it hides that halfway through.
   *
   * Keyed to the AXIS's own width, not the viewport. Keyed to the viewport this
   * only fired on big screens and on fold landscape, so a tablet in portrait —
   * where the axis is a perfectly roomy 644px — still wrapped to two rows and
   * pushed 500px of content off the bottom of the pane.
   */
  @container flower-axis (min-width: 34rem) {
    .row {
      grid-template-columns: repeat(12, minmax(0, 1fr));
      gap: 0.25rem;
    }

    .flower {
      padding: 0.25rem 0.15rem;
      gap: 0;
    }

    .flower svg {
      max-width: 1.7rem;
    }

    .ratio {
      font-size: 0.7rem;
    }

    .meta {
      font-size: 0.58rem;
    }
  }
</style>
