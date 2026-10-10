import { describe, expect, it } from "vitest";
import {
  createCollaborativeVideo,
  createSequencePerformanceAssociation,
  createTunnelRealizationAssociation,
  mediaAssociationKey,
  normalizeMediaAssociations,
} from "#lib/shared/video-collaboration/domain/collaborative-video.js";
import { createArtifactRevisionRef } from "#lib/shared/artifact-revisions/domain/artifact-revision.js";
import { auditMediaAssociationRevision } from "#lib/shared/video-collaboration/domain/media-revision-audit.js";

const base = {
  id: "video-1",
  videoUrl: "https://example.com/video.mp4",
  storagePath: "recordings/video.mp4",
  duration: 12,
  fileSize: 123,
  mimeType: "video/mp4",
  creatorId: "creator-1",
};

describe("video media associations", () => {
  it("hydrates a legacy sequence reference into a performance association", () => {
    const video = createCollaborativeVideo({
      ...base,
      sequenceId: "sequence-1",
      sequenceName: "ABCD",
    });

    expect(video.associations).toEqual([
      createSequencePerformanceAssociation("sequence-1", "ABCD"),
    ]);
    expect(mediaAssociationKey(video.associations[0]!)).toBe(
      "sequence:sequence-1"
    );
  });

  it("keeps a tunnel realization distinct from source-sequence lineage", () => {
    const revision = createArtifactRevisionRef("tunnel-1", "a".repeat(64));
    const association = createTunnelRealizationAssociation(
      "tunnel-1",
      "Prism tunnel",
      "sequence-1",
      revision
    );
    const video = createCollaborativeVideo({
      ...base,
      associations: [association],
    });

    expect(video.sequenceId).toBeUndefined();
    expect(video.associations).toEqual([association]);
    expect(mediaAssociationKey(video.associations[0]!)).toBe("tunnel:tunnel-1");
    expect(video.associations[0]?.revision).toEqual(revision);
  });

  it("refuses a revision borrowed from another subject", () => {
    const wrongRevision = createArtifactRevisionRef("tunnel-2", "b".repeat(64));
    expect(() =>
      createTunnelRealizationAssociation(
        "tunnel-1",
        "Prism tunnel",
        undefined,
        wrongRevision
      )
    ).toThrow("does not belong");
  });

  it("reports an unpinned legacy association as ambiguous instead of guessing", () => {
    const legacy = createTunnelRealizationAssociation(
      "tunnel-1",
      "Prism tunnel"
    );
    expect(auditMediaAssociationRevision(legacy)).toEqual({
      status: "ambiguous",
      reason: "missing-revision",
    });
  });

  it("deduplicates legacy and typed references to the same performance", () => {
    expect(
      normalizeMediaAssociations({
        sequenceId: "sequence-1",
        associations: [
          createSequencePerformanceAssociation("sequence-1", "ABCD"),
        ],
      })
    ).toHaveLength(1);
  });

  it("requires every video to describe a subject", () => {
    expect(() => createCollaborativeVideo(base)).toThrow(
      "associated with a sequence or artwork"
    );
  });
});
