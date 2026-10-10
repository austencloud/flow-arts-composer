/**
 * Audit Logger
 *
 * Writes immutable records of admin operations to Firestore.
 */

import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { getFirestoreInstance, getAuthSync } from "#lib/shared/auth/firebase.js";
import type { AuditLogEntry, AuditActionType } from "./types";

/**
 * Log an admin action
 */
export async function logAction(
  action: AuditActionType,
  summary: string,
  affectedUserId?: string,
  details?: Record<string, unknown>
): Promise<void> {
  const firestore = await getFirestoreInstance();
  const currentUser = getAuthSync().currentUser;
  if (!firestore || !currentUser) {
    return;
  }

  try {
    const auditLogsRef = collection(firestore, "audit_logs");
    await addDoc(auditLogsRef, {
      timestamp: Timestamp.now(),
      action,
      performedBy: currentUser.uid,
      affectedUserId: affectedUserId ?? null,
      summary,
      details: details ?? null,
    });
  } catch (error) {
    console.error("Failed to log audit action:", error);
    // Don't throw - audit logging shouldn't block operations
  }
}

/**
 * Get recent audit log entries
 */
export async function getRecentActions(limitCount: number): Promise<AuditLogEntry[]> {
  const firestore = await getFirestoreInstance();
  if (!firestore) {
    return [];
  }

  try {
    const auditLogsRef = collection(firestore, "audit_logs");
    const q = query(
      auditLogsRef,
      orderBy("timestamp", "desc"),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    const entries: AuditLogEntry[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      const timestamp = data["timestamp"];
      entries.push({
        id: doc.id,
        timestamp:
          timestamp instanceof Timestamp
            ? timestamp.toDate()
            : new Date(timestamp as string),
        action: (data["action"] as AuditActionType) ?? "other",
        performedBy: (data["performedBy"] as string) ?? "unknown",
        affectedUserId: (data["affectedUserId"] as string) ?? undefined,
        summary: (data["summary"] as string) ?? "",
        details: (data["details"] as Record<string, unknown>) ?? undefined,
      });
    });

    return entries;
  } catch (error) {
    console.error("Failed to get recent audit actions:", error);
    return [];
  }
}

/**
 * Get audit log entries for a specific user
 */
export async function getUserActions(
  userId: string,
  limitCount: number
): Promise<AuditLogEntry[]> {
  const firestore = await getFirestoreInstance();
  if (!firestore) {
    return [];
  }

  try {
    const auditLogsRef = collection(firestore, "audit_logs");
    const q = query(
      auditLogsRef,
      where("affectedUserId", "==", userId),
      orderBy("timestamp", "desc"),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    const entries: AuditLogEntry[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      const timestamp = data["timestamp"];
      entries.push({
        id: doc.id,
        timestamp:
          timestamp instanceof Timestamp
            ? timestamp.toDate()
            : new Date(timestamp as string),
        action: (data["action"] as AuditActionType) ?? "other",
        performedBy: (data["performedBy"] as string) ?? "unknown",
        affectedUserId: (data["affectedUserId"] as string) ?? undefined,
        summary: (data["summary"] as string) ?? "",
        details: (data["details"] as Record<string, unknown>) ?? undefined,
      });
    });

    return entries;
  } catch (error) {
    console.error("Failed to get user audit actions:", error);
    return [];
  }
}

/**
 * Get audit log entries for a specific action type
 */
export async function getActionsByType(
  actionType: AuditActionType,
  limitCount: number
): Promise<AuditLogEntry[]> {
  const firestore = await getFirestoreInstance();
  if (!firestore) {
    return [];
  }

  try {
    const auditLogsRef = collection(firestore, "audit_logs");
    const q = query(
      auditLogsRef,
      where("action", "==", actionType),
      orderBy("timestamp", "desc"),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    const entries: AuditLogEntry[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      const timestamp = data["timestamp"];
      entries.push({
        id: doc.id,
        timestamp:
          timestamp instanceof Timestamp
            ? timestamp.toDate()
            : new Date(timestamp as string),
        action: (data["action"] as AuditActionType) ?? "other",
        performedBy: (data["performedBy"] as string) ?? "unknown",
        affectedUserId: (data["affectedUserId"] as string) ?? undefined,
        summary: (data["summary"] as string) ?? "",
        details: (data["details"] as Record<string, unknown>) ?? undefined,
      });
    });

    return entries;
  } catch (error) {
    console.error("Failed to get audit actions by type:", error);
    return [];
  }
}
