<script lang="ts">
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import type { PostTimingSession } from "./post-timing-session.svelte";
  let { session }: { session: PostTimingSession } = $props();
</script>

<button
  type="button"
  class="tap"
  onclick={session.tap}
  disabled={!session.url}
  style:--tap-duration="{DURATION.fast}ms"
>
  {#key session.tapCount}<span class="flash" aria-hidden="true"></span>{/key}
  <i class="fa-solid fa-hand-pointer" aria-hidden="true"></i>
  <span>Tap a landing</span><kbd>T</kbd>
</button>

<style>
  .tap {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    min-height: 3rem;
    padding: 0.75rem 1.25rem;
    overflow: hidden;
    border: 1px solid var(--theme-accent);
    border-radius: 0.625rem;
    background: var(--theme-accent);
    color: var(--theme-text-on-accent, #fff);
    font: inherit;
    font-size: var(--mapping-heading-size, 1rem);
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
  }
  .tap:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .tap:focus-visible {
    outline: 2px solid var(--theme-text);
    outline-offset: 3px;
  }
  kbd {
    padding: 0.125rem 0.375rem;
    border: 1px solid currentColor;
    border-radius: 0.25rem;
    font: inherit;
    font-size: var(--mapping-meta-size, 0.75rem);
  }
  .flash {
    position: absolute;
    inset: 0;
    background: var(--theme-text);
    opacity: 0;
    animation: tap-flash var(--tap-duration) ease-out;
    pointer-events: none;
  }
  @keyframes tap-flash {
    from {
      opacity: 0.4;
    }
    to {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .flash {
      animation: none;
    }
  }
  @media (pointer: coarse) {
    kbd {
      display: none;
    }
  }
</style>
