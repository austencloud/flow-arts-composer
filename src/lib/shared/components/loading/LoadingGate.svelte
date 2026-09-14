<script lang="ts">
  /**
   * LoadingGate - Full-page loading wrapper with three visual variants.
   * Uses the other loading primitives (IndeterminateBar, ProgressRing, ShimmerBlock).
   */

  import IndeterminateBar from "./IndeterminateBar.svelte";
  import ProgressRing from "./ProgressRing.svelte";
  import ShimmerBlock from "./ShimmerBlock.svelte";

  interface Props {
    /** Visual variant. Default "bar". */
    variant?: "bar" | "card" | "skeleton" | "mandala";
    /** Status message. Callers should provide context-specific text. */
    message?: string;
    /** Accent color override. */
    color?: string;
  }

  let { variant = "bar", message = "Loading...", color }: Props = $props();
</script>

<div class="loading-gate" role="status" aria-label={message}>
  {#if variant === "bar"}
    <IndeterminateBar position="top" {color} />
    <div class="centered-message">
      <span class="message-text">{message}</span>
    </div>
  {:else if variant === "card"}
    <div class="centered-card">
      <ProgressRing percent={-1} size={40} strokeWidth={3} {color} />
      <span class="message-text">{message}</span>
    </div>
  {:else if variant === "skeleton"}
    <div class="skeleton-layout">
      <ShimmerBlock width="40%" height="24px" borderRadius="6px" />
      <ShimmerBlock
        width="100%"
        height="120px"
        borderRadius="8px"
        delay={100}
      />
      <div class="skeleton-rows">
        <ShimmerBlock width="100%" height="16px" delay={200} />
        <ShimmerBlock width="85%" height="16px" delay={300} />
        <ShimmerBlock width="70%" height="16px" delay={400} />
      </div>
    </div>
  {:else if variant === "mandala"}
    {#await import("$lib/shared/mandala/components/MandalaLoader.svelte")}
      <IndeterminateBar position="top" {color} />
    {:then module}
      <module.default {message} />
    {/await}
  {/if}
</div>

<style>
  .loading-gate {
    position: absolute;
    inset: 0;
    z-index: 50;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .centered-message {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .centered-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 24px 32px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 16px;
  }

  .skeleton-layout {
    width: 100%;
    max-width: 480px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .skeleton-rows {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .message-text {
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }
</style>
