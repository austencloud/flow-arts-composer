import {
  DEFAULT_VIDEO_VISIBILITY,
  type VideoVisibility,
} from "./video-visibility";
import type { ArtifactRevisionRef } from "$lib/shared/artifact-revisions/domain/artifact-revision";
import type { HandLabeling } from "./hand-labeling";

export type { VideoVisibility } from "./video-visibility";
export type { HandLabeling } from "./hand-labeling";

export type InviteStatus = "pending" | "accepted" | "declined" | "expired";

export type MediaSubjectType = "sequence" | "tunnel";
export type MediaRelationship = "performance" | "realization";

export interface MediaAssociation {
  readonly subjectType: MediaSubjectType;
  readonly subjectId: string;
  readonly relationship: MediaRelationship;
  readonly subjectLabel?: string;
  /** Exact immutable subject payload. Legacy associations may lack this and
   * stay unresolved until a curator proves the historical match. */
  readonly revision?: ArtifactRevisionRef;
  /** A tunnel can explain where its motion came from without claiming that
   * its real-world footage is a direct performance of that notation. */
  readonly sourceSequenceId?: string;
}

export interface VideoPerformerCredit {
  /** Account id when known; an external identity such as `ig:name` otherwise. */
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl?: string;
}

export function mediaAssociationKey(
  association: Pick<MediaAssociation, "subjectType" | "subjectId">
): string {
  return `${association.subjectType}:${association.subjectId}`;
}

export function createSequencePerformanceAssociation(
  sequenceId: string,
  subjectLabel?: string,
  revision?: ArtifactRevisionRef
): MediaAssociation {
  if (revision && revision.artifactId !== sequenceId) {
    throw new Error("Sequence revision does not belong to this sequence");
  }
  return {
    subjectType: "sequence",
    subjectId: sequenceId,
    relationship: "performance",
    ...(subjectLabel ? { subjectLabel } : {}),
    ...(revision ? { revision } : {}),
  };
}

export function createTunnelRealizationAssociation(
  tunnelId: string,
  subjectLabel?: string,
  sourceSequenceId?: string,
  revision?: ArtifactRevisionRef
): MediaAssociation {
  if (revision && revision.artifactId !== tunnelId) {
    throw new Error("Tunnel revision does not belong to this tunnel");
  }
  return {
    subjectType: "tunnel",
    subjectId: tunnelId,
    relationship: "realization",
    ...(subjectLabel ? { subjectLabel } : {}),
    ...(sourceSequenceId ? { sourceSequenceId } : {}),
    ...(revision ? { revision } : {}),
  };
}

/** Old video documents named only a sequence. Hydrating that field into the
 * typed contract lets every new consumer use associations without requiring a
 * destructive corpus migration first. */
export function normalizeMediaAssociations(input: {
  readonly associations?: readonly MediaAssociation[];
  readonly sequenceId?: string;
  readonly sequenceName?: string;
}): readonly MediaAssociation[] {
  const byKey = new Map<string, MediaAssociation>();
  for (const association of input.associations ?? []) {
    if (!association.subjectId.trim()) continue;
    byKey.set(
      `${mediaAssociationKey(association)}:${association.relationship}`,
      association
    );
  }

  if (input.sequenceId?.trim()) {
    const legacy = createSequencePerformanceAssociation(
      input.sequenceId,
      input.sequenceName
    );
    const key = `${mediaAssociationKey(legacy)}:${legacy.relationship}`;
    if (!byKey.has(key)) byKey.set(key, legacy);
  }

  return [...byKey.values()];
}

export interface CollaborationInvite {
  readonly userId: string;
  readonly displayName?: string;
  readonly message?: string;
  readonly invitedAt: Date;
  readonly invitedBy: string;
  readonly status: InviteStatus;
  readonly respondedAt?: Date;
}

export interface VideoCollaborator {
  readonly userId: string;
  readonly displayName?: string;
  readonly avatarUrl?: string;
  readonly joinedAt: Date;
  readonly role: "creator" | "collaborator";
}

/**
 * Maps video playback timestamps to sequence beats.
 */
export interface StepMap {
  /**
   * One timestamp per arrival, in seconds. Index 0 is the opening pose - the
   * performer standing in the start position, no move behind them yet - and
   * index k is the landing of move k.
   *
   * A performer usually runs a LOOP several times on one take, so this may hold
   * several passes' worth: index k is move `((k - 1) % stepCount) + 1`. Read it
   * through `getStepIndexFromVideo` rather than indexing the sequence with a
   * raw position - the off-by-one between "the move that landed" and "the move
   * being travelled to" is exactly what that function owns.
   */
  readonly beatTimestamps: number[];
  /**
   * When the last move lands, in seconds. A move's arrival is the next move's
   * launch, so marking every arrival yields one more instant than there are
   * moves - this is that final one. Optional because maps saved before the
   * editor collected it have no value for it; consumers fall back to the end
   * of the clip.
   */
  readonly endTimestamp?: number;
  readonly stepCount: number;
  readonly source: "manual" | "auto-detected" | "hybrid";
  readonly updatedAt: Date;
}

export interface CollaborativeVideo {
  readonly id: string;

  // ---- Video data ----
  readonly videoUrl: string;
  readonly storagePath: string;
  readonly thumbnailUrl?: string;
  readonly duration: number;
  readonly fileSize: number;
  readonly mimeType: string;

  // ---- Subject references ----
  /** Compatibility field for deployed sequence-video clients. Tunnel-only
   * realization records intentionally omit it. */
  readonly sequenceId?: string;
  readonly sequenceName?: string;
  readonly sequenceOwnerId?: string;
  readonly associations: readonly MediaAssociation[];
  readonly performers: readonly VideoPerformerCredit[];

  // ---- Collaboration structure ----
  readonly creatorId: string;
  /**
   * The uploader's name as it stood at upload, denormalized onto the document.
   * Redundant with the creator's roster entry when that entry exists, and the
   * only name a document written before the roster was seeded carries at all.
   * Read it through `getCreatorDisplayName`, never directly.
   */
  readonly creatorDisplayName?: string;
  readonly collaborators: readonly VideoCollaborator[];
  readonly pendingInvites: readonly CollaborationInvite[];

  // ---- Settings ----
  readonly visibility: VideoVisibility;
  readonly description?: string;

  // ---- Beat mapping ----
  readonly beatMap?: StepMap;

  // ---- Presentation ----
  /**
   * How the notation beside this footage labels hands. Missing reads as
   * "mirror-me" through `resolveHandLabeling`; never read this directly.
   */
  readonly handLabeling?: HandLabeling;

  // ---- Timestamps ----
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateCollaborativeVideoInput {
  videoUrl: string;
  storagePath: string;
  duration: number;
  fileSize: number;
  mimeType: string;
  sequenceId?: string;
  associations?: readonly MediaAssociation[];
  performers?: readonly VideoPerformerCredit[];
  creatorId: string;
  id?: string;
  thumbnailUrl?: string;
  sequenceName?: string;
  sequenceOwnerId?: string;
  visibility?: VideoVisibility;
  description?: string;
}

export function createCollaborativeVideo(
  input: CreateCollaborativeVideoInput,
  creatorDisplayName?: string,
  creatorAvatarUrl?: string
): CollaborativeVideo {
  const now = new Date();
  const associations = normalizeMediaAssociations(input);
  if (associations.length === 0) {
    throw new Error("A video must be associated with a sequence or artwork");
  }
  const sequenceAssociation = associations.find(
    (association) =>
      association.subjectType === "sequence" &&
      association.relationship === "performance"
  );
  const sequenceId = input.sequenceId ?? sequenceAssociation?.subjectId;
  const performers = input.performers ?? [
    {
      id: input.creatorId,
      displayName: creatorDisplayName ?? "Unknown performer",
      ...(creatorAvatarUrl ? { avatarUrl: creatorAvatarUrl } : {}),
    },
  ];

  return {
    id: input.id ?? crypto.randomUUID(),
    videoUrl: input.videoUrl,
    storagePath: input.storagePath,
    thumbnailUrl: input.thumbnailUrl,
    duration: input.duration,
    fileSize: input.fileSize,
    mimeType: input.mimeType,
    ...(sequenceId ? { sequenceId } : {}),
    sequenceName: input.sequenceName,
    sequenceOwnerId: input.sequenceOwnerId,
    associations,
    performers,
    creatorId: input.creatorId,
    collaborators: [
      {
        userId: input.creatorId,
        displayName: creatorDisplayName,
        avatarUrl: creatorAvatarUrl,
        joinedAt: now,
        role: "creator",
      },
    ],
    pendingInvites: [],
    visibility: input.visibility ?? DEFAULT_VIDEO_VISIBILITY,
    description: input.description,
    createdAt: now,
    updatedAt: now,
  };
}

export function addCollaborationInvite(
  video: CollaborativeVideo,
  userId: string,
  invitedBy: string,
  displayName?: string,
  message?: string
): CollaborativeVideo {
  if (video.collaborators.some((c) => c.userId === userId)) {
    return video;
  }

  if (
    video.pendingInvites.some(
      (i) => i.userId === userId && i.status === "pending"
    )
  ) {
    return video;
  }

  const invite: CollaborationInvite = {
    userId,
    displayName,
    message,
    invitedAt: new Date(),
    invitedBy,
    status: "pending",
  };

  return {
    ...video,
    pendingInvites: [...video.pendingInvites, invite],
    updatedAt: new Date(),
  };
}

export function acceptCollaborationInvite(
  video: CollaborativeVideo,
  userId: string,
  displayName?: string,
  avatarUrl?: string
): CollaborativeVideo {
  const inviteIndex = video.pendingInvites.findIndex(
    (i) => i.userId === userId && i.status === "pending"
  );

  if (inviteIndex === -1) {
    return video;
  }

  const now = new Date();

  const updatedInvites = video.pendingInvites.map((invite, index) =>
    index === inviteIndex
      ? { ...invite, status: "accepted" as const, respondedAt: now }
      : invite
  );

  const newCollaborator: VideoCollaborator = {
    userId,
    displayName,
    avatarUrl,
    joinedAt: now,
    role: "collaborator",
  };

  return {
    ...video,
    collaborators: [...video.collaborators, newCollaborator],
    pendingInvites: updatedInvites,
    updatedAt: now,
  };
}

export function declineCollaborationInvite(
  video: CollaborativeVideo,
  userId: string
): CollaborativeVideo {
  const inviteIndex = video.pendingInvites.findIndex(
    (i) => i.userId === userId && i.status === "pending"
  );

  if (inviteIndex === -1) {
    return video;
  }

  const updatedInvites = video.pendingInvites.map((invite, index) =>
    index === inviteIndex
      ? { ...invite, status: "declined" as const, respondedAt: new Date() }
      : invite
  );

  return {
    ...video,
    pendingInvites: updatedInvites,
    updatedAt: new Date(),
  };
}

export function removeCollaborator(
  video: CollaborativeVideo,
  userId: string
): CollaborativeVideo {
  if (userId === video.creatorId) {
    return video;
  }

  return {
    ...video,
    collaborators: video.collaborators.filter((c) => c.userId !== userId),
    updatedAt: new Date(),
  };
}

export function updateVideoVisibility(
  video: CollaborativeVideo,
  visibility: VideoVisibility
): CollaborativeVideo {
  return {
    ...video,
    visibility,
    updatedAt: new Date(),
  };
}

export function isCollaborator(
  video: CollaborativeVideo,
  userId: string
): boolean {
  return video.collaborators.some((c) => c.userId === userId);
}

/**
 * Who may change a video: the person who uploaded it, plus anyone they have
 * taken on as a collaborator.
 *
 * The creator is checked against `creatorId` rather than looked up in
 * `collaborators`, because the two can disagree. `createCollaborativeVideo`
 * seeds the creator into the roster, but documents written by earlier upload
 * paths carry an empty roster beside a perfectly good `creatorId` - and reading
 * the roster alone locked those owners out of their own footage. `creatorId`
 * is the field the Firestore rule grants on, so this matches the server.
 */
export function canEditVideo(
  video: CollaborativeVideo,
  userId: string
): boolean {
  return video.creatorId === userId || isCollaborator(video, userId);
}

/**
 * The name to show beside a video, or undefined when the document genuinely
 * carries none.
 *
 * Prefers the creator's roster entry, then the name denormalized at upload. A
 * document with an empty roster still knows who made it, and reading only the
 * roster is what made a performer's own footage sign itself "Anonymous".
 */
export function getCreatorDisplayName(
  video: CollaborativeVideo
): string | undefined {
  const creator = video.collaborators.find((c) => c.role === "creator");
  return creator?.displayName || video.creatorDisplayName || undefined;
}

export function hasPendingInvite(
  video: CollaborativeVideo,
  userId: string
): boolean {
  return video.pendingInvites.some(
    (i) => i.userId === userId && i.status === "pending"
  );
}

export function canViewVideo(
  video: CollaborativeVideo,
  userId?: string
): boolean {
  if (video.visibility === "public") return true;
  if (!userId) return false;
  if (video.visibility === "private") return video.creatorId === userId;
  return canEditVideo(video, userId);
}

export function getLibraryUserIds(video: CollaborativeVideo): string[] {
  return video.collaborators.map((c) => c.userId);
}
