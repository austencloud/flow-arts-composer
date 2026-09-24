import {
  toFirestoreValue,
  type FirestoreFields,
} from "./firestore-value-codec";
import {
  getServiceAccountAuthorizer,
  type ServiceAccountAuthorizer,
} from "$lib/server/google/service-account-authorizer";

export {
  fromFirestoreFields,
  fromFirestoreValue,
  toFirestoreFields,
  toFirestoreValue,
  type FirestoreFields,
  type FirestoreGeoPoint,
  type FirestoreValue,
} from "./firestore-value-codec";

const FIRESTORE_HOST = "https://firestore.googleapis.com/v1";
const DATASTORE_SCOPE = "https://www.googleapis.com/auth/datastore";

export interface FirestoreDocument {
  name: string;
  fields?: FirestoreFields;
  createTime?: string;
  updateTime?: string;
}

export interface FirestoreWrite {
  update?: {
    name: string;
    fields: FirestoreFields;
  };
  delete?: string;
  transform?: {
    document: string;
    fieldTransforms: Array<Record<string, unknown>>;
  };
  updateMask?: {
    fieldPaths: string[];
  };
  updateTransforms?: Array<Record<string, unknown>>;
  currentDocument?: {
    exists?: boolean;
    updateTime?: string;
  };
}

export interface FirestoreQuery {
  collectionId: string;
  fieldPath: string;
  value: unknown;
  limit?: number;
  /** Projection: return only these fields. Omit for whole documents. */
  fieldPaths?: readonly string[];
}

export interface FirestoreDocumentPage {
  documents: FirestoreDocument[];
  nextPageToken?: string;
}

export class FirestoreRestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody: string
  ) {
    super(message);
    this.name = "FirestoreRestError";
  }
}

function encodeBase64Url(value: string | Uint8Array): string {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodeDocumentPath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function readFirestoreString(
  document: FirestoreDocument,
  field: string
): string | null {
  const value = document.fields?.[field];
  return value && "stringValue" in value ? value.stringValue : null;
}

export function readFirestoreInteger(
  document: FirestoreDocument,
  field: string
): number | null {
  const value = document.fields?.[field];
  if (!value || !("integerValue" in value)) return null;
  const parsed = Number(value.integerValue);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function readFirestoreBoolean(
  document: FirestoreDocument,
  field: string
): boolean | null {
  const value = document.fields?.[field];
  return value && "booleanValue" in value ? value.booleanValue : null;
}

export class FirestoreRest {
  constructor(private readonly authorizer: ServiceAccountAuthorizer) {}

  get projectId(): string {
    return this.authorizer.projectId;
  }

  documentName(path: string): string {
    return `projects/${this.projectId}/databases/(default)/documents/` + path;
  }

  async getDocument(
    path: string,
    fieldPaths: readonly string[] = []
  ): Promise<FirestoreDocument | null> {
    const mask = fieldPaths
      .map((field) => `mask.fieldPaths=${encodeURIComponent(field)}`)
      .join("&");
    const url =
      `${FIRESTORE_HOST}/${this.documentName(encodeDocumentPath(path))}` +
      (mask ? `?${mask}` : "");
    const response = await this.authorizedFetch(url, {
      headers: { accept: "application/json" },
    });

    if (response.status === 404) return null;
    if (!response.ok) await this.throwResponseError("read", response);
    return (await response.json()) as FirestoreDocument;
  }

  /**
   * Many documents in one request, keyed by the path each was requested
   * with; a missing document maps to null. Firestore returns them in no
   * particular order, so results are matched back by document name.
   */
  async batchGetDocuments(
    paths: readonly string[],
    fieldPaths: readonly string[] = []
  ): Promise<Map<string, FirestoreDocument | null>> {
    const documents = new Map<string, FirestoreDocument | null>();
    const pathByName = new Map(
      [...new Set(paths)].map((path) => [this.documentName(path), path])
    );
    if (pathByName.size === 0) return documents;

    const url =
      `${FIRESTORE_HOST}/projects/${this.projectId}/databases/(default)` +
      "/documents:batchGet";
    const response = await this.authorizedFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documents: [...pathByName.keys()],
        ...(fieldPaths.length > 0 ? { mask: { fieldPaths } } : {}),
      }),
    });

    if (!response.ok) await this.throwResponseError("batchGet", response);
    const rows = (await response.json()) as Array<{
      found?: FirestoreDocument;
      missing?: string;
    }>;
    for (const row of rows) {
      const path = pathByName.get(row.found?.name ?? row.missing ?? "");
      if (path !== undefined) documents.set(path, row.found ?? null);
    }
    return documents;
  }

  async listDocuments(
    collectionId: string,
    options: {
      pageSize?: number;
      pageToken?: string;
      fieldPaths?: readonly string[];
    } = {}
  ): Promise<FirestoreDocumentPage> {
    const pageSize = Math.max(
      1,
      Math.min(Math.trunc(options.pageSize ?? 100), 1000)
    );
    const query = new URLSearchParams({ pageSize: String(pageSize) });
    if (options.pageToken) query.set("pageToken", options.pageToken);
    for (const fieldPath of options.fieldPaths ?? []) {
      query.append("mask.fieldPaths", fieldPath);
    }
    const url =
      `${FIRESTORE_HOST}/projects/${this.projectId}/databases/(default)` +
      `/documents/${encodeDocumentPath(collectionId)}?${query}`;
    const response = await this.authorizedFetch(url, {
      headers: { accept: "application/json" },
    });

    if (!response.ok) await this.throwResponseError("list", response);
    const page = (await response.json()) as {
      documents?: FirestoreDocument[];
      nextPageToken?: string;
    };
    return {
      documents: page.documents ?? [],
      ...(page.nextPageToken ? { nextPageToken: page.nextPageToken } : {}),
    };
  }

  async commit(writes: FirestoreWrite[]): Promise<{ commitTime: string }> {
    if (writes.length === 0) {
      throw new Error("Firestore commit requires at least one write");
    }

    const url =
      `${FIRESTORE_HOST}/projects/${this.projectId}/databases/(default)` +
      "/documents:commit";
    const response = await this.authorizedFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ writes }),
    });

    if (!response.ok) await this.throwResponseError("commit", response);
    return (await response.json()) as { commitTime: string };
  }

  async queryDocuments(query: FirestoreQuery): Promise<FirestoreDocument[]> {
    const limit = Math.max(1, Math.min(Math.trunc(query.limit ?? 100), 1000));
    const url =
      `${FIRESTORE_HOST}/projects/${this.projectId}/databases/(default)` +
      "/documents:runQuery";
    const response = await this.authorizedFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: query.collectionId }],
          ...(query.fieldPaths?.length
            ? {
                select: {
                  fields: query.fieldPaths.map((fieldPath) => ({ fieldPath })),
                },
              }
            : {}),
          where: {
            fieldFilter: {
              field: { fieldPath: query.fieldPath },
              op: "EQUAL",
              value: toFirestoreValue(query.value),
            },
          },
          limit,
        },
      }),
    });

    if (!response.ok) await this.throwResponseError("query", response);
    const rows = (await response.json()) as Array<{
      document?: FirestoreDocument;
    }>;
    return rows.flatMap((row) => (row.document ? [row.document] : []));
  }

  private async authorizedFetch(
    input: string,
    init: RequestInit
  ): Promise<Response> {
    return this.authorizer.authorizedFetch(input, init, DATASTORE_SCOPE);
  }

  private async throwResponseError(
    operation: string,
    response: Response
  ): Promise<never> {
    const body = (await response.text()).slice(0, 1500);
    throw new FirestoreRestError(
      `Firestore REST ${operation} failed (${response.status})`,
      response.status,
      body
    );
  }
}

let client: FirestoreRest | null = null;
let clientAuthorizer: ServiceAccountAuthorizer | null = null;

export function getFirestoreRest(platformCredential?: string): FirestoreRest {
  const authorizer = getServiceAccountAuthorizer(platformCredential);
  if (!client || clientAuthorizer !== authorizer) {
    client = new FirestoreRest(authorizer);
    clientAuthorizer = authorizer;
  }
  return client;
}

export async function hashPrivateValue(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return encodeBase64Url(new Uint8Array(digest));
}
