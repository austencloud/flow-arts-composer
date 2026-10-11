import type { SceneId } from "../domain/scene-lab-types";
import {
  createDefaultAutumnConfig,
  normalizeAutumnConfig,
  type AutumnSceneConfig,
} from "#lib/shared/3d/environments/domain/models/scene-configs/autumn-scene-config.js";
import type { BlossomSceneConfig } from "#lib/shared/3d/environments/domain/models/scene-configs/blossom-scene-config.js";
import type { CelestialSceneConfig } from "#lib/shared/3d/environments/domain/models/scene-configs/celestial-scene-config.js";
import type { CosmicSceneConfig } from "#lib/shared/3d/environments/domain/models/scene-configs/cosmic-scene-config.js";
import type { EmberSceneConfig } from "#lib/shared/3d/environments/domain/models/scene-configs/ember-scene-config.js";
import type { ForestSceneConfig } from "#lib/shared/3d/environments/domain/models/scene-configs/forest-scene-config.js";
import type { OceanSceneConfig } from "#lib/shared/3d/environments/domain/models/scene-configs/ocean-scene-config.js";
import type { RainbowSceneConfig } from "#lib/shared/3d/environments/domain/models/scene-configs/rainbow-scene-config.js";
import type { VoidSceneConfig } from "#lib/shared/3d/environments/domain/models/scene-configs/void-scene-config.js";
import type { WinterSceneConfig } from "#lib/shared/3d/environments/domain/models/scene-configs/winter-scene-config.js";

const STORAGE_KEY = "scene-lab-state";
const CURRENT_VERSION = 3;
const SCENE_IDS = new Set<SceneId>([
  "winter",
  "forest",
  "autumn",
  "cosmic",
  "ocean",
  "ember",
  "blossom",
  "rainbow",
  "celestial",
  "void",
]);

export interface PersistedSceneLabConfigs {
  winter: WinterSceneConfig;
  forest: ForestSceneConfig;
  autumn: AutumnSceneConfig;
  cosmicNight: CosmicSceneConfig;
  cosmicAurora: CosmicSceneConfig;
  ocean: OceanSceneConfig;
  ember: EmberSceneConfig;
  blossom: BlossomSceneConfig;
  celestial: CelestialSceneConfig;
  rainbow: RainbowSceneConfig;
  void: VoidSceneConfig;
}

export type CosmicVariant = "night" | "aurora";

export interface PersistedSceneLabState {
  version: number;
  sceneId: SceneId;
  cosmicVariant: CosmicVariant;
  configs: PersistedSceneLabConfigs;
}

const SCENE_ID_MIGRATION: Record<string, SceneId> = {
  "forest-firefly": "forest",
  "forest-autumn": "autumn",
  "cosmic-night": "cosmic",
  "cosmic-aurora": "cosmic",
  "ocean-abyss": "ocean",
  "ocean-reef": "ocean",
  "ocean-mystical": "ocean",
  "ocean-cinematic": "ocean",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSceneId(value: unknown): value is SceneId {
  return typeof value === "string" && SCENE_IDS.has(value as SceneId);
}

function isCosmicVariant(value: unknown): value is CosmicVariant {
  return value === "night" || value === "aurora";
}

function readConfig<T>(
  configs: Record<string, unknown>,
  key: string
): T | null {
  const value = configs[key];
  return isRecord(value) ? (value as T) : null;
}

function readFirstConfig<T>(
  configs: Record<string, unknown>,
  keys: readonly string[]
): T | null {
  for (const key of keys) {
    const config = readConfig<T>(configs, key);
    if (config) return config;
  }
  return null;
}

function parseCurrentConfigs(
  raw: Record<string, unknown>,
  resetAutumn: boolean
): PersistedSceneLabConfigs | null {
  const winter = readConfig<WinterSceneConfig>(raw, "winter");
  const forest = readConfig<ForestSceneConfig>(raw, "forest");
  const cosmicNight = readConfig<CosmicSceneConfig>(raw, "cosmicNight");
  const cosmicAurora = readConfig<CosmicSceneConfig>(raw, "cosmicAurora");
  const ocean = readConfig<OceanSceneConfig>(raw, "ocean");
  const ember = readConfig<EmberSceneConfig>(raw, "ember");
  const blossom = readConfig<BlossomSceneConfig>(raw, "blossom");
  const celestial = readConfig<CelestialSceneConfig>(raw, "celestial");
  const rainbow = readConfig<RainbowSceneConfig>(raw, "rainbow");
  const voidConfig = readConfig<VoidSceneConfig>(raw, "void");
  if (
    !winter ||
    !forest ||
    !cosmicNight ||
    !cosmicAurora ||
    !ocean ||
    !ember ||
    !blossom ||
    !celestial ||
    !rainbow ||
    !voidConfig
  ) {
    return null;
  }

  return {
    winter,
    forest,
    autumn: resetAutumn
      ? createDefaultAutumnConfig()
      : normalizeAutumnConfig(raw.autumn),
    cosmicNight,
    cosmicAurora,
    ocean,
    ember,
    blossom,
    celestial,
    rainbow,
    void: voidConfig,
  };
}

function parseCurrentState(
  raw: Record<string, unknown>,
  resetAutumn = false
): PersistedSceneLabState | null {
  if (!isSceneId(raw.sceneId) || !isCosmicVariant(raw.cosmicVariant)) {
    return null;
  }
  const configs = isRecord(raw.configs)
    ? parseCurrentConfigs(raw.configs, resetAutumn)
    : null;
  if (!configs) return null;
  return {
    version: CURRENT_VERSION,
    sceneId: raw.sceneId,
    cosmicVariant: raw.cosmicVariant,
    configs,
  };
}

function migrateV1(
  raw: Record<string, unknown>
): PersistedSceneLabState | null {
  if (typeof raw.sceneId !== "string" || !isRecord(raw.configs)) return null;

  const oldSceneId = raw.sceneId;
  const migratedSceneId = SCENE_ID_MIGRATION[oldSceneId] ?? oldSceneId;
  if (!isSceneId(migratedSceneId)) return null;

  const configs = raw.configs;
  const winter = readConfig<WinterSceneConfig>(configs, "winter");
  const forest = readFirstConfig<ForestSceneConfig>(configs, [
    "forestFirefly",
    "forest",
  ]);
  const cosmicNight = readFirstConfig<CosmicSceneConfig>(configs, [
    "cosmicNight",
    "cosmic",
  ]);
  const cosmicAurora = readFirstConfig<CosmicSceneConfig>(configs, [
    "cosmicAurora",
    "cosmic",
  ]);
  const ocean = readFirstConfig<OceanSceneConfig>(configs, [
    "oceanReef",
    "ocean",
  ]);
  const ember = readConfig<EmberSceneConfig>(configs, "ember");
  const blossom = readFirstConfig<BlossomSceneConfig>(configs, [
    "blossom",
    "cherryBlossom",
  ]);
  const celestial = readConfig<CelestialSceneConfig>(configs, "celestial");
  const rainbow = readConfig<RainbowSceneConfig>(configs, "rainbow");
  const voidConfig = readFirstConfig<VoidSceneConfig>(configs, [
    "void",
    "pureBlack",
  ]);
  if (
    !winter ||
    !forest ||
    !cosmicNight ||
    !cosmicAurora ||
    !ocean ||
    !ember ||
    !blossom ||
    !celestial ||
    !rainbow ||
    !voidConfig
  ) {
    return null;
  }

  let cosmicVariant: CosmicVariant = "night";
  if (oldSceneId === "cosmic-aurora") cosmicVariant = "aurora";

  return {
    version: CURRENT_VERSION,
    sceneId: migratedSceneId,
    cosmicVariant,
    configs: {
      winter,
      forest,
      autumn: createDefaultAutumnConfig(),
      cosmicNight,
      cosmicAurora,
      ocean,
      ember,
      blossom,
      celestial,
      rainbow,
      void: voidConfig,
    },
  };
}

export function saveSceneLabState(data: PersistedSceneLabState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("Failed to save scene lab state:", e);
  }
}

export function loadSceneLabState(): PersistedSceneLabState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;

    if (parsed.version === CURRENT_VERSION) return parseCurrentState(parsed);
    if (parsed.version === 2) return parseCurrentState(parsed, true);
    if (parsed.version === 1) return migrateV1(parsed);

    return null;
  } catch (error) {
    console.warn("Failed to load scene lab state:", error);
    return null;
  }
}

export function clearSceneLabState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to clear scene lab state:", error);
  }
}
