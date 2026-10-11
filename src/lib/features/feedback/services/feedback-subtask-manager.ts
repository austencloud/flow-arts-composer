/**
 * FeedbackSubtaskManager
 *
 * Subtask management for feedback items.
 * Handles subtask operations, blocking logic, and progress tracking.
 */

import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";

import type {
  FeedbackSubtask,
  SubtaskStatus,
} from "#lib/shared/feedback/domain/models/feedback-models.js";

/**
 * Add a new subtask to feedback item
 */
export async function addSubtask(
  feedbackId: string,
  subtask: Omit<FeedbackSubtask, "id">
): Promise<FeedbackSubtask> {
  const firestore = await getFirestoreInstance();
  const newSubtask: FeedbackSubtask = {
    ...subtask,
    id: generateSubtaskId(),
  };

  const docRef = doc(firestore, "feedback", feedbackId);
  await updateDoc(docRef, {
    subtasks: arrayUnion(newSubtask),
  });

  return newSubtask;
}

/**
 * Update subtask status (pending → in-progress → completed)
 * Note: Firestore doesn't support direct nested array element updates.
 * Implementation deferred to Phase 3 when needed.
 */
export async function updateSubtaskStatus(
  _feedbackId: string,
  _subtaskId: string,
  _status: SubtaskStatus
): Promise<void> {
  throw new Error(
    "Not yet implemented - requires fetch-modify-replace pattern"
  );
}

/**
 * Delete a subtask
 * Note: Firestore limitation - deferred to Phase 3
 */
export async function deleteSubtask(_feedbackId: string, _subtaskId: string): Promise<void> {
  throw new Error(
    "Not yet implemented - requires fetch-modify-replace pattern"
  );
}

/**
 * Check if a subtask is blocked by dependencies
 * A subtask is blocked if it has unmet dependencies (not all depended-on tasks are completed)
 */
export function isSubtaskBlocked(
  subtask: FeedbackSubtask,
  allSubtasks: FeedbackSubtask[]
): boolean {
  if (!subtask.dependsOn || subtask.dependsOn.length === 0) {
    return false;
  }

  // Check if all dependencies are completed
  return !subtask.dependsOn.every((depId) => {
    const dependency = allSubtasks.find((s) => s.id === depId);
    return dependency?.status === "completed";
  });
}

/**
 * Get completion percentage for feedback's subtasks (0-100)
 */
export function getCompletionPercentage(subtasks: FeedbackSubtask[]): number {
  if (subtasks.length === 0) return 0;
  const completed = subtasks.filter((s) => s.status === "completed").length;
  return Math.round((completed / subtasks.length) * 100);
}

/**
 * Generate unique subtask ID
 */
function generateSubtaskId(): string {
  return `st_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
