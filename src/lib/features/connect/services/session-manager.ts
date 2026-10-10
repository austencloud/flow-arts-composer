/**
 * SessionManager
 *
 * Manages sync session lifecycle: create, join, leave.
 * Integrates with existing LanSyncCoordinator for PeerJS sync.
 */

import {
	ref,
	set,
	get,
	remove,
	update,
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
import type {
	SyncSession,
	SessionParticipant,
	DisplayPreference,
	SessionFirebaseData,
	ParticipantFirebaseData
} from '../domain/models/connect-models';
import { SESSION_CONFIG, FIREBASE_PATHS } from '../domain/models/connect-constants';
import { toast } from '#lib/shared/toast/state/toast-state.svelte.js';

export class SessionManager {
	private _currentSession: SyncSession | null = null;
	private _participants: SessionParticipant[] = [];
	private _isHost = false;
	private _isSynced = true;
	private _displayPreference: DisplayPreference = 'pictograph';

	private sessionRef: DatabaseReference | null = null;
	private participantRef: DatabaseReference | null = null;
	private disconnectRef: ReturnType<typeof onDisconnect> | null = null;
	private sessionUnsubscribe: (() => void) | null = null;
	private nearbySessionsUnsubscribe: (() => void) | null = null;

	private _nearbySessions: SyncSession[] = [];

	// Callbacks
	private nearbySessionsCallbacks: Set<(sessions: SyncSession[]) => void> = new Set();
	private participantJoinCallbacks: Set<(participant: SessionParticipant) => void> = new Set();
	private participantLeaveCallbacks: Set<(userId: string) => void> = new Set();
	private sessionClosedCallbacks: Set<(reason: 'host_left' | 'timeout' | 'error') => void> =
		new Set();

	get currentSession(): SyncSession | null {
		return this._currentSession;
	}

	get isInSession(): boolean {
		return this._currentSession !== null;
	}

	get isHost(): boolean {
		return this._isHost;
	}

	get participants(): SessionParticipant[] {
		return this._participants;
	}

	async createSession(sequenceId: string, sequenceWord: string): Promise<string> {
		// Leave any existing session first
		if (this.isInSession) {
			await this.leaveSession();
		}

		const auth = getAuthSync();
		const user = auth.currentUser;
		if (!user) {
			throw new Error('Must be authenticated to create a session');
		}

		const database = await getDatabaseInstance();

		// Generate unique session ID
		const sessionId = this.generateSessionId();
		const peerJsRoomCode = this.derivePeerJsRoomCode(sessionId);

		this.sessionRef = ref(database, `${FIREBASE_PATHS.SESSIONS}/${sessionId}`);

		// Create session data
		const sessionData: SessionFirebaseData = {
			hostUserId: user.uid,
			hostDisplayName: user.displayName || 'Anonymous',
			sequenceId,
			sequenceWord,
			peerJsRoomCode,
			createdAt: Date.now(),
			participants: {
				[user.uid]: {
					displayName: user.displayName || 'Anonymous',
					joinedAt: Date.now(),
					displayPreference: this._displayPreference,
					isSynced: true
				}
			}
		};

		// Set up onDisconnect to clean up session when host disconnects
		this.disconnectRef = onDisconnect(this.sessionRef);
		await this.disconnectRef.remove();

		// Write session data
		await set(this.sessionRef, {
			...sessionData,
			createdAt: serverTimestamp(),
			participants: {
				[user.uid]: {
					...sessionData.participants[user.uid],
					joinedAt: serverTimestamp()
				}
			}
		});

		// Update local state
		this._currentSession = {
			sessionId,
			hostUserId: user.uid,
			hostDisplayName: sessionData.hostDisplayName,
			sequenceId,
			sequenceWord,
			peerJsRoomCode,
			createdAt: Date.now(),
			participantCount: 1
		};
		this._isHost = true;
		this._participants = [
			{
				userId: user.uid,
				displayName: sessionData.hostDisplayName,
				joinedAt: Date.now(),
				displayPreference: this._displayPreference,
				isSynced: true
			}
		];

		// Start watching for participant changes
		this.watchSession(sessionId);

		return sessionId;
	}

	async joinSession(sessionId: string, displayPreference?: DisplayPreference): Promise<void> {
		// Leave any existing session first
		if (this.isInSession) {
			await this.leaveSession();
		}

		const auth = getAuthSync();
		const user = auth.currentUser;
		if (!user) {
			throw new Error('Must be authenticated to join a session');
		}

		const database = await getDatabaseInstance();
		this.sessionRef = ref(database, `${FIREBASE_PATHS.SESSIONS}/${sessionId}`);

		// Get session data
		const snapshot = await get(this.sessionRef);
		const sessionData = snapshot.val() as SessionFirebaseData | null;

		if (!sessionData) {
			throw new Error('Session not found');
		}

		// Check participant limit
		const participantCount = Object.keys(sessionData.participants || {}).length;
		if (participantCount >= SESSION_CONFIG.MAX_PARTICIPANTS) {
			throw new Error('Session is full');
		}

		// Add self as participant
		const pref = displayPreference ?? this._displayPreference;
		this.participantRef = ref(
			database,
			`${FIREBASE_PATHS.SESSIONS}/${sessionId}/participants/${user.uid}`
		);

		const participantData: ParticipantFirebaseData = {
			displayName: user.displayName || 'Anonymous',
			joinedAt: Date.now(),
			displayPreference: pref,
			isSynced: true
		};

		// Set up onDisconnect to remove self when disconnecting
		this.disconnectRef = onDisconnect(this.participantRef);
		await this.disconnectRef.remove();

		// Write participant data
		await set(this.participantRef, {
			...participantData,
			joinedAt: serverTimestamp()
		});

		// Update local state
		this._currentSession = {
			sessionId,
			hostUserId: sessionData.hostUserId,
			hostDisplayName: sessionData.hostDisplayName,
			sequenceId: sessionData.sequenceId,
			sequenceWord: sessionData.sequenceWord,
			peerJsRoomCode: sessionData.peerJsRoomCode,
			createdAt:
				typeof sessionData.createdAt === 'number' ? sessionData.createdAt : Date.now(),
			participantCount: participantCount + 1
		};
		this._isHost = false;
		this._displayPreference = pref;

		// Start watching for changes
		this.watchSession(sessionId);

	}

	async leaveSession(): Promise<void> {
		if (!this.isInSession || !this._currentSession) {
			return;
		}

		const sessionId = this._currentSession.sessionId;

		try {
			// Cancel onDisconnect handler
			if (this.disconnectRef) {
				await this.disconnectRef.cancel();
				this.disconnectRef = null;
			}

			if (this._isHost) {
				// Host leaving - delete entire session
				if (this.sessionRef) {
					await remove(this.sessionRef);
				}
			} else {
				// Participant leaving - just remove self
				if (this.participantRef) {
					await remove(this.participantRef);
				}
			}
		} catch (error) {
			console.error('[SessionManager] Error leaving session:', error);
			toast.error('Failed to leave session. Please check your connection and try again.');
			throw error;
		} finally {
			// Stop watching
			if (this.sessionUnsubscribe) {
				this.sessionUnsubscribe();
				this.sessionUnsubscribe = null;
			}

			// Clear state
			this.sessionRef = null;
			this.participantRef = null;
			this._currentSession = null;
			this._participants = [];
			this._isHost = false;

		}
	}

	async updateDisplayPreference(preference: DisplayPreference): Promise<void> {
		if (!this.isInSession || !this.participantRef) {
			return;
		}

		const previous = this._displayPreference;
		this._displayPreference = preference;

		try {
			await update(this.participantRef, {
				displayPreference: preference
			});
		} catch (error) {
			console.error('[SessionManager] Error updating display preference:', error);
			// Roll back so local state matches what actually persisted.
			this._displayPreference = previous;
			toast.error('Failed to update display preference. Other participants may see stale data.');
			throw error;
		}
	}

	async toggleSyncMode(): Promise<boolean> {
		if (!this.isInSession || !this.participantRef) {
			return this._isSynced;
		}

		const previous = this._isSynced;
		this._isSynced = !this._isSynced;

		try {
			await update(this.participantRef, {
				isSynced: this._isSynced
			});
		} catch (error) {
			console.error('[SessionManager] Error toggling sync mode:', error);
			// Roll back so the returned value reflects what actually persisted.
			this._isSynced = previous;
			toast.error('Failed to change sync mode. Please try again.');
		}

		return this._isSynced;
	}

	getNearbySessions(): SyncSession[] {
		return this._nearbySessions;
	}

	onNearbySessionsChange(callback: (sessions: SyncSession[]) => void): () => void {
		this.nearbySessionsCallbacks.add(callback);

		// Start discovery if not already running
		if (!this.nearbySessionsUnsubscribe) {
			this.startNearbySessionsDiscovery();
		}

		// Immediately notify with current state
		callback(this._nearbySessions);

		return () => {
			this.nearbySessionsCallbacks.delete(callback);

			// Stop discovery if no more listeners
			if (this.nearbySessionsCallbacks.size === 0 && this.nearbySessionsUnsubscribe) {
				this.nearbySessionsUnsubscribe();
				this.nearbySessionsUnsubscribe = null;
			}
		};
	}

	onParticipantJoin(callback: (participant: SessionParticipant) => void): () => void {
		this.participantJoinCallbacks.add(callback);
		return () => {
			this.participantJoinCallbacks.delete(callback);
		};
	}

	onParticipantLeave(callback: (userId: string) => void): () => void {
		this.participantLeaveCallbacks.add(callback);
		return () => {
			this.participantLeaveCallbacks.delete(callback);
		};
	}

	onSessionClosed(callback: (reason: 'host_left' | 'timeout' | 'error') => void): () => void {
		this.sessionClosedCallbacks.add(callback);
		return () => {
			this.sessionClosedCallbacks.delete(callback);
		};
	}

	async getSession(sessionId: string): Promise<SyncSession | null> {
		const database = await getDatabaseInstance();
		const sessionRef = ref(database, `${FIREBASE_PATHS.SESSIONS}/${sessionId}`);
		const snapshot = await get(sessionRef);
		const data = snapshot.val() as SessionFirebaseData | null;

		if (!data) {
			return null;
		}

		return {
			sessionId,
			hostUserId: data.hostUserId,
			hostDisplayName: data.hostDisplayName,
			sequenceId: data.sequenceId,
			sequenceWord: data.sequenceWord,
			peerJsRoomCode: data.peerJsRoomCode,
			createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
			participantCount: Object.keys(data.participants || {}).length
		};
	}

	destroy(): void {
		this.leaveSession().catch((err) => {
			console.warn('[SessionManager] Cleanup error:', err);
		});

		if (this.nearbySessionsUnsubscribe) {
			this.nearbySessionsUnsubscribe();
			this.nearbySessionsUnsubscribe = null;
		}

		this.nearbySessionsCallbacks.clear();
		this.participantJoinCallbacks.clear();
		this.participantLeaveCallbacks.clear();
		this.sessionClosedCallbacks.clear();
	}

	private generateSessionId(): string {
		// Generate a cryptographically secure unique session ID
		const timestamp = Date.now().toString(36);
		const randomBytes = new Uint8Array(6);
		crypto.getRandomValues(randomBytes);
		const random = Array.from(randomBytes)
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');
		return `${timestamp}-${random}`.toUpperCase();
	}

	private derivePeerJsRoomCode(sessionId: string): string {
		// Use first 8 chars of session ID as PeerJS room code
		return sessionId.substring(0, 8);
	}

	private watchSession(sessionId: string): void {
		if (this.sessionUnsubscribe) {
			this.sessionUnsubscribe();
		}

		const auth = getAuthSync();
		const currentUserId = auth.currentUser?.uid;

		this.sessionUnsubscribe = createHMRSafeDatabaseListener(
			`session-watcher-${sessionId}`,
			`${FIREBASE_PATHS.SESSIONS}/${sessionId}`,
			() => {
				let cleanup: (() => void) | null = null;

				// Setup async - IIFE to avoid returning Promise
				(async () => {
					const database = await getDatabaseInstance();
					const sessionRef = ref(database, `${FIREBASE_PATHS.SESSIONS}/${sessionId}`);

					const handleValue = (snapshot: { val: () => SessionFirebaseData | null }) => {
						const data = snapshot.val();

						if (!data) {
							// Session was deleted (host left)
							this.handleSessionClosed('host_left');
							return;
						}

						// Update participants
						const newParticipants: SessionParticipant[] = Object.entries(
							data.participants || {}
						).map(([id, p]) => ({
							userId: id,
							displayName: p.displayName,
							joinedAt: typeof p.joinedAt === 'number' ? p.joinedAt : Date.now(),
							displayPreference: p.displayPreference,
							isSynced: p.isSynced
						}));

						// Detect joins and leaves
						const oldIds = new Set(this._participants.map((p) => p.userId));
						const newIds = new Set(newParticipants.map((p) => p.userId));

						for (const p of newParticipants) {
							if (!oldIds.has(p.userId) && p.userId !== currentUserId) {
								this.notifyParticipantJoin(p);
							}
						}

						for (const oldP of this._participants) {
							if (!newIds.has(oldP.userId) && oldP.userId !== currentUserId) {
								this.notifyParticipantLeave(oldP.userId);
							}
						}

						this._participants = newParticipants;

						// Update session participant count
						if (this._currentSession) {
							this._currentSession = {
								...this._currentSession,
								participantCount: newParticipants.length
							};
						}
					};

					onValue(sessionRef, handleValue);

					cleanup = () => {
						off(sessionRef, 'value', handleValue);
					};
				})();

				// Return sync cleanup that defers to async setup
				return () => {
					if (cleanup) cleanup();
				};
			}
		);
	}

	private async startNearbySessionsDiscovery(): Promise<void> {
		const auth = getAuthSync();
		const currentUserId = auth.currentUser?.uid;

		this.nearbySessionsUnsubscribe = createHMRSafeDatabaseListener(
			'nearby-sessions-discovery',
			FIREBASE_PATHS.SESSIONS,
			() => {
				let cleanup: (() => void) | null = null;

				// Setup async - IIFE to avoid returning Promise
				(async () => {
					const database = await getDatabaseInstance();
					const sessionsRef = ref(database, FIREBASE_PATHS.SESSIONS);

					const handleValue = (snapshot: {
						val: () => Record<string, SessionFirebaseData> | null;
					}) => {
						const data = snapshot.val();

						if (!data) {
							this._nearbySessions = [];
							this.notifyNearbySessionsChange();
							return;
						}

						// Convert to array, filter out own sessions
						const sessions: SyncSession[] = Object.entries(data)
							.map(([sessionId, s]) => ({
								sessionId,
								hostUserId: s.hostUserId,
								hostDisplayName: s.hostDisplayName,
								sequenceId: s.sequenceId,
								sequenceWord: s.sequenceWord,
								peerJsRoomCode: s.peerJsRoomCode,
								createdAt: typeof s.createdAt === 'number' ? s.createdAt : Date.now(),
								participantCount: Object.keys(s.participants || {}).length
							}))
							.filter((s) => {
								// Filter out own hosted sessions
								if (currentUserId && s.hostUserId === currentUserId) {
									return false;
								}
								// Filter out full sessions
								if (s.participantCount >= SESSION_CONFIG.MAX_PARTICIPANTS) {
									return false;
								}
								return true;
							})
							.sort((a, b) => b.createdAt - a.createdAt);

						this._nearbySessions = sessions;
						this.notifyNearbySessionsChange();
					};

					onValue(sessionsRef, handleValue);

					cleanup = () => {
						off(sessionsRef, 'value', handleValue);
					};
				})();

				// Return sync cleanup that defers to async setup
				return () => {
					if (cleanup) cleanup();
				};
			}
		);
	}

	private handleSessionClosed(reason: 'host_left' | 'timeout' | 'error'): void {
		// Clear state
		if (this.sessionUnsubscribe) {
			this.sessionUnsubscribe();
			this.sessionUnsubscribe = null;
		}

		this.sessionRef = null;
		this.participantRef = null;
		this._currentSession = null;
		this._participants = [];
		this._isHost = false;

		// Notify listeners
		for (const callback of this.sessionClosedCallbacks) {
			callback(reason);
		}
	}

	private notifyNearbySessionsChange(): void {
		for (const callback of this.nearbySessionsCallbacks) {
			callback(this._nearbySessions);
		}
	}

	private notifyParticipantJoin(participant: SessionParticipant): void {
		for (const callback of this.participantJoinCallbacks) {
			callback(participant);
		}
	}

	private notifyParticipantLeave(userId: string): void {
		for (const callback of this.participantLeaveCallbacks) {
			callback(userId);
		}
	}
}
