import { describe, expect, it } from "vitest";
import { SNAPSHOT_VERSION } from "#lib/shared/sequence-viewer/tunnel/tunnel-snapshot.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { DEFAULT_TRAIL_SETTINGS } from "#lib/shared/animation-engine/domain/types/trail-types.js";
import { DEFAULT_CONFIG } from "#lib/shared/sequence-viewer/tunnel/tunnel-config.js";
import {
  TunnelCompositionSchema,
  createDerivedTunnelPerformer,
  createIndependentTunnelPerformer,
  createTunnelComposition,
} from "#lib/shared/sequence-viewer/tunnel/tunnel-composition.js";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { CollectedTunnel } from "../tunnel-collection-types";
import { createTunnelRevision } from "../tunnel-revision";
import {
  collectedTunnelFromPublicArtifact,
  createTunnelPublicRevision,
  sanitizeTunnelComposition,
  tunnelPublicPayload,
} from "../tunnel-public-revision";
import type { PublicArtifactEnvelope } from "#lib/shared/artifact-revisions/domain/public-artifact.js";

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

function tunnelFixture(
  overrides: Partial<CollectedTunnel> = {}
): CollectedTunnel {
  return {
    id: "tunnel-1",
    name: "My Tunnel",
    steps: [],
    snapshot,
    poster: "data:image/webp;base64,AA",
    createdAt: 123,
    ...overrides,
  };
}

function compositionFixture() {
  const sequence = createSequenceData({
    id: "library-sequence-42",
    name: "Source",
    word: "ABAB",
    steps: [],
  });
  const lead = createIndependentTunnelPerformer(sequence, 0);
  const echo = createDerivedTunnelPerformer(lead.id, 1, [
    { kind: "rotate", amount: 90 },
  ]);
  return createTunnelComposition([lead, echo], {
    id: "comp-1",
    name: "Cast",
    now: 456,
  });
}

function publicEnvelope(
  overrides: Partial<PublicArtifactEnvelope> = {}
): PublicArtifactEnvelope {
  return {
    artifactId: "public-tunnel-1",
    artifactType: "tunnel",
    ownerId: "owner-1",
    ownerDisplayName: "Flow Artist",
    title: "Published Tunnel",
    posterUrl: "https://example.com/poster.webp",
    currentRevisionId: "v1_" + "a".repeat(64),
    currentContentDigest: "a".repeat(64),
    publishedAt: new Date(100),
    updatedAt: new Date(200),
    schemaVersion: 1,
    ...overrides,
  };
}

describe("sanitizeTunnelComposition", () => {
  it("whitelists independent sources to positional placeholders", () => {
    const sanitized = sanitizeTunnelComposition(compositionFixture());
    const lead = sanitized.performers[0];
    if (!lead) throw new Error("sanitizing dropped the lead performer");
    expect(lead.source.kind).toBe("independent");
    if (lead.source.kind !== "independent") return;
    expect(lead.source.sequence).toEqual({
      id: "src-1",
      name: "Source",
      word: "ABAB",
      steps: [],
    });
    expect("sourceSequenceId" in lead.source).toBe(false);
  });

  it("drops hydrated SequenceData passthrough metadata entirely", () => {
    const sanitized = sanitizeTunnelComposition(compositionFixture());
    const serialized = JSON.stringify(sanitized);
    expect(serialized).not.toContain("library-sequence-42");
    expect(serialized).not.toContain("sourceSequenceId");
    expect(serialized).not.toContain("thumbnails");
    expect(serialized).not.toContain("isFavorite");
  });

  it("preserves the derivation graph verbatim", () => {
    const composition = compositionFixture();
    const sanitized = sanitizeTunnelComposition(composition);
    const sanitizedEcho = sanitized.performers[1];
    const authoredEcho = composition.performers[1];
    if (!sanitizedEcho || !authoredEcho) {
      throw new Error("the fixture should carry a derived second performer");
    }
    expect(sanitizedEcho.source).toEqual(authoredEcho.source);
    expect(sanitized.stage).toEqual(composition.stage);
    expect(sanitized.formation).toEqual(composition.formation);
  });

  it("still parses at the composition boundary schema", () => {
    const sanitized = sanitizeTunnelComposition(compositionFixture());
    expect(TunnelCompositionSchema.safeParse(sanitized).success).toBe(true);
  });
});

describe("tunnelPublicPayload", () => {
  it("never carries private lineage fields", () => {
    const payload = tunnelPublicPayload(
      tunnelFixture({
        source: "viewer",
        sourceWord: "ABAB",
        sourceSequenceId: "library-sequence-42",
        composition: compositionFixture(),
      })
    );
    expect("sourceSequenceId" in payload).toBe(false);
    expect("source" in payload).toBe(false);
    expect(payload.sourceWord).toBe("ABAB");
    expect(JSON.stringify(payload)).not.toContain("library-sequence-42");
  });

  it("omits absent optionals instead of writing undefined", () => {
    const payload = tunnelPublicPayload(tunnelFixture());
    expect(Object.keys(payload).sort()).toEqual([
      "poster",
      "snapshot",
      "steps",
    ]);
  });

  it("keeps a saved recipe private while preserving its rendered config", () => {
    const payload = tunnelPublicPayload(
      tunnelFixture({
        snapshot: {
          ...snapshot,
          tunnel: {
            ...snapshot.tunnel,
            presetRecipe: {
              kind: "saved",
              id: "personal-recipe-42",
              name: "Private rehearsal look",
              config: { ...DEFAULT_CONFIG },
            },
          },
        },
      })
    );
    expect(payload.snapshot.tunnel.config).toEqual(DEFAULT_CONFIG);
    expect(payload.snapshot.tunnel.presetRecipe).toBeNull();
    expect(JSON.stringify(payload)).not.toContain("personal-recipe-42");
  });

  it("preserves the normalized exact pair in public copies", () => {
    const payload = tunnelPublicPayload(tunnelFixture());
    expect(payload.snapshot.tunnel.colors).toEqual({
      mode: "custom",
      custom: { left: "#123456", right: "#abcdef" },
    });
  });
});

describe("collectedTunnelFromPublicArtifact", () => {
  it("validates a public revision into a discovery artifact without inventing private dates", () => {
    const payload = tunnelPublicPayload(
      tunnelFixture({
        sourceWord: "ABAB",
        composition: compositionFixture(),
      })
    );
    const discovered = collectedTunnelFromPublicArtifact(
      publicEnvelope(),
      payload
    );

    expect(discovered).toMatchObject({
      id: "public-tunnel-1",
      name: "Published Tunnel",
      source: "viewer",
      sourceWord: "ABAB",
      createdAt: 0,
    });
    expect(discovered?.composition).toEqual(payload.composition);
  });

  it("rejects the wrong artifact type or an invalid revision payload", () => {
    const payload = tunnelPublicPayload(tunnelFixture());
    expect(
      collectedTunnelFromPublicArtifact(
        publicEnvelope({ artifactType: "scene" }),
        payload
      )
    ).toBeNull();
    expect(
      collectedTunnelFromPublicArtifact(publicEnvelope(), {
        ...payload,
        snapshot: { broken: true },
      } as unknown as typeof payload)
    ).toBeNull();
  });
});

describe("createTunnelPublicRevision", () => {
  it("is deterministic for identical content", async () => {
    const a = await createTunnelPublicRevision(tunnelFixture());
    const b = await createTunnelPublicRevision(tunnelFixture());
    expect(a.revisionId).toBe(b.revisionId);
    expect(a.revisionId).toMatch(/^v1_[a-f0-9]{64}$/);
    expect(a.artifactType).toBe("tunnel");
  });

  it("ignores private-only differences (same public content, same id)", async () => {
    const base = await createTunnelPublicRevision(tunnelFixture());
    const withLineage = await createTunnelPublicRevision(
      tunnelFixture({
        source: "viewer",
        sourceSequenceId: "library-sequence-42",
        currentRevisionId: "v1_" + "a".repeat(64),
        currentContentDigest: "a".repeat(64),
      })
    );
    expect(withLineage.revisionId).toBe(base.revisionId);
  });

  it("changes with public content", async () => {
    const a = await createTunnelPublicRevision(tunnelFixture());
    const b = await createTunnelPublicRevision(
      tunnelFixture({ poster: "data:image/webp;base64,BB" })
    );
    expect(a.revisionId).not.toBe(b.revisionId);
  });

  it("addresses a different payload than the private revision when private extras exist", async () => {
    const tunnel = tunnelFixture({
      sourceSequenceId: "library-sequence-42",
      composition: compositionFixture(),
    });
    const privateRevision = await createTunnelRevision(
      tunnel,
      tunnel.createdAt
    );
    const publicRevision = await createTunnelPublicRevision(tunnel);
    expect(publicRevision.contentDigest).not.toBe(
      privateRevision.contentDigest
    );
  });
});
