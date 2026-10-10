<script lang="ts">
  import { BackgroundType } from "@austencloud/backgrounds";
  import { getCardMetadata } from "@austencloud/backgrounds/card";
  import { onMount } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import { tryGetAccountSetupContext } from "#lib/shared/onboarding/context/account-setup-context.js";
  import { prefersReducedData } from "#lib/shared/platform/network-conditions.js";
  import type { AppSettings } from "#lib/shared/settings/domain/app-settings.js";
  import { applyThemeFromColors } from "#lib/shared/settings/utils/background-theme-calculator.js";
  import { showToast } from "#lib/shared/toast/state/toast-state.svelte.js";

  import ThemePreviewStage from "./ThemePreviewStage.svelte";
  import ThemeRail from "./ThemeRail.svelte";
  import { getShowroomTheme, SHOWROOM_THEMES } from "./theme-showroom-data";
  import { preloadThemeScene } from "./theme-scene-loader";

  interface Props {
    settings: AppSettings;
    onUpdate?: (event: { key: string; value: unknown }) => void;
    initialPreview?: BackgroundType;
  }

  let { settings, onUpdate, initialPreview }: Props = $props();

  const accountSetupState = tryGetAccountSetupContext();
  const selectedType = $derived(
    settings.backgroundType ?? BackgroundType.COSMIC
  );
  let previewedType = $state(initialPreview ?? selectedType);
  let lastSelectedType = selectedType;
  let mounted = $state(false);
  let reducedDataPreferred = $state(false);
  let webglAvailable = $state(true);
  let failedTheme = $state<BackgroundType | null>(null);
  let prefersReducedMotion = $state(false);
  let hapticService: HapticFeedback | null = null;

  const activeTheme = $derived(getShowroomTheme(previewedType));
  const selectedTheme = $derived(getShowroomTheme(selectedType));
  const themeChoiceRecorded = $derived(
    accountSetupState?.tasks.find((task) => task.id === "theme")?.complete ??
      true
  );
  const livePreview = $derived(
    mounted &&
      !reducedDataPreferred &&
      webglAvailable &&
      failedTheme !== previewedType
  );
  const fallbackReason = $derived<"connection" | "renderer" | null>(
    reducedDataPreferred
      ? "connection"
      : !webglAvailable || failedTheme === previewedType
        ? "renderer"
        : null
  );
  const allowAutomaticOrbit = $derived(livePreview && !prefersReducedMotion);

  function detectWebGL(): boolean {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    return context !== null;
  }

  onMount(() => {
    mounted = true;
    reducedDataPreferred = prefersReducedData();
    webglAvailable = detectWebGL();

    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );
    const updateMotionPreference = () => {
      prefersReducedMotion = motionPreference.matches;
    };
    updateMotionPreference();
    motionPreference.addEventListener("change", updateMotionPreference);

    try {
      hapticService = getHapticFeedback();
    } catch (error) {
      console.warn("ThemeShowroom: haptic feedback unavailable", error);
    }

    return () => {
      motionPreference.removeEventListener("change", updateMotionPreference);
    };
  });

  $effect(() => {
    const nextSelectedType = selectedType;
    if (nextSelectedType !== lastSelectedType) {
      lastSelectedType = nextSelectedType;
      previewedType = nextSelectedType;
    }
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
        label: t("common_retry"),
        onClick: () => void accountSetupState.retrySave(),
      },
    });
  }

  function previewTheme(backgroundType: BackgroundType): void {
    if (backgroundType === previewedType) return;
    hapticService?.trigger("selection");
    previewedType = backgroundType;
  }

  function prepareTheme(backgroundType: BackgroundType): void {
    if (!livePreview || backgroundType === previewedType) return;
    preloadThemeScene(backgroundType);
  }

  function selectPreviewedTheme(): void {
    hapticService?.trigger("selection");
    if (previewedType === selectedType) {
      void recordThemeChoice();
      return;
    }

    const metadata = getCardMetadata(previewedType);
    if (metadata?.themeColors) {
      applyThemeFromColors(undefined, metadata.themeColors);
    }

    onUpdate?.({ key: "backgroundType", value: previewedType });
    void recordThemeChoice();
  }

  function handleRenderError(error: unknown): void {
    failedTheme = previewedType;
    console.error(
      `ThemeShowroom: ${previewedType} live preview could not render`,
      error
    );
  }
</script>

<div
  class="showroom"
  style:--active-accent={activeTheme.card.accentColor}
  style:--active-gradient={activeTheme.card.gradient}
  data-theme={activeTheme.id}
>
  <div class="ambient ambient-one" aria-hidden="true"></div>
  <div class="ambient ambient-two" aria-hidden="true"></div>

  <header class="showroom-header">
    <div class="heading">
      <span class="section-label">{t("settings_showroom_section")}</span>
      <h1>{t("settings_showroom_heading")}</h1>
      <p>{t("settings_showroom_intro")}</p>
    </div>
  </header>

  <main class="showroom-layout">
    <ThemePreviewStage
      theme={activeTheme}
      selected={previewedType === selectedType}
      confirmed={previewedType === selectedType && themeChoiceRecorded}
      {livePreview}
      {allowAutomaticOrbit}
      {fallbackReason}
      onSelect={selectPreviewedTheme}
      onRenderError={handleRenderError}
    />

    <ThemeRail
      themes={SHOWROOM_THEMES}
      {previewedType}
      {selectedTheme}
      onPreview={previewTheme}
      onPrepare={prepareTheme}
    />
  </main>
</div>

<style>
  .showroom {
    --settings-page-pad: clamp(1rem, 1.45cqw, 3.5rem);
    --settings-panel-radius: clamp(1.25rem, 1.25cqw, 2.5rem);
    --settings-card-radius: clamp(0.8rem, 0.75cqw, 1.4rem);
    --theme-preview-surface: rgba(10, 10, 14, 0.82);

    position: relative;
    container-name: theme-showroom;
    container-type: size;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr);
    gap: clamp(0.9rem, 1.1cqh, 1.75rem);
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: var(--settings-page-pad);
    overflow: hidden;
    color: rgba(255, 255, 255, 0.96);
    background:
      radial-gradient(
        circle at 72% 8%,
        color-mix(in srgb, var(--active-accent) 16%, transparent),
        transparent 34%
      ),
      linear-gradient(145deg, #13131a 0%, #090a0e 54%, #06070a 100%);
    isolation: isolate;
    font-family:
      Inter,
      "SF Pro Display",
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
  }

  .ambient {
    position: absolute;
    z-index: -1;
    border-radius: 50%;
    filter: blur(100px);
    opacity: 0.16;
    pointer-events: none;
    transition: background 600ms ease;
  }

  .ambient-one {
    top: -25%;
    right: 8%;
    width: 42cqw;
    aspect-ratio: 1;
    background: var(--active-accent);
  }

  .ambient-two {
    bottom: -30%;
    left: -8%;
    width: 34cqw;
    aspect-ratio: 1;
    background: color-mix(in srgb, var(--active-accent) 45%, #5b21b6);
  }

  .showroom-header {
    display: flex;
    align-items: end;
    min-width: 0;
    min-height: 4.6rem;
  }

  .heading {
    min-width: 0;
  }

  .section-label {
    display: block;
    color: color-mix(in srgb, var(--active-accent) 72%, white);
    font-size: clamp(0.75rem, 0.54cqw, 0.9rem);
    font-weight: 750;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0.25rem 0 0;
    font-size: clamp(1.9rem, 2.25cqw, 4.6rem);
    font-weight: 680;
    letter-spacing: -0.045em;
    line-height: 0.98;
  }

  .heading p {
    margin: 0.45rem 0 0;
    color: rgba(255, 255, 255, 0.55);
    font-size: clamp(0.875rem, 0.68cqw, 1.2rem);
  }

  .showroom-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) clamp(23rem, 26cqw, 39rem);
    gap: clamp(0.9rem, 1.15cqw, 2.5rem);
    min-width: 0;
    min-height: 0;
  }

  @container theme-showroom (max-width: 74rem) {
    .showroom-layout {
      grid-template-columns: minmax(0, 1fr) clamp(20rem, 31cqw, 25rem);
    }
  }

  @container theme-showroom (max-width: 61rem) {
    .showroom {
      overflow-y: auto;
    }

    .showroom-layout {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(29rem, 55cqh) auto;
    }
  }

  @container theme-showroom (max-width: 40rem) {
    .showroom {
      gap: 0.75rem;
      padding: 0.75rem;
    }

    .showroom-header {
      align-items: center;
      min-height: auto;
    }

    .heading p,
    .section-label {
      display: none;
    }

    h1 {
      margin: 0;
      font-size: 1.25rem;
      letter-spacing: -0.03em;
    }

    .showroom-layout {
      grid-template-rows: minmax(24rem, 59cqh) auto;
    }
  }

  @container theme-showroom (max-height: 36rem) and (min-width: 41rem) {
    .showroom {
      gap: 0.55rem;
      padding: 0.65rem;
    }

    .showroom-header {
      align-items: center;
      min-height: 2.9rem;
    }

    .section-label,
    .heading p {
      display: none;
    }

    h1 {
      margin: 0;
      font-size: 1.5rem;
    }

    .showroom-layout {
      grid-template-columns: minmax(0, 1fr) 20rem;
      grid-template-rows: minmax(0, 1fr);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ambient {
      transition: none;
    }
  }
</style>
