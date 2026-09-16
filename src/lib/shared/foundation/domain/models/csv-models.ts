/**
 * CSV Parsing Models
 *
 * Interface definitions for CSV parsing results and row structures.
 * These represent the core data structures used across the application.
 */

/**
 * Parsed CSV row structure
 */
export interface ParsedCsvRow {
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
  // Add index signature to make it compatible with Record<string, string>
  [key: string]: string;
}

/**
 * CSV parsing result structure
 */
export interface CSVParseResult {
  headers: string[];
  rows: ParsedCsvRow[];
  totalRows: number;
  successfulRows: number;
  errors: Array<{
    error: string;
    rawRow: string;
    lineNumber: number;
    rowIndex?: number;
  }>;
  isValid: boolean;
}

/**
 * CSV dataset structure
 */
export interface CsvDataSet {
  diamondData: string;
  boxData: string;
  skewedData?: string;
  trigridData?: string;
}
