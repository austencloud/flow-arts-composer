import type { SequenceData } from '#lib/shared/foundation/domain/models/sequence-data.js';
import type { PeerConnectionManager } from '#lib/shared/lan-sync/services/peer-connection-manager.js'
import type { AdaptiveHeartbeat } from "./adaptive-heartbeat";
import type { MessageBatcher } from "./message-batcher";
import type { MessagePriority } from "./types";
import type { MobileConnectionAdapter } from "./mobile-connection-adapter";
import type {
	SyncConnectionState,
	SyncedRoomState,
	SyncConfig,
	ViewMode,
	PeerInfo,
	ConnectionQuality
} from '../domain/sync-types';
import type { SyncMessage } from '../domain/sync-messages';
import {
	generateNodeId,
	createInitialRoomState,
	createInitialConnectionState,
	DEFAULT_SYNC_CONFIG,
	CONNECTION_QUALITY_THRESHOLDS
} from '../domain/sync-types';
import {
	createJoinMessage,
	createWelcomeMessage,
	createIntentMessage,
	createPeerUpdateMessage,
	createPeerLeaveMessage,
	createHeartbeatMessage,
	createHeartbeatAckMessage,
	createStateRequestMessage,
	createStateResponseMessage,
	deserializeRoomState,
	serializeMessage,
} from '../domain/sync-messages';
import { HybridLogicalClock } from './hybrid-logical-clock';
import { PlaybackPositionCalculator } from './playback-position-calculator';
import { StateMerger } from './state-merger';
import { SequenceLocalCache } from './sequence-local-cache';

interface PendingHeartbeat {
	seq: number;
	sentAt: number;
}

export interface MobileOptimizations {
	adaptiveHeartbeat?: AdaptiveHeartbeat;
	messageBatcher?: MessageBatcher;
	connectionAdapter?: MobileConnectionAdapter;
}

export class DeviceSyncCoordinator {
	private readonly hlc: HybridLogicalClock;
	private readonly positionCalculator: PlaybackPositionCalculator;
	private readonly stateMerger: StateMerger;
	private readonly sequenceCache: SequenceLocalCache;

	private readonly adaptiveHeartbeat: AdaptiveHeartbeat | null;
	private readonly messageBatcher: MessageBatcher | null;
	private readonly connectionAdapter: MobileConnectionAdapter | null;

	private readonly config: SyncConfig;

	private _connectionState: SyncConnectionState = createInitialConnectionState();
	private _roomState: SyncedRoomState | null = null;
	private _viewMode: ViewMode = 'animation';
	private _displayName: string = '';

	private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
	private heartbeatTimeoutCheck: ReturnType<typeof setInterval> | null = null;
	private pendingHeartbeats: Map<number, PendingHeartbeat> = new Map();
	private heartbeatSeq: number = 0;
	private lastPeerActivity: number = 0;

	private roomStateCallbacks: Set<(state: SyncedRoomState | null) => void> = new Set();
	private connectionStateCallbacks: Set<(state: SyncConnectionState) => void> = new Set();
	private unsubscribers: Array<() => void> = [];

	private validateRoomCode(code: string): boolean {
		return /^[A-Z0-9]{4,8}$/.test(code);
	}

	private sanitizeDisplayName(name: string): string {
		return name
			.replace(/[<>'"&]/g, '')
			.substring(0, 50)
			.trim() || 'Anonymous';
	}

	constructor(
		private readonly peerManager: PeerConnectionManager,
		config: Partial<SyncConfig> = {},
		sequenceCache?: SequenceLocalCache,
		mobileOptimizations?: MobileOptimizations
	) {
		const nodeId = generateNodeId();

		this.hlc = new HybridLogicalClock(nodeId);
		this.positionCalculator = new PlaybackPositionCalculator();
		this.stateMerger = new StateMerger(this.hlc);
		this.sequenceCache = sequenceCache ?? new SequenceLocalCache();

		this.adaptiveHeartbeat = mobileOptimizations?.adaptiveHeartbeat ?? null;
		this.messageBatcher = mobileOptimizations?.messageBatcher ?? null;
		this.connectionAdapter = mobileOptimizations?.connectionAdapter ?? null;

		this.config = { ...DEFAULT_SYNC_CONFIG, ...config };

		this._connectionState = {
			...createInitialConnectionState(),
			nodeId
		};

		this.setupMessageHandler();
		this.setupConnectionStateForwarding();
		this.setupMobileOptimizations();
	}

	get connectionState(): SyncConnectionState {
		return this._connectionState;
	}

	get roomState(): SyncedRoomState | null {
		return this._roomState;
	}

	get viewMode(): ViewMode {
		return this._viewMode;
	}

	set viewMode(mode: ViewMode) {
		this._viewMode = mode;
		if (this._roomState && this._connectionState.status === 'connected') {
			const peerInfo = this.stateMerger.createPeerInfo(this._displayName, mode);
			this._roomState = this.stateMerger.mergePeerInfo(this._roomState, peerInfo);
			this.broadcastPeerUpdate(peerInfo);
			this.notifyRoomStateChange();
		}
	}

	get displayName(): string {
		return this._displayName;
	}

	async sync(sequence: SequenceData, displayName: string): Promise<string> {
		this._displayName = this.sanitizeDisplayName(displayName);

		const roomCode = this.deriveRoomCode(sequence.id);

		await this.sequenceCache.set(sequence.id, sequence);

		this.updateConnectionState({
			status: 'joining-room',
			roomCode,
			errorMessage: null
		});

		try {
			await this.peerManager.joinRoom(roomCode);

			this.updateConnectionState({
				status: 'connected',
				peerCount: 1
			});

			const joinMessage = createJoinMessage(
				this.hlc.now(),
				this.hlc.nodeId,
				displayName,
				this._viewMode
			);
			this.broadcast(joinMessage);

			this.startHeartbeat();
			return roomCode;
		} catch {
			return this.createRoom(sequence, displayName, roomCode);
		}
	}

	async joinRoom(roomCode: string, displayName: string): Promise<void> {
		this._displayName = this.sanitizeDisplayName(displayName);

		const normalizedCode = roomCode.toUpperCase().trim();
		if (!this.validateRoomCode(normalizedCode)) {
			this.updateConnectionState({
				status: 'error',
				errorMessage: 'Invalid room code. Must be 4-8 alphanumeric characters.'
			});
			throw new Error('Invalid room code format');
		}

		this.updateConnectionState({
			status: 'joining-room',
			roomCode: normalizedCode,
			errorMessage: null
		});

		try {
			await this.peerManager.joinRoom(normalizedCode);

			this.updateConnectionState({
				status: 'connected',
				peerCount: 1
			});

			const joinMessage = createJoinMessage(
				this.hlc.now(),
				this.hlc.nodeId,
				displayName,
				this._viewMode
			);
			this.broadcast(joinMessage);

			this.startHeartbeat();
		} catch (error) {
			this.updateConnectionState({
				status: 'error',
				errorMessage: error instanceof Error ? error.message : 'Failed to join room'
			});
			throw error;
		}
	}

	disconnect(): void {
		if (this._connectionState.status === 'connected') {
			const leaveMessage = createPeerLeaveMessage(
				this.hlc.now(),
				this.hlc.nodeId,
				'User disconnected'
			);
			this.broadcast(leaveMessage);
		}

		this.stopHeartbeat();

		this.peerManager.disconnect();

		this._roomState = null;
		this._connectionState = {
			...createInitialConnectionState(),
			nodeId: this.hlc.nodeId
		};

		this.notifyRoomStateChange();
		this.notifyConnectionStateChange();
	}

	play(): void {
		if (!this._roomState) return;

		const currentStep = this.getCurrentStep();
		const intent = this.stateMerger.createIntent(
			true,
			currentStep,
			this._roomState.playback.speed,
			this._roomState.playback.loop,
			this._roomState.playback.totalSteps
		);

		this.applyAndBroadcastIntent(intent);
	}

	pause(): void {
		if (!this._roomState) return;

		const currentStep = this.getCurrentStep();
		const intent = this.stateMerger.createIntent(
			false,
			currentStep,
			this._roomState.playback.speed,
			this._roomState.playback.loop,
			this._roomState.playback.totalSteps
		);

		this.applyAndBroadcastIntent(intent);
	}

	seek(step: number): void {
		if (!this._roomState) return;

		const clampedStep = Math.max(
			0,
			Math.min(step, this._roomState.playback.totalSteps - 1)
		);

		const intent = this.stateMerger.createIntent(
			this._roomState.playback.playing,
			clampedStep,
			this._roomState.playback.speed,
			this._roomState.playback.loop,
			this._roomState.playback.totalSteps
		);

		this.applyAndBroadcastIntent(intent);
	}

	setSpeed(speed: number): void {
		if (!this._roomState) return;

		const currentStep = this.getCurrentStep();
		const intent = this.stateMerger.createIntent(
			this._roomState.playback.playing,
			currentStep,
			speed,
			this._roomState.playback.loop,
			this._roomState.playback.totalSteps
		);

		this.applyAndBroadcastIntent(intent);
	}

	toggleLoop(): void {
		if (!this._roomState) return;

		const intent = this.stateMerger.createIntent(
			this._roomState.playback.playing,
			this._roomState.playback.anchorStep,
			this._roomState.playback.speed,
			!this._roomState.playback.loop,
			this._roomState.playback.totalSteps
		);

		const adjustedIntent = {
			...intent,
			anchorStep: this._roomState.playback.anchorStep,
			anchorWallTime: this._roomState.playback.anchorWallTime
		};

		this.applyAndBroadcastIntent(adjustedIntent);
	}

	getCurrentStep(): number {
		if (!this._roomState) return 0;

		const result = this.positionCalculator.calculatePosition(
			this._roomState.playback,
			Date.now()
		);
		return result.step;
	}

	getCorrectedStep(lastRenderedStep: number): number {
		if (!this._roomState) return 0;

		const result = this.positionCalculator.calculateCorrectedPosition(
			this._roomState.playback,
			Date.now(),
			lastRenderedStep,
			this.config.maxCorrectionPerFrame
		);

		return result.step;
	}

	setStepDuration(durationMs: number): void {
		this.positionCalculator.setStepDuration(durationMs);
	}

	onRoomStateChange(callback: (state: SyncedRoomState | null) => void): () => void {
		this.roomStateCallbacks.add(callback);
		return () => this.roomStateCallbacks.delete(callback);
	}

	onConnectionStateChange(callback: (state: SyncConnectionState) => void): () => void {
		this.connectionStateCallbacks.add(callback);
		return () => this.connectionStateCallbacks.delete(callback);
	}

	destroy(): void {
		this.disconnect();

		this.roomStateCallbacks.clear();
		this.connectionStateCallbacks.clear();

		for (const unsub of this.unsubscribers) {
			unsub();
		}
		this.unsubscribers = [];
	}

	private async createRoom(
		sequence: SequenceData,
		displayName: string,
		roomCode: string
	): Promise<string> {
		this.updateConnectionState({
			status: 'creating-room',
			roomCode
		});

		try {
			await this.peerManager.createRoomWithCode(roomCode);

			const totalSteps = sequence.steps.length;
			this._roomState = createInitialRoomState(
				this.hlc.nodeId,
				{
					id: sequence.id,
					word: sequence.word,
					data: sequence
				},
				totalSteps
			);

			const peerInfo = this.stateMerger.createPeerInfo(displayName, this._viewMode);
			this._roomState = this.stateMerger.mergePeerInfo(this._roomState, peerInfo);

			this.updateConnectionState({
				status: 'waiting-for-peer',
				peerCount: 0
			});

			this.startHeartbeat();
			this.notifyRoomStateChange();

			return roomCode;
		} catch (error) {
			this.updateConnectionState({
				status: 'error',
				errorMessage: error instanceof Error ? error.message : 'Failed to create room'
			});
			throw error;
		}
	}

	private setupMessageHandler(): void {
		const unsub = this.peerManager.onMessage((rawMessage) => {
			if (this.isDeviceSyncMessage(rawMessage)) {
				this.handleMessage(rawMessage);
			}
		});
		this.unsubscribers.push(unsub);
	}

	private isDeviceSyncMessage(msg: unknown): msg is SyncMessage {
		if (!msg || typeof msg !== 'object') return false;
		const candidate = msg as Record<string, unknown>;
		const validTypes: Set<string> = new Set([
			'JOIN', 'WELCOME', 'INTENT', 'PEER_UPDATE', 'PEER_LEAVE',
			'HEARTBEAT', 'HEARTBEAT_ACK', 'STATE_REQUEST', 'STATE_RESPONSE'
		]);
		return typeof candidate.type === 'string'
			&& validTypes.has(candidate.type)
			&& typeof candidate.senderId === 'string'
			&& candidate.hlc != null;
	}

	private setupConnectionStateForwarding(): void {
		const unsub = this.peerManager.onConnectionStateChange((peerState) => {
			this.updateConnectionState({
				peerCount: peerState.connectedPeerCount
			});

			if (peerState.status === 'error') {
				this.updateConnectionState({
					status: 'error',
					errorMessage: peerState.errorMessage
				});
			}
		});
		this.unsubscribers.push(unsub);

		const disconnectUnsub = this.peerManager.onPeerDisconnected((peerId) => {
			this.handlePeerDisconnected(peerId);
		});
		this.unsubscribers.push(disconnectUnsub);
	}

	private handleMessage(message: SyncMessage): void {
		this.hlc.receive(message.hlc);

		this.lastPeerActivity = Date.now();

		switch (message.type) {
			case 'JOIN':
				this.handleJoin(message);
				break;
			case 'WELCOME':
				this.handleWelcome(message);
				break;
			case 'INTENT':
				this.handleIntent(message);
				break;
			case 'PEER_UPDATE':
				this.handlePeerUpdate(message);
				break;
			case 'PEER_LEAVE':
				this.handlePeerLeave(message);
				break;
			case 'HEARTBEAT':
				this.handleHeartbeat(message);
				break;
			case 'HEARTBEAT_ACK':
				this.handleHeartbeatAck(message);
				break;
			case 'STATE_REQUEST':
				this.handleStateRequest(message);
				break;
			case 'STATE_RESPONSE':
				this.handleStateResponse(message);
				break;
		}
	}

	private handleJoin(message: SyncMessage & { type: 'JOIN' }): void {
		if (!this._roomState) return;

		const peerInfo: PeerInfo = {
			nodeId: message.senderId,
			displayName: message.payload.displayName,
			viewMode: message.payload.viewMode,
			lastSeen: message.hlc
		};

		this._roomState = this.stateMerger.mergePeerInfo(this._roomState, peerInfo);

		const welcomeMessage = createWelcomeMessage(
			this.hlc.now(),
			this.hlc.nodeId,
			this._roomState
		);
		this.broadcast(welcomeMessage);

		this.updateConnectionState({
			status: 'connected',
			peerCount: this._roomState.peers.size - 1 
		});

		this.notifyRoomStateChange();
	}

	private handleWelcome(message: SyncMessage & { type: 'WELCOME' }): void {
		let remoteState;
		try {
			remoteState = deserializeRoomState(message.payload.roomState);
		} catch (error) {
			console.error('[DeviceSync] Invalid WELCOME message payload:', error);
			return; 
		}

		if (!this._roomState) {
			this._roomState = remoteState;
		} else {
			const mergeResult = this.stateMerger.merge(this._roomState, remoteState);
			this._roomState = mergeResult.state;
		}

		const myPeerInfo = this.stateMerger.createPeerInfo(this._displayName, this._viewMode);
		this._roomState = this.stateMerger.mergePeerInfo(this._roomState, myPeerInfo);

		if (this._roomState.sequence.data) {
			this.sequenceCache.set(
				this._roomState.sequence.id,
				this._roomState.sequence.data
			).catch((error) => {
				// Fire-and-forget: cache write failure is non-fatal, but surface it for debugging.
				console.warn('[DeviceSync] Failed to cache welcomed sequence:', error);
			});
		}

		this.updateConnectionState({
			status: 'connected',
			peerCount: this._roomState.peers.size - 1
		});

		this.notifyRoomStateChange();
	}

	private handleIntent(message: SyncMessage & { type: 'INTENT' }): void {
		if (!this._roomState) return;

		this._roomState = this.stateMerger.mergeIntent(
			this._roomState,
			message.payload.intent
		);

		this.notifyRoomStateChange();
	}

	private handlePeerUpdate(message: SyncMessage & { type: 'PEER_UPDATE' }): void {
		if (!this._roomState) return;

		this._roomState = this.stateMerger.mergePeerInfo(
			this._roomState,
			message.payload.peerInfo
		);

		this.notifyRoomStateChange();
	}

	private handlePeerLeave(message: SyncMessage & { type: 'PEER_LEAVE' }): void {
		if (!this._roomState) return;

		this._roomState = this.stateMerger.removePeer(this._roomState, message.senderId);

		this.updateConnectionState({
			peerCount: Math.max(0, this._roomState.peers.size - 1)
		});

		this.notifyRoomStateChange();
	}

	private handleHeartbeat(message: SyncMessage & { type: 'HEARTBEAT' }): void {
		const ackMessage = createHeartbeatAckMessage(
			this.hlc.now(),
			this.hlc.nodeId,
			message.payload.seq,
			this.getCurrentStep()
		);
		this.broadcast(ackMessage);
	}

	private handleHeartbeatAck(message: SyncMessage & { type: 'HEARTBEAT_ACK' }): void {
		const pending = this.pendingHeartbeats.get(message.payload.seq);
		if (!pending) return;

		const rtt = Date.now() - pending.sentAt;
		this.pendingHeartbeats.delete(message.payload.seq);

		if (this.adaptiveHeartbeat) {
			this.adaptiveHeartbeat.recordAck(message.payload.seq, pending.sentAt);
		}

		const quality = this.calculateQuality(rtt);
		this.updateConnectionState({
			quality,
			lastRttMs: rtt
		});

		if (this.adaptiveHeartbeat) {
			this.adaptiveHeartbeat.notifyQualityChange(quality);
		}
	}

	private handleStateRequest(_message: SyncMessage & { type: 'STATE_REQUEST' }): void {
		if (!this._roomState) return;

		const responseMessage = createStateResponseMessage(
			this.hlc.now(),
			this.hlc.nodeId,
			this._roomState
		);
		this.broadcast(responseMessage);
	}

	private handleStateResponse(message: SyncMessage & { type: 'STATE_RESPONSE' }): void {
		let remoteState;
		try {
			remoteState = deserializeRoomState(message.payload.roomState);
		} catch (error) {
			console.error('[DeviceSync] Invalid STATE_RESPONSE message payload:', error);
			return; 
		}

		if (!this._roomState) {
			this._roomState = remoteState;
		} else {
			const mergeResult = this.stateMerger.merge(this._roomState, remoteState);
			this._roomState = mergeResult.state;
		}

		const myPeerInfo = this.stateMerger.createPeerInfo(this._displayName, this._viewMode);
		this._roomState = this.stateMerger.mergePeerInfo(this._roomState, myPeerInfo);

		this.notifyRoomStateChange();
	}

	private handlePeerDisconnected(peerId: string): void {
		if (!this._roomState) return;

		for (const [nodeId] of this._roomState.peers) {
			if (peerId.includes(nodeId) || nodeId === peerId) {
				this._roomState = this.stateMerger.removePeer(this._roomState, nodeId);
			}
		}

		this.updateConnectionState({
			peerCount: Math.max(0, this._roomState.peers.size - 1)
		});

		this.notifyRoomStateChange();
	}

	private startHeartbeat(): void {
		this.lastPeerActivity = Date.now();

		if (this.adaptiveHeartbeat) {
			this.adaptiveHeartbeat.start();
			if (this.messageBatcher) {
				this.messageBatcher.start();
			}
			if (this.connectionAdapter) {
				this.connectionAdapter.start();
				this.connectionAdapter.notifyConnected();
			}
		} else {
			this.heartbeatInterval = setInterval(() => {
				if (this._connectionState.status === 'connected' ||
					this._connectionState.status === 'waiting-for-peer') {
					this.sendHeartbeat();
				}
			}, this.config.heartbeatIntervalMs);
		}

		this.heartbeatTimeoutCheck = setInterval(() => {
			this.checkHeartbeatTimeout();
		}, this.config.heartbeatIntervalMs);
	}

	private stopHeartbeat(): void {
		if (this.adaptiveHeartbeat) {
			this.adaptiveHeartbeat.stop();
		}
		if (this.messageBatcher) {
			this.messageBatcher.stop();
		}
		if (this.connectionAdapter) {
			this.connectionAdapter.stop();
		}

		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
			this.heartbeatInterval = null;
		}
		if (this.heartbeatTimeoutCheck) {
			clearInterval(this.heartbeatTimeoutCheck);
			this.heartbeatTimeoutCheck = null;
		}
		this.pendingHeartbeats.clear();
	}

	private sendHeartbeat(): void {
		const seq = this.heartbeatSeq++;

		this.pendingHeartbeats.set(seq, {
			seq,
			sentAt: Date.now()
		});

		const heartbeatMessage = createHeartbeatMessage(
			this.hlc.now(),
			this.hlc.nodeId,
			seq,
			this.getCurrentStep()
		);

		this.broadcast(heartbeatMessage);

		const now = Date.now();
		for (const [pendingSeq, pending] of this.pendingHeartbeats) {
			if (now - pending.sentAt > this.config.heartbeatTimeoutMs) {
				this.pendingHeartbeats.delete(pendingSeq);
			}
		}
	}

	private checkHeartbeatTimeout(): void {
		if (this._connectionState.status !== 'connected') return;

		const timeSinceActivity = Date.now() - this.lastPeerActivity;

		if (timeSinceActivity > this.config.heartbeatTimeoutMs) {
			this.updateConnectionState({
				quality: 'disconnected'
			});

			if (this.connectionAdapter) {
				this.connectionAdapter.notifyDisconnected('Heartbeat timeout');
			}
		}
	}

	private deriveRoomCode(sequenceId: string): string {
		return sequenceId.substring(0, 6).toUpperCase();
	}

	private broadcast(message: SyncMessage): void {
		if (this.messageBatcher) {
			const priority = this.getMessagePriority(message);
			this.messageBatcher.queue(message, priority);
		} else {
			this.broadcastDirect(message);
		}
	}

	private broadcastPeerUpdate(peerInfo: PeerInfo): void {
		const message = createPeerUpdateMessage(
			this.hlc.now(),
			this.hlc.nodeId,
			peerInfo
		);
		this.broadcast(message);
	}

	private applyAndBroadcastIntent(intent: ReturnType<StateMerger['createIntent']>): void {
		if (!this._roomState) return;

		this._roomState = this.stateMerger.mergeIntent(this._roomState, intent);

		const message = createIntentMessage(
			this.hlc.now(),
			this.hlc.nodeId,
			intent
		);
		this.broadcast(message);

		this.notifyRoomStateChange();
	}

	private calculateQuality(rttMs: number): ConnectionQuality {
		if (rttMs <= CONNECTION_QUALITY_THRESHOLDS.excellent) return 'excellent';
		if (rttMs <= CONNECTION_QUALITY_THRESHOLDS.good) return 'good';
		if (rttMs <= CONNECTION_QUALITY_THRESHOLDS.degraded) return 'degraded';
		if (rttMs <= CONNECTION_QUALITY_THRESHOLDS.poor) return 'poor';
		return 'disconnected';
	}

	private updateConnectionState(partial: Partial<SyncConnectionState>): void {
		this._connectionState = { ...this._connectionState, ...partial };
		this.notifyConnectionStateChange();
	}

	private notifyRoomStateChange(): void {
		for (const callback of this.roomStateCallbacks) {
			try {
				callback(this._roomState);
			} catch (error) {
				console.error('[DeviceSync] Room state callback error:', error);
			}
		}
	}

	private notifyConnectionStateChange(): void {
		for (const callback of this.connectionStateCallbacks) {
			try {
				callback(this._connectionState);
			} catch (error) {
				console.error('[DeviceSync] Connection state callback error:', error);
			}
		}
	}

	private setupMobileOptimizations(): void {
		if (this.adaptiveHeartbeat) {
			const heartbeatUnsub = this.adaptiveHeartbeat.onHeartbeatDue(() => {
				try {
					if (this._connectionState.status === 'connected' ||
						this._connectionState.status === 'waiting-for-peer') {
						return this.sendHeartbeatWithTracking();
					}
					return -1; 
				} catch (error) {
					console.error('[DeviceSync] Heartbeat callback error:', error);
					return -1;
				}
			});
			this.unsubscribers.push(heartbeatUnsub);
		}

		if (this.messageBatcher) {
			const flushUnsub = this.messageBatcher.onFlush((event) => {
				try {
					for (const message of event.messages) {
						this.broadcastDirect(message);
					}
				} catch (error) {
					console.error('[DeviceSync] Message flush callback error:', error);
				}
			});
			this.unsubscribers.push(flushUnsub);
		}

		if (this.connectionAdapter) {
			const reconnectUnsub = this.connectionAdapter.onReconnectNeeded(async () => {
				const roomCode = this._connectionState.roomCode;
				if (roomCode) {
					this.updateConnectionState({ status: 'reconnecting' });
					try {
						await this.peerManager.joinRoom(roomCode);
						this.connectionAdapter?.notifyConnected();
						this.updateConnectionState({ status: 'connected' });
						const stateRequest = createStateRequestMessage(
							this.hlc.now(),
							this.hlc.nodeId
						);
						this.broadcast(stateRequest);
					} catch (error) {
						console.error('[DeviceSync] Reconnection failed:', error);
						// Surface an error state so the UI doesn't hang on 'Reconnecting...'
						// if the adapter never fires a recovery event.
						this.updateConnectionState({
							status: 'error',
							errorMessage: 'Reconnection failed'
						});
					}
				}
			});
			this.unsubscribers.push(reconnectUnsub);

			const recoveryUnsub = this.connectionAdapter.onRecoveryStateChange((event) => {
				try {
					if (event.currentState === 'failed') {
						this.updateConnectionState({
							status: 'error',
							errorMessage: 'Failed to reconnect after multiple attempts'
						});
					} else if (event.currentState === 'reconnecting') {
						this.updateConnectionState({ status: 'reconnecting' });
					}
				} catch (error) {
					console.error('[DeviceSync] Recovery state callback error:', error);
				}
			});
			this.unsubscribers.push(recoveryUnsub);
		}
	}

	private sendHeartbeatWithTracking(): number {
		const seq = this.heartbeatSeq++;
		const sentAt = Date.now();

		this.pendingHeartbeats.set(seq, { seq, sentAt });

		const heartbeatMessage = createHeartbeatMessage(
			this.hlc.now(),
			this.hlc.nodeId,
			seq,
			this.getCurrentStep()
		);

		this.broadcastDirect(heartbeatMessage);

		if (this.adaptiveHeartbeat) {
			this.adaptiveHeartbeat.recordSent(seq);
		}

		const now = Date.now();
		for (const [pendingSeq, pending] of this.pendingHeartbeats) {
			if (now - pending.sentAt > this.config.heartbeatTimeoutMs) {
				this.pendingHeartbeats.delete(pendingSeq);
				if (this.adaptiveHeartbeat) {
					this.adaptiveHeartbeat.recordTimeout(pendingSeq);
				}
			}
		}

		return seq;
	}

	private broadcastDirect(message: SyncMessage): void {
		const serialized = serializeMessage(message);
		this.peerManager.broadcast(JSON.parse(serialized));
	}

	private getMessagePriority(message: SyncMessage): MessagePriority {
		switch (message.type) {
			case 'INTENT':
			case 'HEARTBEAT':
			case 'HEARTBEAT_ACK':
				return 'critical';
			case 'JOIN':
			case 'WELCOME':
			case 'STATE_REQUEST':
			case 'STATE_RESPONSE':
				return 'high';
			case 'PEER_UPDATE':
			case 'PEER_LEAVE':
				return 'normal';
			default:
				return 'normal';
		}
	}
}
