import {
  AVAILABLE_FAN_BUILDS,
  FAN_BUILDS,
  defaultFanBuild,
  normalizeFanAppearance,
  type FanAppearance,
  type FanBuild,
} from "#lib/shared/pictograph/prop/domain/fan-appearance.js";

// Review-only builds stay out of the public appearance lists and codecs until
// their models and artwork have passed visual acceptance.
export const INTERNAL_FAN_BUILDS = [...FAN_BUILDS, "astral"] as const;
export type InternalFanBuild = (typeof INTERNAL_FAN_BUILDS)[number];
export type InternalFanAppearance = Omit<FanAppearance, "build"> & {
  build: InternalFanBuild;
};

export function normalizeInternalFanAppearance(
  value: Partial<InternalFanAppearance> | null | undefined,
  available: readonly FanBuild[] = AVAILABLE_FAN_BUILDS
): InternalFanAppearance {
  const normalized = normalizeFanAppearance(
    {
      ...value,
      build: value?.build === "astral" ? "moon" : value?.build,
    },
    available
  );
  return {
    ...normalized,
    build: value?.build === "astral" ? "astral" : normalized.build,
    cover: value?.build === "astral" ? "bare" : normalized.cover,
  };
}

/**
 * A build that is stored or inherited but not offered renders as the default.
 * Masked, not rewritten: the stored choice returns if its look is offered
 * later. The review-only astral build is never masked.
 */
export function clampFanBuild<T extends { fanBuild: string }>(
  build: T,
  available: readonly FanBuild[] = AVAILABLE_FAN_BUILDS
): T {
  if (
    build.fanBuild === "astral" ||
    available.includes(build.fanBuild as FanBuild)
  ) {
    return build;
  }
  return { ...build, fanBuild: defaultFanBuild(available) };
}
