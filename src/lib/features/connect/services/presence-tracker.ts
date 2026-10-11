/**
 * PresenceTracker
 *
 * Manages online/offline presence for the current user
 * and tracks presence of other users.
 * Uses Firebase RTDB with onDisconnect() for automatic cleanup.
 */

import {
	ref,
	set,
	onValue,
	off,
	onDisconnect,
	serverTimestamp,
	type DatabaseReference
} from 'firebase/database';
import {
	getDatabaseInstance,
	getAuthSync,
	createHMRSafeDatabaseListener
} from '#lib/shared/auth/firebase.js';
import type { UserPresence, PresenceFirebaseData } from '../domain/models/connect-models';
import { PRESENCE_CONFIG, FIREBASE_PATHS } from '../domain/models/connect-constants';

export class PresenceTracker {
	private _isTracking = false;
	private _myPresence: UserPresence | null = null;
	private myPresenceRef: DatabaseReference | null = null;
	private disconnectRef: ReturnType<typeof onDisconnect> | null = null;
	private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

	// Watchers for other users
	private watchedUsers: Map<string, UserPresence> = new Map();
	private userWatchers: Map<string, () => void> = new Map();

	// Callbacks
	private presenceCallbacks: Set<(userId: string, presence: UserPresence) => void> = new Set();

	get isTracking(): boolean {
		return this._isTracking;
	}

	get currentUserId(): string | null {
		return this._myPresence?.userId ?? null;
	}

	get myPresence(): UserPresence | null {
		return this._myPresence;
	}

	async goOnline(): Promise<void> {
		if (this._isTracking) {
			return;
		}

		const auth = getAuthSync();
		const user = auth.currentUser;
		if (!user) {
			console.warn('[PresenceTracker] Cannot go online: user not authenticated');
			return;
		}

		const database = await getDatabaseInstance();
		this.myPresenceRef = ref(database, `${FIREBASE_PATHS.PRESENCE}/${user.uid}`);

		// Create presence data
		const presenceData: PresenceFirebaseData = {
			online: true,
			displayName: user.displayName || 'Anonymous',
			lastSeen: Date.now()
		};

		// Set up onDisconnect handler FIRST
		this.disconnectRef = onDisconnect(this.myPresenceRef);
		await this.disconnectRef.set({
			online: false,
			displayName: presenceData.displayName,
			lastSeen: serverTimestamp()
		});

		// Write presence data
		await set(this.myPresenceRef, {
			...presenceData,
			lastSeen: serverTimestamp()
		});

		this._myPresence = {
			userId: user.uid,
			online: true,
			displayName: presenceData.displayName,
			lastSeen: Date.now()
		};

		// Start heartbeat
		this.startHeartbeat();

		this._isTracking = true;
	}

	async goOffline(): Promise<void> {
		if (!this._isTracking || !this.myPresenceRef) {
			return;
		}

		this.stopHeartbeat();

		try {
			// Cancel onDisconnect since we're cleaning up manually
			if (this.disconnectRef) {
				await this.disconnectRef.cancel();
				this.disconnectRef = null;
			}

			// Update presence to offline
			await set(this.myPresenceRef, {
				online: false,
				displayName: this._myPresence?.displayName || 'Anonymous',
				lastSeen: serverTimestamp()
			});
		} catch (error) {
			console.error('[PresenceTracker] Error going offline:', error);
		} finally {
			this.myPresenceRef = null;
			this._myPresence = null;
			this._isTracking = false;
		}
	}

	async setCurrentSession(sessionId: string | null): Promise<void> {
		if (!this._isTracking || !this.myPresenceRef || !this._myPresence) {
			return;
		}

		const update: Partial<PresenceFirebaseData> = { // eslint-disable-line @typescript-eslint/no-unused-vars
			currentSessionId: sessionId ?? undefined,
			lastSeen: Date.now()
		};

		await set(this.myPresenceRef, {
			online: true,
			displayName: this._myPresence.displayName,
			lastSeen: serverTimestamp(),
			...(sessionId ? { currentSessionId: sessionId } : {})
		});

		this._myPresence = {
			...this._myPresence,
			currentSessionId: sessionId ?? undefined
		};
	}

	watchUser(userId: string): () => void {
		if (this.userWatchers.has(userId)) {
			// Already watching
			return () => this.unwatchUser(userId);
		}

		const setupWatcher = async () => {
			const database = await getDatabaseInstance();
			const userRef = ref(database, `${FIREBASE_PATHS.PRESENCE}/${userId}`);

			const unsubscribe = createHMRSafeDatabaseListener(
				`presence-watcher-${userId}`,
				`${FIREBASE_PATHS.PRESENCE}/${userId}`,
				() => {
					const handleValue = (snapshot: { val: () => PresenceFirebaseData | null }) => {
						const data = snapshot.val();
						if (data) {
							const presence: UserPresence = {
								userId,
								online: data.online,
								displayName: data.displayName,
								lastSeen: typeof data.lastSeen === 'number' ? data.lastSeen : Date.now(),
								currentSessionId: data.currentSessionId
							};
							this.watchedUsers.set(userId, presence);
							this.notifyPresenceChange(userId, presence);
						} else {
							// User has no presence data - treat as offline
							const offlinePresence: UserPresence = {
								userId,
								online: false,
								displayName: 'Unknown',
								lastSeen: 0
							};
							this.watchedUsers.set(userId, offlinePresence);
							this.notifyPresenceChange(userId, offlinePresence);
						}
					};

					onValue(userRef, handleValue);

					return () => {
						off(userRef, 'value', handleValue);
					};
				}
			);

			this.userWatchers.set(userId, unsubscribe);
		};

		setupWatcher().catch((err) => {
			console.error(`[PresenceTracker] Error watching user ${userId}:`, err);
		});

		return () => this.unwatchUser(userId);
	}

	unwatchUser(userId: string): void {
		const unsubscribe = this.userWatchers.get(userId);
		if (unsubscribe) {
			unsubscribe();
			this.userWatchers.delete(userId);
			this.watchedUsers.delete(userId);
		}
	}

	isUserOnline(userId: string): boolean {
		const presence = this.watchedUsers.get(userId);
		return presence?.online ?? false;
	}

	getUserPresence(userId: string): UserPresence | null {
		return this.watchedUsers.get(userId) ?? null;
	}

	getOnlineUsers(userIds: string[]): string[] {
		return userIds.filter((id) => this.isUserOnline(id));
	}

	watchUsers(userIds: string[]): () => void {
		const unsubscribes = userIds.map((id) => this.watchUser(id));

		return () => {
			unsubscribes.forEach((unsub) => unsub());
		};
	}

	onPresenceChange(callback: (userId: string, presence: UserPresence) => void): () => void {
		this.presenceCallbacks.add(callback);
		return () => {
			this.presenceCallbacks.delete(callback);
		};
	}

	destroy(): void {
		this.goOffline().catch((err) => {
			console.warn('[PresenceTracker] Cleanup error:', err);
		});

		// Stop all watchers
		for (const unsubscribe of this.userWatchers.values()) {
			unsubscribe();
		}
		this.userWatchers.clear();
		this.watchedUsers.clear();
		this.presenceCallbacks.clear();
	}

	private startHeartbeat(): void {
		this.heartbeatInterval = setInterval(async () => {
			if (this._isTracking && this.myPresenceRef && this._myPresence) {
				try {
					await set(this.myPresenceRef, {
						online: true,
						displayName: this._myPresence.displayName,
						lastSeen: serverTimestamp(),
						...(this._myPresence.currentSessionId
							? { currentSessionId: this._myPresence.currentSessionId }
							: {})
					});
				} catch (error) {
					console.warn('[PresenceTracker] Heartbeat failed:', error);
				}
			}
		}, PRESENCE_CONFIG.HEARTBEAT_INTERVAL_MS);
	}

	private stopHeartbeat(): void {
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
			this.heartbeatInterval = null;
		}
	}

	private notifyPresenceChange(userId: string, presence: UserPresence): void {
		for (const callback of this.presenceCallbacks) {
			callback(userId, presence);
		}
	}
}
