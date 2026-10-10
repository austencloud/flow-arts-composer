/**
 * FriendshipManager
 *
 * Manages the user's friend list (follow model, not mutual).
 * Friends can be invited to sessions and show online status.
 */

import {
	ref,
	set,
	get,
	remove,
	onValue,
	off,
	query,
	orderByChild,
	startAt,
	endAt,
	limitToFirst,
	type DatabaseReference
} from 'firebase/database';
import {
	getDatabaseInstance,
	getAuthSync,
	createHMRSafeDatabaseListener
} from '#lib/shared/auth/firebase.js';
import type {
	Friend,
	UserSearchResult,
	FriendFirebaseData
} from '../domain/models/connect-models';
import { FRIEND_CONFIG, FIREBASE_PATHS } from '../domain/models/connect-constants';
import type { PresenceTracker } from './presence-tracker';

export class FriendshipManager {
	private _friends: Friend[] = [];
	private _isLoaded = false;

	private friendsRef: DatabaseReference | null = null;
	private friendsUnsubscribe: (() => void) | null = null;

	// Callbacks
	private friendsChangeCallbacks: Set<(friends: Friend[]) => void> = new Set();

	constructor(private presenceTracker: PresenceTracker) {}

	get friends(): Friend[] {
		return this._friends;
	}

	get friendCount(): number {
		return this._friends.length;
	}

	get isLoaded(): boolean {
		return this._isLoaded;
	}

	async addFriend(userId: string, displayName: string): Promise<void> {
		const auth = getAuthSync();
		const user = auth.currentUser;
		if (!user) {
			throw new Error('Must be authenticated to add friends');
		}

		if (userId === user.uid) {
			throw new Error('Cannot add yourself as a friend');
		}

		if (this._friends.length >= FRIEND_CONFIG.MAX_FRIENDS) {
			throw new Error('Friend list is full');
		}

		if (this.isFriend(userId)) {
			return; // Already a friend
		}

		const database = await getDatabaseInstance();
		const friendRef = ref(database, `${FIREBASE_PATHS.FRIENDS}/${user.uid}/${userId}`);

		const friendData: FriendFirebaseData = {
			displayName,
			addedAt: Date.now()
		};

		await set(friendRef, friendData);

		// Start watching their presence
		this.presenceTracker.watchUser(userId);

	}

	async removeFriend(userId: string): Promise<void> {
		const auth = getAuthSync();
		const user = auth.currentUser;
		if (!user) {
			throw new Error('Must be authenticated to remove friends');
		}

		const database = await getDatabaseInstance();
		const friendRef = ref(database, `${FIREBASE_PATHS.FRIENDS}/${user.uid}/${userId}`);

		await remove(friendRef);

		// Stop watching their presence
		this.presenceTracker.unwatchUser(userId);

	}

	isFriend(userId: string): boolean {
		return this._friends.some((f) => f.userId === userId);
	}

	getFriend(userId: string): Friend | null {
		return this._friends.find((f) => f.userId === userId) ?? null;
	}

	async setNickname(userId: string, nickname: string | null): Promise<void> {
		const auth = getAuthSync();
		const user = auth.currentUser;
		if (!user) {
			throw new Error('Must be authenticated to set nicknames');
		}

		const friend = this.getFriend(userId);
		if (!friend) {
			throw new Error('User is not a friend');
		}

		const database = await getDatabaseInstance();
		const friendRef = ref(database, `${FIREBASE_PATHS.FRIENDS}/${user.uid}/${userId}`);

		const friendData: FriendFirebaseData = {
			displayName: friend.displayName,
			addedAt: friend.addedAt,
			...(nickname ? { nickname } : {})
		};

		await set(friendRef, friendData);

	}

	async searchUsers(queryStr: string): Promise<UserSearchResult[]> {
		if (queryStr.length < FRIEND_CONFIG.MIN_SEARCH_LENGTH) {
			return [];
		}

		const auth = getAuthSync();
		const currentUserId = auth.currentUser?.uid;

		const database = await getDatabaseInstance();
		const usersRef = ref(database, FIREBASE_PATHS.USERS);

		// Query users whose displayName starts with the query string
		// Firebase doesn't support full-text search, so we use prefix matching
		const searchQuery = query(
			usersRef,
			orderByChild('displayNameLower'),
			startAt(queryStr.toLowerCase()),
			endAt(queryStr.toLowerCase() + '\uf8ff'),
			limitToFirst(FRIEND_CONFIG.MAX_SEARCH_RESULTS)
		);

		const snapshot = await get(searchQuery);
		const data = snapshot.val() as Record<
			string,
			{ displayName: string; photoURL?: string; displayNameLower?: string }
		> | null;

		if (!data) {
			return [];
		}

		const results: UserSearchResult[] = Object.entries(data)
			.filter(([userId]) => userId !== currentUserId) // Exclude self
			.map(([userId, userData]) => ({
				userId,
				displayName: userData.displayName,
				photoURL: userData.photoURL,
				isOnline: this.presenceTracker.isUserOnline(userId),
				isFriend: this.isFriend(userId)
			}));

		return results;
	}

	async getUserProfile(
		userId: string
	): Promise<{ displayName: string; photoURL?: string } | null> {
		const database = await getDatabaseInstance();
		const userRef = ref(database, `${FIREBASE_PATHS.USERS}/${userId}`);

		const snapshot = await get(userRef);
		const data = snapshot.val() as { displayName: string; photoURL?: string } | null;

		return data;
	}

	onFriendsChange(callback: (friends: Friend[]) => void): () => void {
		this.friendsChangeCallbacks.add(callback);

		// Immediately notify with current state
		callback(this._friends);

		return () => {
			this.friendsChangeCallbacks.delete(callback);
		};
	}

	async loadFriends(): Promise<void> {
		const auth = getAuthSync();
		const user = auth.currentUser;
		if (!user) {
			return;
		}

		// Stop any existing listener
		if (this.friendsUnsubscribe) {
			this.friendsUnsubscribe();
		}

		this.friendsUnsubscribe = createHMRSafeDatabaseListener(
			'friends-listener',
			`${FIREBASE_PATHS.FRIENDS}/${user.uid}`,
			() => {
				let cleanup: (() => void) | null = null;

				// Setup async - IIFE to avoid returning Promise
				(async () => {
					const database = await getDatabaseInstance();
					this.friendsRef = ref(database, `${FIREBASE_PATHS.FRIENDS}/${user.uid}`);

					const handleValue = (snapshot: {
						val: () => Record<string, FriendFirebaseData> | null;
					}) => {
						const data = snapshot.val();

						if (!data) {
							this._friends = [];
							this._isLoaded = true;
							this.notifyFriendsChange();
							return;
						}

						// Convert to array
						const friends: Friend[] = Object.entries(data).map(([userId, f]) => ({
							userId,
							displayName: f.displayName,
							addedAt: f.addedAt,
							nickname: f.nickname
						}));

						// Update presence watchers
						const oldFriendIds = new Set(this._friends.map((f) => f.userId));
						const newFriendIds = new Set(friends.map((f) => f.userId));

						// Start watching new friends
						for (const friend of friends) {
							if (!oldFriendIds.has(friend.userId)) {
								this.presenceTracker.watchUser(friend.userId);
							}
						}

						// Stop watching removed friends
						for (const oldFriend of this._friends) {
							if (!newFriendIds.has(oldFriend.userId)) {
								this.presenceTracker.unwatchUser(oldFriend.userId);
							}
						}

						this._friends = friends;
						this._isLoaded = true;
						this.notifyFriendsChange();
					};

					onValue(this.friendsRef, handleValue);

					cleanup = () => {
						if (this.friendsRef) {
							off(this.friendsRef, 'value', handleValue);
						}
					};
				})();

				// Return sync cleanup that defers to async setup
				return () => {
					if (cleanup) cleanup();
				};
			}
		);

	}

	destroy(): void {
		if (this.friendsUnsubscribe) {
			this.friendsUnsubscribe();
			this.friendsUnsubscribe = null;
		}

		// Stop watching all friends
		for (const friend of this._friends) {
			this.presenceTracker.unwatchUser(friend.userId);
		}

		this._friends = [];
		this._isLoaded = false;
		this.friendsRef = null;
		this.friendsChangeCallbacks.clear();
	}

	private notifyFriendsChange(): void {
		for (const callback of this.friendsChangeCallbacks) {
			callback(this._friends);
		}
	}
}
