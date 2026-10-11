<!--
  CardBackLoopRow.svelte — standalone extraction of the full `.loop-row` (all
  active loop columns: icon cell + label) from CardBack.svelte, for offscreen
  rasterization of the new card-back render path.

  PARITY: markup + CSS lifted VERBATIM from CardBack.svelte (.loop-row /
  .loop-col / .loop-icon-cell / .loop-col-label) and the icon node-selection
  (SwapIcon / CheckerboardCircleIcon / fa-arrows-spin / <i>). Rendered in normal
  flow (not position:absolute) and centered, so the whole row rasterizes to one
  bitmap. Mount inside a container-type:inline-size width = card render width so
  cqi units match the live card; set --card-text-muted for the labels.
-->
<script lang="ts">
  import CheckerboardCircleIcon from "#lib/shared/icons/CheckerboardCircleIcon.svelte";

  interface Col {
    kind: "swap" | "checkerboard" | "fa";
    fa?: string;
    color: string;
    label: string;
    rotationDegrees?: number;
    iconScale?: number;
  }
  interface Props {
    cols: Col[];
  }
  let { cols }: Props = $props();
</script>

<div class="loop-row">
  {#each cols as col}
    <div class="loop-col">
      <span class="loop-icon-cell">
        {#if col.kind === "swap"}
          <i
            class="fas fa-shuffle"
            style="font-size: 8cqi; color: {col.color}; line-height: 1; display: block; transform: rotate({col.rotationDegrees ?? 0}deg) scale({col.iconScale ?? 1});"
            aria-hidden="true"
          ></i>
        {:else if col.kind === "checkerboard"}
          <CheckerboardCircleIcon size="8cqi" color={col.color} />
        {:else}
          <i
            class={col.fa}
            style="font-size: 8cqi; color: {col.color}; line-height: 1; display: block; transform: rotate({col.rotationDegrees ?? 0}deg) scale({col.iconScale ?? 1});"
            aria-hidden="true"
          ></i>
        {/if}
      </span>
      <span class="loop-col-label">{col.label}</span>
    </div>
  {/each}
</div>

<style>
  /* verbatim from CardBack.svelte, sans position:absolute */
  .loop-row {
    display: flex;
    justify-content: center;
    gap: 6cqi;
  }

  .loop-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6cqi;
    filter: drop-shadow(0 0.5cqi 1.5cqi rgba(0, 0, 0, 0.12));
  }

  .loop-icon-cell {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 9cqi;
    height: 9cqi;
    overflow: hidden;
  }

  .loop-icon-cell i {
    filter: none;
  }

  .loop-col-label {
    font-size: 2.2cqi;
    color: var(--card-text-muted, rgba(255, 255, 255, 0.7));
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-weight: 500;
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
  }
</style>
