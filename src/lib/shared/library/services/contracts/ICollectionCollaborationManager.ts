import type {
  CollectionAccessRole,
  CollectionShareGrant,
  LibraryCollection,
} from "#lib/shared/library/domain/models/collection.js";
import type { LibrarySequence } from "#lib/shared/library/domain/models/library-sequence.js";

export interface CollectionShareRecipient {
  id: string;
  displayName: string;
  avatar?: string;
}

export interface CollectionShareAccessItem {
  grant: CollectionShareGrant;
  recipient: CollectionShareRecipient;
}

export interface ReceivedCollectionItem {
  collection: LibraryCollection;
  grant: CollectionShareGrant;
  ownerName?: string;
  ownerAvatar?: string;
}

export interface ShareCollectionRequest {
  ownerId: string;
  collectionId: string;
  recipientId: string;
  conversationId: string;
  role: CollectionAccessRole;
  note: string;
}

export type SharedCollectionMutation =
  | { type: "rename"; name: string }
  | {
      type: "add";
      members: Array<{ sequenceId: string; ownerId: string }>;
    }
  | { type: "remove"; sequenceIds: string[] }
  | { type: "reorder"; sequenceIds: string[] };

export interface ICollectionCollaborationManager {
  share(request: ShareCollectionRequest): Promise<void>;
  setRole(
    ownerId: string,
    collectionId: string,
    recipientId: string,
    role: CollectionAccessRole
  ): Promise<void>;
  removeAccess(
    ownerId: string,
    collectionId: string,
    recipientId: string
  ): Promise<void>;
  mutate(
    ownerId: string,
    collectionId: string,
    mutation: SharedCollectionMutation
  ): Promise<void>;
  loadMembers(
    ownerId: string,
    collectionId: string
  ): Promise<LibrarySequence[]>;
  subscribeToAccessList(
    ownerId: string,
    collectionId: string,
    callback: (items: CollectionShareAccessItem[]) => void,
    onError?: (error: Error) => void
  ): () => void;
  subscribeToGrant(
    ownerId: string,
    collectionId: string,
    recipientId: string,
    callback: (grant: CollectionShareGrant | null) => void,
    onError?: (error: Error) => void
  ): () => void;
  subscribeToReceivedCollections(
    recipientId: string,
    callback: (items: ReceivedCollectionItem[]) => void,
    onError?: (error: Error) => void
  ): () => void;
  subscribeToCollection(
    ownerId: string,
    collectionId: string,
    role: CollectionAccessRole,
    callback: (collection: LibraryCollection | null) => void,
    onError?: (error: Error) => void
  ): () => void;
}
