/**
 * TikaProgressWriter
 *
 * Server-side module that writes verified concept completions to Firestore.
 * Called by the `complete_verified_concepts` tool after TIKA verifies
 * a user's knowledge through conversation challenges.
 *
 * Uses Firebase Admin SDK (server-side only).
 * The client's ConceptProgressTracker picks up changes via onSnapshot.
 */

import { getAdminDb } from "#lib/server/firebaseAdmin.js";
import {
  getConceptById,
  KNOWLEDGE_GRAPH,
  isConceptUnlocked,
} from "@tka/domain";

export interface VerificationResult {
  success: boolean;
  completedConcepts: string[];
  rejectedConcepts: Array<{ id: string; reason: string }>;
  errors: string[];
  newMajorLevel?: number;
}

const MAX_CONCEPTS_PER_CALL = 8;

/**
 * Validate concept IDs before writing.
 * Checks: IDs exist in knowledge graph, prerequisites met, not already completed.
 */
export function validateConceptIds(
  conceptIds: string[],
  alreadyCompleted: string[]
): { valid: string[]; rejected: Array<{ id: string; reason: string }> } {
  const completedSet = new Set(alreadyCompleted);
  const valid: string[] = [];
  const rejected: Array<{ id: string; reason: string }> = [];

  if (conceptIds.length > MAX_CONCEPTS_PER_CALL) {
    return {
      valid: [],
      rejected: conceptIds.map((id) => ({
        id,
        reason: `Exceeds max ${MAX_CONCEPTS_PER_CALL} concepts per call`,
      })),
    };
  }

  for (const id of conceptIds) {
    const concept = getConceptById(id);

    if (!concept) {
      rejected.push({ id, reason: `Unknown concept ID "${id}"` });
      continue;
    }

    if (completedSet.has(id)) {
      rejected.push({ id, reason: "Already completed" });
      continue;
    }

    // Check prerequisites (considering both already-completed and concepts being completed in this batch)
    const effectiveCompleted = new Set([...completedSet, ...valid]);
    if (!isConceptUnlocked(id, effectiveCompleted)) {
      const unmetPrereqs = concept.prerequisites.filter(
        (p) => !effectiveCompleted.has(p)
      );
      rejected.push({
        id,
        reason: `Prerequisites not met: ${unmetPrereqs.join(", ")}`,
      });
      continue;
    }

    valid.push(id);
    // Add to effective set so later concepts in this batch can reference it
    completedSet.add(id);
  }

  return { valid, rejected };
}

/**
 * Write verified concept completions to Firestore.
 * Creates both the progress update and an audit trail entry.
 */
export async function writeCompletions(
  userId: string,
  conceptIds: string[],
  alreadyCompleted: string[],
  summary: string
): Promise<VerificationResult> {
  const { valid, rejected } = validateConceptIds(conceptIds, alreadyCompleted);

  if (valid.length === 0) {
    return {
      success: false,
      completedConcepts: [],
      rejectedConcepts: rejected,
      errors: rejected.map((r) => `${r.id}: ${r.reason}`),
    };
  }

  const db = getAdminDb();
  const now = new Date().toISOString();
  const batch = db.batch();

  // Build the merge update for learningProgress/current
  const progressRef = db.doc(`users/${userId}/learningProgress/current`);

  const conceptUpdates: Record<string, unknown> = {};
  for (const id of valid) {
    conceptUpdates[`concepts.${id}`] = {
      conceptId: id,
      status: "completed",
      percentComplete: 100,
      verifiedByTika: true,
      completedAt: now,
      correctAnswers: 0,
      incorrectAnswers: 0,
      totalAttempts: 0,
      accuracy: 0,
      currentStreak: 0,
      bestStreak: 0,
      timeSpentSeconds: 0,
    };
  }

  // Compute new overall progress
  const allCompleted = new Set([...alreadyCompleted, ...valid]);
  const overallProgress = (allCompleted.size / KNOWLEDGE_GRAPH.length) * 100;

  // Derive new major level from highest completed concept
  let newMajorLevel = 1;
  for (const cid of allCompleted) {
    const concept = getConceptById(cid);
    if (concept && concept.level > newMajorLevel) {
      newMajorLevel = concept.level;
    }
  }

  batch.set(
    progressRef,
    {
      ...conceptUpdates,
      completedConcepts: [...allCompleted],
      overallProgress,
      lastUpdated: now,
    },
    { merge: true }
  );

  // Create audit log entry
  const auditRef = db.collection(`users/${userId}/tikaVerifications`).doc();
  batch.set(auditRef, {
    conceptIds: valid,
    summary,
    verifiedAt: now,
    method: "conversation-challenge",
    rejectedConcepts: rejected.length > 0 ? rejected : null,
  });

  try {
    await batch.commit();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[tika-progress-writer] Firestore write failed: ${message}`);
    return {
      success: false,
      completedConcepts: [],
      rejectedConcepts: rejected,
      errors: [`Firestore write failed: ${message}`],
    };
  }

  return {
    success: true,
    completedConcepts: valid,
    rejectedConcepts: rejected,
    errors: [],
    newMajorLevel,
  };
}
