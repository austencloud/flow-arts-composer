/**
 * Node.js Data Provider
 *
 * Implementation of ISequenceDataProvider for Node.js (MCP server) contexts.
 * Uses fs.readFileSync for file access.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import type {
  ISequenceDataProvider,
  LetterVariationData,
} from "../../vendor/sequence-engine/data/contracts/ISequenceDataProvider.js";
import type { LetterMappingsJson } from "../../vendor/sequence-engine/domain/models/SequenceEngineTypes.js";
import { calculateOrientations } from "@tka/render-core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve package root where assets/ lives
const isCompiled = __dirname.includes("dist");
const PACKAGE_ROOT = isCompiled
  ? path.resolve(__dirname, "..") // dist/index.js (esbuild bundle) -> package root
  : path.resolve(__dirname, "../.."); // src/adapters -> package root
const ASSETS_ROOT = path.resolve(PACKAGE_ROOT, "assets");

type GridMode = "diamond" | "box" | "skewed";

const DATAFRAME_PATHS: Record<GridMode, string> = {
  diamond: path.resolve(
    ASSETS_ROOT,
    "data/pictographs/DiamondPictographDataframe.csv"
  ),
  box: path.resolve(ASSETS_ROOT, "data/pictographs/BoxPictographDataframe.csv"),
  skewed: path.resolve(
    ASSETS_ROOT,
    "data/pictographs/SkewedPictographDataframe.csv"
  ),
};

const LETTER_MAPPINGS_PATH = path.resolve(
  ASSETS_ROOT,
  "data/learn/letter-mappings.json"
);

export class NodeDataProvider implements ISequenceDataProvider {
  private letterMappings: LetterMappingsJson | null = null;
  private variationCache: Map<string, LetterVariationData[]> = new Map();
  private allVariationsLoaded = false;
  private allVariations: LetterVariationData[] = [];
  private initialized = false;
  private readonly gridMode: GridMode;

  constructor(gridMode: GridMode = "diamond") {
    this.gridMode = gridMode;
  }

  async loadLetterMappings(): Promise<LetterMappingsJson> {
    if (this.letterMappings) {
      return this.letterMappings;
    }

    try {
      const content = fs.readFileSync(LETTER_MAPPINGS_PATH, "utf-8");
      const parsed: LetterMappingsJson = JSON.parse(content);
      this.letterMappings = parsed;
      this.initialized = true;
      return parsed;
    } catch (error) {
      console.error("[MCP] Failed to load letter mappings:", error);
      throw error;
    }
  }

  async loadLetterVariations(letter: string): Promise<LetterVariationData[]> {
    // Check cache first
    const cached = this.variationCache.get(letter);
    if (cached) {
      return cached;
    }

    // Load all variations if not already done
    if (!this.allVariationsLoaded) {
      this.loadAllVariationsFromCsv();
    }

    // Filter by letter
    const variations = this.allVariations.filter((v) => v.letter === letter);
    this.variationCache.set(letter, variations);
    return variations;
  }

  private loadAllVariationsFromCsv(): void {
    try {
      const csvPath = DATAFRAME_PATHS[this.gridMode];
      const csvContent = fs.readFileSync(csvPath, "utf-8");
      const lines = csvContent.trim().split("\n");

      if (lines.length < 2) {
        this.allVariationsLoaded = true;
        return;
      }

      const headers = lines[0].split(",").map((h) => h.trim());
      const variations: LetterVariationData[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map((v) => v.trim());
        const row: Record<string, string> = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || "";
        });

        const leftMotionType = row.leftMotionType || row.blueMotionType;
        const leftStartLocation =
          row.leftStartLocation || row.blueStartLocation;
        const leftEndLocation = row.leftEndLocation || row.blueEndLocation;
        const leftRotationDirection =
          row.leftRotationDirection || row.blueRotationDirection || "cw";
        const rightMotionType = row.rightMotionType || row.redMotionType;
        const rightStartLocation =
          row.rightStartLocation || row.redStartLocation;
        const rightEndLocation = row.rightEndLocation || row.redEndLocation;
        const rightRotationDirection =
          row.rightRotationDirection || row.redRotationDirection || "cw";

        variations.push({
          letter: row.letter,
          startPlacement: row.startPlacement,
          endPlacement: row.endPlacement,
          leftMotionType,
          leftStartLocation,
          leftEndLocation,
          leftRotationDirection,
          rightMotionType,
          rightStartLocation,
          rightEndLocation,
          rightRotationDirection,
          gridMode: this.gridMode,
        });
      }

      this.allVariations = variations;
      this.allVariationsLoaded = true;
      console.error(
        `[MCP] Loaded ${variations.length} variations for ${this.gridMode} mode`
      );
    } catch (error) {
      console.error(`[MCP] Failed to load variations from CSV:`, error);
      this.allVariationsLoaded = true;
    }
  }

  getAllVariations(): LetterVariationData[] {
    if (!this.allVariationsLoaded) {
      this.loadAllVariationsFromCsv();
    }
    return this.allVariations;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

/**
 * Singleton instance for the default grid mode.
 */
let defaultProvider: NodeDataProvider | null = null;

/**
 * Get or create the default NodeDataProvider.
 */
export function getNodeDataProvider(
  gridMode: GridMode = "diamond"
): NodeDataProvider {
  if (!defaultProvider || defaultProvider["gridMode"] !== gridMode) {
    defaultProvider = new NodeDataProvider(gridMode);
  }
  return defaultProvider;
}
