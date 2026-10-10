/**
 * LAN Sync Reactive State
 *
 * Svelte 5 reactive state for LAN playback synchronization.
 * Bridges the coordinator service with Svelte's reactivity system.
 */

import type { LanSyncCoordinator } from '#lib/shared/lan-sync/services/lan-sync-coordinator.js'
import type { SyncRoomDiscovery } from '#lib/shared/lan-sync/services/sync-room-discovery.js'
import type { SyncedPlaybackState, PeerConnectionState, SyncRoomWithId } from '../domain/models/lan-sync-models';
import { createInitialConnectionState, createInitialPlaybackState } from '../domain/models/lan-sync-models';

/** Reactive state for LAN sync */
class LanSyncState {
	private _connectionState = $state<PeerConnectionState>(createInitialConnectionState());
	private _playbackState = $state<SyncedPlaybackState>(createInitialPlaybackState());
	private _sequenceMismatchWarning = $state<string | null>(null);
	private _nearbyRooms = $state<SyncRoomWithId[]>([]);
	private _dismissedRoomIds = $state<Set<string>>(new Set());
	private _receivedSequence = $state<Record<string, unknown> | null>(null);
	private _coordinator: LanSyncCoordinator | null = null;
	private _discovery: SyncRoomDiscovery | null = null;
	private unsubscribers: Array<() => void> = [];

	/** Current connection state */
	get connectionState(): PeerConnectionState {
		return this._connectionState;
	}

	/** Current synced playback state */
	get playbackState(): SyncedPlaybackState {
		return this._playbackState;
	}

	/** Whether sync is active */
	get isActive(): boolean {
		const status = this._connectionState.status;
		return status === 'connected' || status === 'waiting-for-peer';
	}

	/** Whether connected to at least one peer */
	get isConnected(): boolean {
		return this._connectionState.status === 'connected';
	}

	/** Current room code (if any) */
	get roomCode(): string | null {
		return this._connectionState.roomCode;
	}

	/** Whether this device is the host */
	get isHost(): boolean {
		return this._connectionState.isHost;
	}

	/** Sequence mismatch warning from peer */
	get sequenceMismatchWarning(): string | null {
		return this._sequenceMismatchWarning;
	}

	/** Nearby sync rooms available to join (filtered, excluding dismissed) */
	get nearbyRooms(): SyncRoomWithId[] {
		return this._nearbyRooms.filter((room) => !this._dismissedRoomIds.has(room.roomId));
	}

	/** Sequence data received from the host peer (via FULL_STATE) */
	get receivedSequence(): Record<string, unknown> | null {
		return this._receivedSequence;
	}

	/** The most recent nearby room (for showing a single banner) */
	get topNearbyRoom(): SyncRoomWithId | null {
		const filtered = this.nearbyRooms;
		return filtered.length > 0 ? (filtered[0] ?? null) : null;
	}

	/** Initialize with a coordinator instance */
	initialize(coordinator: LanSyncCoordinator): void {
		this.cleanup();
		this._coordinator = coordinator;

		// Subscribe to state changes
		this.unsubscribers.push(
			coordinator.onConnectionStateChange((state) => {
				this._connectionState = state;
			})
		);

		this.unsubscribers.push(
			coordinator.onPlaybackStateChange((state) => {
				this._playbackState = state;
			})
		);

		this.unsubscribers.push(
			coordinator.onSequenceMismatch((peerSequenceId) => {
				this._sequenceMismatchWarning = peerSequenceId;
			})
		);

		this.unsubscribers.push(
			coordinator.onSequenceReceived((data) => {
				this._receivedSequence = data;
			})
		);

		// Sync initial state
		this._connectionState = coordinator.connectionState;
		this._playbackState = coordinator.playbackState;
	}

	async createRoom(initialState: Partial<SyncedPlaybackState> = {}): Promise<string> {
		if (!this._coordinator) {
			throw new Error('LAN sync not initialized');
		}
		return this._coordinator.createRoom(initialState);
	}

	/** Join an existing room */
	async joinRoom(roomCode: string): Promise<void> {
		if (!this._coordinator) {
			throw new Error('LAN sync not initialized');
		}
		return this._coordinator.joinRoom(roomCode);
	}

	/** Disconnect from sync */
	disconnect(): void {
		this._coordinator?.disconnect();
		this._sequenceMismatchWarning = null;
	}

	/**
	 * One-tap sync toggle - the simple API.
	 * Tap once to start syncing, tap again to stop.
	 *
	 * @param sequenceId - The sequence ID to sync
	 * @param sequenceWord - Human-readable sequence word for display in discovery banners
	 * @param initialState - Optional initial playback state
	 */
	async toggleSync(
		sequenceId: string,
		sequenceWord: string,
		initialState: Partial<SyncedPlaybackState> = {}
	): Promise<boolean> {
		if (!this._coordinator) {
			throw new Error('LAN sync not initialized');
		}
		return this._coordinator.toggleSync(sequenceId, sequenceWord, initialState);
	}

	/**
	 * Join a room by its PeerJS room code (used when joining from discovery banner).
	 */
	async joinRoomByCode(peerJsRoomCode: string): Promise<void> {
		if (!this._coordinator) {
			throw new Error('LAN sync not initialized');
		}
		return this._coordinator.joinRoomByCode(peerJsRoomCode);
	}

	/** Update playback state (broadcasts to peers) */
	updatePlayback(update: Partial<SyncedPlaybackState>): void {
		this._coordinator?.updatePlaybackState(update);
	}

	/** Set the current sequence ID */
	setSequenceId(sequenceId: string | null): void {
		this._coordinator?.setSequenceId(sequenceId);
	}

	/** Store the local sequence so the host can send it to joining peers */
	setLocalSequence(data: Record<string, unknown> | null): void {
		this._coordinator?.setLocalSequence(data);
	}

	/**
	 * Wait for sequence data to arrive from the host (with timeout).
	 * Returns the sequence data, or null if the timeout expires.
	 */
	waitForSequence(timeoutMs = 5000): Promise<Record<string, unknown> | null> {
		// Already have it
		if (this._receivedSequence) return Promise.resolve(this._receivedSequence);
		if (!this._coordinator) return Promise.resolve(null);

		return new Promise((resolve) => {
			let unsub: (() => void) | null = null;
			const timer = setTimeout(() => {
				unsub?.();
				resolve(null);
			}, timeoutMs);

			unsub = this._coordinator!.onSequenceReceived((data) => {
				clearTimeout(timer);
				unsub?.();
				resolve(data);
			});
		});
	}

	/** Clear the sequence mismatch warning */
	clearMismatchWarning(): void {
		this._sequenceMismatchWarning = null;
	}

	initializeDiscovery(discovery: SyncRoomDiscovery): void {
		if (this._discovery) {
			// Already initialized
			return;
		}

		this._discovery = discovery;

		// Subscribe to room changes
		const unsub = discovery.onNearbyRoomsChange((rooms) => {
			this._nearbyRooms = rooms;
		});
		this.unsubscribers.push(unsub);

		discovery.startDiscovery().catch((err) => {
			console.error('[LanSyncState] Failed to start discovery:', err);
		});
	}

	/** Dismiss a room banner (won't show again this session) */
	dismissRoom(roomId: string): void {
		this._dismissedRoomIds = new Set([...this._dismissedRoomIds, roomId]);
	}

	/** Clear dismissed rooms (e.g., on new session) */
	clearDismissedRooms(): void {
		this._dismissedRoomIds = new Set();
	}

	/** Clean up subscriptions */
	cleanup(): void {
		for (const unsub of this.unsubscribers) {
			unsub();
		}
		this.unsubscribers = [];
		this._coordinator = null;
		this._discovery?.stopDiscovery();
		this._discovery = null;
		this._connectionState = createInitialConnectionState();
		this._playbackState = createInitialPlaybackState();
		this._sequenceMismatchWarning = null;
		this._receivedSequence = null;
		this._nearbyRooms = [];
		this._dismissedRoomIds = new Set();
	}
}

/** Global singleton state for LAN sync */
export const lanSyncState = new LanSyncState();

/** Helper to get display-friendly connection status */
export function getConnectionStatusText(status: PeerConnectionState['status']): string {
	switch (status) {
		case 'disconnected':
			return 'Not connected';
		case 'creating-room':
			return 'Creating room...';
		case 'waiting-for-peer':
			return 'Waiting for device...';
		case 'joining-room':
			return 'Joining room...';
		case 'connected':
			return 'Connected';
		case 'reconnecting':
			return 'Reconnecting...';
		case 'error':
			return 'Connection error';
		default:
			return 'Unknown';
	}
}
