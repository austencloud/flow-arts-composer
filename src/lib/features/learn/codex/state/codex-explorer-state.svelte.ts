import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  CODEX_EXPLORER_STORAGE_KEY,
  defaultCodexExplorerPrefs,
  restoreCodexExplorerPrefs,
  serializeCodexExplorerPrefs,
  type CodexExplorerGridMode,
  type CodexExplorerPrefs,
  type CodexExplorerVisibility,
} from "./codex-explorer-persistence";

function readStored(): CodexExplorerPrefs {
  if (typeof localStorage === "undefined") return defaultCodexExplorerPrefs();
  return restoreCodexExplorerPrefs(localStorage.getItem(CODEX_EXPLORER_STORAGE_KEY));
}

export function gridModeEnum(mode: CodexExplorerGridMode): GridMode {
  return mode === "box" ? GridMode.BOX : GridMode.DIAMOND;
}

export function createCodexExplorerState() {
  const initial = readStored();

  let selectedLetter = $state(initial.selectedLetter);
  let gridMode = $state<CodexExplorerGridMode>(initial.gridMode);
  let visibility = $state<CodexExplorerVisibility>({ ...initial.visibility });
  let splitSizes = $state<number[]>([...initial.splitSizes]);

  // Debounced persistence of the durable subset (dark mode is global, elsewhere).
  $effect(() => {
    const serialized = serializeCodexExplorerPrefs({
      version: 2,
      selectedLetter,
      gridMode,
      visibility: $state.snapshot(visibility),
      splitSizes: $state.snapshot(splitSizes),
    });
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(CODEX_EXPLORER_STORAGE_KEY, serialized);
      } catch {
        // noop — private mode / quota
      }
    }, 400);
    return () => clearTimeout(timer);
  });

  return {
    get selectedLetter() {
      return selectedLetter;
    },
    set selectedLetter(v: string) {
      selectedLetter = v;
    },
    get gridMode() {
      return gridMode;
    },
    set gridMode(v: CodexExplorerGridMode) {
      gridMode = v;
    },
    get gridModeEnum() {
      return gridModeEnum(gridMode);
    },
    get visibility() {
      return visibility;
    },
    get splitSizes() {
      return splitSizes;
    },
    set splitSizes(v: number[]) {
      splitSizes = v;
    },
    toggleVisibility(key: keyof CodexExplorerVisibility) {
      visibility = { ...visibility, [key]: !visibility[key] };
    },
  };
}

export type CodexExplorerState = ReturnType<typeof createCodexExplorerState>;
