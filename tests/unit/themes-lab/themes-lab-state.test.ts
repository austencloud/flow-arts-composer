import { describe, it, expect, vi, beforeEach } from "vitest";
import { PRIDE_BACKGROUND_TYPE } from "#lib/shared/settings/domain/background-type-migration.js";

// Mock localStorage
const mockStorage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => mockStorage.get(key) ?? null,
  setItem: (key: string, value: string) => mockStorage.set(key, value),
  removeItem: (key: string) => mockStorage.delete(key),
});

// Mock settingsService
const mockUpdateSetting = vi.fn().mockResolvedValue(undefined);
vi.mock("#lib/shared/settings/state/settings-state.svelte.js", () => ({
  settingsService: {
    settings: { backgroundType: "ocean" },
    updateSetting: (...args: unknown[]) => mockUpdateSetting(...args),
  },
}));

// Mock scene-lab-state (avoid Svelte rune compilation issues in test)
const mockSetSceneId = vi.fn();
vi.mock(
  "#lib/features/lab/tabs/scene-lab/state/scene-lab-state.svelte.js",
  () => ({
    createSceneLabState: () => ({
      sceneId: "ocean",
      setSceneId: mockSetSceneId,
      cosmicVariant: "night",
      setCosmicVariant: vi.fn(),
      winterConfig: {},
      forestConfig: {},
      autumnConfig: {},
      cosmicNightConfig: {},
      cosmicAuroraConfig: {},
      oceanConfig: {},
      emberConfig: {},
      blossomConfig: {},
      celestialConfig: {},
      rainbowConfig: {},
      voidConfig: {},
      resetCurrent: vi.fn(),
      copyCurrentToClipboard: vi.fn(),
    }),
  })
);

// Mock composer-editor-state
vi.mock(
  "#lib/shared/3d/scene-composer/composer-editor-state.svelte.js",
  () => ({
    createComposerEditorState: () => ({
      active: false,
      mode: "browse",
      selectedObject: null,
      gizmoMode: "translate",
      activeCatalogItem: null,
      ghostValid: false,
      placements: [],
      dirty: false,
      setActive: vi.fn(),
      toggle: vi.fn(),
      commands: { push: vi.fn(), undo: vi.fn(), redo: vi.fn() },
    }),
  })
);

import { createThemesLabState } from "#lib/features/themes-lab/state/themes-lab-state.svelte.js";

describe("createThemesLabState", () => {
  beforeEach(() => {
    mockStorage.clear();
    mockUpdateSetting.mockClear();
    mockSetSceneId.mockClear();
  });

  it("defaults to ocean theme in 2d mode", () => {
    const state = createThemesLabState();
    expect(state.themeId).toBe("ocean");
    expect(state.mode).toBe("2d");
  });

  it("setTheme updates themeId and fires settingsService", () => {
    const state = createThemesLabState();
    state.setTheme("cosmic");
    expect(state.themeId).toBe("cosmic");
    expect(mockUpdateSetting).toHaveBeenCalledWith(
      "backgroundCategory",
      "animated"
    );
    expect(mockUpdateSetting).toHaveBeenCalledWith("backgroundType", "cosmic");
  });

  it("setTheme syncs sceneId to scene-lab state", () => {
    const state = createThemesLabState();
    state.setTheme("forest");
    expect(mockSetSceneId).toHaveBeenCalledWith("forest");
  });

  it("setMode toggles between 2d and 3d", () => {
    const state = createThemesLabState();
    state.setMode("3d");
    expect(state.mode).toBe("3d");
    state.setMode("2d");
    expect(state.mode).toBe("2d");
  });

  it("currentTheme returns the active theme option", () => {
    const state = createThemesLabState();
    expect(state.currentTheme?.id).toBe("ocean");
    expect(state.currentTheme?.label).toBe("Ocean");
  });

  it("sceneLabContext has state and composerState properties", () => {
    const state = createThemesLabState();
    expect(state.sceneLabContext).toBeDefined();
    expect(state.sceneLabContext.state).toBeDefined();
    expect(state.sceneLabContext.composerState).toBeDefined();
  });

  it("themeOptions exposes all 10 themes", () => {
    const state = createThemesLabState();
    expect(state.themeOptions).toHaveLength(10);
  });

  it("setTheme with blossom maps to blossom sceneId", () => {
    const state = createThemesLabState();
    state.setTheme("blossom");
    expect(mockSetSceneId).toHaveBeenCalledWith("blossom");
    expect(mockUpdateSetting).toHaveBeenCalledWith("backgroundType", "blossom");
  });

  it("setTheme with rainbow maps to rainbow sceneId", () => {
    const state = createThemesLabState();
    state.setTheme("rainbow");
    expect(mockSetSceneId).toHaveBeenCalledWith("rainbow");
    // Asserted against the resolved identifier, not BackgroundType.PRIDE. On a
    // bundle that still calls the environment Rainbow that member is undefined,
    // so this assertion used to pass by comparing undefined to undefined and
    // proved nothing about what the tab actually persists.
    expect(mockUpdateSetting).toHaveBeenCalledWith(
      "backgroundType",
      PRIDE_BACKGROUND_TYPE
    );
  });
});
