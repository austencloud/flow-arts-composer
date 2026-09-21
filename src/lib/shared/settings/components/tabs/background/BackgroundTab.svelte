<!--
  BackgroundTab.svelte - Background selection using shared package cards

  Uses <background-card> web components from @austencloud/backgrounds/card.
  Preserves TKA's theme integration via applyThemeFromColors().
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { AppSettings } from "../../../domain/app-settings";
  import { BackgroundType } from "@austencloud/backgrounds";
  import {
    registerBackgroundCard,
    BACKGROUND_CARD_REGISTRY,
    getCardMetadata,
  } from "@austencloud/backgrounds/card";
  import type { BackgroundCardSelectDetail } from "@austencloud/backgrounds/card";
  import { applyThemeFromColors } from "../../../utils/background-theme-calculator";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { onMount } from "svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { tryGetAccountSetupContext } from "$lib/shared/onboarding/context/account-setup-context";
  import { showToast } from "$lib/shared/toast/state/toast-state.svelte";

  registerBackgroundCard();

  let { settings, onUpdate } = $props<{
    settings: AppSettings;
    onUpdate?: (event: { key: string; value: unknown }) => void;
  }>();

  let hapticService: HapticFeedback | null = null;
  let isVisible = $state(false);
  let gridEl: HTMLDivElement;
  const accountSetupState = tryGetAccountSetupContext();

  const currentBg = $derived(settings?.backgroundType || BackgroundType.COSMIC);

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

  onMount(() => {
    hapticService = getHapticFeedback();
    setTimeout(() => (isVisible = true), 30);

    function handleSelect(e: Event) {
      hapticService?.trigger("selection");
      const detail = (e as CustomEvent<BackgroundCardSelectDetail>).detail;
      const type = detail.type as BackgroundType;
      const meta = getCardMetadata(type);

      // Apply theme colors before updating background type (ensures crossfade has correct options)
      if (meta?.themeColors) {
        applyThemeFromColors(undefined, meta.themeColors);
      }

      onUpdate?.({ key: "backgroundType", value: type });
      void recordThemeChoice();
    }

    gridEl.addEventListener("background-select", handleSelect);
    return () => gridEl.removeEventListener("background-select", handleSelect);
  });
</script>

<div class="background-tab themed-scrollbar" class:visible={isVisible}>
  <section class="settings-panel">
    <header class="panel-header">
      <span class="panel-icon"
        ><i class="fas fa-palette" aria-hidden="true"></i></span
      >
      <div class="panel-header-text">
        <h3 class="panel-title">{t("settings_background_theme")}</h3>
        <p class="panel-subtitle">{t("settings_background_subtitle")}</p>
      </div>
    </header>

    <div
      class="bg-grid"
      role="radiogroup"
      aria-label="Choose theme"
      bind:this={gridEl}
    >
      {#each BACKGROUND_CARD_REGISTRY as bg}
        <background-card
          type={bg.type}
          selected={currentBg === bg.type ? "" : undefined}
        ></background-card>
      {/each}
    </div>
  </section>
</div>

<style>
  .background-tab {
    container-type: inline-size;
    container-name: background-tab;

    display: flex;
    flex-direction: column;
    width: 100%;
    flex: 1 1 auto;
    height: 100%;
    min-height: 0;
    max-width: 1200px;
    margin: 0 auto;
    padding: clamp(8px, 2cqi, 16px);
    gap: clamp(10px, 1.5cqi, 16px);

    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;

    opacity: 0;
    transition: opacity var(--duration-normal) ease;
  }

  .background-tab.visible {
    opacity: 1;
  }

  .settings-panel {
    display: flex;
    flex-direction: column;
    gap: clamp(12px, 2cqi, 20px);
    padding: clamp(12px, 2cqi, 20px);
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 16px;
    transition:
      background 0.2s ease,
      border-color 0.2s ease,
      transform 0.2s ease;
  }

  .settings-panel:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    transform: translateY(-1px);
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: clamp(10px, 2cqi, 14px);
    padding-bottom: clamp(10px, 2cqi, 14px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .panel-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: clamp(36px, 8cqi, 44px);
    height: clamp(36px, 8cqi, 44px);
    border-radius: 10px;
    font-size: clamp(14px, 3cqi, 18px);
    flex-shrink: 0;
    background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
    border: 1px solid color-mix(in srgb, var(--theme-accent) 35%, transparent);
    color: var(--theme-accent);
    box-shadow: 0 0 12px
      color-mix(in srgb, var(--theme-accent) 20%, transparent);
    transition: all var(--duration-fast) ease;
  }

  .settings-panel:hover .panel-icon {
    box-shadow: 0 0 16px
      color-mix(in srgb, var(--theme-accent) 30%, transparent);
  }

  .panel-header-text {
    flex: 1;
    min-width: 0;
  }

  .panel-title {
    font-size: clamp(15px, 3cqi, 17px);
    font-weight: 600;
    color: var(--theme-text);
    margin: 0;
    font-family:
      -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
  }

  .panel-subtitle {
    font-size: clamp(12px, 2.5cqi, 13px);
    color: var(--theme-text-dim, var(--theme-text-dim));
    margin: 2px 0 0 0;
  }

  .bg-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: clamp(8px, 1.5cqi, 12px);
    width: 100%;
  }

  @container background-tab (min-width: 400px) {
    .bg-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  @container background-tab (min-width: 600px) {
    .bg-grid {
      grid-template-columns: repeat(4, 1fr);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .background-tab,
    .settings-panel,
    .panel-icon {
      transition: none;
    }
  }

  @media (prefers-contrast: high) {
    .settings-panel {
      border-width: 2px;
    }
  }
</style>
