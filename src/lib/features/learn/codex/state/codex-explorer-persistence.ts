// Pure serialize/restore for the Codex Explorer's durable view prefs.
// Kept separate from the rune state factory so it is unit-testable without a
// Svelte runtime. The factory (codex-explorer-state.svelte.ts) owns the
// $effect that calls these and touches localStorage.
//
// Dark mode is intentionally NOT persisted here — it is the user's GLOBAL
// setting, owned by the animation visibility manager.

export const CODEX_EXPLORER_STORAGE_KEY = "codex-explorer-prefs";
const CODEX_EXPLORER_PREFS_VERSION = 2;

export type CodexExplorerGridMode = "diamond" | "box";

export interface CodexExplorerVisibility {
  showGlyph: boolean;
  showGrid: boolean;
  showTKA: boolean;
  showPlacements: boolean;
  showReversals: boolean;
  showNonRadialPoints: boolean;
}

export interface CodexExplorerPrefs {
  version: number;
  selectedLetter: string;
  gridMode: CodexExplorerGridMode;
  visibility: CodexExplorerVisibility;
  /** PanelGroup flex ratios for the codex | variations split. */
  splitSizes: number[];
}

export function defaultCodexExplorerVisibility(): CodexExplorerVisibility {
  return {
    showGlyph: true,
    showGrid: true,
    showTKA: true,
    showPlacements: false,
    showReversals: false,
    showNonRadialPoints: false,
  };
}

export function defaultCodexExplorerPrefs(): CodexExplorerPrefs {
  return {
    version: CODEX_EXPLORER_PREFS_VERSION,
    selectedLetter: "A",
    gridMode: "diamond",
    visibility: defaultCodexExplorerVisibility(),
    splitSizes: [5, 6],
  };
}

export function serializeCodexExplorerPrefs(prefs: CodexExplorerPrefs): string {
  return JSON.stringify({ ...prefs, version: CODEX_EXPLORER_PREFS_VERSION });
}

export function restoreCodexExplorerPrefs(raw: string | null): CodexExplorerPrefs {
  if (!raw) return defaultCodexExplorerPrefs();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultCodexExplorerPrefs();
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { version?: unknown }).version !== CODEX_EXPLORER_PREFS_VERSION
  ) {
    return defaultCodexExplorerPrefs();
  }
  const p = parsed as Partial<CodexExplorerPrefs>;
  const d = defaultCodexExplorerPrefs();
  const splitSizes =
    Array.isArray(p.splitSizes) &&
    p.splitSizes.length === 2 &&
    p.splitSizes.every((n) => typeof n === "number" && n > 0)
      ? (p.splitSizes as number[])
      : d.splitSizes;
  return {
    version: CODEX_EXPLORER_PREFS_VERSION,
    selectedLetter: typeof p.selectedLetter === "string" ? p.selectedLetter : d.selectedLetter,
    gridMode: p.gridMode === "box" ? "box" : "diamond",
    visibility: { ...d.visibility, ...(p.visibility ?? {}) },
    splitSizes,
  };
}
