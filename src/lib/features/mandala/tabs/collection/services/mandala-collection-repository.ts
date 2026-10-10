import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { stripUndefined } from "#lib/shared/firestore/firestore-helpers.js";
import {
  createFirebaseCollectionRepository,
  type FirebaseCollectionRepository,
} from "#lib/shared/collections/firebase-collection-repository.js";
import {
  CollectedMandalaSchema,
  type CollectedMandala,
} from "../domain/mandala-collection-types";
import {
  createMandalaRevision,
  prepareMandalaRevision,
} from "../domain/mandala-revision";

const MANDALA_COLLECTION = "mandala-collection";

function mandalaPath(userId: string, mandalaId: string): string {
  return `users/${userId}/${MANDALA_COLLECTION}/${mandalaId}`;
}

/**
 * The mandala aggregate writer, mirroring the tunnel one: the mutable work
 * document and its immutable current revision land in one batch, so a
 * publication can never pin a revision reference whose payload failed to
 * persist. Entries saved before revisions existed are baselined on load.
 */
export function createMandalaCollectionRepository(): FirebaseCollectionRepository<CollectedMandala> {
  const base = createFirebaseCollectionRepository<CollectedMandala>(
    MANDALA_COLLECTION,
    CollectedMandalaSchema
  );

  const repository: FirebaseCollectionRepository<CollectedMandala> = {
    async load(userId) {
      const loaded = await base.load(userId);
      return Promise.all(
        loaded.map(async (mandala) => {
          if (mandala.currentRevisionId && mandala.currentContentDigest) {
            return mandala;
          }
          const baselined = await prepareMandalaRevision(mandala);
          await repository.save(userId, baselined);
          return baselined;
        })
      );
    },

    async save(userId, entry) {
      const prepared =
        entry.currentRevisionId && entry.currentContentDigest
          ? entry
          : await prepareMandalaRevision(entry);
      const revision = await createMandalaRevision(
        prepared,
        prepared.currentRevisionCreatedAt ?? prepared.createdAt
      );
      if (
        revision.revisionId !== prepared.currentRevisionId ||
        revision.contentDigest !== prepared.currentContentDigest
      ) {
        throw new Error("Mandala revision metadata does not match its payload");
      }

      const firestore = await getFirestoreInstance();
      const batch = writeBatch(firestore);
      const workRef = doc(firestore, mandalaPath(userId, prepared.id));
      const revisionRef = doc(
        firestore,
        `${mandalaPath(userId, prepared.id)}/revisions/${revision.revisionId}`
      );
      const { id: _id, ...work } = prepared;
      batch.set(
        workRef,
        stripUndefined({ ...work, updatedAt: serverTimestamp() })
      );
      batch.set(revisionRef, stripUndefined({ ...revision }));
      await batch.commit();
    },

    remove: base.remove,
  };

  return repository;
}
