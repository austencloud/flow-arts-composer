import { auth } from "#lib/shared/auth/firebase.js";
import {
  MediaCompositionPresetSchema,
  type MediaCompositionPreset,
} from "#lib/shared/media-composition/domain/media-composition-preset-schema.js";
import { db } from "#lib/shared/persistence/database/tka-database.js";
import {
  firestoreDelete,
  firestoreList,
  firestoreSet,
} from "#lib/shared/firestore/index.js";
import { z } from "zod";

const CloudMediaCompositionPresetSchema = z.preprocess((input) => {
  if (!input || typeof input !== "object") return input;
  const record = input as Record<string, unknown>;
  const updatedAt = record.updatedAt;
  if (
    updatedAt &&
    typeof updatedAt === "object" &&
    "toMillis" in updatedAt &&
    typeof updatedAt.toMillis === "function"
  ) {
    return { ...record, updatedAt: updatedAt.toMillis() };
  }
  return input;
}, MediaCompositionPresetSchema);

function cloudPath(ownerId: string): string {
  return `users/${ownerId}/mediaCompositionPresets`;
}

function canSync(ownerId: string): boolean {
  return auth.currentUser?.uid === ownerId && !auth.currentUser.isAnonymous;
}

function newestById(
  presets: readonly MediaCompositionPreset[]
): MediaCompositionPreset[] {
  const merged = new Map<string, MediaCompositionPreset>();
  for (const preset of presets) {
    const current = merged.get(preset.id);
    if (!current || preset.updatedAt > current.updatedAt) {
      merged.set(preset.id, preset);
    }
  }
  return [...merged.values()].sort(
    (left, right) => right.updatedAt - left.updatedAt
  );
}

/**
 * Loads local presets immediately and merges the signed-in owner's cloud copy.
 * Cloud failure never hides the local layouts the person already saved.
 */
export async function loadMediaCompositionPresets(
  ownerId: string
): Promise<MediaCompositionPreset[]> {
  const local = await db.mediaCompositionPresets
    .where("ownerId")
    .equals(ownerId)
    .toArray();
  if (!canSync(ownerId)) return newestById(local);

  try {
    const cloud = await firestoreList(
      cloudPath(ownerId),
      CloudMediaCompositionPresetSchema,
      { orderBy: [{ field: "updatedAt", direction: "desc" }] }
    );
    const merged = newestById([...local, ...cloud]);
    await db.mediaCompositionPresets.bulkPut(merged);
    return merged;
  } catch (error) {
    console.warn(
      "[MediaCompositionPresets] Cloud load failed; using local presets:",
      error
    );
    return newestById(local);
  }
}

/** Saves locally first, then syncs the same validated role-bound structure. */
export async function saveMediaCompositionPreset(
  input: MediaCompositionPreset
): Promise<MediaCompositionPreset> {
  const preset = MediaCompositionPresetSchema.parse(input);
  await db.mediaCompositionPresets.put(preset);

  if (canSync(preset.ownerId)) {
    void firestoreSet(
      cloudPath(preset.ownerId),
      preset.id,
      preset as unknown as Record<string, unknown>,
      { merge: false, trackOffline: true }
    ).catch((error) => {
      console.warn(
        "[MediaCompositionPresets] Cloud save failed; preset remains local:",
        error
      );
    });
  }

  return preset;
}

export async function deleteMediaCompositionPreset(
  ownerId: string,
  presetId: string
): Promise<void> {
  await db.mediaCompositionPresets.delete(presetId);
  if (!canSync(ownerId)) return;
  void firestoreDelete(cloudPath(ownerId), presetId, {
    trackOffline: true,
  }).catch((error) => {
    console.warn(
      "[MediaCompositionPresets] Cloud delete failed after local deletion:",
      error
    );
  });
}
