import { doc, getDoc, setDoc, arrayUnion } from "firebase/firestore";
import { getFirestoreInstance } from "$lib/shared/auth/firebase";
import {
  firestoreGet,
  firestoreList,
  firestoreDelete,
  requireAuth,
  type WhereClause,
} from "$lib/shared/firestore";
import { SoloPropDataSchema } from "../domain/models/solo-prop-schemas";
import type { SoloPropData } from "../domain/models/solo-prop-data";
import type { SoloPropFilters } from "./types";
import type { ArtifactProvenance } from "../domain/models/artifact-provenance";

function soloPropToDoc(soloProp: SoloPropData): Record<string, unknown> {
  const raw: Record<string, unknown> = {
    steps: soloProp.steps,
    startLocation: soloProp.startLocation,
    startOrientation: soloProp.startOrientation,
    contentHash: soloProp.contentHash,
    handPath: soloProp.handPath,
    pathHash: soloProp.handPath.contentHash,
    length: soloProp.length,
    bigrams: soloProp.bigrams,
    impliedGridMode: soloProp.impliedGridMode,
  };

  if (soloProp.name !== undefined) raw["name"] = soloProp.name;
  if (soloProp.authoredHand !== undefined)
    raw["authoredHand"] = soloProp.authoredHand;
  if (soloProp.author !== undefined) raw["author"] = soloProp.author;
  if (soloProp.notes !== undefined) raw["notes"] = soloProp.notes;
  if (soloProp.thumbnails !== undefined)
    raw["thumbnails"] = soloProp.thumbnails;
  if (soloProp.dateCreated !== undefined)
    raw["dateCreated"] = soloProp.dateCreated;
  if (soloProp.ownerId !== undefined) raw["ownerId"] = soloProp.ownerId;
  if (soloProp.ownerDisplayName !== undefined)
    raw["ownerDisplayName"] = soloProp.ownerDisplayName;

  return raw;
}

function collectionPath(): string {
  const uid = requireAuth();
  return `users/${uid}/soloProps`;
}

export class SoloPropRepository {
  async get(id: string): Promise<SoloPropData | null> {
    // Schema uses z.string() for enum fields (GridLocation, Orientation, GridMode) to avoid
    // coupling Zod to domain union types. The values are runtime-valid strings; the cast is safe.
    return firestoreGet(
      collectionPath(),
      id,
      SoloPropDataSchema
    ) as unknown as Promise<SoloPropData | null>;
  }

  async getByHash(contentHash: string): Promise<SoloPropData | null> {
    const results = await firestoreList(collectionPath(), SoloPropDataSchema, {
      where: [{ field: "contentHash", op: "==", value: contentHash }],
      limit: 1,
    });
    // Same schema/domain divergence as get() — string-typed schema fields bridge to enum-typed domain fields.
    return (results[0] as unknown as SoloPropData | undefined) ?? null;
  }

  async list(filters?: SoloPropFilters): Promise<SoloPropData[]> {
    const clauses: WhereClause[] = [];

    if (filters?.startLocation !== undefined) {
      clauses.push({
        field: "startLocation",
        op: "==",
        value: filters.startLocation,
      });
    }
    if (filters?.startOrientation !== undefined) {
      clauses.push({
        field: "startOrientation",
        op: "==",
        value: filters.startOrientation,
      });
    }
    if (filters?.impliedGridMode !== undefined) {
      clauses.push({
        field: "impliedGridMode",
        op: "==",
        value: filters.impliedGridMode,
      });
    }
    if (filters?.containsBigram !== undefined) {
      clauses.push({
        field: "bigrams",
        op: "array-contains",
        value: filters.containsBigram,
      });
    }
    if (filters?.pathHash !== undefined) {
      clauses.push({ field: "pathHash", op: "==", value: filters.pathHash });
    }
    if (filters?.minLength !== undefined) {
      clauses.push({ field: "length", op: ">=", value: filters.minLength });
    }
    if (filters?.maxLength !== undefined) {
      clauses.push({ field: "length", op: "<=", value: filters.maxLength });
    }

    // Same schema/domain divergence as get() — string-typed schema fields bridge to enum-typed domain fields.
    return firestoreList(collectionPath(), SoloPropDataSchema, {
      where: clauses.length > 0 ? clauses : undefined,
      limit: filters?.limit,
    }) as unknown as Promise<SoloPropData[]>;
  }

  async save(
    soloProp: SoloPropData,
    provenance?: ArtifactProvenance,
    expectedOwnerId?: string
  ): Promise<void> {
    const firestore = await getFirestoreInstance();
    const uid = requireAuth();

    // Identity fence — see HandPathRepository.save for the reasoning. `uid` is
    // the PATH this artifact is written to, resolved from live auth after an
    // await, so an account change between the save and this side effect would
    // silently redirect it into the new account's subtree.
    if (expectedOwnerId && expectedOwnerId !== uid) {
      throw new Error(
        "[SoloPropRepository] The signed-in account changed before this write could be attributed."
      );
    }

    const docRef = doc(firestore, `users/${uid}/soloProps/${soloProp.id}`);

    if (provenance) {
      const existing = await getDoc(docRef);

      if (existing.exists()) {
        await setDoc(
          docRef,
          {
            ...soloPropToDoc(soloProp),
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
          ...soloPropToDoc(soloProp),
          provenance: {
            sourceSequenceIds: provenance.sourceSequenceIds,
            isOriginal: provenance.isOriginal,
            firstSeenAt: provenance.firstSeenAt,
          },
        });
      }
    } else {
      await setDoc(docRef, soloPropToDoc(soloProp));
    }
  }

  async delete(id: string): Promise<void> {
    const uid = requireAuth();
    await firestoreDelete(`users/${uid}/soloProps`, id);
  }
}

export const soloPropRepository = new SoloPropRepository();
