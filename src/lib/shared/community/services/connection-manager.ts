/**
 * Manages user-to-user connection data:
 * - Private notes about other users
 * - Mutual follow status with timestamps
 * - Shared sequences (matching canonical signatures)
 *
 * Data stored at: users/{myId}/connections/{theirId}
 */

import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  limit as firestoreLimit,
} from "firebase/firestore";
import type { Timestamp, DocumentData } from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
import type {
  ConnectionInfo,
  MutualFollowInfo,
  SharedSequenceSummary,
  ConnectionDocument,
} from "./types";

const USERS_COLLECTION = "users";
const CONNECTIONS_SUBCOLLECTION = "connections";
const SEQUENCES_SUBCOLLECTION = "sequences";
const FOLLOWING_SUBCOLLECTION = "following";

interface FollowDocument {
  createdAt: Timestamp;
}

interface SequenceWithSignature {
  id: string;
  name: string;
  word: string;
  canonicalSignature?: string;
  thumbnails?: string[];
}

function getCurrentUserId(): string {
  const userId = authState.user?.uid;
  if (!userId) throw new Error("Must be authenticated to manage connections");
  return userId;
}

async function getNotesMetadata(
  targetUserId: string,
): Promise<{ createdAt?: Date; updatedAt?: Date } | null> {
  const currentUserId = getCurrentUserId();

  try {
    const firestore = await getFirestoreInstance();
    const connectionRef = doc(
      firestore,
      `${USERS_COLLECTION}/${currentUserId}/${CONNECTIONS_SUBCOLLECTION}/${targetUserId}`,
    );

    const connectionDoc = await getDoc(connectionRef);
    if (!connectionDoc.exists()) return null;

    const data = connectionDoc.data() as ConnectionDocument;
    return {
      createdAt: data.createdAt?.toDate(),
      updatedAt: data.updatedAt?.toDate(),
    };
  } catch (error) {
    console.error("[connection-manager] Error getting notes metadata:", error);
    toast.error("Failed to load connection info. Please try again.");
    return null;
  }
}

export async function getNotes(targetUserId: string): Promise<string> {
  const currentUserId = getCurrentUserId();
  if (currentUserId === targetUserId) return "";

  try {
    const firestore = await getFirestoreInstance();
    const connectionRef = doc(
      firestore,
      `${USERS_COLLECTION}/${currentUserId}/${CONNECTIONS_SUBCOLLECTION}/${targetUserId}`,
    );

    const connectionDoc = await getDoc(connectionRef);
    if (!connectionDoc.exists()) return "";

    const data = connectionDoc.data() as ConnectionDocument;
    return data.notes ?? "";
  } catch (error) {
    console.error("[connection-manager] Error getting notes:", error);
    return "";
  }
}

export async function saveNotes(targetUserId: string, notes: string): Promise<void> {
  const currentUserId = getCurrentUserId();
  if (currentUserId === targetUserId) throw new Error("Cannot save notes about yourself");

  try {
    const firestore = await getFirestoreInstance();
    const connectionRef = doc(
      firestore,
      `${USERS_COLLECTION}/${currentUserId}/${CONNECTIONS_SUBCOLLECTION}/${targetUserId}`,
    );

    const existingDoc = await getDoc(connectionRef);

    if (existingDoc.exists()) {
      await setDoc(connectionRef, { notes: notes.trim(), updatedAt: serverTimestamp() }, { merge: true });
    } else {
      await setDoc(connectionRef, {
        notes: notes.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.error("[connection-manager] Error saving notes:", error);
    throw new Error("Failed to save notes");
  }
}

export async function getMutualFollowInfo(targetUserId: string): Promise<MutualFollowInfo> {
  const currentUserId = getCurrentUserId();

  if (currentUserId === targetUserId) {
    return { isMutual: false, iFollowThem: false, theyFollowMe: false };
  }

  try {
    const firestore = await getFirestoreInstance();

    const iFollowThemRef = doc(
      firestore,
      `${USERS_COLLECTION}/${currentUserId}/${FOLLOWING_SUBCOLLECTION}/${targetUserId}`,
    );
    const theyFollowMeRef = doc(
      firestore,
      `${USERS_COLLECTION}/${targetUserId}/${FOLLOWING_SUBCOLLECTION}/${currentUserId}`,
    );

    const [iFollowThemDoc, theyFollowMeDoc] = await Promise.all([
      getDoc(iFollowThemRef),
      getDoc(theyFollowMeRef),
    ]);

    const iFollowThem = iFollowThemDoc.exists();
    const theyFollowMe = theyFollowMeDoc.exists();
    const isMutual = iFollowThem && theyFollowMe;

    const iFollowedAt = iFollowThem
      ? (iFollowThemDoc.data() as FollowDocument)?.createdAt?.toDate()
      : undefined;
    const theyFollowedAt = theyFollowMe
      ? (theyFollowMeDoc.data() as FollowDocument)?.createdAt?.toDate()
      : undefined;

    let mutualSince: Date | undefined;
    if (isMutual && iFollowedAt && theyFollowedAt) {
      mutualSince = iFollowedAt > theyFollowedAt ? iFollowedAt : theyFollowedAt;
    }

    return { isMutual, iFollowThem, theyFollowMe, mutualSince, iFollowedAt, theyFollowedAt };
  } catch (error) {
    console.error("[connection-manager] Error getting follow info:", error);
    toast.error("Failed to load follow info. Please try again.");
    return { isMutual: false, iFollowThem: false, theyFollowMe: false };
  }
}

export async function getSharedSequences(
  targetUserId: string,
  limit = 10,
): Promise<SharedSequenceSummary[]> {
  const currentUserId = getCurrentUserId();
  if (currentUserId === targetUserId) return [];

  try {
    const firestore = await getFirestoreInstance();

    const mySequencesRef = collection(
      firestore,
      `${USERS_COLLECTION}/${currentUserId}/${SEQUENCES_SUBCOLLECTION}`,
    );
    const myQuery = query(
      mySequencesRef,
      where("canonicalSignature", "!=", null),
      firestoreLimit(200),
    );

    const theirSequencesRef = collection(
      firestore,
      `${USERS_COLLECTION}/${targetUserId}/${SEQUENCES_SUBCOLLECTION}`,
    );
    const theirQuery = query(
      theirSequencesRef,
      where("visibility", "==", "public"),
      where("canonicalSignature", "!=", null),
      firestoreLimit(200),
    );

    const [mySnapshot, theirSnapshot] = await Promise.all([getDocs(myQuery), getDocs(theirQuery)]);

    const theirSignatureMap = new Map<string, SequenceWithSignature>();
    for (const docSnap of theirSnapshot.docs) {
      const data = docSnap.data() as DocumentData;
      if (data.canonicalSignature) {
        theirSignatureMap.set(data.canonicalSignature, {
          id: docSnap.id,
          name: data.name ?? data.word ?? "Untitled",
          word: data.word ?? "",
          canonicalSignature: data.canonicalSignature,
          thumbnails: data.thumbnails,
        });
      }
    }

    const sharedSequences: SharedSequenceSummary[] = [];
    for (const docSnap of mySnapshot.docs) {
      const myData = docSnap.data() as DocumentData;
      const signature = myData.canonicalSignature;

      if (signature && theirSignatureMap.has(signature)) {
        const theirSeq = theirSignatureMap.get(signature)!;

        sharedSequences.push({
          canonicalSignature: signature,
          mySequence: {
            id: docSnap.id,
            name: myData.name ?? myData.word ?? "Untitled",
            word: myData.word ?? "",
            thumbnailUrl: myData.thumbnails?.[0],
          },
          theirSequence: {
            id: theirSeq.id,
            name: theirSeq.name,
            word: theirSeq.word,
            thumbnailUrl: theirSeq.thumbnails?.[0],
          },
        });

        if (sharedSequences.length >= limit) break;
      }
    }

    return sharedSequences;
  } catch (error) {
    console.error("[connection-manager] Error getting shared sequences:", error);
    toast.error("Failed to load shared sequences. Please try again.");
    return [];
  }
}

export async function getConnectionInfo(targetUserId: string): Promise<ConnectionInfo> {
  const currentUserId = getCurrentUserId();
  if (currentUserId === targetUserId) throw new Error("Cannot get connection info for yourself");

  const [notes, notesMetadata, mutualFollow, sharedSequences] = await Promise.all([
    getNotes(targetUserId),
    getNotesMetadata(targetUserId),
    getMutualFollowInfo(targetUserId),
    getSharedSequences(targetUserId, 10),
  ]);

  return {
    notes,
    notesCreatedAt: notesMetadata?.createdAt,
    notesUpdatedAt: notesMetadata?.updatedAt,
    mutualFollow,
    sharedSequences,
    sharedSequenceCount: sharedSequences.length,
  };
}
