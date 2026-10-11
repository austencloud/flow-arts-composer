<!--
  BandDoorway — a band that shows a taste of its contents and a way in.

  The alternative it replaces is a wall: every item rendered, which for the
  Archive is 505 tiles and roughly a dozen screens. A doorway is not a button on
  empty space — it still shows real work, through the same ArtifactTile the
  grids use, so the band keeps its character. It just stops being exhaustive.

  Routing lives entirely in the parent. This component knows a count, some
  items, and one callback.
-->
<script lang="ts">
  import ArtifactTile from "./ArtifactTile.svelte";
  import { sampleCount } from "./doorway-policy";
  import type { LiveSlots, Medium } from "./live-slots.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

  /** Mirrors ArtifactTile's own prop types exactly. `unknown` here would fail
   *  to assign to the tile's `sequence: SequenceData | null`. */
  type SampleItem = {
    key: string;
    medium: Medium;
    title: string;
    sequence?: SequenceData | null;
    poster?: string | null;
    tunnel?: unknown | null;
    scene?: unknown | null;
    mandala?: {
      steps: unknown[];
      variant: "left" | "right" | "both";
      leftPropType?: string;
      rightPropType?: string;
      pathShape?: "arc" | "linear" | "concave" | "hybrid";
    } | null;
  };

  let {
    slots,
    items,
    total,
    columns,
    actionLabel,
    onenter,
    size = "sm",
    label,
  }: {
    slots: LiveSlots;
    /** Newest-first. Only the first row is rendered. */
    items: SampleItem[];
    /** The REAL total, which is what the doorway promises. It must come from
     *  the same pool `onenter` lands in, or the doorway lies about itself. */
    total: number;
    /** Column count for this tier, from the caller's capFor(). */
    columns: number;
    actionLabel: string;
    onenter: () => void;
    size?: "sm" | "md" | "lg";
    /**
     * Names this shelf, which also moves the way in.
     *
     * Unlabeled, the doorway IS the band — one row with the action centred
     * under it (the Archive). Labeled, it is one shelf among several inside a
     * band, so it grows its own head and the action sits there on the right;
     * three centred buttons stacked down a band reads as three dead ends
     * rather than three shelves. Same component either way: a sample row and a
     * way in.
     */
    label?: string;
  } = $props();

  const shown = $derived(items.slice(0, sampleCount(items.length, columns)));
</script>

<div class="doorway" class:shelf={label}>
  {#if label}
    <header class="shelf-head">
      <h3>{label}</h3>
      <span class="shelf-count">{total.toLocaleString()}</span>
      <span class="shelf-rule" aria-hidden="true"></span>
      <button class="enter shelf-enter" type="button" onclick={onenter}>
        {actionLabel}
      </button>
    </header>
  {/if}

  <!-- Tracks come from the COLUMN count, not the item count. Sizing to the
       items stretches a short row across the whole band — a 4-tunnel shelf
       rendering at nearly twice the size of the 6-mandala shelf above it, and
       a lone 3D scene ballooning to the full width. Empty tracks at the end of
       a short shelf are the right trade: every tile is the same size in every
       shelf, and a shelf with one thing in it looks like a shelf with one
       thing in it. -->
  {#if shown.length > 0}
    <div class="sample" style:--cols={Math.max(1, columns)}>
      {#each shown as item (item.key)}
        <ArtifactTile
          {slots}
          {size}
          medium={item.medium}
          title={item.title}
          sequence={item.sequence ?? null}
          poster={item.poster ?? null}
          tunnel={item.tunnel ?? null}
          scene={item.scene ?? null}
          mandala={item.mandala ?? null}
        />
      {/each}
    </div>
  {/if}

  {#if !label}
    <!-- A button, not a text link: this is a standalone action
         (clickables-look-like-buttons.md). -->
    <button class="enter" type="button" onclick={onenter}>
      <span class="enter-label">{actionLabel}</span>
      <span class="enter-count">{total.toLocaleString()}</span>
    </button>
  {/if}
</div>

<style>
  /* Every measure in `em` — the stage rides a container-query font ramp, and a
     `rem` here would freeze at 1080p while its neighbours grew
     (4k-native-layout.md). */
  .doorway {
    display: flex;
    flex-direction: column;
    gap: 0.85em;
  }

  /* A shelf sits closer to its own head than bands sit to each other, so the
     name reads as belonging to the row under it rather than floating between
     two rows. */
  .shelf {
    gap: 0.5em;
  }

  .shelf-head {
    display: flex;
    align-items: center;
    gap: 0.75em;
  }

  .shelf-head h3 {
    margin: 0;
    font-size: 0.875em;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--theme-text, rgba(255, 255, 255, 0.9));
    white-space: nowrap;
  }

  .shelf-count {
    font-size: 0.875em;
    font-variant-numeric: tabular-nums;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
  }

  .shelf-rule {
    flex: 1;
    height: 1px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  /* Sized to its label, never stretched: `flex: 1` on the rule beside it is
     what keeps this honest (visual-verification-mandatory.md). */
  .shelf-enter {
    flex: 0 0 auto;
    align-self: auto;
    padding: 0.4em 1em;
    font-size: 0.8125em;
  }

  /* Exactly the rendered count, so the sample is always one full row with no
     stranded track — never auto-fill (4k-native-layout.md). */
  .sample {
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    gap: clamp(0.75em, 1.2cqw, 1.25em);
    align-items: start;
  }

  .enter {
    /* inline-flex + align-self so the button sizes to its label. A stretched
       `display: flex` here is the 1765px-control failure
       (visual-verification-mandatory.md). */
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.75em;
    align-self: center;
    width: max-content;
    max-width: 100%;
    min-height: 44px; /* touch-target floor: px on purpose, must not scale */
    padding: 0.6em 1.5em;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 0.75em;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, rgba(255, 255, 255, 0.9));
    font: inherit;
    font-size: 0.9375em;
    font-weight: 600;
    cursor: pointer;
    transition: background var(--duration-normal, 250ms) ease;
  }

  .enter:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12));
  }

  .enter:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .enter-count {
    font-variant-numeric: tabular-nums;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-weight: 500;
  }

  @media (prefers-reduced-motion: reduce) {
    .enter {
      transition: none;
    }
  }
</style>
