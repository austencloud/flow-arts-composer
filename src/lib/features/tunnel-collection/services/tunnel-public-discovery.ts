import {
  getPublicArtifactDetail,
  listPublicArtifacts,
} from "#lib/shared/artifact-revisions/services/public-artifact-loader.js";
import type { PublicArtifactEnvelope } from "#lib/shared/artifact-revisions/domain/public-artifact.js";
import {
  collectedTunnelFromPublicArtifact,
  type TunnelPublicPayload,
} from "../domain/tunnel-public-revision";
import type { CollectedTunnel } from "../domain/tunnel-collection-types";

export interface PublicTunnelDiscoveryEntry {
  readonly envelope: PublicArtifactEnvelope;
  readonly tunnel: CollectedTunnel | null;
}

const DEFAULT_PUBLIC_TUNNEL_LIMIT = 36;
const DETAIL_WORKERS = 4;

export async function hydratePublicTunnel(
  envelope: PublicArtifactEnvelope
): Promise<PublicTunnelDiscoveryEntry> {
  try {
    const detail = await getPublicArtifactDetail<TunnelPublicPayload>(
      envelope.artifactId
    );
    if (!detail || detail.envelope.artifactType !== "tunnel") {
      return { envelope, tunnel: null };
    }
    return {
      envelope: detail.envelope,
      tunnel: collectedTunnelFromPublicArtifact(
        detail.envelope,
        detail.revision.payload
      ),
    };
  } catch {
    // The envelope still carries a useful title, owner, date, and poster. One
    // unavailable revision must not erase the rest of the public shelf.
    return { envelope, tunnel: null };
  }
}

/** Load the public Tunnel envelopes that can paint without revision reads. */
export async function listPublicTunnelDiscovery(
  max = DEFAULT_PUBLIC_TUNNEL_LIMIT
): Promise<PublicTunnelDiscoveryEntry[]> {
  const envelopes = await listPublicArtifacts("tunnel", max);
  return envelopes.map((envelope) => ({
    envelope,
    tunnel: null,
  }));
}

export async function hydratePublicTunnelDiscovery(
  entries: readonly PublicTunnelDiscoveryEntry[],
  onHydrated: (entry: PublicTunnelDiscoveryEntry, index: number) => void
): Promise<void> {
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < entries.length) {
      const index = cursor++;
      const entry = entries[index];
      if (!entry) continue;
      onHydrated(await hydratePublicTunnel(entry.envelope), index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(DETAIL_WORKERS, entries.length) }, () =>
      worker()
    )
  );
}
