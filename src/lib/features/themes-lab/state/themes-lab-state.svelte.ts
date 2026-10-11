import { browser } from "$app/env";
import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
import { createSceneLabState } from "#lib/features/lab/tabs/scene-lab/state/scene-lab-state.svelte.js";
import { createComposerEditorState } from "#lib/shared/3d/scene-composer/composer-editor-state.svelte.js";
import {
  THEME_OPTIONS,
  getThemeOption,
  type ThemeId,
} from "../domain/theme-types";
import type { SceneLabContext } from "#lib/features/lab/tabs/scene-lab/context/scene-lab-context.js";

export type ThemeMode = "2d" | "3d";

const STORAGE_KEY = "tka-themes-lab";

function loadPersisted(): { themeId: ThemeId; mode: ThemeMode } {
  const fallback = { themeId: "ocean" as ThemeId, mode: "2d" as ThemeMode };
  if (!browser) return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<{ themeId: ThemeId; mode: ThemeMode }>;
    return {
      themeId: parsed.themeId && getThemeOption(parsed.themeId) ? parsed.themeId : fallback.themeId,
      mode: parsed.mode === "3d" || parsed.mode === "2d" ? parsed.mode : fallback.mode,
    };
  } catch {
    return fallback;
  }
}

function persist(themeId: ThemeId, mode: ThemeMode): void {
  if (!browser) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ themeId, mode }));
  } catch {
    // localStorage unavailable (private mode / quota) — UI pref is non-critical.
  }
}

export function createThemesLabState() {
  const persisted = loadPersisted();
  let themeId = $state<ThemeId>(persisted.themeId);
  let mode = $state<ThemeMode>(persisted.mode);

  const sceneState = createSceneLabState();
  const composerState = createComposerEditorState();

  const initialOption = getThemeOption(themeId);
  if (initialOption) sceneState.setSceneId(initialOption.sceneId);

  function setTheme(id: ThemeId) {
    themeId = id;
    persist(themeId, mode);

    const option = getThemeOption(id);
    if (!option) return;

    sceneState.setSceneId(option.sceneId);

    void settingsService.updateSetting("backgroundCategory", "animated");
    void settingsService.updateSetting("backgroundType", option.backgroundType);
  }

  function setMode(m: ThemeMode) {
    mode = m;
    persist(themeId, mode);
  }

  const sceneLabContext: SceneLabContext = {
    get state() {
      return sceneState;
    },
    get composerState() {
      return composerState;
    },
  };

  return {
    get themeId() {
      return themeId;
    },
    get mode() {
      return mode;
    },
    get sceneState() {
      return sceneState;
    },
    get composerState() {
      return composerState;
    },
    get sceneLabContext() {
      return sceneLabContext;
    },
    get currentTheme() {
      return getThemeOption(themeId);
    },
    setTheme,
    setMode,
    themeOptions: THEME_OPTIONS,
  };
}

export type ThemesLabState = ReturnType<typeof createThemesLabState>;
