import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CONTACT_BALL_RADIUS,
  buildContactPalmspinProfile,
  inspectContactFrame,
  sampleTwoBallPalmspin,
  type ContactPalmspinProfile,
} from "#lib/features/contact-lab/domain/contact-motion-profile.js";
import {
  CONTACT_PROOF_SEQUENCE_ID,
  selectContactProofSequence,
} from "#lib/features/contact-lab/domain/contact-proof-sequence.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { selectStaticSequence } from "#lib/shared/foundation/services/static-sequence-catalog.js";

const catalogPayload: unknown = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "static/data/hero/tnd-base-words.json"),
    "utf8"
  )
);

function getCatalogSequence(id: string): SequenceData {
  const sequence = selectStaticSequence(catalogPayload, id);
  if (!sequence) throw new Error(`Missing catalog sequence ${id}`);
  return sequence;
}

function getResolvedProfile(sequence: SequenceData): ContactPalmspinProfile {
  const result = buildContactPalmspinProfile(sequence);
  if (result.status === "unresolved") {
    throw new Error(result.issues.map((issue) => issue.detail).join("; "));
  }
  return result.profile;
}

describe("TKA-driven two-ball palmspin", () => {
  const mpmp = getCatalogSequence(CONTACT_PROOF_SEQUENCE_ID);
  const mpmpProfile = getResolvedProfile(mpmp);

  it("stays bound to the canonical MPMP catalog entry", () => {
    const selected = selectContactProofSequence(catalogPayload);

    expect(selected?.id).toBe(CONTACT_PROOF_SEQUENCE_ID);
    expect(selected?.word).toBe("MPMP");
    expect(selected?.steps).toHaveLength(4);
    expect(mpmpProfile.sequenceId).toBe(CONTACT_PROOF_SEQUENCE_ID);
  });

  it("closes the LOOP seam without moving a ball or hand", () => {
    const start = sampleTwoBallPalmspin(mpmpProfile, 0);
    const seam = sampleTwoBallPalmspin(mpmpProfile, 1);

    expect(seam.phase).toBe(0);
    expect(seam.hands).toEqual(start.hands);
    expect(seam.balls).toEqual(start.balls);
  });

  it("keeps four rolling balls on their declared support plane and tangent in pairs", () => {
    for (let sample = 0; sample < 256; sample += 1) {
      const frame = sampleTwoBallPalmspin(mpmpProfile, sample / 256);
      expect(inspectContactFrame(frame)).toEqual([]);
      expect(frame.balls).toHaveLength(4);

      for (const hand of ["left", "right"] as const) {
        const [a, b] = frame.balls.filter((ball) => ball.hand === hand);
        expect(a).toBeDefined();
        expect(b).toBeDefined();
        const distance = Math.hypot(
          a!.position[0] - b!.position[0],
          a!.position[1] - b!.position[1],
          a!.position[2] - b!.position[2]
        );
        expect(distance).toBeCloseTo(CONTACT_BALL_RADIUS * 2, 6);
        expect(a!.supportMode).toBe("rolling");
        expect(a!.contact.hand).toBe(hand);
      }
    }
  });

  it("covers all source steps and all eight palm positions", () => {
    const steps = new Set<number>();
    const waypoints = new Set<number>();

    for (let sample = 0; sample < 256; sample += 1) {
      const frame = sampleTwoBallPalmspin(mpmpProfile, sample / 256);
      steps.add(frame.sourceStepNumber);
      waypoints.add(frame.palmWaypoint);
    }

    expect([...steps].sort()).toEqual([1, 2, 3, 4]);
    expect([...waypoints].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("changes the palmspin when the source hand path changes", () => {
    const pmpmProfile = getResolvedProfile(
      getCatalogSequence("tnd-quarter-opp-pmpm")
    );
    const mpmpStart = sampleTwoBallPalmspin(mpmpProfile, 0);
    const pmpmStart = sampleTwoBallPalmspin(pmpmProfile, 0);

    expect(pmpmStart.balls[0].position).not.toEqual(
      mpmpStart.balls[0].position
    );
    expect(pmpmStart.palmWaypoint).not.toBe(mpmpStart.palmWaypoint);
  });

  it("rejects center-point and disconnected paths instead of inventing contact motion", () => {
    const centerPoint = structuredClone(mpmp);
    const centerMotion = centerPoint as unknown as {
      steps: Array<{ motions: { left: { endLocation: string } } }>;
    };
    centerMotion.steps[0]!.motions.left.endLocation = "c";

    const disconnected = structuredClone(mpmp);
    const disconnectedMotion = disconnected as unknown as {
      steps: Array<{
        motions: { left: { startLocation: string; endLocation: string } };
      }>;
    };
    disconnectedMotion.steps[1]!.motions.left.startLocation = "s";
    disconnectedMotion.steps[1]!.motions.left.endLocation = "w";

    const centerResult = buildContactPalmspinProfile(centerPoint);
    const disconnectedResult = buildContactPalmspinProfile(disconnected);

    expect(centerResult.status).toBe("unresolved");
    expect(
      centerResult.status === "unresolved" &&
        centerResult.issues.some(
          (issue) => issue.code === "unsupported-location"
        )
    ).toBe(true);
    expect(disconnectedResult.status).toBe("unresolved");
    expect(
      disconnectedResult.status === "unresolved" &&
        disconnectedResult.issues.some(
          (issue) => issue.code === "disconnected-path"
        )
    ).toBe(true);
  });

  it("wraps negative and overflowing phases", () => {
    expect(sampleTwoBallPalmspin(mpmpProfile, -0.25)).toEqual(
      sampleTwoBallPalmspin(mpmpProfile, 0.75)
    );
    expect(sampleTwoBallPalmspin(mpmpProfile, 1.25)).toEqual(
      sampleTwoBallPalmspin(mpmpProfile, 0.25)
    );
  });
});
