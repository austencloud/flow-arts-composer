import { describe, expect, it } from "vitest";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { TunnelSnapshot } from "#lib/shared/sequence-viewer/tunnel/tunnel-snapshot.js";
import {
  beginTunnelSaveAttempt,
  createTunnelSaveDedupeState,
  createTunnelSaveFingerprint,
  finishTunnelSaveAttempt,
  TUNNEL_SAVE_DEDUPE_WINDOW_MS,
} from "#lib/shared/sequence-viewer/domain/tunnel-save-deduplication.js";
import {
  createDerivedTunnelPerformer,
  createIndependentTunnelPerformer,
  createTunnelComposition,
} from "#lib/shared/sequence-viewer/tunnel/tunnel-composition.js";

const snapshot = {
  version: 1,
  tunnel: {
    config: { fold: 6, mirror: true },
    gridVisible: false,
    spectrum: true,
    section: "tunnel",
  },
  effects: { glow: { enabled: true } },
  effort: "constant",
  paths: {
    pathShape: "arc",
    motionAwarePaths: true,
    leftPathLines: false,
    rightPathLines: false,
  },
  playback: { bpm: 60, playbackMode: "continuous" },
  props: { leftPropType: "staff", rightPropType: "staff" },
  trailRender: { enabled: true },
} as unknown as TunnelSnapshot;

const sequence = createSequenceData({
  id: "sequence-a",
  word: "AB",
  steps: [],
});

describe("Tunnel save deduplication", () => {
  it("accepts only one overlapping save attempt", () => {
    const fingerprint = createTunnelSaveFingerprint(sequence, snapshot);
    const first = beginTunnelSaveAttempt(
      createTunnelSaveDedupeState(),
      fingerprint,
      1_000
    );
    const overlapping = beginTunnelSaveAttempt(first.state, fingerprint, 1_001);

    expect(first.accepted).toBe(true);
    expect(overlapping.accepted).toBe(false);
  });

  it("rejects the same successful save 2.4 seconds later", () => {
    const fingerprint = createTunnelSaveFingerprint(sequence, snapshot);
    const first = beginTunnelSaveAttempt(
      createTunnelSaveDedupeState(),
      fingerprint,
      1_000
    );
    const saved = finishTunnelSaveAttempt(
      first.state,
      fingerprint,
      "succeeded",
      1_100
    );
    const duplicate = beginTunnelSaveAttempt(saved, fingerprint, 3_500);

    expect(duplicate.accepted).toBe(false);
  });

  it("accepts changed sequence or snapshot state within the dedupe window", () => {
    const fingerprint = createTunnelSaveFingerprint(sequence, snapshot);
    const first = beginTunnelSaveAttempt(
      createTunnelSaveDedupeState(),
      fingerprint,
      1_000
    );
    const saved = finishTunnelSaveAttempt(
      first.state,
      fingerprint,
      "succeeded",
      1_100
    );
    const changedSequence = createTunnelSaveFingerprint(
      createSequenceData({ id: "sequence-b", word: "AC", steps: [] }),
      snapshot
    );
    const changedSnapshot = createTunnelSaveFingerprint(sequence, {
      ...snapshot,
      playback: { ...snapshot.playback, bpm: 90 },
    });

    expect(beginTunnelSaveAttempt(saved, changedSequence, 1_200).accepted).toBe(
      true
    );
    expect(beginTunnelSaveAttempt(saved, changedSnapshot, 1_200).accepted).toBe(
      true
    );
  });

  it("keeps failed persistence retryable", () => {
    const fingerprint = createTunnelSaveFingerprint(sequence, snapshot);
    const first = beginTunnelSaveAttempt(
      createTunnelSaveDedupeState(),
      fingerprint,
      1_000
    );
    const failed = finishTunnelSaveAttempt(
      first.state,
      fingerprint,
      "failed",
      1_100
    );

    expect(beginTunnelSaveAttempt(failed, fingerprint, 1_101).accepted).toBe(
      true
    );
  });

  it("allows the same content after the dedupe window", () => {
    const fingerprint = createTunnelSaveFingerprint(sequence, snapshot);
    const first = beginTunnelSaveAttempt(
      createTunnelSaveDedupeState(),
      fingerprint,
      1_000
    );
    const saved = finishTunnelSaveAttempt(
      first.state,
      fingerprint,
      "succeeded",
      1_100
    );

    expect(
      beginTunnelSaveAttempt(
        saved,
        fingerprint,
        1_100 + TUNNEL_SAVE_DEDUPE_WINDOW_MS
      ).accepted
    ).toBe(true);
  });

  it("ignores poster, record id, and sequence timestamps in equality", () => {
    const first = createSequenceData({
      id: "record-a",
      word: "AB",
      steps: [],
      createdAt: new Date(0),
      animatedSequenceUrl: "data:image/webp;base64,first-poster",
    });
    const second = createSequenceData({
      id: "record-b",
      word: "AB",
      steps: [],
      createdAt: new Date(10_000),
      animatedSequenceUrl: "data:image/webp;base64,second-poster",
    });

    expect(createTunnelSaveFingerprint(first, snapshot)).toBe(
      createTunnelSaveFingerprint(second, snapshot)
    );
  });

  it("distinguishes partner choreography without treating save timestamps as content", () => {
    const partnerA = createSequenceData({
      id: "partner-a",
      word: "A",
      steps: [],
    });
    const partnerB = createSequenceData({
      id: "partner-b",
      word: "B",
      steps: [],
    });
    const first = createTunnelComposition([
      createIndependentTunnelPerformer(sequence, 0, "Lead"),
      createIndependentTunnelPerformer(partnerA, 1, "Partner"),
    ]);
    const later = { ...first, updatedAt: first.updatedAt + 1_000 };
    const changed = {
      ...first,
      performers: [
        first.performers[0]!,
        {
          ...first.performers[1]!,
          source: { kind: "independent" as const, sequence: partnerB },
        },
      ],
    };

    expect(createTunnelSaveFingerprint(sequence, snapshot, first)).toBe(
      createTunnelSaveFingerprint(sequence, snapshot, later)
    );
    expect(createTunnelSaveFingerprint(sequence, snapshot, changed)).not.toBe(
      createTunnelSaveFingerprint(sequence, snapshot, first)
    );
  });

  it("treats relationship transforms and timing as saved choreography", () => {
    const lead = createIndependentTunnelPerformer(sequence, 0, "Lead");
    const partner = createDerivedTunnelPerformer(lead.id, 1, [
      { kind: "rotate", amount: 2 },
    ]);
    const first = createTunnelComposition([lead, partner]);
    const transformed = {
      ...first,
      performers: [
        lead,
        {
          ...partner,
          source: {
            kind: "derived" as const,
            performerId: lead.id,
            transforms: [{ kind: "mirror" as const }],
          },
        },
      ],
    };
    const retimed = {
      ...first,
      performers: [lead, { ...partner, timing: { stepOffset: 2, speed: 0.5 } }],
    };

    expect(
      createTunnelSaveFingerprint(sequence, snapshot, transformed)
    ).not.toBe(createTunnelSaveFingerprint(sequence, snapshot, first));
    expect(createTunnelSaveFingerprint(sequence, snapshot, retimed)).not.toBe(
      createTunnelSaveFingerprint(sequence, snapshot, first)
    );
  });

  it("treats stage assignment as saved composition", () => {
    const first = createTunnelComposition([
      createIndependentTunnelPerformer(sequence, 0, "Performer 1"),
      createIndependentTunnelPerformer(sequence, 1, "Performer 2"),
    ]);
    const reassigned = {
      ...first,
      stage: {
        instances: [
          {
            ...first.stage.instances[0]!,
            performerId: first.performers[1]!.id,
          },
          {
            ...first.stage.instances[1]!,
            performerId: first.performers[0]!.id,
          },
        ],
      },
    };

    expect(
      createTunnelSaveFingerprint(sequence, snapshot, reassigned)
    ).not.toBe(createTunnelSaveFingerprint(sequence, snapshot, first));
  });
});
