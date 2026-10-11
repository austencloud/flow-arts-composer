/**
 * Audit logger for admin actions.
 *
 * Writes structured entries to Firestore `audit_log` collection.
 * Callers may await durable completion. Audit failures remain non-fatal.
 */

import {
  getFirestoreRest,
  toFirestoreFields,
} from "#lib/server/firestore/firestore-rest.js";

export interface AuditEntry {
  /** UID of the admin performing the action */
  uid: string;
  /** Human-readable action name (e.g., "feature_flag_update", "user_auth_query") */
  action: string;
  /** Target of the action (e.g., user ID queried, flag key changed) */
  target?: string;
  /** Arbitrary extra context */
  metadata?: Record<string, unknown>;
  /** Client IP address */
  ip?: string;
}

/**
 * Log an admin action to Firestore audit_log collection.
 *
 * Resolves after the write attempt; errors are logged but never thrown.
 */
export async function logAdminAction(
  entry: AuditEntry,
  platformCredential?: string
): Promise<void> {
  const doc = {
    ...entry,
    timestamp: new Date().toISOString(),
  };

  try {
    const firestore = getFirestoreRest(platformCredential);
    await firestore.commit([
      {
        update: {
          name: firestore.documentName(`audit_log/${crypto.randomUUID()}`),
          fields: toFirestoreFields(doc),
        },
      },
    ]);
  } catch (err) {
    console.error("[audit-logger] Failed to write audit entry:", err, doc);
  }
}
