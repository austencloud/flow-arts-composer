/**
 * Skewed Pictograph Dataframe Generator
 *
 * Generates SkewedPictographDataframe.csv by applying skew operations to
 * existing Diamond and Box pictographs.
 *
 * Skew = modified shift that crosses grid boundary (cardinal <-> intercardinal)
 *
 * Run with: npx tsx scripts/generate-skewed-dataframe.ts
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Location types
type CardinalLocation = "n" | "e" | "s" | "w";
type IntercardinalLocation = "ne" | "se" | "sw" | "nw";
type Location = CardinalLocation | IntercardinalLocation;

// Grid location cycle (8 positions, 45° apart)
const LOCATION_CYCLE: Location[] = [
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
  "nw",
];

const CARDINAL_LOCATIONS = new Set<Location>(["n", "e", "s", "w"]);
const INTERCARDINAL_LOCATIONS = new Set<Location>(["ne", "se", "sw", "nw"]);

type SkewDir = "+" | "-" | "";
type MotionType = "pro" | "anti" | "static" | "dash" | "float";
type HandPath = "cw" | "ccw" | "dash" | "static";

interface PictographRow {
  letter: string;
  startPlacement: string;
  endPlacement: string;
  timing: string;
  direction: string;
  leftMotionType: MotionType;
  leftRotationDirection: string;
  leftStartLocation: Location;
  leftEndLocation: Location;
  rightMotionType: MotionType;
  rightRotationDirection: string;
  rightStartLocation: Location;
  rightEndLocation: Location;
}

interface SkewedRow extends PictographRow {
  leftSkewDir: SkewDir;
  rightSkewDir: SkewDir;
  leftHandPath: HandPath;
  rightHandPath: HandPath;
  leftSkewSteps: number;
  rightSkewSteps: number;
  category: 1 | 2; // 1 = ends skewed (zeta/eta), 2 = both skew but ends normal
}

// Classify which category a skewed motion belongs to
function classifyCategory(
  endPlacement: string,
  leftSkewDir: SkewDir,
  rightSkewDir: SkewDir
): 1 | 2 {
  const isSkewedEnd =
    endPlacement.startsWith("zeta") || endPlacement.startsWith("eta");

  // Category 1: Ends in a skewed position (one hand in each grid type)
  if (isSkewedEnd) return 1;

  // Category 2: Both hands skewed but ended in same grid type (normal position)
  // This happens when both hands cross the boundary together
  return 2;
}

// Helper to get index in location cycle
function getLocationIndex(loc: Location): number {
  return LOCATION_CYCLE.indexOf(loc);
}

// Apply skew to a location (cross grid boundary)
function applySkew(loc: Location, skewDir: "+" | "-"): Location {
  const idx = getLocationIndex(loc);
  const offset = skewDir === "+" ? 1 : -1;
  const newIdx = (idx + offset + 8) % 8;
  return LOCATION_CYCLE[newIdx];
}

// Check if location is cardinal
function isCardinal(loc: Location): boolean {
  return CARDINAL_LOCATIONS.has(loc);
}

// Check if a motion is shiftable (can have skew applied)
function isShiftableMotion(motionType: MotionType): boolean {
  // Only pro and anti motions can be skew (not static, dash, or float)
  return motionType === "pro" || motionType === "anti";
}

// Derive hand path from motion type and rotation direction
// Pro: hand follows prop rotation (CW rotation = CW hand path)
// Anti: hand opposes prop rotation (CW rotation = CCW hand path)
// Float: must be specified explicitly (determined by skew direction for skewed floats)
// Static/Dash: special cases
function deriveHandPath(
  motionType: MotionType,
  rotationDirection: string,
  skewDir: SkewDir
): HandPath {
  if (motionType === "static") return "static";
  if (motionType === "dash") return "dash";

  if (motionType === "pro") {
    // Pro: hand path matches rotation direction
    return rotationDirection === "cw" ? "cw" : "ccw";
  }

  if (motionType === "anti") {
    // Anti: hand path opposes rotation direction
    return rotationDirection === "cw" ? "ccw" : "cw";
  }

  if (motionType === "float") {
    // Float: derive from skew direction
    // + skew = CW step in location cycle
    // - skew = CCW step in location cycle
    if (skewDir === "+") return "cw";
    if (skewDir === "-") return "ccw";
    // Non-skewing float - would need external context
    return "cw"; // Default, should be explicitly set
  }

  return "cw"; // Fallback
}

// Derive the natural rotation direction for a path from start to end
// Returns the direction that takes the shorter path around the circle
function deriveNaturalRotationDirection(
  start: Location,
  end: Location
): "cw" | "ccw" | "no_rotation" {
  if (start === end) return "no_rotation";

  const startIdx = getLocationIndex(start);
  const endIdx = getLocationIndex(end);

  // Calculate CW steps (positive direction in array)
  const cwSteps = (endIdx - startIdx + 8) % 8;
  // CCW steps is the complement
  const ccwSteps = 8 - cwSteps;

  // Return the direction with fewer steps (shorter path)
  // If equal (180°), prefer CW
  return cwSteps <= ccwSteps ? "cw" : "ccw";
}

// Check if a motion crosses grid boundary (cardinal <-> intercardinal)
function crossesBoundary(start: Location, end: Location): boolean {
  return isCardinal(start) !== isCardinal(end);
}

// Calculate angular steps between two locations (0-4, where 4 = opposite)
function getAngularSteps(start: Location, end: Location): number {
  const startIdx = getLocationIndex(start);
  const endIdx = getLocationIndex(end);
  const diff = Math.abs(endIdx - startIdx);
  // Return the shorter path (clockwise or counterclockwise)
  return Math.min(diff, 8 - diff);
}

// Determine what motion type a start->end movement actually is
function determineMotionType(
  start: Location,
  end: Location,
  originalType: MotionType
): MotionType | null {
  if (start === end) {
    return "static";
  }

  const steps = getAngularSteps(start, end);

  // 4 steps = 180° = dash (opposite)
  if (steps === 4) {
    return "dash";
  }

  // 1-2 steps = 45°-90° = shift-like motion (pro/anti)
  // Keep the original rotation type (pro vs anti)
  if (steps === 1 || steps === 2) {
    return originalType === "pro" || originalType === "anti"
      ? originalType
      : null;
  }

  // 3 steps = 135° - this is a valid skewed motion for pro/anti
  if (steps === 3) {
    return originalType === "pro" || originalType === "anti"
      ? originalType
      : null;
  }

  return null;
}

// Validate that a skewed motion is still valid
function isValidSkewedMotion(
  start: Location,
  end: Location,
  claimedType: MotionType
): boolean {
  const actualType = determineMotionType(start, end, claimedType);

  // If motion became a dash but we claim it's pro/anti, that's invalid
  if (
    actualType === "dash" &&
    (claimedType === "pro" || claimedType === "anti")
  ) {
    return false;
  }

  // If motion became static but we claim it's something else, invalid
  if (actualType === "static" && claimedType !== "static") {
    return false;
  }

  return actualType !== null;
}

// Derive end position name from hand locations
function deriveEndPlacement(left: Location, right: Location): string {
  // Map of (blue, red) -> position
  const positionMap: Record<string, string> = {
    // Alpha positions (180°)
    "s,n": "alpha1",
    "sw,ne": "alpha2",
    "w,e": "alpha3",
    "nw,se": "alpha4",
    "n,s": "alpha5",
    "ne,sw": "alpha6",
    "e,w": "alpha7",
    "se,nw": "alpha8",

    // Beta positions (0°)
    "n,n": "beta1",
    "ne,ne": "beta2",
    "e,e": "beta3",
    "se,se": "beta4",
    "s,s": "beta5",
    "sw,sw": "beta6",
    "w,w": "beta7",
    "nw,nw": "beta8",

    // Gamma positions (90°)
    "w,n": "gamma1",
    "nw,ne": "gamma2",
    "n,e": "gamma3",
    "ne,se": "gamma4",
    "e,s": "gamma5",
    "se,sw": "gamma6",
    "s,w": "gamma7",
    "sw,nw": "gamma8",
    "e,n": "gamma9",
    "se,ne": "gamma10",
    "s,e": "gamma11",
    "sw,se": "gamma12",
    "w,s": "gamma13",
    "nw,sw": "gamma14",
    "n,w": "gamma15",
    "ne,nw": "gamma16",

    // Zeta positions (135°)
    "sw,n": "zeta1",
    "w,ne": "zeta2",
    "nw,e": "zeta3",
    "n,se": "zeta4",
    "ne,s": "zeta5",
    "e,sw": "zeta6",
    "se,w": "zeta7",
    "s,nw": "zeta8",
    "se,n": "zeta9",
    "s,ne": "zeta10",
    "sw,e": "zeta11",
    "w,se": "zeta12",
    "nw,s": "zeta13",
    "n,sw": "zeta14",
    "ne,w": "zeta15",
    "e,nw": "zeta16",

    // Eta positions (45°)
    "nw,n": "eta1",
    "n,ne": "eta2",
    "ne,e": "eta3",
    "e,se": "eta4",
    "se,s": "eta5",
    "s,sw": "eta6",
    "sw,w": "eta7",
    "w,nw": "eta8",
    "ne,n": "eta9",
    "e,ne": "eta10",
    "se,e": "eta11",
    "s,se": "eta12",
    "sw,s": "eta13",
    "w,sw": "eta14",
    "nw,w": "eta15",
    "n,nw": "eta16",
  };

  const key = `${left},${right}`;
  return positionMap[key] || `unknown_${key}`;
}

// Parse CSV row
function parseRow(line: string, header: string[]): PictographRow | null {
  const values = line.split(",");
  if (values.length !== header.length) return null;

  const row: Record<string, string> = {};
  header.forEach((col, i) => (row[col] = values[i].trim())); // TRIM whitespace!

  return {
    letter: row.letter,
    startPlacement: row.startPlacement,
    endPlacement: row.endPlacement,
    timing: row.timing,
    direction: row.direction,
    leftMotionType: row.leftMotionType as MotionType,
    leftRotationDirection: row.leftRotationDirection,
    leftStartLocation: row.leftStartLocation.toLowerCase() as Location,
    leftEndLocation: row.leftEndLocation.toLowerCase() as Location,
    rightMotionType: row.rightMotionType as MotionType,
    rightRotationDirection: row.rightRotationDirection,
    rightStartLocation: row.rightStartLocation.toLowerCase() as Location,
    rightEndLocation: row.rightEndLocation.toLowerCase() as Location,
  };
}

// Generate skewed variants from a base pictograph
function generateSkewedVariants(base: PictographRow): SkewedRow[] {
  const variants: SkewedRow[] = [];

  const leftCanSkew = isShiftableMotion(base.leftMotionType);
  const rightCanSkew = isShiftableMotion(base.rightMotionType);

  // If neither hand can skew, no variants possible
  if (!leftCanSkew && !rightCanSkew) return [];

  // Generate all combinations of skew directions (including no skew for each hand)
  const leftOptions: SkewDir[] = leftCanSkew ? ["+", "-", ""] : [""];
  const rightOptions: SkewDir[] = rightCanSkew ? ["+", "-", ""] : [""];

  for (const leftSkewDir of leftOptions) {
    for (const rightSkewDir of rightOptions) {
      // Skip the case where neither hand skews
      if (leftSkewDir === "" && rightSkewDir === "") continue;


      // Calculate new end locations
      const newLeftEnd =
        leftSkewDir !== ""
          ? applySkew(base.leftEndLocation, leftSkewDir)
          : base.leftEndLocation;

      const newRightEnd =
        rightSkewDir !== ""
          ? applySkew(base.rightEndLocation, rightSkewDir)
          : base.rightEndLocation;

      // Verify at least one hand crosses boundary (that's what makes it "skewed")
      const leftCrosses =
        leftSkewDir !== "" &&
        crossesBoundary(base.leftStartLocation, newLeftEnd);
      const rightCrosses =
        rightSkewDir !== "" && crossesBoundary(base.rightStartLocation, newRightEnd);

      if (!leftCrosses && !rightCrosses) continue;

      // Derive the new end position
      const newEndPlacement = deriveEndPlacement(newLeftEnd, newRightEnd);

      // Skip if we get an unknown position
      if (newEndPlacement.startsWith("unknown_")) {
        console.warn(
          `Unknown position for ${newLeftEnd},${newRightEnd} from ${base.letter}`
        );
        continue;
      }

      const category = classifyCategory(newEndPlacement, leftSkewDir, rightSkewDir);

      // Determine if each motion actually crossed the boundary (cardinal <-> intercardinal)
      const leftActuallyCrossed = crossesBoundary(base.leftStartLocation, newLeftEnd);
      const rightActuallyCrossed = crossesBoundary(base.rightStartLocation, newRightEnd);

      // Derive the correct rotation direction for the new paths
      // For pro: rotation direction = hand path direction
      // For anti: rotation direction = opposite of hand path direction
      const leftNaturalDir = deriveNaturalRotationDirection(
        base.leftStartLocation,
        newLeftEnd
      );
      const rightNaturalDir = deriveNaturalRotationDirection(
        base.rightStartLocation,
        newRightEnd
      );

      // Determine actual rotation directions based on motion type and natural path
      // Pro motions: prop rotates same direction as hand path
      // Anti motions: prop rotates opposite direction to hand path
      const leftRotationDir =
        leftNaturalDir === "no_rotation"
          ? base.leftRotationDirection
          : base.leftMotionType === "pro"
            ? leftNaturalDir
            : base.leftMotionType === "anti"
              ? leftNaturalDir === "cw"
                ? "ccw"
                : "cw"
              : base.leftRotationDirection;

      const rightRotationDir =
        rightNaturalDir === "no_rotation"
          ? base.rightRotationDirection
          : base.rightMotionType === "pro"
            ? rightNaturalDir
            : base.rightMotionType === "anti"
              ? rightNaturalDir === "cw"
                ? "ccw"
                : "cw"
              : base.rightRotationDirection;

      // Derive hand paths based on the correct rotation directions
      const leftHandPath = deriveHandPath(
        base.leftMotionType,
        leftRotationDir,
        leftSkewDir
      );
      const rightHandPath = deriveHandPath(
        base.rightMotionType,
        rightRotationDir,
        rightSkewDir
      );

      // Skew steps: only 1 if the motion actually crossed the boundary
      const leftSkewSteps = leftActuallyCrossed ? 1 : 0;
      const rightSkewSteps = rightActuallyCrossed ? 1 : 0;

      variants.push({
        ...base,
        leftEndLocation: newLeftEnd,
        rightEndLocation: newRightEnd,
        leftRotationDirection: leftRotationDir,
        rightRotationDirection: rightRotationDir,
        endPlacement: newEndPlacement,
        leftSkewDir,
        rightSkewDir,
        leftHandPath,
        rightHandPath,
        leftSkewSteps,
        rightSkewSteps,
        category,
      });
    }
  }

  return variants;
}

// Convert row to CSV line
function toCSVLine(row: SkewedRow): string {
  return [
    row.letter,
    row.startPlacement,
    row.endPlacement,
    row.timing,
    row.direction,
    row.leftMotionType,
    row.leftRotationDirection,
    row.leftSkewDir,
    row.leftHandPath,
    row.leftSkewSteps,
    row.leftStartLocation,
    row.leftEndLocation,
    row.rightMotionType,
    row.rightRotationDirection,
    row.rightSkewDir,
    row.rightHandPath,
    row.rightSkewSteps,
    row.rightStartLocation,
    row.rightEndLocation,
    row.category,
  ].join(",");
}

// Main
function main() {
  const staticDir = path.join(__dirname, "..", "static", "data", "pictographs");
  const diamondPath = path.join(staticDir, "DiamondPictographDataframe.csv");
  const boxPath = path.join(staticDir, "BoxPictographDataframe.csv");
  const outputPath = path.join(staticDir, "SkewedPictographDataframe.csv");

  // Read input files
  const diamondContent = fs.readFileSync(diamondPath, "utf-8");
  const boxContent = fs.readFileSync(boxPath, "utf-8");

  const header = [
    "letter",
    "startPlacement",
    "endPlacement",
    "timing",
    "direction",
    "blueMotionType",
    "blueRotationDirection",
    "blueStartLocation",
    "blueEndLocation",
    "redMotionType",
    "redRotationDirection",
    "redStartLocation",
    "redEndLocation",
  ];

  // Parse rows
  const parseFile = (content: string): PictographRow[] => {
    const lines = content.split("\n").filter((l) => l.trim());
    return lines
      .slice(1)
      .map((line) => parseRow(line, header))
      .filter((r): r is PictographRow => r !== null);
  };

  const diamondRows = parseFile(diamondContent);
  const boxRows = parseFile(boxContent);

  console.log(`Loaded ${diamondRows.length} Diamond rows`);
  console.log(`Loaded ${boxRows.length} Box rows`);

  // Generate skewed variants
  const allVariants: SkewedRow[] = [];

  for (const row of [...diamondRows, ...boxRows]) {
    const variants = generateSkewedVariants(row);
    allVariants.push(...variants);
  }

  console.log(`Generated ${allVariants.length} skewed variants`);

  // Deduplicate (some may be identical from Diamond vs Box)
  const seen = new Set<string>();
  const uniqueVariants = allVariants.filter((v) => {
    const key = toCSVLine(v);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`Unique variants: ${uniqueVariants.length}`);

  // Write output
  const outputHeader =
    "letter,startPlacement,endPlacement,timing,direction,blueMotionType,blueRotationDirection,blueSkewDir,blueHandPath,blueSkewSteps,blueStartLocation,blueEndLocation,redMotionType,redRotationDirection,redSkewDir,redHandPath,redSkewSteps,redStartLocation,redEndLocation,category";
  const outputLines = [outputHeader, ...uniqueVariants.map(toCSVLine)];

  fs.writeFileSync(outputPath, outputLines.join("\n"), "utf-8");
  console.log(`Wrote ${uniqueVariants.length} rows to ${outputPath}`);

  // Stats
  const byLetter = new Map<string, number>();
  const byEndPlacement = new Map<string, number>();
  const byCategory = new Map<number, number>();

  for (const v of uniqueVariants) {
    byLetter.set(v.letter, (byLetter.get(v.letter) || 0) + 1);
    byEndPlacement.set(v.endPlacement, (byEndPlacement.get(v.endPlacement) || 0) + 1);
    byCategory.set(v.category, (byCategory.get(v.category) || 0) + 1);
  }

  console.log("\n=== CATEGORY DISTRIBUTION ===");
  console.log(`  Category 1 (ends skewed): ${byCategory.get(1) || 0}`);
  console.log(`  Category 2 (both skew, ends normal): ${byCategory.get(2) || 0}`);

  console.log("\nVariants by letter (top 10):");
  [...byLetter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([letter, count]) => console.log(`  ${letter}: ${count}`));

  console.log("\nVariants by end position:");
  [...byEndPlacement.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([pos, count]) => console.log(`  ${pos}: ${count}`));
}

main();
