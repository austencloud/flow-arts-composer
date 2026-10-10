/**
 * LanSyncCoordinator
 *
 * Orchestrates LAN playback synchronization between devices.
 * Manages the sync protocol, state updates, heartbeats, and conflict resolution.
 * Now also manages Firebase RTDB broadcasting for discovery.
 */

import type { PeerConnectionManager } from '#lib/shared/lan-sync/services/peer-connection-manager.js'
import type { SyncRoomBroadcaster } from './sync-room-broadcaster';
import type {
	SyncedPlaybackState,
	PeerConnectionState,
	SyncMessage,
	LanSyncConfig
} from '../domain/models/lan-sync-models';
import {
	createInitialPlaybackState,
	DEFAULT_LAN_SYNC_CONFIG
} from '../domain/models/lan-sync-models';

export class LanSyncCoordinator {
	private _playbackState: SyncedPlaybackState = createInitialPlaybackState();
	private config: LanSyncConfig;

	private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
	private lastHeartbeatReceived: number = 0;
	private heartbeatCheckInterval: ReturnType<typeof setInterval> | null = null;

	private playbackStateCallbacks: Set<(state: SyncedPlaybackState) => void> = new Set();
	private connectionStateCallbacks: Set<(state: PeerConnectionState) => void> = new Set();
	private sequenceMismatchCallbacks: Set<(peerSequenceId: string | null) => void> = new Set();
	private sequenceReceivedCallbacks: Set<(data: Record<string, unknown>) => void> = new Set();

	/** The host's local sequence data, sent to joining peers */
	private _localSequence: Record<string, unknown> | null = null;

	/** Sequence data received from the host peer */
	private _receivedSequence: Record<string, unknown> | null = null;

	private unsubscribers: Array<() => void> = [];

	/** Throttle: last time a currentStep-only update was broadcast */
	private lastStepBroadcastTime = 0;
	private static readonly STEP_BROADCAST_INTERVAL_MS = 50; // ~20 updates/sec max

	constructor(
		private peerManager: PeerConnectionManager,
		private broadcaster: SyncRoomBroadcaster,
		config: Partial<LanSyncConfig> = {}
	) {
		this.config = { ...DEFAULT_LAN_SYNC_CONFIG, ...config };
		this.setupMessageHandler();
		this.setupConnectionStateForwarding();
	}

	get connectionState(): PeerConnectionState {
		return this.peerManager.connectionState;
	}

	get playbackState(): SyncedPlaybackState {
		return this._playbackState;
	}

	get isActive(): boolean {
		const status = this.connectionState.status;
		return status === 'connected' || status === 'waiting-for-peer';
	}

	async createRoom(initialState: Partial<SyncedPlaybackState> = {}): Promise<string> {
		this._playbackState = {
			...createInitialPlaybackState(),
			...initialState,
			timestamp: Date.now()
		};

		const roomCode = await this.peerManager.createRoom();
		this.startHeartbeat();

		return roomCode;
	}

	async joinRoom(roomCode: string): Promise<void> {
		await this.peerManager.joinRoom(roomCode);
		this.startHeartbeat();

		// Request full state from host
		this.peerManager.broadcast({
			type: 'REQUEST_FULL_STATE',
			timestamp: Date.now(),
			senderId: this.connectionState.peerId || 'unknown'
		});
	}

	disconnect(): void {
		this.stopHeartbeat();
		this.peerManager.disconnect();
		// Stop broadcasting to Firebase when disconnecting
		this.broadcaster.stopBroadcasting().catch((err) => {
			console.warn('[LanSyncCoordinator] Error stopping broadcast:', err);
		});
		this._playbackState = createInitialPlaybackState();
	}

	async toggleSync(
		sequenceId: string,
		sequenceWord: string,
		initialState: Partial<SyncedPlaybackState> = {}
	): Promise<boolean> {
		// If already syncing, disconnect
		if (this.isActive) {
			this.disconnect();
			return false;
		}

		// Derive room code from sequence ID (first 6 chars, uppercase)
		const roomCode = this.deriveRoomCode(sequenceId);

		// Try to join first (maybe someone else is already hosting)
		try {
			await this.peerManager.joinRoom(roomCode);
			this.startHeartbeat();

			// Request full state from host
			this.peerManager.broadcast({
				type: 'REQUEST_FULL_STATE',
				timestamp: Date.now(),
				senderId: this.connectionState.peerId || 'unknown'
			});

			return true;
		} catch {
			// No one hosting - become the host
			this._playbackState = {
				...createInitialPlaybackState(),
				...initialState,
				sequenceId,
				timestamp: Date.now()
			};

			await this.peerManager.createRoomWithCode(roomCode);
			this.startHeartbeat();

			// Broadcast to Firebase for discovery
			await this.broadcaster.broadcast(sequenceId, sequenceWord, roomCode);

			return true;
		}
	}

	async joinRoomByCode(peerJsRoomCode: string): Promise<void> {
		// Stop any existing sync first
		if (this.isActive) {
			this.disconnect();
		}

		await this.peerManager.joinRoom(peerJsRoomCode);
		this.startHeartbeat();

		// Request full state from host
		this.peerManager.broadcast({
			type: 'REQUEST_FULL_STATE',
			timestamp: Date.now(),
			senderId: this.connectionState.peerId || 'unknown'
		});
	}

	/** Derive a deterministic room code from sequence ID */
	private deriveRoomCode(sequenceId: string): string {
		// Use first 6 chars of sequence ID, uppercase
		// This ensures same sequence = same room
		return sequenceId.substring(0, 6).toUpperCase();
	}

	updatePlaybackState(update: Partial<SyncedPlaybackState>): void {
		const newState = {
			...this._playbackState,
			...update,
			timestamp: Date.now()
		};

		this._playbackState = newState;

		// Broadcast to peers (throttle continuous currentStep updates to ~20/sec)
		// Also broadcast during 'waiting-for-peer' so late-connecting peers get updates via FULL_STATE
		const canBroadcast = this.connectionState.status === 'connected' || this.connectionState.status === 'waiting-for-peer';
		if (canBroadcast) {
			const isStepOnly = Object.keys(update).length === 1 && 'currentStep' in update;
			const now = Date.now();

			if (!isStepOnly || now - this.lastStepBroadcastTime >= LanSyncCoordinator.STEP_BROADCAST_INTERVAL_MS) {
				if (isStepOnly) this.lastStepBroadcastTime = now;
				this.peerManager.broadcast({
					type: 'STATE_UPDATE',
					timestamp: newState.timestamp,
					senderId: this.connectionState.peerId || 'unknown',
					state: update
				});
			}
		}

		// Notify local listeners
		this.notifyPlaybackStateChange(newState);
	}

	setSequenceId(sequenceId: string | null): void {
		if (this._playbackState.sequenceId !== sequenceId) {
			this.updatePlaybackState({ sequenceId });
		}
	}

	setLocalSequence(data: Record<string, unknown> | null): void {
		this._localSequence = data;
	}

	get receivedSequence(): Record<string, unknown> | null {
		return this._receivedSequence;
	}

	onSequenceReceived(callback: (data: Record<string, unknown>) => void): () => void {
		this.sequenceReceivedCallbacks.add(callback);
		return () => this.sequenceReceivedCallbacks.delete(callback);
	}

	onPlaybackStateChange(callback: (state: SyncedPlaybackState) => void): () => void {
		this.playbackStateCallbacks.add(callback);
		return () => this.playbackStateCallbacks.delete(callback);
	}

	onConnectionStateChange(callback: (state: PeerConnectionState) => void): () => void {
		this.connectionStateCallbacks.add(callback);
		return () => this.connectionStateCallbacks.delete(callback);
	}

	onSequenceMismatch(callback: (peerSequenceId: string | null) => void): () => void {
		this.sequenceMismatchCallbacks.add(callback);
		return () => this.sequenceMismatchCallbacks.delete(callback);
	}

	destroy(): void {
		this.disconnect();
		this.broadcaster.destroy();
		for (const unsub of this.unsubscribers) {
			unsub();
		}
		this.unsubscribers = [];
		this.playbackStateCallbacks.clear();
		this.connectionStateCallbacks.clear();
		this.sequenceMismatchCallbacks.clear();
		this.sequenceReceivedCallbacks.clear();
		this._localSequence = null;
		this._receivedSequence = null;
	}

	private setupMessageHandler(): void {
		const unsub = this.peerManager.onMessage((message) => {
			this.handleMessage(message);
		});
		this.unsubscribers.push(unsub);
	}

	private setupConnectionStateForwarding(): void {
		const unsub = this.peerManager.onConnectionStateChange((state) => {
			for (const callback of this.connectionStateCallbacks) {
				callback(state);
			}
		});
		this.unsubscribers.push(unsub);
	}

	private handleMessage(message: SyncMessage): void {
		this.lastHeartbeatReceived = Date.now();

		switch (message.type) {
			case 'REQUEST_FULL_STATE':
				this.handleRequestFullState(message.senderId);
				break;

			case 'FULL_STATE':
				this.handleFullState(message.state, message.sequenceData);
				break;

			case 'STATE_UPDATE':
				this.handleStateUpdate(message.state, message.timestamp);
				break;

			case 'HEARTBEAT':
				// Just update lastHeartbeatReceived (done above)
				break;

			case 'SEQUENCE_MISMATCH_WARNING':
				for (const callback of this.sequenceMismatchCallbacks) {
					callback(message.peerSequenceId);
				}
				break;
		}
	}

	private handleRequestFullState(_requesterId: string): void {
		// Only host responds to full state requests
		if (!this.connectionState.isHost) return;

		this.peerManager.broadcast({
			type: 'FULL_STATE',
			timestamp: Date.now(),
			senderId: this.connectionState.peerId || 'unknown',
			state: this._playbackState,
			sequenceData: this._localSequence ?? undefined
		});
	}

	private handleFullState(state: SyncedPlaybackState, sequenceData?: Record<string, unknown>): void {
		this._playbackState = state;
		this.notifyPlaybackStateChange(state);

		if (sequenceData) {
			this._receivedSequence = sequenceData;
			for (const callback of this.sequenceReceivedCallbacks) {
				callback(sequenceData);
			}
		}
	}

	private handleStateUpdate(update: Partial<SyncedPlaybackState>, timestamp: number): void {
		// Last-write-wins conflict resolution
		if (timestamp >= this._playbackState.timestamp) {
			// Capture the sequence we were on BEFORE the merge — comparing against
			// the post-merge state always matches `update.sequenceId` (the merge
			// just wrote it), which silently killed mismatch detection.
			const previousSequenceId = this._playbackState.sequenceId;

			const newState = {
				...this._playbackState,
				...update,
				timestamp
			};

			this._playbackState = newState;
			this.notifyPlaybackStateChange(newState);

			// Check for sequence mismatch
			if (
				update.sequenceId !== undefined &&
				update.sequenceId !== previousSequenceId
			) {
				for (const callback of this.sequenceMismatchCallbacks) {
					callback(update.sequenceId);
				}
			}
		}
	}

	private notifyPlaybackStateChange(state: SyncedPlaybackState): void {
		for (const callback of this.playbackStateCallbacks) {
			callback(state);
		}
	}

	private startHeartbeat(): void {
		this.lastHeartbeatReceived = Date.now();

		// Send heartbeats
		this.heartbeatInterval = setInterval(() => {
			if (this.connectionState.status === 'connected') {
				this.peerManager.broadcast({
					type: 'HEARTBEAT',
					timestamp: Date.now(),
					senderId: this.connectionState.peerId || 'unknown'
				});
			}
		}, this.config.heartbeatIntervalMs);

		// Check for heartbeat timeout
		this.heartbeatCheckInterval = setInterval(() => {
			if (this.connectionState.status === 'connected') {
				const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeatReceived;
				if (timeSinceLastHeartbeat > this.config.heartbeatTimeoutMs) {
					console.warn('Heartbeat timeout - peer may be disconnected');
					// The PeerJS connection will handle actual disconnect detection
				}
			}
		}, this.config.heartbeatIntervalMs);
	}

	private stopHeartbeat(): void {
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
			this.heartbeatInterval = null;
		}
		if (this.heartbeatCheckInterval) {
			clearInterval(this.heartbeatCheckInterval);
			this.heartbeatCheckInterval = null;
		}
	}
}
