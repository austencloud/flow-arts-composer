/**
 * Loads one published piece's detail for Browse > Visuals and keeps it in
 * memory for the visit, so the stage, the piece page and the step control
 * never ask for the same piece twice. One loader per visit (the panel makes
 * it); nothing is cached across visits, so a republished piece is fresh the
 * next time Visuals opens.
 *
 * Failures are not kept: asking again asks again.
 */
import {
  getPublicArtifactDetail,
  type PublicArtifactDetail,
} from "#lib/shared/artifact-revisions/services/public-artifact-loader.js";
import type { PublicArtifactEnvelope } from "#lib/shared/artifact-revisions/domain/public-artifact.js";
import {
  collectedTunnelFromPublicArtifact,
  type TunnelPublicPayload,
} from "#lib/features/tunnel-collection/domain/tunnel-public-revision.js";
import {
  mandalaPublicPayloadFromArtifact,
  type MandalaPublicPayload,
} from "#lib/features/mandala/tabs/collection/domain/mandala-public-revision.js";
import type { CollectedTunnel } from "#lib/features/tunnel-collection/domain/tunnel-collection-types.js";

export type VisualPiece =
  | {
      readonly kind: "tunnel";
      readonly envelope: PublicArtifactEnvelope;
      readonly tunnel: CollectedTunnel;
    }
  | {
      readonly kind: "mandala";
      readonly envelope: PublicArtifactEnvelope;
      readonly mandala: MandalaPublicPayload;
    };

export type VisualPieceResult =
  | { readonly status: "ok"; readonly piece: VisualPiece }
  /** No longer published. */
  | { readonly status: "missing" }
  /** Published, but its revision does not pass the adapter. */
  | { readonly status: "invalid" };

type FetchDetail = (
  artifactId: string
) => Promise<PublicArtifactDetail<
  TunnelPublicPayload | MandalaPublicPayload
> | null>;

function pieceFromDetail(
  detail: PublicArtifactDetail<TunnelPublicPayload | MandalaPublicPayload>
): VisualPiece | null {
  if (detail.envelope.artifactType === "mandala") {
    // Upgrades mandalas published with red and blue hands, as the tunnel
    // adapter below does for tunnels.
    const mandala = mandalaPublicPayloadFromArtifact(detail.revision.payload);
    return mandala
      ? { kind: "mandala", envelope: detail.envelope, mandala }
      : null;
  }
  // The publication adapter validates the revision, upgrades snapshots
  // published before saved colors, and keeps the authored cast.
  const tunnel = collectedTunnelFromPublicArtifact(
    detail.envelope,
    detail.revision.payload as TunnelPublicPayload
  );
  return tunnel ? { kind: "tunnel", envelope: detail.envelope, tunnel } : null;
}

export interface VisualPieceLoader {
  /** The piece if this visit already loaded it. */
  peek(artifactId: string): VisualPiece | undefined;
  load(artifactId: string): Promise<VisualPieceResult>;
}

export function createVisualPieceLoader(
  fetchDetail: FetchDetail = getPublicArtifactDetail as FetchDetail
): VisualPieceLoader {
  const done = new Map<string, VisualPiece>();
  const inFlight = new Map<string, Promise<VisualPieceResult>>();

  async function fetchOne(artifactId: string): Promise<VisualPieceResult> {
    const detail = await fetchDetail(artifactId);
    if (!detail) return { status: "missing" };
    const piece = pieceFromDetail(detail);
    if (!piece) return { status: "invalid" };
    done.set(artifactId, piece);
    return { status: "ok", piece };
  }

  return {
    peek: (artifactId) => done.get(artifactId),
    load(artifactId) {
      const known = done.get(artifactId);
      if (known) return Promise.resolve({ status: "ok", piece: known });
      const pending = inFlight.get(artifactId);
      if (pending) return pending;
      const request = fetchOne(artifactId).finally(() =>
        inFlight.delete(artifactId)
      );
      inFlight.set(artifactId, request);
      return request;
    },
  };
}
