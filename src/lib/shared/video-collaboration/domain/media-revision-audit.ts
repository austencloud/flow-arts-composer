import { isArtifactRevisionRef } from "#lib/shared/artifact-revisions/domain/artifact-revision.js";
import type { MediaAssociation } from "./collaborative-video";

export type MediaRevisionAudit =
  | { readonly status: "pinned"; readonly revisionId: string }
  | {
      readonly status: "ambiguous";
      readonly reason: "missing-revision" | "invalid-revision";
    };

/**
 * Historical associations are never inferred from the subject's current
 * state. Only a valid, subject-matching immutable reference counts as pinned.
 */
export function auditMediaAssociationRevision(
  association: MediaAssociation
): MediaRevisionAudit {
  if (!association.revision) {
    return { status: "ambiguous", reason: "missing-revision" };
  }
  if (
    !isArtifactRevisionRef(association.revision) ||
    association.revision.artifactId !== association.subjectId
  ) {
    return { status: "ambiguous", reason: "invalid-revision" };
  }
  return {
    status: "pinned",
    revisionId: association.revision.revisionId,
  };
}
