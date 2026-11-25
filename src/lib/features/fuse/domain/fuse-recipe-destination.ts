/** The groups a hand's settings for new paths are sorted into. Where they all
 *  fit they are one form; where they do not, each group opens on its own. */
export const FUSE_RECIPE_GROUPS = ["path", "style", "start"] as const;

export type FuseRecipeGroup = (typeof FUSE_RECIPE_GROUPS)[number];

export const FUSE_RECIPE_DESTINATIONS = [
  ...FUSE_RECIPE_GROUPS,
  "pairing",
] as const;

export type FuseRecipeDestination = (typeof FUSE_RECIPE_DESTINATIONS)[number];

export type FuseSettingsDestination = FuseRecipeDestination | null;

export function isFuseRecipeDestination(
  value: string
): value is FuseRecipeDestination {
  return FUSE_RECIPE_DESTINATIONS.includes(value as FuseRecipeDestination);
}

export function isFuseRecipeGroup(value: string): value is FuseRecipeGroup {
  return FUSE_RECIPE_GROUPS.includes(value as FuseRecipeGroup);
}
