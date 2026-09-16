import type {
  CSVParseResult as CsvParseResult,
  ParsedCsvRow,
} from "$lib/shared/foundation/domain/models/csv-models";

interface CsvParseError {
  error: string;
  rowIndex?: number;
  rawRow: string;
  lineNumber: number;
}

export function parse(csvContent: string): Record<string, unknown>[] {
  const result = parseCSV(csvContent);
  return result.rows;
}

export function parseRow(row: string): string[] {
  return row.split(",").map((cell) => cell.trim());
}

export function parseCSV(csvText: string): CsvParseResult {
  const result: CsvParseResult = {
    headers: [],
    rows: [],
    totalRows: 0,
    successfulRows: 0,
    errors: [],
    isValid: true,
  };

  try {
    const lines = csvText.trim().split("\n");

    if (lines.length < 2) {
      result.errors.push({
        rowIndex: 0,
        lineNumber: 0,
        error: "CSV must have at least header and one data row",
        rawRow: csvText,
      });
      return result;
    }

    const headerLine = lines[0];
    if (!headerLine) {
      result.errors.push({
        rowIndex: 0,
        lineNumber: 0,
        error: "Missing header line",
        rawRow: "",
      });
      return result;
    }
    result.headers = headerLine.split(",").map((h) => h.trim());
    result.totalRows = lines.length - 1; // Exclude header

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      try {
        const line = lines[i]?.trim();
        if (!line) {
          continue;
        }

        // Skip completely empty lines
        if (!line || line === "") {
          continue;
        }

        const values = line.split(",").map((v) => v.trim());

        // Skip rows that are just commas (empty CSV cells)
        if (values.every((v) => v === "")) {
          continue;
        }

        const row = createRowFromValues(result.headers, values);

        if (isValidRow(row)) {
          result.rows.push(row);
          result.successfulRows++;
        } else {
          result.errors.push({
            rowIndex: i,
            lineNumber: i,
            error: "Row validation failed - missing required fields",
            rawRow: lines[i] ?? "",
          });
        }
      } catch (error) {
        result.errors.push({
          rowIndex: i,
          lineNumber: i,
          error:
            error instanceof Error ? error.message : "Unknown parsing error",
          rawRow: lines[i] ?? "",
        });
      }
    }

    return result;
  } catch (error) {
    result.errors.push({
      rowIndex: 0,
      lineNumber: 0,
      error: `CSV parsing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      rawRow: csvText.substring(0, 100) + "...",
    });
    return result;
  }
}

export function parseCSVToRows(csvText: string): ParsedCsvRow[] {
  const result = parseCSV(csvText);

  if (result.errors.length > 0) {
    console.warn(
      `⚠️ CSV parsing had ${result.errors.length} errors out of ${result.totalRows} rows`
    );
    result.errors.forEach((error: CsvParseError) => {
      console.warn(`⚠️ Row ${error.rowIndex}: ${error.error}`);
    });
  }

  return result.rows;
}

export function validateCSVStructure(csvText: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!csvText || csvText.trim().length === 0) {
    errors.push("CSV text is empty");
    return { isValid: false, errors };
  }

  const lines = csvText.trim().split("\n");

  if (lines.length < 2) {
    errors.push("CSV must have at least a header row and one data row");
    return { isValid: false, errors };
  }

  // Check header structure
  const headerLine = lines[0];
  if (!headerLine) {
    errors.push("Missing header line");
    return { isValid: false, errors };
  }
  const headers = headerLine.split(",").map((h) => h.trim());
  // Each entry accepts either the canonical or the pre-rename header
  // spelling, matching the createRowFromValues fallback below.
  const requiredHeaders: ReadonlyArray<readonly string[]> = [
    ["letter"],
    ["startPlacement", "startPosition"],
    ["endPlacement", "endPosition"],
  ];

  for (const accepted of requiredHeaders) {
    if (!accepted.some((name) => headers.includes(name))) {
      errors.push(`Missing required header: ${accepted[0]}`);
    }
  }

  // Check for consistent column count
  const headerCount = headers.length;
  for (let i = 1; i < Math.min(lines.length, 10); i++) {
    // Check first 10 rows
    const line = lines[i];
    if (!line) continue;
    const columnCount = line.split(",").length;
    if (columnCount !== headerCount) {
      errors.push(
        `Row ${i} has ${columnCount} columns, expected ${headerCount}`
      );
    }
  }

  return { isValid: errors.length === 0, errors };
}

export function createRowFromValues(
  headers: string[],
  values: string[]
): ParsedCsvRow {
  const row: Record<string, string> = {};

  headers.forEach((header, index) => {
    row[header] = values[index] ?? "";
  });

  return {
    letter: row["letter"] || "",
    // Defense in depth alongside the csv-loader IndexedDB cache-key bump:
    // accept the pre-rename header spelling too, so any CSV text that still
    // has an old header row still parses instead of coming back with empty
    // placements.
    startPlacement: row["startPlacement"] || row["startPosition"] || "",
    endPlacement: row["endPlacement"] || row["endPosition"] || "",
    timing: row["timing"] || "",
    direction: row["direction"] || "",
    leftMotionType: row["blueMotionType"] || "",
    leftRotationDirection: row["blueRotationDirection"] || "",
    leftStartLocation: row["blueStartLocation"] || row["blueStartLoc"] || "",
    leftEndLocation: row["blueEndLocation"] || row["blueEndLocation"] || "",
    rightMotionType: row["redMotionType"] || "",
    rightRotationDirection: row["redRotationDirection"] || "",
    rightStartLocation: row["redStartLocation"] || row["redStartLoc"] || "",
    rightEndLocation: row["redEndLocation"] || row["redEndLocation"] || "",
    ...row,
  } as ParsedCsvRow;
}

function isValidRow(row: ParsedCsvRow): boolean {
  const hasLetter = !!(row["letter"] && row["letter"].trim() !== "");
  const hasStartPlacement = !!(
    row["startPlacement"] && row["startPlacement"].trim() !== ""
  );
  const hasEndPlacement = !!(
    row["endPlacement"] && row["endPlacement"].trim() !== ""
  );

  return hasLetter && hasStartPlacement && hasEndPlacement;
}

export function getColumnMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};

  // Handle common variations in column names
  const variations: Record<string, string[]> = {
    leftStartLocation: [
      "blueStartLocation",
      "blueStartLoc",
      "blue_start_location",
    ],
    leftEndLocation: ["blueEndLocation", "blueEndLocation", "blue_end_location"],
    rightStartLocation: ["redStartLocation", "redStartLoc", "red_start_location"],
    rightEndLocation: ["redEndLocation", "redEndLocation", "red_end_location"],
  };

  for (const [standardName, variants] of Object.entries(variations)) {
    for (const variant of variants) {
      if (headers.includes(variant)) {
        mapping[standardName] = variant;
        break;
      }
    }
  }

  return mapping;
}

/**
 * Object bundle of the CSV-parser functions, retained so existing
 * dependency-injection call sites (MotionQueryHandler, LetterQueryHandler)
 * keep an object to call `.parseCSV(...)` etc. on. The class wrapper was
 * dissolved into the module-level functions above.
 */
export const csvParser = {
  parse,
  parseRow,
  parseCSV,
  parseCSVToRows,
  validateCSVStructure,
  createRowFromValues,
  getColumnMapping,
};

/** Structural type of the CSV-parser bundle, for DI parameter typing. */
export type CSVParser = typeof csvParser;
