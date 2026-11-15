/**
 * What a person chose when they generated, reduced to flat primitives for the
 * `sequence_generate` analytics event. Nothing typed by the person (no spell
 * word) and no ids go in; every value is a short code or a number.
 *
 * Start and end placement are not part of UIGenerationConfig. They live in the
 * Customize panel's StartEndOptions and reach the generator on
 * GenerationOptions, so the caller passes them separately.
 */

import { GENERATE_DEFAULT_CONFIG } from "./generate-config.svelte";
import type { UIGenerationConfig } from "#lib/shared/create/utils/config-mapper.js";

export interface GeneratePlacementChoices {
  blockedStartPlacements?: readonly string[] | undefined;
  startPlacementId?: string | undefined;
  endPlacements?: readonly string[] | undefined;
}

export type GenerateChoiceDetails = Record<string, string | number | boolean>;

function joinSorted(values: readonly string[]): string {
  return [...values].map(String).sort().join("+");
}

function describeStart(placements: GeneratePlacementChoices): string {
  if (placements.startPlacementId) return String(placements.startPlacementId);
  const blocked = placements.blockedStartPlacements ?? [];
  return blocked.length === 0 ? "any" : `blocked:${joinSorted(blocked)}`;
}

function describeEnd(placements: GeneratePlacementChoices): string {
  const ends = placements.endPlacements ?? [];
  return ends.length === 0 ? "any" : joinSorted(ends);
}

function changedKeys(
  config: UIGenerationConfig,
  defaults: Readonly<UIGenerationConfig>
): string[] {
  const current = config as unknown as Record<string, unknown>;
  const base = defaults as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(base), ...Object.keys(current)]);
  return [...keys]
    .filter(
      (key) =>
        JSON.stringify(current[key] ?? null) !==
        JSON.stringify(base[key] ?? null)
    )
    .sort();
}

export function describeGenerateChoices(
  config: UIGenerationConfig,
  placements?: GeneratePlacementChoices,
  defaults: Readonly<UIGenerationConfig> = GENERATE_DEFAULT_CONFIG
): GenerateChoiceDetails {
  const changed = changedKeys(config, defaults);
  const details: GenerateChoiceDetails = {
    gen_level: config.level,
    gen_loop_enabled: config.loopEnabled,
    gen_grid_mode: String(config.gridMode),
    gen_turn_intensity: config.turnIntensity,
    gen_prop_continuity: config.propContinuity,
    gen_hand_relationship: config.handRelationship ?? "free",
    gen_prop_relationship: config.propRelationship ?? "free",
    gen_settings_changed: changed.join(","),
    gen_is_default_config: changed.length === 0,
  };

  if (config.loopEnabled) {
    details.gen_loop_type = config.loopType;
    details.gen_loop_period = config.period;
  }
  if (placements) {
    details.gen_start_position = describeStart(placements);
    details.gen_end_position = describeEnd(placements);
  }
  return details;
}
