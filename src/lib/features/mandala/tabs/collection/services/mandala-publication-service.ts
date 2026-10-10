import {
  getArtifactPublicationSummary,
  publishArtifact,
  withdrawArtifactPublication,
  type ArtifactPublicationSummary,
  type PublicationOwner,
  type PublishArtifactResult,
} from "#lib/shared/artifact-revisions/services/artifact-publication-service.js";
import { renderMandalaPosterDataUrl } from "../../export/services/mandala-export";
import type { StepLike } from "#lib/shared/mandala/services/types.js";
import {
  prepareMandalaRevision,
  currentMandalaRevisionRef,
} from "../domain/mandala-revision";
import {
  createMandalaPublicRevision,
  type MandalaPublicPayload,
} from "../domain/mandala-public-revision";
import type { CollectedMandala } from "../domain/mandala-collection-types";

/**
 * The mandala adapter for the shared publication boundary. The batch, the
 * idempotency, and the withdrawal live in
 * `shared/artifact-revisions/services/artifact-publication-service.ts`; this
 * file supplies the mandala specifics — provenance from the private revision,
 * the sanitized public payload, and a poster rendered on demand from that
 * payload's own geometry.
 */

export type {
  PublicationOwner,
  PublishArtifactResult as PublishMandalaResult,
};
export type MandalaPublicationStatus = ArtifactPublicationSummary;

/**
 * Mandalas saved before revisions existed carry no revision metadata until
 * they next hydrate through the repository. Baselining here keeps a publish
 * from failing on a stale in-memory entry — the digest is a pure function of
 * the payload, so it agrees with whatever the repository writes.
 */
async function sourceRevisionFor(mandala: CollectedMandala) {
  const existing = currentMandalaRevisionRef(mandala);
  if (existing) return existing;
  return currentMandalaRevisionRef(await prepareMandalaRevision(mandala));
}

export async function publishMandala(
  mandala: CollectedMandala,
  owner: PublicationOwner
): Promise<PublishArtifactResult> {
  const sourceRevision = await sourceRevisionFor(mandala);
  if (!sourceRevision) {
    throw new Error("Mandala has no current revision — save it before sharing");
  }
  const publicRevision = await createMandalaPublicRevision(mandala);
  return publishArtifact<MandalaPublicPayload>(
    {
      artifactId: mandala.id,
      artifactType: "mandala",
      title: mandala.name,
      sourceRevision,
      publicRevision,
      posterDataUrl: () =>
        renderMandalaPosterDataUrl(
          publicRevision.payload.steps as unknown as StepLike[],
          publicRevision.payload.leftPropType,
          publicRevision.payload.rightPropType,
          {
            show: publicRevision.payload.variant,
            pathShape: publicRevision.payload.pathShape ?? "arc",
          }
        ),
    },
    owner
  );
}

export function withdrawMandalaPublication(
  artifactId: string,
  owner: PublicationOwner
): Promise<void> {
  return withdrawArtifactPublication(artifactId, owner);
}

/** Owner-facing lifecycle summary for one mandala's publication controls. */
export async function getMandalaPublicationStatus(
  mandala: CollectedMandala,
  owner: PublicationOwner
): Promise<MandalaPublicationStatus> {
  const publicRevision = await createMandalaPublicRevision(mandala);
  return getArtifactPublicationSummary(
    mandala.id,
    publicRevision.revisionId,
    owner
  );
}
