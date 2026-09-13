/**
 * QUARANTINED — THESE ASSERTIONS FAIL TODAY, ON PURPOSE.
 *
 * Everything here states the plain contract a LOOP is supposed to satisfy,
 * with no allowance for the defects the audit found. The passing suites in the
 * parent directory lock CURRENT behaviour (including its defects) so that the
 * default test run stays green and any change is visible; this file states
 * what the behaviour SHOULD be, so the fix has a target to turn green.
 *
 * Nothing in this file runs in the default suite: every `describe` is gated on
 * `LOOP_PARITY_QUARANTINE=1`.
 *
 *   LOOP_PARITY_QUARANTINE=1 npx vitest run \
 *     --config tests/config/vitest.config.ts \
 *     tests/unit/opus-sequence-parity/quarantine
 *
 * Expected failures as of the audit (base c4be1619):
 *
 *   1. app MIRRORED_SWAPPED_INVERTED — derived steps' endPosition
 *      contradicts their own hand locations; LOOP never returns home.
 *   2. app MIRRORED_ROTATED_INVERTED_SWAPPED — same defect class.
 *   3. engine quartered ROTATED_INVERTED — LOOP never returns home.
 *   4. engine quartered ROTATED_SWAPPED — LOOP never returns home.
 *
 * Full analysis: `docs/reports/opus-batch-2026-09-12/sequence-engine-parity.md`
 */

import { describe, expect, it } from "vitest";

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

import { corpus } from "../harness/corpus";
import { checkStepCoherence, positionCloses } from "../harness/invariants";
import {
  APP_SUPPORTED_LOOP_TYPES,
  AppLOOPType,
  AppPeriod,
  runApp,
  runEngine,
} from "../harness/run-both-paths";

const ENABLED = process.env.LOOP_PARITY_QUARANTINE === "1";

const PERIODS = [AppPeriod.HALVED, AppPeriod.QUARTERED] as const;

interface Failure {
  readonly loopType: string;
  readonly period: string;
  readonly seed: string;
  readonly detail: string;
}

function sweep(
  run: (
    seed: StepData[],
    loopType: AppLOOPType,
    period: AppPeriod
  ) => ReturnType<typeof runApp>
): Failure[] {
  const failures: Failure[] = [];

  for (const period of PERIODS) {
    for (const loopType of APP_SUPPORTED_LOOP_TYPES) {
      let admitted: StepData[] | null = null;
      const accept = (seed: StepData[]) => {
        const outcome = runApp(seed, loopType, period);
        admitted = outcome.kind === "ok" ? outcome.steps : null;
        return admitted !== null;
      };

      for (const entry of corpus(accept)) {
        if (admitted === null) continue;
        const outcome = run(entry.steps, loopType, period);
        if (outcome.kind !== "ok") continue;

        const incoherence = checkStepCoherence(outcome.steps);
        if (incoherence.length > 0) {
          failures.push({
            loopType: String(loopType),
            period: String(period),
            seed: entry.label,
            detail: `step ${incoherence[0]!.stepIndex} ${incoherence[0]!.rule}: ${incoherence[0]!.detail}`,
          });
          continue;
        }

        if (!positionCloses(outcome.steps)) {
          failures.push({
            loopType: String(loopType),
            period: String(period),
            seed: entry.label,
            detail: `ends at ${outcome.steps[outcome.steps.length - 1]!.endPosition}, seed starts at ${entry.steps[0]!.startPosition}`,
          });
        }
      }
    }
  }

  return failures;
}

/** Collapse to one example per (loopType, period) so a failure stays readable. */
function summarize(failures: Failure[]): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const failure of failures) {
    const key = `${failure.loopType}/${failure.period}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`${key} — ${failure.seed} — ${failure.detail}`);
  }
  return lines.sort();
}

describe.runIf(ENABLED)("QUARANTINED: every app LOOP must be coherent and closed", () => {
  it("produces no self-contradicting or open LOOP", () => {
    expect(summarize(sweep(runApp))).toEqual([]);
  });
});

describe.runIf(ENABLED)("QUARANTINED: every engine LOOP must be coherent and closed", () => {
  it("produces no self-contradicting or open LOOP", () => {
    expect(summarize(sweep(runEngine))).toEqual([]);
  });
});

describe.runIf(ENABLED)("QUARANTINED: the two paths must agree", () => {
  it("app and engine agree on quartered ROTATED_INVERTED", () => {
    // The sharpest unreconciled class: no engine spec conversion measured by
    // `engine-pipeline-configuration.test.ts` reproduces the app here.
    let admitted: StepData[] | null = null;
    const accept = (seed: StepData[]) => {
      const outcome = runApp(seed, AppLOOPType.ROTATED_INVERTED, AppPeriod.QUARTERED);
      admitted = outcome.kind === "ok" ? outcome.steps : null;
      return admitted !== null;
    };

    const mismatches: string[] = [];
    for (const entry of corpus(accept)) {
      const appSteps: StepData[] | null = admitted;
      if (appSteps === null) continue;
      const engine = runEngine(
        entry.steps,
        AppLOOPType.ROTATED_INVERTED,
        AppPeriod.QUARTERED
      );
      if (engine.kind !== "ok") {
        mismatches.push(`${entry.label} — engine threw: ${engine.message}`);
        continue;
      }
      const appEnd = appSteps[appSteps.length - 1]!.endPosition;
      const engineEnd = engine.steps[engine.steps.length - 1]!.endPosition;
      if (appEnd !== engineEnd) {
        mismatches.push(`${entry.label} — app ends ${appEnd}, engine ends ${engineEnd}`);
      }
    }

    expect(mismatches.slice(0, 5)).toEqual([]);
  });
});
