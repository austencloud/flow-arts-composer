import {
  getArtifactPublicationSummary,
  publishArtifact,
  withdrawArtifactPublication,
  type ArtifactPublicationSummary,
  type PublicationOwner,
  type PublishArtifactResult,
} from "#lib/shared/artifact-revisions/services/artifact-publication-service.js";
import { currentTunnelRevisionRef } from "../domain/tunnel-revision";
import { renderTunnelDiscoveryPoster } from "./tunnel-discovery-poster";
import {
  createTunnelPublicRevision,
  type TunnelPublicPayload,
} from "../domain/tunnel-public-revision";
import type { CollectedTunnel } from "../domain/tunnel-collection-types";

/**
 * The tunnel adapter for the shared publication boundary. Everything about the
 * four-resource publish batch, idempotency, and withdrawal lives in
 * `shared/artifact-revisions/services/artifact-publication-service.ts`; this
 * file supplies only what is tunnel-specific — the private revision that
 * provides provenance, the sanitized public payload, and the poster.
 *
 * The poster is rendered fresh rather than lifted off the saved work. The
 * inline `poster` field is a 200px thumbnail sized for the collection grid,
 * where it rides inside each tunnel's own Firestore document; Explore hangs
 * artwork on a plinth that reaches ~950 CSS px at 4K, so re-using the thumbnail
 * upscaled it ~4.8x. `renderTunnelDiscoveryPoster` re-renders the tunnel
 * offscreen at 1024 and falls back to the thumbnail only if that render
 * produces nothing, so a publish never fails on its poster.
 */

export type {
  PublicationOwner,
  PublishArtifactResult as PublishTunnelResult,
};
export type TunnelPublicationStatus = ArtifactPublicationSummary;

export async function publishTunnel(
  tunnel: CollectedTunnel,
  owner: PublicationOwner
): Promise<PublishArtifactResult> {
  const sourceRevision = currentTunnelRevisionRef(tunnel);
  if (!sourceRevision) {
    throw new Error("Tunnel has no current revision — save it before sharing");
  }
  const publicRevision = await createTunnelPublicRevision(tunnel);
  return publishArtifact<TunnelPublicPayload>(
    {
      artifactId: tunnel.id,
      artifactType: "tunnel",
      title: tunnel.name,
      sourceRevision,
      publicRevision,
      posterDataUrl: async () =>
        (await renderTunnelDiscoveryPoster(tunnel)) ||
        publicRevision.payload.poster,
    },
    owner
  );
}

export function withdrawTunnelPublication(
  artifactId: string,
  owner: PublicationOwner
): Promise<void> {
  return withdrawArtifactPublication(artifactId, owner);
}

/** Owner-facing lifecycle summary for one tunnel's publication controls. */
export async function getTunnelPublicationStatus(
  tunnel: CollectedTunnel,
  owner: PublicationOwner
): Promise<TunnelPublicationStatus> {
  const publicRevision = await createTunnelPublicRevision(tunnel);
  return getArtifactPublicationSummary(
    tunnel.id,
    publicRevision.revisionId,
    owner
  );
}
