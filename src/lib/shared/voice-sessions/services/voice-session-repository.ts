/**
 * VoiceSessionRepository - Firebase Implementation
 *
 * Persists voice command sessions to Firestore.
 * Follows the TikaSessionRepository pattern but simpler (no review workflow).
 */

import { requireAuth } from "#lib/shared/firestore/index.js";
import {
  firestoreGet,
  firestoreList,
  firestoreSet,
  firestoreDelete,
} from "#lib/shared/firestore/index.js";
import {
  VoiceSessionSchema,
  VoiceSessionPreviewSchema,
} from "#lib/shared/voice-control/domain/voice-session-schemas.js";
import type {
  VoiceSession,
  VoiceSessionPreview,
} from "#lib/shared/voice-control/domain/voice-session-types.js";
import {
  getUserVoiceSessionsPath,
  VOICE_SESSION_LIMITS,
} from "#lib/shared/voice-sessions/data/firestore-paths.js";

export class VoiceSessionError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "UNAUTHORIZED" | "NETWORK",
  ) {
    super(message);
    this.name = "VoiceSessionError";
  }
}

export interface VoiceSessionQueryOptions {
  limit?: number;
  sortDirection?: "asc" | "desc";
}

function getUserId(): string {
  try {
    return requireAuth();
  } catch {
    throw new VoiceSessionError("User not authenticated", "UNAUTHORIZED");
  }
}

export async function saveSession(
  session: VoiceSession,
): Promise<VoiceSession> {
  const userId = getUserId();

  const sessionWithUser: VoiceSession = { ...session, userId };

  try {
    await firestoreSet(
      getUserVoiceSessionsPath(userId),
      session.id,
      {
        ...sessionWithUser,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        savedAt: new Date(),
      } as Record<string, unknown>,
      { trackOffline: true, repoName: "voice-sessions" },
    );

    return sessionWithUser;
  } catch (error) {
    console.error("[VoiceSessionRepository] Failed to save session:", error);
    throw new VoiceSessionError("Failed to save voice session", "NETWORK");
  }
}

export async function getSession(
  sessionId: string,
): Promise<VoiceSession | null> {
  const userId = getUserId();

  try {
    const parsed = await firestoreGet(
      getUserVoiceSessionsPath(userId),
      sessionId,
      VoiceSessionSchema,
    );
    return parsed as unknown as VoiceSession | null;
  } catch (error) {
    console.error("[VoiceSessionRepository] Failed to get session:", error);
    throw new VoiceSessionError("Failed to load voice session", "NETWORK");
  }
}

export async function listSessions(
  options?: VoiceSessionQueryOptions,
): Promise<VoiceSessionPreview[]> {
  const userId = getUserId();

  const sortDir = options?.sortDirection ?? "desc";
  const limitCount =
    options?.limit ?? VOICE_SESSION_LIMITS.DEFAULT_QUERY_LIMIT;

  try {
    const parsed = await firestoreList(
      getUserVoiceSessionsPath(userId),
      VoiceSessionPreviewSchema,
      {
        orderBy: [{ field: "startedAt", direction: sortDir }],
        limit: limitCount,
      },
    );
    return parsed as unknown as VoiceSessionPreview[];
  } catch (error) {
    console.error("[VoiceSessionRepository] Failed to list sessions:", error);
    throw new VoiceSessionError(
      "Failed to load voice session list",
      "NETWORK",
    );
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  const userId = getUserId();

  try {
    await firestoreDelete(getUserVoiceSessionsPath(userId), sessionId, {
      trackOffline: true,
      repoName: "voice-sessions",
    });
  } catch (error) {
    console.error("[VoiceSessionRepository] Failed to delete session:", error);
    throw new VoiceSessionError("Failed to delete voice session", "NETWORK");
  }
}

export async function enforceSessionLimit(): Promise<number> {
  const userId = getUserId();

  try {
    // Load all sessions ordered oldest first
    const allSessions = await firestoreList(
      getUserVoiceSessionsPath(userId),
      VoiceSessionPreviewSchema,
      { orderBy: [{ field: "startedAt", direction: "asc" }] },
    );

    const totalCount = allSessions.length;
    const excess = totalCount - VOICE_SESSION_LIMITS.MAX_SESSIONS_PER_USER;

    if (excess <= 0) return 0;

    // Delete the oldest sessions to get back within limit
    let deleted = 0;
    for (const session of allSessions) {
      if (deleted >= excess) break;
      await firestoreDelete(
        getUserVoiceSessionsPath(userId),
        session.id,
        { trackOffline: true, repoName: "voice-sessions" },
      );
      deleted++;
    }

    return deleted;
  } catch (error) {
    console.error(
      "[VoiceSessionRepository] Failed to enforce session limit:",
      error,
    );
    return 0;
  }
}
