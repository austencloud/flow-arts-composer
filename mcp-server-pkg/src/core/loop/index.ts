/**
 * LOOP Module Index
 *
 * Single source of truth: re-exports from @tka/sequence-engine.
 * Shared Zod schemas derived from engine constants — never hardcode loop type lists.
 */

import { z } from "zod";
import {
  LOOPType as _LOOPType,
  Period as _Period,
  ALL_LOOP_TYPES as _ALL_LOOP_TYPES,
  isLOOPValidForPlacementPair as _isValid,
  findBridgeLettersForLoop as _findBridge,
} from "@tka/sequence-engine/loop";
import { LOOPComponent } from "../sequence-renderer.js";

// Types and enums (from engine)
export {
  LOOPType,
  Period,
  LOOP_TYPE_LABELS,
  LOOP_TYPE_DESCRIPTIONS,
  ALL_LOOP_TYPES,
  type LOOPOption,
  type LOOPValidationResult,
} from "@tka/sequence-engine/loop";


const allLoopTypeStrings = _ALL_LOOP_TYPES.map(t => t as string) as [string, ...string[]];
export const loopTypeSchema = z.enum(allLoopTypeStrings).describe("LOOP type to apply");

const allPeriodStrings = Object.values(_Period) as [string, ...string[]];
export const periodSchema = z.enum(allPeriodStrings).describe("LOOP period");

const ATOMIC_COMPONENTS = ["rotated", "mirrored", "flipped", "swapped", "inverted", "rewound"] as const;
export const loopComponentSchema = z.enum(ATOMIC_COMPONENTS);
export const loopComponentsSchema = z.array(loopComponentSchema).optional().describe("LOOP components for pie chart glyph");

export function decomposeLoopType(loopType: string): string[] {
  if (loopType === "rewound") return ["rewound"];
  return loopType.split("_").filter(p => (ATOMIC_COMPONENTS as readonly string[]).includes(p));
}

export function componentStringToEnum(c: string): LOOPComponent {
  switch (c) {
    case "rotated": return LOOPComponent.ROTATED;
    case "mirrored": return LOOPComponent.MIRRORED;
    case "flipped": return LOOPComponent.FLIPPED;
    case "swapped": return LOOPComponent.SWAPPED;
    case "inverted": return LOOPComponent.INVERTED;
    case "rewound": return LOOPComponent.REWOUND;
    default: return LOOPComponent.ROTATED;
  }
}

export { LOOPComponent };

export function autoBridgeForLoop(
  originalWord: string,
  letters: string[],
  startPlacement: string,
  endPlacement: string,
  loopType: _LOOPType,
  period: _Period,
  allPictographs: Array<{ letter: string; startPlacement: string; endPlacement: string }>
): { word: string; letters: string[]; bridgeAdded: string | null } {
  const placementPair = `${startPlacement},${endPlacement}`;
  if (_isValid(loopType, placementPair, period)) {
    return { word: originalWord, letters, bridgeAdded: null };
  }

  const bridgeOptions = _findBridge(startPlacement, endPlacement, loopType, period, allPictographs);
  if (bridgeOptions.length === 0) {
    return { word: originalWord, letters, bridgeAdded: null };
  }

  const bridgeLetter = bridgeOptions[0]!;
  return { word: originalWord + bridgeLetter, letters: [...letters, bridgeLetter], bridgeAdded: bridgeLetter };
}

// Validation (from engine — uses string placement pairs, no step conversion needed)
export {
  isLOOPValidForPlacementPair,
  getLOOPOptionsForPlacementPair,
  getExpectedEndPlacement,
  getValidEndPlacementsForLoop,
  findBridgeLettersForLoop,
  HALVED_LOOPS,
  QUARTERED_LOOPS,
} from "@tka/sequence-engine/loop";

// Detection (from engine, re-exported via adapter for MCP step format)
export type { LOOPComponentId, LOOPDetectionResult } from "@tka/sequence-engine/loop";

// Adapter exports (convert MCP steps ↔ engine steps at the boundary)
export {
  executeLOOP,
  detectLOOPFromSteps,
  isSequenceCircular,
  findLetterByMotions,
  type LOOPExecutionResult,
  type PictographData,
} from "./loop-adapter.js";
