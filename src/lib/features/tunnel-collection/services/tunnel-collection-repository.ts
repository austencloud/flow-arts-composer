import { doc, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { stripUndefined } from "#lib/shared/firestore/firestore-helpers.js";
import {
  createFirebaseCollectionRepository,
  type FirebaseCollectionRepository,
} from "#lib/shared/collections/firebase-collection-repository.js";
import {
  CollectedTunnelSchema,
  type CollectedTunnel,
} from "../domain/tunnel-collection-types";
import {
  createTunnelRevision,
  prepareTunnelRevision,
} from "../domain/tunnel-revision";
import { migrateTunnelArtifact } from "../domain/tunnel-artifact-migration";

const TUNNEL_COLLECTION = "tunnel-collection";

function tunnelPath(userId: string, tunnelId: string): string {
  return `users/${userId}/${TUNNEL_COLLECTION}/${tunnelId}`;
}

/**
 * The tunnel aggregate writer. The mutable work document and its immutable
 * current revision land in one batch, so media can never receive a revision
 * reference whose payload failed to persist.
 */
export function createTunnelCollectionRepository(): FirebaseCollectionRepository<CollectedTunnel> {
  const base = createFirebaseCollectionRepository<CollectedTunnel>(
    TUNNEL_COLLECTION,
    CollectedTunnelSchema
  );

  const repository: FirebaseCollectionRepository<CollectedTunnel> = {
    async load(userId) {
      const loaded = await base.load(userId);
      return Promise.all(
        loaded.map(async (loadedTunnel) => {
          const migration = migrateTunnelArtifact(loadedTunnel);
          const tunnel = migration.tunnel;
          if (tunnel.currentRevisionId && tunnel.currentContentDigest) {
            // Envelope migration changes only representation metadata. The
            // immutable revision stays untouched, and a failed metadata write
            // never prevents a truthful old record from opening.
            if (migration.changed) {
              try {
                await repository.savePresentation!(userId, tunnel);
              } catch {
                // The in-memory migrated record is still safe to read.
              }
            }
            return tunnel;
          }
          const baselined = await prepareTunnelRevision(tunnel);
          await repository.save(userId, baselined);
          return baselined;
        })
      );
    },

      async save(userId, entry) {
      const prepared =
        entry.currentRevisionId && entry.currentContentDigest
          ? entry
          : await prepareTunnelRevision(entry);
      const revision = await createTunnelRevision(
        prepared,
        prepared.currentRevisionCreatedAt ?? prepared.createdAt
      );
      if (
        revision.revisionId !== prepared.currentRevisionId ||
        revision.contentDigest !== prepared.currentContentDigest
      ) {
        throw new Error("Tunnel revision metadata does not match its payload");
      }

      const firestore = await getFirestoreInstance();
      const batch = writeBatch(firestore);
      const workRef = doc(firestore, tunnelPath(userId, prepared.id));
      const revisionRef = doc(
        firestore,
        `${tunnelPath(userId, prepared.id)}/revisions/${revision.revisionId}`
      );
      const { id: _id, ...work } = prepared;
      batch.set(
        workRef,
        stripUndefined({ ...work, updatedAt: serverTimestamp() })
      );
      batch.set(revisionRef, stripUndefined({ ...revision }));
        await batch.commit();
      },

      async savePresentation(userId, entry) {
        const firestore = await getFirestoreInstance();
        await updateDoc(
          doc(firestore, tunnelPath(userId, entry.id)),
          stripUndefined({
            artifactSchemaVersion: entry.artifactSchemaVersion,
            poster: entry.poster,
            posterRenderVersion: entry.posterRenderVersion,
            updatedAt: serverTimestamp(),
          })
        );
      },

      remove: base.remove,
  };

  return repository;
}
