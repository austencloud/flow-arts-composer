/**
 * InviteHandler
 *
 * Sends and receives invitations to join sync sessions.
 * Handles invite lifecycle with expiry and rate limiting.
 */

import {
	ref,
	set,
	remove,
	push,
	onValue,
	off,
	type DatabaseReference
} from 'firebase/database';
import {
	getDatabaseInstance,
	getAuthSync,
	createHMRSafeDatabaseListener
} from '#lib/shared/auth/firebase.js';
import type { Invite, InviteFirebaseData, InviteStatus } from '../domain/models/connect-models';
import { INVITE_CONFIG, FIREBASE_PATHS } from '../domain/models/connect-constants';

export class InviteHandler {
	private _pendingInvites: Invite[] = [];
	private _sentInvites: Invite[] = [];

	private invitesRef: DatabaseReference | null = null;
	private invitesUnsubscribe: (() => void) | null = null;
	private expiryCheckInterval: ReturnType<typeof setInterval> | null = null;

	// Rate limiting
	private lastInviteTo: Map<string, number> = new Map();

	// Callbacks
	private inviteReceivedCallbacks: Set<(invite: Invite) => void> = new Set();
	private inviteResponseCallbacks: Set<
		(inviteId: string, accepted: boolean, byUserId: string) => void
	> = new Set();
	private inviteExpiredCallbacks: Set<(inviteId: string) => void> = new Set();

	// Local dismiss tracking
	private dismissedInviteIds: Set<string> = new Set();

	get pendingInvites(): Invite[] {
		return this._pendingInvites.filter((i) => !this.dismissedInviteIds.has(i.inviteId));
	}

	get pendingCount(): number {
		return this.pendingInvites.length;
	}

	get sentInvites(): Invite[] {
		return this._sentInvites;
	}

	async sendInvite(
		toUserId: string,
		sessionId: string,
		sequenceId: string,
		sequenceWord: string
	): Promise<string> {
		const auth = getAuthSync();
		const user = auth.currentUser;
		if (!user) {
			throw new Error('Must be authenticated to send invites');
		}

		// Check rate limits
		if (!this.canInvite(toUserId)) {
			const reason = this.getInviteBlockReason(toUserId);
			throw new Error(`Cannot send invite: ${reason}`);
		}

		const database = await getDatabaseInstance();
		const invitesRef = ref(database, `${FIREBASE_PATHS.INVITES}/${toUserId}`);
		const newInviteRef = push(invitesRef);

		const inviteId = newInviteRef.key!;
		const now = Date.now();

		const inviteData: InviteFirebaseData = {
			fromUserId: user.uid,
			fromDisplayName: user.displayName || 'Anonymous',
			sessionId,
			sequenceId,
			sequenceWord,
			createdAt: now,
			expiresAt: now + INVITE_CONFIG.EXPIRY_MS,
			status: 'pending'
		};

		await set(newInviteRef, inviteData);

		// Track for rate limiting
		this.lastInviteTo.set(toUserId, now);

		// Track sent invite
		const invite: Invite = {
			inviteId,
			...inviteData,
			toUserId
		};
		this._sentInvites.push(invite);

		// Watch for response
		this.watchInviteResponse(toUserId, inviteId);

		return inviteId;
	}

	async cancelInvite(inviteId: string): Promise<void> {
		const invite = this._sentInvites.find((i) => i.inviteId === inviteId);
		if (!invite) {
			return;
		}

		const database = await getDatabaseInstance();
		const inviteRef = ref(
			database,
			`${FIREBASE_PATHS.INVITES}/${invite.toUserId}/${inviteId}`
		);

		await remove(inviteRef);

		this._sentInvites = this._sentInvites.filter((i) => i.inviteId !== inviteId);
	}

	async acceptInvite(inviteId: string): Promise<string> {
		const invite = this._pendingInvites.find((i) => i.inviteId === inviteId);
		if (!invite) {
			throw new Error('Invite not found');
		}

		if (invite.status !== 'pending') {
			throw new Error(`Invite is ${invite.status}`);
		}

		if (Date.now() > invite.expiresAt) {
			throw new Error('Invite has expired');
		}

		const auth = getAuthSync();
		const user = auth.currentUser;
		if (!user) {
			throw new Error('Must be authenticated to accept invites');
		}

		const database = await getDatabaseInstance();
		const inviteRef = ref(
			database,
			`${FIREBASE_PATHS.INVITES}/${user.uid}/${inviteId}`
		);

		// Update status to accepted
		await set(inviteRef, {
			...this.inviteToFirebaseData(invite),
			status: 'accepted' as InviteStatus
		});

		// Remove from pending
		this._pendingInvites = this._pendingInvites.filter((i) => i.inviteId !== inviteId);

		return invite.sessionId;
	}

	async declineInvite(inviteId: string): Promise<void> {
		const invite = this._pendingInvites.find((i) => i.inviteId === inviteId);
		if (!invite) {
			return;
		}

		const auth = getAuthSync();
		const user = auth.currentUser;
		if (!user) {
			return;
		}

		const database = await getDatabaseInstance();
		const inviteRef = ref(
			database,
			`${FIREBASE_PATHS.INVITES}/${user.uid}/${inviteId}`
		);

		// Update status to declined
		await set(inviteRef, {
			...this.inviteToFirebaseData(invite),
			status: 'declined' as InviteStatus
		});

		// Remove from pending
		this._pendingInvites = this._pendingInvites.filter((i) => i.inviteId !== inviteId);

	}

	dismissInvite(inviteId: string): void {
		this.dismissedInviteIds.add(inviteId);
	}

	canInvite(toUserId: string): boolean {
		return this.getInviteBlockReason(toUserId) === null;
	}

	getInviteBlockReason(
		toUserId: string
	): 'cooldown' | 'max_pending' | 'already_invited' | null {
		// Check if already invited
		const existingInvite = this._sentInvites.find(
			(i) => i.toUserId === toUserId && i.status === 'pending'
		);
		if (existingInvite) {
			return 'already_invited';
		}

		// Check cooldown
		const lastInvite = this.lastInviteTo.get(toUserId);
		if (lastInvite && Date.now() - lastInvite < INVITE_CONFIG.COOLDOWN_MS) {
			return 'cooldown';
		}

		// Check max pending
		if (this._sentInvites.filter((i) => i.status === 'pending').length >= INVITE_CONFIG.MAX_PENDING_PER_USER) {
			return 'max_pending';
		}

		return null;
	}

	onInviteReceived(callback: (invite: Invite) => void): () => void {
		this.inviteReceivedCallbacks.add(callback);
		return () => {
			this.inviteReceivedCallbacks.delete(callback);
		};
	}

	onInviteResponse(
		callback: (inviteId: string, accepted: boolean, byUserId: string) => void
	): () => void {
		this.inviteResponseCallbacks.add(callback);
		return () => {
			this.inviteResponseCallbacks.delete(callback);
		};
	}

	onInviteExpired(callback: (inviteId: string) => void): () => void {
		this.inviteExpiredCallbacks.add(callback);
		return () => {
			this.inviteExpiredCallbacks.delete(callback);
		};
	}

	startListening(): void {
		const auth = getAuthSync();
		const user = auth.currentUser;
		if (!user) {
			return;
		}

		this.invitesUnsubscribe = createHMRSafeDatabaseListener(
			'invites-listener',
			`${FIREBASE_PATHS.INVITES}/${user.uid}`,
			() => {
				let cleanup: (() => void) | null = null;

				// Setup async - IIFE to avoid returning Promise
				(async () => {
					const database = await getDatabaseInstance();
					this.invitesRef = ref(database, `${FIREBASE_PATHS.INVITES}/${user.uid}`);

					const handleValue = (snapshot: {
						val: () => Record<string, InviteFirebaseData> | null;
					}) => {
						const data = snapshot.val();

						if (!data) {
							this._pendingInvites = [];
							return;
						}

						const now = Date.now();
						const oldPendingIds = new Set(this._pendingInvites.map((i) => i.inviteId));

						// Convert to array, filter for pending only
						const invites: Invite[] = Object.entries(data)
							.map(([inviteId, inv]) => ({
								inviteId,
								fromUserId: inv.fromUserId,
								fromDisplayName: inv.fromDisplayName,
								toUserId: user.uid,
								sessionId: inv.sessionId,
								sequenceId: inv.sequenceId,
								sequenceWord: inv.sequenceWord,
								createdAt: inv.createdAt,
								expiresAt: inv.expiresAt,
								status: inv.status
							}))
							.filter((inv) => inv.status === 'pending' && inv.expiresAt > now);

						// Detect new invites
						for (const invite of invites) {
							if (!oldPendingIds.has(invite.inviteId)) {
								this.notifyInviteReceived(invite);
							}
						}

						this._pendingInvites = invites;
					};

					onValue(this.invitesRef, handleValue);

					cleanup = () => {
						if (this.invitesRef) {
							off(this.invitesRef, 'value', handleValue);
						}
					};
				})();

				// Return sync cleanup that defers to async setup
				return () => {
					if (cleanup) cleanup();
				};
			}
		);

		// Start expiry checker
		this.startExpiryChecker();

	}

	stopListening(): void {
		if (this.invitesUnsubscribe) {
			this.invitesUnsubscribe();
			this.invitesUnsubscribe = null;
		}

		if (this.expiryCheckInterval) {
			clearInterval(this.expiryCheckInterval);
			this.expiryCheckInterval = null;
		}

		this.invitesRef = null;
	}

	destroy(): void {
		this.stopListening();
		this._pendingInvites = [];
		this._sentInvites = [];
		this.dismissedInviteIds.clear();
		this.lastInviteTo.clear();
		this.inviteReceivedCallbacks.clear();
		this.inviteResponseCallbacks.clear();
		this.inviteExpiredCallbacks.clear();
	}

	private inviteToFirebaseData(invite: Invite): InviteFirebaseData {
		return {
			fromUserId: invite.fromUserId,
			fromDisplayName: invite.fromDisplayName,
			sessionId: invite.sessionId,
			sequenceId: invite.sequenceId,
			sequenceWord: invite.sequenceWord,
			createdAt: invite.createdAt,
			expiresAt: invite.expiresAt,
			status: invite.status
		};
	}

	private watchInviteResponse(toUserId: string, inviteId: string): void {
		createHMRSafeDatabaseListener(
			`invite-response-${inviteId}`,
			`${FIREBASE_PATHS.INVITES}/${toUserId}/${inviteId}`,
			() => {
				let cleanup: (() => void) | null = null;

				// Setup async - IIFE to avoid returning Promise
				(async () => {
					const database = await getDatabaseInstance();
					const inviteRef = ref(
						database,
						`${FIREBASE_PATHS.INVITES}/${toUserId}/${inviteId}`
					);

					const handleValue = (snapshot: { val: () => InviteFirebaseData | null }) => {
						const data = snapshot.val();

						if (!data) {
							// Invite was deleted
							this._sentInvites = this._sentInvites.filter(
								(i) => i.inviteId !== inviteId
							);
							return;
						}

						if (data.status === 'accepted' || data.status === 'declined') {
							// Update local state
							const invite = this._sentInvites.find((i) => i.inviteId === inviteId);
							if (invite) {
								invite.status = data.status;
							}

							// Notify
							this.notifyInviteResponse(inviteId, data.status === 'accepted', toUserId);

							// Clean up after a delay
							setTimeout(() => {
								this._sentInvites = this._sentInvites.filter(
									(i) => i.inviteId !== inviteId
								);
							}, 5000);
						}
					};

					onValue(inviteRef, handleValue);

					cleanup = () => {
						off(inviteRef, 'value', handleValue);
					};
				})();

				// Return sync cleanup that defers to async setup
				return () => {
					if (cleanup) cleanup();
				};
			}
		);
	}

	private startExpiryChecker(): void {
		this.expiryCheckInterval = setInterval(() => {
			const now = Date.now();

			// Check pending invites for expiry
			const expiredInvites = this._pendingInvites.filter((i) => i.expiresAt <= now);
			for (const invite of expiredInvites) {
				this.notifyInviteExpired(invite.inviteId);
			}

			this._pendingInvites = this._pendingInvites.filter((i) => i.expiresAt > now);

			// Check sent invites for expiry
			const expiredSent = this._sentInvites.filter(
				(i) => i.status === 'pending' && i.expiresAt <= now
			);
			for (const invite of expiredSent) {
				invite.status = 'expired';
			}
		}, 10000); // Check every 10 seconds
	}

	private notifyInviteReceived(invite: Invite): void {
		for (const callback of this.inviteReceivedCallbacks) {
			callback(invite);
		}
	}

	private notifyInviteResponse(
		inviteId: string,
		accepted: boolean,
		byUserId: string
	): void {
		for (const callback of this.inviteResponseCallbacks) {
			callback(inviteId, accepted, byUserId);
		}
	}

	private notifyInviteExpired(inviteId: string): void {
		for (const callback of this.inviteExpiredCallbacks) {
			callback(inviteId);
		}
	}
}
