import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  getDocsFromServer,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  startAfter as firestoreStartAfter,
  serverTimestamp,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { trackWrite } from "#lib/shared/offline/state/sync-status-state.svelte.js";
import { reportErrorTelemetry } from "#lib/shared/error/services/error-telemetry-reporter.js";
import { stripUndefined } from "./firestore-helpers";
import type { ListOptions, ReadOptions, WriteOptions } from "./firestore-types";
import type { Firestore, QueryConstraint } from 'firebase/firestore';

function handleCrudError(
  err: unknown,
  action: string,
  path: string,
  onError?: (error: Error) => void,
): never {
  const error = err instanceof Error ? err : new Error(String(err));
  if (onError) {
    onError(error);
  } else {
    reportErrorTelemetry({
      message: `Firestore ${action} failed: ${error.message.slice(0, 200)}`,
      severity: "warning",
      context: {
        module: "firestore",
        action,
        additionalData: { path },
      },
      error,
    });
  }
  throw error;
}

function buildQuery(
  collectionPath: string,
  db: Firestore,
  options?: ListOptions,
) {
  const constraints: QueryConstraint[] = [];

  if (options?.where) {
    for (const clause of options.where) {
      constraints.push(where(clause.field, clause.op, clause.value));
    }
  }
  if (options?.orderBy) {
    for (const ob of options.orderBy) {
      constraints.push(orderBy(ob.field, ob.direction ?? "asc"));
    }
  }
  if (options?.limit) {
    constraints.push(firestoreLimit(options.limit));
  }
  if (options?.startAfter !== undefined) {
    constraints.push(firestoreStartAfter(options.startAfter));
  }

  return query(collection(db, collectionPath), ...constraints);
}

interface SchemaLike<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false; error: { issues: unknown[] } };
}

function parseDoc<T>(
  schema: SchemaLike<T>,
  id: string,
  data: Record<string, unknown>,
  collectionPath: string,
): T | null {
  const result = schema.safeParse({ id, ...data });
  if (result.success) return result.data;
  console.warn(
    `[firestore] Validation failed for ${collectionPath}/${id}:`,
    result.error.issues,
  );
  return null;
}

/**
 * What a single-document read actually established.
 *
 * `absent` and `unknown` are NOT the same answer, and collapsing them is how a
 * live document reads as deleted: on a cold page load Firestore answers `get()`
 * from its local cache when the server connection isn't up yet, and a document
 * the cache has never seen comes back `exists() === false`. `metadata.fromCache`
 * is the SDK telling us it never asked the server — that is "we don't know",
 * not "it is gone".
 *
 * `invalid` is the third answer a bare `T | null` cannot carry: the document is
 * right there, it just failed its schema.
 */
export type DocReadOutcome<T> =
  | { status: "found"; data: T }
  | { status: "absent" }
  | { status: "unknown" }
  | { status: "invalid"; issues: unknown[] };

export async function firestoreGetDetailed<T>(
  collectionPath: string,
  id: string,
  schema: SchemaLike<T>,
  options?: ReadOptions,
): Promise<DocReadOutcome<T>> {
  try {
    const db = await getFirestoreInstance();
    const snap = await getDoc(doc(db, collectionPath, id));
    if (!snap.exists()) {
      // Optional-chained: a snapshot without metadata (test doubles, older SDK
      // shims) is treated as server-authoritative, which is the prior behaviour.
      return snap.metadata?.fromCache ? { status: "unknown" } : { status: "absent" };
    }
    const parsed = schema.safeParse({ id: snap.id, ...(snap.data() as Record<string, unknown>) });
    if (parsed.success) return { status: "found", data: parsed.data };
    console.warn(
      `[firestore] Validation failed for ${collectionPath}/${id}:`,
      parsed.error.issues,
    );
    return { status: "invalid", issues: parsed.error.issues };
  } catch (err) {
    handleCrudError(err, "get", `${collectionPath}/${id}`, options?.onError);
  }
}

/**
 * Lenient read: anything that isn't a valid document reads as null. Callers that
 * must not mistake "couldn't determine" for "deleted" use
 * {@link firestoreGetDetailed} instead.
 */
export async function firestoreGet<T>(
  collectionPath: string,
  id: string,
  schema: SchemaLike<T>,
  options?: ReadOptions,
): Promise<T | null> {
  const outcome = await firestoreGetDetailed(collectionPath, id, schema, options);
  return outcome.status === "found" ? outcome.data : null;
}

export async function firestoreList<T>(
  collectionPath: string,
  schema: SchemaLike<T>,
  options?: ListOptions & ReadOptions,
): Promise<T[]> {
  try {
    const db = await getFirestoreInstance();
    const q = buildQuery(collectionPath, db, options);
    const snap = options?.serverOnly ? await getDocsFromServer(q) : await getDocs(q);
    const items: T[] = [];
    for (const d of snap.docs) {
      const parsed = parseDoc(schema, d.id, d.data() as Record<string, unknown>, collectionPath);
      if (parsed !== null) items.push(parsed);
    }
    return items;
  } catch (err) {
    handleCrudError(err, "list", collectionPath, options?.onError);
  }
}

export async function firestoreSet<T extends Record<string, unknown>>(
  collectionPath: string,
  id: string | null,
  data: T,
  options?: WriteOptions,
): Promise<string> {
  try {
    const db = await getFirestoreInstance();
    const cleaned = stripUndefined({ ...data });

    const isCreate = id === null;
    const timestamps: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (isCreate) {
      timestamps.createdAt = serverTimestamp();
    }

    const docData = { ...cleaned, ...timestamps };

    const doWrite = async () => {
      if (isCreate) {
        const ref = await addDoc(collection(db, collectionPath), docData);
        return ref.id;
      }
      const ref = doc(db, collectionPath, id);
      if (options?.merge) {
        await setDoc(ref, docData, { merge: true });
      } else {
        await setDoc(ref, docData);
      }
      return id;
    };

    if (options?.trackOffline) {
      return await trackWrite(doWrite, options.repoName);
    }
    return await doWrite();
  } catch (err) {
    handleCrudError(err, "set", `${collectionPath}/${id ?? "(auto)"}`, options?.onError);
  }
}

export async function firestoreDelete(
  collectionPath: string,
  id: string,
  options?: { trackOffline?: boolean; repoName?: string; onError?: (error: Error) => void },
): Promise<void> {
  try {
    const db = await getFirestoreInstance();
    const ref = doc(db, collectionPath, id);

    const doDelete = () => deleteDoc(ref);

    if (options?.trackOffline) {
      await trackWrite(doDelete, options.repoName);
    } else {
      await doDelete();
    }
  } catch (err) {
    handleCrudError(err, "delete", `${collectionPath}/${id}`, options?.onError);
  }
}

export function firestoreListen<T>(
  collectionPath: string,
  schema: SchemaLike<T>,
  callback: (items: T[]) => void,
  options?: ListOptions,
  onError?: (error: Error) => void,
): () => void {
  let unsubscribe: (() => void) | null = null;
  // The listener attaches asynchronously. If the consumer unsubscribes before
  // getFirestoreInstance resolves, this flag stops the attachment (or detaches
  // immediately if the snapshot listener won the race).
  let disposed = false;

  getFirestoreInstance()
    .then((db) => {
      if (disposed) return;
      const q = buildQuery(collectionPath, db, options);
      unsubscribe = onSnapshot(
      q,
        (snap) => {
          const items: T[] = [];
          for (const d of snap.docs) {
            const parsed = parseDoc(
              schema,
              d.id,
              d.data() as Record<string, unknown>,
              collectionPath,
            );
            if (parsed !== null) items.push(parsed);
          }
          callback(items);
        },
        (error) => {
          if (onError) {
            onError(error);
          } else {
            reportErrorTelemetry({
              message: `Firestore listen failed: ${error.message.slice(0, 200)}`,
              severity: "warning",
              context: {
                module: "firestore",
                action: "listen",
                additionalData: { path: collectionPath },
              },
              error,
            });
          }
        },
      );
    })
    .catch((err) => {
      // Same onError/telemetry routing as the other CRUD functions. The rethrow
      // is swallowed because nothing awaits this chain — letting it propagate
      // would just recreate the unhandled rejection this catch exists to fix.
      try {
        handleCrudError(err, "listen", collectionPath, onError);
      } catch {
        // already reported
      }
    });

  return () => {
    disposed = true;
    unsubscribe?.();
    unsubscribe = null;
  };
}
