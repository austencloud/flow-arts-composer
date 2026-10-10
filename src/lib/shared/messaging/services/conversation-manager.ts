import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
import { userPreviewState } from "#lib/shared/debug/state/user-preview-state.svelte.js";
import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
import { isPermissionDeniedError } from "#lib/shared/auth/utils/is-permission-denied-error.js";
import {
  mapDocToConversation,
  mapDocToPreview,
  previewNeedsRefresh,
  refreshParticipantInfo,
} from "./conversation-mappers";
import { GroupConversationManager } from "./group-conversation-manager";
import type {
  Conversation,
  ConversationPreview,
  ConversationFetchOptions,
  GetOrCreateConversationResult,
  ParticipantInfo,
  CreateGroupInput,
  CreateGroupResult,
  GroupMetadata,
} from "../domain/models/conversation-models";

const CONVERSATIONS_COLLECTION = "conversations";

export class ConversationManager {
  private conversationsUnsubscribe: (() => void) | null = null;
  private unreadCountUnsubscribe: (() => void) | null = null;
  private groupManager: GroupConversationManager;

  constructor() {
    this.groupManager = new GroupConversationManager({
      getCurrentUserId: () => this.getCurrentUserId(),
      getEffectiveUserInfo: () => this.getEffectiveUserInfo(),
      fetchUserInfo: (userId) => this.fetchUserInfo(userId),
      getConversation: (id) => this.getConversation(id),
    });
  }


  private getCurrentUserId(): string {
    if (userPreviewState.isActive && userPreviewState.data.profile) {
      return userPreviewState.data.profile.uid;
    }
    const userId = authState.user?.uid;
    if (!userId) {
      console.error("[ConversationManager] No authenticated user found", {
        previewActive: userPreviewState.isActive,
        hasAuthUser: !!authState.user,
      });
      throw new Error("User must be authenticated to access conversations");
    }
    return userId;
  }

  private getEffectiveUserInfo(): {
    uid: string;
    displayName: string;
    username?: string;
    photoURL: string | null;
  } {
    if (userPreviewState.isActive && userPreviewState.data.profile) {
      const profile = userPreviewState.data.profile;
      return {
        uid: profile.uid,
        displayName: profile.displayName || "Unknown User",
        ...(profile.username && { username: profile.username }),
        photoURL: profile.photoURL || null,
      };
    }
    const user = authState.user;
    if (!user) {
      throw new Error("User must be authenticated");
    }
    return {
      uid: user.uid,
      displayName: user.displayName || "Unknown User",
      photoURL: user.photoURL,
    };
  }

  private async fetchUserInfo(userId: string): Promise<{
    displayName: string;
    username?: string | null;
    photoURL?: string;
  }> {
    try {
      const firestore = await getFirestoreInstance();
      const userRef = doc(firestore, "users", userId);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        const data = userDoc.data();
        const username =
          typeof data["username"] === "string" && data["username"].trim()
            ? data["username"].trim()
            : null;
        return {
          displayName:
            data["displayName"] || data["username"] || "Unknown User",
          username,
          photoURL: data["photoURL"] || undefined,
        };
      }
    } catch (error) {
      console.error("[ConversationManager] Failed to fetch user info:", error);
    }
    return { displayName: "Unknown User" };
  }

  private async hydrateParticipantProfiles(
    firestore: Awaited<ReturnType<typeof getFirestoreInstance>>,
    conversation: Conversation
  ): Promise<Conversation> {
    const refreshedUsers = await Promise.all(
      conversation.participants.map(async (userId) => ({
        userId,
        userInfo: await this.fetchUserInfo(userId),
      }))
    );
    const updates: Record<string, unknown> = {};

    for (const { userId, userInfo } of refreshedUsers) {
      const participant = conversation.participantInfo[userId];
      if (!participant || userInfo.username === undefined) continue;

      if (participant.username !== userInfo.username) {
        participant.username = userInfo.username;
        updates[`participantInfo.${userId}.username`] = userInfo.username;
      }

      if (
        userInfo.displayName !== "Unknown User" &&
        participant.displayName !== userInfo.displayName
      ) {
        participant.displayName = userInfo.displayName;
        updates[`participantInfo.${userId}.displayName`] = userInfo.displayName;
      }
      if (userInfo.photoURL && participant.avatar !== userInfo.photoURL) {
        participant.avatar = userInfo.photoURL;
        updates[`participantInfo.${userId}.avatar`] = userInfo.photoURL;
      }
    }

    if (Object.keys(updates).length > 0) {
      try {
        await updateDoc(
          doc(firestore, CONVERSATIONS_COLLECTION, conversation.id),
          updates
        );
      } catch (error) {
        // The current profile is already available in this open thread. A
        // later load can retry the snapshot update without blocking messages.
        console.warn(
          "[ConversationManager] Failed to refresh participant profiles:",
          error
        );
      }
    }

    return conversation;
  }

  private generateDirectConversationId(
    userId1: string,
    userId2: string
  ): string {
    const sorted = [userId1, userId2].sort();
    return `${sorted[0]}_${sorted[1]}`;
  }

  // ============================================================================
  // DIRECT CONVERSATIONS (1:1)
  // ============================================================================

  async getOrCreateConversation(
    otherUserId: string,
    options?: { silent?: boolean }
  ): Promise<GetOrCreateConversationResult> {
    try {
      const firestore = await getFirestoreInstance();
      const currentUserId = this.getCurrentUserId();
      const conversationId = this.generateDirectConversationId(
        currentUserId,
        otherUserId
      );

      const conversationRef = doc(
        firestore,
        CONVERSATIONS_COLLECTION,
        conversationId
      );
      const existingDoc = await getDoc(conversationRef);

      if (existingDoc.exists()) {
        const conversation = mapDocToConversation(
          existingDoc.id,
          existingDoc.data()
        );
        return {
          conversation: await this.hydrateParticipantProfiles(
            firestore,
            conversation
          ),
          isNew: false,
        };
      }

      const effectiveUser = this.getEffectiveUserInfo();
      const otherUserInfo = await this.fetchUserInfo(otherUserId);
      const now = new Date();
      const participants = [currentUserId, otherUserId].sort();

      const participantInfo: Record<string, ParticipantInfo> = {
        [currentUserId]: {
          userId: currentUserId,
          displayName: effectiveUser.displayName,
          ...(effectiveUser.username !== undefined && {
            username: effectiveUser.username,
          }),
          ...(effectiveUser.photoURL && { avatar: effectiveUser.photoURL }),
          joinedAt: now,
        },
        [otherUserId]: {
          userId: otherUserId,
          displayName: otherUserInfo.displayName,
          ...(otherUserInfo.username !== undefined && {
            username: otherUserInfo.username,
          }),
          ...(otherUserInfo.photoURL && { avatar: otherUserInfo.photoURL }),
          joinedAt: now,
        },
      };

      const newConversation: Omit<Conversation, "id"> = {
        type: "direct",
        participants,
        participantInfo,
        unreadCount: { [currentUserId]: 0, [otherUserId]: 0 },
        createdAt: now,
        updatedAt: now,
      };

      await setDoc(conversationRef, {
        ...newConversation,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return {
        conversation: { id: conversationId, ...newConversation },
        isNew: true,
      };
    } catch (error) {
      console.error(
        "[ConversationManager] Failed to get or create conversation:",
        error
      );
      if (!options?.silent) {
        toast.error("Failed to start conversation.");
      }
      throw error;
    }
  }

  async conversationExists(otherUserId: string): Promise<string | null> {
    try {
      const firestore = await getFirestoreInstance();
      const currentUserId = this.getCurrentUserId();
      const conversationId = this.generateDirectConversationId(
        currentUserId,
        otherUserId
      );
      const conversationRef = doc(
        firestore,
        CONVERSATIONS_COLLECTION,
        conversationId
      );
      const snapshot = await getDoc(conversationRef);
      return snapshot.exists() ? conversationId : null;
    } catch (error) {
      console.error(
        "[ConversationManager] Failed to check conversation exists:",
        error
      );
      return null;
    }
  }

  // ============================================================================
  // GROUP CONVERSATIONS (delegated)
  // ============================================================================

  async createGroup(input: CreateGroupInput): Promise<CreateGroupResult> {
    return this.groupManager.createGroup(input);
  }

  async getOrCreateGroupConversation(
    participantIds: string[],
    groupName?: string
  ): Promise<GetOrCreateConversationResult> {
    return this.groupManager.getOrCreateGroupConversation(participantIds, groupName);
  }

  async addGroupMember(conversationId: string, userId: string): Promise<void> {
    return this.groupManager.addGroupMember(conversationId, userId);
  }

  async removeGroupMember(conversationId: string, userId: string): Promise<void> {
    return this.groupManager.removeGroupMember(conversationId, userId);
  }

  async leaveGroup(conversationId: string): Promise<void> {
    return this.groupManager.leaveGroup(conversationId);
  }

  async updateGroupMetadata(
    conversationId: string,
    updates: Partial<Pick<GroupMetadata, "name" | "description" | "avatarUrl">>
  ): Promise<void> {
    return this.groupManager.updateGroupMetadata(conversationId, updates);
  }

  async setAdminStatus(
    conversationId: string,
    userId: string,
    isAdmin: boolean
  ): Promise<void> {
    return this.groupManager.setAdminStatus(conversationId, userId, isAdmin);
  }

  // ============================================================================
  // COMMON OPERATIONS
  // ============================================================================

  async getConversation(conversationId: string): Promise<Conversation | null> {
    try {
      const firestore = await getFirestoreInstance();
      const conversationRef = doc(
        firestore,
        CONVERSATIONS_COLLECTION,
        conversationId
      );
      const snapshot = await getDoc(conversationRef);

      if (!snapshot.exists()) {
        return null;
      }

      const conversation = mapDocToConversation(snapshot.id, snapshot.data());
      return await this.hydrateParticipantProfiles(firestore, conversation);
    } catch (error) {
      console.error("[ConversationManager] Failed to get conversation:", error);
      toast.error("Failed to load conversation.");
      return null;
    }
  }

  async getConversations(
    options?: ConversationFetchOptions
  ): Promise<ConversationPreview[]> {
    try {
      const firestore = await getFirestoreInstance();
      const currentUserId = this.getCurrentUserId();
      const maxCount = options?.limit ?? 50;

      const conversationsRef = collection(firestore, CONVERSATIONS_COLLECTION);
      const q = query(
        conversationsRef,
        where("participants", "array-contains", currentUserId),
        orderBy("updatedAt", "desc"),
        limit(maxCount)
      );

      const snapshot = await getDocs(q);
      const previews: ConversationPreview[] = [];

      for (const docSnap of snapshot.docs) {
        const preview = mapDocToPreview(docSnap.id, docSnap.data(), currentUserId);
        if (preview) {
          const refreshUserId = previewNeedsRefresh(preview);
          if (refreshUserId) {
            refreshParticipantInfo(
              firestore,
              docSnap.id,
              refreshUserId,
              (uid) => this.fetchUserInfo(uid)
            );
          }
          previews.push(preview);
        }
      }

      return previews;
    } catch (error) {
      console.error(
        "[ConversationManager] Failed to get conversations:",
        error
      );
      toast.error("Failed to load conversations.");
      return [];
    }
  }

  subscribeToConversations(
    callback: (conversations: ConversationPreview[]) => void
  ): () => void {
    if (this.conversationsUnsubscribe) {
      this.conversationsUnsubscribe();
    }

    const currentUserId = this.getCurrentUserId();

    (async () => {
      try {
        const firestore = await getFirestoreInstance();
        const conversationsRef = collection(
          firestore,
          CONVERSATIONS_COLLECTION
        );
        const q = query(
          conversationsRef,
          where("participants", "array-contains", currentUserId),
          orderBy("updatedAt", "desc"),
          limit(50)
        );

        this.conversationsUnsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const conversations: ConversationPreview[] = [];
            for (const docSnap of snapshot.docs) {
              const preview = mapDocToPreview(docSnap.id, docSnap.data(), currentUserId);
              if (preview) {
                const refreshUserId = previewNeedsRefresh(preview);
                if (refreshUserId) {
                  getFirestoreInstance().then((fs) =>
                    refreshParticipantInfo(
                      fs,
                      docSnap.id,
                      refreshUserId,
                      (uid) => this.fetchUserInfo(uid)
                    )
                  );
                }
                conversations.push(preview);
              }
            }
            callback(conversations);
          },
          (error) => {
            if (isPermissionDeniedError(error)) return;
            console.error(
              "[ConversationManager] Conversations subscription error:",
              error
            );
            toast.error("Lost connection to messages. Please refresh.");
          }
        );
      } catch (error) {
        console.error(
          "[ConversationManager] Failed to initialize conversations subscription:",
          error
        );
        toast.error("Failed to connect to messages.");
      }
    })();

    return () => {
      if (this.conversationsUnsubscribe) {
        this.conversationsUnsubscribe();
        this.conversationsUnsubscribe = null;
      }
    };
  }

  async getTotalUnreadCount(): Promise<number> {
    try {
      const firestore = await getFirestoreInstance();
      const currentUserId = this.getCurrentUserId();
      const conversationsRef = collection(firestore, CONVERSATIONS_COLLECTION);
      const q = query(
        conversationsRef,
        where("participants", "array-contains", currentUserId)
      );

      const snapshot = await getDocs(q);
      let total = 0;

      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const unreadCount = data["unreadCount"] as
          | Record<string, number>
          | undefined;
        if (unreadCount?.[currentUserId]) {
          total += unreadCount[currentUserId];
        }
      });

      return total;
    } catch (error) {
      console.error("[ConversationManager] Failed to get unread count:", error);
      return 0;
    }
  }

  subscribeToUnreadCount(callback: (count: number) => void): () => void {
    if (this.unreadCountUnsubscribe) {
      this.unreadCountUnsubscribe();
    }

    const currentUserId = this.getCurrentUserId();

    (async () => {
      try {
        const firestore = await getFirestoreInstance();
        const conversationsRef = collection(
          firestore,
          CONVERSATIONS_COLLECTION
        );
        const q = query(
          conversationsRef,
          where("participants", "array-contains", currentUserId)
        );

        this.unreadCountUnsubscribe = onSnapshot(
          q,
          (snapshot) => {
            let total = 0;
            snapshot.docs.forEach((docSnap) => {
              const data = docSnap.data();
              const unreadCount = data["unreadCount"] as
                | Record<string, number>
                | undefined;
              if (unreadCount?.[currentUserId]) {
                total += unreadCount[currentUserId];
              }
            });
            callback(total);
          },
          (error) => {
            console.error(
              "[ConversationManager] Unread count subscription error:",
              error
            );
          }
        );
      } catch (error) {
        console.error(
          "[ConversationManager] Failed to initialize unread count subscription:",
          error
        );
      }
    })();

    return () => {
      if (this.unreadCountUnsubscribe) {
        this.unreadCountUnsubscribe();
        this.unreadCountUnsubscribe = null;
      }
    };
  }

  async archiveConversation(conversationId: string): Promise<void> {
    try {
      const firestore = await getFirestoreInstance();
      const currentUserId = this.getCurrentUserId();
      const conversationRef = doc(
        firestore,
        CONVERSATIONS_COLLECTION,
        conversationId
      );
      await updateDoc(conversationRef, {
        [`archived.${currentUserId}`]: true,
      });
    } catch (error) {
      console.error(
        "[ConversationManager] Failed to archive conversation:",
        error
      );
      toast.error("Failed to archive conversation.");
      throw error;
    }
  }

  async unarchiveConversation(conversationId: string): Promise<void> {
    try {
      const firestore = await getFirestoreInstance();
      const currentUserId = this.getCurrentUserId();
      const conversationRef = doc(
        firestore,
        CONVERSATIONS_COLLECTION,
        conversationId
      );
      await updateDoc(conversationRef, {
        [`archived.${currentUserId}`]: false,
      });
    } catch (error) {
      console.error(
        "[ConversationManager] Failed to unarchive conversation:",
        error
      );
      toast.error("Failed to unarchive conversation.");
      throw error;
    }
  }

  async markAllAsRead(): Promise<void> {
    try {
      const firestore = await getFirestoreInstance();
      const currentUserId = this.getCurrentUserId();
      const conversationsRef = collection(firestore, CONVERSATIONS_COLLECTION);
      const q = query(
        conversationsRef,
        where("participants", "array-contains", currentUserId)
      );

      const snapshot = await getDocs(q);
      const updates = snapshot.docs
        .filter((docSnap) => {
          const data = docSnap.data();
          const unreadCount =
            (data["unreadCount"] as Record<string, number>) || {};
          return (unreadCount[currentUserId] || 0) > 0;
        })
        .map((docSnap) =>
          updateDoc(docSnap.ref, {
            [`unreadCount.${currentUserId}`]: 0,
          })
        );

      await Promise.all(updates);
    } catch (error) {
      console.error("[ConversationManager] Failed to mark all as read:", error);
      toast.error("Failed to mark messages as read.");
      throw error;
    }
  }

  cleanup(): void {
    if (this.conversationsUnsubscribe) {
      this.conversationsUnsubscribe();
      this.conversationsUnsubscribe = null;
    }
    if (this.unreadCountUnsubscribe) {
      this.unreadCountUnsubscribe();
      this.unreadCountUnsubscribe = null;
    }
  }
}

export const conversationService = new ConversationManager();
