<script lang="ts">
  import { BackgroundType } from "@austencloud/backgrounds";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { TranslationKey } from "$lib/shared/i18n/i18n-types";

  import type { ShowroomTheme } from "./theme-showroom-data";

  interface Props {
    themes: ShowroomTheme[];
    previewedType: BackgroundType;
    selectedTheme: ShowroomTheme;
    onPreview: (backgroundType: BackgroundType) => void;
    onPrepare: (backgroundType: BackgroundType) => void;
  }

  let { themes, previewedType, selectedTheme, onPreview, onPrepare }: Props =
    $props();

  function themeName(theme: ShowroomTheme): string {
    return t(`settings_theme_${theme.id}` as TranslationKey);
  }
</script>

<aside class="theme-browser" aria-label={t("settings_theme_choices")}>
  <div class="browser-header">
    <div>
      <span class="browser-label">{t("settings_showroom_environments")}</span>
      <strong>{t("settings_showroom_selected_theme", { theme: themeName(selectedTheme) })}</strong>
    </div>
    <span class="scene-count">{t("settings_showroom_scene_count", { count: themes.length })}</span>
  </div>

  <div class="theme-grid">
    {#each themes as theme}
      <button
        type="button"
        class="theme-card"
        class:active={previewedType === theme.id}
        class:selected={selectedTheme.id === theme.id}
        style:--card-accent={theme.card.accentColor}
        style:--card-gradient={theme.card.gradient}
        data-theme={theme.id}
        aria-pressed={previewedType === theme.id}
        aria-label={t(selectedTheme.id === theme.id ? "settings_showroom_preview_selected" : "settings_showroom_preview_theme", { theme: themeName(theme) })}
        onpointerenter={() => onPrepare(theme.id)}
        onfocus={() => onPrepare(theme.id)}
        onclick={() => onPreview(theme.id)}
      >
        <span class="card-art" aria-hidden="true">
          <span class="card-orb"></span>
          <span class="card-horizon"></span>
        </span>
        <span class="card-shade"></span>
        <span class="card-number">{theme.number}</span>
        {#if selectedTheme.id === theme.id}
          <span class="selected-mark" aria-hidden="true">
            <i class="fas fa-check"></i>
          </span>
        {/if}
        <span class="card-label">
          <i class={`fas ${theme.icon}`} aria-hidden="true"></i>
          {themeName(theme)}
        </span>
      </button>
    {/each}
  </div>

  <div class="browser-footnote">
    <i class="fas fa-bolt" aria-hidden="true"></i>
    One live scene at a time. Quality adjusts while it runs.
  </div>
</aside>

<style>
  .theme-browser {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: clamp(0.8rem, 0.85cqw, 1.35rem);
    min-width: 0;
    min-height: 0;
    padding: clamp(0.85rem, 1cqw, 1.75rem);
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--settings-panel-radius);
    background: var(--theme-preview-surface);
    box-shadow: 0 1.5rem 5rem rgba(0, 0, 0, 0.38);
  }

  .browser-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .browser-label {
    display: block;
    color: color-mix(in srgb, var(--active-accent) 72%, white);
    font-size: clamp(0.75rem, 0.54cqw, 0.9rem);
    font-weight: 750;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .browser-header strong {
    display: block;
    margin-top: 0.2rem;
    color: rgba(255, 255, 255, 0.86);
    font-size: clamp(0.9rem, 0.72cqw, 1.2rem);
    font-weight: 620;
  }

  .scene-count {
    flex: 0 0 auto;
    color: rgba(255, 255, 255, 0.42);
    font-size: max(0.75rem, var(--font-size-compact, 12px));
  }

  .theme-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(5, minmax(0, 1fr));
    gap: clamp(0.5rem, 0.55cqw, 0.85rem);
    min-width: 0;
    min-height: 0;
  }

  .theme-card {
    --card-accent: #888;
    --card-gradient: linear-gradient(145deg, #222, #111);

    position: relative;
    min-width: 0;
    min-height: 4.25rem;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--settings-card-radius);
    color: white;
    background: var(--card-gradient);
    box-shadow: inset 0 1px rgba(255, 255, 255, 0.04);
    cursor: pointer;
    isolation: isolate;
    transition:
      transform 180ms ease,
      border-color 180ms ease,
      box-shadow 180ms ease,
      filter 180ms ease;
  }

  .theme-card:hover,
  .theme-card.active {
    z-index: 2;
    transform: translateY(-2px);
    border-color: color-mix(in srgb, var(--card-accent) 78%, white 10%);
    box-shadow:
      0 0.7rem 1.8rem rgba(0, 0, 0, 0.36),
      0 0 1.4rem color-mix(in srgb, var(--card-accent) 18%, transparent);
    filter: saturate(1.14) brightness(1.05);
  }

  .theme-card.active::after {
    position: absolute;
    inset: 0;
    z-index: 5;
    border: 2px solid var(--card-accent);
    border-radius: inherit;
    pointer-events: none;
    content: "";
  }

  .card-art,
  .card-shade {
    position: absolute;
    inset: 0;
  }

  .card-art {
    overflow: hidden;
  }

  .card-orb {
    position: absolute;
    top: 9%;
    right: 8%;
    width: 42%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: radial-gradient(
      circle at 35% 30%,
      rgba(255, 255, 255, 0.65),
      var(--card-accent) 12%,
      transparent 68%
    );
    opacity: 0.42;
  }

  .card-horizon {
    position: absolute;
    right: -10%;
    bottom: -38%;
    left: -10%;
    height: 72%;
    border-radius: 50% 50% 0 0;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--card-accent) 46%, transparent),
      rgba(1, 2, 4, 0.86)
    );
  }

  .theme-card[data-theme="forest"] .card-horizon,
  .theme-card[data-theme="autumn"] .card-horizon {
    bottom: -12%;
    height: 76%;
    border-radius: 0;
    clip-path: polygon(
      0 78%,
      14% 32%,
      25% 70%,
      38% 8%,
      54% 72%,
      69% 24%,
      82% 68%,
      100% 38%,
      100% 100%,
      0 100%
    );
  }

  .theme-card[data-theme="void"] .card-orb {
    background: #040405;
    opacity: 0.9;
    box-shadow: 0 0 2.5rem rgba(139, 92, 246, 0.42);
  }

  .card-shade {
    background: linear-gradient(
      180deg,
      rgba(0, 0, 0, 0.02),
      rgba(0, 0, 0, 0.1) 42%,
      rgba(0, 0, 0, 0.78)
    );
  }

  .card-number,
  .selected-mark,
  .card-label {
    position: absolute;
    z-index: 4;
  }

  .card-number {
    top: 0.65rem;
    left: 0.7rem;
    color: rgba(255, 255, 255, 0.48);
    font-size: max(0.75rem, var(--font-size-compact, 12px));
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  .selected-mark {
    top: 0.55rem;
    right: 0.55rem;
    display: grid;
    width: 1.55rem;
    height: 1.55rem;
    place-items: center;
    border-radius: 50%;
    color: #090a0e;
    background: color-mix(in srgb, var(--card-accent) 82%, white);
    box-shadow: 0 0.35rem 1rem rgba(0, 0, 0, 0.3);
    font-size: 0.7rem;
  }

  .card-label {
    right: 0.7rem;
    bottom: 0.65rem;
    left: 0.7rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    font-size: clamp(0.82rem, 0.68cqw, 1.05rem);
    font-weight: 680;
    letter-spacing: -0.01em;
    text-shadow: 0 1px 0.8rem rgba(0, 0, 0, 0.8);
  }

  .card-label i {
    color: color-mix(in srgb, var(--card-accent) 78%, white);
  }

  .browser-footnote {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    color: rgba(255, 255, 255, 0.42);
    font-size: max(0.75rem, var(--font-size-compact, 12px));
    line-height: 1.35;
  }

  .browser-footnote i {
    color: color-mix(in srgb, var(--active-accent) 76%, white);
  }

  button:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--active-accent) 72%, white);
    outline-offset: 3px;
  }

  @container theme-showroom (max-width: 61rem) {
    .theme-browser {
      overflow: visible;
    }

    .theme-grid {
      grid-template-columns: repeat(5, minmax(0, 1fr));
      grid-template-rows: repeat(2, 7rem);
    }
  }

  @container theme-showroom (max-width: 40rem) {
    .theme-browser {
      display: block;
      padding: 0.7rem;
    }

    .browser-header,
    .browser-footnote {
      display: none;
    }

    .theme-grid {
      display: flex;
      gap: 0.55rem;
      width: 100%;
      max-width: 100%;
      overflow-x: auto;
      scroll-snap-type: x proximity;
      scrollbar-width: none;
    }

    .theme-grid::-webkit-scrollbar {
      display: none;
    }

    .theme-card {
      flex: 0 0 8.2rem;
      height: 6.1rem;
      scroll-snap-align: start;
    }
  }

  @container theme-showroom (max-height: 36rem) and (min-width: 41rem) {
    .theme-browser {
      gap: 0.45rem;
      padding: 0.55rem;
    }

    .browser-header,
    .browser-footnote {
      display: none;
    }

    .theme-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: repeat(5, minmax(3.2rem, 1fr));
    }

    .theme-card {
      min-height: 3.2rem;
    }

    .card-number {
      display: none;
    }

    .selected-mark {
      top: 0.3rem;
      right: 0.3rem;
      width: 1.2rem;
      height: 1.2rem;
      font-size: 0.58rem;
    }

    .card-label {
      bottom: 0.42rem;
      font-size: 0.78rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .theme-card {
      transition: none;
    }
  }
</style>
