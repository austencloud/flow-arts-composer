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
} from "@tka/sequence-engine";
import type { LetterMappingsJson } from "@tka/sequence-engine";
import { calculateOrientations } from "../core/orientation-calculator.js";
import { readPictographCsvMotion } from "../shared/pictograph-csv-row.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve project root (parent of mcp-server)
const isCompiled = __dirname.includes("dist");
const MCP_SERVER_ROOT = isCompiled
  ? path.resolve(__dirname, "../../..") // dist/src/adapters -> mcp-server
  : path.resolve(__dirname, "../.."); // src/adapters -> mcp-server
const PROJECT_ROOT = path.resolve(MCP_SERVER_ROOT, "..");

type GridMode = "diamond" | "box" | "skewed";

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

const LETTER_MAPPINGS_PATH = path.resolve(
  PROJECT_ROOT,
  "static/data/learn/letter-mappings.json"
);

/**
 * Node.js-specific data provider using synchronous file reads.
 */
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
      this.letterMappings = JSON.parse(content);
      this.initialized = true;
      return this.letterMappings!;
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

        const left = readPictographCsvMotion(row, "left");
        const right = readPictographCsvMotion(row, "right");
        variations.push({
          letter: row.letter,
          startPlacement: row.startPlacement,
          endPlacement: row.endPlacement,
          leftMotionType: left.motionType,
          leftStartLocation: left.startLocation,
          leftEndLocation: left.endLocation,
          leftRotationDirection: left.rotationDirection,
          rightMotionType: right.motionType,
          rightStartLocation: right.startLocation,
          rightEndLocation: right.endLocation,
          rightRotationDirection: right.rotationDirection,
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

  /**
   * Get all loaded variations (useful for sequence building).
   */
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
