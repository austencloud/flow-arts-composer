/**
 * Produce the prop-continuity report.
 *
 * Not part of the default suite - it writes a committed artifact, and a CI run
 * must never rewrite one. Run it explicitly:
 *
 *   npx vitest run --config tests/config/vitest.diagnostics.config.ts
 *
 * Output:
 *   docs/diagnostics/prop-continuity-findings.json  (machine-readable)
 *   a human table on stdout
 */

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { PlaneMode } from "@austencloud/scene-3d";

import {
  createCharacterInstanceState,
  makeStandaloneDeps,
} from "#lib/shared/3d/state/character-instance-state.svelte.js";
import {
  sweepPropContinuity,
  type PropPoseScoreSource,
} from "#lib/shared/3d/diagnostics/prop-continuity-sweep.js";
import type { ContinuityFinding } from "#lib/shared/3d/diagnostics/prop-continuity-audit.js";

import { propContinuityCorpus, type CorpusEntry } from "./prop-continuity-corpus";

const PHASE_STEP = 0.002;
const OUT_DIR = path.resolve(process.cwd(), "docs/diagnostics");
const OUT_FILE = path.join(OUT_DIR, "prop-continuity-findings.json");

function sweepEntry(entry: CorpusEntry) {
  const state = createCharacterInstanceState(
    { id: `continuity-${entry.id}`, persistent: false },
    makeStandaloneDeps()
  );
  state.setPlaneMode(PlaneMode.WALL);
  state.loadSequence(entry.sequence);
  return sweepPropContinuity(
    entry.id,
    entry.word,
    state as unknown as PropPoseScoreSource,
    { phaseStep: PHASE_STEP, planeMode: PlaneMode.WALL }
  );
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

describe("prop continuity sweep", () => {
  it("sweeps the core set and the lab fixtures", () => {
    const corpus = propContinuityCorpus();
    expect(corpus.filter((e) => e.group === "core-tnd")).toHaveLength(19);
    expect(corpus.filter((e) => e.group === "lab-fixture")).toHaveLength(7);

    const sequences = corpus.map((entry) => {
      const result = sweepEntry(entry);
      return {
        sequenceId: entry.id,
        word: entry.word,
        group: entry.group,
        motionStepCount: result.motionStepCount,
        sampleCount: result.samples.length,
        findings: result.findings,
      };
    });

    const findings: ContinuityFinding[] = sequences.flatMap((s) => s.findings);

    const artifact = {
      $schema: "prop-continuity-findings/1",
      generatedBy:
        "npx vitest run --config tests/config/vitest.diagnostics.config.ts",
      detector: "src/lib/shared/3d/diagnostics/prop-continuity-audit.ts",
      sampler: "src/lib/shared/3d/diagnostics/prop-continuity-sweep.ts",
      planeMode: "wall",
      phaseStep: PHASE_STEP,
      phaseAxis:
        "Motion score time in steps. 0.00 is the start of step 1. The staff-grip lab labels phase P as `${floor(P)+1}.${round((P%1)*100)}`, so lab phase 3.664 displays as 4.66.",
      modelled: [
        "authored grid path (calculatePropState via CharacterInstanceState.propStatesAtScoreTime)",
        "stance yaw track (buildStanceYawTrackForSource)",
        "hand depth corridor (resolveTrackedUpperBodyStance -> planUpperBodyStanceDepth)",
        "rig composition (PerformerRig hand anchor + prop anchor)",
      ],
      notModelled: [
        "Avatar3D contact-lock correction group (clamped anchor-to-palm IK residual, written per frame)",
        "measured reach geometry (sameSideLaneM clamps the corridor lane to <= 0.16 m, so magnitudes here are an upper bound and phases are unaffected)",
      ],
      totals: {
        sequences: sequences.length,
        sequencesWithFindings: sequences.filter((s) => s.findings.length > 0)
          .length,
        findings: findings.length,
        byClass: findings.reduce<Record<string, number>>((acc, f) => {
          acc[f.class] = (acc[f.class] ?? 0) + 1;
          return acc;
        }, {}),
      },
      sequences,
      findings,
    };

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT_FILE, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

    const header =
      pad("sequence", 26) +
      pad("word", 10) +
      pad("prop", 6) +
      pad("phase window", 18) +
      pad("lab label", 16) +
      pad("cm", 8) +
      pad("deg", 8) +
      pad("axis", 6) +
      pad("class", 22) +
      "peak/baseline";
    const lines = findings.map(
      (f) =>
        pad(f.sequenceId, 26) +
        pad(
          sequences.find((s) => s.sequenceId === f.sequenceId)?.word ?? "",
          10
        ) +
        pad(f.prop, 6) +
        pad(`${f.phaseStart.toFixed(3)}-${f.phaseEnd.toFixed(3)}`, 18) +
        pad(`${f.labelStart}-${f.labelEnd}`, 16) +
        pad(f.magnitudeCm.toFixed(1), 8) +
        pad(f.magnitudeDeg.toFixed(1), 8) +
        pad(f.axis, 6) +
        pad(f.class, 22) +
        `${f.peakSpeedCmPerStep.toFixed(0)}/${f.baselineCmOrDegPerStep.toFixed(0)} = ${f.trendRatio.toFixed(1)}x`
    );

    console.log(
      [
        "",
        `swept ${sequences.length} sequences at phase step ${PHASE_STEP}`,
        `${findings.length} findings in ${artifact.totals.sequencesWithFindings} sequences`,
        JSON.stringify(artifact.totals.byClass),
        "",
        header,
        "-".repeat(header.length),
        ...lines,
        "",
        `clean: ${sequences
          .filter((s) => s.findings.length === 0)
          .map((s) => s.word)
          .join(", ")}`,
        "",
        `wrote ${OUT_FILE}`,
      ].join("\n")
    );

    expect(fs.existsSync(OUT_FILE)).toBe(true);
  }, 120_000);
});
