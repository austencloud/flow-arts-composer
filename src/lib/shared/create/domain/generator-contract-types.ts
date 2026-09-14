import type {
  DifficultyLevel,
  GenerationMode,
  PropContinuity,
} from "$lib/shared/foundation/domain/models/generation/generate-models";
import type { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";
import type { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { StartEndOptions } from "$lib/shared/create/state/panel-coordination-state.svelte";
import type { GeneratorCardId } from "$lib/shared/create/domain/card-registry";
import type { HandRelationship } from "$lib/shared/create/domain/hand-relationship";

/**
 * Card descriptor for rendering in the UI
 * Contains all necessary information to render a specific card component
 */
export interface CardDescriptor {
  /** Must match a registered card ID from card-registry.ts */
  id: GeneratorCardId;
  /** Props to pass to the card component */
  props: Record<string, unknown>;
  /** Number of grid columns this card should span (1-6) */
  gridColumnSpan: number;
}

/**
 * Handlers for card interactions
 * Passed from parent component to wire up event callbacks
 */
export interface CardHandlers {
  handleLevelChange: (level: DifficultyLevel) => void;
  handleLengthChange: (length: number) => void;
  handleTurnIntensityChange: (intensity: number) => void;
  handlePropContinuityChange: (continuity: PropContinuity) => void;
  handleGridModeChange: (mode: GridMode) => void;
  /** @deprecated Mode is now derived from word presence. Kept for interface compat. */
  handleGenerationModeChange?: (mode: GenerationMode) => void;
  handleLOOPTypeChange: (loopType: LOOPType) => void;
  handleStartEndChange?: (options: StartEndOptions) => void;
  handleGenerateClick?: () => Promise<void>;
  // Style card handlers
  handleConstraintPresetChange?: (v: "smooth" | "mixed" | "choppy") => void;
  handleHandPathModeChange?: (v: "smooth" | "mixed" | "choppy") => void;
  handleMotionTypeFilterChange?: (
    v: "no-dash" | "mixed" | "prefer-dash"
  ) => void;
  // Hand relationship handlers (Customize drill row)
  handleHandRelationshipChange?: (v: HandRelationship) => void;
  handleHandRelationshipInvertedChange?: (v: boolean) => void;
  handleMatchHandTurnsChange?: (v: boolean) => void;
  /** Restore every persisted generation setting to its first-run value. */
  handleResetAll?: () => void;
  // Duration card handler
  handleDurationTemplateSelect?: (id: string | null) => void;
  // Word input handlers (spell mode)
  wordInputValue?: string;
  handleWordInput?: (value: string) => void;
  handleWordSubmit?: () => void;
  // LOOP toggle handler
  handleLoopToggle?: () => void;
  // Start/End options (optional, for when start/end card is shown)
  startEndOptions?: StartEndOptions;
  // Pre-computed total beat count for the current word (includes bridges + LOOP multiplier)
  computedWordLength?: number;
  // Spell mode length change handler (adjusts spellTargetLength)
  handleSpellLengthChange?: (length: number) => void;
  // Bridge info for spell mode length card subtitle
  bridgeInfo?: {
    requiredBridges: number;
    extraBridges: number;
    totalBridges: number;
    naturalLength: number;
    /** LOOP-multiplied natural length (without extras) - the stepper floor */
    naturalDisplayLength: number;
  };
  // Trigger value that increments when positions are reset due to grid mode change
  positionsResetTrigger?: number;
  // Current grid mode for position picker filtering
  currentGridMode?: GridMode;
  // Saved setups card
  setupsCardValue?: string;
  setupsCardStatus?: "active" | null;
  handleOpenPresetDrawer?: () => void;
}

/**
 * Result of a LOOP viability check. When !viable, `reason` is a human-readable
 * sentence explaining the block; `suggestion` (if present) is an actionable
 * follow-up the UI can show to the user.
 */
export interface LoopViabilityCheck {
  readonly viable: boolean;
  readonly reason?: string;
  readonly suggestion?: string;
}

export interface LoopViabilityArgs {
  readonly loopType: LOOPType;
  readonly period: number;
  readonly level?: number;
  readonly gridMode?: GridMode;
}

/**
 * Turn Allocation Calculator Interface
 *
 * Calculates turn distribution across steps based on level and turn intensity.
 */
export interface TurnAllocation {
  left: (number | "fl")[];
  right: (number | "fl")[];
}
