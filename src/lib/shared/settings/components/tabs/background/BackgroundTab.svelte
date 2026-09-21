<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import {
    holdBackground,
    releaseBackground,
  } from "$lib/shared/background/shared/state/background-hold.svelte";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { tryGetAccountSetupContext } from "$lib/shared/onboarding/context/account-setup-context";
  import { showToast } from "$lib/shared/toast/state/toast-state.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import { BackgroundType } from "@austencloud/backgrounds";
  import {
    BACKGROUND_CARD_REGISTRY,
    getCardMetadata,
  } from "@austencloud/backgrounds/card";
  import { onMount } from "svelte";
  import type { AppSettings } from "../../../domain/app-settings";
  import { applyThemeFromColors } from "../../../utils/background-theme-calculator";
  import ThemePreview from "./ThemePreview.svelte";

  let { settings, onUpdate } = $props<{
    settings: AppSettings;
    onUpdate?: (event: { key: string; value: unknown }) => void;
  }>();

  const accountSetupState = tryGetAccountSetupContext();
  const descriptions: Record<string, string> = {
    ember: "Warm sparks and a low glow for late-night practice.",
    cosmic: "A deep night field with room for your work to stand out.",
    ocean: "Cool water and drifting life beneath the surface.",
    forest: "Layered green light with a little breathing room.",
    winter: "A calm blue field with crisp, quiet motion.",
    pride: "A full spectrum with bright, celebratory movement.",
    blossom: "Pink blossoms and drifting petals.",
    autumn: "Falling color, warm air, and a little fire.",
    celestial: "Open sky, sunlight, and a clear horizon.",
    void: "Near-black space for maximum focus on the composition.",
  };

  let hapticService: HapticFeedback | null = null;
  let previewType = $state<BackgroundType>(
    settings?.backgroundType || BackgroundType.COSMIC
  );

  const currentType = $derived(
    settings?.backgroundType || BackgroundType.COSMIC
  );
  const preview = $derived(
    getCardMetadata(previewType) ?? BACKGROUND_CARD_REGISTRY[0]
  );
  const previewIsCurrent = $derived(previewType === currentType);
  const needsThemeConfirmation = $derived(
    accountSetupState?.available &&
      accountSetupState.tasks.some(
        (task) => task.id === "theme" && !task.complete
      )
  );
  const canApplyPreview = $derived(!previewIsCurrent || needsThemeConfirmation);

  $effect(() => {
    if (!BACKGROUND_CARD_REGISTRY.some((theme) => theme.type === previewType)) {
      previewType = currentType;
    }
  });

  onMount(() => {
    hapticService = getHapticFeedback();
    holdBackground("settings-theme-preview");
    return () => releaseBackground("settings-theme-preview");
  });

  async function recordThemeChoice(): Promise<void> {
    if (!accountSetupState) return;
    await accountSetupState.markThemeChosen();
    if (!accountSetupState.saveError) return;
    showToast({
      message: accountSetupState.saveError,
      type: "error",
      duration: 10_000,
      announcement: "polite",
      action: {
        label: "Retry",
        onClick: () => void accountSetupState.retrySave(),
      },
    });
  }

  function previewTheme(type: BackgroundType): void {
    previewType = type;
    hapticService?.trigger("selection");
  }

  function applyPreview(): void {
    if (!canApplyPreview) return;
    hapticService?.trigger("success");
    if (!previewIsCurrent) {
      applyThemeFromColors(undefined, preview.themeColors);
      onUpdate?.({ key: "backgroundType", value: previewType });
    }
    void recordThemeChoice();
  }
</script>

<div class="background-tab themed-scrollbar">
  <section class="theme-workspace" aria-labelledby="theme-heading">
    <header class="theme-intro">
      <p class="eyebrow">Appearance</p>
      <h3 id="theme-heading">{t("tab_settings_theme")}</h3>
      <p>Choose the moving backdrop for your composer.</p>
    </header>

    <div class="theme-composition">
      <section
        class="theme-stage"
        aria-label={`Previewing ${preview.label} theme`}
      >
        <ThemePreview type={previewType} fallback={preview.gradient} />
        <div class="stage-scrim"></div>
        <div class="stage-copy">
          <p class="stage-label">Live preview</p>
          <Crossfade key={previewType} duration={DURATION.normal}>
            <div class="stage-title-wrap">
              <h4>{preview.label}</h4>
              <p>{descriptions[previewType]}</p>
            </div>
          </Crossfade>
        </div>
      </section>

      <aside class="theme-rail" aria-label="Theme choices">
        <div class="rail-heading">
          <p class="eyebrow">Choose a theme</p>
          <span>{BACKGROUND_CARD_REGISTRY.length} available</span>
        </div>

        <div class="theme-choices" aria-label="Choose a theme">
          {#each BACKGROUND_CARD_REGISTRY as theme}
            <button
              type="button"
              class:previewing={previewType === theme.type}
              aria-pressed={previewType === theme.type}
              aria-label={`${theme.label}${currentType === theme.type ? ", current theme" : ""}`}
              onclick={() => previewTheme(theme.type as BackgroundType)}
            >
              <span
                class="choice-art"
                style:background={theme.gradient}
                aria-hidden="true"
              >
                <span class="choice-icon">{@html theme.iconSvg}</span>
              </span>
              <span class="choice-name" aria-hidden="true">{theme.label}</span>
              <span class="choice-marker" aria-hidden="true">
                {#if currentType === theme.type}<i class="fas fa-check"
                  ></i>{/if}
              </span>
            </button>
          {/each}
        </div>

        <button
          type="button"
          class="apply-theme"
          class:applied={previewIsCurrent}
          onclick={applyPreview}
          disabled={!canApplyPreview}
        >
          {canApplyPreview ? `Use ${preview.label}` : "Current theme"}
          {#if !canApplyPreview}<i class="fas fa-check" aria-hidden="true"
            ></i>{/if}
        </button>
      </aside>
    </div>
  </section>
</div>

<style>
  .background-tab {
    --settings-gap: clamp(12px, 2cqi, 20px);
    container-type: inline-size;
    min-height: 0;
    height: 100%;
    overflow: auto;
    padding: var(--settings-gap);
    padding-bottom: calc(var(--settings-gap) + 16px);
  }
  .theme-workspace {
    width: min(1180px, 100%);
    margin: 0 auto;
  }
  .theme-intro {
    margin-bottom: var(--settings-gap);
  }
  .eyebrow {
    margin: 0 0 4px;
    color: var(--theme-text-dim);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .theme-intro h3 {
    margin: 0;
    color: var(--theme-text);
    font-family: system-ui, sans-serif;
    font-size: clamp(22px, 4cqi, 32px);
    line-height: 1.1;
  }
  .theme-intro > p:last-child {
    margin: 6px 0 0;
    color: var(--theme-text-dim);
    font-size: 14px;
  }
  .theme-composition {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(340px, 1fr);
    gap: var(--settings-gap);
    align-items: stretch;
  }
  .theme-stage {
    position: relative;
    min-height: clamp(320px, 48cqw, 570px);
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: 18px;
    isolation: isolate;
    background: var(--theme-panel-bg);
  }
  .stage-scrim {
    position: absolute;
    z-index: 1;
    inset: 35% 0 0;
    background: linear-gradient(
      transparent,
      color-mix(in srgb, #000 80%, transparent)
    );
    pointer-events: none;
  }
  .stage-copy {
    position: absolute;
    z-index: 2;
    right: clamp(18px, 4cqi, 36px);
    bottom: clamp(18px, 4cqi, 36px);
    left: clamp(18px, 4cqi, 36px);
    color: white;
    pointer-events: none;
  }
  .stage-label {
    margin: 0 0 6px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.8;
  }
  .stage-title-wrap h4 {
    margin: 0;
    font-family: system-ui, sans-serif;
    font-size: clamp(42px, 8cqi, 82px);
    line-height: 0.9;
    letter-spacing: -0.05em;
  }
  .stage-title-wrap p {
    max-width: 38ch;
    min-height: 2.8em;
    margin: 10px 0 0;
    font-size: 14px;
    line-height: 1.4;
  }
  .theme-rail {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    padding: 14px;
    border: 1px solid var(--theme-stroke);
    border-radius: 16px;
    background: var(--theme-card-bg);
  }
  .rail-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .rail-heading .eyebrow {
    color: var(--theme-text);
  }
  .rail-heading span {
    color: var(--theme-text-dim);
    font-size: 12px;
  }
  .theme-choices {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .theme-choices button {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) 16px;
    align-items: center;
    min-height: 48px;
    gap: 8px;
    padding: 5px;
    overflow: hidden;
    color: var(--theme-text);
    text-align: left;
    background: transparent;
    border: 1px solid var(--theme-stroke);
    border-radius: 10px;
    cursor: pointer;
    transition:
      border-color var(--transition-fast),
      background var(--transition-fast);
  }
  .theme-choices button:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
  }
  .theme-choices button.previewing {
    border-color: var(--theme-accent);
    background: color-mix(
      in srgb,
      var(--theme-accent) 12%,
      var(--theme-card-bg)
    );
  }
  .theme-choices button:focus-visible,
  .apply-theme:focus-visible {
    outline: 3px solid var(--theme-accent);
    outline-offset: 2px;
  }
  .choice-art {
    display: grid;
    width: 30px;
    height: 36px;
    place-items: center;
    border-radius: 6px;
    color: white;
  }
  .choice-icon {
    width: 15px;
    height: 15px;
  }
  .choice-icon :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
  .choice-name {
    overflow: hidden;
    font-size: 14px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .choice-marker {
    display: grid;
    width: 16px;
    height: 16px;
    place-items: center;
    color: var(--theme-text);
    font-size: 10px;
  }
  .choice-marker:empty {
    border: 1px solid var(--theme-stroke-strong);
    border-radius: 50%;
  }
  .apply-theme {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    gap: 8px;
    margin-top: auto;
    padding: 8px 12px;
    color: var(--theme-button-text, #fff);
    font: inherit;
    font-weight: 700;
    background: var(--theme-accent);
    border: 1px solid var(--theme-accent);
    border-radius: 10px;
    cursor: pointer;
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast);
  }
  .apply-theme:hover:not(:disabled) {
    background: var(--theme-accent-strong);
  }
  .apply-theme:disabled {
    color: var(--theme-text);
    background: transparent;
    border-color: var(--theme-stroke-strong);
    cursor: default;
  }
  @container (max-width: 700px) {
    .theme-composition {
      grid-template-columns: 1fr;
    }
    .theme-stage {
      min-height: min(60vh, 440px);
    }
    .theme-rail {
      padding: 12px;
    }
  }
  @media (max-height: 650px) and (min-width: 701px) {
    .theme-stage {
      min-height: 310px;
    }
    .theme-rail {
      max-height: 420px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .theme-choices button,
    .apply-theme {
      transition: none;
    }
  }
</style>
