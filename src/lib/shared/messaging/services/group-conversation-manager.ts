import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
import { mapDocToConversation } from "./conversation-mappers";
import type {
  Conversation,
  GetOrCreateConversationResult,
  ParticipantInfo,
  CreateGroupInput,
  CreateGroupResult,
  GroupMetadata,
} from "../domain/models/conversation-models";

const CONVERSATIONS_COLLECTION = "conversations";
const MAX_GROUP_PARTICIPANTS = 50;

export interface GroupConversationDeps {
  getCurrentUserId: () => string;
  getEffectiveUserInfo: () => {
    uid: string;
    displayName: string;
    username?: string;
    photoURL: string | null;
  };
  fetchUserInfo: (userId: string) => Promise<{
    displayName: string;
    username?: string | null;
    photoURL?: string;
  }>;
  getConversation: (conversationId: string) => Promise<Conversation | null>;
}

function isGroupAdmin(conversation: Conversation, userId: string): boolean {
  return conversation.groupMetadata?.adminIds.includes(userId) ?? false;
}

export class GroupConversationManager {
  constructor(private deps: GroupConversationDeps) {}

  async createGroup(input: CreateGroupInput): Promise<CreateGroupResult> {
    try {
      const firestore = await getFirestoreInstance();
      const currentUserId = this.deps.getCurrentUserId();
      const effectiveUser = this.deps.getEffectiveUserInfo();
      const conversationId = crypto.randomUUID();
      const now = new Date();

      const allParticipantIds = [
        currentUserId,
        ...input.participantIds.filter((id) => id !== currentUserId),
      ];
      if (allParticipantIds.length > MAX_GROUP_PARTICIPANTS) {
        throw new Error(`Groups cannot exceed ${MAX_GROUP_PARTICIPANTS} members`);
      }
      if (allParticipantIds.length < 2) {
        throw new Error("Groups require at least 2 participants");
      }

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
      };

      const failedInvites: string[] = [];
      for (const userId of input.participantIds) {
        if (userId === currentUserId) continue;
        try {
          const userInfo = await this.deps.fetchUserInfo(userId);
          if (userInfo.displayName === "Unknown User") {
            failedInvites.push(userId);
            continue;
          }
          participantInfo[userId] = {
            userId,
            displayName: userInfo.displayName,
            ...(userInfo.username !== undefined && {
              username: userInfo.username,
            }),
            ...(userInfo.photoURL && { avatar: userInfo.photoURL }),
            joinedAt: now,
          };
        } catch {
          failedInvites.push(userId);
        }
      }

      const validParticipants = allParticipantIds.filter(
        (id) => !failedInvites.includes(id)
      );

      if (validParticipants.length < 2) {
        throw new Error("Not enough valid participants to create group");
      }

      const unreadCount: Record<string, number> = {};
      for (const userId of validParticipants) {
        unreadCount[userId] = 0;
      }

      const groupMetadata: GroupMetadata = {
        name: input.name,
        ...(input.description !== undefined && { description: input.description }),
        adminIds: [currentUserId],
        createdBy: currentUserId,
      };

      const newConversation: Omit<Conversation, "id"> = {
        type: "group",
        participants: validParticipants.sort(),
        participantInfo,
        unreadCount,
        createdAt: now,
        updatedAt: now,
        groupMetadata,
      };

      const conversationRef = doc(
        firestore,
        CONVERSATIONS_COLLECTION,
        conversationId
      );

      await setDoc(conversationRef, {
        ...newConversation,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return {
        conversation: { id: conversationId, ...newConversation },
        failedInvites: failedInvites.length > 0 ? failedInvites : undefined,
      };
    } catch (error) {
      console.error("[GroupConversationManager] Failed to create group:", error);
      toast.error("Failed to create group.");
      throw error;
    }
  }

  async getOrCreateGroupConversation(
    participantIds: string[],
    groupName?: string
  ): Promise<GetOrCreateConversationResult> {
    try {
      const firestore = await getFirestoreInstance();
      const currentUserId = this.deps.getCurrentUserId();

      const allParticipantIds = [
        currentUserId,
        ...participantIds.filter((id) => id !== currentUserId),
      ].sort();

      const conversationsRef = collection(firestore, CONVERSATIONS_COLLECTION);
      const q = query(
        conversationsRef,
        where("type", "==", "group"),
        where("participants", "array-contains", currentUserId)
      );

      const snapshot = await getDocs(q);

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const existingParticipants = (data.participants as string[]).sort();

        if (
          existingParticipants.length === allParticipantIds.length &&
          existingParticipants.every((id, i) => id === allParticipantIds[i])
        ) {
          return {
            conversation: mapDocToConversation(docSnap.id, data),
            isNew: false,
          };
        }
      }

      let finalGroupName = groupName?.trim();
      if (!finalGroupName) {
        const names: string[] = [];
        for (const userId of participantIds) {
          const userInfo = await this.deps.fetchUserInfo(userId);
          const firstName = userInfo.displayName?.split(" ")[0] ?? "User";
          names.push(firstName);
        }
        finalGroupName = names.join(", ");
      }

      const result = await this.createGroup({
        name: finalGroupName,
        participantIds,
      });

      return {
        conversation: result.conversation,
        isNew: true,
      };
    } catch (error) {
      console.error(
        "[GroupConversationManager] Failed to get or create group:",
        error
      );
      toast.error("Failed to start group conversation.");
      throw error;
    }
  }

  async addGroupMember(conversationId: string, userId: string): Promise<void> {
    try {
      const firestore = await getFirestoreInstance();
      const currentUserId = this.deps.getCurrentUserId();
      const conversation = await this.deps.getConversation(conversationId);

      if (!conversation) {
        throw new Error("Conversation not found");
      }
      if (conversation.type !== "group") {
        throw new Error("Cannot add members to a direct conversation");
      }
      if (!isGroupAdmin(conversation, currentUserId)) {
        throw new Error("Only admins can add members");
      }
      if (conversation.participants.includes(userId)) {
        throw new Error("User is already a member");
      }
      if (conversation.participants.length >= MAX_GROUP_PARTICIPANTS) {
        throw new Error(`Group is at maximum capacity (${MAX_GROUP_PARTICIPANTS})`);
      }

      const userInfo = await this.deps.fetchUserInfo(userId);
      const now = new Date();

      const conversationRef = doc(
        firestore,
        CONVERSATIONS_COLLECTION,
        conversationId
      );

      await updateDoc(conversationRef, {
        participants: arrayUnion(userId),
        [`participantInfo.${userId}`]: {
          userId,
          displayName: userInfo.displayName,
          ...(userInfo.username !== undefined && {
            username: userInfo.username,
          }),
          ...(userInfo.photoURL && { avatar: userInfo.photoURL }),
          joinedAt: now,
        },
        [`unreadCount.${userId}`]: 0,
        updatedAt: serverTimestamp(),
      });

      toast.success(`Added ${userInfo.displayName} to the group`);
    } catch (error) {
      console.error("[GroupConversationManager] Failed to add group member:", error);
      toast.error("Failed to add member to group.");
      throw error;
    }
  }

  async removeGroupMember(
    conversationId: string,
    userId: string
  ): Promise<void> {
    try {
      const firestore = await getFirestoreInstance();
      const currentUserId = this.deps.getCurrentUserId();
      const conversation = await this.deps.getConversation(conversationId);

      if (!conversation) {
        throw new Error("Conversation not found");
      }
      if (conversation.type !== "group") {
        throw new Error("Cannot remove members from a direct conversation");
      }
      if (!isGroupAdmin(conversation, currentUserId)) {
        throw new Error("Only admins can remove members");
      }
      if (!conversation.participants.includes(userId)) {
        throw new Error("User is not a member");
      }
      if (conversation.groupMetadata?.createdBy === userId) {
        throw new Error("Cannot remove the group creator");
      }

      const conversationRef = doc(
        firestore,
        CONVERSATIONS_COLLECTION,
        conversationId
      );

      const updates: Record<string, unknown> = {
        participants: arrayRemove(userId),
        updatedAt: serverTimestamp(),
      };

      if (conversation.groupMetadata?.adminIds.includes(userId)) {
        updates["groupMetadata.adminIds"] = arrayRemove(userId);
      }

      await updateDoc(conversationRef, updates);
      toast.success("Removed member from group");
    } catch (error) {
      console.error(
        "[GroupConversationManager] Failed to remove group member:",
        error
      );
      toast.error("Failed to remove member from group.");
      throw error;
    }
  }

  async leaveGroup(conversationId: string): Promise<void> {
    try {
      const firestore = await getFirestoreInstance();
      const currentUserId = this.deps.getCurrentUserId();
      const conversation = await this.deps.getConversation(conversationId);

      if (!conversation) {
        throw new Error("Conversation not found");
      }
      if (conversation.type !== "group") {
        throw new Error("Cannot leave a direct conversation");
      }
      if (!conversation.participants.includes(currentUserId)) {
        throw new Error("You are not a member of this group");
      }

      const conversationRef = doc(
        firestore,
        CONVERSATIONS_COLLECTION,
        conversationId
      );

      const updates: Record<string, unknown> = {
        participants: arrayRemove(currentUserId),
        updatedAt: serverTimestamp(),
      };

      if (conversation.groupMetadata?.adminIds.includes(currentUserId)) {
        updates["groupMetadata.adminIds"] = arrayRemove(currentUserId);

        const remainingAdmins = conversation.groupMetadata.adminIds.filter(
          (id) => id !== currentUserId
        );
        if (remainingAdmins.length === 0) {
          const remainingMembers = conversation.participants.filter(
            (id) => id !== currentUserId
          );
          if (remainingMembers.length > 0) {
            updates["groupMetadata.adminIds"] = arrayUnion(remainingMembers[0]);
          }
        }
      }

      await updateDoc(conversationRef, updates);
      toast.success("You left the group");
    } catch (error) {
      console.error("[GroupConversationManager] Failed to leave group:", error);
      toast.error("Failed to leave group.");
      throw error;
    }
  }

  async updateGroupMetadata(
    conversationId: string,
    updates: Partial<Pick<GroupMetadata, "name" | "description" | "avatarUrl">>
  ): Promise<void> {
    try {
      const firestore = await getFirestoreInstance();
      const currentUserId = this.deps.getCurrentUserId();
      const conversation = await this.deps.getConversation(conversationId);

      if (!conversation) {
        throw new Error("Conversation not found");
      }
      if (conversation.type !== "group") {
        throw new Error("Cannot update metadata for a direct conversation");
      }
      if (!isGroupAdmin(conversation, currentUserId)) {
        throw new Error("Only admins can update group metadata");
      }

      const conversationRef = doc(
        firestore,
        CONVERSATIONS_COLLECTION,
        conversationId
      );

      const firestoreUpdates: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      };

      if (updates.name !== undefined) {
        firestoreUpdates["groupMetadata.name"] = updates.name;
      }
      if (updates.description !== undefined) {
        firestoreUpdates["groupMetadata.description"] = updates.description;
      }
      if (updates.avatarUrl !== undefined) {
        firestoreUpdates["groupMetadata.avatarUrl"] = updates.avatarUrl;
      }

      await updateDoc(conversationRef, firestoreUpdates);
      toast.success("Group updated");
    } catch (error) {
      console.error(
        "[GroupConversationManager] Failed to update group metadata:",
        error
      );
      toast.error("Failed to update group.");
      throw error;
    }
  }

  async setAdminStatus(
    conversationId: string,
    userId: string,
    isAdmin: boolean
  ): Promise<void> {
    try {
      const firestore = await getFirestoreInstance();
      const currentUserId = this.deps.getCurrentUserId();
      const conversation = await this.deps.getConversation(conversationId);

      if (!conversation) {
        throw new Error("Conversation not found");
      }
      if (conversation.type !== "group") {
        throw new Error("Cannot set admin status for a direct conversation");
      }
      if (!isGroupAdmin(conversation, currentUserId)) {
        throw new Error("Only admins can change admin status");
      }
      if (!conversation.participants.includes(userId)) {
        throw new Error("User is not a member of this group");
      }

      const conversationRef = doc(
        firestore,
        CONVERSATIONS_COLLECTION,
        conversationId
      );

      await updateDoc(conversationRef, {
        "groupMetadata.adminIds": isAdmin
          ? arrayUnion(userId)
          : arrayRemove(userId),
        updatedAt: serverTimestamp(),
      });

      const userInfo = conversation.participantInfo[userId];
      toast.success(
        isAdmin
          ? `${userInfo?.displayName || "User"} is now an admin`
          : `${userInfo?.displayName || "User"} is no longer an admin`
      );
    } catch (error) {
      console.error(
        "[GroupConversationManager] Failed to set admin status:",
        error
      );
      toast.error("Failed to update admin status.");
      throw error;
    }
  }
}
