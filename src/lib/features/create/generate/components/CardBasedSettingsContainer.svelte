<!--
CardBasedSettingsContainer - Minimal card grid renderer
Delegates ALL logic to services (SRP compliant)
-->
<script lang="ts">
  import { buildCardDescriptors } from "$lib/features/create/generate/shared/services/card-configurator";
  import { getLOOPParameterProvider } from "$lib/features/create/generate/shared/get-loop-parameter-provider";
  import { onMount, getContext, type ComponentProps } from "svelte";
  import { flip } from "svelte/animate";
  import { motionDuration, popIn } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import type {
    PanelCoordinationState,
    StartEndOptions,
  } from "$lib/shared/create/state/panel-coordination-state.svelte";
  import { quintOut } from "svelte/easing";

  import type { CardDescriptor } from "$lib/shared/create/domain/generator-contract-types";
  import { getGeneratorPanelCards } from "$lib/shared/create/domain/card-registry";
  import type { LOOPParameterProvider } from "$lib/features/create/generate/shared/services/loop-parameter-provider";
  import { calculateResponsiveFontSize } from "../shared/services/responsive-typographer";
  import {
    GENERATE_DEFAULT_CONFIG,
    type UIGenerationConfig,
  } from "../state/generate-config.svelte";
  import type { StartEndOptionsState } from "../state/start-end-options-state.svelte";
  import type {
    DifficultyLevel,
    GenerationOptions,
    PropContinuity,
  } from "../shared/domain/models/generate-models";
  import {
    ROTATED_LOOP_TYPES,
    LOOPType,
    Period,
  } from "../circular/domain/models/circular-models";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { BackgroundType } from "@austencloud/backgrounds";
  import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
  import { getCardColors } from "../shared/domain/card-colors";
  import * as spellServiceLoader from "$lib/features/create/spell/services/spell-service-loader";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import {
    resolveAccessTier,
    getMaxSteps,
  } from "$lib/shared/auth/domain/access-tier";
  import { isPremiumOrAbove } from "$lib/shared/auth/domain/models/user-role";
  import { authDrawerState } from "$lib/shared/auth/state/auth-drawer-state.svelte";
  import LevelSelector from "$lib/shared/components/LevelSelector.svelte";
  import type { LevelNumber } from "$lib/shared/domain/curriculum/level-metadata";
  import { MAX_AVAILABLE_LEVEL } from "$lib/shared/create/utils/config-mapper";
  import { DifficultyLevel as SharedDifficultyLevel } from "$lib/shared/foundation/domain/models/generation/generate-models";
  import { showToast } from "$lib/shared/toast/state/toast-state.svelte";
  import { fitLoopRhythmToLength } from "$lib/shared/create/services/loop-rhythm-gating";
  import { parseLoopComponents } from "$lib/shared/create/services/loop-type-utils";
  // Card components
  import LevelCard from "./cards/LevelCard.svelte";
  import GridModeCard from "./cards/GridModeCard.svelte";
  import LengthCard from "./cards/LengthCard.svelte";
  import TurnIntensityCard from "./cards/TurnIntensityCard.svelte";
  import GenerateButtonCard from "./cards/GenerateButtonCard.svelte";
  import ConsolidatedLOOPCard from "./cards/ConsolidatedLOOPCard.svelte";
  import CustomizeCard from "./cards/CustomizeCard.svelte";
  import WordInputCard from "./cards/WordInputCard.svelte";
  import PresetCard from "./cards/PresetCard.svelte";
  import type { FavoriteState } from "../state/favorite-state.svelte";
  import type { HandRelationship } from "$lib/shared/create/domain/hand-relationship";
  import type {
    CommunityFavorite,
    SavedGeneratorSetup,
  } from "../domain/models/favorite-config";

  const levelCardEntry = getGeneratorPanelCards().find(
    (entry) => entry.slot === "level"
  );

  // Props
  let {
    config,
    isFreeformMode,
    updateConfig,
    resetConfig,
    isGenerating,
    onGenerateClicked,
    startEndState,
    hasSettingsChanged = false,
    wordInputValue = "",
    onWordInput,
    onWordSubmit,
    isMobile = false,
    isDesktopLayout = false,
    onOpenWordInput,
    favoriteState,
  } = $props<{
    config: UIGenerationConfig;
    isFreeformMode: boolean;
    updateConfig: (updates: Partial<UIGenerationConfig>) => void;
    resetConfig: () => void;
    isGenerating: boolean;
    onGenerateClicked: (options: GenerationOptions) => Promise<void>;
    startEndState?: StartEndOptionsState;
    hasSettingsChanged?: boolean;
    wordInputValue?: string;
    onWordInput?: (value: string) => void;
    onWordSubmit?: () => void;
    isMobile?: boolean;
    isDesktopLayout?: boolean;
    onOpenWordInput?: () => void;
    favoriteState: FavoriteState;
  }>();

  // Get panel coordination state from context (for LOOP expanded overlay)
  const panelState = getContext<PanelCoordinationState>("panelState");

  // Services - use $state to make them reactive
  let loopParamProvider = $state<LOOPParameterProvider | null>(null);

  // State
  let headerFontSize = $state("9px");
  let positionsResetTrigger = $state(0); // Increment to trigger reset animation

  // Derived values - now safe because services are reactive $state
  let currentLevel = $derived(
    loopParamProvider?.numberToDifficulty(config.level) ?? null
  );
  // Level 4 (SKEWED) pictograph data does not exist yet, so a config.level
  // that predates the gate (old localStorage/Firestore state, a stale prop)
  // must never surface past MAX_AVAILABLE_LEVEL here.
  let selectedLevel = $derived(
    Math.min(
      MAX_AVAILABLE_LEVEL,
      Math.max(1, Number(config.level) || 1)
    ) as LevelNumber
  );
  let levelCardLevel = $derived(
    selectedLevel === 1
      ? SharedDifficultyLevel.BEGINNER
      : selectedLevel === 2
        ? SharedDifficultyLevel.INTERMEDIATE
        : SharedDifficultyLevel.ADVANCED
  );
  let allowedIntensityValues = $derived(
    currentLevel && loopParamProvider
      ? loopParamProvider.getAllowedTurnsForLevel(currentLevel)
      : []
  );

  // Config and start/end options can also arrive from saved setups or session
  // persistence. Keep the Level vocabulary invariant true on those paths too.
  $effect(() => {
    const level = config.level;
    const leftStartOrientation = startEndState?.options.leftStartOrientation;
    const rightStartOrientation = startEndState?.options.rightStartOrientation;
    void leftStartOrientation;
    void rightStartOrientation;
    startEndState?.normalizeOrientationsForLevel(level);
  });

  const accessTier = $derived(
    resolveAccessTier(
      authState.isAuthenticated,
      authState.isAnonymous,
      isPremiumOrAbove(authState.role)
    )
  );
  // Only guests get a step-cap ask — straight to the auth screen, whose
  // contextual copy carries the why; no intermediate nudge (Austen,
  // 2026-08-10). Logged-in users are hard-capped at 64 with no upsell, so the
  // cap applies silently. (The paid Scribe tier is shelved until there's a plan.)
  function onStepCapExceeded() {
    if (accessTier === "guest") {
      authDrawerState.show("signup", "step-cap-guest");
    }
  }

  // Get card colors based on current background (reactive to background changes)
  let cardColors = $derived(
    getCardColors(
      settingsService.settings.backgroundType ?? BackgroundType.WINTER
    )
  );

  // Pre-compute word length including bridges and LOOP multiplication
  let computedWordLength = $state<number | undefined>(undefined);
  let requiredBridgeCount = $state<number>(0);
  let naturalLength = $state<number>(0);
  // The LOOP-multiplied natural length (without extra bridges) - used as the floor for the stepper
  let naturalDisplayLength = $state<number>(0);

  $effect(() => {
    const word = wordInputValue?.trim();
    if (!word) {
      computedWordLength = undefined;
      requiredBridgeCount = 0;
      naturalLength = 0;
      naturalDisplayLength = 0;
      if (config.spellTargetLength !== null) {
        updateConfig({ spellTargetLength: null });
      }
      return;
    }
    computeWordLength(word, config.loopEnabled, config.loopType, config.period);
  });

  // Reset spell target when the word itself changes
  let previousWord = $state<string>("");
  $effect(() => {
    const word = wordInputValue?.trim() ?? "";
    if (word !== previousWord && previousWord !== "") {
      if (config.spellTargetLength !== null) {
        updateConfig({ spellTargetLength: null });
      }
    }
    previousWord = word;
  });

  async function computeWordLength(
    word: string,
    loopEnabled: boolean,
    loopType: string,
    period: string
  ) {
    try {
      const graph = await spellServiceLoader.getTransitionGraph();
      const generator = await spellServiceLoader.getWordGenerator();

      const parseResult = generator.parseWord(word);
      if (!parseResult || parseResult.error || !parseResult.letters?.length) {
        computedWordLength = undefined;
        requiredBridgeCount = 0;
        naturalLength = 0;
        naturalDisplayLength = 0;
        return;
      }

      const originalLetters = parseResult.letters;

      // Count bridges needed between consecutive letters
      let bridgeCount = 0;
      for (let i = 1; i < originalLetters.length; i++) {
        const prev = originalLetters[i - 1]!;
        const curr = originalLetters[i]!;
        if (!graph.canFollow(prev, curr)) {
          const bridges = graph.findAllBridgeOptions(prev, curr);
          if (bridges.length > 0) {
            bridgeCount++;
          }
        }
      }

      requiredBridgeCount = bridgeCount;
      naturalLength = originalLetters.length + bridgeCount;

      // Helper to apply LOOP multiplication to a pre-LOOP step count.
      // Does NOT add +1 for a LOOP bridge step - a bridge is only inserted
      // when the sequence can't directly connect back to start, and we
      // can't know that until actual generation runs. The displayed count
      // should match the most common case (direct extension, no bridge).
      function applyLoopMultiplier(steps: number): number {
        if (!loopEnabled) return steps;
        const multiplier = ROTATED_LOOP_TYPES.has(loopType as LOOPType)
          ? period === Period.QUARTERED
            ? 4
            : 2
          : 2;
        return steps * multiplier;
      }

      // Natural display length = LOOP-multiplied natural (the floor for the stepper)
      naturalDisplayLength = applyLoopMultiplier(naturalLength);

      // Total display length includes extra bridges from spell target
      const extraBridges = config.spellTargetLength
        ? Math.max(0, config.spellTargetLength - naturalLength)
        : 0;
      computedWordLength = applyLoopMultiplier(naturalLength + extraBridges);
    } catch {
      computedWordLength = undefined;
      requiredBridgeCount = 0;
      naturalLength = 0;
      naturalDisplayLength = 0;
    }
  }

  function handleSpellLengthChange(newLength: number) {
    let preLoopTarget: number;

    if (config.loopEnabled) {
      const isRotatedType = ROTATED_LOOP_TYPES.has(config.loopType as LOOPType);
      let multiplier: number;
      if (isRotatedType) {
        multiplier = config.period === Period.QUARTERED ? 4 : 2;
      } else {
        multiplier = 2;
      }
      preLoopTarget = Math.round(newLength / multiplier) - 1;
    } else {
      preLoopTarget = newLength;
    }

    if (preLoopTarget <= naturalLength) {
      updateConfig({ spellTargetLength: null });
    } else {
      updateConfig({ spellTargetLength: preLoopTarget });
    }
  }

  // Initialize services
  onMount(() => {
    loopParamProvider = getLOOPParameterProvider();

    updateFontSize();
    window.addEventListener("resize", updateFontSize);

    return () => window.removeEventListener("resize", updateFontSize);
  });

  function updateFontSize() {
    // Desktop gets larger header text (11-18px) for better readability
    // Mobile/tablet stays at (9-14px)
    const isDesktop = window.innerWidth >= 1280;
    headerFontSize = isDesktop
      ? calculateResponsiveFontSize(11, 18, 1.2)
      : calculateResponsiveFontSize(9, 14, 1.2);
  }

  function cloneStartEndOptions(options: StartEndOptions): StartEndOptions {
    return {
      ...options,
      blockedStartPositions: [...options.blockedStartPositions],
      mustContainLetters: [...options.mustContainLetters],
      mustNotContainLetters: [...options.mustNotContainLetters],
    };
  }

  function handleLevelSelect(level: LevelNumber) {
    if (!loopParamProvider) return;
    handleLevelChange(loopParamProvider.numberToDifficulty(level));
  }

  function handleLevelCardChange(level: SharedDifficultyLevel) {
    const levelNumber =
      level === SharedDifficultyLevel.BEGINNER
        ? 1
        : level === SharedDifficultyLevel.INTERMEDIATE
          ? 2
          : 3;
    handleLevelSelect(levelNumber);
  }

  // Event handlers - safe because we check loopParamProvider exists
  function handleLevelChange(level: DifficultyLevel) {
    if (!loopParamProvider) return;
    const newLevelNum = loopParamProvider.difficultyToNumber(level);
    const allowed = loopParamProvider.getAllowedTurnsForLevel(level);
    const updates: Partial<UIGenerationConfig> = { level: newLevelNum };
    const previousLevel = config.level;
    const previousTurnIntensity = config.turnIntensity;
    const previousPeriod = config.period;
    const previousStartEndOptions = startEndState
      ? cloneStartEndOptions(startEndState.options)
      : null;

    // Clamp turn intensity if the current value isn't valid at the new level
    // (e.g. 0.5 is valid at level 3 but not level 2)
    if (allowed.length > 0 && !allowed.includes(config.turnIntensity)) {
      updates.turnIntensity = allowed.reduce((best, v) =>
        Math.abs(v - config.turnIntensity) <
        Math.abs(best - config.turnIntensity)
          ? v
          : best
      );
    }

    // Old presets may still carry a quartered value on a LOOP without
    // rotation. Keep the config honest even though the engine also normalizes
    // that legacy combination before generation.
    const currentType = config.loopType as LOOPType;
    const isRotated = ROTATED_LOOP_TYPES.has(currentType);
    if (!isRotated && config.period === Period.QUARTERED) {
      updates.period = Period.HALVED;
    }

    const orientationsChanged =
      startEndState?.normalizeOrientationsForLevel(newLevelNum) ?? false;
    updateConfig(updates);

    if (orientationsChanged && previousStartEndOptions) {
      showToast({
        message: `Clock/Counter changed to In for Level ${newLevelNum}.`,
        type: "info",
        duration: 6000,
        action: {
          label: "Undo",
          onClick: () => {
            updateConfig({
              level: previousLevel,
              turnIntensity: previousTurnIntensity,
              period: previousPeriod,
            });
            startEndState?.setOptions(previousStartEndOptions);
          },
        },
      });
    }
  }

  function handleLengthChange(length: number) {
    if (config.loopEnabled) {
      const fitted = fitLoopRhythmToLength(
        parseLoopComponents(config.loopType),
        {
          rotationInterval: config.period === Period.QUARTERED ? 4 : 2,
          inversionInterval: config.inversionInterval ?? 2,
          inversionMode: config.inversionMode ?? "expand",
          reflectionAxis: config.reflectionAxis,
        },
        length
      );

      if (fitted?.changed) {
        showToast({
          message: `LOOP rhythm changed to fit ${length} steps.`,
          type: "info",
          duration: 4000,
        });
      } else if (!fitted) {
        showToast({
          message: `LOOP turned off so this can be exactly ${length} steps.`,
          type: "info",
          duration: 5000,
        });
      }
    }
    updateConfig({ length });
  }

  function handleTurnIntensityChange(turnIntensity: number) {
    updateConfig({ turnIntensity });
  }

  function handlePropContinuityChange(propContinuity: PropContinuity) {
    updateConfig({ propContinuity });
  }

  function handleGridModeChange(gridMode: GridMode) {
    updateConfig({ gridMode });

    // Check if we have positions to clear
    const hasPositions =
      startEndState?.options?.startPosition !== null ||
      startEndState?.options?.endPosition !== null;

    if (hasPositions) {
      // Trigger animation FIRST
      positionsResetTrigger++;

      // Clear positions at animation midpoint (150ms into 300ms animation)
      // This makes the text change happen while it's invisible
      setTimeout(() => {
        startEndState?.setGridMode(gridMode);
      }, 150);
    } else {
      startEndState?.setGridMode(gridMode);
    }
  }

  function handleLOOPTypeChange(loopType: LOOPType) {
    // Applying a loop type enables the loop. The card no longer pre-enables on
    // tap, so this is the enable seam: pick a loop → on; back out → stays off.
    const updates: Partial<UIGenerationConfig> = {
      loopType,
      loopEnabled: true,
    };

    // Rotation is the only transformation with a 90° option. Switching to a
    // LOOP without rotation must clear any quartered value left by the prior
    // selection.
    if (
      !ROTATED_LOOP_TYPES.has(loopType) &&
      config.period === Period.QUARTERED
    ) {
      updates.period = Period.HALVED;
    }

    updateConfig(updates);
  }

  // Style handlers
  function handleConstraintPresetChange(v: "smooth" | "mixed" | "choppy") {
    updateConfig({ constraintPreset: v });
  }

  function handleHandPathModeChange(v: "smooth" | "mixed" | "choppy") {
    updateConfig({ handPathMode: v });
  }

  function handleMotionTypeFilterChange(
    v: "no-dash" | "mixed" | "prefer-dash"
  ) {
    updateConfig({ motionTypeFilter: v === "mixed" ? null : v });
  }

  function handleHandRelationshipChange(v: HandRelationship) {
    updateConfig({ handRelationship: v });
  }

  function handleHandRelationshipInvertedChange(v: boolean) {
    updateConfig({ handRelationshipInverted: v });
  }

  function handleMatchHandTurnsChange(v: boolean) {
    updateConfig({ matchHandTurns: v });
  }

  // LOOP toggle handler
  function handleLoopToggle() {
    updateConfig({ loopEnabled: !config.loopEnabled });
  }

  // Duration handler (inline in customize overlay)
  function handleDurationTemplateSelect(id: string | null) {
    updateConfig({ durationTemplateId: id });
  }

  // Start/End options handler
  function handleStartEndChange(options: StartEndOptions) {
    startEndState?.setOptions(options);
  }

  // "Reset all" from the Customize panel. Generation settings persist across
  // sessions, so a saved combination can quietly narrow what comes out (Choppy
  // props is the one that bit a user); this is the escape hatch. Both stores
  // are cleared — the config knobs and the start/end constraints — because a
  // partial reset would still leave the generator constrained.
  //
  // No undo here, deliberately: the Customize overlay's props are a snapshot
  // frozen when it opens, so a restore can reach the config but not the
  // overlay's own mirrors — the panel would sit there reading "Default" over
  // restored values. The overlay confirms before calling this instead.
  function handleResetAll() {
    resetConfig();
    startEndState?.resetOptions(GENERATE_DEFAULT_CONFIG.gridMode);
    positionsResetTrigger++;
  }

  // Preset: open drawer via panel state (drawer rendered in GeneratePanel)
  function handleOpenPresetDrawer() {
    panelState.openPresetDrawer();
  }

  // Build cards using service - reactive to all dependencies
  // Read LOOP-related properties explicitly so Svelte tracks them as
  // direct dependencies of this derived. Without this, toggling loopEnabled
  // or loopType via a preset (parent-driven config update) may not cause
  // the card list to recalculate because Svelte doesn't always track deep
  // property reads that happen inside a called method like buildCardDescriptors.
  let cards = $derived.by((): CardDescriptor[] => {
    if (!currentLevel) return [];

    // Explicit reads so Svelte registers these as reactive dependencies.
    // The LOOP card summary depends on both values.
    const loopEnabled = config.loopEnabled;
    const _loopType = config.loopType;
    const _reflectionAxis = config.reflectionAxis;
    const _period = config.period;
    const _inversionInterval = config.inversionInterval;
    const _inversionMode = config.inversionMode;
    void _loopType;
    void _reflectionAxis;
    void _period;
    void _inversionInterval;
    void _inversionMode;

    return buildCardDescriptors(
      config,
      currentLevel,
      isFreeformMode,
      {
        handleLevelChange,
        handleLengthChange,
        handleTurnIntensityChange,
        handlePropContinuityChange,
        handleGridModeChange,
        handleGenerationModeChange: () => {}, // No-op: mode is now derived from word presence
        handleLOOPTypeChange,
        handleConstraintPresetChange,
        handleHandPathModeChange,
        handleMotionTypeFilterChange,
        handleHandRelationshipChange,
        handleHandRelationshipInvertedChange,
        handleMatchHandTurnsChange,
        handleDurationTemplateSelect,
        handleLoopToggle,
        wordInputValue,
        computedWordLength,
        handleSpellLengthChange,
        bridgeInfo: wordInputValue?.trim()
          ? {
              requiredBridges: requiredBridgeCount,
              extraBridges: Math.max(
                0,
                (config.spellTargetLength ?? 0) - naturalLength
              ),
              totalBridges:
                requiredBridgeCount +
                Math.max(0, (config.spellTargetLength ?? 0) - naturalLength),
              naturalLength,
              naturalDisplayLength,
            }
          : undefined,
        handleWordInput: onWordInput,
        handleWordSubmit: onWordSubmit,
        handleStartEndChange: startEndState ? handleStartEndChange : undefined,
        handleResetAll,
        startEndOptions: startEndState?.options,
        positionsResetTrigger,
        currentGridMode: config.gridMode,
        handleGenerateClick: onGenerateClicked,
        setupsCardValue: (() => {
          const source = favoriteState.activeSource;
          if (source?.kind === "setup") {
            return (
              favoriteState.setups.find(
                (setup: SavedGeneratorSetup) => setup.id === source.setupId
              )?.name ?? `${favoriteState.setups.length} saved`
            );
          }
          if (source?.kind === "community") {
            return (
              favoriteState.communityFavorites.find(
                (favorite: CommunityFavorite) =>
                  favorite.userId === source.userId
              )?.displayName ?? "Browse"
            );
          }
          return favoriteState.setups.length > 0
            ? `${favoriteState.setups.length} saved`
            : "Browse";
        })(),
        setupsCardStatus: favoriteState.activeStatus,
        handleOpenPresetDrawer,
      },
      allowedIntensityValues,
      isGenerating,
      hasSettingsChanged,
      loopEnabled
    );
  });
</script>

<div
  class="card-settings-container"
  data-desktop-layout={isDesktopLayout}
  style="--header-font-size: {headerFontSize}"
>
  <div class="level-toolbar">
    <div class="level-selector-slot">
      <LevelSelector
        value={selectedLevel}
        onchange={handleLevelSelect}
        ariaLabel="Generation difficulty level"
      />
    </div>
  </div>

  <div class="card-grid-stage">
    <div class="card-grid" data-level={selectedLevel}>
      {#if levelCardEntry}
        <div class="compact-level-card" data-card-id={levelCardEntry.id}>
          <LevelCard
            currentLevel={levelCardLevel}
            onLevelChange={handleLevelCardChange}
            gridColumnSpan={levelCardEntry.tourSpan}
            {headerFontSize}
          />
        </div>
      {/if}

      <!-- Three things move whenever the level changes, and each one owns a
           piece of the animation:

           flip  — the cards that stay. Level 1 lays them out in three tall
                   rows; levels 2 and 3 in four shorter ones, and the Grid and
                   Customize cards change how many columns they span. flip
                   measures both layouts and eases every survivor between them.
           out   — the card that leaves (Turn Intensity, on the way down to
                   level 1). Svelte pins it in place while it shrinks away, so
                   the grid can already be reflowing underneath it. Quick: it
                   is the thing holding up the reflow.
           in    — the card that arrives. Held back until the reflow is past
                   halfway, so it fades up into a space that has already opened
                   and lands just after the cards around it stop moving.

           Without in/out, flip has nothing to animate for a card that did not
           exist a frame ago, and Turn Intensity simply blinks in and out. -->
      {#each cards as card (card.id)}
        <div
          class="card-wrapper"
          data-card-id={card.id}
          style:grid-column="span {card.gridColumnSpan}"
          animate:flip={{
            duration: motionDuration(DURATION.emphasis),
            easing: quintOut,
          }}
          in:popIn={{
            duration: DURATION.normal,
            delay: motionDuration(DURATION.fast),
            start: 0.92,
          }}
          out:popIn={{ duration: DURATION.fast, start: 0.92 }}
        >
          {#if card.id === "length"}
            <LengthCard
              {...card.props as ComponentProps<typeof LengthCard>}
              color={cardColors.length.color}
              shadowColor={cardColors.length.shadowColor}
              {onStepCapExceeded}
            />
          {:else if card.id === "word-input"}
            <WordInputCard
              {...card.props as ComponentProps<typeof WordInputCard>}
              color={cardColors.mode.color}
              shadowColor={cardColors.mode.shadowColor}
              {isMobile}
              onOpenOverlay={onOpenWordInput}
            />
          {:else if card.id === "grid-mode"}
            <GridModeCard
              {...card.props as ComponentProps<typeof GridModeCard>}
              color={cardColors.gridMode.color}
              shadowColor={cardColors.gridMode.shadowColor}
            />
          {:else if card.id === "turn-intensity"}
            <!-- TurnIntensityCard declares shadowColor but no color prop. -->
            <TurnIntensityCard
              {...card.props as ComponentProps<typeof TurnIntensityCard>}
              shadowColor={cardColors.turnIntensity.shadowColor}
            />
          {:else if card.id === "customize"}
            <CustomizeCard
              {...card.props as ComponentProps<typeof CustomizeCard>}
              color={cardColors.customize.color}
              shadowColor={cardColors.customize.shadowColor}
            />
          {:else if card.id === "loop"}
            <ConsolidatedLOOPCard
              {...card.props as ComponentProps<typeof ConsolidatedLOOPCard>}
            />
          {:else if card.id === "preset"}
            <PresetCard
              {...card.props as ComponentProps<typeof PresetCard>}
              color={cardColors.favorite.color}
              shadowColor={cardColors.favorite.shadowColor}
            />
          {:else if card.id === "generate-button"}
            <GenerateButtonCard
              {...card.props as ComponentProps<typeof GenerateButtonCard>}
            />
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .card-settings-container {
    /* Position relative for LOOP expanded overlay */
    position: relative;
    container-type: size; /* Enable both inline and block size container queries */
    container-name: settings-grid; /* Name the container for explicit targeting */
    display: flex;
    flex-direction: column;

    /* The selector owns the same pinned header zone as Construct. The recipe
       below gets its own centered stage, so changing tabs never moves Level. */
    flex: 1 1 auto;
    width: 100%;
    max-width: 100%;
    margin: 0 auto; /* Center horizontally */
    align-self: stretch; /* Default: fill vertical space (mobile stacked) */

    /* Responsive gap - scales with respects device setting as max */
    --settings-gap: clamp(4px, 1.5cqi, var(--element-spacing, 10px));
    gap: var(--settings-gap);

    /* 🎯 SHARED CARD TEXT STYLING - Consistent across all cards */
    --card-text-size: clamp(16px, 2.2vmin, 30px);
    --card-text-weight: 700;
    --card-text-spacing: 0.3px;
    --card-text-shadow:
      0 2px 6px var(--theme-shadow), 0 0 20px var(--theme-stroke-strong);

    min-height: 0; /* Allow flex to shrink */
    overflow: visible; /* Allow cards to pop over neighbors and modals to escape */

    /* Smooth transition for size changes (syncs with workspace 450ms animation) */
    transition:
      max-width 450ms cubic-bezier(0.4, 0, 0.2, 1),
      max-height 450ms cubic-bezier(0.4, 0, 0.2, 1),
      padding 450ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .level-toolbar {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 100%;
    /* Pinned to the shared contract on .tool-panel-container so the Generate
       empty state knows exactly how much of the panel top is spoken for. */
    min-height: var(--generate-level-toolbar-height, 4.75rem);
    padding: 12px 16px 14px;
    background: linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.045) 0%,
      rgba(255, 255, 255, 0) 100%
    );
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .level-selector-slot {
    width: auto;
    max-width: 100%;
    min-width: 0;
  }

  .compact-level-card {
    display: none;
  }

  .card-grid-stage {
    flex: 1 1 auto;
    display: flex;
    align-items: stretch;
    justify-content: center;
    width: 100%;
    min-height: 0;
    padding-inline: var(--settings-panel-inline-inset, 0.25rem);
  }

  /* This is the same full LevelSelector used by Construct whenever its names
     fit. A wide screen can still leave Generate in a narrow split pane, so the
     picker responds to this panel rather than the viewport. */
  @container settings-grid (width < 630px) {
    .level-toolbar {
      display: none;
    }

    .compact-level-card {
      container: generate-card / size;
      display: flex;
      grid-column: 1 / -1;
      min-width: 0;
      min-height: 0;
    }

    .compact-level-card > :global(*) {
      flex: 1;
      min-width: 0;
      min-height: 0;
    }

    /* The shared landscape stepper normally has a taller card. Tighten only
       its line boxes here so Level, the numeral, and the level name each own a
       distinct band inside this intentionally shallow row. */
    .compact-level-card :global(.card-header) {
      padding-block: 1px;
    }

    .compact-level-card :global(.landscape-value),
    .compact-level-card :global(.card-description) {
      line-height: 1;
    }

    .card-grid {
      --compact-level-row: clamp(56px, 10cqh, 64px);
    }

    .card-settings-container:not([data-desktop-layout="true"])
      .card-grid[data-level="1"] {
      grid-template-rows:
        var(--compact-level-row)
        minmax(var(--min-touch-target), 0.9fr)
        minmax(var(--min-touch-target), 0.9fr)
        minmax(64px, 1.2fr);
      grid-auto-rows: unset;
    }

    .card-settings-container:not([data-desktop-layout="true"])
      .card-grid[data-level="2"],
    .card-settings-container:not([data-desktop-layout="true"])
      .card-grid[data-level="3"] {
      grid-template-rows:
        var(--compact-level-row)
        minmax(var(--min-touch-target), 0.8fr)
        minmax(var(--min-touch-target), 0.95fr)
        minmax(var(--min-touch-target), 0.8fr)
        minmax(64px, 1.15fr);
      grid-auto-rows: unset;
    }

    /* A side-by-side workspace is desktop even when its settings column is
       narrow. Keep Construct's three explicit choices here, but stack each
       badge over its name so the longest label gets honest room. */
    .card-settings-container[data-desktop-layout="true"] .level-toolbar {
      display: flex;
      flex-basis: 64px;
      min-height: 64px;
    }

    .card-settings-container[data-desktop-layout="true"] .compact-level-card {
      display: none;
    }

    .card-settings-container[data-desktop-layout="true"] .level-selector-slot {
      width: 100%;
    }

    .card-settings-container[data-desktop-layout="true"]
      .level-selector-slot
      :global(.level-selector) {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--settings-gap);
      width: 100%;
    }

    .card-settings-container[data-desktop-layout="true"]
      .level-selector-slot
      :global(.level-selector .lvl) {
      flex-direction: column;
      gap: 2px;
      width: 100%;
      height: 60px;
      padding: 3px 6px;
    }

    .card-settings-container[data-desktop-layout="true"]
      .level-selector-slot
      :global(.level-selector .name) {
      color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
      font-size: var(--font-size-compact, 12px);
      line-height: 1.05;
      text-align: center;
      white-space: normal;
    }
  }

  .card-grid {
    display: grid;
    flex: 1 1 auto;
    width: 100%;
    min-height: 0;
    gap: var(--settings-gap);

    /* 6-subcolumn grid for flexible last-row spanning
       - Normal cards span 2 subcolumns (2/6 = 1/3 width)
       - 1 card in last row spans 6 subcolumns (full width)
       - 2 cards in last row each span 3 subcolumns (half width each)
    */
    grid-template-columns: repeat(6, minmax(0, 1fr));
    grid-auto-rows: 1fr; /* Rows divide available space equally */
    grid-auto-flow: row;
    align-content: center;
  }

  .card-wrapper {
    container: generate-card / size;
    display: flex;
    flex-direction: column;
    min-height: var(--min-touch-target); /* WCAG AAA minimum touch target */
    min-width: 0;
    overflow: visible; /* Allow cards to pop over neighbors */
    position: relative;
    /* No transition on grid-column — it is a discrete property and never
       interpolates. A card that changes its span is carried by animate:flip
       instead, which eases the whole box between the two measured layouts. */
  }

  /* Level 2 and 3 add a fourth row. Generate is the primary action, so it stays
     at least as tall as the compact Level control instead of becoming the
     shallowest row when the panel is tight. */
  @container settings-grid (width >= 630px) and (height < 560px) {
    .card-grid[data-level="2"],
    .card-grid[data-level="3"] {
      grid-template-rows:
        minmax(0, 1fr)
        minmax(0, 1.15fr)
        minmax(0, 0.95fr)
        minmax(64px, 1fr);
      grid-auto-rows: unset;
    }
  }

  @container settings-grid (width < 630px) and (height < 560px) {
    .card-settings-container:not([data-desktop-layout="true"])
      .card-grid[data-level="2"],
    .card-settings-container:not([data-desktop-layout="true"])
      .card-grid[data-level="3"] {
      grid-template-rows:
        var(--compact-level-row)
        minmax(var(--min-touch-target), 0.8fr)
        minmax(var(--min-touch-target), 0.95fr)
        minmax(var(--min-touch-target), 0.8fr)
        minmax(64px, 1.15fr);
      grid-auto-rows: unset;
    }

    .card-settings-container[data-desktop-layout="true"]
      .card-grid[data-level="2"],
    .card-settings-container[data-desktop-layout="true"]
      .card-grid[data-level="3"] {
      grid-template-rows:
        minmax(0, 1fr)
        minmax(0, 1.15fr)
        minmax(0, 0.95fr)
        minmax(64px, 1fr);
      grid-auto-rows: unset;
    }
  }

  /* "Gentle turns" is supporting copy. The title, value and two 44px touch
     zones remain when this card is too short to carry a fourth text band. */
  @container generate-card (height < 90px) {
    .card-wrapper[data-card-id="turn-intensity"] :global(.card-description) {
      display: none;
    }

    .card-wrapper[data-card-id="customize"] :global(.card-summary),
    .card-wrapper[data-card-id="customize"] :global(.card-value) {
      margin-block: 0;
    }

    .card-wrapper[data-card-id="loop"] :global(.loop-body) {
      gap: 0;
    }
  }

  /* On short phones the sequence still owns the upper half of the composer,
     leaving roughly 44–53px per settings row. Collapse the shared header's
     padding instead of letting its title overlap the card's value. LOOP keeps
     its readable label here; the accessible name still carries every detail. */
  @container generate-card (height < 64px) {
    .card-wrapper :global(.card-header) {
      padding-block: 0;
    }

    .card-wrapper :global(.card-title) {
      line-height: 1;
    }

    .card-wrapper[data-card-id="customize"] :global(.customize-card),
    .card-wrapper[data-card-id="loop"] :global(.loop-consolidated-card) {
      padding-block: 3px;
    }

    .card-wrapper[data-card-id="loop"] :global(.loop-icon-row) {
      display: none;
    }
  }

  .card-wrapper > :global(*) {
    flex: 1;
    min-height: 0;
    min-width: 0;
  }

  /*
   * MAX-HEIGHT CONSTRAINTS:
   * - Mobile/tablet stacked layouts: NO max-height - use all vertical space
   * - Desktop (1024px+): Apply max-height so cards don't expand infinitely
   *
   * Note: Don't use orientation to detect layout - app uses width breakpoints
   * to decide stacked vs side-by-side, not orientation.
   */

  /* Desktop mirrors Construct: controls stay pinned at the panel top while the
     content gets a separately centered stage below them. */
  @media (min-width: 1024px) {
    .card-settings-container {
      max-width: none;
      max-height: none;
      align-self: stretch;
    }

    .card-grid-stage {
      align-items: center;
    }

    .card-grid {
      flex: 0 1 auto;
      height: 100%;
      max-width: min(750px, 95%);
      max-height: calc(
        var(--settings-generate-panel-max-height, min(65cqh, 750px)) - 48px -
          var(--settings-gap)
      );
    }
  }

  /* Create is used natively on 4K displays and TVs. Past the shared 1680 seam,
     grow the complete recipe rather than marooning a 750px phone-sized grid in
     the middle of the settings half. The second tier also scales the selector
     itself, whose fixed rem dimensions otherwise stay tiny across the room. */
  @media (min-width: 1680px) {
    .card-grid {
      max-width: min(56rem, 95%);
      max-height: calc(
        var(--settings-generate-panel-max-height, min(70cqh, 56rem)) - 3.5rem -
          var(--settings-gap)
      );
    }

    .card-settings-container {
      --card-text-size: clamp(24px, 1.5vw, 38px);
    }
  }

  @media (min-width: 2600px) {
    .card-grid {
      max-width: min(74rem, 92%);
      max-height: calc(
        var(--settings-generate-panel-max-height, min(72cqh, 70rem)) - 4.5rem -
          var(--settings-gap)
      );
    }

    .card-settings-container {
      --card-text-size: clamp(30px, 1.25vw, 48px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .card-wrapper {
      transition: none;
    }
  }
</style>
