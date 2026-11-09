import { BackgroundType } from "@austencloud/backgrounds";
import {
  getStageCoordinateFrame,
  stageCoordinateFrameForSurface,
  type StageCoordinateFrame,
} from "../domain/stage-coordinate-frame";
import {
  EnvironmentManifestError,
  parseEnvironmentManifest,
  type EnvironmentDef,
  type SceneId,
} from "./environment-manifest";

/**
 * Every GLB environment the app can show, read from the `scene.json` beside
 * each model folder. The manifests are bundled at build time (they are a few
 * hundred bytes each), so looking a scene up never waits on the network.
 *
 * Parsing runs when this module is first evaluated: a manifest with a missing
 * field or an unshippable licence fails loudly in dev, in prerender, and in
 * `environment-registry.test.ts`, rather than reaching a viewer.
 */
const MANIFEST_FILES = import.meta.glob<unknown>(
  "/static/models/*/scene.json",
  {
    eager: true,
    import: "default",
  }
);

export function buildEnvironmentRegistry(
  files: Readonly<Record<string, unknown>>
): Readonly<Record<SceneId, EnvironmentDef>> {
  const registry: Record<SceneId, EnvironmentDef> = {};
  for (const [file, raw] of Object.entries(files)) {
    const def = parseEnvironmentManifest(raw, file);
    const folder = file.split("/").at(-2);
    if (folder !== def.id) {
      throw new EnvironmentManifestError(
        file,
        `"id" must match its folder name "${folder}"`
      );
    }
    if (registry[def.id]) {
      throw new EnvironmentManifestError(file, `duplicate id "${def.id}"`);
    }
    registry[def.id] = def;
  }
  return Object.freeze(registry);
}

export const ENVIRONMENTS = buildEnvironmentRegistry(MANIFEST_FILES);

const BACKGROUND_TYPES = new Set<string>(Object.values(BackgroundType));

export function isBackgroundType(key: string): key is BackgroundType {
  return BACKGROUND_TYPES.has(key);
}

/**
 * The registered scene for a scene key, if one exists. A registry id equal to
 * a `BackgroundType` value takes that type over from the legacy switch, which
 * is how Ocean migrated without a change to the external enum.
 */
export function getRegisteredEnvironment(
  key: string | null | undefined
): EnvironmentDef | null {
  if (!key) return null;
  return Object.hasOwn(ENVIRONMENTS, key) ? (ENVIRONMENTS[key] ?? null) : null;
}

export function requireRegisteredEnvironment(id: SceneId): EnvironmentDef {
  const def = getRegisteredEnvironment(id);
  if (!def) throw new Error(`No scene.json registers environment "${id}"`);
  return def;
}

/**
 * Where the environment sits relative to the performers. Legacy types keep
 * their authored values in `stage-coordinate-frame.ts`, which the worker
 * renderer shares; registry-only scenes declare theirs in `stageSurface`.
 */
export function getEnvironmentFrame(
  key: string,
  stageEnabled: boolean
): StageCoordinateFrame {
  if (isBackgroundType(key)) return getStageCoordinateFrame(key, stageEnabled);
  const def = getRegisteredEnvironment(key);
  if (!def) return stageCoordinateFrameForSurface(0);
  return stageCoordinateFrameForSurface(
    stageEnabled ? def.stageSurface.withStage : def.stageSurface.withoutStage
  );
}
