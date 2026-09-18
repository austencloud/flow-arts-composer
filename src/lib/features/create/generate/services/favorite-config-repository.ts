import {
  collectionGroup,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { getFirestoreInstance } from "$lib/shared/auth/firebase";
import {
  firestoreDelete,
  firestoreList,
  firestoreSet,
} from "$lib/shared/firestore";
import { getVisibleOwnerProfiles } from "$lib/shared/community/services/user-repository";
import { SavedGeneratorSetupSchema } from "../domain/models/favorite-config-schemas";
import type { SavedGeneratorSetupDoc } from "../domain/models/favorite-config-schemas";
import type {
  CommunitySetup,
  SavedGeneratorSetup,
  SavedSetupDraft,
} from "../domain/models/favorite-config";
import type { UIGenerationConfig } from "../state/generate-config.svelte";
import type { StartEndOptions } from "$lib/shared/create/state/panel-coordination-state.svelte";
import {
  normalizePersistedGenerationConfig,
  normalizePersistedStartEndOptions,
} from "../domain/generator-persistence-normalizer";

const SETUPS_GROUP = "generatorSetups";
const SETUP_REPOSITORY_NAME = "favorites";

const setupsPath = (userId: string) => `users/${userId}/${SETUPS_GROUP}`;

export interface GeneratorSetupRepository {
  loadPersonal(userId: string): Promise<SavedGeneratorSetup[]>;
  loadCommunity(limit?: number): Promise<CommunitySetup[]>;
  createSetup(
    userId: string,
    draft: SavedSetupDraft
  ): Promise<SavedGeneratorSetup>;
  renameSetup(userId: string, setupId: string, name: string): Promise<void>;
  updateSetup(userId: string, setup: SavedGeneratorSetup): Promise<void>;
  deleteSetup(userId: string, setupId: string): Promise<void>;
}

/** Normalizes one parsed setup doc into the shape callers work with. */
function toSavedSetup(doc: SavedGeneratorSetupDoc): SavedGeneratorSetup {
  return {
    id: doc.id,
    name: doc.name,
    config: normalizePersistedGenerationConfig(
      doc.config
    ) as UIGenerationConfig,
    startEndOptions: normalizePersistedStartEndOptions(
      (doc.startEndOptions ?? null) as StartEndOptions | null
    ),
    createdAt: doc.createdAt ?? new Date(),
    updatedAt: doc.updatedAt ?? new Date(),
  };
}

export async function loadPersonal(
  userId: string
): Promise<SavedGeneratorSetup[]> {
  const setupDocs = await firestoreList(
    setupsPath(userId),
    SavedGeneratorSetupSchema,
    { orderBy: [{ field: "createdAt" }] }
  );

  return setupDocs.map(toSavedSetup);
}

/**
 * Newest public setups across every account. The owner is the parent user
 * doc in the path, never a field on the setup. Owners the community may not
 * see (hidden, guest, legacy profile, deleted) drop out with their setups.
 */
export async function loadCommunity(
  limitCount = 20
): Promise<CommunitySetup[]> {
  const db = await getFirestoreInstance();
  const snapshot = await getDocs(
    query(
      collectionGroup(db, SETUPS_GROUP),
      where("isPublic", "==", true),
      orderBy("createdAt", "desc"),
      limit(limitCount)
    )
  );

  const rows: Array<{ ownerId: string; setup: SavedGeneratorSetupDoc }> = [];
  for (const docSnap of snapshot.docs) {
    const ownerId = docSnap.ref.parent.parent?.id;
    if (!ownerId) continue;

    const parsed = SavedGeneratorSetupSchema.safeParse({
      id: docSnap.id,
      ...docSnap.data(),
    });
    if (!parsed.success) {
      console.warn(
        "[favorite-config-repository] skipping malformed community setup",
        docSnap.ref.path,
        parsed.error.issues
      );
      continue;
    }

    rows.push({ ownerId, setup: parsed.data });
  }

  const owners = await getVisibleOwnerProfiles(
    rows.map((row) => row.ownerId)
  );

  const results: CommunitySetup[] = [];
  for (const row of rows) {
    const owner = owners.get(row.ownerId);
    if (!owner) continue;
    const setup = toSavedSetup(row.setup);
    results.push({
      setupId: setup.id,
      userId: row.ownerId,
      displayName: owner.displayName,
      avatar: owner.photoURL,
      name: setup.name,
      config: setup.config,
      startEndOptions: setup.startEndOptions,
      createdAt: setup.createdAt,
    });
  }

  return results;
}

export async function createSetup(
  userId: string,
  draft: SavedSetupDraft
): Promise<SavedGeneratorSetup> {
  const id = await firestoreSet(
    setupsPath(userId),
    null,
    {
      name: draft.name,
      config: draft.config,
      startEndOptions: draft.startEndOptions,
      isPublic: true,
    },
    {
      trackOffline: true,
      repoName: SETUP_REPOSITORY_NAME,
    }
  );
  const now = new Date();

  return {
    id,
    name: draft.name,
    config: draft.config,
    startEndOptions: draft.startEndOptions,
    createdAt: now,
    updatedAt: now,
  };
}

export async function renameSetup(
  userId: string,
  setupId: string,
  name: string
): Promise<void> {
  await firestoreSet(
    setupsPath(userId),
    setupId,
    { name, isPublic: true },
    {
      merge: true,
      trackOffline: true,
      repoName: SETUP_REPOSITORY_NAME,
    }
  );
}

export async function updateSetup(
  userId: string,
  setup: SavedGeneratorSetup
): Promise<void> {
  // Merge writes rely on the caller supplying the full config and
  // startEndOptions shape; read-side normalization drops retired keys.
  await firestoreSet(
    setupsPath(userId),
    setup.id,
    {
      config: setup.config,
      startEndOptions: setup.startEndOptions,
      isPublic: true,
    },
    {
      merge: true,
      trackOffline: true,
      repoName: SETUP_REPOSITORY_NAME,
    }
  );
}

export async function deleteSetup(
  userId: string,
  setupId: string
): Promise<void> {
  await firestoreDelete(setupsPath(userId), setupId, {
    trackOffline: true,
    repoName: SETUP_REPOSITORY_NAME,
  });
}

export const generatorSetupRepository: GeneratorSetupRepository = {
  loadPersonal,
  loadCommunity,
  createSetup,
  renameSetup,
  updateSetup,
  deleteSetup,
};
