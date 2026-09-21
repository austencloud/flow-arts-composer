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

      <section class="theme-controls" aria-label="Theme choices">
        <div class="controls-heading">
          <div>
            <p class="eyebrow">Choose a theme</p>
            <span>{BACKGROUND_CARD_REGISTRY.length} available</span>
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
      </section>
    </div>
  </section>
</div>

<style>
  .background-tab {
    --settings-gap: clamp(8px, 1cqi, 12px);
    container-type: inline-size;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(min-content, 1fr);
    min-height: 0;
    height: 100%;
    overflow: auto;
    padding: var(--settings-gap);
  }
  .theme-workspace {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
  }
  .theme-intro {
    flex: none;
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
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .theme-stage {
    position: relative;
    flex: 1 0 280px;
    min-height: 280px;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: 18px 18px 0 0;
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
    font-size: clamp(36px, 5cqi, 64px);
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
  .theme-controls {
    flex: none;
    min-width: 0;
    padding: 14px;
    border: 1px solid var(--theme-stroke);
    border-top: 0;
    border-radius: 0 0 18px 18px;
    background: var(--theme-card-bg);
  }
  .controls-heading {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }
  .controls-heading .eyebrow {
    margin-bottom: 2px;
    color: var(--theme-text);
  }
  .controls-heading span {
    color: var(--theme-text-dim);
    font-size: 12px;
  }
  .theme-choices {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
  }
  .theme-choices button {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) 16px;
    align-items: center;
    min-height: 56px;
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
    width: 36px;
    height: 44px;
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
    flex: 0 0 auto;
    padding: 8px 14px;
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
  @container (max-width: 759px) {
    .theme-stage {
      flex-basis: clamp(220px, 38dvh, 380px);
      min-height: clamp(220px, 38dvh, 380px);
    }
    .theme-controls {
      padding: 12px;
    }
    .theme-choices {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .theme-choices button {
      grid-template-columns: 40px minmax(0, 1fr) 16px;
      min-height: 56px;
    }
    .choice-art {
      width: 40px;
      height: 44px;
    }
    .controls-heading {
      align-items: flex-start;
    }
    .apply-theme {
      min-height: 44px;
    }
  }
  @media (max-height: 650px) and (min-width: 760px) {
    .theme-stage {
      flex-basis: 220px;
      min-height: 220px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .theme-choices button,
    .apply-theme {
      transition: none;
    }
  }
</style>
