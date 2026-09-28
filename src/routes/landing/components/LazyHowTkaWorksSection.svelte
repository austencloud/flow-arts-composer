<!-- The placeholder mirrors the compact heading and three-proof strip. -->
<script lang="ts">
  import type { Component } from "svelte";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let InnerComponent: Component<any> | null = $state(null);
  let loadFailed = $state(false);
  let isLoading = $state(false);
  let revealed = $state(false);
  let sectionEl: HTMLElement | undefined = $state();

  function loadComponent() {
    if (isLoading || InnerComponent) return;
    isLoading = true;
    loadFailed = false;

    import("./HowTkaWorksSection.svelte")
      .then((mod) => {
        InnerComponent = mod.default;
      })
      .catch((error) => {
        console.error("[LazyHowTkaWorksSection] Failed to load:", error);
        loadFailed = true;
      })
      .finally(() => {
        isLoading = false;
      });
  }

  $effect(() => {
    if (!sectionEl) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        revealed = true;
        loadComponent();
      },
      { rootMargin: "200px" }
    );

    observer.observe(sectionEl);
    return () => observer.disconnect();
  });
</script>

<div
  bind:this={sectionEl}
  class="lazy-section"
  class:revealed
  id="how-it-works"
>
  {#if InnerComponent}
    <InnerComponent />
  {:else if loadFailed}
    <div class="how-section-placeholder" aria-label="Failed to load section">
      <p>Couldn't load this section.</p>
      <button onclick={loadComponent}>
        <i class="fas fa-redo" aria-hidden="true"></i>
        Try again
      </button>
    </div>
  {:else}
    <div class="how-section-skeleton" aria-hidden="true">
      <div class="sk-intro">
        <div class="sk-heading"></div>
        <div class="sk-copy"></div>
      </div>
      <div class="sk-proof-strip">
        <div class="sk-proof"></div>
        <div class="sk-proof"></div>
        <div class="sk-proof"></div>
      </div>
    </div>
  {/if}
</div>

<style>
  .lazy-section {
    opacity: 0;
    transform: translateY(24px);
    transition:
      opacity 0.5s ease,
      transform 0.5s ease;
  }

  .lazy-section.revealed {
    opacity: 1;
    transform: translateY(0);
  }

  .how-section-skeleton {
    --sk-surface: rgba(255, 255, 255, 0.08);
    --sk-height: clamp(280px, 24vw, 360px);

    box-sizing: border-box;
    width: min(calc(100% - 48px), 1480px);
    margin: 0 auto;
    padding: 64px 0 72px;
  }

  .sk-intro {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 40px;
    margin-bottom: 28px;
  }

  .sk-heading,
  .sk-copy,
  .sk-proof {
    background: var(--sk-surface);
    animation: skeleton-pulse 1.8s ease-in-out infinite;
  }

  .sk-heading {
    width: min(330px, 40%);
    height: clamp(42px, 4vw, 58px);
    border-radius: 7px;
  }

  .sk-copy {
    width: min(400px, 34%);
    height: 16px;
    margin-bottom: 5px;
    border-radius: 4px;
  }

  .sk-proof-strip {
    display: grid;
    height: var(--sk-height);
    grid-template-columns: repeat(3, minmax(0, 1fr));
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 22px;
  }

  .sk-proof + .sk-proof {
    border-left: 1px solid rgba(255, 255, 255, 0.1);
  }

  .sk-proof:last-child {
    background: rgba(0, 0, 0, 0.22);
  }

  .how-section-placeholder {
    display: flex;
    min-height: 320px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 56px 24px;
    text-align: center;
  }

  .how-section-placeholder p {
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-min, 14px);
  }

  .how-section-placeholder button {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: 8px;
    background: transparent;
    color: var(--theme-text, #fff);
    cursor: pointer;
    font-size: var(--font-size-min, 14px);
  }

  .how-section-placeholder button:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 4px;
  }

  @keyframes skeleton-pulse {
    0%,
    100% {
      opacity: 0.5;
    }
    50% {
      opacity: 0.9;
    }
  }

  @media (max-width: 760px) {
    .how-section-skeleton {
      --sk-height: clamp(176px, 49vw, 210px);

      width: min(calc(100% - 32px), 680px);
      padding: 48px 0 56px;
    }

    .sk-intro {
      display: block;
      margin-bottom: 22px;
    }

    .sk-heading {
      width: min(280px, 72%);
      height: 46px;
    }

    .sk-copy {
      width: 82%;
      margin-top: 14px;
    }

    .sk-proof-strip {
      border-radius: 14px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .lazy-section {
      opacity: 1;
      transform: none;
      transition: none;
    }

    .sk-heading,
    .sk-copy,
    .sk-proof {
      animation: none;
    }
  }
</style>
