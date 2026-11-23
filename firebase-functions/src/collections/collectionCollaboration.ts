import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import { canReturnSourceSequence } from "./collectionMemberAccess";

type CollectionAccessRole = "viewer" | "editor";

interface ShareCollectionInput {
  ownerId: string;
  collectionId: string;
  recipientId: string;
  conversationId: string;
  messageId: string;
  role: CollectionAccessRole;
  note?: string;
}

interface UpdateCollectionShareInput {
  ownerId: string;
  collectionId: string;
  recipientId: string;
  operation: "set-role" | "remove";
  role?: CollectionAccessRole;
}

interface CollectionMemberInput {
  sequenceId: string;
  ownerId: string;
}

type CollectionMutation =
  | { type: "rename"; name: string }
  | { type: "add"; members: CollectionMemberInput[] }
  | { type: "remove"; sequenceIds: string[] }
  | { type: "reorder"; sequenceIds: string[] };

interface MutateSharedCollectionInput {
  ownerId: string;
  collectionId: string;
  mutation: CollectionMutation;
}

interface LoadSharedCollectionMembersInput {
  ownerId: string;
  collectionId: string;
}

const db = getFirestore();
const MAX_MESSAGE_LENGTH = 500;
const MAX_COLLECTION_MEMBERS = 500;
const MAX_ADD_BATCH = 50;
const SAFE_ID = /^[^/]{1,160}$/;

function requireAuthenticatedUser(request: {
  auth?: { uid: string; token: Record<string, unknown> } | null;
}): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in to share collections.");
  }
  return uid;
}

function requireSafeId(value: unknown, field: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    throw new HttpsError("invalid-argument", `${field} is invalid.`);
  }
  return value;
}

function requireRole(value: unknown): CollectionAccessRole {
  if (value !== "viewer" && value !== "editor") {
    throw new HttpsError("invalid-argument", "Choose Can view or Can edit.");
  }
  return value;
}

function requireManualCollection(
  collection: FirebaseFirestore.DocumentData,
  ownerId: string
): void {
  if (collection.ownerId !== ownerId) {
    throw new HttpsError(
      "permission-denied",
      "Collection ownership is invalid."
    );
  }
  if (collection.systemType || collection.kind === "smart") {
    throw new HttpsError(
      "failed-precondition",
      "System and Smart Collections cannot be shared."
    );
  }
}

function sharePath(
  ownerId: string,
  collectionId: string,
  recipientId: string
): string {
  return `users/${ownerId}/collections/${collectionId}/shares/${recipientId}`;
}

function collectionPath(ownerId: string, collectionId: string): string {
  return `users/${ownerId}/collections/${collectionId}`;
}

function isAnonymousAuth(token: Record<string, unknown>): boolean {
  const firebase = token.firebase;
  if (!firebase || typeof firebase !== "object") return false;
  return (
    (firebase as { sign_in_provider?: unknown }).sign_in_provider ===
    "anonymous"
  );
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function asSequenceOwnerMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}

function isPublicSequence(
  source: FirebaseFirestore.DocumentSnapshot,
  publicMirror: FirebaseFirestore.DocumentSnapshot
): boolean {
  return source.data()?.visibility === "public" || publicMirror.exists;
}

function serializeCallableValue(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toMillis();
  if (Array.isArray(value)) return value.map(serializeCallableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        serializeCallableValue(nested),
      ])
    );
  }
  return value;
}

export const shareCollection = onCall<ShareCollectionInput>(async (request) => {
  const senderId = requireAuthenticatedUser(request);
  if (isAnonymousAuth(request.auth?.token ?? {})) {
    throw new HttpsError(
      "failed-precondition",
      "Create an account before sharing a collection."
    );
  }

  const data = request.data;
  const ownerId = requireSafeId(data.ownerId, "ownerId");
  const collectionId = requireSafeId(data.collectionId, "collectionId");
  const recipientId = requireSafeId(data.recipientId, "recipientId");
  const conversationId = requireSafeId(data.conversationId, "conversationId");
  const messageId = requireSafeId(data.messageId, "messageId");
  const role = requireRole(data.role);
  const note = typeof data.note === "string" ? data.note.trim() : "";

  if (senderId !== ownerId) {
    throw new HttpsError(
      "permission-denied",
      "Only the collection owner can share it."
    );
  }
  if (recipientId === ownerId) {
    throw new HttpsError(
      "invalid-argument",
      "You already own this collection."
    );
  }
  if (note.length > MAX_MESSAGE_LENGTH) {
    throw new HttpsError("invalid-argument", "The message is too long.");
  }

  const collectionRef = db.doc(collectionPath(ownerId, collectionId));
  const shareRef = db.doc(sharePath(ownerId, collectionId, recipientId));
  const conversationRef = db.doc(`conversations/${conversationId}`);
  const messageRef = conversationRef.collection("messages").doc(messageId);

  const result = await db.runTransaction(async (transaction) => {
    const [
      collectionSnapshot,
      shareSnapshot,
      conversationSnapshot,
      messageSnapshot,
    ] = await Promise.all([
      transaction.get(collectionRef),
      transaction.get(shareRef),
      transaction.get(conversationRef),
      transaction.get(messageRef),
    ]);

    if (!collectionSnapshot.exists) {
      throw new HttpsError("not-found", "Collection not found.");
    }
    const collection = collectionSnapshot.data() ?? {};
    requireManualCollection(collection, ownerId);

    if (!conversationSnapshot.exists) {
      throw new HttpsError("not-found", "Conversation not found.");
    }
    const conversation = conversationSnapshot.data() ?? {};
    const participants = asStringArray(conversation.participants);
    const isDirect = !conversation.type || conversation.type === "direct";
    if (
      !isDirect ||
      participants.length !== 2 ||
      !participants.includes(ownerId) ||
      !participants.includes(recipientId)
    ) {
      throw new HttpsError(
        "permission-denied",
        "Collection access must be sent in a direct conversation."
      );
    }

    if (shareSnapshot.exists || messageSnapshot.exists) {
      const existingShare = shareSnapshot.data();
      const existingMessage = messageSnapshot.data();
      if (
        shareSnapshot.exists &&
        messageSnapshot.exists &&
        existingShare?.recipientId === recipientId &&
        existingMessage?.senderId === senderId
      ) {
        return { alreadyShared: true };
      }
      throw new HttpsError(
        "already-exists",
        shareSnapshot.exists
          ? "This person already has access."
          : "Message ID is already in use."
      );
    }

    const participantInfo =
      conversation.participantInfo &&
      typeof conversation.participantInfo === "object"
        ? (conversation.participantInfo as Record<
            string,
            Record<string, unknown>
          >)
        : {};
    const senderInfo = participantInfo[senderId] ?? {};
    const senderName =
      typeof senderInfo.displayName === "string" &&
      senderInfo.displayName.trim()
        ? senderInfo.displayName.trim().slice(0, 120)
        : "Unknown User";
    const senderAvatar =
      typeof senderInfo.avatar === "string" ? senderInfo.avatar : null;
    const collectionName =
      typeof collection.name === "string" && collection.name.trim()
        ? collection.name.trim().slice(0, 120)
        : "Untitled collection";
    const attachment = {
      id: crypto.randomUUID(),
      type: "collection",
      url: `/browse/library/${encodeURIComponent(`${ownerId}:${collectionId}`)}`,
      name: collectionName,
      metadata: {
        collectionId,
        collectionOwnerId: ownerId,
        collectionName,
        collectionIcon:
          typeof collection.icon === "string" ? collection.icon : "fa-folder",
        collectionColor:
          typeof collection.color === "string" ? collection.color : null,
        collectionSequenceCount:
          typeof collection.sequenceCount === "number"
            ? collection.sequenceCount
            : asStringArray(collection.sequenceIds).length,
        collectionAccessRole: role,
      },
    };

    transaction.create(shareRef, {
      ownerId,
      collectionId,
      recipientId,
      role,
      grantedBy: senderId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(messageRef, {
      senderId,
      senderName,
      senderAvatar,
      content: note,
      createdAt: FieldValue.serverTimestamp(),
      readBy: [senderId],
      attachments: [attachment],
      isDeleted: false,
      replyTo: null,
      reactions: null,
      editHistory: null,
    });

    const unreadUpdates: Record<string, unknown> = {};
    for (const participantId of participants) {
      if (participantId !== senderId) {
        unreadUpdates[`unreadCount.${participantId}`] = FieldValue.increment(1);
      }
    }
    transaction.update(conversationRef, {
      lastMessage: {
        messageId,
        content: note.slice(0, 100) || "Shared a collection",
        senderId,
        senderName,
        createdAt: FieldValue.serverTimestamp(),
        hasAttachment: true,
      },
      updatedAt: FieldValue.serverTimestamp(),
      ...unreadUpdates,
    });

    return { alreadyShared: false };
  });

  return { collectionId, recipientId, role, ...result };
});

export const updateCollectionShare = onCall<UpdateCollectionShareInput>(
  async (request) => {
    const actorId = requireAuthenticatedUser(request);
    const data = request.data;
    const ownerId = requireSafeId(data.ownerId, "ownerId");
    const collectionId = requireSafeId(data.collectionId, "collectionId");
    const recipientId = requireSafeId(data.recipientId, "recipientId");
    const operation = data.operation;

    if (operation !== "set-role" && operation !== "remove") {
      throw new HttpsError("invalid-argument", "Share operation is invalid.");
    }
    if (operation === "set-role" && actorId !== ownerId) {
      throw new HttpsError(
        "permission-denied",
        "Only the collection owner can change access."
      );
    }
    if (
      operation === "remove" &&
      actorId !== ownerId &&
      actorId !== recipientId
    ) {
      throw new HttpsError(
        "permission-denied",
        "You cannot remove this access."
      );
    }

    const shareRef = db.doc(sharePath(ownerId, collectionId, recipientId));
    await db.runTransaction(async (transaction) => {
      const shareSnapshot = await transaction.get(shareRef);
      if (!shareSnapshot.exists) {
        if (operation === "remove") return;
        throw new HttpsError("not-found", "Collection access not found.");
      }

      if (operation === "remove") {
        transaction.delete(shareRef);
        return;
      }

      transaction.update(shareRef, {
        role: requireRole(data.role),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return { ownerId, collectionId, recipientId, operation };
  }
);

export const mutateSharedCollection = onCall<MutateSharedCollectionInput>(
  async (request) => {
    const actorId = requireAuthenticatedUser(request);
    const data = request.data;
    const ownerId = requireSafeId(data.ownerId, "ownerId");
    const collectionId = requireSafeId(data.collectionId, "collectionId");
    const mutation = data.mutation;
    if (!mutation || typeof mutation !== "object") {
      throw new HttpsError("invalid-argument", "Collection change is invalid.");
    }

    const collectionRef = db.doc(collectionPath(ownerId, collectionId));
    const shareRef = db.doc(sharePath(ownerId, collectionId, actorId));

    const result = await db.runTransaction(async (transaction) => {
      const [collectionSnapshot, shareSnapshot] = await Promise.all([
        transaction.get(collectionRef),
        actorId === ownerId ? Promise.resolve(null) : transaction.get(shareRef),
      ]);
      if (!collectionSnapshot.exists) {
        throw new HttpsError("not-found", "Collection not found.");
      }
      const collection = collectionSnapshot.data() ?? {};
      requireManualCollection(collection, ownerId);
      const canEdit =
        actorId === ownerId || shareSnapshot?.data()?.role === "editor";
      if (!canEdit) {
        throw new HttpsError(
          "permission-denied",
          "Can edit access is required to change this collection."
        );
      }

      const currentIds = asStringArray(collection.sequenceIds);
      const currentOwners = asSequenceOwnerMap(collection.sequenceOwnerIds);
      const updates: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
      };

      switch (mutation.type) {
        case "rename": {
          const name =
            typeof mutation.name === "string" ? mutation.name.trim() : "";
          if (!name || name.length > 60) {
            throw new HttpsError(
              "invalid-argument",
              "Collection names must be 1 to 60 characters."
            );
          }
          updates.name = name;
          break;
        }

        case "add": {
          if (
            !Array.isArray(mutation.members) ||
            mutation.members.length === 0
          ) {
            throw new HttpsError(
              "invalid-argument",
              "Choose sequences to add."
            );
          }
          if (mutation.members.length > MAX_ADD_BATCH) {
            throw new HttpsError(
              "invalid-argument",
              `Add no more than ${MAX_ADD_BATCH} sequences at once.`
            );
          }
          const uniqueMembers = new Map<string, CollectionMemberInput>();
          for (const member of mutation.members) {
            const sequenceId = requireSafeId(member?.sequenceId, "sequenceId");
            const memberOwnerId = requireSafeId(
              member?.ownerId,
              "member ownerId"
            );
            const existingOwner = uniqueMembers.get(sequenceId)?.ownerId;
            if (existingOwner && existingOwner !== memberOwnerId) {
              throw new HttpsError(
                "invalid-argument",
                "Two selected sequences use the same ID."
              );
            }
            uniqueMembers.set(sequenceId, {
              sequenceId,
              ownerId: memberOwnerId,
            });
          }

          const missingMembers = [...uniqueMembers.values()].filter(
            (member) => !currentIds.includes(member.sequenceId)
          );
          if (
            currentIds.length + missingMembers.length >
            MAX_COLLECTION_MEMBERS
          ) {
            throw new HttpsError(
              "failed-precondition",
              `Collections can contain up to ${MAX_COLLECTION_MEMBERS} sequences.`
            );
          }
          for (const member of uniqueMembers.values()) {
            const existingOwner = currentOwners[member.sequenceId];
            if (existingOwner && existingOwner !== member.ownerId) {
              throw new HttpsError(
                "already-exists",
                "That sequence ID already belongs to another collection member."
              );
            }
          }

          const sourcePairs = await Promise.all(
            missingMembers.map(async (member) => {
              const sourceRef = db.doc(
                `users/${member.ownerId}/sequences/${member.sequenceId}`
              );
              const publicRef = db.doc(`publicSequences/${member.sequenceId}`);
              const [source, publicMirror] = await Promise.all([
                transaction.get(sourceRef),
                transaction.get(publicRef),
              ]);
              return { member, source, publicMirror };
            })
          );

          for (const { member, source, publicMirror } of sourcePairs) {
            if (!source.exists && !publicMirror.exists) {
              throw new HttpsError(
                "not-found",
                "A selected sequence was not found."
              );
            }
            const publicSequence = isPublicSequence(source, publicMirror);
            if (member.ownerId !== actorId && !publicSequence) {
              throw new HttpsError(
                "permission-denied",
                "You can add your own sequences or public sequences."
              );
            }
            if (collection.isPublic === true && !publicSequence) {
              throw new HttpsError(
                "failed-precondition",
                "Publish the sequence before adding it to a public collection."
              );
            }
          }

          const nextIds = [...currentIds];
          const nextOwners = { ...currentOwners };
          for (const member of missingMembers) {
            nextIds.push(member.sequenceId);
            nextOwners[member.sequenceId] = member.ownerId;
          }
          updates.sequenceIds = nextIds;
          updates.sequenceOwnerIds = nextOwners;
          updates.sequenceCount = nextIds.length;
          break;
        }

        case "remove": {
          if (!Array.isArray(mutation.sequenceIds)) {
            throw new HttpsError(
              "invalid-argument",
              "Choose sequences to remove."
            );
          }
          const removeIds = new Set(
            mutation.sequenceIds.map((id) => requireSafeId(id, "sequenceId"))
          );
          const nextIds = currentIds.filter((id) => !removeIds.has(id));
          const nextOwners = { ...currentOwners };
          for (const id of removeIds) delete nextOwners[id];
          updates.sequenceIds = nextIds;
          updates.sequenceOwnerIds = nextOwners;
          updates.sequenceCount = nextIds.length;
          break;
        }

        case "reorder": {
          if (!Array.isArray(mutation.sequenceIds)) {
            throw new HttpsError(
              "invalid-argument",
              "Sequence order is invalid."
            );
          }
          const nextIds = mutation.sequenceIds.map((id) =>
            requireSafeId(id, "sequenceId")
          );
          const currentSet = new Set(currentIds);
          const nextSet = new Set(nextIds);
          if (
            nextIds.length !== currentIds.length ||
            nextSet.size !== currentSet.size ||
            [...currentSet].some((id) => !nextSet.has(id))
          ) {
            throw new HttpsError(
              "failed-precondition",
              "Reordering cannot add or remove sequences."
            );
          }
          updates.sequenceIds = nextIds;
          break;
        }

        default:
          throw new HttpsError(
            "invalid-argument",
            "Collection change is invalid."
          );
      }

      transaction.update(collectionRef, updates);
      return {
        sequenceCount:
          typeof updates.sequenceCount === "number"
            ? updates.sequenceCount
            : currentIds.length,
      };
    });

    return { ownerId, collectionId, ...result };
  }
);

export const loadSharedCollectionMembers =
  onCall<LoadSharedCollectionMembersInput>(async (request) => {
    const actorId = requireAuthenticatedUser(request);
    const data = request.data;
    const ownerId = requireSafeId(data.ownerId, "ownerId");
    const collectionId = requireSafeId(data.collectionId, "collectionId");
    const collectionRef = db.doc(collectionPath(ownerId, collectionId));
    const shareRef = db.doc(sharePath(ownerId, collectionId, actorId));

    const [collectionSnapshot, shareSnapshot] = await Promise.all([
      collectionRef.get(),
      actorId === ownerId ? Promise.resolve(null) : shareRef.get(),
    ]);
    if (!collectionSnapshot.exists) {
      throw new HttpsError("not-found", "Collection not found.");
    }
    const collection = collectionSnapshot.data() ?? {};
    const canRead =
      actorId === ownerId ||
      collection.isPublic === true ||
      shareSnapshot?.exists;
    if (!canRead) {
      throw new HttpsError(
        "permission-denied",
        "You no longer have access to this collection."
      );
    }

    const sequenceIds = asStringArray(collection.sequenceIds).slice(
      0,
      MAX_COLLECTION_MEMBERS
    );
    const sequenceOwners = asSequenceOwnerMap(collection.sequenceOwnerIds);
    const sourceRefs = sequenceIds.map((sequenceId) =>
      db.doc(
        `users/${sequenceOwners[sequenceId] ?? ownerId}/sequences/${sequenceId}`
      )
    );
    const publicRefs = sequenceIds.map((sequenceId) =>
      db.doc(`publicSequences/${sequenceId}`)
    );
    const [sourceSnapshots, publicSnapshots] = await Promise.all([
      sourceRefs.length ? db.getAll(...sourceRefs) : Promise.resolve([]),
      publicRefs.length ? db.getAll(...publicRefs) : Promise.resolve([]),
    ]);

    const access = {
      actorId,
      collectionOwnerId: ownerId,
      sharedWithActor: shareSnapshot?.exists === true,
    };
    const sequences = sequenceIds.flatMap((sequenceId, index) => {
      const source = sourceSnapshots[index];
      const publicMirror = publicSnapshots[index];
      const sourceOwnerId = sequenceOwners[sequenceId] ?? ownerId;
      const useSource =
        source?.exists === true &&
        canReturnSourceSequence(
          access,
          sourceOwnerId,
          source.data()?.visibility
        );
      const snapshot = useSource
        ? source
        : publicMirror?.exists
          ? publicMirror
          : null;
      if (!snapshot?.exists) return [];
      return [
        {
          id: sequenceId,
          data: serializeCallableValue({
            ...snapshot.data(),
            ownerId: snapshot.data()?.ownerId ?? sourceOwnerId,
          }),
        },
      ];
    });

    return { ownerId, collectionId, sequences };
  });

export const cleanupCollectionShares = onDocumentDeleted(
  "users/{ownerId}/collections/{collectionId}",
  async (event) => {
    const ownerId = requireSafeId(event.params.ownerId, "ownerId");
    const collectionId = requireSafeId(
      event.params.collectionId,
      "collectionId"
    );
    const shares = db
      .doc(collectionPath(ownerId, collectionId))
      .collection("shares");

    while (true) {
      const snapshot = await shares.limit(400).get();
      if (snapshot.empty) return;
      const batch = db.batch();
      for (const share of snapshot.docs) batch.delete(share.ref);
      await batch.commit();
      if (snapshot.size < 400) return;
    }
  }
);
