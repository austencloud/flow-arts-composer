import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  limit as firestoreLimit,
  arrayUnion,
  type DocumentData,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
import type { SoloPropData } from "../domain/models/solo-prop-data";
import type { SoloPropFilters } from "./types";
import type { ArtifactProvenance } from "../domain/models/artifact-provenance";

function toDateOrUndefined(value: unknown): Date | undefined {
  if (value == null) return undefined;
  if (typeof value === "object" && "toDate" in (value as object)) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (value instanceof Date) return value;
  return undefined;
}

function docToSoloProp(data: DocumentData, id: string): SoloPropData {
  return {
    id,
    steps: data["steps"] ?? [],
    startLocation: data["startLocation"],
    startOrientation: data["startOrientation"],
    contentHash: data["contentHash"] ?? "",
    handPath: data["handPath"],
    length: data["length"] ?? 0,
    bigrams: data["bigrams"] ?? [],
    impliedGridMode: data["impliedGridMode"],
    name: data["name"] ?? undefined,
    author: data["author"] ?? undefined,
    notes: data["notes"] ?? undefined,
    thumbnails: data["thumbnails"] ?? undefined,
    dateCreated: toDateOrUndefined(data["dateCreated"]),
    ownerId: data["ownerId"] ?? undefined,
    ownerDisplayName: data["ownerDisplayName"] ?? undefined,
  } as SoloPropData;
}

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

function getUserId(): string {
  const uid = authState.effectiveUserId;
  if (!uid) throw new Error("[SoloPropRepository] User not authenticated");
  return uid;
}

async function soloPropCollectionRef() {
  const firestore = await getFirestoreInstance();
  const uid = getUserId();
  return collection(firestore, `users/${uid}/soloProps`);
}

export async function getSoloProp(id: string): Promise<SoloPropData | null> {
  const firestore = await getFirestoreInstance();
  const uid = getUserId();
  const docRef = doc(firestore, `users/${uid}/soloProps/${id}`);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return docToSoloProp(snap.data(), snap.id);
}

export async function getSoloPropByHash(
  contentHash: string
): Promise<SoloPropData | null> {
  const ref = await soloPropCollectionRef();
  const q = query(
    ref,
    where("contentHash", "==", contentHash),
    firestoreLimit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty || snap.docs[0] === undefined) return null;
  const docSnap = snap.docs[0];
  return docToSoloProp(docSnap.data(), docSnap.id);
}

export async function listSoloProps(
  filters?: SoloPropFilters
): Promise<SoloPropData[]> {
  const ref = await soloPropCollectionRef();
  let q = query(ref);

  if (filters?.startLocation !== undefined) {
    q = query(q, where("startLocation", "==", filters.startLocation));
  }
  if (filters?.startOrientation !== undefined) {
    q = query(q, where("startOrientation", "==", filters.startOrientation));
  }
  if (filters?.impliedGridMode !== undefined) {
    q = query(q, where("impliedGridMode", "==", filters.impliedGridMode));
  }
  if (filters?.containsBigram !== undefined) {
    q = query(q, where("bigrams", "array-contains", filters.containsBigram));
  }
  if (filters?.pathHash !== undefined) {
    q = query(q, where("pathHash", "==", filters.pathHash));
  }
  if (filters?.minLength !== undefined) {
    q = query(q, where("length", ">=", filters.minLength));
  }
  if (filters?.maxLength !== undefined) {
    q = query(q, where("length", "<=", filters.maxLength));
  }
  if (filters?.limit !== undefined) {
    q = query(q, firestoreLimit(filters.limit));
  }

  const snap = await getDocs(q);
  return snap.docs.map((d) => docToSoloProp(d.data(), d.id));
}

export async function saveSoloProp(
  soloProp: SoloPropData,
  provenance?: ArtifactProvenance
): Promise<void> {
  const firestore = await getFirestoreInstance();
  const uid = getUserId();
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

export async function deleteSoloProp(id: string): Promise<void> {
  const firestore = await getFirestoreInstance();
  const uid = getUserId();
  const docRef = doc(firestore, `users/${uid}/soloProps/${id}`);
  await deleteDoc(docRef);
}
