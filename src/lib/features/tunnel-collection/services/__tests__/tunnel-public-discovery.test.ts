import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicArtifactEnvelope } from "#lib/shared/artifact-revisions/domain/public-artifact.js";

const loaders = vi.hoisted(() => ({
  listPublicArtifacts: vi.fn(),
  getPublicArtifactDetail: vi.fn(),
}));

vi.mock(
  "#lib/shared/artifact-revisions/services/public-artifact-loader.js",
  () => loaders
);

function envelope(index: number): PublicArtifactEnvelope {
  return {
    artifactId: `tunnel-${index}`,
    artifactType: "tunnel",
    ownerId: `owner-${index}`,
    ownerDisplayName: `Artist ${index}`,
    title: `Tunnel ${index}`,
    currentRevisionId: `revision-${index}`,
    currentContentDigest: "a".repeat(64),
    publishedAt: new Date(index),
    updatedAt: new Date(index),
    schemaVersion: 1,
  };
}

describe("public Tunnel discovery", () => {
  beforeEach(() => {
    vi.resetModules();
    loaders.listPublicArtifacts.mockReset();
    loaders.getPublicArtifactDetail.mockReset();
  });

  it("returns envelopes immediately without approximating revision details", async () => {
    loaders.listPublicArtifacts.mockResolvedValue([envelope(1), envelope(2)]);
    const { listPublicTunnelDiscovery } =
      await import("../tunnel-public-discovery");

    await expect(listPublicTunnelDiscovery(12)).resolves.toEqual([
      { envelope: envelope(1), tunnel: null },
      { envelope: envelope(2), tunnel: null },
    ]);
    expect(loaders.listPublicArtifacts).toHaveBeenCalledWith("tunnel", 12);
    expect(loaders.getPublicArtifactDetail).not.toHaveBeenCalled();
  });

  it("bounds detail hydration to four reads and preserves every envelope", async () => {
    let active = 0;
    let peak = 0;
    loaders.getPublicArtifactDetail.mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return null;
    });
    const entries = Array.from({ length: 10 }, (_, index) => ({
      envelope: envelope(index),
      tunnel: null,
    }));
    const hydrated: string[] = [];
    const { hydratePublicTunnelDiscovery } =
      await import("../tunnel-public-discovery");

    await hydratePublicTunnelDiscovery(entries, (entry) => {
      hydrated.push(entry.envelope.artifactId);
    });

    expect(peak).toBe(4);
    expect(hydrated).toHaveLength(10);
    expect(new Set(hydrated)).toEqual(
      new Set(entries.map((entry) => entry.envelope.artifactId))
    );
  });
});
