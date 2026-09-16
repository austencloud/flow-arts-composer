/**
 * Codex Models
 *
 * Interface definitions for the codex system.
 */

import { MotionType } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { LetterCategory } from "$lib/shared/learn/domain/codex-types";

export interface CodexLetterMapping {
  startPlacement: string;
  endPlacement: string;
  leftMotionType: MotionType;
  rightMotionType: MotionType;
}

export interface CodexLetterRow {
  index: number;
  category: LetterCategory;
  letters: string[];
}

export interface CodexConfig {
  version: string;
  letters: Record<string, CodexLetterMapping>;
  rows: CodexLetterRow[];
  categories: Record<LetterCategory, string[]>;
}

// Factory functions
export function createLetterMapping(
  data: Partial<CodexLetterMapping>
): CodexLetterMapping {
  return {
    startPlacement: data.startPlacement ?? "",
    endPlacement: data.endPlacement ?? "",
    leftMotionType: data.leftMotionType ?? MotionType.STATIC,
    rightMotionType: data.rightMotionType ?? MotionType.STATIC,
  };
}
