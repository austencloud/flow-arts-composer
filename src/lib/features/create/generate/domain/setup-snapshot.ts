/**
 * Pure snapshot capture and canonical equality for saved generator setups.
 *
 * Setups capture generator settings, not spell words. Mode and spell target
 * length are derived from the unsaved word, so both are normalized at capture.
 */
import { GenerationMode } from "../shared/domain/models/generate-models";
import type { UIGenerationConfig } from "../state/generate-config.svelte";
import type { StartEndOptions } from "$lib/shared/create/state/panel-coordination-state.svelte";

export interface SetupSnapshot {
  config: UIGenerationConfig;
  startEndOptions: StartEndOptions | null;
}

const SET_SEMANTIC_KEYS = new Set([
  "blockedStartPlacements",
  "mustContainLetters",
  "mustNotContainLetters",
]);

function canonicalize(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalize(item));
    if (key !== undefined && SET_SEMANTIC_KEYS.has(key)) {
      return items
        .map((item) => JSON.stringify(item))
        .sort()
        .map((item) => JSON.parse(item) as unknown);
    }
    return items;
  }

  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const childKey of Object.keys(source).sort()) {
      if (source[childKey] === undefined) continue;
      result[childKey] = canonicalize(source[childKey], childKey);
    }

    return result;
  }

  return value;
}

export function captureSetupSnapshot(
  config: UIGenerationConfig,
  startEndOptions: StartEndOptions | null | undefined
): SetupSnapshot {
  const plainConfig = JSON.parse(
    JSON.stringify(config)
  ) as UIGenerationConfig;
  plainConfig.mode = GenerationMode.FREEFORM;
  plainConfig.spellTargetLength = null;

  const plainStartEnd =
    startEndOptions == null
      ? null
      : (JSON.parse(JSON.stringify(startEndOptions)) as StartEndOptions);

  return {
    config: plainConfig,
    startEndOptions: plainStartEnd,
  };
}

export function setupSnapshotsEqual(
  first: SetupSnapshot,
  second: SetupSnapshot
): boolean {
  return (
    JSON.stringify(canonicalize(first)) ===
    JSON.stringify(canonicalize(second))
  );
}
