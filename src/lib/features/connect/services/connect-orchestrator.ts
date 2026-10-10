/**
 * ConnectOrchestrator
 *
 * High-level coordinator for Connect module functionality.
 * Composes PresenceTracker, SessionManager, InviteHandler,
 * FriendshipManager, and LanSyncCoordinator.
 */

import type { PresenceTracker } from './presence-tracker';
import type { SessionManager } from './session-manager';
import type { InviteHandler } from './invite-handler';
import type { FriendshipManager } from './friendship-manager';
import type { LanSyncCoordinator } from '#lib/shared/lan-sync/services/lan-sync-coordinator.js'
import type {
	SyncSession,
	SessionParticipant,
	Invite,
	Friend,
	DisplayPreference,
	UserSearchResult
} from '../domain/models/connect-models';

export class ConnectOrchestrator {
	private _displayPreference: DisplayPreference = 'pictograph';
	private _isSoloMode = false;

	private unsubscribers: Array<() => void> = [];

	constructor(
		private presenceTracker: PresenceTracker,
		private sessionManager: SessionManager,
		private inviteHandler: InviteHandler,
		private friendshipManager: FriendshipManager,
		private lanSyncCoordinator: LanSyncCoordinator
	) {}


	get currentUserId(): string | null {
		return this.presenceTracker.currentUserId;
	}

	get isInSession(): boolean {
		return this.sessionManager.isInSession;
	}

	get currentSession(): SyncSession | null {
		return this.sessionManager.currentSession;
	}

	get isHost(): boolean {
		return this.sessionManager.isHost;
	}

	get participants(): SessionParticipant[] {
		return this.sessionManager.participants;
	}

	get isSoloMode(): boolean {
		return this._isSoloMode;
	}

	get displayPreference(): DisplayPreference {
		return this._displayPreference;
	}

	get pendingInviteCount(): number {
		return this.inviteHandler.pendingCount;
	}

	get nearbySessions(): SyncSession[] {
		return this.sessionManager.getNearbySessions();
	}

	get onlineFriends(): Friend[] {
		return this.friendshipManager.friends.filter((f) =>
			this.presenceTracker.isUserOnline(f.userId)
		);
	}


	async startSharing(sequenceId: string, sequenceWord: string, sequenceData?: Record<string, unknown>): Promise<string> {
		// Ensure we're online
		if (!this.presenceTracker.isTracking) {
			await this.presenceTracker.goOnline();
		}

		// Create session via SessionManager
		const sessionId = await this.sessionManager.createSession(sequenceId, sequenceWord);

		await this.presenceTracker.setCurrentSession(sessionId);

		// Store sequence data in the P2P layer so joining peers receive it via FULL_STATE
		this.lanSyncCoordinator.setLocalSequence(sequenceData ?? null);

		// Start PeerJS sync via LanSyncCoordinator
		await this.lanSyncCoordinator.toggleSync(sequenceId, sequenceWord, {
			sequenceId,
			currentStep: 0,
			isPlaying: false,
			speed: 1,
			shouldLoop: true,
			timestamp: Date.now()
		});

		return sessionId;
	}

	async joinSession(sessionId: string): Promise<void> {
		// Ensure we're online
		if (!this.presenceTracker.isTracking) {
			await this.presenceTracker.goOnline();
		}

		// Join via SessionManager
		await this.sessionManager.joinSession(sessionId, this._displayPreference);

		await this.presenceTracker.setCurrentSession(sessionId);

		// Connect PeerJS
		const session = this.sessionManager.currentSession!;
		await this.lanSyncCoordinator.joinRoomByCode(session.peerJsRoomCode);

	}

	async joinFromInvite(inviteId: string): Promise<void> {
		// Accept the invite (returns session ID)
		const sessionId = await this.inviteHandler.acceptInvite(inviteId);

		// Join the session
		await this.joinSession(sessionId);
	}

	async leaveSession(): Promise<void> {
		// Disconnect PeerJS
		this.lanSyncCoordinator.disconnect();

		await this.presenceTracker.setCurrentSession(null);

		// Leave via SessionManager
		await this.sessionManager.leaveSession();

		this._isSoloMode = false;

	}

	async toggleSoloMode(): Promise<void> {
		this._isSoloMode = await this.sessionManager.toggleSyncMode();

		// When in solo mode, don't sync with LanSyncCoordinator
		// The playback state stays local
	}

	async setDisplayPreference(preference: DisplayPreference): Promise<void> {
		this._displayPreference = preference;
		await this.sessionManager.updateDisplayPreference(preference);
	}


	async inviteUser(userId: string): Promise<void> {
		if (!this.isInSession || !this.currentSession) {
			throw new Error('Must be in a session to invite users');
		}

		await this.inviteHandler.sendInvite(
			userId,
			this.currentSession.sessionId,
			this.currentSession.sequenceId,
			this.currentSession.sequenceWord
		);
	}

	async inviteFriend(friend: Friend): Promise<void> {
		await this.inviteUser(friend.userId);
	}

	async acceptInvite(inviteId: string): Promise<void> {
		await this.joinFromInvite(inviteId);
	}

	async declineInvite(inviteId: string): Promise<void> {
		await this.inviteHandler.declineInvite(inviteId);
	}

	getPendingInvites(): Invite[] {
		return this.inviteHandler.pendingInvites;
	}


	async searchUsers(query: string): Promise<UserSearchResult[]> {
		return this.friendshipManager.searchUsers(query);
	}

	async addFriend(userId: string, displayName: string): Promise<void> {
		await this.friendshipManager.addFriend(userId, displayName);
	}

	async removeFriend(userId: string): Promise<void> {
		await this.friendshipManager.removeFriend(userId);
	}

	getFriends(): Friend[] {
		return this.friendshipManager.friends;
	}


	async goOnline(): Promise<void> {
		await this.presenceTracker.goOnline();
	}

	async goOffline(): Promise<void> {
		// Leave any active session first
		if (this.isInSession) {
			await this.leaveSession();
		}

		await this.presenceTracker.goOffline();
	}


	onInviteReceived(callback: (invite: Invite) => void): () => void {
		const unsub = this.inviteHandler.onInviteReceived(callback);
		this.unsubscribers.push(unsub);
		return unsub;
	}

	onSessionClosed(callback: (reason: string) => void): () => void {
		const unsub = this.sessionManager.onSessionClosed((reason) => {
			// Clean up local state
			this._isSoloMode = false;
			this.lanSyncCoordinator.disconnect();
			this.presenceTracker.setCurrentSession(null).catch(console.error);

			callback(reason);
		});
		this.unsubscribers.push(unsub);
		return unsub;
	}

	onParticipantsChanged(callback: (participants: SessionParticipant[]) => void): () => void {
		// Combine join and leave into a single callback
		const joinUnsub = this.sessionManager.onParticipantJoin(() => {
			callback(this.participants);
		});
		const leaveUnsub = this.sessionManager.onParticipantLeave(() => {
			callback(this.participants);
		});

		const unsub = () => {
			joinUnsub();
			leaveUnsub();
		};

		this.unsubscribers.push(unsub);
		return unsub;
	}


	async initialize(): Promise<void> {
		// Go online
		await this.presenceTracker.goOnline();

		await this.friendshipManager.loadFriends();

		// Start listening for invites
		this.inviteHandler.startListening();

	}

	destroy(): void {
		// Unsubscribe from all
		for (const unsub of this.unsubscribers) {
			unsub();
		}
		this.unsubscribers = [];

		// Clean up services
		this.inviteHandler.stopListening();

		// Leave session and go offline
		this.goOffline().catch((err) => {
			console.warn('[ConnectOrchestrator] Cleanup error:', err);
		});

	}
}
