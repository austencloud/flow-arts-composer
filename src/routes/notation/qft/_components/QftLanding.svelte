<script lang="ts">
  import { fade } from "svelte/transition";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { getQftAppContext } from "../_context/qft-app-context";

  const state = getQftAppContext();

  function enterApp(): void {
    state.enter();
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(".qft-topbar .segment")?.focus();
    });
  }
</script>

<div class="landing qft-app" transition:fade={{ duration: DURATION.normal }}>
  <div class="landing-card">
    <h1>QfT Notation</h1>
    <p class="attribution">Quantized Field Theory · Charlie Cushing</p>
    <p class="lede">
      <span
        >Choose a motion for one hand, or put two hands in relationship.</span
      >
      <span>Every step is written out in Charlie's notation.</span>
    </p>
    <button type="button" class="primary" onclick={enterApp}
      >Open the notation</button
    >
  </div>

  <a class="exit" href="/history">
    <i class="fas fa-chevron-left" aria-hidden="true"></i>
    <span>All notation</span>
  </a>
</div>

<style>
  .landing {
    position: fixed;
    inset: 0;
    z-index: 4;
    display: grid;
    grid-template-rows: 1fr auto 1.35fr;
    justify-items: center;
    padding: clamp(1.25rem, 3vw, 3rem);
    background: rgb(6 8 20 / 0.82);
    backdrop-filter: blur(10px);
  }

  .landing-card {
    grid-row: 2;
    display: grid;
    justify-items: center;
    max-width: 46rem;
    gap: 0.5rem;
    text-align: center;
  }

  h1 {
    margin: 0;
    font-size: clamp(2rem, 6vw, 3.6rem);
    font-weight: 700;
    line-height: 1.05;
    letter-spacing: -0.01em;
    color: var(--theme-text, #fff);
  }

  .attribution {
    margin: 0;
    font-size: var(--font-size-sm, 0.875rem);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--theme-text-dim, rgb(255 255 255 / 0.6));
  }

  .lede {
    margin: 0.9rem 0 0;
    font-size: clamp(1.05rem, 1.9vw, 1.4rem);
    line-height: 1.5;
    color: var(--theme-text, rgb(255 255 255 / 0.82));
  }

  .lede span {
    display: block;
    text-wrap: pretty;
  }

  .primary,
  .exit {
    width: auto;
    min-height: var(--min-touch-target, 44px);
    border-radius: 999px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      background-color var(--duration-fast, 140ms) ease,
      border-color var(--duration-fast, 140ms) ease,
      color var(--duration-fast, 140ms) ease;
  }

  .primary {
    margin-top: 1.9rem;
    padding: 0.7rem 1.5rem;
    border: 1px solid transparent;
    background: var(--theme-accent, #6c63ff);
    color: var(--theme-text-on-accent, #fff);
  }

  .primary:hover {
    background: color-mix(in srgb, var(--theme-accent, #6c63ff) 86%, white);
  }

  .exit {
    grid-row: 3;
    align-self: end;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-inline: 1.15rem;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.18));
    background: var(--theme-card-bg, rgb(0 0 0 / 0.3));
    color: var(--theme-text-dim, rgb(255 255 255 / 0.72));
    text-decoration: none;
  }

  .exit:hover {
    border-color: var(--theme-stroke-strong, rgb(255 255 255 / 0.4));
    color: var(--theme-text, #fff);
  }

  @media (prefers-reduced-motion: reduce) {
    .primary,
    .exit {
      transition: none;
    }
  }
</style>
