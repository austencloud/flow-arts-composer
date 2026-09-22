/**
 * LOOP Adapter — bridges MCP server step format to @tka/sequence-engine executors.
 *
 * MCP server steps use flat leftMotion/rightMotion.
 * Engine steps use nested motions.left/motions.right.
 * This adapter converts at the boundary so the MCP server can use
 * the engine's canonical LOOP completion path.
 */

import type { SequenceStep as McpStep } from "../sequence-builder.js";
import {
  LOOPType,
  Period,
  executeLOOP as executeEngineLOOP,
  detectLOOPFromSteps as engineDetectLOOP,
  isSequenceCircular as engineIsCircular,
  findLetterByMotions as engineFindLetter,
  type LOOPDetectionResult,
} from "@tka/sequence-engine/loop";
import type {
  Motion as EngineMotion,
  Step as EngineStep,
} from "@tka/tka-types";

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

type EngineAdapterStep = EngineStep &
  Pick<McpStep, "leftReversal" | "rightReversal">;

function toEngineMotion(
  motion: McpStep["leftMotion"],
  hand: "left" | "right"
): EngineMotion {
  // MCP predates canonical motion fields. The adapter supplies the required
  // hand channel and missing turn value without changing its caller's data.
  return {
    ...motion,
    hand,
    turns: motion.turns ?? 0,
  } as EngineMotion;
}

function toEngineStep(mcp: McpStep, index: number): EngineAdapterStep {
  return {
    id: `mcp-loop-step-${index}`,
    letter: mcp.letter || null,
    startPlacement: mcp.startPlacement,
    endPlacement: mcp.endPlacement,
    motions: {
      left: toEngineMotion(mcp.leftMotion, "left"),
      right: toEngineMotion(mcp.rightMotion, "right"),
    },
    stepNumber: mcp.stepNumber,
    duration: mcp.duration ?? 1,
    variation: mcp.variation,
    ...(mcp.isBridge !== undefined && { isBridge: mcp.isBridge }),
    ...(mcp.leftReversal !== undefined && { leftReversal: mcp.leftReversal }),
    ...(mcp.rightReversal !== undefined && {
      rightReversal: mcp.rightReversal,
    }),
  } as EngineAdapterStep;
}

function toMcpStep(engine: EngineAdapterStep): McpStep {
  return {
    letter: engine.letter ?? "",
    variation: engine.variation ?? 0,
    startPlacement: engine.startPlacement ?? "",
    endPlacement: engine.endPlacement ?? "",
    leftMotion: { ...engine.motions.left, hand: "left" },
    rightMotion: { ...engine.motions.right, hand: "right" },
    stepNumber: engine.stepNumber,
    duration: engine.duration,
    ...(engine.isBridge !== undefined && { isBridge: engine.isBridge }),
    ...(engine.leftReversal !== undefined && {
      leftReversal: engine.leftReversal,
    }),
    ...(engine.rightReversal !== undefined && {
      rightReversal: engine.rightReversal,
    }),
  } as McpStep;
}

export function executeLOOP(
  steps: McpStep[],
  word: string,
  loopType: LOOPType,
  period: Period = Period.HALVED,
  allPictographs: PictographData[] = []
): LOOPExecutionResult {
  const completed = executeEngineLOOP(
    steps.map(toEngineStep),
    word,
    loopType,
    period,
    allPictographs
  );

  return {
    success: completed.success,
    steps: completed.steps.map((step) => toMcpStep(step as EngineAdapterStep)),
    word: completed.word,
    loopWord: completed.loopWord,
    seedWord: completed.seedWord,
    derivedWord: completed.derivedWord,
    loopType: completed.loopType,
    period: completed.period,
    isCircular: completed.isCircular,
    derivedBeatIndices: completed.derivedStepIndices,
    ...(completed.error !== undefined && { error: completed.error }),
  };
}

export function detectLOOPFromSteps(steps: McpStep[]): LOOPDetectionResult {
  return engineDetectLOOP(steps.map(toEngineStep));
}

export function isSequenceCircular(steps: McpStep[]): boolean {
  return engineIsCircular(steps.map(toEngineStep));
}

export { engineFindLetter as findLetterByMotions };
