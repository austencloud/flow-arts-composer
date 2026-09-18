<!--
GeneratePanel.svelte - Clean, focused generation panel component

Card-based architecture with integrated Generate button:
- Settings: CardBasedSettingsContainer.svelte (card grid with all controls)
- Generate button: GenerateButtonCard.svelte (integrated into card grid)
- Config state: generateConfigState.svelte.ts
- Generation actions: generateActionsState.svelte.ts
- Device state: generateDeviceState.svelte.ts
- Responsive padding: State-driven for sync with workspace animation
- Tour: Guided tour offered first-run via GenerateEmptyState; also via voice
-->
<script lang="ts">
  import { getDeviceDetector } from "$lib/shared/device/get-device-detector";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { SequenceState } from "$lib/features/create/shared/state/sequence-state-orchestrator.svelte";
  import { tryGetCreateModuleContext } from "$lib/features/create/shared/context/create-module-context";
  import type { DeviceDetector } from "$lib/shared/device/services/device-detector";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { onMount } from "svelte";
  import { createDeviceState } from "../state/generate-device.svelte";
  import {
    createGenerationActionsState,
    type GenerationAnimationTarget,
  } from "../state/generate-actions.svelte";
  import { createGenerationConfigState } from "../state/generate-config.svelte";
  import { createStartEndOptionsState } from "../state/start-end-options-state.svelte";
  import { createSpellModeState } from "../state/spell-mode-state.svelte";
  import CardBasedSettingsContainer from "./CardBasedSettingsContainer.svelte";
  import WordInputOverlay from "./cards/WordInputOverlay.svelte";
  import ExpandedCardStage from "./cards/ExpandedCardStage.svelte";
  import { morphGenerateCard } from "../shared/services/generate-card-morph";
  import { createFavoriteState } from "../state/favorite-state.svelte";
  import {
    captureSetupSnapshot,
    type SetupSnapshot,
  } from "../domain/setup-snapshot";
  import type { ActiveSetupSource } from "../domain/models/favorite-config";
  import type { GeneratorHelpId } from "$lib/shared/create/domain/generator-help-content";
  import { generateTourState } from "$lib/shared/onboarding/state/generate-tour-state.svelte";
  import GeneratePanelTour from "$lib/shared/onboarding/components/generate-tour/GeneratePanelTour.svelte";
  import {
    setGeneratorVoiceRef,
    type GeneratorVoiceRef,
  } from "$lib/shared/create/state/generator-voice-ref.svelte";
  import { uiConfigToGenerationOptions } from "../shared/utils/config-mapper";
  import type { GenerationOptions } from "../shared/domain/models/generate-models";
  import { LOOPType, Period } from "../circular/domain/models/circular-models";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { PropType as PropTypeEnum } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
  import {
    authState,
    getEffectiveUserId,
  } from "$lib/shared/auth/state/auth-state.svelte";
  import { authDrawerState } from "$lib/shared/auth/state/auth-drawer-state.svelte";
  import type { GuestLoopLockKind } from "$lib/shared/create/services/loop-guest-gate";
  import { userPreviewState } from "$lib/shared/debug/state/user-preview-state.svelte";
  import {
    resolveAccessTier,
    getMaxSteps,
  } from "$lib/shared/auth/domain/access-tier";
  import { isPremiumOrAbove } from "$lib/shared/auth/domain/models/user-role";
  // Get context for panel coordination (optional - may not be available in all contexts)
  const context = tryGetCreateModuleContext();
  const panelState = context?.panelState;

  // Props
  let {
    sequenceState,
    isDesktop = false,
    generateCurrent = $bindable(null),
    captureCurrentSetup = $bindable(null),
    applySetup = $bindable(null),
    generationAnimationTarget = null,
  }: {
    sequenceState: SequenceState;
    isDesktop?: boolean;
    /** Programmatic access to the exact recipe used by the Generate card. */
    generateCurrent?: (() => Promise<void>) | null;
    /** Read/apply hooks for embedded workbenches that persist performer-scoped
     * generator provenance without duplicating Generate's config state. */
    captureCurrentSetup?: (() => SetupSnapshot) | null;
    applySetup?: ((setup: SetupSnapshot) => void) | null;
    /** Optional embedded workbench that owns this generation's reveal. */
    generationAnimationTarget?: GenerationAnimationTarget | null;
  } = $props();

  // Animation is always sequential with gentle bloom
  const isSequentialAnimation = true;

  const configState = createGenerationConfigState();
  const spellModeState = createSpellModeState();
  const actionsState = createGenerationActionsState(
    () => sequenceState,
    () => isSequentialAnimation,
    () => configState.config,
    () => spellModeState,
    (type, metadata) =>
      context?.CreateModuleState.pushUndoSnapshot(type, metadata),
    // Generate-time guest LOOP lock (e.g. a locked loopType persisted from a
    // signed-in session) opens the same auth screen as the selector gate.
    openLoopGateAuth,
    () => generationAnimationTarget
  );
  const deviceState = createDeviceState();
  const startEndState = createStartEndOptionsState(
    undefined,
    configState.config.gridMode
  );

  // A LOOP owns its endpoint. Keep the Customize state honest across every
  // enable path, including the LOOP picker, saved setups, and restored sessions.
  $effect(() => {
    startEndState.reconcileLoopEnabled(configState.config.loopEnabled);
  });

  const favoriteState = createFavoriteState(() =>
    captureSetupSnapshot(configState.config, startEndState.options)
  );

  // Guest LOOP gating: guests only get rotated LOOPs + configs within their step
  // cap; tapping a gated LOOP opens a sign-up nudge (the conversion channel).
  const accessTier = $derived(
    resolveAccessTier(
      authState.isAuthenticated,
      authState.isAnonymous,
      isPremiumOrAbove(authState.role)
    )
  );
  const guestLoopMaxLength = $derived(
    accessTier === "guest" ? getMaxSteps("guest") : undefined
  );
  // Every guest gate goes straight to the auth screen — no intermediate
  // nudge; the modal's contextual copy carries the why (Austen, 2026-08-10).
  // Category locks ask for every LOOP type; length locks are step-cap asks.
  function openLoopGateAuth(kind: GuestLoopLockKind) {
    authDrawerState.show(
      "signup",
      kind === "length" ? "step-cap-guest" : "loop-locked-guest"
    );
  }

  // Spell mode: derived from word presence (if there's a word, it's spell mode)
  const hasWord = $derived(!!spellModeState.inputWord?.trim());
  const isMobile = $derived(deviceState.isMobile);
  const isSignedOut = $derived(getEffectiveUserId() === null);
  const isPreview = $derived(userPreviewState.isActive);
  const isAnonymousViewer = $derived(
    !authState.isAuthenticated || authState.isAnonymous
  );
  let favoriteIdentity = $state<string | null>(getEffectiveUserId());

  $effect(() => {
    const initialized = authState.initialized;
    const nextIdentity = getEffectiveUserId();
    if (!initialized || nextIdentity === favoriteIdentity) return;

    favoriteIdentity = nextIdentity;
    void favoriteState.loadPersonal();
    void favoriteState.loadCommunity();
  });

  function handleApplySource(source: ActiveSetupSource): void {
    const saved =
      source.kind === "setup"
        ? favoriteState.setups.find((setup) => setup.id === source.setupId)
        : favoriteState.communityFavorites.find(
            (favorite) => favorite.userId === source.userId
          );
    if (!saved) return;

    if (source.kind === "community" && isAnonymousViewer) {
      authDrawerState.show("signup", "community-setups");
      return;
    }
    if (accessTier === "guest" && saved.config.length > getMaxSteps("guest")) {
      authDrawerState.show("signup", "step-cap-guest");
      return;
    }

    const snapshot = captureSetupSnapshot(
      saved.config,
      saved.startEndOptions ?? null
    );
    applySetupSnapshot(snapshot);
    if (spellModeState.inputWord?.trim()) {
      spellModeState.setInputWord("");
    }
    favoriteState.setActiveSource(
      source,
      captureSetupSnapshot(configState.config, startEndState.options)
    );
    // Applying a setup shrinks the grown card the same way Escape does.
    if (panelState?.isPresetDrawerOpen) {
      morphGenerateCard("preset", () => panelState.closePresetDrawer());
    }
  }

  async function handleGenerate(options: GenerationOptions | null) {
    if (hasWord) {
      await actionsState.onSpellGenerate();
    } else if (options) {
      await actionsState.onGenerateClicked(options);
    }
  }

  async function generateCurrentRecipe(): Promise<void> {
    if (hasWord) {
      await handleGenerate(null);
      return;
    }
    await handleGenerate(
      uiConfigToGenerationOptions(
        configState.config,
        PropTypeEnum.FAN,
        startEndState.options
      )
    );
  }

  $effect(() => {
    generateCurrent = generateCurrentRecipe;
    return () => {
      generateCurrent = null;
    };
  });

  function captureCurrentSetupSnapshot(): SetupSnapshot {
    return captureSetupSnapshot(configState.config, startEndState.options);
  }

  function applySetupSnapshot(setup: SetupSnapshot): void {
    configState.replaceConfig(setup.config);
    startEndState.setGridMode(configState.config.gridMode);
    if (setup.startEndOptions) startEndState.setOptions(setup.startEndOptions);
    else startEndState.resetOptions(configState.config.gridMode);
  }

  $effect(() => {
    captureCurrentSetup = captureCurrentSetupSnapshot;
    applySetup = applySetupSnapshot;
    return () => {
      captureCurrentSetup = null;
      applySetup = null;
    };
  });

  const hasSettingsChanged = $derived.by(() => {
    const last = actionsState.lastGeneratedConfig;
    if (!last) return false;
    const cur = configState.config;
    return (
      cur.loopEnabled !== last.loopEnabled ||
      cur.length !== last.length ||
      cur.level !== last.level ||
      cur.turnIntensity !== last.turnIntensity ||
      cur.gridMode !== last.gridMode ||
      cur.propContinuity !== last.propContinuity ||
      cur.loopType !== last.loopType ||
      cur.period !== last.period ||
      cur.reflectionAxis !== last.reflectionAxis ||
      cur.inversionInterval !== last.inversionInterval ||
      cur.inversionMode !== last.inversionMode ||
      cur.constraintPreset !== last.constraintPreset ||
      cur.handPathMode !== last.handPathMode ||
      cur.motionTypeFilter !== last.motionTypeFilter ||
      cur.handRelationship !== last.handRelationship ||
      cur.handRelationshipInverted !== last.handRelationshipInverted ||
      cur.matchHandTurns !== last.matchHandTurns
    );
  });

  let hapticService = $state<HapticFeedback | null>(null);

  onMount(() => {
    try {
      const deviceService = getDeviceDetector();
      deviceState.initializeDevice(deviceService);
    } catch (error) {
      // Fallback handled in deviceState
    }
    try {
      hapticService = getHapticFeedback();
    } catch {
      // Optional service
    }

    // Register voice control ref so voice commands can access generator state
    const voiceRef: GeneratorVoiceRef = {
      getConfig: () => configState.config,
      updateConfig: (updates) => configState.updateConfig(updates),
      triggerGeneration: () => {
        if (hasWord) {
          actionsState.onSpellGenerate();
        } else {
          const propType =
            (settingsService.settings.leftPropType as PropType) ||
            PropTypeEnum.STAFF;
          const options = uiConfigToGenerationOptions(
            configState.config,
            propType
          );
          actionsState.onGenerateClicked(options);
        }
      },
      openHelpForControl: (_controlId: GeneratorHelpId) => {
        generateTourState.start();
      },
      getCurrentPropType: () =>
        settingsService.settings.leftPropType || "staff",
    };
    setGeneratorVoiceRef(voiceRef);

    return () => {
      setGeneratorVoiceRef(null);
    };
  });
</script>

<div
  class="generate-panel"
  data-layout={deviceState.layoutMode}
  data-allow-scroll={deviceState.shouldAllowScrolling}
  data-is-desktop={isDesktop}
  style="--min-touch-target: {deviceState.minTouchTarget}px; --element-spacing: {deviceState.elementSpacing}px;"
  role="region"
  aria-label="Generator settings panel"
>
  <div class="generate-panel-inner">
    <CardBasedSettingsContainer
      config={configState.config}
      isFreeformMode={!hasWord}
      updateConfig={configState.updateConfig}
      resetConfig={configState.resetConfig}
      isGenerating={actionsState.isGenerating}
      onGenerateClicked={handleGenerate}
      {startEndState}
      {hasSettingsChanged}
      wordInputValue={spellModeState.inputWord}
      onWordInput={(v) => spellModeState.setInputWord(v)}
      onWordSubmit={() => handleGenerate(null)}
      {isMobile}
      isDesktopLayout={isDesktop}
      onOpenWordInput={() => spellModeState.openWordInput()}
      {favoriteState}
    >
      {#snippet expandedCard()}
        {#if panelState}
          <ExpandedCardStage
            {panelState}
            isDesktopLayout={isDesktop}
            loop={{
              rhythm: {
                rotationInterval:
                  configState.config.period === Period.QUARTERED ? 4 : 2,
                inversionInterval: configState.config.inversionInterval ?? 2,
                inversionMode: configState.config.inversionMode ?? "expand",
                reflectionAxis:
                  configState.config.reflectionAxis ??
                  (configState.config.loopType === LOOPType.FLIPPED
                    ? "east-west"
                    : "north-south"),
              },
              sequenceLength: configState.config.length,
              guestMaxLength: guestLoopMaxLength,
              onLoopDisable: () => {
                morphGenerateCard("loop", () => panelState.closeLOOPPanel());
                configState.updateConfig({ loopEnabled: false });
              },
              onRequestSignup: (kind) => {
                morphGenerateCard("loop", () => panelState.closeLOOPPanel());
                openLoopGateAuth(kind);
              },
              onRhythmChange: (u) =>
                configState.updateConfig({
                  ...(u.rotationInterval
                    ? {
                        period:
                          u.rotationInterval === 4
                            ? Period.QUARTERED
                            : Period.HALVED,
                      }
                    : {}),
                  ...(u.inversionInterval
                    ? { inversionInterval: u.inversionInterval }
                    : {}),
                  ...(u.inversionMode
                    ? { inversionMode: u.inversionMode }
                    : {}),
                  ...(u.reflectionAxis
                    ? { reflectionAxis: u.reflectionAxis }
                    : {}),
                }),
            }}
            setups={{
              favoriteState,
              isSignedOut,
              isPreview,
              isAnonymous: isAnonymousViewer,
              onApply: handleApplySource,
              onRequestCommunityAccount: () =>
                authDrawerState.show("signup", "community-setups"),
              onRequestShareAccount: () =>
                authDrawerState.show("signup", "share-setup"),
              onRequestSignIn: () =>
                authDrawerState.show("signin", "saved-setups"),
            }}
          />
        {/if}
      {/snippet}
    </CardBasedSettingsContainer>
  </div>
</div>

<!-- Word input overlay - rendered outside the panel div so it can cover the full viewport on mobile -->
{#if spellModeState.isWordInputOpen}
  <WordInputOverlay
    wordValue={spellModeState.inputWord}
    onWordChange={(v) => spellModeState.setInputWord(v)}
    onClose={() => spellModeState.closeWordInput()}
  />
{/if}

<GeneratePanelTour level={configState.config.level} />

<style>
  .generate-panel {
    container-type: size;
    container-name: generate-panel;
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow: visible;
    gap: 0;
    --settings-panel-inline-inset: 0.25rem;
  }

  .generate-panel-inner {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: stretch; /* Default: fill space (stacked layouts) */
    min-height: 0;
    /* Mobile: Minimal vertical padding to maximize space for cards */
    padding-block: 0.25rem;
    /* Smooth transition for padding changes (syncs with 450ms workspace animation) */
    transition: padding 450ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* Desktop: center cards vertically since we constrain their height, remove vertical padding */
  @media (min-width: 1024px) {
    .generate-panel-inner {
      justify-content: center;
      padding-block: 0;
    }
  }

  /* Wide squarish displays (like Z-Fold unfolded): add horizontal padding
     to prevent the generate panel from looking too stretched */
  @container generate-panel (min-width: 700px) {
    .generate-panel-inner {
      --settings-panel-inline-inset: min(8cqi, 64px);
    }
  }

  /* Very wide landscape displays: more aggressive padding */
  @container generate-panel (min-aspect-ratio: 1.5) and (min-width: 800px) {
    .generate-panel-inner {
      --settings-panel-inline-inset: min(10cqi, 96px);
    }
  }

  /* Ensure no scrolling is forced when not appropriate */
  .generate-panel[data-allow-scroll="false"] {
    overflow: hidden;
  }
</style>
