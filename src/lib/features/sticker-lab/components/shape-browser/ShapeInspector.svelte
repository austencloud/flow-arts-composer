<script lang="ts">
  import {
    DEFAULT_OVERLAP_CONFIG,
    type MandalaOverlapConfig,
    type MandalaPalette,
  } from "#lib/shared/mandala/domain/mandala-types.js";
  import {
    DARK_MOTION_BLUE_FILL,
    DARK_MOTION_BLUE_STROKE,
    DARK_MOTION_PURPLE_FILL,
    DARK_MOTION_PURPLE_STROKE,
    DARK_MOTION_RED_FILL,
    DARK_MOTION_RED_STROKE,
  } from "#lib/shared/mandala/domain/mandala-constants.js";
  import { renderMandalaSVG } from "#lib/shared/mandala/services/mandala-renderer.js";
  import type { CatalogShapeMember } from "../../services/catalog-shape-index";
  import OverlapCalibrationPanel from "./OverlapCalibrationPanel.svelte";

  interface Props {
    members: CatalogShapeMember[];
    initialIndex?: number;
    copyCount(member: CatalogShapeMember): number;
    onBack(): void;
    onAdd(member: CatalogShapeMember): void;
  }

  let { members, initialIndex = 0, copyCount, onBack, onAdd }: Props = $props();

  const COLOR_PALETTE: MandalaPalette = {
    leftStroke: DARK_MOTION_BLUE_STROKE,
    leftFill: DARK_MOTION_BLUE_FILL,
    rightStroke: DARK_MOTION_RED_STROKE,
    rightFill: DARK_MOTION_RED_FILL,
    purpleStroke: DARK_MOTION_PURPLE_STROKE,
    purpleFill: DARK_MOTION_PURPLE_FILL,
  };

  const MONO_PALETTE: MandalaPalette = {
    leftStroke: "#c0b8e8",
    leftFill: "rgba(192, 184, 232, 0.1)",
    rightStroke: "#c0b8e8",
    rightFill: "rgba(192, 184, 232, 0.1)",
    purpleStroke: "#c0b8e8",
    purpleFill: "rgba(192, 184, 232, 0.1)",
  };

  let index = $state(initialIndex);
  let renderStyle = $state<"stroke" | "filled">("stroke");
  let strokeWidth = $state(2.5);
  let overlap = $state<MandalaOverlapConfig>({ ...DEFAULT_OVERLAP_CONFIG });

  const member = $derived(members[index] ?? members[0]);
  const svg = $derived.by(() => {
    if (!member) return "";
    return renderMandalaSVG(member.previewPaths, {
      size: 640,
      style: renderStyle,
      show: "both",
      strokeWidth,
      overlap,
      palette: member.scope === "combined" ? COLOR_PALETTE : MONO_PALETTE,
    });
  });

  function previous(): void {
    if (members.length === 0) return;
    index = (index - 1 + members.length) % members.length;
  }

  function next(): void {
    if (members.length === 0) return;
    index = (index + 1) % members.length;
  }
</script>

{#if member}
  <section class="inspector" aria-label="Shape inspector">
    <header>
      <button class="back" type="button" onclick={onBack}>
        <i class="fas fa-arrow-left" aria-hidden="true"></i>
        Back to {members.length > 1 ? "members" : "shapes"}
      </button>
      <div class="identity">
        <strong>{member.word}</strong>
        <span>
          {member.scope === "solo"
            ? `${member.prop ?? "solo"} path`
            : "combined shape"}
        </span>
      </div>
      <span class="counter">{index + 1} / {members.length}</span>
    </header>

    <div class="stage">
      <button
        class="step previous"
        type="button"
        onclick={previous}
        aria-label="Previous shape"
        disabled={members.length < 2}
      >
        <i class="fas fa-chevron-left" aria-hidden="true"></i>
      </button>
      <div class="art">{@html svg}</div>
      <button
        class="step next"
        type="button"
        onclick={next}
        aria-label="Next shape"
        disabled={members.length < 2}
      >
        <i class="fas fa-chevron-right" aria-hidden="true"></i>
      </button>
    </div>

    <div class="actions">
      <div class="add-copy">
        <button class="add" type="button" onclick={() => onAdd(member)}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          Add sticker
        </button>
        {#if copyCount(member) > 0}
          <span>{copyCount(member)} on sheet</span>
        {/if}
      </div>
      {#if member.scope === "solo"}
        <p>
          The solo path finds the shape. Adding uses its full two-hand mandala.
        </p>
      {/if}
    </div>

    <OverlapCalibrationPanel bind:renderStyle bind:strokeWidth bind:overlap />
  </section>
{/if}

<style>
  .inspector {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-md);
    overflow-y: auto;
    padding: var(--spacing-md);
  }

  header {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: var(--spacing-md);
  }

  .back,
  .step,
  .add {
    min-height: var(--min-touch-target);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    border-radius: var(--radius-2026-sm);
    cursor: pointer;
    font-size: var(--font-size-min, 14px);
  }

  .back {
    justify-self: start;
    padding: var(--spacing-sm) var(--spacing-md);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: transparent;
    color: var(--theme-text, white);
  }

  .identity {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-xs);
    color: var(--theme-text, white);
  }

  .identity strong {
    font-size: var(--font-size-base, 16px);
  }

  .identity span,
  .counter,
  .add-copy span,
  .actions p {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 12px);
  }

  .counter {
    justify-self: end;
    font-variant-numeric: tabular-nums;
  }

  .stage {
    width: min(100%, 58rem);
    min-height: 24rem;
    display: grid;
    grid-template-columns: var(--min-touch-target) minmax(0, 1fr) var(
        --min-touch-target
      );
    align-items: center;
    gap: var(--spacing-md);
  }

  .art {
    width: min(100%, 42rem);
    aspect-ratio: 1;
    justify-self: center;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: var(--radius-2026-lg, 20px);
    background: var(--theme-card-bg, rgba(13, 13, 26, 0.72));
    box-shadow: 0 1.25rem 3.75rem rgba(0, 0, 0, 0.35);
    overflow: hidden;
  }

  .art :global(svg) {
    width: 100%;
    height: 100%;
  }

  .step {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text, white);
  }

  .step:disabled {
    opacity: 0.25;
    cursor: default;
  }

  .actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-xs);
  }

  .add-copy {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
  }

  .add {
    padding: var(--spacing-sm) var(--spacing-lg);
    border: none;
    background: var(--theme-accent, #8b5cf6);
    color: white;
    font-weight: 600;
  }

  .actions p {
    margin: 0;
    text-align: center;
  }

  button:focus-visible {
    outline: 2px solid var(--theme-accent, #a78bfa);
    outline-offset: 2px;
  }

  @media (max-width: 42rem) {
    header {
      grid-template-columns: 1fr auto;
    }

    .identity {
      grid-column: 1 / -1;
      grid-row: 2;
    }

    .stage {
      min-height: auto;
      grid-template-columns: 1fr 1fr;
    }

    .art {
      grid-column: 1 / -1;
      grid-row: 1;
    }

    .step {
      width: 100%;
    }

    .previous {
      grid-column: 1;
    }

    .next {
      grid-column: 2;
    }
  }
</style>
