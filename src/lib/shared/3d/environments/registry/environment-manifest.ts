/**
 * The schema of `static/models/<scene>/scene.json`: the one file that makes a
 * GLB environment exist. A scene folder that carries this manifest is picked
 * up by `environment-registry.ts` and rendered by `GlbEnvironment.svelte`, so
 * adding a scene needs no switch case, no new `BackgroundType` in the external
 * backgrounds package, and no loader code.
 *
 * Field names follow the closest public reference for asset manifests,
 * toxsam/open-source-3D-assets; no ratified glTF asset-licence manifest exists
 * yet (KhronosGroup/glTF #839 is still open).
 */

/** Any string id. A registry id equal to a `BackgroundType` value serves that type. */
export type SceneId = string;

/**
 * Licences a shipped scene may carry.
 *
 * - `CC0`: public domain, no conditions.
 * - `CC-BY-3.0` / `CC-BY-4.0`: allowed only with an attribution line and a
 *   source link, because the credit is the whole condition of the licence.
 * - `first-party`: built in this repository by a checked-in pipeline script.
 *   Nobody outside granted it, so it is not claimed as CC0; its `source` must
 *   name the build script, and the registry test checks that file exists.
 */
export type EnvironmentLicense =
  | "CC0"
  | "CC-BY-3.0"
  | "CC-BY-4.0"
  | "first-party";

const LICENSES: readonly EnvironmentLicense[] = [
  "CC0",
  "CC-BY-3.0",
  "CC-BY-4.0",
  "first-party",
];

export type GeometryCompression = "none" | "meshopt" | "draco";
export type TextureCompression = "none" | "ktx2";

export interface EnvironmentBounds {
  min: [number, number, number];
  max: [number, number, number];
}

/**
 * How high the surface the performer stands on sits after `offset`, with and
 * without the shared stage deck. The environment moves
 * so that surface meets the performer anchor, never the other way round.
 */
export interface EnvironmentStageSurface {
  withStage: number;
  withoutStage: number;
}

/**
 * Corrections the shared loader applies to the GLB's own materials, for bakes
 * whose look depends on settings glTF does not carry. Each is applied to a
 * clone, never to the cached GLB, so two scenes or a scene runtime reading the
 * same file never see each other's changes.
 */
export interface EnvironmentMaterialOptions {
  /** Read the mesh's COLOR_0. glTF imports a vertex-coloured bake with this off. */
  vertexColors?: boolean;
  /** Linear RGB multiplied into each base colour: an exposure correction. */
  tint?: [number, number, number];
  /**
   * Gives each material its own copy of the scene's `environmentMap` at this
   * strength, for a diffuse surface that should read the room as faint bounce
   * rather than at the full strength the scene-wide map lights everything else.
   */
  envMapIntensity?: number;
}

const MATERIAL_KEYS = ["vertexColors", "tint", "envMapIntensity"] as const;

export interface EnvironmentDef {
  id: SceneId;
  label: string;
  /** The scenery that stays on screen while the scene runs. */
  glbUrl: string;
  license: EnvironmentLicense;
  attribution: string | null;
  /** Where the asset came from: a URL for third-party work, a script path for first-party. */
  source: string;
  thumbnailUrl: string | null;
  bounds: EnvironmentBounds | null;
  /**
   * Moves the GLB's root, in metres, so the spot meant for the performers sits
   * at the scene origin. A model baked in absolute route coordinates (the
   * trench floor) needs this; most scenes leave it at zero.
   */
  offset: [number, number, number];
  compression: { geometry: GeometryCompression; texture: TextureCompression };
  /** The loading curtain waits on this scene's download. */
  requiresAsyncLoad: boolean;
  /** Scene-feature slot whose progress and readiness this download reports into. */
  featureKey: string;
  /**
   * Share of the reported progress the main GLB stands for. A scene runtime
   * that streams a second asset (the ocean's reef) folds its own fraction into
   * the remainder, so the loading bar covers both and never bounces.
   */
  glbProgressWeight: number;
  fog: { color: string; density: number } | null;
  /** Clear colour behind the scenery when the scene owns no sky of its own. */
  background: string | null;
  /** `room` lights PBR materials with the shared prefiltered RoomEnvironment. */
  environmentMap: "room" | null;
  stageSurface: EnvironmentStageSurface;
  /** Material corrections for the GLB; null leaves the bake as exported. */
  materials: EnvironmentMaterialOptions | null;
  /**
   * Names a scene-owned runtime in `environment-runtimes.ts` for scenes whose
   * water, creatures or instanced flora are genuinely dynamic. Without one the
   * shared loader renders the GLB alone.
   */
  runtime: string | null;
}

export class EnvironmentManifestError extends Error {
  constructor(source: string, problem: string) {
    super(`${source}: ${problem}`);
    this.name = "EnvironmentManifestError";
  }
}

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVector3(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

/**
 * Checks one manifest and returns it with every optional field resolved.
 * Throws on anything a viewer could not load or a release could not ship,
 * including a licence outside `EnvironmentLicense`.
 */
export function parseEnvironmentManifest(
  raw: unknown,
  source: string
): EnvironmentDef {
  const fail = (problem: string): never => {
    throw new EnvironmentManifestError(source, problem);
  };
  if (!isRecord(raw)) return fail("manifest must be a JSON object");

  const text = (key: string): string => {
    const value = raw[key];
    if (typeof value !== "string" || value.trim() === "") {
      return fail(`"${key}" must be a non-empty string`);
    }
    return value;
  };
  const optionalText = (key: string): string | null => {
    const value = raw[key];
    if (value === undefined || value === null) return null;
    if (typeof value !== "string" || value.trim() === "") {
      return fail(`"${key}" must be a non-empty string when present`);
    }
    return value;
  };

  const id = text("id");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    fail(`"id" must be lowercase letters, digits and dashes`);
  }

  const glbUrl = text("glbUrl");
  if (!/^\/models\/[A-Za-z0-9_./-]+\.glb$/.test(glbUrl)) {
    fail(`"glbUrl" must be a /models/…/*.glb path served from static/`);
  }

  const license = text("license");
  if (!LICENSES.includes(license as EnvironmentLicense)) {
    fail(
      `licence "${license}" is not shippable; use one of ${LICENSES.join(", ")}`
    );
  }
  const attribution = optionalText("attribution");
  const assetSource = text("source");
  if (license.startsWith("CC-BY")) {
    if (!attribution) fail(`${license} needs an "attribution" line`);
    if (!/^https?:\/\//.test(assetSource)) {
      fail(`${license} needs "source" to link the original work`);
    }
  }
  if (license === "first-party" && !/^scripts\/[^\s]+$/.test(assetSource)) {
    fail(`first-party "source" must name the build script under scripts/`);
  }

  let bounds: EnvironmentBounds | null = null;
  if (raw.bounds !== undefined) {
    const b = raw.bounds;
    if (!isRecord(b) || !isVector3(b.min) || !isVector3(b.max)) {
      return fail(`"bounds" needs numeric [x, y, z] "min" and "max"`);
    }
    bounds = { min: b.min, max: b.max };
  }

  const offset = raw.offset ?? [0, 0, 0];
  if (!isVector3(offset)) return fail(`"offset" must be numeric [x, y, z]`);

  const compressionRaw = raw.compression ?? {};
  if (!isRecord(compressionRaw)) fail(`"compression" must be an object`);
  const geometry = (compressionRaw as Raw).geometry ?? "none";
  const texture = (compressionRaw as Raw).texture ?? "none";
  if (!["none", "meshopt", "draco"].includes(geometry as string)) {
    fail(`"compression.geometry" must be none, meshopt or draco`);
  }
  if (!["none", "ktx2"].includes(texture as string)) {
    fail(`"compression.texture" must be none or ktx2`);
  }

  const requiresAsyncLoad = raw.requiresAsyncLoad ?? true;
  if (typeof requiresAsyncLoad !== "boolean") {
    fail(`"requiresAsyncLoad" must be true or false`);
  }

  const glbProgressWeight = raw.glbProgressWeight ?? 1;
  if (
    typeof glbProgressWeight !== "number" ||
    !(glbProgressWeight > 0 && glbProgressWeight <= 1)
  ) {
    fail(`"glbProgressWeight" must be a number in (0, 1]`);
  }

  let fog: EnvironmentDef["fog"] = null;
  if (raw.fog !== undefined && raw.fog !== null) {
    const f = raw.fog;
    if (
      !isRecord(f) ||
      typeof f.color !== "string" ||
      typeof f.density !== "number" ||
      !(f.density >= 0)
    ) {
      return fail(`"fog" needs a "color" string and a non-negative "density"`);
    }
    fog = { color: f.color, density: f.density };
  }

  const environmentMap = raw.environmentMap ?? null;
  if (environmentMap !== null && environmentMap !== "room") {
    fail(`"environmentMap" must be "room" when present`);
  }

  const surfaceRaw = raw.stageSurface ?? { withStage: 0, withoutStage: 0 };
  if (
    !isRecord(surfaceRaw) ||
    typeof surfaceRaw.withStage !== "number" ||
    typeof surfaceRaw.withoutStage !== "number"
  ) {
    return fail(`"stageSurface" needs numeric "withStage" and "withoutStage"`);
  }

  const materials = parseMaterialOptions(raw.materials, fail);
  if (materials?.envMapIntensity !== undefined && environmentMap === null) {
    fail(`"materials.envMapIntensity" needs an "environmentMap" to scale`);
  }

  return {
    id,
    label: text("label"),
    glbUrl,
    license: license as EnvironmentLicense,
    attribution,
    source: assetSource,
    thumbnailUrl: optionalText("thumbnailUrl"),
    bounds,
    offset,
    compression: {
      geometry: geometry as GeometryCompression,
      texture: texture as TextureCompression,
    },
    requiresAsyncLoad: requiresAsyncLoad as boolean,
    featureKey: optionalText("featureKey") ?? "environment",
    glbProgressWeight: glbProgressWeight as number,
    fog,
    background: optionalText("background"),
    environmentMap: environmentMap as EnvironmentDef["environmentMap"],
    stageSurface: {
      withStage: surfaceRaw.withStage,
      withoutStage: surfaceRaw.withoutStage,
    },
    materials,
    runtime: optionalText("runtime"),
  };
}

function parseMaterialOptions(
  value: unknown,
  fail: (problem: string) => never
): EnvironmentMaterialOptions | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) return fail(`"materials" must be an object`);
  const unknown = Object.keys(value).filter(
    (key) => !(MATERIAL_KEYS as readonly string[]).includes(key)
  );
  if (unknown.length > 0) {
    fail(
      `"materials" does not know ${unknown.map((k) => `"${k}"`).join(", ")}; use ${MATERIAL_KEYS.join(", ")}`
    );
  }
  const options: EnvironmentMaterialOptions = {};
  if (value.vertexColors !== undefined) {
    if (typeof value.vertexColors !== "boolean") {
      fail(`"materials.vertexColors" must be true or false`);
    }
    options.vertexColors = value.vertexColors as boolean;
  }
  if (value.tint !== undefined) {
    if (!isVector3(value.tint) || value.tint.some((n) => n < 0)) {
      fail(`"materials.tint" must be non-negative linear [r, g, b]`);
    }
    options.tint = [...(value.tint as [number, number, number])];
  }
  if (value.envMapIntensity !== undefined) {
    const intensity = value.envMapIntensity;
    if (
      typeof intensity !== "number" ||
      !Number.isFinite(intensity) ||
      intensity < 0
    ) {
      fail(`"materials.envMapIntensity" must be a non-negative number`);
    }
    options.envMapIntensity = intensity as number;
  }
  return Object.keys(options).length > 0 ? options : null;
}

/**
 * What the loading curtain shows for a registered scene. The main GLB is a
 * single step (useGltf reports no byte progress); a runtime's companion asset
 * reports a real fraction into the rest. Ready waits for both.
 */
export function foldEnvironmentProgress(
  environment: Pick<EnvironmentDef, "glbProgressWeight">,
  glbLoaded: boolean,
  companion: { fraction: number; ready: boolean } | null
): { fraction: number; ready: boolean } {
  const glb = glbLoaded ? 1 : 0;
  if (!companion) return { fraction: glb, ready: glbLoaded };
  const weight = environment.glbProgressWeight;
  return {
    fraction: glb * weight + companion.fraction * (1 - weight),
    ready: glbLoaded && companion.ready,
  };
}
