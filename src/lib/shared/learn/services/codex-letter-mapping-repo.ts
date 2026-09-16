/**
 * Letter Mapping Repo Implementation
 *
 * Service implementation for letter mapping management and codex configuration.
 * Handles letter mappings, categories, and validation.
 */

import { MotionType } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type {
  CodexConfig,
  CodexLetterMapping,
  CodexLetterRow,
} from "$lib/shared/learn/domain/codex-models";
import { createLetterMapping } from "$lib/shared/learn/domain/codex-models";

/**
 * Raw shape of /data/learn/letter-mappings.json.
 *
 * Motion values arrive as strings ("pro", "anti", ...) and row/category names
 * use the JSON file's own vocabulary (e.g. "dual-shift", "cross-shift"), which
 * is wider than the LetterCategory union — so both are converted/narrowed
 * before entering CodexConfig.
 */
interface LetterMappingsJson {
  letters: Record<
    string,
    {
      startPlacement: string;
      endPlacement: string;
      leftMotion: string;
      rightMotion: string;
    }
  >;
  rows: Array<{ index: number; category: string; letters: string[] }>;
  categories: Record<string, string[]>;
}

export class CodexLetterMappingRepo {
  private configuration: CodexConfig | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Load codex configuration
      await this.loadCodexConfig();
      this.initialized = true;
    } catch (error) {
      console.error("Failed to initialize CodexLetterMappingRepo:", error);
      throw error;
    }
  }

  getLetterMapping(letter: string): CodexLetterMapping | null {
    if (!this.initialized || !this.configuration) {
      console.warn(
        "CodexLetterMappingRepo not initialized. Call initialize() first."
      );
      return null;
    }

    // Find letter mapping in configuration
    const letterMapping = this.configuration.letters[letter];
    if (letterMapping) {
      return letterMapping;
    }

    return null;
  }

  getLetterRows(): CodexLetterRow[] {
    if (!this.initialized || !this.configuration) {
      console.warn(
        "CodexLetterMappingRepo not initialized. Call initialize() first."
      );
      return [];
    }

    return this.configuration.rows;
  }

  getAllLetters(): string[] {
    if (!this.initialized || !this.configuration) {
      console.warn(
        "CodexLetterMappingRepo not initialized. Call initialize() first."
      );
      return [];
    }

    const letters: string[] = [];
    for (const letterKey in this.configuration.letters) {
      letters.push(letterKey);
    }

    return letters;
  }

  isValidLetter(letter: string): boolean {
    return this.getLetterMapping(letter) !== null;
  }

  private async loadCodexConfig(): Promise<void> {
    try {
      // Load from actual codex configuration file
      const response = await fetch("/data/learn/letter-mappings.json");
      if (!response.ok) {
        throw new Error(`Failed to fetch letter mappings: ${response.status}`);
      }

      const data = (await response.json()) as LetterMappingsJson;

      // Convert the JSON data to our internal format
      const letters: Record<string, CodexLetterMapping> = {};
      for (const [letter, mapping] of Object.entries(data.letters)) {
        letters[letter] = createLetterMapping({
          startPlacement: mapping.startPlacement,
          endPlacement: mapping.endPlacement,
          leftMotionType: this.mapMotionString(mapping.leftMotion),
          rightMotionType: this.mapMotionString(mapping.rightMotion),
        });
      }

      this.configuration = {
        version: "1.0.0",
        letters,
        // Known divergence: the JSON's category vocabulary is wider than the
        // LetterCategory union (e.g. "dual-shift"). Narrowed here at the
        // boundary, matching the pre-existing runtime behavior.
        rows: data.rows as CodexConfig["rows"],
        categories: data.categories as CodexConfig["categories"],
      };
    } catch (error) {
      console.error("Failed to load codex configuration:", error);
      throw error;
    }
  }

  private mapMotionString(motionString: string | unknown): MotionType {
    const motionStr =
      typeof motionString === "string" ? motionString : String(motionString);
    switch (motionStr.toLowerCase()) {
      case "pro":
        return MotionType.PRO;
      case "anti":
        return MotionType.ANTI;
      case "static":
        return MotionType.STATIC;
      case "dash":
        return MotionType.DASH;
      default:
        console.warn(`Unknown motion type: ${motionStr}, defaulting to PRO`);
        return MotionType.PRO;
    }
  }
}
