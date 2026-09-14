/**
 * UI Configuration state management for GeneratePanel
 *
 * Manages UI-specific configuration state using UIGenerationConfig.
 * Use config-mapper.ts to convert to/from GenerationOptions for service calls.
 * Includes persistence to localStorage for settings persistence across sessions.
 */

import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { LOOPType, Period } from "../circular/domain/models/circular-models";
import {
  GenerationMode,
  PropContinuity,
} from "../shared/domain/models/generate-models";
import type { UIGenerationConfig } from "../shared/utils/config-mapper";
import { getTemplateById } from "../../shared/domain/templates/duration-templates";
import { authState } from "$lib/shared/auth/state/auth-state.svelte";
import { resolveAccessTier } from "$lib/shared/auth/domain/access-tier";
import { isPremiumOrAbove } from "$lib/shared/auth/domain/models/user-role";
import type { ReflectionAxis } from "@tka/sequence-engine/loop";
import { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
import { fitLoopRhythmToLength } from "$lib/shared/create/services/loop-rhythm-gating";
import { parseLoopComponents } from "$lib/shared/create/services/loop-type-utils";
import { normalizePersistedGenerationConfig } from "../domain/generator-persistence-normalizer";
import {
  DEFAULT_GENERATION_STYLE,
  type GenerationMotionTypeFilter,
  type GenerationStyleAxis,
} from "$lib/shared/create/domain/generation-style";
import {
  DEFAULT_HAND_RELATIONSHIP,
  type HandRelationship,
} from "$lib/shared/create/domain/hand-relationship";

// Re-export for convenience
export type { UIGenerationConfig };

const STORAGE_KEY = "tka-generate-config";

interface SerializedConfig {
  mode: GenerationMode;
  loopEnabled?: boolean;
  length: number;
  level: number;
  turnIntensity: number;
  gridMode: GridMode;
  propContinuity: PropContinuity;
  period: Period;
  loopType: LOOPType;
  inversionInterval?: 2 | 4;
  inversionMode?: "expand" | "overlay";
  reflectionAxis?: ReflectionAxis;
  timestamp: number;
  // 3-axis constraint system
  constraintPreset?: GenerationStyleAxis;
  handPathMode?: GenerationStyleAxis;
  motionTypeFilter?: GenerationMotionTypeFilter;
  // Hand relationship
  handRelationship?: HandRelationship;
  handRelationshipInverted?: boolean;
  matchHandTurns?: boolean;
  // Duration rhythm template
  durationTemplateId?: string | null;
  // Spell mode length override
  spellTargetLength?: number | null;
}

/**
 * Save configuration to localStorage
 */
function saveConfig(config: UIGenerationConfig): void {
  try {
    const serialized: SerializedConfig = {
      mode: config.mode as GenerationMode,
      loopEnabled: config.loopEnabled,
      length: config.length,
      level: config.level,
      turnIntensity: config.turnIntensity,
      gridMode: config.gridMode as GridMode,
      propContinuity: config.propContinuity as PropContinuity,
      period: config.period as Period,
      loopType: config.loopType as LOOPType,
      inversionInterval: config.inversionInterval,
      inversionMode: config.inversionMode,
      reflectionAxis: config.reflectionAxis,
      timestamp: Date.now(),
      constraintPreset: config.constraintPreset,
      handPathMode: config.handPathMode,
      motionTypeFilter: config.motionTypeFilter,
      handRelationship: config.handRelationship,
      handRelationshipInverted: config.handRelationshipInverted,
      matchHandTurns: config.matchHandTurns,
      durationTemplateId: config.durationTemplateId,
      spellTargetLength: config.spellTargetLength,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
  } catch (error) {
    console.warn("⚠️ GenerateConfig: Failed to save config:", error);
  }
}

/**
 * Load configuration from localStorage
 */
function loadConfig(): UIGenerationConfig | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const data = normalizePersistedGenerationConfig(
      JSON.parse(stored)
    ) as SerializedConfig;

    // Validate essential properties
    if (
      data.mode === undefined ||
      data.length === undefined ||
      data.level === undefined
    ) {
      console.warn("⚠️ GenerateConfig: Invalid config structure");
      return null;
    }

    // Build config object, only including defined values
    // This prevents undefined values from overriding DEFAULT_CONFIG
    // Migrate legacy "circular" mode → freeform + loopEnabled
    const isLegacyCircular = data.mode === ("circular" as GenerationMode);
    // Migrate legacy "spell" mode → freeform (spell is now implicit from word presence)
    const isLegacySpell = data.mode === GenerationMode.SPELL;
    const result: Partial<UIGenerationConfig> = {
      mode:
        isLegacyCircular || isLegacySpell
          ? GenerationMode.FREEFORM
          : (data.mode as GenerationMode),
      loopEnabled: data.loopEnabled ?? isLegacyCircular,
      length: data.length,
      level: data.level,
    };

    if (data.turnIntensity !== undefined) {
      result.turnIntensity = data.turnIntensity;
    }
    if (data.gridMode !== undefined) {
      result.gridMode = data.gridMode as GridMode;
    }
    if (data.propContinuity !== undefined) {
      result.propContinuity = data.propContinuity as PropContinuity;
    }
    if (data.period !== undefined) {
      result.period = data.period as Period;
    }
    if (data.loopType !== undefined) {
      // Migrate legacy "strict_*" prefixed LOOP types → clean names
      const STRICT_MIGRATION: Record<string, string> = {
        strict_rotated: "rotated",
        strict_mirrored: "mirrored",
        strict_swapped: "swapped",
        strict_inverted: "inverted",
      };
      const migratedType = STRICT_MIGRATION[data.loopType] ?? data.loopType;
      result.loopType = migratedType as LOOPType;
    }
    if (data.inversionInterval !== undefined) {
      result.inversionInterval = data.inversionInterval;
    }
    if (data.inversionMode !== undefined) {
      result.inversionMode = data.inversionMode;
    }
    if (data.reflectionAxis !== undefined) {
      result.reflectionAxis = data.reflectionAxis;
    }
    if (data.constraintPreset !== undefined) {
      // Migrate legacy "high-reversal" → "choppy"
      result.constraintPreset =
        data.constraintPreset === ("high-reversal" as string)
          ? "choppy"
          : data.constraintPreset;
    }
    if (data.handPathMode !== undefined) {
      // Migrate legacy "high" → "choppy"
      result.handPathMode =
        data.handPathMode === ("high" as string) ? "choppy" : data.handPathMode;
    }
    if (data.motionTypeFilter !== undefined) {
      result.motionTypeFilter = data.motionTypeFilter;
    }
    if (data.handRelationship !== undefined) {
      result.handRelationship = data.handRelationship;
    }
    if (data.handRelationshipInverted !== undefined) {
      result.handRelationshipInverted = data.handRelationshipInverted;
    }
    if (data.matchHandTurns !== undefined) {
      result.matchHandTurns = data.matchHandTurns;
    }
    if (data.durationTemplateId !== undefined) {
      result.durationTemplateId = data.durationTemplateId;
    }
    if (data.spellTargetLength !== undefined) {
      result.spellTargetLength = data.spellTargetLength;
    }

    return result as UIGenerationConfig;
  } catch (error) {
    console.warn("⚠️ GenerateConfig: Failed to load config:", error);
    return null;
  }
}

/**
 * Clear saved configuration from localStorage
 */
function clearConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("⚠️ GenerateConfig: Failed to clear config:", error);
  }
}

// Opinionated starting state for anyone with no saved config: a rotated LOOP
// with a quartered slice at length 8, so a first-run Generate tab produces a
// LOOP out of the box instead of a loop-off freeform prompt. Overridden by any
// saved config.
const DEFAULT_CONFIG: UIGenerationConfig = {
  mode: GenerationMode.FREEFORM,
  loopEnabled: true,
  length: 8,
  level: 2,
  turnIntensity: 1.0,
  gridMode: GridMode.DIAMOND,
  propContinuity: PropContinuity.CONTINUOUS,
  period: Period.QUARTERED,
  loopType: LOOPType.ROTATED,
  reflectionAxis: "north-south",
  ...DEFAULT_GENERATION_STYLE,
  handRelationship: DEFAULT_HAND_RELATIONSHIP,
  handRelationshipInverted: false,
  matchHandTurns: false,
  durationTemplateId: null,
  spellTargetLength: null,
};

/**
 * The starting state, exported so "Reset all" in the Customize panel can put
 * every persisted knob back where a first-run user finds it. Settings persist
 * across sessions by design — this is the way out when a saved combination
 * (e.g. Choppy props) quietly narrows what the generator can produce.
 */
export const GENERATE_DEFAULT_CONFIG: Readonly<UIGenerationConfig> =
  DEFAULT_CONFIG;

function reconcileLoopLength(config: UIGenerationConfig): UIGenerationConfig {
  if (!config.loopEnabled) return config;

  const components = parseLoopComponents(config.loopType);
  const fitted = fitLoopRhythmToLength(
    components,
    {
      rotationInterval: config.period === Period.QUARTERED ? 4 : 2,
      inversionInterval: config.inversionInterval ?? 2,
      inversionMode: config.inversionMode ?? "expand",
      reflectionAxis: config.reflectionAxis,
    },
    config.length
  );

  if (!fitted) return { ...config, loopEnabled: false };

  const period = components.has(LOOPComponent.ROTATED)
    ? fitted.rhythm.rotationInterval === 4
      ? Period.QUARTERED
      : Period.HALVED
    : config.period;
  const inversionInterval = components.has(LOOPComponent.INVERTED)
    ? (fitted.rhythm.inversionInterval ?? config.inversionInterval)
    : config.inversionInterval;
  if (
    period === config.period &&
    inversionInterval === config.inversionInterval
  )
    return config;

  return { ...config, period, inversionInterval };
}

// Signed-out visitors additionally start at level 1 (beginner). The loop
// settings now come from DEFAULT_CONFIG, so only the level delta lives here.
const GUEST_DEFAULT_OVERRIDES: Partial<UIGenerationConfig> = {
  level: 1,
};

/**
 * Creates simple reactive state for generation configuration
 * Automatically loads saved settings from localStorage and persists changes
 */
export function createGenerationConfigState(
  initialConfig?: Partial<UIGenerationConfig>
) {
  // Load saved config or use defaults
  const savedConfig = loadConfig();

  // Guests with no saved config get an opinionated starting state
  // so the Generate tab isn't a blank Intermediate freeform prompt.
  // Resolve the access tier so anonymous Firebase guests (now
  // isAuthenticated === true) are still treated as guests, rather than
  // inferring guest from raw auth.
  const isGuest =
    resolveAccessTier(
      authState.isAuthenticated,
      authState.isAnonymous,
      isPremiumOrAbove(authState.role)
    ) === "guest";
  const guestOverrides = !savedConfig && isGuest ? GUEST_DEFAULT_OVERRIDES : {};

  // Initialize config with priority: initialConfig > savedConfig > guestOverrides > DEFAULT_CONFIG
  const normalizedInitialConfig =
    normalizePersistedGenerationConfig(initialConfig);
  let config = $state<UIGenerationConfig>(
    reconcileLoopLength({
      ...DEFAULT_CONFIG,
      ...guestOverrides,
      ...(savedConfig || {}),
      ...normalizedInitialConfig,
    })
  );

  // Derived values
  const isFreeformMode = $derived(config.mode === GenerationMode.FREEFORM);
  const isLoopEnabled = $derived(config.loopEnabled);

  // Migrate legacy "strict_*" loop types stored in older Firestore favorites
  // or localStorage configs. Same table used in loadConfig().
  const STRICT_LOOP_MIGRATION: Record<string, string> = {
    strict_rotated: "rotated",
    strict_mirrored: "mirrored",
    strict_swapped: "swapped",
    strict_inverted: "inverted",
  };

  // Simple update function with persistence
  // Strips undefined values so callers (e.g. Firestore favorite configs missing
  // newer fields like loopEnabled) can't accidentally overwrite current values.
  // Also migrates legacy "strict_*" loop types to their modern equivalents.
  function updateConfig(updates: Partial<UIGenerationConfig>) {
    updates = normalizePersistedGenerationConfig(updates);
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(updates)) {
      if (v !== undefined) cleaned[k] = v;
    }
    if (
      typeof cleaned.loopType === "string" &&
      cleaned.loopType in STRICT_LOOP_MIGRATION
    ) {
      cleaned.loopType = STRICT_LOOP_MIGRATION[cleaned.loopType];
    }

    // Bail on a write that changes nothing. Reassigning unconditionally handed
    // every downstream `$derived` a new object reference, which rebuilt every
    // card descriptor and every handler closure inside it. Effects that read one
    // of those callbacks then saw a fresh function identity and re-ran, so a
    // no-op update could re-arm the very effect that issued it.
    const current = config as unknown as Record<string, unknown>;
    const changed = Object.keys(cleaned).some(
      (key) => !Object.is(cleaned[key], current[key])
    );
    if (!changed) return;

    config = reconcileLoopLength({ ...config, ...cleaned });

    // Auto-clear duration template if it's no longer valid for the current length
    if (config.durationTemplateId) {
      const template = getTemplateById(config.durationTemplateId);
      if (template && template.minSteps > config.length) {
        config = { ...config, durationTemplateId: null };
      }
    }

    saveConfig(config);
  }

  /**
   * Put every persisted knob back to its first-run value. The tier is resolved
   * fresh rather than reused from construction, so a guest who signs in mid
   * session doesn't get reset back to the guest level.
   */
  function resetConfig() {
    const guestNow =
      resolveAccessTier(
        authState.isAuthenticated,
        authState.isAnonymous,
        isPremiumOrAbove(authState.role)
      ) === "guest";
    updateConfig({
      ...DEFAULT_CONFIG,
      ...(guestNow ? GUEST_DEFAULT_OVERRIDES : {}),
    });
  }

  // Event handlers (matching your updated signatures)
  function onLevelChanged(event: CustomEvent) {
    const newLevel = event.detail.value;
    const updates: Partial<UIGenerationConfig> = { level: newLevel };

    // Clamp turn intensity to valid values for the new level.
    // Level 2 only allows whole turns [1, 2, 3], so 0.5 from level 3 must snap to 1.
    // Level 1 has no turns, so intensity doesn't matter (card is hidden).
    const allowedByLevel: Record<number, number[]> = {
      1: [],
      2: [1.0, 2.0, 3.0],
      3: [0.5, 1.0, 1.5, 2.0, 2.5, 3.0],
    };
    const allowed = allowedByLevel[newLevel] ?? [1.0, 2.0, 3.0];

    if (allowed.length > 0 && !allowed.includes(config.turnIntensity)) {
      // Snap to the nearest valid value (or the minimum if current is below range)
      const nearest = allowed.reduce((best, v) =>
        Math.abs(v - config.turnIntensity) <
        Math.abs(best - config.turnIntensity)
          ? v
          : best
      );
      updates.turnIntensity = nearest;
    }

    updateConfig(updates);
  }

  function onLengthChanged(event: CustomEvent) {
    updateConfig({ length: event.detail.value });
  }

  function onTurnIntensityChanged(event: CustomEvent) {
    updateConfig({ turnIntensity: event.detail.value });
  }

  function onGridModeChanged(value: GridMode) {
    updateConfig({ gridMode: value });
  }

  function onGenerationModeChanged(mode: GenerationMode) {
    updateConfig({ mode });
  }

  function onPropContinuityChanged(value: PropContinuity) {
    updateConfig({ propContinuity: value });
  }

  function onPeriodChanged(value: Period) {
    updateConfig({ period: value });
  }

  function onLOOPTypeChanged(event: CustomEvent) {
    updateConfig({ loopType: event.detail.value });
  }

  return {
    // State
    get config() {
      return config;
    },
    get isFreeformMode() {
      return isFreeformMode;
    },
    get isLoopEnabled() {
      return isLoopEnabled;
    },

    // Actions
    updateConfig,
    resetConfig,
    clearSavedConfig: clearConfig,

    // Event handlers
    onLevelChanged,
    onLengthChanged,
    onTurnIntensityChanged,
    onGridModeChanged,
    onGenerationModeChanged,
    onPropContinuityChanged,
    onPeriodChanged,
    onLOOPTypeChanged,
  };
}
