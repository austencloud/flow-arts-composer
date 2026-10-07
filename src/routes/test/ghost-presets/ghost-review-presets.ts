import type { EffectPreset } from "$lib/shared/animation-engine/components/effects-panel/presets/types";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
import type { GhostIntent } from "$lib/shared/effects/domain/effects-config";

export type GhostPresetSource = "production" | "study";
export type GhostPresetVerdict = "favorite" | "pass";
export type GhostPresetVerdicts = Partial<Record<string, GhostPresetVerdict>>;

export interface GhostReviewPreset extends EffectPreset<"ghost"> {
  direction: string;
  source: GhostPresetSource;
}

const STUDY_PRESETS: GhostReviewPreset[] = [
  {
    id: "ghost-cold-glass",
    name: "Cold Glass",
    previewColor: "#38bdf8",
    previewColor2: "#fb7185",
    direction: "Thin, icy copies with more black space between them.",
    source: "study",
    patch: {
      intensity: 0.58,
      decay: 9.5,
      interval: 0.35,
    },
  },
  {
    id: "ghost-hard-freeze",
    name: "Hard Freeze",
    previewColor: "#67e8f9",
    previewColor2: "#f43f5e",
    direction: "Dense, bright captures that stop reading like fog.",
    source: "study",
    patch: {
      intensity: 1,
      decay: 4,
      interval: 0.9,
    },
  },
  {
    id: "ghost-violet-memory",
    name: "Violet Memory",
    previewColor: "#22d3ee",
    previewColor2: "#c084fc",
    direction: "Cooler color separation and a clear age ladder.",
    source: "study",
    patch: {
      intensity: 0.72,
      decay: 8.5,
      interval: 0.65,
    },
  },
  {
    id: "ghost-pale-echo",
    name: "Pale Echo",
    previewColor: "#93c5fd",
    previewColor2: "#fda4af",
    direction: "A long translucent wake that almost disappears.",
    source: "study",
    patch: {
      intensity: 0.42,
      decay: 10,
      interval: 0.8,
    },
  },
];

export const GHOST_REVIEW_PRESETS: readonly GhostReviewPreset[] = [
  ...STUDY_PRESETS,
];

const REVIEW_PRESET_IDS = new Set(
  GHOST_REVIEW_PRESETS.map((preset) => preset.id)
);

export const GHOST_REVIEW_STORAGE_KEY = "tka_ghost_preset_review_v1";

export function resolveGhostReviewIntent(
  preset: GhostReviewPreset
): GhostIntent {
  const patch = preset.resolvePatch?.() ?? preset.patch ?? {};
  return {
    ...DEFAULT_EFFECTS_CONFIG.ghost,
    ...patch,
  };
}

export function ghostReviewIntentMatches(
  current: GhostIntent,
  expected: GhostIntent
): boolean {
  return (
    current.intensity === expected.intensity &&
    current.decay === expected.decay &&
    current.interval === expected.interval
  );
}

export function toggleGhostPresetVerdict(
  current: GhostPresetVerdict | undefined,
  requested: GhostPresetVerdict
): GhostPresetVerdict | undefined {
  return current === requested ? undefined : requested;
}

export function parseGhostPresetVerdicts(
  serialized: string | null
): GhostPresetVerdicts {
  if (!serialized) return {};

  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([id, verdict]) =>
          REVIEW_PRESET_IDS.has(id) &&
          (verdict === "favorite" || verdict === "pass")
      )
    ) as GhostPresetVerdicts;
  } catch {
    return {};
  }
}
