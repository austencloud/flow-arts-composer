import {
  getFunctionsInstance,
  getFirestoreInstance,
} from "#lib/shared/auth/firebase.js";
import type {
  CollectionAccessRole,
  CollectionShareGrant,
} from "#lib/shared/library/domain/models/collection.js";
import {
  mapDocToCollection,
  mapDocToSequence,
  toDate,
} from "#lib/shared/library/services/collection-firestore-mapper.js";
import { httpsCallable } from "firebase/functions";
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import type {
  CollectionShareAccessItem,
  CollectionShareRecipient,
  ICollectionCollaborationManager,
  ReceivedCollectionItem,
  ShareCollectionRequest,
  SharedCollectionMutation,
} from "../contracts/ICollectionCollaborationManager";
import type { LibrarySequence } from "#lib/shared/library/domain/models/library-sequence.js";

interface ShareCollectionResult {
  collectionId: string;
  recipientId: string;
  role: CollectionAccessRole;
}

interface LoadedMember {
  id: string;
  data: DocumentData;
}

interface LoadMembersResult {
  sequences: LoadedMember[];
}

function mapGrant(
  snapshot: DocumentSnapshot<DocumentData>
): CollectionShareGrant {
  const data = snapshot.data() ?? {};
  return {
    ownerId: data["ownerId"] ?? "",
    collectionId: data["collectionId"] ?? "",
    recipientId: data["recipientId"] ?? snapshot.id,
    role: data["role"] === "editor" ? "editor" : "viewer",
    grantedBy: data["grantedBy"] ?? data["ownerId"] ?? "",
    createdAt: toDate(data["createdAt"]),
    updatedAt: toDate(data["updatedAt"]),
  };
}

async function loadUserSummary(
  userId: string
): Promise<CollectionShareRecipient> {
  const firestore = await getFirestoreInstance();
  const snapshot = await getDoc(doc(firestore, "users", userId));
  const data = snapshot.data() ?? {};
  return {
    id: userId,
    displayName:
      data["displayName"] ?? data["username"] ?? `User ${userId.slice(0, 8)}`,
    ...(typeof data["photoURL"] === "string" && { avatar: data["photoURL"] }),
  };
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export class CollectionCollaborationManager implements ICollectionCollaborationManager {
  async share(request: ShareCollectionRequest): Promise<void> {
    const functions = await getFunctionsInstance();
    const callable = httpsCallable<
      ShareCollectionRequest & { messageId: string },
      ShareCollectionResult
    >(functions, "shareCollection");
    await callable({ ...request, messageId: crypto.randomUUID() });
  }

  async setRole(
    ownerId: string,
    collectionId: string,
    recipientId: string,
    role: CollectionAccessRole
  ): Promise<void> {
    const functions = await getFunctionsInstance();
    const callable = httpsCallable(functions, "updateCollectionShare");
    await callable({
      ownerId,
      collectionId,
      recipientId,
      operation: "set-role",
      role,
    });
  }

  async removeAccess(
    ownerId: string,
    collectionId: string,
    recipientId: string
  ): Promise<void> {
    const functions = await getFunctionsInstance();
    const callable = httpsCallable(functions, "updateCollectionShare");
    await callable({
      ownerId,
      collectionId,
      recipientId,
      operation: "remove",
    });
  }

  async mutate(
    ownerId: string,
    collectionId: string,
    mutation: SharedCollectionMutation
  ): Promise<void> {
    const functions = await getFunctionsInstance();
    const callable = httpsCallable(functions, "mutateSharedCollection");
    await callable({ ownerId, collectionId, mutation });
  }

  async loadMembers(
    ownerId: string,
    collectionId: string
  ): Promise<LibrarySequence[]> {
    const functions = await getFunctionsInstance();
    const callable = httpsCallable<
      { ownerId: string; collectionId: string },
      LoadMembersResult
    >(functions, "loadSharedCollectionMembers");
    const result = await callable({ ownerId, collectionId });
    return result.data.sequences.map((entry) =>
      mapDocToSequence(entry.data, entry.id)
    );
  }

  subscribeToAccessList(
    ownerId: string,
    collectionId: string,
    callback: (items: CollectionShareAccessItem[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    let unsubscribe: Unsubscribe | null = null;
    let cancelled = false;

    void getFirestoreInstance()
      .then((firestore) => {
        if (cancelled) return;
        const shares = collection(
          firestore,
          `users/${ownerId}/collections/${collectionId}/shares`
        );
        unsubscribe = onSnapshot(
          shares,
          (snapshot) => {
            void Promise.all(
              snapshot.docs.map(async (shareSnapshot) => ({
                grant: mapGrant(shareSnapshot),
                recipient: await loadUserSummary(shareSnapshot.id),
              }))
            )
              .then((items) => {
                if (!cancelled) callback(items);
              })
              .catch((error) => onError?.(asError(error)));
          },
          (error) => onError?.(asError(error))
        );
      })
      .catch((error) => onError?.(asError(error)));

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }

  subscribeToGrant(
    ownerId: string,
    collectionId: string,
    recipientId: string,
    callback: (grant: CollectionShareGrant | null) => void,
    onError?: (error: Error) => void
  ): () => void {
    let unsubscribe: Unsubscribe | null = null;
    let cancelled = false;

    void getFirestoreInstance()
      .then((firestore) => {
        if (cancelled) return;
        unsubscribe = onSnapshot(
          doc(
            firestore,
            `users/${ownerId}/collections/${collectionId}/shares/${recipientId}`
          ),
          (snapshot) => {
            if (!cancelled) {
              callback(snapshot.exists() ? mapGrant(snapshot) : null);
            }
          },
          (error) => onError?.(asError(error))
        );
      })
      .catch((error) => onError?.(asError(error)));

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }

  subscribeToReceivedCollections(
    recipientId: string,
    callback: (items: ReceivedCollectionItem[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    let grantsUnsubscribe: Unsubscribe | null = null;
    const collectionUnsubscribes = new Map<string, Unsubscribe>();
    const grants = new Map<string, CollectionShareGrant>();
    const collections = new Map<string, ReceivedCollectionItem>();
    let cancelled = false;

    const emit = () => {
      if (cancelled) return;
      callback(
        [...collections.values()].sort(
          (a, b) => b.grant.updatedAt.getTime() - a.grant.updatedAt.getTime()
        )
      );
    };

    void getFirestoreInstance()
      .then((firestore) => {
        if (cancelled) return;
        const sharesQuery = query(
          collectionGroup(firestore, "shares"),
          where("recipientId", "==", recipientId)
        );
        grantsUnsubscribe = onSnapshot(
          sharesQuery,
          (snapshot) => {
            const liveKeys = new Set<string>();
            for (const shareSnapshot of snapshot.docs) {
              const grant = mapGrant(shareSnapshot);
              const key = `${grant.ownerId}:${grant.collectionId}`;
              liveKeys.add(key);
              grants.set(key, grant);
              const existing = collections.get(key);
              if (existing) {
                collections.set(key, {
                  ...existing,
                  grant,
                  collection: {
                    ...existing.collection,
                    accessRole: grant.role,
                  },
                });
              }
              if (collectionUnsubscribes.has(key)) continue;

              const collectionRef = doc(
                firestore,
                `users/${grant.ownerId}/collections/${grant.collectionId}`
              );
              const stop = onSnapshot(
                collectionRef,
                (collectionSnapshot) => {
                  if (!collectionSnapshot.exists()) {
                    collections.delete(key);
                    emit();
                    return;
                  }
                  const currentGrant = grants.get(key) ?? grant;
                  const collectionModel = {
                    ...mapDocToCollection(
                      collectionSnapshot.data(),
                      collectionSnapshot.id
                    ),
                    accessRole: currentGrant.role,
                  };
                  void loadUserSummary(currentGrant.ownerId)
                    .then((owner) => {
                      if (cancelled || !grants.has(key)) return;
                      collections.set(key, {
                        collection: collectionModel,
                        grant: currentGrant,
                        ownerName: owner.displayName,
                        ownerAvatar: owner.avatar,
                      });
                      emit();
                    })
                    .catch((error) => onError?.(asError(error)));
                },
                (error) => {
                  collections.delete(key);
                  emit();
                  onError?.(asError(error));
                }
              );
              collectionUnsubscribes.set(key, stop);
            }

            for (const [key, stop] of collectionUnsubscribes) {
              if (liveKeys.has(key)) continue;
              stop();
              collectionUnsubscribes.delete(key);
              grants.delete(key);
              collections.delete(key);
            }
            emit();
          },
          (error) => onError?.(asError(error))
        );
      })
      .catch((error) => onError?.(asError(error)));

    return () => {
      cancelled = true;
      grantsUnsubscribe?.();
      for (const stop of collectionUnsubscribes.values()) stop();
      collectionUnsubscribes.clear();
    };
  }

  subscribeToCollection(
    ownerId: string,
    collectionId: string,
    role: CollectionAccessRole,
    callback: (
      collection: ReturnType<typeof mapDocToCollection> | null
    ) => void,
    onError?: (error: Error) => void
  ): () => void {
    let unsubscribe: Unsubscribe | null = null;
    let cancelled = false;
    void getFirestoreInstance()
      .then((firestore) => {
        if (cancelled) return;
        unsubscribe = onSnapshot(
          doc(firestore, `users/${ownerId}/collections/${collectionId}`),
          (snapshot) => {
            callback(
              snapshot.exists()
                ? {
                    ...mapDocToCollection(snapshot.data(), snapshot.id),
                    accessRole: role,
                  }
                : null
            );
          },
          (error) => onError?.(asError(error))
        );
      })
      .catch((error) => onError?.(asError(error)));
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }
}
