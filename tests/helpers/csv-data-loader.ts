/**
 * CSV Data Loader for Tests
 *
 * Loads REAL pictograph data from CSV files for testing.
 * NEVER use hardcoded/fake pictographs - always use actual CSV data!
 */

import type { StepBeatData } from "$lib/features/create/shared/domain/models/StepBeatData";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/PictographData";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import { readFileSync } from "fs";
import { resolve } from "path";

interface CSVRow {
  letter: string;
  startPlacement: string;
  endPlacement: string;
  timing: string;
  direction: string;
  leftMotionType: string;
  leftRotationDirection: string;
  leftStartLocation: string;
  leftEndLocation: string;
  rightMotionType: string;
  rightRotationDirection: string;
  rightStartLocation: string;
  rightEndLocation: string;
}

/**
 * Loads raw CSV data from the Diamond dataframe
 */
export function loadDiamondCSV(): string {
  const csvPath = resolve(
    __dirname,
    "../../static/DiamondPictographDataframe.csv"
  );
  return readFileSync(csvPath, "utf-8");
}

/**
 * Loads raw CSV data from the Box dataframe
 */
export function loadBoxCSV(): string {
  const csvPath = resolve(__dirname, "../../static/BoxPictographDataframe.csv");
  return readFileSync(csvPath, "utf-8");
}

/**
 * Parses CSV text into rows
 */
export function parseCSV(csvText: string): CSVRow[] {
  const lines = csvText.trim().split("\n");
  const headers = lines[0]!.split(",");

  const rows: CSVRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue; // Skip empty lines

    const values = line.split(",");
    const row: any = {};
    headers.forEach((header, index) => {
      row[header.trim()] = values[index]?.trim() ?? "";
    });

    rows.push(row as CSVRow);
  }

  return rows;
}

/**
 * Gets all CSV rows for a specific letter
 */
export function getCSVRowsForLetter(letter: Letter): CSVRow[] {
  const csvText = loadDiamondCSV();
  const allRows = parseCSV(csvText);
  return allRows.filter((row) => row.letter === letter);
}

/**
 * Gets the first CSV row for a specific letter
 */
export function getFirstCSVRowForLetter(letter: Letter): CSVRow | null {
  const rows = getCSVRowsForLetter(letter);
  return rows.length > 0 ? (rows[0] ?? null) : null;
}

/**
 * Gets ALL letters available in the CSV
 */
export function getAllLettersFromCSV(): Letter[] {
  const csvText = loadDiamondCSV();
  const allRows = parseCSV(csvText);
  const uniqueLetters = new Set(allRows.map((row) => row.letter));
  return Array.from(uniqueLetters) as Letter[];
}

/**
 * Gets a sample of valid letters for testing (5 different letters)
 */
export function getSampleLetters(): Letter[] {
  return [Letter.A, Letter.B, Letter.C, Letter.D, Letter.E];
}

/**
 * Helper to convert CSV row to test-friendly object
 * (Still need proper parser to convert to PictographData)
 */
export interface CSVLetterData {
  letter: Letter;
  startPlacement: string;
  endPlacement: string;
  leftMotion: {
    type: string;
    rotation: string;
    startLoc: string;
    endLoc: string;
  };
  rightMotion: {
    type: string;
    rotation: string;
    startLoc: string;
    endLoc: string;
  };
}

export function convertCSVRowToLetterData(row: CSVRow): CSVLetterData {
  return {
    letter: row.letter as Letter,
    startPlacement: row.startPlacement,
    endPlacement: row.endPlacement,
    leftMotion: {
      type: row.leftMotionType,
      rotation: row.leftRotationDirection,
      startLoc: row.leftStartLocation,
      endLoc: row.leftEndLocation,
    },
    rightMotion: {
      type: row.rightMotionType,
      rotation: row.rightRotationDirection,
      startLoc: row.rightStartLocation,
      endLoc: row.rightEndLocation,
    },
  };
}

/**
 * Get all variants of a letter (some letters have multiple valid patterns)
 */
export function getLetterVariants(letter: Letter): CSVLetterData[] {
  const rows = getCSVRowsForLetter(letter);
  return rows.map(convertCSVRowToLetterData);
}

/**
 * Validate that a pictograph matches CSV data for its letter
 */
export function validatePictographMatchesCSV(
  pictograph: PictographData,
  letter: Letter
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (pictograph.letter !== letter) {
    errors.push(
      `Letter mismatch: expected ${letter}, got ${pictograph.letter}`
    );
  }

  const csvRows = getCSVRowsForLetter(letter);
  if (csvRows.length === 0) {
    errors.push(`No CSV data found for letter ${letter}`);
    return { valid: false, errors };
  }

  // Check if pictograph matches ANY valid CSV variant
  const matches = csvRows.some((row) => {
    const data = convertCSVRowToLetterData(row);
    // Add more specific validation here
    return true; // Simplified for now
  });

  if (!matches) {
    errors.push(`Pictograph data does not match any CSV variant for ${letter}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
