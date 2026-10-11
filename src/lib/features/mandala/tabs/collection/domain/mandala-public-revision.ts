import { canonicalDigest } from "#lib/shared/foundation/utils/canonical-digest.js";
import {
  createArtifactRevisionRef,
  type ArtifactRevisionRef,
} from "#lib/shared/artifact-revisions/domain/artifact-revision.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { MandalaPathShape } from "#lib/shared/mandala/domain/mandala-types.js";
import type { CollectedMandala } from "./mandala-collection-types";

/**
 * The mandala adapter for the publication boundary: the SANITIZED public
 * payload and its content address.
 *
 * Two deliberate differences from the private revision digest:
 *
 * 1. `sourceSequenceId` is dropped. It names a library document the viewer may
 *    not be allowed to read, and the child spec bans unpublished identifiers
 *    from guest projections. Provenance back to the exact private revision
 *    lives in the publication request's `sourceRevision`.
 * 2. No poster rides in the payload. Unlike a tunnel, whose poster is authored
 *    at save time, a mandala's image is a pure function of this payload —
 *    the guest detail view redraws it from `steps`. Baking a rasterized poster
 *    into the digest would make identical mandalas content-address differently
 *    across browsers. The discovery poster is derived at publish time and
 *    lives only in Storage, referenced by the envelope's `posterUrl`.
 */

export interface MandalaPublicPayload {
  readonly steps: StepData[];
  readonly variant: CollectedMandala["variant"];
  readonly leftPropType: string;
  readonly rightPropType: string;
  readonly pathShape?: MandalaPathShape;
  readonly sourceWord?: string;
}

export interface MandalaPublicRevision extends ArtifactRevisionRef {
  readonly artifactType: "mandala";
  readonly payload: MandalaPublicPayload;
}

export function mandalaPublicPayload(
  mandala: Pick<
    CollectedMandala,
    | "steps"
    | "variant"
    | "leftPropType"
    | "rightPropType"
    | "pathShape"
    | "sourceWord"
  >
): MandalaPublicPayload {
  return {
    steps: mandala.steps,
    variant: mandala.variant,
    leftPropType: mandala.leftPropType,
    rightPropType: mandala.rightPropType,
    ...(mandala.pathShape !== undefined && { pathShape: mandala.pathShape }),
    ...(mandala.sourceWord !== undefined && { sourceWord: mandala.sourceWord }),
  };
}

export async function createMandalaPublicRevision(
  mandala: CollectedMandala
): Promise<MandalaPublicRevision> {
  const payload = mandalaPublicPayload(mandala);
  const contentDigest = await canonicalDigest(payload);
  return {
    ...createArtifactRevisionRef(mandala.id, contentDigest),
    artifactType: "mandala",
    payload,
  };
}
