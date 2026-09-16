import { describe, it, expect } from "vitest";
import {
  CollectedTunnelSchema,
  TUNNEL_COLLECTION_STORAGE_KEY,
  type CollectedTunnel,
} from "../tunnel-collection-types";
import { SNAPSHOT_VERSION } from "$lib/shared/sequence-viewer/tunnel/tunnel-snapshot";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
import { DEFAULT_TRAIL_SETTINGS } from "$lib/shared/animation-engine/domain/types/trail-types";
import { DEFAULT_CONFIG } from "$lib/shared/sequence-viewer/tunnel/tunnel-config";
import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  createDerivedTunnelPerformer,
  createIndependentTunnelPerformer,
  createTunnelComposition,
} from "$lib/shared/sequence-viewer/tunnel/tunnel-composition";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  HandSide,
  Orientation,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  createTunnelRevision,
  prepareTunnelRevision,
} from "../tunnel-revision";
import {
  migrateTunnelArtifact,
  needsTunnelPosterRefresh,
} from "../tunnel-artifact-migration";

const snapshot: CollectedTunnel["snapshot"] = {
  version: SNAPSHOT_VERSION,
  tunnel: {
    config: DEFAULT_CONFIG,
    gridVisible: false,
    colors: {
      mode: "custom",
      custom: { left: "#123456", right: "#abcdef" },
    },
    section: "tunnel",
    presetRecipe: null,
  },
  effects: DEFAULT_EFFECTS_CONFIG,
  effort: "linear",
  paths: {
    pathShape: "arc",
    motionAwarePaths: false,
    leftPathLines: false,
    rightPathLines: false,
  },
  playback: { bpm: 60, playbackMode: "continuous" },
  props: { leftPropType: "staff", rightPropType: "staff" },
  trailRender: DEFAULT_TRAIL_SETTINGS,
};

const valid = {
  id: "t1",
  name: "My Tunnel",
  steps: [],
  snapshot,
  poster: "data:image/webp;base64,AA",
  createdAt: 123,
};

describe("CollectedTunnelSchema", () => {
  it("accepts a well-formed record", () => {
    expect(CollectedTunnelSchema.safeParse(valid).success).toBe(true);
  });
  it("requires an id", () => {
    const { id: _drop, ...rest } = valid;
    expect(CollectedTunnelSchema.safeParse(rest).success).toBe(false);
  });
  it("exposes the storage key", () => {
    expect(TUNNEL_COLLECTION_STORAGE_KEY).toBe("tka:tunnel-collection");
  });

  // Unit 3 (lineage stamp): old entries lack sourceWord/sourceSequenceId
  // entirely — the schema must still accept them.
  it("accepts an entry with no lineage stamp (old entries)", () => {
    expect(CollectedTunnelSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts an entry stamped with a simplified source word + id", () => {
    // The stamp always goes through simplifyRepeatedWord at save time — a
    // repeating word like "FΨFΨFΨFΨ" is stored as its shortest form "FΨ",
    // never the raw repeated string (rule: simplified-word-display).
    const sourceWord = simplifyRepeatedWord("FΨFΨFΨFΨ");
    expect(sourceWord).toBe("FΨ");

    const stamped = { ...valid, sourceWord, sourceSequenceId: "seq-123" };
    const result = CollectedTunnelSchema.safeParse(stamped);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sourceWord).toBe("FΨ");
      expect(result.data.sourceSequenceId).toBe("seq-123");
    }
  });

  it("accepts a saved multi-performer composition", () => {
    const sequence = createSequenceData({
      id: "sequence-1",
      name: "Lead",
      word: "LEAD",
      steps: [],
    });
    const lead = createIndependentTunnelPerformer(sequence, 0, "Lead");
    const partner = createDerivedTunnelPerformer(lead.id, 1, [
      { kind: "rotate", amount: 3 },
      { kind: "mirror" },
      { kind: "rewind" },
    ]);
    partner.timing = { stepOffset: 2, speed: 0.5 };
    const composition = createTunnelComposition([lead, partner]);

    const parsed = CollectedTunnelSchema.safeParse({ ...valid, composition });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.composition?.performers[1]).toEqual(partner);
  });

  it("preserves each hand's exact orientations across the storage boundary", () => {
    const orientedStep = {
      id: "step-1",
      letter: null,
      startPlacement: null,
      endPlacement: null,
      stepNumber: 1,
      duration: 1,
      leftReversal: false,
      rightReversal: false,
      isBlank: false,
      motions: {
        [HandSide.LEFT]: createMotionData({
          hand: HandSide.LEFT,
          startOrientation: Orientation.CLOCK_IN,
          endOrientation: Orientation.COUNTER_OUT,
        }),
        [HandSide.RIGHT]: createMotionData({
          hand: HandSide.RIGHT,
          startOrientation: Orientation.CENTER_NE,
          endOrientation: Orientation.CENTER_SW,
        }),
      },
    };

    const parsed = CollectedTunnelSchema.parse({
      ...valid,
      steps: [orientedStep],
    });

    expect(parsed.steps[0]?.motions[HandSide.LEFT]).toMatchObject({
      startOrientation: Orientation.CLOCK_IN,
      endOrientation: Orientation.COUNTER_OUT,
    });
    expect(parsed.steps[0]?.motions[HandSide.RIGHT]).toMatchObject({
      startOrientation: Orientation.CENTER_NE,
      endOrientation: Orientation.CENTER_SW,
    });
  });

  it("stores choreography transforms in the immutable tunnel revision", async () => {
    const sequence = createSequenceData({
      id: "sequence-1",
      name: "Lead",
      word: "LEAD",
      steps: [],
    });
    const lead = createIndependentTunnelPerformer(sequence, 0, "Lead");
    const partner = createDerivedTunnelPerformer(lead.id, 1, [
      { kind: "flip" },
      { kind: "invert" },
    ]);
    partner.timing = { stepOffset: 3, speed: 2 };
    const composition = createTunnelComposition([lead, partner]);
    const tunnel = { ...valid, composition } as CollectedTunnel;

    const prepared = await prepareTunnelRevision(tunnel);
    const revision = await createTunnelRevision(
      prepared,
      prepared.currentRevisionCreatedAt!
    );

    expect(revision.payload.composition?.performers[1]).toEqual(partner);
  });

  it("creates deterministic immutable revisions and advances only on content edits", async () => {
    const first = await prepareTunnelRevision(valid as CollectedTunnel);
    const same = await prepareTunnelRevision(
      { ...first, name: "Renamed" },
      first
    );
    const changed = await prepareTunnelRevision(
      {
        ...same,
        snapshot: {
          ...same.snapshot,
          playback: { ...same.snapshot.playback, bpm: 90 },
        },
      },
      same
    );

    expect(first.currentRevisionId).toMatch(/^v1_[a-f0-9]{64}$/);
    expect(same.currentRevisionId).toBe(first.currentRevisionId);
    expect(changed.currentRevisionId).not.toBe(first.currentRevisionId);

    const retained = await createTunnelRevision(
      first,
      first.currentRevisionCreatedAt!
    );
    const retainedChange = await createTunnelRevision(
      changed,
      changed.currentRevisionCreatedAt!
    );
    expect(retained.payload.snapshot.playback.bpm).toBe(60);
    expect(retainedChange.payload.snapshot.playback.bpm).toBe(90);
    expect(retained.revisionId).toBe(first.currentRevisionId);
    expect(retainedChange.revisionId).toBe(changed.currentRevisionId);
  });

  it("does not mint a v2 choreography revision when only a canonical poster refreshes", async () => {
    const first = await prepareTunnelRevision(valid as CollectedTunnel);
    const refreshed = await prepareTunnelRevision(
      {
        ...first,
        poster: "data:image/webp;base64,CANONICAL",
        posterRenderVersion: 1,
      },
      first
    );

    expect(first.currentRevisionSchemaVersion).toBe(2);
    expect(refreshed.currentRevisionId).toBe(first.currentRevisionId);
    expect(refreshed.currentContentDigest).toBe(first.currentContentDigest);
  });

  it("retains a v1 revision when legacy presentation changes, then advances to v2 only for choreography", async () => {
    const legacyPayload = {
      ...valid,
      poster: "data:image/webp;base64,old",
    } as CollectedTunnel;
    const legacyDigest = await createTunnelRevision(
      {
        ...legacyPayload,
        currentRevisionSchemaVersion: 1,
      },
      123
    );
    const previous = {
      ...legacyPayload,
      currentRevisionId: legacyDigest.revisionId,
      currentContentDigest: legacyDigest.contentDigest,
      currentRevisionCreatedAt: 123,
      currentRevisionSchemaVersion: 1 as const,
    };
    const posterOnly = await prepareTunnelRevision(
      {
        ...previous,
        poster: "data:image/webp;base64,new",
        posterRenderVersion: 1,
      },
      previous
    );
    const changed = await prepareTunnelRevision(
      {
        ...posterOnly,
        snapshot: {
          ...posterOnly.snapshot,
          playback: { ...posterOnly.snapshot.playback, bpm: 90 },
        },
      },
      posterOnly
    );

    expect(posterOnly.currentRevisionId).not.toBe(previous.currentRevisionId);
    // V1 deliberately included the old poster, so the safe presentation path
    // bypasses prepareTunnelRevision for records like this. A choreography edit
    // moves the record into v2, where disposable posters no longer affect it.
    expect(changed.currentRevisionSchemaVersion).toBe(2);
    expect(changed.currentRevisionId).not.toBe(posterOnly.currentRevisionId);
  });

  it("migrates the envelope without inventing a cast or calling an unknown poster current", () => {
    const legacy = {
      ...valid,
      snapshot: { ...snapshot, version: 1 },
    } as CollectedTunnel;
    const migrated = migrateTunnelArtifact(legacy);

    expect(migrated.changed).toBe(true);
    expect(migrated.tunnel.artifactSchemaVersion).toBe(2);
    expect(migrated.tunnel.composition).toBeUndefined();
    expect(migrated.tunnel.snapshot.tunnel.presetRecipe).toBeNull();
    expect(needsTunnelPosterRefresh(migrated.tunnel)).toBe(true);
  });
});
