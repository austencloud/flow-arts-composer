/**
 * Letter Query Service - Letter-based pictograph lookups
 *
 * Single responsibility: Query pictographs by letter using CodexLetterMappingRepo
 * Uses shared services for CSV loading, parsing, and transformation.
 */

import type { CodexLetterMapping } from "$lib/shared/learn/domain/codex-models";
import type { CodexLetterMappingRepo } from "$lib/shared/learn/services/codex-letter-mapping-repo";
import type { MotionType } from "../../shared/domain/enums/pictograph-enums";
import type { PictographData } from "../../shared/domain/models/pictograph-data";
import type { ParsedCsvRow } from "$lib/shared/foundation/domain/models/csv-models";

import type { Letter } from "../../../foundation/domain/models/letter";
import type {
  CSVRow,
  CSVPictographParser,
} from "../../shared/services/csv-pictograph-parser";
import { GridMode } from "../../grid/domain/enums/grid-enums";
import type { CsvLoader } from "../../../foundation/services/data/csv-loader";
import type {
  ILetterQueryHandler,
} from "../../../foundation/services/data/data-contracts";

interface CsvParseError {
  error: string;
  rowIndex?: number;
  rawRow: string;
  lineNumber: number;
}

interface CsvParseResult {
  rows: ParsedCsvRow[];
  errors: CsvParseError[];
}

// Temporary interface definition
interface ICSVParser {
  parseCSV(csvText: string): CsvParseResult;
}

export class LetterQueryHandler implements ILetterQueryHandler {
  private parsedData: Record<GridMode, ParsedCsvRow[]> | null = null;
  private isInitialized = false;

  constructor(
    private csvLoader: CsvLoader,
    private CSVParser: ICSVParser,
    private csvPictographParser: CSVPictographParser,
    // OPTIONAL: Only needed for Codex-specific methods (getPictographByLetter, getAllCodexPictographs)
    // NOT needed for getAllPictographVariations (used by Generate)
    private letterMappingRepo?: CodexLetterMappingRepo
  ) {}

  /**
   * Set the letter mapping repository after construction.
   * Needed when the repo is created in a different container (learn module).
   */
  setLetterMappingRepo(repo: CodexLetterMappingRepo): void {
    this.letterMappingRepo = repo;
  }

  /**
   * Initialize CSV data and letter mapping repository if not already loaded
   */
  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize letter mapping repository first
      if (
        this.letterMappingRepo &&
        typeof this.letterMappingRepo.initialize === "function"
      ) {
        await this.letterMappingRepo.initialize();
      }

      // Load raw CSV data
      const csvData = await this.csvLoader.loadCSVDataSet();

      if (!csvData.success || !csvData.data) {
        throw new Error(csvData.error || "CSV data unavailable");
      }

      // Parse CSV data using shared service
      const diamondParseResult = this.CSVParser.parseCSV(
        csvData.data.diamondData
      );
      const boxParseResult = this.CSVParser.parseCSV(
        csvData.data.boxData
      );

      // Only log significant parsing errors (not empty row issues)
      const significantDiamondErrors = diamondParseResult.errors.filter(
        (error: CsvParseError) =>
          !error.error.includes("missing required fields") ||
          (error.rawRow &&
            error.rawRow.trim() !== "" &&
            !error.rawRow.split(",").every((v: string) => v.trim() === ""))
      );
      const significantBoxErrors = boxParseResult.errors.filter(
        (error: CsvParseError) =>
          !error.error.includes("missing required fields") ||
          (error.rawRow &&
            error.rawRow.trim() !== "" &&
            !error.rawRow.split(",").every((v: string) => v.trim() === ""))
      );

      if (significantDiamondErrors.length > 0) {
        console.warn(
          `⚠️ Diamond CSV parsing errors (${significantDiamondErrors.length} significant):`
        );
        significantDiamondErrors
          .slice(0, 3)
          .forEach((error: CsvParseError, index: number) => {
            console.warn(
              `  Error ${index + 1}: Row ${error.rowIndex} - ${error.error}`
            );
            console.warn(`  Raw row: ${error.rawRow.substring(0, 100)}...`);
          });
      }
      if (significantBoxErrors.length > 0) {
        console.warn(
          `⚠️ Box CSV parsing errors (${significantBoxErrors.length} significant):`
        );
        significantBoxErrors
          .slice(0, 3)
          .forEach((error: CsvParseError, index: number) => {
            console.warn(
              `  Error ${index + 1}: Row ${error.rowIndex} - ${error.error}`
            );
            console.warn(`  Raw row: ${error.rawRow.substring(0, 100)}...`);
          });
      }

      // Parse skewed data if available
      const skewedParseResult = csvData.data.skewedData
        ? this.CSVParser.parseCSV(csvData.data.skewedData)
        : { rows: [], errors: [] };

      this.parsedData = {
        [GridMode.DIAMOND]: diamondParseResult.rows,
        [GridMode.BOX]: boxParseResult.rows,
        [GridMode.SKEWED]: skewedParseResult.rows,
        [GridMode.CENTRIC]: [],
        [GridMode.TRIGRID]: [],
        [GridMode.EIGHT_POINT]: [],
      };

      this.isInitialized = true;
    } catch (error) {
      console.error("❌ LetterQueryHandler: Error loading CSV data:", error);
      throw new Error(
        `Failed to load CSV data: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Get a specific pictograph by letter using CodexLetterMappingRepo
   */
  async getPictographByLetter(
    letter: Letter,
    gridMode: GridMode
  ): Promise<PictographData | null> {
    if (!this.letterMappingRepo) {
      console.error(
        "❌ CodexLetterMappingRepo not available for getPictographByLetter"
      );
      return null;
    }

    await this.ensureInitialized();

    try {
      // Convert Letter enum to string for repository lookup
      const letterString = letter.toString();

      // Get letter mapping from repository
      const mapping = this.letterMappingRepo.getLetterMapping(letterString);
      if (!mapping) {
        console.warn(`⚠️ No letter mapping found for letter: ${letterString}`);
        return null;
      }

      // Find matching CSV row
      const csvRow = this.findMatchingCsvRowByMapping(
        letterString,
        mapping,
        gridMode
      );
      if (!csvRow) {
        console.warn(`⚠️ No CSV data found for letter ${letter}`);
        return null;
      }

      // Transform CSV row to PictographData using existing service
      return this.csvPictographParser.parseCSVRowToPictograph(
        csvRow as unknown as CSVRow,
        gridMode
      );
    } catch (error) {
      console.error(`❌ Error getting pictograph for letter ${letter}:`, error);
      return null;
    }
  }

  /**
   * Get all pictographs from the codex using CodexLetterMappingRepo
   */
  async getAllCodexPictographs(gridMode: GridMode): Promise<PictographData[]> {
    if (!this.letterMappingRepo) {
      console.error(
        "❌ CodexLetterMappingRepo not available for getAllCodexPictographs"
      );
      return [];
    }

    await this.ensureInitialized();

    try {
      const allLetters = this.letterMappingRepo.getAllLetters();

      const pictographs: PictographData[] = [];
      for (const letterString of allLetters) {
        const letter = letterString as Letter; // Convert string to Letter enum
        const pictograph = await this.getPictographByLetter(letter, gridMode);
        if (pictograph) {
          pictographs.push(pictograph);
        }
      }

      return pictographs;
    } catch (error) {
      console.error("❌ Error getting all codex pictographs:", error);
      return [];
    }
  }

  /**
   * Get ALL pictograph variations from CSV data (not limited by letter mappings)
   * This returns every row in the CSV as a separate pictograph, including multiple variations per letter
   */
  async getAllPictographVariations(
    gridMode: GridMode
  ): Promise<PictographData[]> {
    await this.ensureInitialized();

    try {
      if (!this.parsedData) {
        console.error("❌ No parsed CSV data available");
        return [];
      }

      // Get CSV rows for the specified grid mode
      // For SKEWED, fall back to diamond only if no skewed data
      let csvRows = this.parsedData[gridMode];
      if (gridMode === GridMode.SKEWED && csvRows.length === 0) {
        csvRows = this.parsedData[GridMode.DIAMOND];
      }
      if (csvRows.length === 0) {
        console.error(`❌ No CSV data available for grid mode: ${gridMode}`);
        return [];
      }
      const actualGridMode = gridMode;

      const pictographs: PictographData[] = [];
      for (let i = 0; i < csvRows.length; i++) {
        const row = csvRows[i];
        try {
          const pictograph = this.csvPictographParser.parseCSVRowToPictograph(
            row as unknown as CSVRow,
            actualGridMode
          );
          pictographs.push(pictograph);
        } catch (error) {
          console.warn(
            `⚠️ Failed to convert CSV row ${i} (letter: ${row?.letter}):`,
            error
          );
        }
      }

      return pictographs;
    } catch (error) {
      console.error("❌ Error getting all pictograph variations:", error);
      return [];
    }
  }

  /**
   * Search pictographs by letter patterns
   */
  async searchPictographs(
    searchTerm: string,
    gridMode: GridMode
  ): Promise<PictographData[]> {
    if (!this.letterMappingRepo) {
      console.error(
        "❌ CodexLetterMappingRepo not available for searchPictographs"
      );
      return [];
    }

    await this.ensureInitialized();

    try {
      const allLetters = this.letterMappingRepo.getAllLetters();
      const matchingLetters = allLetters.filter((letter: string) =>
        letter.toLowerCase().includes(searchTerm.toLowerCase())
      );

      const pictographs: PictographData[] = [];
      for (const letterString of matchingLetters) {
        const letter = letterString as Letter; // Convert string to Letter enum
        const pictograph = await this.getPictographByLetter(letter, gridMode);
        if (pictograph) {
          pictographs.push(pictograph);
        }
      }

      return pictographs;
    } catch (error) {
      console.error(
        `❌ Error searching pictographs for "${searchTerm}":`,
        error
      );
      return [];
    }
  }

  /**
   * Get pictographs for multiple letters
   */
  async getPictographsByLetters(
    letters: Letter[],
    gridMode: GridMode
  ): Promise<PictographData[]> {
    await this.ensureInitialized();

    const pictographs: PictographData[] = [];
    for (const letter of letters) {
      const pictograph = await this.getPictographByLetter(letter, gridMode);
      if (pictograph) {
        pictographs.push(pictograph);
      }
    }

    return pictographs;
  }

  /**
   * Find matching CSV row by letter mapping
   */
  private findMatchingCsvRowByMapping(
    letter: string,
    mapping: CodexLetterMapping,
    gridMode: GridMode
  ): ParsedCsvRow | null {
    if (!this.parsedData) {
      return null;
    }

    // Get CSV rows for the specified grid mode, with fallback for SKEWED
    let csvRows = this.parsedData[gridMode];
    if (gridMode === GridMode.SKEWED && csvRows.length === 0) {
      csvRows = this.parsedData[GridMode.DIAMOND];
    }

    // Handle the mismatch between JSON config and LetterMapping interface
    const mappingData = mapping as CodexLetterMapping & {
      leftMotion?: MotionType;
      rightMotion?: MotionType;
    };
    const matchingRow = csvRows.find(
      (row: ParsedCsvRow) =>
        row.letter === letter &&
        row.startPlacement === mapping.startPlacement &&
        row.endPlacement === mapping.endPlacement &&
        row.leftMotionType ===
          String(mappingData.leftMotion ?? mappingData.leftMotionType) &&
        row.rightMotionType ===
          String(mappingData.rightMotion ?? mappingData.rightMotionType)
    );

    return matchingRow ?? null;
  }
}

// Direct singleton export for HMR-friendly imports
import { csvLoader } from "../../../foundation/services/data/csv-loader";
import { csvParser } from "../../../foundation/services/implementations/data/csv-parser";
import { csvPictographParser } from "../../shared/services/csv-pictograph-parser";

export const letterQueryHandler = new LetterQueryHandler(
  csvLoader,
  csvParser,
  csvPictographParser
);
