import { doc, getDoc, setDoc, arrayUnion } from "firebase/firestore";
import { getFirestoreInstance } from "$lib/shared/auth/firebase";
import {
  firestoreGet,
  firestoreList,
  firestoreDelete,
  requireAuth,
  type WhereClause,
} from "$lib/shared/firestore";
import { HandPathDataSchema } from "../domain/models/hand-path-schemas";
import type { HandPathData } from "../domain/models/hand-path-data";
import type { HandPathFilters } from "./types";
import type { ArtifactProvenance } from "../domain/models/artifact-provenance";

function handPathToDoc(path: HandPathData): Record<string, unknown> {
  const raw: Record<string, unknown> = {
    locations: path.locations,
    contentHash: path.contentHash,
    startLocation: path.startLocation,
    endLocation: path.endLocation,
    length: path.length,
    bigrams: path.bigrams,
    uniqueLocations: path.uniqueLocations,
    impliedGridMode: path.impliedGridMode,
    isClosed: path.isClosed,
  };

  if (path.name !== undefined) raw["name"] = path.name;
  if (path.author !== undefined) raw["author"] = path.author;
  if (path.notes !== undefined) raw["notes"] = path.notes;
  if (path.thumbnails !== undefined) raw["thumbnails"] = path.thumbnails;
  if (path.dateCreated !== undefined) raw["dateCreated"] = path.dateCreated;
  if (path.ownerId !== undefined) raw["ownerId"] = path.ownerId;
  if (path.ownerDisplayName !== undefined)
    raw["ownerDisplayName"] = path.ownerDisplayName;

  return raw;
}

function collectionPath(): string {
  const uid = requireAuth();
  return `users/${uid}/handPaths`;
}

export class HandPathRepository {
  async get(id: string): Promise<HandPathData | null> {
    return firestoreGet(
      collectionPath(),
      id,
      HandPathDataSchema
    ) as Promise<HandPathData | null>;
  }

  async getByHash(contentHash: string): Promise<HandPathData | null> {
    const results = await firestoreList(collectionPath(), HandPathDataSchema, {
      where: [{ field: "contentHash", op: "==", value: contentHash }],
      limit: 1,
    });
    return (results[0] as HandPathData | undefined) ?? null;
  }

  async list(filters?: HandPathFilters): Promise<HandPathData[]> {
    const clauses: WhereClause[] = [];

    if (filters?.startLocation !== undefined) {
      clauses.push({
        field: "startLocation",
        op: "==",
        value: filters.startLocation,
      });
    }
    if (filters?.endLocation !== undefined) {
      clauses.push({
        field: "endLocation",
        op: "==",
        value: filters.endLocation,
      });
    }
    if (filters?.impliedGridMode !== undefined) {
      clauses.push({
        field: "impliedGridMode",
        op: "==",
        value: filters.impliedGridMode,
      });
    }
    if (filters?.isClosed !== undefined) {
      clauses.push({ field: "isClosed", op: "==", value: filters.isClosed });
    }
    if (filters?.containsBigram !== undefined) {
      clauses.push({
        field: "bigrams",
        op: "array-contains",
        value: filters.containsBigram,
      });
    }
    if (filters?.minLength !== undefined) {
      clauses.push({ field: "length", op: ">=", value: filters.minLength });
    }
    if (filters?.maxLength !== undefined) {
      clauses.push({ field: "length", op: "<=", value: filters.maxLength });
    }

    return firestoreList(collectionPath(), HandPathDataSchema, {
      where: clauses.length > 0 ? clauses : undefined,
      limit: filters?.limit,
    }) as Promise<HandPathData[]>;
  }

  async save(
    path: HandPathData,
    provenance?: ArtifactProvenance,
    expectedOwnerId?: string
  ): Promise<void> {
    const firestore = await getFirestoreInstance();
    const uid = requireAuth();

    // Identity fence. `uid` is resolved from live auth HERE, after an await,
    // and it is the PATH this document is written to. A save's side effects
    // outlive the save: a guest whose sign-in collides with an existing
    // account would otherwise have these artifacts land in that account's
    // subtree before they ever consented to the import. Callers that know
    // which account the work belongs to pass it; the write is refused rather
    // than re-aimed.
    if (expectedOwnerId && expectedOwnerId !== uid) {
      throw new Error(
        "[HandPathRepository] The signed-in account changed before this write could be attributed."
      );
    }
    const docRef = doc(firestore, `users/${uid}/handPaths/${path.id}`);

    if (provenance) {
      const existing = await getDoc(docRef);

      if (existing.exists()) {
        await setDoc(
          docRef,
          {
            ...handPathToDoc(path),
            provenance: {
              sourceSequenceIds: arrayUnion(...provenance.sourceSequenceIds),
              isOriginal: provenance.isOriginal,
              firstSeenAt:
                existing.data()["provenance"]?.["firstSeenAt"] ??
                provenance.firstSeenAt,
            },
          },
          { merge: true }
        );
      } else {
        await setDoc(docRef, {
          ...handPathToDoc(path),
          provenance: {
            sourceSequenceIds: provenance.sourceSequenceIds,
            isOriginal: provenance.isOriginal,
            firstSeenAt: provenance.firstSeenAt,
          },
        });
      }
    } else {
      await setDoc(docRef, handPathToDoc(path));
    }
  }

  async delete(id: string): Promise<void> {
    const uid = requireAuth();
    await firestoreDelete(`users/${uid}/handPaths`, id);
  }
}

export const handPathRepository = new HandPathRepository();
