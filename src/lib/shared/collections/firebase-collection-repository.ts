import type { CollectionEntry } from "./collection-entry";

/** Structural match for firestore-crud's (unexported) SchemaLike — any zod
 *  schema satisfies it. */
interface SchemaLike<T> {
  safeParse(
    data: unknown,
  ): { success: true; data: T } | { success: false; error: { issues: unknown[] } };
}

export interface FirebaseCollectionRepository<T extends CollectionEntry> {
  load(userId: string): Promise<T[]>;
  save(userId: string, entry: T): Promise<void>;
  remove(userId: string, entryId: string): Promise<void>;
  /** Persist regenerated presentation material without changing the artifact's
   * authored-content lifecycle. Only repositories that can enforce this may
   * implement it. */
  savePresentation?(userId: string, entry: T): Promise<void>;
}

/**
 * Firestore CRUD for a per-user saved-artifact collection living at
 * `users/{uid}/{collectionName}`. Entries are validated against the feature's
 * zod schema on load; the `id` field is the doc id (stripped on write).
 *
 * Firestore loads with the first call, not with this module: the 3D scene
 * controls build their collection state on public pages, and a visitor who
 * never saves or signs in should not download Firebase for it.
 */
export function createFirebaseCollectionRepository<T extends CollectionEntry>(
  collectionName: string,
  // unknown-typed on purpose: zod's inferred output for a feature schema is
  // structurally looser than the feature's declared interface (optional fields,
  // z.any camera). The load() cast below mirrors what each per-feature repo did.
  schema: SchemaLike<unknown>,
): FirebaseCollectionRepository<T> {
  const pathFor = (userId: string) => `users/${userId}/${collectionName}`;
  const crud = () => import("#lib/shared/firestore/firestore-crud.js");

  return {
    async load(userId: string): Promise<T[]> {
      const { firestoreList } = await crud();
      const results = await firestoreList(pathFor(userId), schema, {
        orderBy: [{ field: "createdAt", direction: "desc" }],
      });
      return results as T[];
    },

    async save(userId: string, entry: T): Promise<void> {
      const { id, ...data } = entry;
      const { firestoreSet } = await crud();
      await firestoreSet(pathFor(userId), id, data as Record<string, unknown>);
    },

    async remove(userId: string, entryId: string): Promise<void> {
      const { firestoreDelete } = await crud();
      await firestoreDelete(pathFor(userId), entryId);
    },
  };
}
