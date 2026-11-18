export const FAN_BUILDS = [
  "pictograph",
  "fire",
  "flat-grip",
  "lotus",
  "day",
  "moon",
  "star",
  "sense",
] as const;
export type FanBuild = (typeof FAN_BUILDS)[number];

/**
 * A look modelled on a maker's product is drawn once its maker has approved
 * it. Until then a request for it draws the pictograph fan. Turning one on is
 * a one-line change here, mirrored in the app's APPROVED_FAN_BUILDS and in
 * mcp-server's copy; a unit test keeps the three lists equal.
 */
export const APPROVED_FAN_BUILDS: readonly FanBuild[] = ["pictograph", "sense"];

/** Fire when it is approved, otherwise the app's own pictograph drawing. */
export function defaultFanBuild(
  approved: readonly FanBuild[] = APPROVED_FAN_BUILDS
): FanBuild {
  return approved.includes("fire") ? "fire" : "pictograph";
}

/** The build to draw: the one asked for if approved, else the default. */
export function resolveFanBuild(
  requested: unknown,
  approved: readonly FanBuild[] = APPROVED_FAN_BUILDS
): FanBuild {
  return typeof requested === "string" &&
    FAN_BUILDS.includes(requested as FanBuild) &&
    approved.includes(requested as FanBuild)
    ? (requested as FanBuild)
    : defaultFanBuild(approved);
}

/** True when the caller asked for a real look that is not drawn yet. */
export function isFanBuildWaiting(
  requested: unknown,
  approved: readonly FanBuild[] = APPROVED_FAN_BUILDS
): boolean {
  return (
    typeof requested === "string" &&
    FAN_BUILDS.includes(requested as FanBuild) &&
    !approved.includes(requested as FanBuild)
  );
}

/** For tool descriptions: what happens to a look still waiting on its maker. */
export const FAN_WAITING_NOTE =
  "A look modelled on a maker's product is drawn once its maker has approved it. Until then it is drawn as the pictograph fan.";
