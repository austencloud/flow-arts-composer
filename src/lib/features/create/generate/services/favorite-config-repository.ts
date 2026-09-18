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

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

export async function loadPersonal(
  userId: string
): Promise<SavedGeneratorSetup[]> {
  const setupDocs = await firestoreList(
    setupsPath(userId),
    SavedGeneratorSetupSchema,
    { orderBy: [{ field: "createdAt" }] }
  );

  return setupDocs.map((setup) => ({
    id: setup.id,
    name: setup.name,
    config: normalizePersistedGenerationConfig(
      setup.config
    ) as UIGenerationConfig,
    startEndOptions: normalizePersistedStartEndOptions(
      (setup.startEndOptions ?? null) as StartEndOptions | null
    ),
    createdAt: setup.createdAt ?? new Date(),
    updatedAt: setup.updatedAt ?? new Date(),
  }));
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

  const rows: Array<{
    ownerId: string;
    setupId: string;
    data: Record<string, unknown>;
  }> = [];
  for (const docSnap of snapshot.docs) {
    const ownerId = docSnap.ref.parent.parent?.id;
    if (!ownerId) continue;
    rows.push({
      ownerId,
      setupId: docSnap.id,
      data: docSnap.data() as Record<string, unknown>,
    });
  }

  const owners = await getVisibleOwnerProfiles(
    rows.map((row) => row.ownerId)
  );

  const results: CommunitySetup[] = [];
  for (const row of rows) {
    const owner = owners.get(row.ownerId);
    if (!owner) continue;
    results.push({
      setupId: row.setupId,
      userId: row.ownerId,
      displayName: owner.displayName,
      avatar: owner.photoURL,
      name: typeof row.data.name === "string" ? row.data.name : "Setup",
      config: normalizePersistedGenerationConfig(
        row.data.config ?? {}
      ) as UIGenerationConfig,
      startEndOptions: normalizePersistedStartEndOptions(
        (row.data.startEndOptions ?? null) as StartEndOptions | null
      ),
      createdAt: toDate(row.data.createdAt) ?? new Date(),
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
      config: draft.config as unknown as Record<string, unknown>,
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
  await firestoreSet(
    setupsPath(userId),
    setup.id,
    {
      config: setup.config as unknown as Record<string, unknown>,
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
