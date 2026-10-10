import {
  collection,
  doc,
  type CollectionReference,
  type DocumentReference,
  type Firestore,
} from "firebase/firestore";
import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";

// firestoreDate lives in its own worker-safe module (no auth/firebase-client
// import). Re-exported here so existing firestore-helpers / barrel consumers
// keep working unchanged.
export { firestoreDate } from "./firestore-date";

/**
 * True only for objects Firestore treats as maps: `{}` literals, `Object.create(null)`
 * bags, and Svelte `$state` proxies over them (a proxy reports its target's prototype).
 *
 * Anything else reaching a write is a value type the SDK serializes itself —
 * `Timestamp`, `GeoPoint`, `DocumentReference`, `Bytes`, `Date`, or a `FieldValue`
 * sentinel — and recursing into one deep-copies it into a plain object, which is
 * how it gets STORED. That is not a cosmetic loss: `serverTimestamp()` lands as a
 * literal `{ _methodName: "serverTimestamp" }`, and a `Timestamp` read off an
 * existing document and written back lands as `{ seconds, nanoseconds }` — a map
 * that no longer equals the timestamp it came from, so rules comparing the two
 * (`request.resource.data.publishedAt == resource.data.publishedAt`) deny the
 * write, and any orderBy on the field silently stops sorting.
 */
function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * Drop `undefined` fields, which Firestore rejects, and leave everything else
 * byte-identical — value types included (see {@link isPlainObject}).
 */
export function stripUndefined<T extends Record<string, unknown>>(
  obj: T,
): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item !== null && typeof item === "object" && !Array.isArray(item)
          ? isPlainObject(item)
            ? stripUndefined(item as Record<string, unknown>)
            : item
          : item,
      );
    } else if (
      value !== null &&
      typeof value === "object" &&
      isPlainObject(value)
    ) {
      result[key] = stripUndefined(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

export function requireAuth(): string {
  const userId = authState.effectiveUserId;
  if (!userId) {
    throw new Error("Authentication required");
  }
  return userId;
}

export function buildCollectionRef(
  db: Firestore,
  path: string,
): CollectionReference {
  return collection(db, path);
}

export function buildDocRef(
  db: Firestore,
  path: string,
  id: string,
): DocumentReference {
  return doc(db, path, id);
}
