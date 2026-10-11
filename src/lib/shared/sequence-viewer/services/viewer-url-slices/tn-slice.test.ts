import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flushSync } from "svelte";

const { captureTnSlice, seedFromTnSlice, persistedTnSliceFromStorage } =
  await import("./tn-slice");
const { loadTunnelViewState, DEFAULT_TUNNEL_VIEW_STATE } = await import(
  "#lib/shared/sequence-viewer/tunnel/tunnel-view-state.js"
);
const { DEFAULT_CONFIG } = await import(
  "#lib/shared/sequence-viewer/tunnel/tunnel-config.js"
);
const { savedTunnelPresetRecipe } = await import(
  "#lib/shared/sequence-viewer/tunnel/tunnel-preset-recipe.js"
);
const { resolveTunnelPropColorState } = await import(
  "#lib/shared/sequence-viewer/tunnel/tunnel-prop-colors.js"
);
const { createRootedTunnelViewController } = await import(
  "./tn-slice-test-harness.svelte"
);
type TunnelControllerSources = Parameters<
  typeof createRootedTunnelViewController
>[0];

const STORAGE_KEY = "tka_tunnel_view_state";
const USER_PRESETS_KEY = "tka_tunnel_user_presets";
const CUSTOM_COLORS_KEY = "tka_viewer_custom_colors";
const ENCODED_KEYS = [STORAGE_KEY, USER_PRESETS_KEY, CUSTOM_COLORS_KEY];

const disposals: Array<() => void> = [];

/** TunnelViewController registers `$effect`s, so it needs an effect root. */
function tunnelController(sources: TunnelControllerSources) {
  const rooted = createRootedTunnelViewController(sources);
  disposals.push(rooted.dispose);
  return rooted.controller;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  while (disposals.length) disposals.pop()!();
  vi.restoreAllMocks();
});

const defaultColors = () => ({
  mode: DEFAULT_TUNNEL_VIEW_STATE.colors.mode,
  custom: { ...DEFAULT_TUNNEL_VIEW_STATE.colors.custom },
});
// What the slice emits: the palette constants carry uppercase hex, but both
// capture and seed run colors through resolveTunnelPropColorState, which
// lowercases every string.
const normalizedDefaultColors = () =>
  resolveTunnelPropColorState(DEFAULT_TUNNEL_VIEW_STATE.colors);

describe("tn slice", () => {
  it("returns null at post-normalize defaults", () => {
    expect(
      captureTnSlice({
        config: { ...DEFAULT_CONFIG },
        gridVisible: false,
        colors: defaultColors(),
        section: "tunnel",
        presetRecipe: null,
      })
    ).toBeNull();
  });

  it("the post-normalize baseline equals a factory-fresh load", () => {
    // The fx/t3 trap: a boot migration can make a fresh load differ from the
    // raw constant. loadTunnelViewState() has no side-effect writes and no
    // migration step, so DEFAULT_TUNNEL_VIEW_STATE (the module's own private
    // default, exported for this slice) must equal what a real empty-storage
    // load returns byte for byte.
    localStorage.clear();
    expect(loadTunnelViewState()).toEqual(DEFAULT_TUNNEL_VIEW_STATE);
    expect(captureTnSlice(loadTunnelViewState())).toBeNull();
  });

  it("captures only the config fields that differ", () => {
    const slice = captureTnSlice({
      config: { ...DEFAULT_CONFIG, fold: 4, mirror: true },
      gridVisible: false,
      colors: defaultColors(),
      section: "tunnel",
      presetRecipe: null,
    });
    expect(slice).toEqual({ config: { fold: 4, mirror: true } });
  });

  it("captures speedOverrides only when it differs from the empty default", () => {
    const slice = captureTnSlice({
      config: { ...DEFAULT_CONFIG, speedOverrides: { 1: 2 } },
      gridVisible: false,
      colors: defaultColors(),
      section: "tunnel",
      presetRecipe: null,
    });
    expect(slice).toEqual({ config: { speedOverrides: { 1: 2 } } });
  });

  it("captures chrome fields only when they differ", () => {
    const slice = captureTnSlice({
      config: { ...DEFAULT_CONFIG },
      gridVisible: true,
      colors: { mode: "hands", custom: defaultColors().custom },
      section: "speed",
      presetRecipe: null,
    });
    expect(slice).toEqual({
      gridVisible: true,
      colors: { mode: "hands", custom: normalizedDefaultColors().custom },
      section: "speed",
    });
  });

  it("captures the preset recipe verbatim, as a value clone (never a live reference)", () => {
    const config = { ...DEFAULT_CONFIG, fold: 8 };
    const recipe = savedTunnelPresetRecipe("preset-1", "My Mandala", config);
    const slice = captureTnSlice({
      config: { ...DEFAULT_CONFIG },
      gridVisible: false,
      colors: defaultColors(),
      section: "tunnel",
      presetRecipe: recipe,
    });
    expect(slice?.presetRecipe).toEqual(recipe);
    // Mutating the source object after capture must not move the captured
    // value — this is the by-value guarantee the task requires: a link must
    // carry concrete config values, never a live reference into anything.
    config.fold = 2;
    expect(slice?.presetRecipe?.config.fold).toBe(8);
  });

  it("round-trips: capture -> seed -> apply -> capture is identity", () => {
    const recipe = savedTunnelPresetRecipe("preset-2", "Custom", {
      ...DEFAULT_CONFIG,
      fold: 4,
      mirror: true,
    });
    const slice = captureTnSlice({
      config: { ...DEFAULT_CONFIG, fold: 4, mirror: true, staggerSteps: 2 },
      gridVisible: true,
      colors: { mode: "custom", custom: { left: "#123456", right: "#abcdef" } },
      section: "speed",
      presetRecipe: recipe,
    });
    const seed = seedFromTnSlice(slice!);
    const controller = tunnelController({
      getSequence: () => null,
      initialViewState: seed,
      persistViewState: false,
    });
    expect(captureTnSlice(controller)).toEqual(slice);
  });

  it("seedFromTnSlice merges onto post-normalize defaults, not user state", () => {
    const seeded = seedFromTnSlice({ gridVisible: true });
    expect(seeded).toEqual({
      ...DEFAULT_TUNNEL_VIEW_STATE,
      colors: normalizedDefaultColors(),
      gridVisible: true,
    });
  });

  it("always seeds a COMPLETE config, even from an empty payload", () => {
    const seeded = seedFromTnSlice({});
    expect(seeded).toEqual({
      ...DEFAULT_TUNNEL_VIEW_STATE,
      colors: normalizedDefaultColors(),
    });
    // A null preset override must not fall back to a stored user preset —
    // there is nothing further for the controller to read.
    expect(seeded.presetRecipe).toBeNull();
  });

  it("seed -> tweak writes zero times to either tunnel key", () => {
    // The recipient already has their own leftover state on disk, including a
    // saved preset list. A link must beat the former and never touch the
    // latter.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...DEFAULT_TUNNEL_VIEW_STATE,
        config: { ...DEFAULT_CONFIG, fold: 8 },
      })
    );
    localStorage.setItem(
      USER_PRESETS_KEY,
      JSON.stringify([{ id: "p1", name: "Mine", config: DEFAULT_CONFIG }])
    );

    const seed = seedFromTnSlice({ config: { fold: 4 }, gridVisible: true });
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    const controller = tunnelController({
      getSequence: () => null,
      initialViewState: seed,
      persistViewState: false,
    });
    flushSync();
    expect(controller.fold).toBe(4);
    expect(controller.gridVisible).toBe(true);

    // A recipient tweaking during the session stays session-local too.
    controller.setFold(2);
    controller.gridVisible = false;
    flushSync();
    expect(controller.fold).toBe(2);

    const touched = setItem.mock.calls
      .map((call) => String(call[0]))
      .filter((key) => ENCODED_KEYS.includes(key));
    expect(touched).toEqual([]);
    // The recipient's own stored state (both keys) is untouched.
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).config.fold).toBe(8);
    expect(JSON.parse(localStorage.getItem(USER_PRESETS_KEY)!)).toEqual([
      { id: "p1", name: "Mine", config: DEFAULT_CONFIG },
    ]);
  });

  it("guards the spy: the same calls DO write without the seam", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    const controller = tunnelController({ getSequence: () => null });
    controller.setFold(4);
    controller.gridVisible = true;
    flushSync();

    const touched = new Set(
      setItem.mock.calls
        .map((call) => String(call[0]))
        .filter((key) => ENCODED_KEYS.includes(key))
    );
    expect([...touched].sort()).toEqual(
      [STORAGE_KEY, CUSTOM_COLORS_KEY].sort()
    );
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).config.fold).toBe(4);
  });

  it("persistedTnSliceFromStorage reproduces capture from disk, read-only", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...DEFAULT_TUNNEL_VIEW_STATE,
        config: { ...DEFAULT_CONFIG, fold: 8, mirror: true },
        gridVisible: true,
      })
    );
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    expect(persistedTnSliceFromStorage()).toEqual({
      config: { fold: 8, mirror: true },
      gridVisible: true,
    });
    expect(setItem).not.toHaveBeenCalled();
  });

  it("is null for a visitor sitting on the default tunnel view", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_TUNNEL_VIEW_STATE));
    expect(persistedTnSliceFromStorage()).toBeNull();
  });

  describe("full snapshot", () => {
    it("emits every config field, grid, colors and section at defaults, and round-trips", () => {
      const controller = tunnelController({ getSequence: () => null });
      const full = captureTnSlice(controller, { full: true });
      expect(full).not.toBeNull();
      expect(Object.keys(full!.config!).sort()).toEqual(
        Object.keys(DEFAULT_CONFIG).sort()
      );
      expect(full?.gridVisible).toBe(DEFAULT_TUNNEL_VIEW_STATE.gridVisible);
      expect(full?.section).toBe(DEFAULT_TUNNEL_VIEW_STATE.section);
      expect(full?.colors).toEqual(
        resolveTunnelPropColorState(DEFAULT_TUNNEL_VIEW_STATE.colors)
      );
      expect("presetRecipe" in full!).toBe(false);

      const seeded = tunnelController({
        getSequence: () => null,
        initialViewState: seedFromTnSlice(full!),
        persistViewState: false,
      });
      expect(captureTnSlice(seeded, { full: true })).toEqual(full);
      expect(captureTnSlice(seeded)).toBeNull();
    });

    it("persistedTnSliceFromStorage honours full mode", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_TUNNEL_VIEW_STATE));
      expect(persistedTnSliceFromStorage()).toBeNull();
      expect(persistedTnSliceFromStorage({ full: true })?.config?.fold).toBe(
        DEFAULT_CONFIG.fold
      );
    });
  });
});
