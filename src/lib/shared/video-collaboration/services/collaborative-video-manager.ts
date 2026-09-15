import {
  getFirestoreInstance,
  getAuthInstance,
  getAuthSync,
} from "$lib/shared/auth/firebase";
import { toast } from "$lib/shared/toast/state/toast-state.svelte";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  type Timestamp,
} from "firebase/firestore";
import {
  canEditVideo,
  getCreatorDisplayName,
  type CollaborativeVideo,
  type VideoCollaborator,
  type CollaborationInvite,
  type VideoVisibility,
  type StepMap,
  type MediaAssociation,
  type VideoPerformerCredit,
  mediaAssociationKey,
  normalizeMediaAssociations,
} from "../domain/collaborative-video";
import { isHandLabeling, type HandLabeling } from "../domain/hand-labeling";
import type { UserVideoLibrary } from "./types";
import { isArtifactRevisionRef } from "$lib/shared/artifact-revisions/domain/artifact-revision";

const VIDEOS_COLLECTION = "videos";

/**
 * Firestore, but not before the persisted session has been restored.
 *
 * Every document in `videos` is readable only to a signed-in account, and on a
 * cold page load Firebase has not yet replayed its stored session - so a read
 * fired at mount goes out unauthenticated and comes back denied, on the same
 * page that serves the list perfectly a second later. `authStateReady` is that
 * boundary. Write paths get it for free by calling `getUserId`.
 */
async function readFirestore() {
  const auth = await getAuthInstance();
  await auth.authStateReady();
  return getFirestoreInstance();
}

function getUserId(): string {
  const user = getAuthSync().currentUser;
  if (!user) {
    throw new Error("User must be authenticated to access videos");
  }
  return user.uid;
}

function getUserInfo(): {
  uid: string;
  displayName?: string;
  avatarUrl?: string;
} {
  const user = getAuthSync().currentUser;
  if (!user) {
    throw new Error("User must be authenticated");
  }
  return {
    uid: user.uid,
    displayName: user.displayName ?? undefined,
    avatarUrl: user.photoURL ?? undefined,
  };
}

/**
 * Fields that put the creator back on a video whose roster lost them.
 *
 * Videos uploaded by an earlier path were stored with `collaborators: []` even
 * though `creatorId` named their owner, which left the owner unable to save a
 * step map. `canEditVideo` lets them through on `creatorId`; this folds them
 * into the roster on the way past so the next read needs no rescue. Returns
 * nothing at all when the roster is already correct, so an ordinary save writes
 * exactly what it used to.
 */
function missingCreatorRepair(
  video: CollaborativeVideo,
  userId: string
): Record<string, unknown> {
  if (video.creatorId !== userId) return {};
  if (video.collaborators.some((c) => c.userId === userId)) return {};

  const { displayName, avatarUrl } = getUserInfo();
  return {
    collaborators: arrayUnion({
      userId,
      // The document's own name wins: it is who the uploader was at upload,
      // which is what the rest of the app has been showing all along.
      displayName: video.creatorDisplayName ?? displayName ?? null,
      avatarUrl: avatarUrl ?? null,
      joinedAt: video.createdAt,
      role: "creator",
    }),
    collaboratorIds: arrayUnion(userId),
  };
}

function docToVideo(
  docData: Record<string, unknown>,
  videoId: string
): CollaborativeVideo {
  const createdAtField = docData.createdAt as Timestamp | undefined;
  const updatedAtField = docData.updatedAt as Timestamp | undefined;

  const collaboratorsData = (docData.collaborators as unknown[]) ?? [];
  const collaborators: VideoCollaborator[] = collaboratorsData.map((c) => {
    const collab = c as Record<string, unknown>;
    const joinedAtField = collab.joinedAt as Timestamp | undefined;
    return {
      userId: collab.userId as string,
      displayName: collab.displayName as string | undefined,
      avatarUrl: collab.avatarUrl as string | undefined,
      joinedAt: joinedAtField?.toDate?.() ?? new Date(),
      role: collab.role as "creator" | "collaborator",
    };
  });

  const invitesData = (docData.pendingInvites as unknown[]) ?? [];
  const pendingInvites: CollaborationInvite[] = invitesData.map((i) => {
    const invite = i as Record<string, unknown>;
    const invitedAtField = invite.invitedAt as Timestamp | undefined;
    const respondedAtField = invite.respondedAt as Timestamp | undefined;
    return {
      userId: invite.userId as string,
      displayName: invite.displayName as string | undefined,
      message: invite.message as string | undefined,
      invitedAt: invitedAtField?.toDate?.() ?? new Date(),
      invitedBy: invite.invitedBy as string,
      status: invite.status as "pending" | "accepted" | "declined" | "expired",
      respondedAt: respondedAtField?.toDate?.(),
    };
  });

  const beatMapData = docData.beatMap as Record<string, unknown> | undefined;
  const beatMap: StepMap | undefined = beatMapData
    ? {
        beatTimestamps: (beatMapData.beatTimestamps as number[]) ?? [],
        // saveVideo writes null for "absent"; updateStepMap omits the key.
        endTimestamp:
          typeof beatMapData.endTimestamp === "number"
            ? beatMapData.endTimestamp
            : undefined,
        stepCount: (beatMapData.stepCount as number) ?? 0,
        source: (beatMapData.source as StepMap["source"]) ?? "manual",
        updatedAt:
          (beatMapData.updatedAt as Timestamp)?.toDate?.() ?? new Date(),
      }
    : undefined;

  const rawAssociations = Array.isArray(docData.associations)
    ? docData.associations
    : [];
  const associations = normalizeMediaAssociations({
    associations: rawAssociations.flatMap((value): MediaAssociation[] => {
      if (!value || typeof value !== "object") return [];
      const item = value as Record<string, unknown>;
      const subjectType = item.subjectType;
      const relationship = item.relationship;
      const subjectId = item.subjectId;
      const validPair =
        (subjectType === "sequence" && relationship === "performance") ||
        (subjectType === "tunnel" && relationship === "realization");
      if (!validPair || typeof subjectId !== "string" || !subjectId.trim()) {
        return [];
      }
      return [
        {
          subjectType,
          subjectId,
          relationship,
          ...(typeof item.subjectLabel === "string"
            ? { subjectLabel: item.subjectLabel }
            : {}),
          ...(typeof item.sourceSequenceId === "string"
            ? { sourceSequenceId: item.sourceSequenceId }
            : {}),
          ...(isArtifactRevisionRef(item.revision) &&
          item.revision.artifactId === subjectId
            ? { revision: item.revision }
            : {}),
        } as MediaAssociation,
      ];
    }),
    sequenceId:
      typeof docData.sequenceId === "string" ? docData.sequenceId : undefined,
    sequenceName:
      typeof docData.sequenceName === "string"
        ? docData.sequenceName
        : undefined,
  });

  const performers: VideoPerformerCredit[] = Array.isArray(docData.performers)
    ? docData.performers.flatMap((value): VideoPerformerCredit[] => {
        if (!value || typeof value !== "object") return [];
        const item = value as Record<string, unknown>;
        if (
          typeof item.id !== "string" ||
          typeof item.displayName !== "string" ||
          !item.displayName.trim()
        ) {
          return [];
        }
        return [
          {
            id: item.id,
            displayName: item.displayName,
            ...(typeof item.avatarUrl === "string"
              ? { avatarUrl: item.avatarUrl }
              : {}),
          },
        ];
      })
    : [];

  return {
    id: videoId,
    videoUrl: docData.videoUrl as string,
    storagePath: docData.storagePath as string,
    thumbnailUrl: docData.thumbnailUrl as string | undefined,
    duration: docData.duration as number,
    fileSize: docData.fileSize as number,
    mimeType: docData.mimeType as string,
    ...(typeof docData.sequenceId === "string"
      ? { sequenceId: docData.sequenceId }
      : {}),
    sequenceName: docData.sequenceName as string | undefined,
    sequenceOwnerId: docData.sequenceOwnerId as string | undefined,
    associations,
    performers,
    creatorId: docData.creatorId as string,
    creatorDisplayName: (docData.creatorDisplayName as string) || undefined,
    collaborators,
    pendingInvites,
    beatMap,
    ...(isHandLabeling(docData.handLabeling)
      ? { handLabeling: docData.handLabeling }
      : {}),
    // Missing visibility predates the publishing contract. Fail closed rather
    // than manufacturing public consent for a legacy document.
    visibility: (docData.visibility as VideoVisibility) ?? "private",
    description: docData.description as string | undefined,
    createdAt: createdAtField?.toDate?.() ?? new Date(),
    updatedAt: updatedAtField?.toDate?.() ?? new Date(),
  };
}

function videoToDoc(video: CollaborativeVideo): Record<string, unknown> {
  return {
    videoUrl: video.videoUrl,
    storagePath: video.storagePath,
    thumbnailUrl: video.thumbnailUrl ?? null,
    duration: video.duration,
    fileSize: video.fileSize,
    mimeType: video.mimeType,
    sequenceId: video.sequenceId ?? null,
    sequenceName: video.sequenceName ?? null,
    sequenceOwnerId: video.sequenceOwnerId ?? null,
    associations: video.associations.map((association) => ({
      subjectType: association.subjectType,
      subjectId: association.subjectId,
      relationship: association.relationship,
      subjectLabel: association.subjectLabel ?? null,
      sourceSequenceId: association.sourceSequenceId ?? null,
      revision: association.revision ?? null,
    })),
    associationKeys: [...new Set(video.associations.map(mediaAssociationKey))],
    performers: video.performers.map((performer) => ({
      id: performer.id,
      displayName: performer.displayName,
      avatarUrl: performer.avatarUrl ?? null,
    })),
    creatorId: video.creatorId,
    creatorDisplayName: getCreatorDisplayName(video) ?? null,
    collaborators: video.collaborators.map((c) => ({
      userId: c.userId,
      displayName: c.displayName ?? null,
      avatarUrl: c.avatarUrl ?? null,
      joinedAt: c.joinedAt,
      role: c.role,
    })),
    pendingInvites: video.pendingInvites.map((i) => ({
      userId: i.userId,
      displayName: i.displayName ?? null,
      message: i.message ?? null,
      invitedAt: i.invitedAt,
      invitedBy: i.invitedBy,
      status: i.status,
      respondedAt: i.respondedAt ?? null,
    })),
    beatMap: video.beatMap
      ? {
          beatTimestamps: video.beatMap.beatTimestamps,
          endTimestamp: video.beatMap.endTimestamp ?? null,
          stepCount: video.beatMap.stepCount,
          source: video.beatMap.source,
          updatedAt: video.beatMap.updatedAt,
        }
      : null,
    handLabeling: video.handLabeling ?? null,
    visibility: video.visibility,
    description: video.description ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    collaboratorIds: video.collaborators.map((c) => c.userId),
    pendingInviteUserIds: video.pendingInvites
      .filter((i) => i.status === "pending")
      .map((i) => i.userId),
  };
}

export async function saveVideo(video: CollaborativeVideo): Promise<void> {
  try {
    const firestore = await getFirestoreInstance();
    const userId = getUserId();

    if (video.creatorId !== userId) {
      throw new Error("Only the creator can save this video");
    }

    const docRef = doc(firestore, VIDEOS_COLLECTION, video.id);
    await setDoc(docRef, videoToDoc(video));
  } catch (error) {
    console.error(
      "❌ [CollaborativeVideoManager] Failed to save video:",
      error
    );
    toast.error("Failed to save video.");
    throw error;
  }
}

export async function getVideo(
  videoId: string
): Promise<CollaborativeVideo | null> {
  try {
    const firestore = await readFirestore();
    const docRef = doc(firestore, VIDEOS_COLLECTION, videoId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    return docToVideo(docSnap.data(), videoId);
  } catch (error) {
    // null means "no such video"; a read that failed is not that. Callers turn
    // null into "Video not found", so swallowing here would report a denied or
    // offline read as a missing document.
    console.error("❌ [CollaborativeVideoManager] Failed to get video:", error);
    throw error;
  }
}

export async function deleteVideo(videoId: string): Promise<void> {
  try {
    const firestore = await getFirestoreInstance();
    const userId = getUserId();
    const video = await getVideo(videoId);

    if (!video) {
      throw new Error("Video not found");
    }

    if (video.creatorId !== userId) {
      throw new Error("Only the creator can delete this video");
    }

    const docRef = doc(firestore, VIDEOS_COLLECTION, videoId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error(
      "❌ [CollaborativeVideoManager] Failed to delete video:",
      error
    );
    toast.error("Failed to delete video.");
    throw error;
  }
}

export async function updateVideo(
  videoId: string,
  updates: Partial<Pick<CollaborativeVideo, "visibility" | "description">>
): Promise<void> {
  try {
    const firestore = await getFirestoreInstance();
    const userId = getUserId();
    const video = await getVideo(videoId);

    if (!video) {
      throw new Error("Video not found");
    }

    if (video.creatorId !== userId) {
      throw new Error("Only the creator can update this video");
    }

    const docRef = doc(firestore, VIDEOS_COLLECTION, videoId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error(
      "❌ [CollaborativeVideoManager] Failed to update video:",
      error
    );
    toast.error("Failed to update video.");
    throw error;
  }
}

export async function updateStepMap(
  videoId: string,
  beatMap: StepMap
): Promise<void> {
  try {
    const firestore = await getFirestoreInstance();
    const userId = getUserId();
    const video = await getVideo(videoId);

    if (!video) {
      throw new Error("Video not found");
    }

    if (!canEditVideo(video, userId)) {
      throw new Error("Only collaborators can update the beat map");
    }

    const docRef = doc(firestore, VIDEOS_COLLECTION, videoId);
    await updateDoc(docRef, {
      // A video written before the creator was seeded into the roster gets
      // repaired on the first save, so it stops being a document that only the
      // creatorId check can rescue.
      ...missingCreatorRepair(video, userId),
      beatMap: {
        beatTimestamps: beatMap.beatTimestamps,
        // Firestore rejects undefined, and a map saved before the editor
        // collected the final arrival legitimately has none.
        ...(beatMap.endTimestamp === undefined
          ? {}
          : { endTimestamp: beatMap.endTimestamp }),
        stepCount: beatMap.stepCount,
        source: beatMap.source,
        updatedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error(
      "❌ [CollaborativeVideoManager] Failed to update beat map:",
      error
    );
    toast.error("Failed to save beat mapping.");
    throw error;
  }
}

/**
 * Persist how the notation beside this footage labels hands. Same access rule
 * as the beat map: collaborators only.
 */
export async function updateHandLabeling(
  videoId: string,
  handLabeling: HandLabeling
): Promise<void> {
  try {
    const firestore = await getFirestoreInstance();
    const userId = getUserId();
    const video = await getVideo(videoId);

    if (!video) {
      throw new Error("Video not found");
    }

    if (!canEditVideo(video, userId)) {
      throw new Error("Only collaborators can change hand labeling");
    }

    const docRef = doc(firestore, VIDEOS_COLLECTION, videoId);
    await updateDoc(docRef, {
      ...missingCreatorRepair(video, userId),
      handLabeling,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error(
      "❌ [CollaborativeVideoManager] Failed to update hand labeling:",
      error
    );
    toast.error("Failed to save hand labeling.");
    throw error;
  }
}

export async function inviteCollaborator(
  videoId: string,
  userId: string,
  displayName?: string,
  message?: string
): Promise<void> {
  try {
    const firestore = await getFirestoreInstance();
    const currentUserId = getUserId();
    const video = await getVideo(videoId);

    if (!video) {
      throw new Error("Video not found");
    }

    if (!canEditVideo(video, currentUserId)) {
      throw new Error("Only collaborators can invite others");
    }

    if (video.collaborators.some((c) => c.userId === userId)) {
      throw new Error("User is already a collaborator");
    }

    if (
      video.pendingInvites.some(
        (i) => i.userId === userId && i.status === "pending"
      )
    ) {
      throw new Error("User already has a pending invite");
    }

    const invite: CollaborationInvite = {
      userId,
      displayName,
      message,
      invitedAt: new Date(),
      invitedBy: currentUserId,
      status: "pending",
    };

    const docRef = doc(firestore, VIDEOS_COLLECTION, videoId);
    await updateDoc(docRef, {
      pendingInvites: arrayUnion({
        userId: invite.userId,
        displayName: invite.displayName ?? null,
        message: invite.message ?? null,
        invitedAt: invite.invitedAt,
        invitedBy: invite.invitedBy,
        status: invite.status,
        respondedAt: null,
      }),
      pendingInviteUserIds: arrayUnion(userId),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error(
      "❌ [CollaborativeVideoManager] Failed to invite collaborator:",
      error
    );
    toast.error("Failed to send collaboration invite.");
    throw error;
  }
}

export async function acceptInvite(videoId: string): Promise<void> {
  try {
    const firestore = await getFirestoreInstance();
    const userInfo = getUserInfo();
    const video = await getVideo(videoId);

    if (!video) {
      throw new Error("Video not found");
    }

    const invite = video.pendingInvites.find(
      (i) => i.userId === userInfo.uid && i.status === "pending"
    );

    if (!invite) {
      throw new Error("No pending invite found");
    }

    const newCollaborator: VideoCollaborator = {
      userId: userInfo.uid,
      displayName: userInfo.displayName,
      avatarUrl: userInfo.avatarUrl,
      joinedAt: new Date(),
      role: "collaborator",
    };

    const docRef = doc(firestore, VIDEOS_COLLECTION, videoId);

    const updatedInvites = video.pendingInvites.map((i) =>
      i.userId === userInfo.uid
        ? { ...i, status: "accepted" as const, respondedAt: new Date() }
        : i
    );

    await updateDoc(docRef, {
      collaborators: arrayUnion({
        userId: newCollaborator.userId,
        displayName: newCollaborator.displayName ?? null,
        avatarUrl: newCollaborator.avatarUrl ?? null,
        joinedAt: newCollaborator.joinedAt,
        role: newCollaborator.role,
      }),
      collaboratorIds: arrayUnion(userInfo.uid),
      pendingInvites: updatedInvites.map((i) => ({
        userId: i.userId,
        displayName: i.displayName ?? null,
        message: i.message ?? null,
        invitedAt: i.invitedAt,
        invitedBy: i.invitedBy,
        status: i.status,
        respondedAt: i.respondedAt ?? null,
      })),
      pendingInviteUserIds: arrayRemove(userInfo.uid),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error(
      "❌ [CollaborativeVideoManager] Failed to accept invite:",
      error
    );
    toast.error("Failed to accept collaboration invite.");
    throw error;
  }
}

export async function declineInvite(videoId: string): Promise<void> {
  try {
    const firestore = await getFirestoreInstance();
    const userId = getUserId();
    const video = await getVideo(videoId);

    if (!video) {
      throw new Error("Video not found");
    }

    const invite = video.pendingInvites.find(
      (i) => i.userId === userId && i.status === "pending"
    );

    if (!invite) {
      throw new Error("No pending invite found");
    }

    const updatedInvites = video.pendingInvites.map((i) =>
      i.userId === userId
        ? { ...i, status: "declined" as const, respondedAt: new Date() }
        : i
    );

    const docRef = doc(firestore, VIDEOS_COLLECTION, videoId);
    await updateDoc(docRef, {
      pendingInvites: updatedInvites.map((i) => ({
        userId: i.userId,
        displayName: i.displayName ?? null,
        message: i.message ?? null,
        invitedAt: i.invitedAt,
        invitedBy: i.invitedBy,
        status: i.status,
        respondedAt: i.respondedAt ?? null,
      })),
      pendingInviteUserIds: arrayRemove(userId),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error(
      "❌ [CollaborativeVideoManager] Failed to decline invite:",
      error
    );
    toast.error("Failed to decline collaboration invite.");
    throw error;
  }
}

export async function removeCollaborator(
  videoId: string,
  userId: string
): Promise<void> {
  try {
    const firestore = await getFirestoreInstance();
    const currentUserId = getUserId();
    const video = await getVideo(videoId);

    if (!video) {
      throw new Error("Video not found");
    }

    if (userId === video.creatorId) {
      throw new Error("Cannot remove the creator");
    }

    if (currentUserId !== video.creatorId && currentUserId !== userId) {
      throw new Error(
        "Only the creator or the user themselves can remove a collaborator"
      );
    }

    const collaboratorToRemove = video.collaborators.find(
      (c) => c.userId === userId
    );
    if (!collaboratorToRemove) {
      throw new Error("User is not a collaborator");
    }

    const docRef = doc(firestore, VIDEOS_COLLECTION, videoId);
    await updateDoc(docRef, {
      collaborators: arrayRemove({
        userId: collaboratorToRemove.userId,
        displayName: collaboratorToRemove.displayName ?? null,
        avatarUrl: collaboratorToRemove.avatarUrl ?? null,
        joinedAt: collaboratorToRemove.joinedAt,
        role: collaboratorToRemove.role,
      }),
      collaboratorIds: arrayRemove(userId),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error(
      "❌ [CollaborativeVideoManager] Failed to remove collaborator:",
      error
    );
    toast.error("Failed to remove collaborator.");
    throw error;
  }
}

export async function getVideosForSequence(
  sequenceId: string
): Promise<CollaborativeVideo[]> {
  try {
    const firestore = await readFirestore();
    const userId = getUserId();
    const collectionRef = collection(firestore, VIDEOS_COLLECTION);

    // Firestore rules are not result filters. Each query proves one access
    // path, then the client merges them into the sequence's visible set.
    const publicQuery = query(
      collectionRef,
      where("sequenceId", "==", sequenceId),
      where("visibility", "==", "public")
    );
    const createdQuery = query(
      collectionRef,
      where("sequenceId", "==", sequenceId),
      where("creatorId", "==", userId)
    );
    const collaboratorQuery = query(
      collectionRef,
      where("sequenceId", "==", sequenceId),
      where("visibility", "==", "collaborators-only"),
      where("collaboratorIds", "array-contains", userId)
    );

    const snapshots = await Promise.all([
      getDocs(publicQuery),
      getDocs(createdQuery),
      getDocs(collaboratorQuery),
    ]);

    const byId = new Map<string, CollaborativeVideo>();
    for (const snapshot of snapshots) {
      for (const videoDoc of snapshot.docs) {
        byId.set(videoDoc.id, docToVideo(videoDoc.data(), videoDoc.id));
      }
    }

    return [...byId.values()].sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime()
    );
  } catch (error) {
    // Never an empty array: every caller already tells a failed load apart from
    // a genuine zero, and returning [] here overrode all of them - a denied
    // read rendered as "No videos yet" beside an upload button.
    console.error(
      "❌ [CollaborativeVideoManager] Failed to get videos for sequence:",
      error
    );
    throw error;
  }
}

export async function getVideosForTunnel(
  tunnelId: string,
  revisionId?: string
): Promise<CollaborativeVideo[]> {
  try {
    const firestore = await readFirestore();
    const userId = getUserId();
    const collectionRef = collection(firestore, VIDEOS_COLLECTION);
    const associationKey = `tunnel:${tunnelId}`;

    const publicQuery = query(
      collectionRef,
      where("associationKeys", "array-contains", associationKey),
      where("visibility", "==", "public")
    );
    const createdQuery = query(
      collectionRef,
      where("associationKeys", "array-contains", associationKey),
      where("creatorId", "==", userId)
    );
    // Firestore permits only one array-contains field in a query. Load the
    // user's already-authorized collaborator set, then keep this tunnel's
    // records locally instead of combining collaboratorIds + associationKeys.
    const collaboratorQuery = query(
      collectionRef,
      where("visibility", "==", "collaborators-only"),
      where("collaboratorIds", "array-contains", userId)
    );

    const snapshots = await Promise.all([
      getDocs(publicQuery),
      getDocs(createdQuery),
      getDocs(collaboratorQuery),
    ]);
    const byId = new Map<string, CollaborativeVideo>();
    for (const snapshot of snapshots) {
      for (const videoDoc of snapshot.docs) {
        const video = docToVideo(videoDoc.data(), videoDoc.id);
        if (
          video.associations.some(
            (association) =>
              mediaAssociationKey(association) === associationKey &&
              (!revisionId || association.revision?.revisionId === revisionId)
          )
        ) {
          byId.set(video.id, video);
        }
      }
    }

    return [...byId.values()].sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime()
    );
  } catch (error) {
    console.error(
      "❌ [CollaborativeVideoManager] Failed to get videos for tunnel:",
      error
    );
    throw error;
  }
}

export async function getUserVideoLibrary(): Promise<UserVideoLibrary> {
  try {
    // Firestore first: `readFirestore` waits for the persisted session, and
    // `getUserId` reads it. The other order throws on a cold load.
    const firestore = await readFirestore();
    const userId = getUserId();
    const collectionRef = collection(firestore, VIDEOS_COLLECTION);

    const collaboratorQuery = query(
      collectionRef,
      where("collaboratorIds", "array-contains", userId),
      where("visibility", "==", "collaborators-only"),
      orderBy("createdAt", "desc")
    );

    // Asked separately from the roster query because the two can disagree: a
    // video written before the creator was seeded into `collaborators` carries
    // an empty `collaboratorIds`, so the owner's own upload never came back.
    // Deliberately unordered - sorting here would need a second composite
    // index for a list that gets sorted below anyway.
    const createdQuery = query(collectionRef, where("creatorId", "==", userId));

    const pendingQuery = query(
      collectionRef,
      where("pendingInviteUserIds", "array-contains", userId)
    );

    const [collaboratorSnapshot, createdSnapshot, pendingSnapshot] =
      await Promise.all([
        getDocs(collaboratorQuery),
        getDocs(createdQuery),
        getDocs(pendingQuery),
      ]);

    const byId = new Map<string, CollaborativeVideo>();
    for (const doc of [...collaboratorSnapshot.docs, ...createdSnapshot.docs]) {
      byId.set(doc.id, docToVideo(doc.data(), doc.id));
    }
    const allCollaborations = [...byId.values()].sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime()
    );

    const created = allCollaborations.filter((v) => v.creatorId === userId);
    const collaborations = allCollaborations.filter(
      (v) => v.creatorId !== userId
    );
    const pendingInvites = pendingSnapshot.docs.map((doc) =>
      docToVideo(doc.data(), doc.id)
    );

    return { created, collaborations, pendingInvites };
  } catch (error) {
    console.error(
      "❌ [CollaborativeVideoManager] Failed to get user video library:",
      error
    );
    toast.error("Failed to load your video library.");
    return { created: [], collaborations: [], pendingInvites: [] };
  }
}

export async function getPendingInvites(): Promise<CollaborativeVideo[]> {
  try {
    // Firestore first: `readFirestore` waits for the persisted session, and
    // `getUserId` reads it. The other order throws on a cold load.
    const firestore = await readFirestore();
    const userId = getUserId();
    const collectionRef = collection(firestore, VIDEOS_COLLECTION);

    const q = query(
      collectionRef,
      where("pendingInviteUserIds", "array-contains", userId)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => docToVideo(doc.data(), doc.id));
  } catch (error) {
    console.error(
      "❌ [CollaborativeVideoManager] Failed to get pending invites:",
      error
    );
    return [];
  }
}
