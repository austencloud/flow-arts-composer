<script lang="ts">
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import type { WordBridgeAnalysis } from "../domain/word-bridge-questions";

  let {
    analysis,
    reveal = false,
    revealAll = true,
    focusGapIndex = null,
    showFocusSocket = false,
    onSelectGap = null,
  }: {
    analysis: WordBridgeAnalysis;
    reveal?: boolean;
    revealAll?: boolean;
    focusGapIndex?: number | null;
    showFocusSocket?: boolean;
    onSelectGap?: ((index: number) => void) | null;
  } = $props();

  const displayWord = $derived(simplifyRepeatedWord(analysis.word));
  const focusedGap = $derived(
    analysis.gaps.find((gap) => gap.index === focusGapIndex) ?? null
  );
  const summary = $derived.by(() => {
    if (reveal) {
      return `${displayWord}. ${analysis.requiredBridgeCount} ${analysis.requiredBridgeCount === 1 ? "bridge" : "bridges"} required.`;
    }

    if (showFocusSocket && focusedGap) {
      return `Word ${displayWord}. Marked gap from ${focusedGap.from}, ending ${focusedGap.fromEndPlacementGroup}, to ${focusedGap.to}, starting ${focusedGap.toStartPlacementGroup}. Choose a bridge that starts ${focusedGap.fromEndPlacementGroup} and ends ${focusedGap.toStartPlacementGroup}.`;
    }

    return `Word ${displayWord}. Bridge status hidden.`;
  });

  function isRevealed(index: number): boolean {
    return reveal && (revealAll || focusGapIndex === index);
  }
</script>

<div class="word-rail" role="group" aria-label={summary}>
  {#each analysis.letters as letter, index (`${letter}-${index}`)}
    <span class="letter-tile" aria-hidden="true">{letter}</span>

    {#if analysis.gaps[index]}
      {@const gap = analysis.gaps[index]}
      {@const shown = isRevealed(gap.index)}
      {@const focused = focusGapIndex === gap.index}

      <span
        class="gap-slot"
        class:focused
        class:interactive={shown && !gap.direct && !!onSelectGap}
        aria-hidden={!shown && !showFocusSocket}
      >
        {#if shown && gap.direct}
          <span
            class="direct-link"
            title="Direct transition"
            aria-hidden="true"
          >
            <span class="link-line"></span>
            <span class="link-check">✓</span>
          </span>
        {:else if shown && !gap.direct && onSelectGap}
          <button
            type="button"
            class="bridge-marker"
            class:selected={focused}
            aria-pressed={focused}
            aria-label="Inspect the gap from {gap.from} to {gap.to}, {gap.bridgeCount ??
              0} {(gap.bridgeCount ?? 0) === 1 ? 'bridge' : 'bridges'}"
            onclick={() => onSelectGap?.(gap.index)}
          >
            +{gap.bridgeCount ?? "?"}
          </button>
        {:else if shown && !gap.direct}
          <span class="bridge-marker static" aria-hidden="true">
            +{gap.bridgeCount ?? "?"}
          </span>
        {:else if showFocusSocket && focused}
          <span class="bridge-socket" aria-hidden="true">?</span>
        {:else}
          <span class="unknown-link" aria-hidden="true"></span>
        {/if}
      </span>
    {/if}
  {/each}
</div>

<style>
  .word-rail {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-width: 0;
    padding: 0.35rem 0;
  }

  .letter-tile {
    display: grid;
    place-items: center;
    flex: 0 1 clamp(32px, 11cqi, 58px);
    width: clamp(32px, 11cqi, 58px);
    aspect-ratio: 1;
    min-width: 28px;
    border: 1px solid
      color-mix(in srgb, var(--game-accent) 26%, var(--theme-stroke));
    border-radius: clamp(8px, 2.5cqi, 14px);
    background: color-mix(in srgb, var(--game-accent) 8%, var(--theme-card-bg));
    color: var(--theme-text);
    font-family: "JetBrains Mono", "Fira Code", "SF Mono", monospace;
    font-size: clamp(1rem, 5.5cqi, 2rem);
    font-weight: 850;
    line-height: 1;
    box-shadow: 0 8px 22px -18px var(--game-accent);
  }

  .gap-slot {
    display: grid;
    place-items: center;
    flex: 0 1 clamp(18px, 7cqi, 42px);
    width: clamp(18px, 7cqi, 42px);
    min-width: 16px;
    height: clamp(34px, 10cqi, 52px);
  }

  .gap-slot.focused {
    color: var(--game-accent);
  }

  .gap-slot.interactive {
    flex-basis: var(--min-touch-target, 44px);
    width: var(--min-touch-target, 44px);
    min-width: var(--min-touch-target, 44px);
  }

  .unknown-link,
  .link-line {
    display: block;
    width: 70%;
    height: 2px;
    border-radius: 999px;
    background: var(--theme-stroke);
  }

  .direct-link {
    position: relative;
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    color: var(--semantic-success);
  }

  .direct-link .link-line {
    width: 78%;
    background: color-mix(in srgb, var(--semantic-success) 70%, transparent);
  }

  .link-check {
    position: absolute;
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--semantic-success);
    color: #07120c;
    font-size: 10px;
    font-weight: 900;
  }

  .bridge-marker,
  .bridge-socket {
    display: grid;
    place-items: center;
    width: clamp(26px, 7cqi, 38px);
    height: clamp(26px, 7cqi, 38px);
    padding: 0;
    border: 1.5px solid
      color-mix(in srgb, var(--semantic-warning) 70%, transparent);
    border-radius: 9px;
    background: color-mix(
      in srgb,
      var(--semantic-warning) 13%,
      var(--theme-card-bg)
    );
    color: var(--semantic-warning);
    font-size: var(--font-size-min, 14px);
    font-weight: 850;
    font-variant-numeric: tabular-nums;
  }

  button.bridge-marker {
    min-width: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    cursor: pointer;
    transition:
      transform var(--duration-fast) ease,
      background var(--duration-fast) ease,
      border-color var(--duration-fast) ease;
  }

  button.bridge-marker:hover {
    transform: translateY(-2px);
    background: color-mix(
      in srgb,
      var(--semantic-warning) 22%,
      var(--theme-card-bg)
    );
  }

  button.bridge-marker.selected {
    border-color: var(--game-accent);
    box-shadow: 0 0 0 2px
      color-mix(in srgb, var(--game-accent) 20%, transparent);
  }

  button.bridge-marker:focus-visible {
    outline: 2px solid var(--game-accent);
    outline-offset: 2px;
  }

  .bridge-marker.static {
    width: clamp(26px, 7cqi, 38px);
    height: clamp(26px, 7cqi, 38px);
  }

  .bridge-socket {
    border-style: dashed;
    border-color: var(--game-accent);
    background: color-mix(in srgb, var(--game-accent) 10%, transparent);
    color: var(--game-accent);
  }

  @container (max-width: 340px) {
    .letter-tile {
      flex-basis: clamp(25px, 9cqi, 34px);
      width: clamp(25px, 9cqi, 34px);
      min-width: 25px;
      font-size: clamp(0.9rem, 5cqi, 1.2rem);
    }

    .gap-slot:not(.interactive) {
      flex-basis: clamp(12px, 5cqi, 20px);
      width: clamp(12px, 5cqi, 20px);
      min-width: 12px;
    }

    .bridge-marker.static,
    .bridge-socket {
      width: 22px;
      height: 22px;
      border-radius: 7px;
      font-size: var(--font-size-compact, 12px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    button.bridge-marker {
      transition: none;
    }

    button.bridge-marker:hover {
      transform: none;
    }
  }
</style>
