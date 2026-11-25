import { describe, expect, it } from "vitest";
import { trajectoryReversals } from "@tka/shape-domain";
import {
  generatePoiReversalCandidates,
  selectNextPoiReversalCandidate,
  type PoiReversalLabel,
} from "../../src/lib/features/levels/poi-lab/domain/poi-reversal-candidates";

describe("poi reversal candidate experiment", () => {
  it("generates 260 stable, unique candidates without stationary duplicates", () => {
    const candidates = generatePoiReversalCandidates();
    expect(candidates).toHaveLength(260);
    expect(new Set(candidates.map((candidate) => candidate.id)).size).toBe(260);
    expect(
      candidates.filter((candidate) => candidate.trajectory.radius === 0)
    ).toHaveLength(4);
  });

  it("places the requested prop bearing at the named reversal step", () => {
    for (const candidate of generatePoiReversalCandidates()) {
      const reversals = trajectoryReversals(candidate.trajectory);
      expect(reversals).toHaveLength(2);
      const named = reversals.find(
        (reversal) => reversal.step === candidate.reversalStep
      );
      expect(named?.propPosition, candidate.id).toBe(
        candidate.reversalPropPosition
      );
    }
  });

  it("contains the worked pendulum and extendulum as the two calibration candidates", () => {
    const candidates = generatePoiReversalCandidates();
    const pendulum = candidates.find(
      (candidate) => candidate.calibration === "pendulum"
    );
    const extendulum = candidates.find(
      (candidate) => candidate.calibration === "extendulum"
    );

    expect(pendulum?.trajectory).toEqual({
      radius: 0,
      handDirection: 1,
      propRate: [1, 1, 1, 1, -1, -1, -1, -1],
      propPhase: 2,
    });
    expect(extendulum?.id).toBe("poi-r1-dcw-s3-p2");
    expect(extendulum?.trajectory).toEqual({
      radius: 1,
      handDirection: 1,
      propRate: [-1, -1, 1, 1, 1, 1, -1, -1],
      propPhase: 4,
    });
  });

  it("shows both calibration candidates before adaptive selection", () => {
    const candidates = generatePoiReversalCandidates();
    const first = selectNextPoiReversalCandidate([], candidates);
    expect(first?.reason).toBe("calibration-pendulum");

    const labels: PoiReversalLabel[] = [
      { candidate: first!.candidate, verdict: "legal" },
    ];
    const second = selectNextPoiReversalCandidate(labels, candidates);
    expect(second?.reason).toBe("calibration-extendulum");
  });

  it("switches to a boundary check after both legal and illegal labels exist", () => {
    const candidates = generatePoiReversalCandidates();
    const pendulum = candidates.find(
      (candidate) => candidate.calibration === "pendulum"
    )!;
    const extendulum = candidates.find(
      (candidate) => candidate.calibration === "extendulum"
    )!;
    const labels: PoiReversalLabel[] = [
      { candidate: pendulum, verdict: "legal" },
      { candidate: extendulum, verdict: "illegal" },
    ];

    const selection = selectNextPoiReversalCandidate(labels, candidates);
    expect(selection?.reason).toBe("boundary");
    expect(
      labels.some((label) => label.candidate.id === selection?.candidate.id)
    ).toBe(false);
    expect(
      selectNextPoiReversalCandidate(labels, candidates)?.candidate.id
    ).toBe(selection?.candidate.id);
  });

  it("inserts a repeat check every tenth observation", () => {
    const candidates = generatePoiReversalCandidates();
    const calibration = candidates.filter((candidate) => candidate.calibration);
    const other = candidates
      .filter((candidate) => !candidate.calibration)
      .slice(0, 7);
    const labels: PoiReversalLabel[] = [...calibration, ...other].map(
      (candidate, index) => ({
        candidate,
        verdict: index % 2 === 0 ? "legal" : "illegal",
      })
    );

    const selection = selectNextPoiReversalCandidate(labels, candidates);
    expect(selection?.reason).toBe("repeat");
    expect(
      labels.some((label) => label.candidate.id === selection?.candidate.id)
    ).toBe(true);
    expect(selection?.candidate.id).not.toBe(labels.at(-1)?.candidate.id);
  });
});
