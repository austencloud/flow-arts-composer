/**
 * Server Context - Shared State and Utilities
 *
 * Provides shared state, utilities, and data access functions
 * that all tool modules need.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { exec, spawn } from "child_process";
import { homedir, tmpdir } from "os";
import { calculateOrientations } from "../core/orientation-calculator.js";
import type {
  MotionData,
  PictographData,
  GridMode,
} from "../types/pictograph.js";
import { readPictographCsvMotion } from "./pictograph-csv-row.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * User preferences for pictograph rendering.
 * These persist across tool calls within a session.
 */
export interface UserPreferences {
  darkMode: boolean;
  size: number;
  showTKA: boolean;
  showTND: boolean;
  showElemental: boolean;
  showPositions: boolean;
  showReversals: boolean;
  showGrid: boolean;
  showNonRadialPoints: boolean;
  handPointVisibility: "all" | "active" | "none";
  showLeftMotion: boolean;
  showRightMotion: boolean;
  leftPropType: string | null;
  rightPropType: string | null;
  fanAppearance: {
    build: "pictograph" | "fire" | "flat-grip" | "lotus" | "day" | "moon";
    frameColor: "black" | "white";
    cover: "bare" | "covered";
  };
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  darkMode: true,
  size: 400,
  showTKA: true,
  showTND: false,
  showElemental: false,
  showPositions: false,
  showReversals: false,
  showGrid: true,
  showNonRadialPoints: false,
  handPointVisibility: "all",
  showLeftMotion: true,
  showRightMotion: true,
  leftPropType: null,
  rightPropType: null,
  fanAppearance: { build: "fire", frameColor: "black", cover: "bare" },
};

// Current session preferences (starts with defaults)
let currentPreferences: UserPreferences = { ...DEFAULT_PREFERENCES };

export function getPreferences(): UserPreferences {
  return currentPreferences;
}

export function setPreferences(prefs: UserPreferences): void {
  currentPreferences = prefs;
}

export function resetPreferences(): void {
  currentPreferences = { ...DEFAULT_PREFERENCES };
}

export function updatePreferences(partial: Partial<UserPreferences>): void {
  currentPreferences = { ...currentPreferences, ...partial };
}

/**
 * Resolve a user-writable temp directory. os.tmpdir() can return
 * C:\WINDOWS\TEMP when the MCP server inherits a system env, which
 * blocks Windows from auto-launching the default image viewer.
 */
function resolveUserTempDir(): string {
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    const userTemp = localAppData
      ? path.join(localAppData, "Temp")
      : path.join(homedir(), "AppData", "Local", "Temp");
    const dir = path.join(userTemp, "tka-mcp");
    try {
      fs.mkdirSync(dir, { recursive: true });
      return dir;
    } catch {
      return tmpdir();
    }
  }
  return tmpdir();
}

/**
 * Open an image file with the system's default image viewer.
 * On Windows uses explorer.exe (more reliable than cmd's `start`
 * when the MCP process has no attached console).
 */
export function openImageFile(filePath: string): void {
  const platform = process.platform;

  if (platform === "win32") {
    const child = spawn("explorer.exe", [filePath], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    child.on("error", (err) => {
      console.error(`[MCP] Failed to open image via explorer: ${err.message}`);
    });
    child.unref();
    return;
  }

  const command =
    platform === "darwin" ? `open "${filePath}"` : `xdg-open "${filePath}"`;
  exec(command, (error) => {
    if (error) {
      console.error(`[MCP] Failed to open image: ${error.message}`);
    }
  });
}

/**
 * Save PNG buffer to a temp file and open it immediately.
 */
export function saveAndOpenImage(pngBuffer: Buffer, label: string): string {
  const tempDir = resolveUserTempDir();
  const timestamp = Date.now();
  const fileName = `tka-${label}-${timestamp}.png`;
  const filePath = path.join(tempDir, fileName);

  fs.writeFileSync(filePath, pngBuffer);
  openImageFile(filePath);

  return filePath;
}

// ============================================================================
// PICTOGRAPH DATA LOADING
// ============================================================================

// Resolve paths relative to the project root (parent of mcp-server)
// When compiled, __dirname is mcp-server/dist/src/shared
// When running source, __dirname is mcp-server/src/shared
const isCompiled = __dirname.includes("dist");
const MCP_SERVER_ROOT = isCompiled
  ? path.resolve(__dirname, "../../..") // dist/src/shared -> mcp-server
  : path.resolve(__dirname, "../.."); // src/shared -> mcp-server
const PROJECT_ROOT = path.resolve(MCP_SERVER_ROOT, "..");

const DATAFRAME_PATHS: Record<GridMode, string> = {
  diamond: path.resolve(
    PROJECT_ROOT,
    "static/data/pictographs/DiamondPictographDataframe.csv"
  ),
  box: path.resolve(
    PROJECT_ROOT,
    "static/data/pictographs/BoxPictographDataframe.csv"
  ),
  skewed: path.resolve(
    PROJECT_ROOT,
    "static/data/pictographs/SkewedPictographDataframe.csv"
  ),
};

// Cache for loaded dataframes
const pictographsByGridMode: Record<GridMode, PictographData[]> = {
  diamond: [],
  box: [],
  skewed: [],
};

let defaultGridMode: GridMode = "diamond";

export function getDefaultGridMode(): GridMode {
  return defaultGridMode;
}

export function setDefaultGridMode(mode: GridMode): void {
  defaultGridMode = mode;
}

function loadDataframe(gridMode: GridMode): PictographData[] {
  const dataframePath = DATAFRAME_PATHS[gridMode];
  try {
    const csvContent = fs.readFileSync(dataframePath, "utf-8");
    const lines = csvContent.trim().split("\n");
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map((h) => h.trim());
    const pictographs: PictographData[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || "";
      });

      // Orientations for isolated variations default to "in" start.
      // When building sequences, orientation-propagation.ts chains each step's
      // end orientation into the next step's start, so the correct orientations
      // propagate through the sequence regardless of this default.
      const left = readPictographCsvMotion(row, "left");
      const right = readPictographCsvMotion(row, "right");
      const leftOrientations = calculateOrientations({
        motionType: left.motionType,
        turns: 0,
        rotationDirection: left.rotationDirection,
        startLocation: left.startLocation,
        endLocation: left.endLocation,
        startOrientation: "in",
      });

      const rightOrientations = calculateOrientations({
        motionType: right.motionType,
        turns: 0,
        rotationDirection: right.rotationDirection,
        startLocation: right.startLocation,
        endLocation: right.endLocation,
        startOrientation: "in",
      });

      // Skip blank/separator lines in the CSV
      if (!row.letter || row.letter.trim() === "") continue;

      pictographs.push({
        letter: row.letter,
        startPosition: row.startPosition,
        endPosition: row.endPosition,
        timing: row.timing,
        direction: row.direction,
        leftMotion: {
          hand: "left",
          startLocation: left.startLocation,
          endLocation: left.endLocation,
          motionType: left.motionType,
          rotationDirection: left.rotationDirection,
          startOrientation: leftOrientations.startOrientation,
          endOrientation: leftOrientations.endOrientation,
        },
        rightMotion: {
          hand: "right",
          startLocation: right.startLocation,
          endLocation: right.endLocation,
          motionType: right.motionType,
          rotationDirection: right.rotationDirection,
          startOrientation: rightOrientations.startOrientation,
          endOrientation: rightOrientations.endOrientation,
        },
      });
    }

    return pictographs;
  } catch (error) {
    console.error(`[MCP] Failed to load ${gridMode} dataframe:`, error);
    return [];
  }
}

export function ensureDataLoaded(
  gridMode: GridMode = defaultGridMode
): PictographData[] {
  if (pictographsByGridMode[gridMode].length === 0) {
    console.error(`[MCP] Loading ${gridMode} pictograph dataframe...`);
    pictographsByGridMode[gridMode] = loadDataframe(gridMode);
    console.error(
      `[MCP] Loaded ${pictographsByGridMode[gridMode].length} pictographs for ${gridMode} mode`
    );
  }
  return pictographsByGridMode[gridMode];
}

/**
 * Async version of ensureDataLoaded that also awaits engine TransitionGraph init.
 * Use this in async tool handlers to guarantee the engine graph is ready.
 */
export async function ensureDataLoadedAsync(
  gridMode: GridMode = defaultGridMode
): Promise<PictographData[]> {
  const data = ensureDataLoaded(gridMode);
  await initEngineTransitionGraph();
  return data;
}

let engineTransitionGraphReady = false;
async function initEngineTransitionGraph(): Promise<void> {
  if (engineTransitionGraphReady) return;
  try {
    const { ensureTransitionGraphInitialized } =
      await import("../core/letter-transition-graph.js");
    const { setLetterTransitionGraph } = await import("@tka/sequence-engine");
    const localGraph = await ensureTransitionGraphInitialized();
    if (localGraph?.engineGraph) {
      setLetterTransitionGraph(localGraph.engineGraph);
      engineTransitionGraphReady = true;
      console.error("[MCP] Engine TransitionGraph singleton initialized");
    }
  } catch (err) {
    console.error("[MCP] Failed to init engine TransitionGraph:", err);
  }
}

export function getAllPictographs(): PictographData[] {
  return ensureDataLoaded(defaultGridMode);
}

// ============================================================================
// DOMAIN KNOWLEDGE (from @tka/domain)
// ============================================================================

import {
  GLOSSARY,
  LETTER_TYPES,
  LETTER_TO_TYPE as DOMAIN_LETTER_TO_TYPE,
} from "@tka/domain";
import type { GlossaryEntry, LetterTypeDefinition } from "@tka/domain";

export { GLOSSARY, LETTER_TYPES };

/** Letter→type lookup. Re-exported for consumers that use { type, name } shape. */
export const LETTER_TO_TYPE: Record<string, { type: string; name: string }> =
  {};
for (const [letter, info] of Object.entries(DOMAIN_LETTER_TO_TYPE)) {
  LETTER_TO_TYPE[letter] = { type: info.type, name: info.name };
}

export function loadKnowledgeBase(): void {
  // No-op: @tka/domain data is statically imported
}

export function getGlossary(): Record<string, GlossaryEntry> {
  return GLOSSARY;
}

export function getLetterTypes(): Record<string, LetterTypeDefinition> {
  return LETTER_TYPES;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function generateRandomWord(
  length: number,
  excludeLetters?: string[]
): string {
  const allPictographs = ensureDataLoaded();
  const allLetters = new Set<string>();
  for (const p of allPictographs) {
    allLetters.add(p.letter);
  }

  const excludeSet = new Set(excludeLetters || []);
  const availableLetters = [...allLetters].filter((l) => !excludeSet.has(l));

  if (availableLetters.length === 0) {
    return "ABCD".slice(0, length);
  }

  let word = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * availableLetters.length);
    word += availableLetters[randomIndex];
  }

  return word;
}

// Re-export types for convenience
export type { MotionData, PictographData, GridMode };
