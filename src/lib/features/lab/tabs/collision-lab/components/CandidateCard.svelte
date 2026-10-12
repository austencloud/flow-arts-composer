<script lang="ts">
  /**
   * CandidateCard
   *
   * One card in the 2×3 candidate grid. Shows a small 3D preview of the
   * avatar at this candidate's stance, plus the candidate's label,
   * collision status pill, and a click-to-pick handler.
   *
   * Visual states:
   *   - Normal: card border is the theme stroke color, no badge.
   *   - Picked: 3px colored border (green for feasible, amber for
   *     clip-but-stable), checkmark badge top-right.
   *   - Hovered: subtle glow.
   *
   * The card itself owns click handling. The inner thumbnail viewport
   * has `pointer-events: none` so the card captures every click on its
   * footprint, regardless of where inside the card the click lands.
   */

  import CandidateThumbnailViewport from "./CandidateThumbnailViewport.svelte";
  import type { StanceCandidate, PoseDefinition } from "../domain/types";

  interface Props {
    candidate: StanceCandidate;
    pose: PoseDefinition;
    /** True when this is the currently-picked candidate. */
    picked: boolean;
    /** Callback when the reviewer clicks this card. */
    onPick: (index: number) => void;
  }

  let { candidate, pose, picked, onPick }: Props = $props();

  const statusClass = $derived.by(() => {
    if (!candidate.feasible) return "status-infeasible";
    if (candidate.simResult.totalCollisionDepth > 0.02) return "status-clip";
    return "status-feasible";
  });

  const statusLabel = $derived.by(() => {
    if (!candidate.feasible) {
      // Report the largest shortfall - either reach or a hard-gate collision.
      const shortfall = Math.max(
        candidate.simResult.reachShortfall.left,
        candidate.simResult.reachShortfall.right
      );
      if (shortfall > 0.03) {
        return `${Math.round(shortfall * 100)} cm short`;
      }
      return "Infeasible";
    }
    const depth = candidate.simResult.totalCollisionDepth;
    if (depth > 0.02) return `${Math.round(depth * 100)} cm clip`;
    return "Feasible";
  });

  function handleClick() {
    onPick(candidate.index);
  }

  function handleKeyDown(ev: KeyboardEvent) {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      onPick(candidate.index);
    }
  }
</script>

<button
  type="button"
  class="candidate-card"
  class:picked
  class:feasible={candidate.feasible}
  class:infeasible={!candidate.feasible}
  onclick={handleClick}
  onkeydown={handleKeyDown}
  aria-label={`Candidate ${candidate.index + 1}: ${candidate.label}`}
  aria-pressed={picked}
>
  <div class="thumbnail-frame">
    <CandidateThumbnailViewport
      stance={candidate.stance}
      leftPlane={pose.leftHand.plane}
      leftPosition={pose.leftHand.position}
      leftOrientation={pose.leftHand.orientation}
      rightPlane={pose.rightHand.plane}
      rightPosition={pose.rightHand.position}
      rightOrientation={pose.rightHand.orientation}
    />
  </div>

  <div class="card-footer">
    <span class="candidate-label" title={candidate.label}
      >{candidate.label}</span
    >
    <span class="status-pill {statusClass}" title={statusLabel}>
      {statusLabel}
    </span>
  </div>

  {#if picked}
    <span class="picked-badge" aria-hidden="true">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  {/if}
</button>

<style>
  .candidate-card {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 0;
    border: 2px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(0, 0, 0, 0.25));
    overflow: hidden;
    cursor: pointer;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard),
      box-shadow var(--duration-fast) var(--ease-standard);
    font: inherit;
    color: inherit;
    text-align: left;
    -webkit-tap-highlight-color: transparent;
    /* Fill the grid cell. The candidate grid's grid-template-rows use
       minmax(0,1fr), so the card stretches to the row height. */
    width: 100%;
    height: 100%;
    min-height: 0;
    min-width: 0;
  }

  .candidate-card:hover:not(.picked) {
    border-color: var(--theme-accent, #7bc3ff);
    transform: translateY(-2px);
    box-shadow: 0 6px 18px -6px rgba(123, 195, 255, 0.3);
  }

  .candidate-card:focus-visible {
    outline: 2px solid var(--theme-accent, #7bc3ff);
    outline-offset: 2px;
  }

  .candidate-card.picked {
    border-width: 3px;
  }
  .candidate-card.picked.feasible {
    border-color: #4ade80;
    box-shadow: 0 0 24px -6px rgba(74, 222, 128, 0.5);
  }
  .candidate-card.picked.infeasible {
    border-color: #f59e0b;
    box-shadow: 0 0 24px -6px rgba(245, 158, 11, 0.5);
  }

  .thumbnail-frame {
    width: 100%;
    /* Fill the card's remaining space after the footer so the thumbnail
       scales with the available cell height instead of being locked to
       a square. */
    flex: 1;
    min-height: 120px;
    background: #0a0a14;
  }

  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 10px 8px;
    min-height: 32px;
  }

  .candidate-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--theme-text-primary, #f0f0f0);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }

  .status-pill {
    font-size: 11px;
    font-weight: 600;
    padding: 3px 7px;
    border-radius: 999px;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .status-pill.status-feasible {
    background: rgba(74, 222, 128, 0.18);
    color: #4ade80;
  }
  .status-pill.status-clip {
    background: rgba(245, 158, 11, 0.18);
    color: #f59e0b;
  }
  .status-pill.status-infeasible {
    background: rgba(239, 68, 68, 0.18);
    color: #f87171;
  }

  .picked-badge {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: #4ade80;
    color: #0a0a14;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  }

  .candidate-card.picked.infeasible .picked-badge {
    background: #f59e0b;
  }
</style>
