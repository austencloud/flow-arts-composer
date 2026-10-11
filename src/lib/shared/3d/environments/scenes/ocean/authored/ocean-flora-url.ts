import { R2_CDN } from "#lib/shared/3d/constants/r2-origin.js";

export type OceanFloraVariant = "authored" | "composed";

/**
 * `?flora=composed` swaps in the generated composition
 * (scripts/generate-ocean-composition.py -> blender-export-ocean-composition.py)
 * so it can be walked in the same harness, with the same camera presets, as the
 * authored reef. Dev only: the switch is how the two are judged against each
 * other, and production always ships the authored scene.
 */
export const OCEAN_FLORA_FILES: Record<OceanFloraVariant, string> = {
  authored: "ocean_flora_scene.glb",
  composed: "ocean_composed_scene.glb",
};

export function isOceanFloraVariant(
  value: string | null
): value is OceanFloraVariant {
  return value !== null && value in OCEAN_FLORA_FILES;
}

/**
 * Where the reef geometry actually comes from. The flora scene is the bulk of
 * the ocean's boot download, and it is a large-asset exception: production
 * serves it from R2 rather than the Pages deploy, the same way the forest scene
 * does. Anything that fetches it — the renderer and the prefetcher alike — has
 * to agree on that, so the dev/production split lives here rather than at each
 * call site.
 *
 * The variant argument is honoured in dev only, matching where the switch is
 * offered.
 */
export function oceanFloraSceneUrl(
  devVariant: OceanFloraVariant = "authored"
): string {
  return import.meta.env.DEV
    ? `/models/ocean/${OCEAN_FLORA_FILES[devVariant]}`
    : `${R2_CDN}/models/ocean/${OCEAN_FLORA_FILES.authored}`;
}
