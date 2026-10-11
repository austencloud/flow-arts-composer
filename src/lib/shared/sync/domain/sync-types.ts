import type { SequenceData } from '#lib/shared/foundation/domain/models/sequence-data.js';

/**
 * HLC combines wall-clock time with a logical counter to provide:
 * - Timestamps that stay close to real time (humans can read them)
 * - Guaranteed causal ordering (no "future" overwrites "past")
 * - Graceful handling of clock drift between devices
 */
export interface HLCTimestamp {
	wallTime: number;
	logical: number;
	/** Node ID for deterministic tie-breaking of truly concurrent events */
	nodeId: string;
}

/** Format: "{wallTime}:{logical}:{nodeId}" */
export type SerializedHLC = string;

/**
 * atomic unit of synchronization.
 * instead of syncing "currentStep = 5" continuously, we sync the equation:
 * currentStep = anchorStep + ((now - anchorWallTime) / beatDuration) * speed
 */
export interface PlaybackIntent {
	intentId: string;
	playing: boolean;
	anchorStep: number;
	anchorHlc: HLCTimestamp;
	anchorWallTime: number;
	speed: number;
	loop: boolean;
	totalSteps: number;
}

export interface PeerInfo {
	nodeId: string;
	displayName: string;
	viewMode: ViewMode;
	lastSeen: HLCTimestamp;
}

export type ViewMode = 'animation' | 'grid' | 'both';

export interface SyncedSequence {
	id: string;
	word: string;
	/** included in WELCOME messages for instant load */
	data?: SequenceData;
}

export interface SyncedRoomState {
	/** CRDT: Last-Writer-Wins by HLC */
	playback: PlaybackIntent;
	sequence: SyncedSequence;
	peers: Map<string, PeerInfo>;
	createdAt: HLCTimestamp;
}

export type ConnectionQuality = 'excellent' | 'good' | 'degraded' | 'poor' | 'disconnected';

export const CONNECTION_QUALITY_THRESHOLDS: Record<
	Exclude<ConnectionQuality, 'disconnected'>,
	number
> = {
	excellent: 50,
	good: 150,
	degraded: 500,
	poor: 2000
};

export interface SyncConnectionState {
	status: SyncConnectionStatus;
	roomCode: string | null;
	nodeId: string | null;
	peerCount: number;
	quality: ConnectionQuality;
	lastRttMs: number | null;
	errorMessage: string | null;
}

export type SyncConnectionStatus =
	| 'disconnected'
	| 'creating-room'
	| 'waiting-for-peer'
	| 'joining-room'
	| 'connected'
	| 'reconnecting'
	| 'error';

export interface SyncConfig {
	heartbeatIntervalMs: number;
	heartbeatTimeoutMs: number;
	reconnectAttempts: number;
	reconnectDelayMs: number;
	/** Maximum drift (in steps) before snapping instead of easing */
	maxDriftBeforeSnap: number;
	/** Maximum correction per frame (in steps) for smooth drift correction */
	maxCorrectionPerFrame: number;
	/** Beat duration in milliseconds (for position calculation) */
	beatDurationMs: number;
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
	heartbeatIntervalMs: 5000,
	heartbeatTimeoutMs: 15000,
	reconnectAttempts: 3,
	reconnectDelayMs: 2000,
	maxDriftBeforeSnap: 1.0,
	maxCorrectionPerFrame: 0.1,
	beatDurationMs: 1000 
};

export interface AdaptiveHeartbeatConfig {
	minIntervalMs: number;
	maxIntervalMs: number;
	defaultIntervalMs: number;
	verifyIntervalMs: number;
	stabilityThreshold: number;
	degradationThreshold: number;
	increaseMultiplier: number;
	decreaseMultiplier: number;
	batteryAware: boolean;
	lowBatteryThreshold: number;
	lowBatteryMultiplier: number;
}

export const DEFAULT_ADAPTIVE_HEARTBEAT_CONFIG: AdaptiveHeartbeatConfig = {
	minIntervalMs: 2000,
	maxIntervalMs: 30000,
	defaultIntervalMs: 5000,
	verifyIntervalMs: 1000,
	stabilityThreshold: 5,
	degradationThreshold: 2,
	increaseMultiplier: 1.5,
	decreaseMultiplier: 0.5,
	batteryAware: true,
	lowBatteryThreshold: 0.2,
	lowBatteryMultiplier: 2.0
};

export function generateNodeId(): string {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) {
		return crypto.randomUUID().slice(0, 8);
	}
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createInitialHLC(nodeId: string): HLCTimestamp {
	return {
		wallTime: Date.now(),
		logical: 0,
		nodeId
	};
}

export function createInitialPlaybackIntent(nodeId: string, totalSteps: number): PlaybackIntent {
	const hlc = createInitialHLC(nodeId);
	return {
		intentId: `${nodeId}-${hlc.wallTime}-${hlc.logical}`,
		playing: false,
		anchorStep: 0,
		anchorHlc: hlc,
		anchorWallTime: Date.now(),
		speed: 1.0,
		loop: true,
		totalSteps
	};
}

export function createInitialRoomState(
	nodeId: string,
	sequence: SyncedSequence,
	totalSteps: number
): SyncedRoomState {
	return {
		playback: createInitialPlaybackIntent(nodeId, totalSteps),
		sequence,
		peers: new Map(),
		createdAt: createInitialHLC(nodeId)
	};
}

export function createInitialConnectionState(): SyncConnectionState {
	return {
		status: 'disconnected',
		roomCode: null,
		nodeId: null,
		peerCount: 0,
		quality: 'disconnected',
		lastRttMs: null,
		errorMessage: null
	};
}
