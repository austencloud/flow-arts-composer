/**
 * TIKA Sequence Generation API
 *
 * Generates valid TKA sequences from letter arrays or word strings.
 * Returns SequenceData JSON for client-side rendering.
 */

import type { RequestHandler } from "@sveltejs/kit";
import fs from "fs";
import path from "path";
import { RATE_LIMITS } from "$lib/server/security/rate-limiter";
import { withRateLimit } from "$lib/server/security/withRateLimit";
import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface MotionData {
  hand: string;
  startLocation: string;
  endLocation: string;
  motionType: string;
  rotationDirection: string;
}

interface PictographData {
  letter: string;
  startPlacement: string;
  endPlacement: string;
  timing: string;
  direction: string;
  leftMotion: MotionData;
  rightMotion: MotionData;
}

interface SequenceStep {
  letter: string;
  variation: number;
  startPlacement: string;
  endPlacement: string;
  leftMotion: MotionData;
  rightMotion: MotionData;
  stepNumber: number;
}

interface SequenceResult {
  word: string;
  steps: SequenceStep[];
  startPlacement: string;
  endPlacement: string;
  isValid: boolean;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Data Loading
// ═══════════════════════════════════════════════════════════════════════════

let allPictographs: PictographData[] = [];

function loadDataframe(): PictographData[] {
  try {
    const csvPath = path.join(
      process.cwd(),
      "static",
      "data",
      "pictographs",
      "DiamondPictographDataframe.csv"
    );
    const csvContent = fs.readFileSync(csvPath, "utf-8");
    const lines = csvContent.trim().split("\n");
    if (lines.length < 2) return [];

    const headerLine = lines[0];
    if (!headerLine) return [];
    const headers = headerLine.split(",").map((h) => h.trim());
    const pictographs: PictographData[] = [];

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
        startPlacement: row["startPlacement"] ?? "",
        endPlacement: row["endPlacement"] ?? "",
        timing: row["timing"] ?? "",
        direction: row["direction"] ?? "",
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
    console.error("[TIKA Sequence API] Failed to load dataframe:", error);
    return [];
  }
}

function ensureDataLoaded() {
  if (allPictographs.length === 0) {
    console.log("[TIKA Sequence API] Loading pictograph dataframe...");
    allPictographs = loadDataframe();
    console.log(
      `[TIKA Sequence API] Loaded ${allPictographs.length} pictographs`
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Sequence Building
// ═══════════════════════════════════════════════════════════════════════════

const TYPE_6_LETTERS = ["α", "β", "γ"];

function parseWordToLetters(word: string): string[] {
  // Strip skew-frame braces first: they mark a span of the word, not a
  // letter, and the scan below has no notation awareness of its own. This
  // mirrors the same fix in tika-sequence-validator.ts's parseWordToLetters
  // (this route builds its own letter list rather than importing that
  // service's container, so the two copies are patched independently).
  const bareWord = stripWordNotation(word);
  const letters: string[] = [];
  let i = 0;

  while (i < bareWord.length) {
    const char = bareWord[i];
    if (!char) {
      i++;
      continue;
    }

    // Check if next char is a dash (for Type 3/5 letters)
    const nextChar = bareWord[i + 1];
    if (nextChar === "-") {
      letters.push(char + "-");
      i += 2;
    } else {
      letters.push(char);
      i++;
    }
  }

  return letters;
}

function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * items.length);
  return items[randomIndex] ?? null;
}

function buildSequenceFromLetters(
  letters: string[],
  maxAttempts: number = 100
): SequenceResult {
  if (letters.length === 0) {
    return {
      word: "",
      steps: [],
      startPlacement: "",
      endPlacement: "",
      isValid: false,
      error: "No letters provided",
    };
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = attemptSequenceBuild(letters);
    if (result.isValid) {
      return result;
    }
  }

  return {
    word: letters.join(""),
    steps: [],
    startPlacement: "",
    endPlacement: "",
    isValid: false,
    error: `Failed to generate valid sequence after ${maxAttempts} attempts`,
  };
}

function attemptSequenceBuild(letters: string[]): SequenceResult {
  const word = letters.join("");
  const steps: SequenceStep[] = [];

  const firstLetter = letters[0];
  if (!firstLetter) {
    return {
      word,
      steps: [],
      startPlacement: "",
      endPlacement: "",
      isValid: false,
      error: "No first letter",
    };
  }

  const firstLetterVariations = allPictographs.filter(
    (p) => p.letter === firstLetter
  );

  if (firstLetterVariations.length === 0) {
    return {
      word,
      steps: [],
      startPlacement: "",
      endPlacement: "",
      isValid: false,
      error: `No variations found for letter "${firstLetter}"`,
    };
  }

  const firstVariation = pickRandom(firstLetterVariations);
  if (!firstVariation) {
    return {
      word,
      steps: [],
      startPlacement: "",
      endPlacement: "",
      isValid: false,
      error: "Failed to pick first variation",
    };
  }

  const firstVariationIndex = firstLetterVariations.indexOf(firstVariation);
  const startPlacement = firstVariation.startPlacement;

  // Find a valid start position (Type 6 static letter)
  const validStartPlacements = allPictographs.filter((p) => {
    return (
      TYPE_6_LETTERS.includes(p.letter) &&
      p.startPlacement === startPlacement &&
      p.endPlacement === startPlacement
    );
  });

  if (validStartPlacements.length === 0) {
    return {
      word,
      steps: [],
      startPlacement: "",
      endPlacement: "",
      isValid: false,
      error: `No Type 6 static letter found at position ${startPlacement}`,
    };
  }

  const startPictograph = pickRandom(validStartPlacements);
  if (!startPictograph) {
    return {
      word,
      steps: [],
      startPlacement: "",
      endPlacement: "",
      isValid: false,
      error: "Failed to pick start position",
    };
  }

  // Add start position as step 0
  steps.push({
    letter: startPictograph.letter,
    variation: 0,
    startPlacement: startPictograph.startPlacement,
    endPlacement: startPictograph.endPlacement,
    leftMotion: startPictograph.leftMotion,
    rightMotion: startPictograph.rightMotion,
    stepNumber: 0,
  });

  // Add first letter as step 1
  steps.push({
    letter: firstVariation.letter,
    variation: firstVariationIndex,
    startPlacement: firstVariation.startPlacement,
    endPlacement: firstVariation.endPlacement,
    leftMotion: firstVariation.leftMotion,
    rightMotion: firstVariation.rightMotion,
    stepNumber: 1,
  });

  // Walk through remaining letters
  let currentEndPlacement = firstVariation.endPlacement;

  for (let i = 1; i < letters.length; i++) {
    const letter = letters[i];
    if (!letter) continue;

    const variations = allPictographs.filter(
      (p) => p.letter === letter && p.startPlacement === currentEndPlacement
    );

    if (variations.length === 0) {
      return {
        word,
        steps: [],
        startPlacement: "",
        endPlacement: "",
        isValid: false,
        error: `No valid continuation for letter "${letter}" from position ${currentEndPlacement}`,
      };
    }

    const chosenVariation = pickRandom(variations);
    if (!chosenVariation) {
      return {
        word,
        steps: [],
        startPlacement: "",
        endPlacement: "",
        isValid: false,
        error: `Failed to pick variation for letter "${letter}"`,
      };
    }

    const allLetterVariations = allPictographs.filter(
      (p) => p.letter === letter
    );
    const variationIndex = allLetterVariations.indexOf(chosenVariation);

    steps.push({
      letter: chosenVariation.letter,
      variation: variationIndex >= 0 ? variationIndex : 0,
      startPlacement: chosenVariation.startPlacement,
      endPlacement: chosenVariation.endPlacement,
      leftMotion: chosenVariation.leftMotion,
      rightMotion: chosenVariation.rightMotion,
      stepNumber: i + 1,
    });

    currentEndPlacement = chosenVariation.endPlacement;
  }

  return {
    word,
    steps,
    startPlacement: startPlacement,
    endPlacement: currentEndPlacement,
    isValid: true,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Request Handler
// ═══════════════════════════════════════════════════════════════════════════

interface SequenceRequest {
  // Either provide letters array or word string
  letters?: string[];
  word?: string;
  maxAttempts?: number;
}

export const POST: RequestHandler = async (event) => {
  const blocked = await withRateLimit(event, RATE_LIMITS.GENERAL, "ip");
  if (blocked) return blocked;

  try {
    const body: SequenceRequest = await event.request.json();

    ensureDataLoaded();

    // Parse input - accept either letters array or word string
    let letters: string[];

    if (body.letters && Array.isArray(body.letters)) {
      letters = body.letters.map((l) => l.toUpperCase());
    } else if (body.word && typeof body.word === "string") {
      letters = parseWordToLetters(body.word.toUpperCase());
    } else {
      return new Response(
        JSON.stringify({ error: "Missing letters or word in request body" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (letters.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid letters provided" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Build the sequence (clamp to prevent unbounded CPU work)
    const MAX_ATTEMPTS_CEILING = 200;
    const maxAttempts = Math.min(body.maxAttempts ?? 100, MAX_ATTEMPTS_CEILING);
    const result = buildSequenceFromLetters(letters, maxAttempts);

    if (!result.isValid) {
      return new Response(
        JSON.stringify({
          error: result.error || "Failed to generate sequence",
          word: result.word,
        }),
        {
          status: 422,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Return successful result
    return new Response(
      JSON.stringify({
        word: result.word,
        steps: result.steps,
        startPlacement: result.startPlacement,
        endPlacement: result.endPlacement,
        stepCount: result.steps.length - 1, // Exclude start position
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[TIKA Sequence API] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
