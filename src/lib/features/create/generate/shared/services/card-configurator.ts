import type { UIGenerationConfig } from "../../state/generate-config.svelte";
import { DifficultyLevel } from "../domain/models/generate-models";
import {
  Period,
  periodToNumber,
} from "../../circular/domain/models/circular-models";
import { minLength as minLengthEngine } from "@tka/sequence-engine/generation";
import {
  expanderMultiplier,
  resolveLoopConfig,
  specHasExpandInversion,
} from "$lib/shared/create/services/loop-type-utils";
import type {
  CardDescriptor,
  CardHandlers,
} from "$lib/shared/create/domain/generator-contract-types";
import {
  getGeneratorCardSpan,
  getGeneratorPanelCards,
} from "$lib/shared/create/domain/card-registry";

/**
 * Derive minimum sequence length for a LOOP configuration via the engine's
 * closed-form calculator. Returns undefined when LOOP is not enabled so the
 * LengthCard falls back to its default minimum.
 *
 * Reads `period` from config if present, otherwise falls back to
 * periodToNumber.
 */
function deriveLoopMinOverride(
  config: UIGenerationConfig,
  loopEnabled: boolean
): number | undefined {
  if (!loopEnabled) return undefined;
  const loopType = config.loopType;
  if (!loopType) return undefined;
  const period = periodToNumber(config.period as Period | undefined);
  const level = Number(config.level) || 1;
  // The two LOOPType enums (app circular-models + engine loop-types) are
  // string-valued and share identical members. Cast through unknown so we can
  // bridge them without pulling the app enum into the engine package.
  const minimum = minLengthEngine({
    loopType: loopType as unknown as Parameters<
      typeof minLengthEngine
    >[0]["loopType"],
    period,
    level,
    gridMode: config.gridMode,
  });
  const { loopSpecWire } = resolveLoopConfig(
    config.loopType,
    config.period,
    config
  );
  if (!loopSpecWire) return Number.isFinite(minimum) ? minimum : undefined;
  const multiplier = expanderMultiplier(loopSpecWire);
  const seedMinimum = specHasExpandInversion(loopSpecWire) ? 2 : 1;
  return Math.max(
    seedMinimum * multiplier,
    Math.ceil((Number.isFinite(minimum) ? minimum : 4) / multiplier) *
      multiplier
  );
}

function deriveLoopStepOverride(
  config: UIGenerationConfig,
  loopEnabled: boolean
): number | undefined {
  if (!loopEnabled) return undefined;
  const { loopSpecWire } = resolveLoopConfig(
    config.loopType,
    config.period,
    config
  );
  // Step between lengths that keep the chosen rhythm, so passing through 10
  // on the way to 16 cannot silently replace quartered rotation with halved.
  return loopSpecWire
    ? Math.max(2, expanderMultiplier(loopSpecWire))
    : undefined;
}

/**
 * Builds card descriptor arrays with conditional rendering and responsive grid layouts.
 *
 * Grid is 6 columns. Cards auto-wrap to new rows when a row fills up.
 *
 *   Row 1: Word(2) + Preset(2) + Length(2) = 6
 *   Level: desktop selector above the grid; compact stepper is injected by
 *          CardBasedSettingsContainer as its own shallow grid row
 *   Row 2 (beginner): GridMode(2) + Customize(2) + LOOP(2) = 6
 *   Row 2 (non-beginner): GridMode(3) + TurnIntensity(3) = 6
 *   Row 3 (beginner): Generate(6)
 *   Row 3 (non-beginner): Customize(3) + LOOP(3) = 6
 *   Row 4 (non-beginner): Generate(6)
 */
export function buildCardDescriptors(
  config: UIGenerationConfig,
  currentLevel: DifficultyLevel,
  isFreeformMode: boolean,
  handlers: CardHandlers,
  allowedIntensityValues: number[],
  isGenerating: boolean = false,
  hasSettingsChanged: boolean = false,
  loopEnabled: boolean = false
): CardDescriptor[] {
  const cardList: CardDescriptor[] = [];
  let cardIndex = 0;

  const isBeginnerLevel = currentLevel === DifficultyLevel.BEGINNER;
  const shouldShowTurnIntensity = currentLevel !== DifficultyLevel.BEGINNER;

  // ─── Row 1: Word(2) + Preset(2) + Length(2) = 6 ───

  cardList.push({
    id: "word-input",
    props: {
      wordValue: handlers.wordInputValue ?? "",
      onWordChange: handlers.handleWordInput,
      onWordSubmit: handlers.handleWordSubmit,
      disabled: isGenerating,
      cardIndex: cardIndex++,
    },
    gridColumnSpan: 2,
  });

  // Saved setups card
  if (handlers.handleOpenPresetDrawer) {
    cardList.push({
      id: "preset",
      props: {
        setupsCardValue: handlers.setupsCardValue ?? "Browse",
        setupsCardStatus: handlers.setupsCardStatus ?? null,
        onOpenDrawer: handlers.handleOpenPresetDrawer,
        cardIndex: cardIndex++,
      },
      gridColumnSpan: 2,
    });
  }

  // Length card - always interactive, with constrained bounds in spell mode
  const hasWord = !!handlers.wordInputValue?.trim();
  if (hasWord) {
    const naturalDisplayLength =
      handlers.computedWordLength ?? handlers.wordInputValue!.trim().length;
    const bridgeInfo = handlers.bridgeInfo;
    const bridgeSubtitle =
      bridgeInfo && bridgeInfo.totalBridges > 0
        ? `+${bridgeInfo.totalBridges} bridge${bridgeInfo.totalBridges !== 1 ? "s" : ""}`
        : "";

    cardList.push({
      id: "length",
      props: {
        currentLength: naturalDisplayLength,
        currentMode: config.mode,
        loopEnabled,
        onLengthChange:
          handlers.handleSpellLengthChange ?? handlers.handleLengthChange,
        locked: false,
        // The length here is the word's own natural length; the handler can only
        // raise it via spellTargetLength, never shrink it below the tier cap.
        // Report the overflow instead of asking for an impossible clamp.
        clampToMax: false,
        minOverride: bridgeInfo?.naturalDisplayLength || undefined,
        subtitle: bridgeSubtitle,
        cardIndex: cardIndex++,
      },
      gridColumnSpan: 2,
    });
  } else {
    cardList.push({
      id: "length",
      props: {
        currentLength: config.length,
        currentMode: config.mode,
        loopEnabled,
        onLengthChange: handlers.handleLengthChange,
        locked: false,
        minOverride: deriveLoopMinOverride(config, loopEnabled),
        stepOverride: deriveLoopStepOverride(config, loopEnabled),
        cardIndex: cardIndex++,
      },
      gridColumnSpan: 2,
    });
  }

  // ─── Row 2: GridMode [+ TurnIntensity] ───

  cardList.push({
    id: "grid-mode",
    props: {
      currentMode: config.gridMode,
      onModeChange: handlers.handleGridModeChange,
      cardIndex: cardIndex++,
    },
    gridColumnSpan: 3,
  });

  if (shouldShowTurnIntensity) {
    cardList.push({
      id: "turn-intensity",
      props: {
        currentIntensity: config.turnIntensity,
        allowedValues: allowedIntensityValues,
        onIntensityChange: handlers.handleTurnIntensityChange,
        cardIndex: cardIndex++,
      },
      gridColumnSpan: 3,
    });
  }

  // ─── Customize + LOOP row ───
  // Rotation owns its Halved/Quartered choice inside the LOOP drawer. A separate
  // Period card here exposed the same config field through a second control.
  // Customize card (absorbs Style + Start/End; Rhythm removed pending design)
  const hasStartEnd = handlers.handleStartEndChange && handlers.startEndOptions;
  if (handlers.handleConstraintPresetChange) {
    cardList.push({
      id: "customize",
      props: {
        constraintPreset: config.constraintPreset,
        handPathMode: config.handPathMode,
        motionTypeFilter: config.motionTypeFilter,
        startEndOptions: handlers.startEndOptions ?? null,
        level: config.level,
        gridMode: handlers.currentGridMode,
        isFreeformMode: !loopEnabled,
        onConstraintPresetChange: handlers.handleConstraintPresetChange,
        onHandPathModeChange: handlers.handleHandPathModeChange,
        onMotionTypeFilterChange: handlers.handleMotionTypeFilterChange,
        handRelationship: config.handRelationship,
        handRelationshipInverted: config.handRelationshipInverted,
        matchHandTurns: config.matchHandTurns,
        onHandRelationshipChange: handlers.handleHandRelationshipChange ?? null,
        onHandRelationshipInvertedChange:
          handlers.handleHandRelationshipInvertedChange ?? null,
        onMatchHandTurnsChange: handlers.handleMatchHandTurnsChange ?? null,
        onStartEndChange: hasStartEnd ? handlers.handleStartEndChange : null,
        onResetAll: handlers.handleResetAll ?? null,
        cardIndex: cardIndex++,
      },
      gridColumnSpan: 3,
    });
  }

  // Consolidated LOOP card (toggle + type selection)
  if (handlers.handleLoopToggle) {
    cardList.push({
      id: "loop",
      props: {
        loopEnabled,
        currentLOOPType: config.loopType,
        // The card renders the same LOOP the generator will build, so it needs
        // the whole rhythm — not just the type. Dropping any of these makes the
        // icons disagree with what actually gets generated.
        period: config.period,
        inversionInterval: config.inversionInterval,
        inversionMode: config.inversionMode,
        reflectionAxis: config.reflectionAxis,
        handRelationship: config.handRelationship,
        onLOOPTypeChange: handlers.handleLOOPTypeChange,
        cardIndex: cardIndex++,
      },
      gridColumnSpan: 3,
    });
  }

  // ─── Generate Button (always last, full width) ───

  if (handlers.handleGenerateClick) {
    cardList.push({
      id: "generate-button",
      props: {
        isGenerating,
        hasSettingsChanged,
        onGenerateClicked: handlers.handleGenerateClick,
        config,
        startEndOptions: handlers.startEndOptions,
      },
      gridColumnSpan: 6,
    });
  }

  const panelCards = getGeneratorPanelCards({
    includeLevel: false,
    isBeginner: isBeginnerLevel,
    capabilities: {
      preset: Boolean(handlers.handleOpenPresetDrawer),
      customize: Boolean(handlers.handleConstraintPresetChange),
      loop: Boolean(handlers.handleLoopToggle),
      generate: Boolean(handlers.handleGenerateClick),
    },
  }).filter((entry) => entry.slot === "grid");

  // The registry owns both order and layout. If a card is added there without
  // a real descriptor, fail loudly instead of letting the explanation screen
  // advertise a control that the panel cannot render.
  return panelCards.map((entry) => {
    const descriptor = cardList.find((card) => card.id === entry.id);
    if (!descriptor) {
      throw new Error(`Missing generator card descriptor: ${entry.id}`);
    }
    return {
      ...descriptor,
      gridColumnSpan: getGeneratorCardSpan(entry, isBeginnerLevel),
    };
  });
}
