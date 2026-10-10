/**
 * Personal Museum repository.
 *
 * One Firestore doc per user: users/{uid}/personal-museum/main.
 * Pure mutation helpers (applyAssign/applyClear) hold the logic and are unit
 * tested; the async methods wrap them with Firestore I/O.
 */

import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { getPersonalMuseumDocPath } from "#lib/shared/library/data/firestore-paths.js";
import { getEffectiveUserId } from "#lib/shared/auth/state/auth-state.svelte.js";
import {
  emptyPersonalMuseumDoc,
  type PersonalMuseumDoc,
} from "../domain/personal-museum-types";

// ── Pure mutation helpers (unit tested) ──

export function applyAssign(
  docData: PersonalMuseumDoc,
  slotId: string,
  sequenceId: string,
  now: number,
): PersonalMuseumDoc {
  return {
    ...docData,
    updatedAt: now,
    placements: {
      ...docData.placements,
      [slotId]: { sequenceId, assignedAt: now },
    },
  };
}

export function applyClear(
  docData: PersonalMuseumDoc,
  slotId: string,
  now: number,
): PersonalMuseumDoc {
  const placements = { ...docData.placements };
  delete placements[slotId];
  return { ...docData, updatedAt: now, placements };
}

// ── Firestore I/O ──

function requireUserId(): string {
  const uid = getEffectiveUserId();
  if (!uid) throw new Error("personal-museum: not authenticated");
  return uid;
}

/** Read the user's doc, returning a fresh empty doc if none exists yet. */
export async function loadPersonalMuseum(): Promise<PersonalMuseumDoc> {
  const uid = requireUserId();
  const firestore = await getFirestoreInstance();
  const ref = doc(firestore, getPersonalMuseumDocPath(uid));
  const snap = await getDoc(ref);
  if (!snap.exists()) return emptyPersonalMuseumDoc(uid, Date.now());
  return snap.data() as PersonalMuseumDoc;
}

/** Persist the full doc (we own it; small doc). */
async function writePersonalMuseum(docData: PersonalMuseumDoc): Promise<void> {
  const uid = requireUserId();
  const firestore = await getFirestoreInstance();
  const ref = doc(firestore, getPersonalMuseumDocPath(uid));
  await setDoc(ref, { ...docData, ownerId: uid, updatedAt: serverTimestamp() });
}

export async function assignPlacement(
  current: PersonalMuseumDoc,
  slotId: string,
  sequenceId: string,
): Promise<PersonalMuseumDoc> {
  const next = applyAssign(current, slotId, sequenceId, Date.now());
  await writePersonalMuseum(next);
  return next;
}

export async function clearPlacement(
  current: PersonalMuseumDoc,
  slotId: string,
): Promise<PersonalMuseumDoc> {
  const next = applyClear(current, slotId, Date.now());
  await writePersonalMuseum(next);
  return next;
}

/** Subscribe to live changes; returns an unsubscribe fn. */
export async function subscribePersonalMuseum(
  onChange: (docData: PersonalMuseumDoc) => void,
): Promise<() => void> {
  const uid = requireUserId();
  const firestore = await getFirestoreInstance();
  const ref = doc(firestore, getPersonalMuseumDocPath(uid));
  return onSnapshot(ref, (snap) => {
    onChange(
      snap.exists()
        ? (snap.data() as PersonalMuseumDoc)
        : emptyPersonalMuseumDoc(uid, Date.now()),
    );
  });
}
