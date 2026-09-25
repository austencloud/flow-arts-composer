<script lang="ts">
  import type { ShowroomTheme } from "./theme-showroom-data";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { TranslationKey } from "$lib/shared/i18n/i18n-types";
  import ThemeSceneCanvas from "./ThemeSceneCanvas.svelte";

  interface Props {
    theme: ShowroomTheme;
    selected: boolean;
    confirmed: boolean;
    livePreview: boolean;
    allowAutomaticOrbit: boolean;
    fallbackReason?: "connection" | "renderer" | null;
    onSelect: () => void;
    onRenderError: (error: unknown) => void;
  }

  let {
    theme,
    selected,
    confirmed,
    livePreview,
    allowAutomaticOrbit,
    fallbackReason = null,
    onSelect,
    onRenderError,
  }: Props = $props();

  let sceneReady = $state(false);
  const themeName = $derived(t(`settings_theme_${theme.id}` as TranslationKey));

  $effect(() => {
    theme.id;
    sceneReady = false;
  });
</script>

<section
  class="stage"
  data-theme={theme.id}
  aria-label={t("settings_previewing_theme", { theme: themeName })}
>
  <div
    class="environment-art"
    style:--card-gradient={theme.card.gradient}
    aria-hidden="true"
  >
    <div class="art-orb"></div>
    <div class="art-horizon"></div>
    <div class="art-particles"></div>
  </div>

  {#if livePreview}
    <div class="live-layer" class:ready={sceneReady}>
      <ThemeSceneCanvas
        backgroundType={theme.id}
        {allowAutomaticOrbit}
        onReadyChange={(ready) => (sceneReady = ready)}
        {onRenderError}
      />
    </div>
  {/if}

  <div class="stage-vignette" aria-hidden="true"></div>

  <div class="stage-toolbar">
    <div class="render-status">
      <span class="status-dot" class:loading={livePreview && !sceneReady}
      ></span>
      {#if livePreview}
        {sceneReady ? t("settings_showroom_live") : t("settings_showroom_building")}
      {:else if fallbackReason === "connection"}
        {t("settings_showroom_low_data")}
      {:else}
        {t("settings_showroom_preview")}
      {/if}
    </div>
  </div>

  <div class="stage-copy">
    <div class="theme-index">{theme.number} / 10</div>
    <div class="theme-title-row">
      <div>
        <span class="preview-label">{t("settings_showroom_previewing")}</span>
        <h2>{themeName}</h2>
      </div>
      <button
        type="button"
        class="select-button"
        class:selected={confirmed}
        onclick={onSelect}
        disabled={confirmed}
      >
        {#if confirmed}
          <i class="fas fa-check" aria-hidden="true"></i>
          {t("settings_showroom_selected")}
        {:else if selected}
          {t("settings_showroom_confirm_theme", { theme: themeName })}
        {:else}
          {t("settings_use_theme", { theme: themeName })}
        {/if}
      </button>
    </div>
    <p class="interaction-note">
      {livePreview ? t("settings_showroom_drag_hint") : t("settings_showroom_fallback_hint")}
    </p>
  </div>
</section>

<style>
  .stage {
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--settings-panel-radius);
    background: var(--theme-preview-surface);
    box-shadow: 0 1.5rem 5rem rgba(0, 0, 0, 0.38);
  }

  .environment-art,
  .live-layer,
  .stage-vignette {
    position: absolute;
    inset: 0;
  }

  .environment-art {
    overflow: hidden;
    background: var(--card-gradient);
    transition: background 500ms ease;
  }

  .art-orb {
    position: absolute;
    top: 10%;
    right: 12%;
    width: min(26cqw, 50cqh);
    aspect-ratio: 1;
    border-radius: 50%;
    background: radial-gradient(
      circle at 36% 30%,
      rgba(255, 255, 255, 0.75),
      color-mix(in srgb, var(--active-accent) 70%, transparent) 8%,
      transparent 64%
    );
    filter: blur(1px);
    opacity: 0.45;
    box-shadow: 0 0 8rem
      color-mix(in srgb, var(--active-accent) 45%, transparent);
  }

  .art-horizon {
    position: absolute;
    right: -10%;
    bottom: -24%;
    left: -10%;
    height: 58%;
    border-radius: 50% 50% 0 0;
    background:
      radial-gradient(
        ellipse at 50% 0%,
        color-mix(in srgb, var(--active-accent) 55%, transparent),
        transparent 48%
      ),
      linear-gradient(180deg, rgba(8, 9, 12, 0.25), rgba(3, 4, 7, 0.96));
    box-shadow: 0 -2rem 7rem rgba(0, 0, 0, 0.28);
  }

  .art-particles {
    position: absolute;
    inset: 0;
    opacity: 0.32;
    background-image:
      radial-gradient(circle at 12% 23%, white 0 1px, transparent 2px),
      radial-gradient(
        circle at 29% 67%,
        var(--active-accent) 0 1.5px,
        transparent 2.5px
      ),
      radial-gradient(circle at 68% 18%, white 0 1px, transparent 2px),
      radial-gradient(
        circle at 83% 62%,
        var(--active-accent) 0 1px,
        transparent 2px
      ),
      radial-gradient(circle at 48% 42%, white 0 1px, transparent 2px);
    background-size:
      11rem 9rem,
      15rem 13rem,
      19rem 14rem,
      13rem 17rem,
      21rem 16rem;
  }

  .stage[data-theme="ocean"] .art-horizon {
    background:
      repeating-radial-gradient(
        ellipse at 50% 0%,
        rgba(110, 231, 255, 0.18) 0 2px,
        transparent 3px 18px
      ),
      linear-gradient(180deg, rgba(0, 77, 105, 0.45), #031017 80%);
  }

  .stage[data-theme="forest"] .art-horizon,
  .stage[data-theme="autumn"] .art-horizon {
    clip-path: polygon(
      0 76%,
      8% 34%,
      16% 70%,
      25% 14%,
      32% 66%,
      42% 26%,
      52% 70%,
      62% 8%,
      72% 67%,
      82% 25%,
      90% 66%,
      100% 38%,
      100% 100%,
      0 100%
    );
    border-radius: 0;
  }

  .stage[data-theme="pride"] .environment-art {
    background:
      radial-gradient(
        circle at 70% 24%,
        rgba(255, 255, 255, 0.3),
        transparent 24%
      ),
      conic-gradient(
        from 215deg at 50% 85%,
        #131433,
        #55207b,
        #c33174,
        #e58133,
        #e9d85c,
        #43be9a,
        #245b9c,
        #131433
      );
  }

  .stage[data-theme="void"] .art-orb {
    background: #050506;
    opacity: 0.95;
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.12),
      0 0 6rem rgba(111, 87, 173, 0.34);
  }

  .live-layer {
    opacity: 0.38;
    transform: scale(1.015);
    transition:
      opacity 700ms ease,
      transform 900ms cubic-bezier(0.2, 0.75, 0.2, 1);
  }

  .live-layer.ready {
    opacity: 1;
    transform: scale(1);
  }

  .stage-vignette {
    pointer-events: none;
    background:
      linear-gradient(
        180deg,
        rgba(3, 4, 8, 0.58) 0%,
        transparent 21%,
        transparent 52%,
        rgba(3, 4, 8, 0.82) 100%
      ),
      linear-gradient(
        90deg,
        rgba(3, 4, 8, 0.28),
        transparent 20%,
        transparent 82%,
        rgba(3, 4, 8, 0.16)
      );
  }

  .stage-toolbar {
    position: absolute;
    z-index: 4;
    top: clamp(0.8rem, 1cqw, 1.6rem);
    right: clamp(0.8rem, 1cqw, 1.6rem);
    left: clamp(0.8rem, 1cqw, 1.6rem);
    display: flex;
    pointer-events: none;
  }

  .render-status {
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
    min-height: 2.55rem;
    padding: 0.55rem 0.9rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    color: rgba(255, 255, 255, 0.78);
    background: rgba(8, 9, 13, 0.72);
    box-shadow: 0 0.65rem 2rem rgba(0, 0, 0, 0.24);
    backdrop-filter: blur(16px);
    font-size: max(0.8rem, var(--font-size-compact, 12px));
    font-weight: 650;
    letter-spacing: 0.025em;
  }

  .status-dot {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    background: #55e69c;
    box-shadow:
      0 0 0 0.22rem rgba(85, 230, 156, 0.13),
      0 0 1rem rgba(85, 230, 156, 0.45);
  }

  .status-dot.loading {
    background: var(--active-accent);
    animation: breathe 1.5s ease-in-out infinite;
  }

  .stage-copy {
    position: absolute;
    z-index: 4;
    right: clamp(1rem, 2cqw, 3rem);
    bottom: clamp(1rem, 2cqw, 3rem);
    left: clamp(1rem, 2cqw, 3rem);
    pointer-events: none;
  }

  .theme-index,
  .preview-label {
    display: block;
    font-size: clamp(0.75rem, 0.54cqw, 0.9rem);
    font-weight: 750;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .theme-index {
    margin-bottom: clamp(0.65rem, 0.7cqw, 1rem);
    color: color-mix(in srgb, var(--active-accent) 72%, white);
  }

  .preview-label {
    margin-bottom: 0.3rem;
    color: rgba(255, 255, 255, 0.62);
    font-size: max(0.75rem, var(--font-size-compact, 12px));
  }

  .theme-title-row {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 2rem;
  }

  h2 {
    margin: 0;
    font-size: clamp(3rem, 5.2cqw, 8.75rem);
    font-weight: 680;
    letter-spacing: -0.065em;
    line-height: 0.82;
    text-shadow: 0 0.25rem 1.6rem rgba(0, 0, 0, 0.5);
  }

  .select-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    min-width: 10rem;
    min-height: 3.35rem;
    padding: 0.75rem 1.35rem;
    border: 1px solid color-mix(in srgb, var(--active-accent) 70%, white 12%);
    border-radius: 999px;
    color: #08090c;
    background: color-mix(in srgb, var(--active-accent) 84%, white);
    box-shadow: 0 0.8rem 2.8rem
      color-mix(in srgb, var(--active-accent) 30%, transparent);
    font: inherit;
    font-size: max(0.875rem, var(--font-size-min, 14px));
    font-weight: 760;
    cursor: pointer;
    pointer-events: auto;
    transition:
      transform 160ms ease,
      box-shadow 160ms ease,
      filter 160ms ease;
  }

  .select-button:hover:not(:disabled) {
    transform: translateY(-2px);
    filter: brightness(1.08);
    box-shadow: 0 1.1rem 3.3rem
      color-mix(in srgb, var(--active-accent) 38%, transparent);
  }

  .select-button.selected {
    border-color: rgba(255, 255, 255, 0.16);
    color: rgba(255, 255, 255, 0.85);
    background: rgba(10, 11, 15, 0.6);
    box-shadow: none;
    cursor: default;
  }

  .interaction-note {
    margin: clamp(0.8rem, 0.8cqw, 1.15rem) 0 0;
    color: rgba(255, 255, 255, 0.58);
    font-size: clamp(0.8rem, 0.63cqw, 1rem);
    line-height: 1.45;
  }

  button:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--active-accent) 72%, white);
    outline-offset: 3px;
  }

  @keyframes breathe {
    50% {
      transform: scale(0.78);
      opacity: 0.55;
      box-shadow: 0 0 1.35rem
        color-mix(in srgb, var(--active-accent) 52%, transparent);
    }
  }

  @container theme-showroom (max-width: 40rem) {
    .stage-copy {
      right: 1rem;
      bottom: 1rem;
      left: 1rem;
    }

    .theme-title-row {
      align-items: center;
      gap: 0.75rem;
    }

    h2 {
      font-size: clamp(2.75rem, 16cqw, 4.25rem);
    }

    .select-button {
      min-width: 7.5rem;
      min-height: 2.85rem;
      padding: 0.65rem 0.9rem;
    }

    .interaction-note {
      display: none;
    }
  }

  @container theme-showroom (max-height: 36rem) and (min-width: 41rem) {
    .interaction-note,
    .preview-label,
    .theme-index {
      display: none;
    }

    h2 {
      font-size: clamp(2.7rem, 6cqw, 5rem);
    }

    .stage-copy {
      bottom: 0.85rem;
    }

    .select-button {
      min-height: 2.6rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms;
      animation-iteration-count: 1;
      transition-duration: 0.01ms;
    }
  }
</style>
