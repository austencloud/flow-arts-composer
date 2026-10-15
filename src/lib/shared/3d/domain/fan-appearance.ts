import {
  FAN_BUILDS,
  normalizeFanAppearance,
  type FanAppearance,
} from "#lib/shared/pictograph/prop/domain/fan-appearance.js";

// Review-only builds stay out of the public appearance lists and codecs until
// their models and artwork have passed visual acceptance.
export const INTERNAL_FAN_BUILDS = [...FAN_BUILDS, "astral"] as const;
export type InternalFanBuild = (typeof INTERNAL_FAN_BUILDS)[number];
export type InternalFanAppearance = Omit<FanAppearance, "build"> & {
  build: InternalFanBuild;
};

export function normalizeInternalFanAppearance(
  value: Partial<InternalFanAppearance> | null | undefined
): InternalFanAppearance {
  const normalized = normalizeFanAppearance({
    ...value,
    build: value?.build === "astral" ? "moon" : value?.build,
  });
  return {
    ...normalized,
    build: value?.build === "astral" ? "astral" : normalized.build,
    cover: value?.build === "astral" ? "bare" : normalized.cover,
  };
}
