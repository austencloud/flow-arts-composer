import { describe, it, expect, vi } from "vitest";
import {
  TunnelSnapshotSchema,
  SNAPSHOT_VERSION,
  migrateTunnelSnapshot,
} from "../tunnel-snapshot";
import {
  captureTunnelSnapshot,
  applyTunnelSnapshot,
  type SnapshotDeps,
  type TunnelSnapshot,
} from "../tunnel-snapshot";
import { DEFAULT_CONFIG } from "../tunnel-config";

const validSnapshot = {
  version: SNAPSHOT_VERSION,
  tunnel: {
    config: DEFAULT_CONFIG,
    gridVisible: false,
    colors: {
      mode: "custom",
      custom: { left: "#123456", right: "#abcdef" },
    },
    section: "tunnel",
    presetRecipe: null,
  },
  effects: { activeEffect: "none" },
  effort: "linear",
  paths: {
    pathShape: "arc",
    motionAwarePaths: false,
    leftPathLines: false,
    rightPathLines: false,
  },
  playback: { bpm: 60, playbackMode: "continuous" },
  props: { leftPropType: "staff", rightPropType: "staff" },
  trailRender: { mode: "trail" },
};

describe("TunnelSnapshotSchema", () => {
  it("retains performer colors when a saved or shared snapshot is validated", () => {
    const raw = structuredClone(validSnapshot);
    Object.assign(raw.tunnel.colors, {
      performers: {
        alice: {
          mode: "hue",
          hue: 240,
          saturation: 100,
          leftLightness: 75,
          rightLightness: 25,
        },
      },
    });
    const parsed = TunnelSnapshotSchema.parse(raw);
    expect(parsed.tunnel.colors.performers?.alice?.hue).toBe(240);
    expect(
      TunnelSnapshotSchema.parse(JSON.parse(JSON.stringify(parsed)))
    ).toEqual(parsed);
  });
  it("accepts a well-formed snapshot", () => {
    expect(TunnelSnapshotSchema.safeParse(validSnapshot).success).toBe(true);
  });

  it("normalizes saved palette-keyed snapshots before validation", () => {
    const legacySnapshot = {
      ...validSnapshot,
      version: 2,
      tunnel: {
        ...validSnapshot.tunnel,
        colors: {
          mode: "custom",
          custom: { blue: "#123456", red: "#abcdef" },
        },
      },
      paths: {
        pathShape: "arc",
        motionAwarePaths: false,
        bluePathLines: true,
        redPathLines: false,
      },
      props: {
        bluePropType: "poi",
        redPropType: "fan",
        blueBuugengFlipped: true,
        redBuugengFlipped: false,
      },
      trailRender: {
        ...validSnapshot.trailRender,
        blueColor: "#112233",
        redColor: "#445566",
        additionalLayerColors: [{ blue: "#778899", red: "#aabbcc" }],
      },
    };

    const parsed = TunnelSnapshotSchema.safeParse(legacySnapshot);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.tunnel.colors.custom).toEqual({
      left: "#123456",
      right: "#abcdef",
    });
    expect(parsed.data.paths).toMatchObject({
      leftPathLines: true,
      rightPathLines: false,
    });
    expect(parsed.data.props).toEqual({
      leftPropType: "poi",
      rightPropType: "fan",
      leftBuugengFlipped: true,
      rightBuugengFlipped: false,
    });
    expect(parsed.data.trailRender).toMatchObject({
      leftColor: "#112233",
      rightColor: "#445566",
      additionalLayerColors: [{ left: "#778899", right: "#aabbcc" }],
    });
  });

  it("rejects a snapshot missing the tunnel block", () => {
    const { tunnel: _drop, ...rest } = validSnapshot;
    expect(TunnelSnapshotSchema.safeParse(rest).success).toBe(false);
  });
  it("rejects a bad section value", () => {
    const bad = {
      ...validSnapshot,
      tunnel: { ...validSnapshot.tunnel, section: "bogus" },
    };
    expect(TunnelSnapshotSchema.safeParse(bad).success).toBe(false);
  });
});

function fakeDeps(): SnapshotDeps {
  return {
    controller: {
      config: { ...DEFAULT_CONFIG, fold: 4 },
      gridVisible: true,
      colors: {
        mode: "custom",
        custom: { left: "#123456", right: "#abcdef" },
      },
      section: "effects",
      presetRecipe: null,
      applyConfig() {},
    } as unknown as SnapshotDeps["controller"],
    effects: {
      config: { activeEffect: "fire", tag: "E" },
      replace() {},
    } as unknown as SnapshotDeps["effects"],
    visibility: {
      getEffortPreset: () => "punch",
      getPathShape: () => "concave",
      getMotionAwarePaths: () => true,
      getVisibility: (k: string) => k === "leftPathLines",
      setEffortPreset() {},
      setPathShape() {},
      setMotionAwarePaths() {},
      setVisibility() {},
    } as unknown as SnapshotDeps["visibility"],
    settings: {
      leftPropType: "fan",
      rightPropType: "club",
      leftBuugengFlipped: true,
      rightBuugengFlipped: false,
      updateSettings() {},
    } as unknown as SnapshotDeps["settings"],
    animationSettings: {
      trail: { mode: "trail", tag: "T" },
      updateSettings() {},
    } as unknown as SnapshotDeps["animationSettings"],
    playback: {
      handleBpmChange() {},
      handlePlaybackModeChange() {},
    } as unknown as SnapshotDeps["playback"],
    animationPanel: {
      playbackMode: "step",
    } as unknown as SnapshotDeps["animationPanel"],
    getBpm: () => 144,
  };
}

describe("captureTunnelSnapshot", () => {
  it("reads every store into the flat blob", () => {
    const snap = captureTunnelSnapshot(fakeDeps());
    expect(snap.version).toBe(SNAPSHOT_VERSION);
    // Coverage guard (spec §7): every enumerated top-level field is present, so a
    // future store added to the app can't be silently dropped from the snapshot.
    expect(Object.keys(snap).sort()).toEqual([
      "effects",
      "effort",
      "paths",
      "playback",
      "props",
      "trailRender",
      "tunnel",
      "version",
    ]);
    expect(snap.tunnel).toEqual({
      config: { ...DEFAULT_CONFIG, fold: 4 },
      gridVisible: true,
      colors: {
        mode: "custom",
        custom: { left: "#123456", right: "#abcdef" },
      },
      section: "effects",
      presetRecipe: null,
    });
    expect(snap.effort).toBe("punch");
    expect(snap.paths).toEqual({
      pathShape: "concave",
      motionAwarePaths: true,
      leftPathLines: true,
      rightPathLines: false,
    });
    expect(snap.playback).toEqual({ bpm: 144, playbackMode: "step" });
    expect(snap.props).toEqual({
      leftPropType: "fan",
      rightPropType: "club",
      leftBuugengFlipped: true,
      rightBuugengFlipped: false,
    });
  });

  it("deep-clones effects + trailRender (no shared reference to the live store)", () => {
    const deps = fakeDeps();
    const snap = captureTunnelSnapshot(deps);
    expect(snap.effects).toEqual(deps.effects.config);
    expect(snap.effects).not.toBe(deps.effects.config);
    expect(snap.trailRender).toEqual(deps.animationSettings.trail);
    expect(snap.trailRender).not.toBe(deps.animationSettings.trail);
  });

  it("passes the schema it produces", () => {
    expect(
      TunnelSnapshotSchema.safeParse(captureTunnelSnapshot(fakeDeps())).success
    ).toBe(true);
  });
});

describe("applyTunnelSnapshot", () => {
  it("fans the snapshot out through the per-store setters", () => {
    const store = {
      config: { ...DEFAULT_CONFIG },
      gridVisible: false,
      colors: {
        mode: "hands" as const,
        custom: { left: "#111111", right: "#eeeeee" },
      },
      section: "tunnel",
      presetRecipe: null,
      effort: "linear",
      pathShape: "arc",
      motionAware: false,
      leftLines: false,
      rightLines: false,
      leftPropType: "staff",
      rightPropType: "staff",
      leftBuugengFlipped: false,
      rightBuugengFlipped: false,
      bpm: 60,
      playbackMode: "continuous",
      effects: { activeEffect: "none" },
      trail: { mode: "none" },
    };
    const deps = {
      controller: {
        get config() {
          return store.config;
        },
        get gridVisible() {
          return store.gridVisible;
        },
        set gridVisible(v) {
          store.gridVisible = v;
        },
        get colors() {
          return store.colors;
        },
        set colors(v) {
          store.colors = v;
        },
        get section() {
          return store.section;
        },
        set section(v) {
          store.section = v;
        },
        get presetRecipe() {
          return store.presetRecipe;
        },
        set presetRecipe(v) {
          store.presetRecipe = v;
        },
        applyConfig: vi.fn((c) => {
          store.config = c;
        }),
      },
      effects: {
        get config() {
          return store.effects;
        },
        replace: vi.fn((c) => {
          store.effects = c;
        }),
      },
      visibility: {
        getEffortPreset: () => store.effort,
        setEffortPreset: vi.fn((v) => {
          store.effort = v;
        }),
        getPathShape: () => store.pathShape,
        setPathShape: vi.fn((v) => {
          store.pathShape = v;
        }),
        getMotionAwarePaths: () => store.motionAware,
        setMotionAwarePaths: vi.fn((v) => {
          store.motionAware = v;
        }),
        getVisibility: (k: string) =>
          k === "leftPathLines" ? store.leftLines : store.rightLines,
        setVisibility: vi.fn((k, v) => {
          if (k === "leftPathLines") store.leftLines = v;
          else store.rightLines = v;
        }),
      },
      settings: {
        get leftPropType() {
          return store.leftPropType;
        },
        get rightPropType() {
          return store.rightPropType;
        },
        get leftBuugengFlipped() {
          return store.leftBuugengFlipped;
        },
        get rightBuugengFlipped() {
          return store.rightBuugengFlipped;
        },
        updateSettings: vi.fn((p) => Object.assign(store, p)),
      },
      animationSettings: {
        get trail() {
          return store.trail;
        },
        updateSettings: vi.fn((p) => {
          if (p.trail) store.trail = p.trail;
        }),
      },
      playback: {
        handleBpmChange: vi.fn((b) => {
          store.bpm = b;
        }),
        handlePlaybackModeChange: vi.fn((m) => {
          store.playbackMode = m;
        }),
      },
      animationPanel: {
        get playbackMode() {
          return store.playbackMode;
        },
      },
      getBpm: () => store.bpm,
    } as unknown as SnapshotDeps;

    const target: TunnelSnapshot = {
      version: SNAPSHOT_VERSION,
      tunnel: {
        config: { ...DEFAULT_CONFIG, fold: 8 },
        gridVisible: true,
        colors: {
          mode: "custom",
          custom: { left: "#2255aa", right: "#dd7733" },
        },
        section: "effort",
        presetRecipe: null,
      },
      effects: { activeEffect: "fire" } as never,
      effort: "punch",
      paths: {
        pathShape: "concave",
        motionAwarePaths: true,
        leftPathLines: true,
        rightPathLines: false,
      },
      playback: { bpm: 120, playbackMode: "step" },
      props: {
        leftPropType: "fan",
        rightPropType: "club",
        leftBuugengFlipped: true,
        rightBuugengFlipped: false,
      },
      trailRender: { mode: "trail" } as never,
    };

    applyTunnelSnapshot(deps, target);

    expect(captureTunnelSnapshot(deps)).toEqual(target);
    expect(deps.controller.applyConfig).toHaveBeenCalledWith(
      target.tunnel.config,
      null
    );
    expect(deps.effects.replace).toHaveBeenCalledWith(target.effects);
    expect(deps.playback.handleBpmChange).toHaveBeenCalledWith(120);
  });
});

describe("migrateTunnelSnapshot", () => {
  it("keeps a legacy performed config intact and records unknown recipe provenance", () => {
    const legacy = {
      ...validSnapshot,
      version: 1,
      tunnel: { ...validSnapshot.tunnel },
    } as unknown as TunnelSnapshot;
    delete (legacy.tunnel as { presetRecipe?: unknown }).presetRecipe;

    const migrated = migrateTunnelSnapshot(legacy);

    expect(migrated.version).toBe(SNAPSHOT_VERSION);
    expect(migrated.tunnel.config).toEqual(legacy.tunnel.config);
    expect(migrated.tunnel.presetRecipe).toBeNull();
  });

  it("maps version-2 spectrum state to the version-3 color contract", () => {
    const legacy = {
      ...validSnapshot,
      version: 2,
      tunnel: {
        ...validSnapshot.tunnel,
        colors: undefined,
        spectrum: false,
      },
    } as unknown as TunnelSnapshot;

    const migrated = migrateTunnelSnapshot(legacy);

    expect(migrated.tunnel.colors.mode).toBe("hands");
    expect(migrated.tunnel).not.toHaveProperty("spectrum");
    expect(TunnelSnapshotSchema.safeParse(legacy).success).toBe(true);
  });
});
