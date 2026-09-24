/**
 * Golden regression set of real production short-code blobs.
 *
 * Every entry is a blob printed on (or linked from) a real card, sampled from
 * `shortcodes` across every wire format still in circulation: q1 and r1
 * wrappers around the legacy v1/v2/v3 bodies and the current body, the
 * short-lived numeric float format (9XAK), hands-only hand-path payloads, and
 * the start-only blobs that carry no steps at all (Kuofvw class). `expected`
 * pins what each blob plays today, every motion field of every step plus the
 * start pose. A codec change that alters what a printed code plays fails
 * here.
 *
 * Fixture: tests/fixtures/shortcode-payloads/golden-blobs.json (codes and
 * blobs only; no owner data).
 */
import { describe, expect, it } from "vitest";
import { decodeSequenceFromQR } from "$lib/shared/navigation/services/sequence-encoder";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import golden from "../../fixtures/shortcode-payloads/golden-blobs.json";

interface GoldenEntry {
  code: string;
  format: string;
  encoded: string;
  expected: {
    kind: string;
    start: { left: string; right: string } | null;
    steps: string[];
  };
}

type LooseMotion = Record<string, unknown> | undefined;

function compactMotion(m: LooseMotion): string {
  if (!m || m.isVisible === false) return "-";
  let s =
    `${m.motionType} ${m.rotationDirection} ${m.turns} ` +
    `${m.startLocation}>${m.endLocation} ${m.startOrientation}>${m.endOrientation}`;
  if (m.motionType === "float") {
    s += ` pre:${m.prefloatMotionType ?? "-"}/${m.prefloatRotationDirection ?? "-"}`;
  }
  if (m.skewSteps) s += ` skew:${m.skewSteps}/${m.skewDir}`;
  return s;
}

function compactPose(m: LooseMotion): string {
  if (!m) return "-";
  return (
    `${m.startLocation ?? m.endLocation} ${m.startOrientation} ${m.propType}` +
    (m.isVisible === false ? " hidden" : "")
  );
}

function compact(seq: SequenceData): GoldenEntry["expected"] {
  const start = (seq.startPlacement ?? seq.startingPlacement) as
    | { motions?: { left?: LooseMotion; right?: LooseMotion } }
    | undefined;
  return {
    kind: seq.sequenceKind ?? "prop",
    start: start
      ? {
          left: compactPose(start.motions?.left),
          right: compactPose(start.motions?.right),
        }
      : null,
    steps: seq.steps
      .filter((step) => step.stepNumber !== 0)
      .map((step) => {
        const motions = step.motions as unknown as {
          left?: LooseMotion;
          right?: LooseMotion;
        };
        const duration =
          step.duration && step.duration !== 1 ? ` d${step.duration}` : "";
        return `${compactMotion(motions.left)} | ${compactMotion(motions.right)}${duration}`;
      }),
  };
}

const entries = golden as GoldenEntry[];

describe("golden production short-code blobs", () => {
  it("covers every wire format still in circulation", () => {
    const formats = new Set(entries.map((entry) => entry.format));
    for (const format of [
      "q1/current",
      "q1/v1",
      "q1/v3",
      "q1/v1+start-only",
      "q1/current+numeric-float",
      "q1/current+hand-path",
      "r1/current",
      "r1/v1",
      "r1/v2",
      "r1/v3",
      "r1/current+hand-path",
    ]) {
      expect(formats, format).toContain(format);
    }
    expect(entries.length).toBeGreaterThanOrEqual(40);
  });

  it.each(entries.map((entry) => [entry.code, entry.format, entry] as const))(
    "%s (%s) plays its pinned choreography",
    async (_code, _format, entry) => {
      const decoded = await decodeSequenceFromQR(entry.encoded);
      expect(compact(decoded)).toEqual(entry.expected);
    }
  );
});
