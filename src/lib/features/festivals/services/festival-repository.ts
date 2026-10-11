/**
 * festival-repository
 *
 * Basic CRUD for festival documents in Firestore.
 * Festivals live at festivals/{festivalId}.
 */

import { firestoreGet, firestoreSet, firestoreDelete } from "#lib/shared/firestore/index.js";
import { FestivalSchema } from "../domain/models/festival-schemas";
import type { Festival } from "../domain/models/festival";

const COLLECTION = "festivals";

export async function getById(id: string): Promise<Festival | null> {
  return firestoreGet(COLLECTION, id, FestivalSchema) as Promise<Festival | null>;
}

export async function create(festival: Omit<Festival, "id">): Promise<string> {
  return firestoreSet(COLLECTION, null, festival as Record<string, unknown>);
}

export async function update(id: string, data: Partial<Festival>): Promise<void> {
  await firestoreSet(COLLECTION, id, data as Record<string, unknown>, { merge: true });
}

export async function deleteFestival(id: string): Promise<void> {
  await firestoreDelete(COLLECTION, id);
}
