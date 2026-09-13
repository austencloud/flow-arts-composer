/**
 * How far does each divergence actually reach into shipped behaviour?
 *
 * READ-ONLY AUDIT EVIDENCE. `loop-executor-parity.test.ts` measures the
 * executors in isolation. This suite bounds the blast radius: which production
 * entry points hit the divergent engine conversion, and what a caller sees when
 * they do.
 *
 * Two facts are locked here.
 *
 * 1. The app's fresh-generation path does NOT reach the divergent conversion.
 *    `resolveLoopConfig` produces a `LOOPSpecWire` for every LOOP type and
 *    period, and `generation-orchestrator` passes it to `SequenceBuilder` as
 *    `loopSpec`, which takes precedence over the legacy type+period branch.
 *    The wire keeps every non-rotation component at period 2 — the rhythm
 *    convention, not the uniform-period one.
 *
 * 2. The engine's own public adapter (`executeLOOP`, used by
 *    `mcp-server/src/tools/loop-tools.ts`) DOES go through
 *    `loopSpecFromLegacy`, and reports failure rather than returning a
 *    non-closing LOOP. `mcp-server-pkg/src/core/loop/loop-adapter.ts` calls
 *    `loopExecutorSelector.getExecutor()` directly with no closure stage, so
 *    the published MCP package has no equivalent guard.
 *
 * See `docs/reports/opus-batch-2026-09-12/sequence-engine-parity.md`.
 */

import { describe, expect, it } from "vitest";

import {
  executeLOOP,
  LOOPComponent,
  LOOPType as EngineLOOPType,
  Period as EnginePeriod,
} from "@tka/sequence-engine/loop";
import { resolveLoopConfig } from "$lib/shared/create/services/loop-type-utils";
import { LOOPType as AppLOOPTypeEnum } from "$lib/shared/foundation/domain/models/generation/circular-models";

import { buildSeed, loadPictographRows } from "./harness/canonical-fixtures";

function seedFor(letter: string, from: string, to: string) {
  const row = loadPictographRows("diamond").find(
    (r) => r.letter === letter && r.startPosition === from && r.endPosition === to
  );
  if (!row) throw new Error(`No canonical diamond row ${letter} ${from}→${to}`);
  return buildSeed([row], "diamond");
}

/** A 90° pair — the seed shape a quartered rotation LOOP is built from. */
const QUARTER_SEED = () => seedFor("A", "alpha3", "alpha5");
/** A 180° pair — the seed shape a halved rotation LOOP is built from. */
const HALF_SEED = () => seedFor("Φ-", "alpha3", "alpha7");

describe("blast radius — the app's fresh-generation path", () => {
  it("always resolves a LOOPSpec wire, so it never falls back to the legacy branch", () => {
    const missing: string[] = [];
    for (const loopType of Object.values(AppLOOPTypeEnum)) {
      for (const period of ["halved", "quartered"] as const) {
        const resolved = resolveLoopConfig(
          loopType as never,
          period as never,
          undefined as never
        );
        if (!resolved.loopSpecWire) missing.push(`${loopType}/${period}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("keeps every non-rotation component at period 2 even for a quartered request", () => {
    // This is the rhythm convention. It is exactly what
    // `engine-pipeline-configuration.test.ts` measures as "rhythm-raw", and it
    // is why the divergence that `loopSpecFromLegacy` introduces at period 4
    // does not reach the Generate tab.
    const offenders: string[] = [];
    for (const loopType of Object.values(AppLOOPTypeEnum)) {
      const resolved = resolveLoopConfig(
        loopType as never,
        "quartered" as never,
        undefined as never
      );
      const left = resolved.loopSpecWire?.left ?? {};
      for (const [component, spec] of Object.entries(left)) {
        if (component === LOOPComponent.ROTATED) continue;
        if (spec.period !== 2) {
          offenders.push(`${loopType}.${component}=${spec.period}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("blast radius — the engine's public executeLOOP adapter", () => {
  it("refuses quartered ROTATED_INVERTED rather than returning an open LOOP", () => {
    const result = executeLOOP(
      QUARTER_SEED() as never,
      "A",
      EngineLOOPType.ROTATED_INVERTED,
      EnginePeriod.QUARTERED,
      []
    );
    expect(result.success).toBe(false);
    expect(result.steps).toEqual([]);
    expect(result.error).toContain(
      "Cannot close orientation on an open position pattern"
    );
  });

  it("refuses quartered ROTATED_SWAPPED for the same reason", () => {
    const result = executeLOOP(
      QUARTER_SEED() as never,
      "A",
      EngineLOOPType.ROTATED_SWAPPED,
      EnginePeriod.QUARTERED,
      []
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain(
      "Cannot close orientation on an open position pattern"
    );
  });

  it("still succeeds for the cases the legacy conversion handles correctly", () => {
    const quarteredRotated = executeLOOP(
      QUARTER_SEED() as never,
      "A",
      EngineLOOPType.ROTATED,
      EnginePeriod.QUARTERED,
      []
    );
    expect(quarteredRotated.success).toBe(true);
    expect(quarteredRotated.steps.length).toBe(5);

    const halvedRotatedInverted = executeLOOP(
      HALF_SEED() as never,
      "Φ-",
      EngineLOOPType.ROTATED_INVERTED,
      EnginePeriod.HALVED,
      []
    );
    expect(halvedRotatedInverted.success).toBe(true);
    expect(halvedRotatedInverted.steps.length).toBe(3);
  });
});
