/**
 * The Firestore store @austencloud/phone-sign-in runs on, over the server's
 * Firestore REST client. The package hands over and expects back Date values
 * for times; the shared codec writes a Date as a timestamp but reads one back
 * as text, so reads here turn every timestamp back into a Date.
 */

import type {
  PhoneSignInStore,
  StoredDocument,
} from "@austencloud/phone-sign-in/server";
import {
  FirestoreRestError,
  toFirestoreFields,
  type FirestoreFields,
  type FirestoreRest,
  type FirestoreValue,
} from "#lib/server/firestore/firestore-rest.js";

/**
 * Collection names and ids land in REST paths and in resource names inside
 * write bodies, so an empty, "." or ".." segment, or one with a "/", would
 * address some other document. Refused before any request.
 */
function pathOf(collection: string, id: string): string {
  for (const segment of [collection, id]) {
    if (
      !segment ||
      segment === "." ||
      segment === ".." ||
      segment.includes("/")
    ) {
      throw new Error(
        `Invalid Firestore path segment: ${JSON.stringify(segment)}`
      );
    }
  }
  return `${collection}/${id}`;
}

const BARE_FIELD = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** One top-level field name in Firestore's field path syntax. */
function fieldPath(name: string): string {
  if (BARE_FIELD.test(name)) return name;
  return "`" + name.replace(/\\/g, "\\\\").replace(/`/g, "\\`") + "`";
}

function decodeValue(value: FirestoreValue): unknown {
  if ("timestampValue" in value) return new Date(value.timestampValue);
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) {
    const parsed = Number(value.integerValue);
    return Number.isSafeInteger(parsed) ? parsed : value.integerValue;
  }
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("arrayValue" in value) {
    return (value.arrayValue.values ?? []).map(decodeValue);
  }
  if ("mapValue" in value) return decodeFields(value.mapValue.fields ?? {});
  if ("geoPointValue" in value) return { ...value.geoPointValue };
  if ("bytesValue" in value) return value.bytesValue;
  return value.referenceValue;
}

function decodeFields(fields: FirestoreFields): Record<string, unknown> {
  const decoded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    decoded[key] = decodeValue(value);
  }
  return decoded;
}

/**
 * A conditional write that lost: FAILED_PRECONDITION arrives as 400, the same
 * status a malformed write gets, so the body's `error.status` tells them
 * apart. ABORTED (409) is Firestore's own concurrency control.
 */
function lostTheRace(cause: unknown): boolean {
  if (!(cause instanceof FirestoreRestError)) return false;
  let status: unknown;
  try {
    status = (
      JSON.parse(cause.responseBody) as { error?: { status?: unknown } }
    )?.error?.status;
  } catch {
    return false;
  }
  return (
    (cause.status === 400 && status === "FAILED_PRECONDITION") ||
    (cause.status === 409 && status === "ABORTED")
  );
}

export function createPhoneSignInStore(
  firestore: () => FirestoreRest
): PhoneSignInStore {
  async function read(
    collection: string,
    id: string
  ): Promise<StoredDocument | null> {
    const document = await firestore().getDocument(pathOf(collection, id));
    if (!document) return null;
    if (!document.updateTime || !document.createTime) {
      throw new Error(
        `Firestore read of ${collection}/${id} returned no updateTime or createTime`
      );
    }
    return {
      data: decodeFields(document.fields ?? {}),
      revision: document.updateTime,
      createTime: document.createTime,
    };
  }

  return {
    async get(collection, id) {
      return (await read(collection, id))?.data ?? null;
    },

    getWithRevision: read,

    async set(collection, id, data) {
      const rest = firestore();
      await rest.commit([
        {
          update: {
            name: rest.documentName(pathOf(collection, id)),
            fields: toFirestoreFields(data),
          },
        },
      ]);
    },

    async updateIfCurrent(collection, id, data, revision) {
      const rest = firestore();
      const fields = toFirestoreFields(data);
      try {
        await rest.commit([
          {
            update: { name: rest.documentName(pathOf(collection, id)), fields },
            updateMask: { fieldPaths: Object.keys(fields).map(fieldPath) },
            currentDocument: { updateTime: revision },
          },
        ]);
        return true;
      } catch (cause) {
        if (lostTheRace(cause)) return false;
        throw cause;
      }
    },

    async delete(collection, id) {
      const rest = firestore();
      await rest.commit([
        { delete: rest.documentName(pathOf(collection, id)) },
      ]);
    },
  };
}
