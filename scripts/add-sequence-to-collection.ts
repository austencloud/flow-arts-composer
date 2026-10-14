#!/usr/bin/env node
/**
 * Append sequences to one of a user's collections, the way the app's
 * collection-manager.addSequenceToCollection does it: the collection gains the
 * ids and count, each sequence gains the collection id. A public collection
 * only accepts members that already have a public projection, so publish
 * first (`pnpm sequence:publish -- <id>`).
 *
 * Usage:
 *   TKA_ADMIN=1 node --import tsx scripts/add-sequence-to-collection.ts <collectionId> <sequenceId...>
 *   TKA_ADMIN=1 node --import tsx scripts/add-sequence-to-collection.ts <collectionId> <sequenceId...> --owner <uid>
 */

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { initFirestore } from "./lib/firestore-provider.js";

const require = createRequire(import.meta.url);
const { AUSTEN_UID } = require("./import-sequence.cjs") as {
  AUSTEN_UID: string;
};

interface FirestoreLike {
  doc(path: string): { path: string };
  runTransaction<T>(fn: (tx: TransactionLike) => Promise<T>): Promise<T>;
}

interface SnapshotLike {
  exists: boolean | (() => boolean);
  data(): Record<string, unknown> | undefined;
}

interface TransactionLike {
  get(ref: { path: string }): Promise<SnapshotLike>;
  update(ref: { path: string }, data: Record<string, unknown>): void;
}

function snapshotExists(snapshot: SnapshotLike): boolean {
  return typeof snapshot.exists === "function"
    ? snapshot.exists()
    : snapshot.exists;
}

export interface AddToCollectionResult {
  readonly added: string[];
  readonly alreadyMembers: string[];
  readonly sequenceCount: number;
}

export async function addSequencesToCollection(
  db: FirestoreLike,
  serverTimestamp: () => unknown,
  ownerId: string,
  collectionId: string,
  sequenceIds: readonly string[]
): Promise<AddToCollectionResult> {
  const collectionRef = db.doc(`users/${ownerId}/collections/${collectionId}`);
  const uniqueIds = [...new Set(sequenceIds)];

  return db.runTransaction(async (tx) => {
    const collectionSnap = await tx.get(collectionRef);
    if (!snapshotExists(collectionSnap)) {
      throw new Error(
        `Collection not found: users/${ownerId}/collections/${collectionId}`
      );
    }
    const collection = collectionSnap.data() ?? {};
    if (collection["kind"] === "smart") {
      throw new Error("Cannot add members to a smart collection");
    }
    const isPublic = collection["isPublic"] === true;

    const ownRefs = uniqueIds.map((id) =>
      db.doc(`users/${ownerId}/sequences/${id}`)
    );
    const ownSnaps = await Promise.all(ownRefs.map((ref) => tx.get(ref)));
    if (isPublic) {
      const publicSnaps = await Promise.all(
        uniqueIds.map((id) => tx.get(db.doc(`publicSequences/${id}`)))
      );
      const unpublished = uniqueIds.filter(
        (_, i) => !snapshotExists(publicSnaps[i]!)
      );
      if (unpublished.length > 0) {
        throw new Error(
          `Public collection needs published members; not public yet: ${unpublished.join(", ")}`
        );
      }
    }
    const missing = uniqueIds.filter((_, i) => !snapshotExists(ownSnaps[i]!));
    if (missing.length > 0) {
      throw new Error(
        `Sequences not found in the owner's library: ${missing.join(", ")}`
      );
    }

    const existingIds = Array.isArray(collection["sequenceIds"])
      ? (collection["sequenceIds"] as unknown[]).filter(
          (id): id is string => typeof id === "string"
        )
      : [];
    const added = uniqueIds.filter((id) => !existingIds.includes(id));
    const alreadyMembers = uniqueIds.filter((id) => existingIds.includes(id));
    const nextIds = [...existingIds, ...added];

    tx.update(collectionRef, {
      sequenceIds: nextIds,
      sequenceCount: nextIds.length,
      updatedAt: serverTimestamp(),
    });

    uniqueIds.forEach((id, i) => {
      const data = ownSnaps[i]!.data() ?? {};
      const collectionIds = Array.isArray(data["collectionIds"])
        ? (data["collectionIds"] as unknown[]).filter(
            (c): c is string => typeof c === "string"
          )
        : [];
      if (collectionIds.includes(collectionId)) return;
      tx.update(ownRefs[i]!, {
        collectionIds: [...collectionIds, collectionId],
        updatedAt: serverTimestamp(),
      });
    });

    return { added, alreadyMembers, sequenceCount: nextIds.length };
  });
}

function parseArgs(argv: string[]): {
  collectionId: string;
  sequenceIds: string[];
  ownerId: string;
} {
  let ownerId = AUSTEN_UID;
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--owner") {
      ownerId = argv[++i] ?? "";
      if (!ownerId) throw new Error("--owner requires a Firebase user id");
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  const [collectionId, ...sequenceIds] = positional;
  if (!collectionId || sequenceIds.length === 0) {
    throw new Error(
      "Usage: node --import tsx scripts/add-sequence-to-collection.ts <collectionId> <sequenceId...> [--owner <uid>]"
    );
  }
  return { collectionId, sequenceIds, ownerId };
}

async function main(): Promise<void> {
  const { collectionId, sequenceIds, ownerId } = parseArgs(
    process.argv.slice(2)
  );
  const { db, FieldValue } = (await initFirestore()) as {
    db: FirestoreLike;
    FieldValue: { serverTimestamp: () => unknown };
  };
  const result = await addSequencesToCollection(
    db,
    () => FieldValue.serverTimestamp(),
    ownerId,
    collectionId,
    sequenceIds
  );
  console.log(
    `Added ${result.added.length}: ${result.added.join(", ") || "(none)"}`
  );
  if (result.alreadyMembers.length > 0) {
    console.log(`Already members: ${result.alreadyMembers.join(", ")}`);
  }
  console.log(`Collection now holds ${result.sequenceCount} sequences.`);
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url ===
    new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href;

if (invokedDirectly) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
