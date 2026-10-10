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
import type { HandPathData } from "../domain/models/hand-path-data";
import type { HandPathFilters } from "./types";
import type { ArtifactProvenance } from "../domain/models/artifact-provenance";

function toDateOrUndefined(value: unknown): Date | undefined {
  if (value == null) return undefined;
  if (typeof value === "object" && "toDate" in (value as object)) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (value instanceof Date) return value;
  return undefined;
}

function docToHandPath(data: DocumentData, id: string): HandPathData {
  return {
    id,
    locations: data["locations"] ?? [],
    contentHash: data["contentHash"] ?? "",
    startLocation: data["startLocation"],
    endLocation: data["endLocation"],
    length: data["length"] ?? 0,
    bigrams: data["bigrams"] ?? [],
    uniqueLocations: data["uniqueLocations"] ?? [],
    impliedGridMode: data["impliedGridMode"],
    isClosed: data["isClosed"] ?? false,
    name: data["name"] ?? undefined,
    author: data["author"] ?? undefined,
    notes: data["notes"] ?? undefined,
    thumbnails: data["thumbnails"] ?? undefined,
    dateCreated: toDateOrUndefined(data["dateCreated"]),
    ownerId: data["ownerId"] ?? undefined,
    ownerDisplayName: data["ownerDisplayName"] ?? undefined,
  } as HandPathData;
}

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
  if (path.ownerDisplayName !== undefined) raw["ownerDisplayName"] = path.ownerDisplayName;

  return raw;
}

function getUserId(): string {
  const uid = authState.effectiveUserId;
  if (!uid) throw new Error("[HandPathRepository] User not authenticated");
  return uid;
}

async function handPathCollectionRef() {
  const firestore = await getFirestoreInstance();
  const uid = getUserId();
  return collection(firestore, `users/${uid}/handPaths`);
}

export async function getHandPath(id: string): Promise<HandPathData | null> {
  const firestore = await getFirestoreInstance();
  const uid = getUserId();
  const docRef = doc(firestore, `users/${uid}/handPaths/${id}`);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return docToHandPath(snap.data(), snap.id);
}

export async function getHandPathByHash(contentHash: string): Promise<HandPathData | null> {
  const ref = await handPathCollectionRef();
  const q = query(ref, where("contentHash", "==", contentHash), firestoreLimit(1));
  const snap = await getDocs(q);
  if (snap.empty || snap.docs[0] === undefined) return null;
  const docSnap = snap.docs[0];
  return docToHandPath(docSnap.data(), docSnap.id);
}

export async function listHandPaths(filters?: HandPathFilters): Promise<HandPathData[]> {
  const ref = await handPathCollectionRef();
  let q = query(ref);

  if (filters?.startLocation !== undefined) {
    q = query(q, where("startLocation", "==", filters.startLocation));
  }
  if (filters?.endLocation !== undefined) {
    q = query(q, where("endLocation", "==", filters.endLocation));
  }
  if (filters?.impliedGridMode !== undefined) {
    q = query(q, where("impliedGridMode", "==", filters.impliedGridMode));
  }
  if (filters?.isClosed !== undefined) {
    q = query(q, where("isClosed", "==", filters.isClosed));
  }
  if (filters?.containsBigram !== undefined) {
    q = query(q, where("bigrams", "array-contains", filters.containsBigram));
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
  return snap.docs.map((d) => docToHandPath(d.data(), d.id));
}

export async function saveHandPath(path: HandPathData, provenance?: ArtifactProvenance): Promise<void> {
  const firestore = await getFirestoreInstance();
  const uid = getUserId();
  const docRef = doc(firestore, `users/${uid}/handPaths/${path.id}`);

  if (provenance) {
    const existing = await getDoc(docRef);

    if (existing.exists()) {
      await setDoc(docRef, {
        ...handPathToDoc(path),
        provenance: {
          sourceSequenceIds: arrayUnion(...provenance.sourceSequenceIds),
          isOriginal: provenance.isOriginal,
          firstSeenAt: existing.data()["provenance"]?.["firstSeenAt"] ?? provenance.firstSeenAt,
        },
      }, { merge: true });
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

export async function deleteHandPath(id: string): Promise<void> {
  const firestore = await getFirestoreInstance();
  const uid = getUserId();
  const docRef = doc(firestore, `users/${uid}/handPaths/${id}`);
  await deleteDoc(docRef);
}
