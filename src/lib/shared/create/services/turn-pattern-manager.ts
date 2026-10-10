/**
 * Turn Pattern Service (Firestore CRUD)
 *
 * Handles persistence of turn patterns (save/load/delete). The pure transform
 * half — extract, validate, and apply — lives in `turn-pattern-apply.ts` (no
 * Firebase) and is re-exported here so existing consumers keep importing it from
 * this module unchanged.
 */

import {
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import type {
  TurnPattern,
  TurnPatternCreateData,
} from "#lib/shared/create/domain/turn-pattern-data.js";
import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";

// Firebase-free transform half — re-exported for backward compatibility so
// consumers keep importing these from turn-pattern-manager.
export {
  extractPattern,
  applyPattern,
  validateForSequence,
} from "./turn-pattern-apply";
export type { TargetHand, TurnPatternApplyResult } from "./turn-pattern-apply";

const logger = createComponentLogger("TurnPatternManager");

/**
 * Save a turn pattern to Firebase
 */
export async function savePattern(
  data: TurnPatternCreateData,
  userId: string
): Promise<TurnPattern> {
  const firestore = await getFirestoreInstance();
  const patternsRef = collection(firestore, "users", userId, "turnPatterns");

  const docData = {
    name: data.name,
    userId,
    stepCount: data.stepCount,
    entries: data.entries,
    createdAt: serverTimestamp(),
  };

  const docRef = await addDoc(patternsRef, docData);

  logger.log(`Saved pattern "${data.name}" with ID ${docRef.id}`);

  return {
    id: docRef.id,
    name: data.name,
    userId,
    stepCount: data.stepCount,
    entries: data.entries,
    createdAt: null as unknown as Timestamp, // Will be populated by Firestore
  };
}

/**
 * Load all turn patterns for a user
 */
export async function loadPatterns(userId: string): Promise<TurnPattern[]> {
  const firestore = await getFirestoreInstance();
  const patternsRef = collection(firestore, "users", userId, "turnPatterns");
  const q = query(patternsRef, orderBy("createdAt", "desc"));

  const snapshot = await getDocs(q);
  const patterns: TurnPattern[] = [];

  snapshot.forEach((doc) => {
    const data = doc.data();
    patterns.push({
      id: doc.id,
      name: data.name,
      userId: data.userId,
      stepCount: data.stepCount,
      entries: data.entries,
      createdAt: data.createdAt,
    });
  });

  logger.log(`Loaded ${patterns.length} patterns for user ${userId}`);
  return patterns;
}

/**
 * Delete a turn pattern
 */
export async function deletePattern(patternId: string, userId: string): Promise<void> {
  const firestore = await getFirestoreInstance();
  const patternRef = doc(
    firestore,
    "users",
    userId,
    "turnPatterns",
    patternId
  );
  await deleteDoc(patternRef);
  logger.log(`Deleted pattern ${patternId}`);
}
