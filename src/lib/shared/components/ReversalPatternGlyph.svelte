<!--
  ReversalPatternGlyph - Tiny dot-pair columns showing the reversal pattern.
  Period-compressed: shows only one period of the pattern.
  Used on card backs to identify which reversal pattern deck a card belongs to.
-->
<script lang="ts">
  interface Props {
    sequence: string; // e.g., "PPPP", "RBRB", "----"
    period: number; // Number of columns to show
    /** Optional width in glyph units; the card back keeps its natural size. */
    maxWidthCqi?: number;
  }

  const { sequence, period, maxWidthCqi }: Props = $props();

  // Show one period, capped at 8
  const symbols = $derived(sequence.slice(0, Math.min(8, period)).split(""));
  const scale = $derived(
    maxWidthCqi === undefined || symbols.length === 0
      ? 1
      : Math.min(
          1,
          maxWidthCqi / (symbols.length * 1.8 + (symbols.length - 1) * 0.6)
        )
  );

  function getDots(symbol: string): { right: boolean; left: boolean } {
    switch (symbol) {
      case "P":
        return { right: true, left: true };
      case "R":
        return { right: true, left: false };
      case "B":
        return { right: false, left: true };
      default:
        return { right: false, left: false };
    }
  }
</script>

<div class="reversal-glyph" style="--glyph-scale: {scale}">
  {#each symbols as symbol}
    {@const dots = getDots(symbol)}
    <div class="dot-col">
      <div class="dot" class:red={dots.right} class:empty={!dots.right}></div>
      <div class="dot" class:blue={dots.left} class:empty={!dots.left}></div>
    </div>
  {/each}
</div>

<style>
  .reversal-glyph {
    display: flex;
    gap: calc(var(--glyph-unit, 1cqi) * 0.6 * var(--glyph-scale));
    align-items: center;
  }

  .dot-col {
    display: flex;
    flex-direction: column;
    gap: calc(var(--glyph-unit, 1cqi) * 0.3 * var(--glyph-scale));
  }

  .dot {
    width: calc(var(--glyph-unit, 1cqi) * 1.8 * var(--glyph-scale));
    height: calc(var(--glyph-unit, 1cqi) * 1.8 * var(--glyph-scale));
    border-radius: 50%;
  }

  .dot.red {
    background: var(--tka-red-hand, #e74c3c);
  }
  .dot.blue {
    background: var(--tka-blue-hand, #3498db);
  }
  .dot.empty {
    background: var(
      --glyph-muted,
      var(--card-text-muted, rgba(255, 255, 255, 0.18))
    );
    opacity: 0.4;
  }
</style>
