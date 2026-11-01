export const WINTER_PERFORMANCE_CLEARING_RADIUS = 8;

/** Blender X maps to Three X; Blender Y maps to negative Three Z. */
export const WINTER_POND_LAYOUT = {
  centerX: 16,
  centerZ: -10,
  radiusX: 6,
  radiusZ: 4.4,
  seed: 2.6,
  waterLevelOffset: 0.15,
} as const;

export type WinterDetailTier = "low" | "medium" | "high";

const TIER_RANK: Record<WinterDetailTier, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export function winterDetailTierFromAmount(amount: number): WinterDetailTier {
  if (amount < 0.34) return "low";
  if (amount < 0.67) return "medium";
  return "high";
}

export function capWinterDetailTier(
  requested: WinterDetailTier,
  device: WinterDetailTier
): WinterDetailTier {
  return TIER_RANK[requested] <= TIER_RANK[device] ? requested : device;
}

export function winterObjectIsVisible(
  objectName: string,
  tier: WinterDetailTier
): boolean {
  if (objectName.startsWith("Winter_High_")) return tier === "high";
  if (objectName.startsWith("Winter_Medium_")) return tier !== "low";
  return true;
}

/**
 * The near ranges carry the venue's enclosure on every tier. The far ring is
 * horizon dressing: low tier drops it so phones skip its draw and shading.
 */
export function winterMountainIsVisible(
  isFarRange: boolean,
  tier: WinterDetailTier
): boolean {
  return !isFarRange || tier !== "low";
}

export function nearestWinterPondBankDistance(): number {
  const centerDistance = Math.hypot(
    WINTER_POND_LAYOUT.centerX,
    WINTER_POND_LAYOUT.centerZ
  );
  const angle = Math.atan2(
    -WINTER_POND_LAYOUT.centerZ,
    -WINTER_POND_LAYOUT.centerX
  );
  const directionalRadius =
    1 /
    Math.sqrt(
      (Math.cos(angle) / WINTER_POND_LAYOUT.radiusX) ** 2 +
        (Math.sin(angle) / WINTER_POND_LAYOUT.radiusZ) ** 2
    );
  return centerDistance - directionalRadius;
}
