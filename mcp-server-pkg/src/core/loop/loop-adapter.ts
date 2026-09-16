/**
 * LOOP Adapter — bridges MCP server step format to @tka/sequence-engine executors.
 *
 * MCP server steps use flat leftMotion/rightMotion.
 * Engine steps use nested motions.left/motions.right.
 * This adapter converts at the boundary so the MCP server can use
 * the engine's full set of 15 LOOP executors.
 */

import type { SequenceStep as McpStep } from "../sequence-builder.js";
import {
  LOOPType,
  Period,
  loopExecutorSelector,
  detectLOOPFromSteps as engineDetectLOOP,
  isSequenceCircular as engineIsCircular,
  findLetterByMotions as engineFindLetter,
  type LOOPDetectionResult,
} from "@tka/sequence-engine/loop";

interface MotionData {
  hand: "left" | "right";
  startLocation: string;
  endLocation: string;
  motionType: string;
  rotationDirection: string;
  startOrientation: string;
  endOrientation: string;
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

export interface LOOPExecutionResult {
  success: boolean;
  steps: McpStep[];
  word: string;
  loopWord: string;
  seedWord: string;
  derivedWord: string;
  loopType: LOOPType;
  period: Period;
  isCircular: boolean;
  derivedBeatIndices: number[];
  error?: string;
}

function toEngineStep(mcp: McpStep): any {
  const { leftMotion, rightMotion, ...rest } = mcp as any;
  return {
    ...rest,
    motions: { left: leftMotion, right: rightMotion },
    duration: 1,
  };
}

function toMcpStep(engine: any): McpStep {
  const { motions, duration, id, ...rest } = engine;
  return {
    ...rest,
    leftMotion: motions.left,
    rightMotion: motions.right,
  };
}

export function executeLOOP(
  steps: McpStep[],
  word: string,
  loopType: LOOPType,
  period: Period = Period.HALVED,
  allPictographs: PictographData[] = []
): LOOPExecutionResult {
  const originalBeatCount = steps.length - 1; // exclude start placement step

  const errorResult = (msg: string): LOOPExecutionResult => ({
    success: false,
    steps: [],
    word,
    loopWord: "",
    seedWord: word,
    derivedWord: "",
    loopType,
    period,
    isCircular: false,
    derivedBeatIndices: [],
    error: msg,
  });

  if (steps.length < 2) {
    return errorResult(
      "Sequence must have at least 2 steps (start placement + 1 beat)"
    );
  }

  let executor;
  try {
    executor = loopExecutorSelector.getExecutor(loopType);
  } catch {
    return errorResult(`LOOP type "${loopType}" is not supported`);
  }

  // Convert to engine format and clone (executors mutate via shift/push)
  const engineSteps = steps.map(toEngineStep);

  let resultEngineSteps: any[];
  try {
    resultEngineSteps = executor.executeLOOP(engineSteps, period);
  } catch (err: any) {
    return errorResult(err?.message ?? String(err));
  }

  // Convert back to MCP format
  const resultSteps = resultEngineSteps.map(toMcpStep);

  // Derive letters for generated steps using motion parameters
  const derivedBeatIndices: number[] = [];
  const derivedLetters: string[] = [];

  for (let i = originalBeatCount + 1; i < resultSteps.length; i++) {
    const step = resultSteps[i]!;
    derivedBeatIndices.push(i);

    const derived = engineFindLetter(
      step.leftMotion as any,
      step.rightMotion as any,
      allPictographs as any[]
    );
    if (derived) {
      (step as any).letter = derived;
    }
    derivedLetters.push((step as any).letter ?? "");
  }

  const derivedWord = derivedLetters.join("");
  const loopWord = word + derivedWord;

  return {
    success: true,
    steps: resultSteps,
    word,
    loopWord,
    seedWord: word,
    derivedWord,
    loopType,
    period,
    isCircular: true,
    derivedBeatIndices,
  };
}

export function detectLOOPFromSteps(steps: McpStep[]): LOOPDetectionResult {
  return engineDetectLOOP(steps.map(toEngineStep));
}

export function isSequenceCircular(steps: McpStep[]): boolean {
  return engineIsCircular(steps.map(toEngineStep));
}

export { engineFindLetter as findLetterByMotions };
