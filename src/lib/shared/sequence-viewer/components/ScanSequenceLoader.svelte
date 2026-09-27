<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import TKAWordGlyph from "$lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import ProgressBar from "$lib/shared/components/loading/ProgressBar.svelte";

  interface Props {
    word?: string;
    glyphsReady?: boolean;
    progress?: number;
    fill?: boolean;
    fitToParent?: boolean;
  }

  let {
    word = "",
    glyphsReady = false,
    progress = 0,
    fill = false,
    fitToParent = true,
  }: Props = $props();
</script>

<div
  class:fill
  class="scan-sequence-loader"
  role="status"
  aria-live="polite"
  aria-label={word ? `Loading ${word}` : t("viewer_detail_loading_sequence")}
>
  {#if glyphsReady && word}
    <div class="word-loader">
      <TKAWordGlyph {word} height={40} darkMode {fitToParent} />
    </div>
    <div class="loader-progress">
      <ProgressBar percent={progress} height={4} />
    </div>
  {:else}
    <div class="dots-loader" aria-hidden="true">
      <span></span><span></span><span></span>
    </div>
  {/if}
</div>

<style>
  .scan-sequence-loader {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
  }

  .scan-sequence-loader.fill {
    position: absolute;
    inset: 0;
    z-index: 2;
    min-height: 100%;
    background: var(--theme-panel-bg, #0b1d2a);
  }

  .word-loader {
    display: flex;
    justify-content: center;
    width: 100%;
    animation: word-pulse 1.4s ease-in-out infinite;
  }

  .loader-progress {
    width: 160px;
    max-width: 60%;
    margin: 1rem auto 0;
  }

  .dots-loader {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
  }

  .dots-loader span {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--theme-accent, #0891b2);
    animation: dot-pulse 1.2s ease-in-out infinite;
  }

  .dots-loader span:nth-child(2) {
    animation-delay: 0.2s;
  }

  .dots-loader span:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes word-pulse {
    0%,
    100% {
      opacity: 0.35;
      transform: scale(0.97);
    }
    50% {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes dot-pulse {
    0%,
    100% {
      opacity: 0.3;
      transform: scale(0.8);
    }
    50% {
      opacity: 1;
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .word-loader,
    .dots-loader span {
      animation: none;
    }

    .word-loader {
      opacity: 0.85;
    }
  }
</style>
