import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultAutumnConfig } from "#lib/shared/3d/environments/domain/models/scene-configs/autumn-scene-config.js";
import { loadSceneLabState } from "#lib/features/lab/tabs/scene-lab/services/scene-lab-persistence.js";

const CONFIG_KEYS = [
  "winter",
  "forest",
  "autumn",
  "cosmicNight",
  "cosmicAurora",
  "ocean",
  "ember",
  "blossom",
  "celestial",
  "rainbow",
  "void",
] as const;

let stored: string | null;

beforeEach(() => {
  stored = null;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => stored,
      setItem: (_key: string, value: string) => (stored = value),
      removeItem: () => (stored = null),
    },
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage");
  vi.restoreAllMocks();
});

function persisted(version: number): Record<string, unknown> {
  return {
    version,
    sceneId: "autumn",
    cosmicVariant: "night",
    configs: Object.fromEntries(CONFIG_KEYS.map((key) => [key, {}])),
  };
}

describe("Autumn Scene Lab persistence", () => {
  it("validates and normalizes the current persisted Autumn controls", () => {
    const raw = persisted(3);
    (raw.configs as Record<string, unknown>).autumn = {
      stars: { countScale: 99 },
      magicIntensity: -4,
    };
    stored = JSON.stringify(raw);

    const loaded = loadSceneLabState();

    expect(loaded?.configs.autumn.stars.countScale).toBe(1.5);
    expect(loaded?.configs.autumn.magicIntensity).toBe(0);
  });

  it("resets the removed v2 procedural Autumn shape", () => {
    const raw = persisted(2);
    (raw.configs as Record<string, unknown>).autumn = {
      treeDensity: 0.9,
    };
    stored = JSON.stringify(raw);

    expect(loadSceneLabState()?.configs.autumn).toEqual(
      createDefaultAutumnConfig()
    );
  });

  it("migrates validated v1 aliases and the legacy aurora scene", () => {
    const raw = persisted(1);
    raw.sceneId = "cosmic-aurora";
    const configs = raw.configs as Record<string, unknown>;
    configs.forestFirefly = {};
    configs.cosmic = {};
    configs.oceanReef = {};
    configs.cherryBlossom = {};
    configs.pureBlack = {};
    delete configs.forest;
    delete configs.cosmicNight;
    delete configs.cosmicAurora;
    delete configs.ocean;
    delete configs.blossom;
    delete configs.void;
    stored = JSON.stringify(raw);

    const loaded = loadSceneLabState();

    expect(loaded?.sceneId).toBe("cosmic");
    expect(loaded?.cosmicVariant).toBe("aurora");
    expect(loaded?.configs.autumn).toEqual(createDefaultAutumnConfig());
  });

  it("rejects malformed v1 scene ids and config values", () => {
    const invalidScene = persisted(1);
    invalidScene.sceneId = "deleted-scene";
    stored = JSON.stringify(invalidScene);
    expect(loadSceneLabState()).toBeNull();

    const invalidConfig = persisted(1);
    (invalidConfig.configs as Record<string, unknown>).winter = "not-a-config";
    stored = JSON.stringify(invalidConfig);
    expect(loadSceneLabState()).toBeNull();
  });

  it("rejects an invalid top-level scene id", () => {
    const raw = persisted(3);
    raw.sceneId = "deleted-scene";
    stored = JSON.stringify(raw);

    expect(loadSceneLabState()).toBeNull();
  });

  it("reports malformed storage instead of swallowing it silently", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    stored = "{definitely-not-json";

    expect(loadSceneLabState()).toBeNull();
    expect(warning).toHaveBeenCalledWith(
      "Failed to load scene lab state:",
      expect.any(SyntaxError)
    );
  });
});
