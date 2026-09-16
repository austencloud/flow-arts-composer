/**
 * TikaPictographLoader - Loads and caches TKA pictograph data
 *
 * Handles CSV parsing for diamond/box mode pictographs,
 * canonical glossary and letter types,
 * and builds position mapping indexes for sequence validation.
 */

import fs from "fs";
import path from "path";
import {
  GLOSSARY,
  LETTER_TYPES,
  type GlossaryEntry,
  type LetterTypeDefinition,
} from "@tka/domain";

export interface MotionData {
  hand: "left" | "right";
  startLocation: string;
  endLocation: string;
  motionType: string;
  rotationDirection: string;
}
export interface PictographData {
  letter: string;
  startPlacement: string;
  endPlacement: string;
  timing: string;
  direction: string;
  leftMotion: MotionData;
  rightMotion: MotionData;
}
export interface PictographDataWithMode extends PictographData {
  gridMode: "diamond" | "box";
}
export interface LetterPositionMapping {
  startPlacement: string;
  endPlacement: string;
  startGroup: string;
  endGroup: string;
}

export class TikaPictographLoader {
  private allPictographs: PictographData[] = [];
  private diamondPictographs: PictographDataWithMode[] = [];
  private boxPictographs: PictographDataWithMode[] = [];
  private letterPositionMappings: Record<string, LetterPositionMapping> = {};
  private bridgeLettersByTransition: Record<string, string[]> = {};

  private dataLoaded = false;
  private positionMappingsLoaded = false;

  ensureLoaded(): void {
    if (!this.dataLoaded) {
      this.loadDataframe();
      this.dataLoaded = true;
    }
    if (!this.positionMappingsLoaded) {
      this.loadLetterPositionMappings();
      this.positionMappingsLoaded = true;
    }
  }

  getAllPictographs(): PictographData[] {
    this.ensureLoaded();
    return this.allPictographs;
  }

  getDiamondPictographs(): PictographDataWithMode[] {
    this.ensureLoaded();
    return this.diamondPictographs;
  }

  getBoxPictographs(): PictographDataWithMode[] {
    this.ensureLoaded();
    return this.boxPictographs;
  }

  getGlossary(): Record<string, GlossaryEntry> {
    return GLOSSARY;
  }

  getLetterTypes(): Record<string, LetterTypeDefinition> {
    return LETTER_TYPES;
  }

  getLetterPositionMappings(): Record<string, LetterPositionMapping> {
    this.ensureLoaded();
    return this.letterPositionMappings;
  }

  getBridgeLettersByTransition(): Record<string, string[]> {
    this.ensureLoaded();
    return this.bridgeLettersByTransition;
  }

  getLetterVariations(letter: string): PictographData[] {
    this.ensureLoaded();
    return this.allPictographs.filter((p) => p.letter === letter);
  }

  getLetterVariationsByMode(
    letter: string,
    gridMode: "diamond" | "box"
  ): PictographDataWithMode[] {
    this.ensureLoaded();
    const source =
      gridMode === "diamond" ? this.diamondPictographs : this.boxPictographs;
    return source.filter((p) => p.letter === letter);
  }

  private loadDataframe(): void {
    try {
      const diamondPath = path.join(
        process.cwd(),
        "static",
        "data",
        "pictographs",
        "DiamondPictographDataframe.csv"
      );
      this.diamondPictographs = this.loadCsvFile(diamondPath, "diamond");

      const boxPath = path.join(
        process.cwd(),
        "static",
        "data",
        "pictographs",
        "BoxPictographDataframe.csv"
      );
      this.boxPictographs = this.loadCsvFile(boxPath, "box");

      this.allPictographs = [
        ...this.diamondPictographs,
        ...this.boxPictographs,
      ];
    } catch (error) {
      console.error("[TikaPictographLoader] Failed to load dataframe:", error);
    }
  }

  private loadCsvFile(
    csvPath: string,
    gridMode: "diamond" | "box"
  ): PictographDataWithMode[] {
    try {
      const csvContent = fs.readFileSync(csvPath, "utf-8");
      const lines = csvContent.trim().split("\n");
      if (lines.length < 2) return [];

      const headerLine = lines[0];
      if (!headerLine) return [];
      const headers = headerLine.split(",").map((h) => h.trim());
      const pictographs: PictographDataWithMode[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const values = line.split(",").map((v) => v.trim());
        const row: Record<string, string> = {};
        headers.forEach((header, index) => {
          row[header] = values[index] ?? "";
        });

        pictographs.push({
          letter: row["letter"] ?? "",
          // Accept the pre-rename header spelling too, matching the browser
          // CSV parsers' fallback — this file reads dataframe CSVs straight
          // off disk with no cache layer, but a hand-edited or older fixture
          // file could still carry the old header.
          startPlacement: row["startPlacement"] ?? row["startPosition"] ?? "",
          endPlacement: row["endPlacement"] ?? row["endPosition"] ?? "",
          timing: row["timing"] ?? "",
          direction: row["direction"] ?? "",
          gridMode,
          leftMotion: {
            hand: "left",
            startLocation: row["blueStartLocation"] ?? "",
            endLocation: row["blueEndLocation"] ?? "",
            motionType: row["blueMotionType"] ?? "",
            rotationDirection: row["blueRotationDirection"] ?? "",
          },
          rightMotion: {
            hand: "right",
            startLocation: row["redStartLocation"] ?? "",
            endLocation: row["redEndLocation"] ?? "",
            motionType: row["redMotionType"] ?? "",
            rotationDirection: row["redRotationDirection"] ?? "",
          },
        });
      }

      return pictographs;
    } catch (error) {
      console.error(
        `[TikaPictographLoader] Failed to load ${gridMode} dataframe:`,
        error
      );
      return [];
    }
  }

  private loadLetterPositionMappings(): void {
    try {
      const mappingsPath = path.join(
        process.cwd(),
        "static",
        "data",
        "learn",
        "letter-mappings.json"
      );
      if (!fs.existsSync(mappingsPath)) {
        console.warn(
          "[TikaPictographLoader] letter-mappings.json not found, validation will use fallback"
        );
        return;
      }

      const data = JSON.parse(fs.readFileSync(mappingsPath, "utf-8"));

      for (const [letter, mapping] of Object.entries(data.letters)) {
        const m = mapping as { startPlacement: string; endPlacement: string };
        this.letterPositionMappings[letter] = {
          startPlacement: m.startPlacement,
          endPlacement: m.endPlacement,
          startGroup: this.extractPlacementGroup(m.startPlacement),
          endGroup: this.extractPlacementGroup(m.endPlacement),
        };
      }

      const lettersByTransition: Record<string, string[]> = {};
      for (const [letter, mapping] of Object.entries(
        this.letterPositionMappings
      )) {
        const transition = `${mapping.startGroup}->${mapping.endGroup}`;
        if (!lettersByTransition[transition]) {
          lettersByTransition[transition] = [];
        }
        lettersByTransition[transition].push(letter);
      }
      this.bridgeLettersByTransition = lettersByTransition;
    } catch (error) {
      console.error(
        "[TikaPictographLoader] Failed to load letter-mappings.json:",
        error
      );
    }
  }

  private extractPlacementGroup(position: string): string {
    if (position.startsWith("alpha")) return "alpha";
    if (position.startsWith("beta")) return "beta";
    if (position.startsWith("gamma")) return "gamma";
    if (position.startsWith("zeta")) return "zeta";
    if (position.startsWith("eta")) return "eta";
    return "unknown";
  }
}
