/**
 * TikaSessionRepository - Firebase Implementation
 *
 * Handles CRUD operations for Tika conversation sessions in Firestore.
 */

import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  runTransaction,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { trackWrite } from "#lib/shared/offline/state/sync-status-state.svelte.js";
import {
  firestoreGet,
  firestoreList,
  firestoreSet,
  firestoreDelete,
  firestoreListen,
  requireAuth,
  stripUndefined,
  type WhereClause,
} from "#lib/shared/firestore/index.js";
import {
  TikaSessionSchema,
  TikaSessionPreviewSchema,
} from "../domain/models/tika-session-schemas";
import type { UIMessage } from "ai";
import {
  createTikaSession,
  type TikaSession,
  type TikaSessionPreview,
  type TikaSessionQueryOptions,
  type ReviewQueueQueryOptions,
  type ReviewResult,
  type ReviewStatus,
  type ReviewMetadata,
} from "../domain/models/tika-conversation-models";
import {
  getUserTikaConversationsPath,
  getUserTikaConversationPath,
  TIKA_LIMITS,
} from "../data/firestore-paths";

/**
 * Error class for Tika session operations
 */
export class TikaSessionError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "UNAUTHORIZED" | "NETWORK"
  ) {
    super(message);
    this.name = "TikaSessionError";
  }
}

function collectionPath(): string {
  const userId = requireAuth();
  return getUserTikaConversationsPath(userId);
}

export async function saveSession(
  sessionId: string | undefined,
  messages: UIMessage[]
): Promise<TikaSession> {
  const userId = requireAuth();
  const session = createTikaSession(userId, messages, sessionId);

  const firestore = await getFirestoreInstance();
  const docRef = doc(
    firestore,
    getUserTikaConversationPath(userId, session.id)
  );

  let createdAt = serverTimestamp();
  if (sessionId) {
    try {
      const existingDoc = await getDoc(docRef);
      if (existingDoc.exists()) {
        createdAt = existingDoc.data().createdAt || serverTimestamp();
      }
    } catch {
      // Fall back to current time if we can't read existing doc
    }
  }

  try {
    await firestoreSet(
      getUserTikaConversationsPath(userId),
      session.id,
      {
        ...session,
        createdAt,
      } as Record<string, unknown>,
      // merge:true — a session is built fresh from messages (createTikaSession)
      // and carries none of the review fields (flaggedForReview, reviewStatus,
      // reviewMetadata, flaggedAt) that flagForReview/claimForReview write to the
      // same doc via updateDoc. A merge:false write here replaced the whole doc
      // and silently wiped a reviewer's grade + dropped the item from the review
      // queue on the next message. merge:true updates the session fields (the
      // messages array is still fully replaced) while preserving review state.
      { merge: true, trackOffline: true, repoName: "tika" }
    );

    return session;
  } catch (error) {
    console.error("[tika-session-repository] Failed to save session:", error);
    throw new TikaSessionError("Failed to save conversation", "NETWORK");
  }
}

export async function getSession(sessionId: string): Promise<TikaSession | null> {
  try {
    return await firestoreGet(collectionPath(), sessionId, TikaSessionSchema) as TikaSession | null;
  } catch (error) {
    console.error("[tika-session-repository] Failed to get session:", error);
    throw new TikaSessionError("Failed to load conversation", "NETWORK");
  }
}

export async function listSessions(
  options?: TikaSessionQueryOptions
): Promise<TikaSessionPreview[]> {
  const sortDir = options?.sortDirection ?? "desc";
  const limitCount = options?.limit ?? TIKA_LIMITS.DEFAULT_QUERY_LIMIT;

  try {
    return await firestoreList(collectionPath(), TikaSessionPreviewSchema, {
      orderBy: [{ field: "updatedAt", direction: sortDir }],
      limit: limitCount,
    }) as TikaSessionPreview[];
  } catch (error) {
    console.error("[tika-session-repository] Failed to list sessions:", error);
    throw new TikaSessionError(
      "Failed to load conversation history",
      "NETWORK"
    );
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  try {
    await firestoreDelete(collectionPath(), sessionId, {
      trackOffline: true,
      repoName: "tika",
    });
  } catch (error) {
    console.error("[tika-session-repository] Failed to delete session:", error);
    throw new TikaSessionError("Failed to delete conversation", "NETWORK");
  }
}

export function subscribeToSessions(
  callback: (sessions: TikaSessionPreview[]) => void,
  options?: TikaSessionQueryOptions,
  onError?: (error: Error) => void
): () => void {
  const sortDir = options?.sortDirection ?? "desc";
  const limitCount = options?.limit ?? TIKA_LIMITS.DEFAULT_QUERY_LIMIT;

  return firestoreListen(
    collectionPath(),
    TikaSessionPreviewSchema,
    callback as (items: unknown[]) => void,
    {
      orderBy: [{ field: "updatedAt", direction: sortDir }],
      limit: limitCount,
    },
    onError
  );
}

export async function flagForReview(sessionId: string, flagged: boolean): Promise<void> {
  const firestore = await getFirestoreInstance();
  const userId = requireAuth();

  const docRef = doc(
    firestore,
    getUserTikaConversationPath(userId, sessionId)
  );

  try {
    if (flagged) {
      await trackWrite(
        () =>
          updateDoc(docRef, {
            flaggedForReview: true,
            flaggedAt: serverTimestamp(),
            reviewStatus: "pending",
            reviewMetadata: null,
          }),
        "tika"
      );
    } else {
      await trackWrite(
        () =>
          updateDoc(docRef, {
            flaggedForReview: false,
            flaggedAt: null,
            reviewStatus: null,
            reviewMetadata: null,
          }),
        "tika"
      );
    }
  } catch (error) {
    console.error("[tika-session-repository] Failed to flag session:", error);
    throw new TikaSessionError(
      "Failed to flag conversation for review",
      "NETWORK"
    );
  }
}

export async function getFlaggedSessions(): Promise<TikaSession[]> {
  try {
    return await firestoreList(collectionPath(), TikaSessionSchema, {
      where: [{ field: "flaggedForReview", op: "==", value: true }],
      orderBy: [{ field: "flaggedAt", direction: "desc" }],
    }) as unknown as TikaSession[];
  } catch (error) {
    console.error(
      "[tika-session-repository] Failed to get flagged sessions:",
      error
    );
    throw new TikaSessionError(
      "Failed to load flagged conversations",
      "NETWORK"
    );
  }
}

export async function getReviewQueue(
  options?: ReviewQueueQueryOptions
): Promise<TikaSession[]> {
  const clauses: WhereClause[] = [];

  if (options?.status) {
    const statuses = Array.isArray(options.status)
      ? options.status
      : [options.status];
    if (statuses.length === 1) {
      clauses.push({ field: "reviewStatus", op: "==", value: statuses[0] });
    } else {
      clauses.push({ field: "reviewStatus", op: "in", value: statuses });
    }
  } else {
    // Default: get all items that have a review status (i.e., flagged items)
    clauses.push({ field: "flaggedForReview", op: "==", value: true });
  }

  try {
    return await firestoreList(collectionPath(), TikaSessionSchema, {
      where: clauses,
      orderBy: [{ field: "flaggedAt", direction: "desc" }],
      limit: options?.limit,
    }) as unknown as TikaSession[];
  } catch (error) {
    console.error(
      "[tika-session-repository] Failed to get review queue:",
      error
    );
    throw new TikaSessionError("Failed to load review queue", "NETWORK");
  }
}

export async function claimForReview(
  sessionId: string,
  claimedBy: string
): Promise<TikaSession | null> {
  const firestore = await getFirestoreInstance();
  const userId = requireAuth();

  const docRef = doc(
    firestore,
    getUserTikaConversationPath(userId, sessionId)
  );

  try {
    // Use transaction for atomic claim
    const result = await runTransaction(firestore, async (transaction) => {
      const docSnap = await transaction.get(docRef);

      if (!docSnap.exists()) {
        throw new TikaSessionError("Session not found", "NOT_FOUND");
      }

      const data = docSnap.data();

      // Check if already claimed by someone else
      if (
        data.reviewStatus === "claimed" &&
        data.reviewMetadata?.claimedBy !== claimedBy
      ) {
        return null;
      }

      const reviewMetadata = {
        ...data.reviewMetadata,
        claimedAt: serverTimestamp(),
        claimedBy,
      };

      transaction.update(docRef, {
        reviewStatus: "claimed",
        reviewMetadata: stripUndefined(reviewMetadata as Record<string, unknown>),
      });

      // Parse the session using the Zod schema for consistency
      const parsed = TikaSessionSchema.safeParse({
        ...data,
        id: sessionId,
        reviewStatus: "claimed",
        reviewMetadata: { ...reviewMetadata, claimedAt: new Date() },
      });
      if (parsed.success) return parsed.data as unknown as TikaSession;

      // Fallback: return manually constructed session
      return {
        id: sessionId,
        userId: data.userId || "",
        title: data.title || "Untitled",
        createdAt: data.createdAt?.toDate?.() ?? new Date(),
        updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
        messageCount: data.messageCount || 0,
        lastUserMessage: data.lastUserMessage || "",
        messages: data.messages || [],
        flaggedForReview: data.flaggedForReview || false,
        reviewStatus: "claimed" as const,
        reviewMetadata: { ...reviewMetadata, claimedAt: new Date() },
      } as TikaSession;
    });

    return result;
  } catch (error) {
    if (error instanceof TikaSessionError) throw error;
    console.error("[tika-session-repository] Failed to claim session:", error);
    throw new TikaSessionError(
      "Failed to claim session for review",
      "NETWORK"
    );
  }
}

export async function submitReview(
  sessionId: string,
  result: ReviewResult
): Promise<TikaSession> {
  const firestore = await getFirestoreInstance();
  const userId = requireAuth();

  const docRef = doc(
    firestore,
    getUserTikaConversationPath(userId, sessionId)
  );

  try {
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      throw new TikaSessionError("Session not found", "NOT_FOUND");
    }

    const data = docSnap.data();
    const existingMetadata = data.reviewMetadata || {};

    let newStatus: ReviewStatus;
    if (result.autoApprove) {
      newStatus = "approved";
    } else if (result.correctedResponse) {
      newStatus = "needs-correction";
    } else {
      newStatus = "in-review"; // Needs human review
    }

    const updatedMetadata: ReviewMetadata = {
      ...existingMetadata,
      grade: result.grade,
      confidence: result.confidence,
      aiNotes: result.notes,
      correctedResponse: result.correctedResponse,
      reviewedAt: new Date(),
    };

    await trackWrite(
      () =>
        updateDoc(docRef, {
          reviewStatus: newStatus,
          reviewMetadata: stripUndefined(updatedMetadata as unknown as Record<string, unknown>),
        }),
      "tika"
    );

    // Parse using Zod schema
    const parsed = TikaSessionSchema.safeParse({
      ...data,
      id: sessionId,
      reviewStatus: newStatus,
      reviewMetadata: updatedMetadata,
    });
    if (parsed.success) return parsed.data as unknown as TikaSession;

    return {
      id: sessionId,
      userId: data.userId || "",
      title: data.title || "Untitled",
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
      updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
      messageCount: data.messageCount || 0,
      lastUserMessage: data.lastUserMessage || "",
      messages: data.messages || [],
      flaggedForReview: data.flaggedForReview || false,
      reviewStatus: newStatus,
      reviewMetadata: updatedMetadata,
    } as TikaSession;
  } catch (error) {
    if (error instanceof TikaSessionError) throw error;
    console.error("[tika-session-repository] Failed to submit review:", error);
    throw new TikaSessionError("Failed to submit review", "NETWORK");
  }
}

export async function addReviewNotes(sessionId: string, notes: string): Promise<void> {
  const firestore = await getFirestoreInstance();
  const userId = requireAuth();

  const docRef = doc(
    firestore,
    getUserTikaConversationPath(userId, sessionId)
  );

  try {
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      throw new TikaSessionError("Session not found", "NOT_FOUND");
    }

    const data = docSnap.data();
    const existingMetadata = data.reviewMetadata || {};

    await updateDoc(docRef, {
      reviewMetadata: stripUndefined({
        ...existingMetadata,
        notes,
      } as Record<string, unknown>),
    });
  } catch (error) {
    if (error instanceof TikaSessionError) throw error;
    console.error(
      "[tika-session-repository] Failed to add review notes:",
      error
    );
    throw new TikaSessionError("Failed to add review notes", "NETWORK");
  }
}

export async function updateReviewStatus(
  sessionId: string,
  status: ReviewStatus
): Promise<void> {
  const firestore = await getFirestoreInstance();
  const userId = requireAuth();

  const docRef = doc(
    firestore,
    getUserTikaConversationPath(userId, sessionId)
  );

  try {
    await updateDoc(docRef, {
      reviewStatus: status,
    });
  } catch (error) {
    console.error(
      "[tika-session-repository] Failed to update review status:",
      error
    );
    throw new TikaSessionError("Failed to update review status", "NETWORK");
  }
}

export async function archiveReview(sessionId: string): Promise<void> {
  const firestore = await getFirestoreInstance();
  const userId = requireAuth();

  const docRef = doc(
    firestore,
    getUserTikaConversationPath(userId, sessionId)
  );

  try {
    await updateDoc(docRef, {
      reviewStatus: "archived",
      flaggedForReview: false,
    });
  } catch (error) {
    console.error("[tika-session-repository] Failed to archive review:", error);
    throw new TikaSessionError("Failed to archive review", "NETWORK");
  }
}
