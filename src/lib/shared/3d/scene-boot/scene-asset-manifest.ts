import { BackgroundType } from "@austencloud/backgrounds";

import { oceanFloraSceneUrl } from "../environments/scenes/ocean/authored/ocean-flora-url";
import { AUTUMN_MOON_TEXTURE_URL } from "../environments/scenes/autumn/runtime/lighting/autumn-moon";
import { CELESTIAL_SHELL_URL } from "../environments/worlds/celestial/celestial-shell-url";

/**
 * What each 3D environment downloads before its loading curtain can lift, so
 * those assets can be warmed into the HTTP cache before the user clicks into 3D.
 *
 * Only URLs the scene's own components load at runtime belong here, and only
 * the ones the curtain actually waits on. Four neighbours deliberately do not:
 *
 * - `*-composer-plugin.ts` catalogs, which exist for the Scene Lab and Themes
 *   Lab authoring surfaces and are never mounted by the viewer.
 * - `scenes/winter/graybox/`, a review model reachable only from a test route.
 * - The ocean fish pack (`/models/ocean/pack/*.glb`, named as bare filenames in
 *   `fish-species.ts` and fetched by FishBoids). It reports into no scene
 *   feature, so it streams in after the reveal — warming it would compete for
 *   bandwidth with the models the curtain is waiting on.
 * - `?flora=composed`, a dev-only comparison build of the reef.
 *
 * The ocean's flora scene is the one asset not written literally below. It is
 * the bulk of that scene's boot download and it blocks the curtain, but its URL
 * is environment-dependent, so `sceneAssetUrls` appends it from the owner that
 * the renderer reads too.
 *
 * `tests/unit/scene-boot/scene-asset-manifest-contract.test.ts` reads the scene
 * sources and fails when this list drifts from them in either direction.
 */
export const SCENE_ASSET_MANIFEST: Readonly<
  Record<BackgroundType, readonly string[]>
> = {
  [BackgroundType.AUTUMN]: ["/models/autumn/autumn-environment.glb"],
  [BackgroundType.BLOSSOM]: ["/models/blossom/blossom_environment.glb"],
  // The same constant the scene loads, `?v=` tag included, so the warmed
  // cache entry is the one the scene asks for.
  [BackgroundType.CELESTIAL]: [CELESTIAL_SHELL_URL],
  // `cosmic-stage.glb` (5 MB) is not listed: only CosmicStage.svelte names
  // it, and nothing mounts that component (2026-11-14).
  [BackgroundType.COSMIC]: ["/models/cosmic/moon-outpost.glb"],
  [BackgroundType.EMBER]: [
    "/models/ember/ember-production-slice.glb",
    "/models/camping/tree-log.glb",
    "/models/camping/tree-log-small.glb",
    "/models/camping/campfire-pit.glb",
  ],
  [BackgroundType.FOREST]: [
    "/models/forest/forest-environment.glb",
    "/models/forest/forest-near-frame.glb",
    "/models/forest/forest-campsite.glb",
    "/models/forest/forest-stage.glb",
  ],
  [BackgroundType.OCEAN]: ["/models/ocean/ocean-environment.glb"],
  [BackgroundType.PRIDE]: ["/models/rainbow/spectrum-commons.glb"],
  [BackgroundType.VOID]: [],
  [BackgroundType.WINTER]: ["/models/winter/blue-hour-lodge.glb"],
};

/**
 * Runtime textures that should already be in the HTTP cache when a scene
 * starts. They live outside the GLB manifest because the static contract above
 * intentionally scans model ownership only.
 */
const SCENE_TEXTURE_PREFETCH: Partial<
  Readonly<Record<BackgroundType, readonly string[]>>
> = {
  [BackgroundType.AUTUMN]: [
    "/textures/autumn-floor/ground-detail-modulation.ktx2",
    "/textures/water/Water_1_M_Normal.jpg",
    "/textures/water/Water_2_M_Normal.jpg",
    AUTUMN_MOON_TEXTURE_URL,
  ],
};

/**
 * The compressed-texture and geometry decoders every GLB path shares. They are
 * small, cached once, and needed before the first byte of a model can be
 * decoded, so they are worth warming regardless of which scene is selected.
 */
export const DECODER_RUNTIME_URLS: readonly string[] = [
  "/draco/draco_wasm_wrapper.js",
  "/draco/draco_decoder.wasm",
  "/basis/basis_transcoder.js",
  "/basis/basis_transcoder.wasm",
];

export function sceneAssetUrls(background: BackgroundType): readonly string[] {
  const listed = SCENE_ASSET_MANIFEST[background] ?? [];
  const textures = SCENE_TEXTURE_PREFETCH[background] ?? [];
  if (background !== BackgroundType.OCEAN) return [...listed, ...textures];
  return [...listed, ...textures, oceanFloraSceneUrl()];
}
