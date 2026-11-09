import { canonicalDigest } from "#lib/shared/foundation/utils/canonical-digest.js";
import {
  createArtifactRevisionRef,
  type ArtifactRevisionRef,
} from "#lib/shared/artifact-revisions/domain/artifact-revision.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { MandalaPathShape } from "#lib/shared/mandala/domain/mandala-types.js";
import {
  isTkaWord,
  simplifyRepeatedWord,
} from "#lib/shared/foundation/utils/word-simplifier.js";
import {
  CollectedMandalaSchema,
  type CollectedMandala,
} from "./mandala-collection-types";

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
  /** Left out when the maker saved none, so a mandala with no colors keeps the
   *  content address it was published under. */
  readonly colors?: CollectedMandala["colors"];
  readonly sourceWord?: string;
}

export interface MandalaPublicRevision extends ArtifactRevisionRef {
  readonly artifactType: "mandala";
  readonly payload: MandalaPublicPayload;
}

/**
 * The title a mandala carries in public. A mandala saved from a word is named
 * after the whole expanded word, so a card would read "FΨFΨFΨFΨ"; the public
 * title is the word itself. A name someone typed ("Sunrise") stays as typed.
 */
export function mandalaPublicTitle(name: string): string {
  return isTkaWord(name) ? simplifyRepeatedWord(name) : name;
}

export function mandalaPublicPayload(
  mandala: Pick<
    CollectedMandala,
    | "steps"
    | "variant"
    | "leftPropType"
    | "rightPropType"
    | "pathShape"
    | "colors"
    | "sourceWord"
  >
): MandalaPublicPayload {
  return {
    steps: mandala.steps,
    variant: mandala.variant,
    leftPropType: mandala.leftPropType,
    rightPropType: mandala.rightPropType,
    ...(mandala.pathShape !== undefined && { pathShape: mandala.pathShape }),
    ...(mandala.colors !== undefined && { colors: mandala.colors }),
    ...(mandala.sourceWord !== undefined && { sourceWord: mandala.sourceWord }),
  };
}

/**
 * Read a published payload back for display. Mandalas published before the
 * left/right rename still hold motions.blue/red and redPropType/bluePropType,
 * which the renderer reads as nothing to draw. The collection schema already
 * owns that upgrade, so the payload goes through it with placeholders for the
 * work fields a public payload deliberately leaves out. Null means the payload
 * is not a mandala.
 */
export function mandalaPublicPayloadFromArtifact(
  payload: unknown
): MandalaPublicPayload | null {
  const parsed = CollectedMandalaSchema.safeParse({
    ...(payload as object | null),
    id: "published",
    name: "",
    createdAt: 0,
  });
  return parsed.success
    ? mandalaPublicPayload(parsed.data as CollectedMandala)
    : null;
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
