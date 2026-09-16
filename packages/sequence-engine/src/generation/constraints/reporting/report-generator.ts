/**
 * Report Generator
 *
 * Generates human-readable reports on constraint satisfaction
 * for generated sequences.
 */

import { ConstraintType, type ConstraintMode } from "../constraint-types.js";
import type {
  SearchState,
  ConstraintSet,
  ConstraintReport,
  ConstraintDetail,
  IConstraint,
} from "../types.js";
import {
  countReversals,
  calculateContinuityPercentage,
} from "../../builder/search-state.js";

export function generateConstraintReport(
  state: SearchState,
  constraintSet: ConstraintSet
): ConstraintReport {
  const details: ConstraintDetail[] = [];
  let allSatisfied = true;
  let totalScore = 0;
  let totalWeight = 0;

  // Aggregate scores from step-level evaluations
  const aggregatedScores = aggregateStepScores(state, constraintSet);

  // Process hard constraints
  for (const constraint of constraintSet.hard) {
    const aggregated = aggregatedScores.get(constraint.type);
    if (aggregated) {
      details.push(aggregated);
      if (!aggregated.score || aggregated.score < 1) {
        allSatisfied = false;
      }
    }
  }

  // Process soft constraints
  for (const constraint of constraintSet.soft) {
    const aggregated = aggregatedScores.get(constraint.type);
    const weight = constraintSet.weights?.get(constraint.type) ?? 1.0;

    if (aggregated) {
      details.push(aggregated);
      totalScore += aggregated.score * weight;
      totalWeight += weight;
    }
  }

  const softScore = totalWeight > 0 ? totalScore / totalWeight : 1.0;
  const finalScore = allSatisfied ? softScore : 0;

  return {
    score: Math.round(finalScore * 100) / 100, // Round to 2 decimal places
    satisfied: allSatisfied,
    details,
  };
}

function aggregateStepScores(
  state: SearchState,
  constraintSet: ConstraintSet
): Map<ConstraintType, ConstraintDetail> {
  const result = new Map<ConstraintType, ConstraintDetail>();
  const allConstraints = [...constraintSet.hard, ...constraintSet.soft];

  // Initialize aggregation
  const scoreAccumulator = new Map<
    ConstraintType,
    { scores: number[]; satisfied: boolean; mode: ConstraintMode; description: string }
  >();

  for (const constraint of allConstraints) {
    scoreAccumulator.set(constraint.type, {
      scores: [],
      satisfied: true,
      mode: constraint.mode,
      description: constraint.description,
    });
  }

  // Collect scores from each step (excluding start placement)
  for (let i = 1; i < state.stepScores.length; i++) {
    const stepScore = state.stepScores[i];
    if (!stepScore) continue;

    for (const [constraintType, score] of stepScore.constraintScores) {
      const acc = scoreAccumulator.get(constraintType);
      if (acc) {
        acc.scores.push(score.score);
        if (!score.satisfied) {
          acc.satisfied = false;
        }
      }
    }
  }

  // Build final details with human-readable descriptions
  for (const [constraintType, acc] of scoreAccumulator) {
    if (acc.scores.length === 0) continue;

    const avgScore =
      acc.scores.reduce((a, b) => a + b, 0) / acc.scores.length;

    // Generate constraint-specific description
    const description = generateConstraintDescription(
      constraintType,
      avgScore,
      state
    );

    result.set(constraintType, {
      constraint: constraintType,
      score: Math.round(avgScore * 100) / 100,
      description,
      mode: acc.mode,
    });
  }

  return result;
}

function generateConstraintDescription(
  type: ConstraintType,
  score: number,
  state: SearchState
): string {
  const steps = state.steps.length - 1; // Exclude start placement
  const percentage = Math.round(score * 100);

  switch (type) {
    case ConstraintType.CONTINUITY: {
      const continuity = calculateContinuityPercentage(state);
      const reversals = countReversals(state);
      if (reversals === 0) {
        return `Perfect continuity: no reversals in ${steps} steps`;
      }
      return `${continuity}% continuous (${reversals} reversals in ${steps} steps)`;
    }

    case ConstraintType.MOTION_TYPE: {
      if (score === 1) {
        return `All motions match required type (${steps} steps)`;
      } else if (score >= 0.75) {
        return `Most motions match (${percentage}% of ${steps} steps)`;
      } else {
        return `${percentage}% of motions match required type`;
      }
    }

    case ConstraintType.ROTATION_DIRECTION: {
      if (score === 1) {
        return `All rotations match required direction`;
      }
      return `${percentage}% of rotations match`;
    }

    case ConstraintType.REVERSAL: {
      const reversals = countReversals(state);
      return `${reversals} reversals in ${steps} steps`;
    }

    case ConstraintType.PLACEMENT_GROUP: {
      if (score === 1) {
        return `All placements within required group`;
      }
      return `${percentage}% of placements in group`;
    }

    case ConstraintType.VTG_TIMING: {
      if (score === 1) {
        return `All steps match required timing`;
      }
      return `${percentage}% match timing requirement`;
    }

    case ConstraintType.ALTERNATING: {
      if (score === 1) {
        return `Perfect alternating pattern`;
      }
      return `${percentage}% pattern compliance`;
    }

    default:
      return `${percentage}% satisfaction`;
  }
}

export function formatConstraintReport(report: ConstraintReport): string {
  const lines: string[] = [];

  // Header
  lines.push(`## Constraint Report`);
  lines.push(``);
  lines.push(`**Overall Score:** ${Math.round(report.score * 100)}%`);
  lines.push(
    `**Status:** ${report.satisfied ? "✓ All constraints satisfied" : "✗ Some constraints not met"}`
  );

  // Details
  if (report.details.length > 0) {
    lines.push(``);
    lines.push(`### Details`);
    lines.push(``);

    for (const detail of report.details) {
      const icon = detail.mode === "hard" ? "🔒" : "📊";
      const status = detail.score >= 1 ? "✓" : detail.score >= 0.5 ? "~" : "✗";
      lines.push(
        `${icon} ${status} **${detail.constraint}** (${Math.round(detail.score * 100)}%): ${detail.description}`
      );
    }
  }

  // Parse info
  if (report.parseConfidence !== undefined) {
    lines.push(``);
    lines.push(
      `*Parser confidence: ${Math.round(report.parseConfidence * 100)}%*`
    );
  }

  if (report.unrecognized && report.unrecognized.length > 0) {
    lines.push(`*Unrecognized terms: ${report.unrecognized.join(", ")}*`);
  }

  return lines.join("\n");
}
