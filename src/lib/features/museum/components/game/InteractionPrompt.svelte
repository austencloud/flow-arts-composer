<script lang="ts">
  import "../museum-theme.css";
  import { getMuseumContext } from "../../state/museum-context";
  import { tileKey } from "../../domain/museum-grid-types";
  import { isInteractable } from "../../domain/tile-registry";

  const { state } = getMuseumContext();

  const DIRECTION_DELTAS = {
    north: { dx: 0, dy: -1 },
    south: { dx: 0, dy: 1 },
    east: { dx: 1, dy: 0 },
    west: { dx: -1, dy: 0 },
  } as const;

  // Check if the tile the player is facing is interactable
  let hasInteractable = $derived.by(() => {
    const delta = DIRECTION_DELTAS[state.playerFacing];
    const targetX = state.playerX + delta.dx;
    const targetY = state.playerY + delta.dy;
    const tile = state.grid.tiles.get(tileKey(targetX, targetY));
    return tile ? isInteractable(tile.type) : false;
  });
</script>

{#if hasInteractable}
  <div
    class="interaction-prompt museum-gold-scope"
    role="status"
    aria-live="polite"
  >
    <kbd>E</kbd>
    <span>Examine</span>
  </div>
{/if}

<style>
  .interaction-prompt {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    background: rgba(0, 0, 0, 0.8);
    border: 1px solid var(--museum-gold-30);
    border-radius: 6px;
    z-index: 30;
    animation: prompt-fade-in var(--duration-normal) var(--ease-standard);
    pointer-events: none;
  }

  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    padding: 0 6px;
    background: var(--museum-gold-15);
    border: 1px solid var(--museum-gold-40);
    border-radius: 4px;
    color: #c8b890;
    font-family: monospace;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
  }

  span {
    color: var(--museum-gold-80);
    font-size: var(--font-size-min, 14px);
  }

  @keyframes prompt-fade-in {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }
</style>
