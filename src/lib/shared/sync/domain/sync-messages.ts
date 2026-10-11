import type { HLCTimestamp, PlaybackIntent, PeerInfo, SyncedRoomState, ViewMode } from './sync-types';
import type { SequenceData } from '#lib/shared/foundation/domain/models/sequence-data.js';

export type SyncMessageType =
	| 'JOIN'
	| 'WELCOME'
	| 'INTENT'
	| 'PEER_UPDATE'
	| 'PEER_LEAVE'
	| 'HEARTBEAT'
	| 'HEARTBEAT_ACK'
	| 'STATE_REQUEST'
	| 'STATE_RESPONSE';

export interface BaseSyncMessage {
	type: SyncMessageType;
	hlc: HLCTimestamp;
	senderId: string;
}

export interface JoinMessage extends BaseSyncMessage {
	type: 'JOIN';
	payload: {
		displayName: string;
		viewMode: ViewMode;
	};
}

export interface WelcomeMessage extends BaseSyncMessage {
	type: 'WELCOME';
	payload: {
		roomState: SerializableSyncedRoomState;
	};
}

export interface IntentMessage extends BaseSyncMessage {
	type: 'INTENT';
	payload: {
		intent: PlaybackIntent;
	};
}

export interface PeerUpdateMessage extends BaseSyncMessage {
	type: 'PEER_UPDATE';
	payload: {
		peerInfo: PeerInfo;
	};
}

export interface PeerLeaveMessage extends BaseSyncMessage {
	type: 'PEER_LEAVE';
	payload: {
		reason?: string;
	};
}

export interface HeartbeatMessage extends BaseSyncMessage {
	type: 'HEARTBEAT';
	payload: {
		seq: number;
		currentStep: number;
	};
}

export interface HeartbeatAckMessage extends BaseSyncMessage {
	type: 'HEARTBEAT_ACK';
	payload: {
		seq: number;
		currentStep: number;
	};
}

export interface StateRequestMessage extends BaseSyncMessage {
	type: 'STATE_REQUEST';
	payload: {
		lastKnownHlc?: HLCTimestamp;
	};
}

export interface StateResponseMessage extends BaseSyncMessage {
	type: 'STATE_RESPONSE';
	payload: {
		roomState: SerializableSyncedRoomState;
	};
}

export type SyncMessage =
	| JoinMessage
	| WelcomeMessage
	| IntentMessage
	| PeerUpdateMessage
	| PeerLeaveMessage
	| HeartbeatMessage
	| HeartbeatAckMessage
	| StateRequestMessage
	| StateResponseMessage;

export interface SerializablePeerInfo {
	nodeId: string;
	displayName: string;
	viewMode: ViewMode;
	lastSeen: HLCTimestamp;
}

export interface SerializableSyncedRoomState {
	playback: PlaybackIntent;
	sequence: {
		id: string;
		word: string;
		data?: SequenceData;
	};
	peers: SerializablePeerInfo[];
	createdAt: HLCTimestamp;
}

export function serializeRoomState(state: SyncedRoomState): SerializableSyncedRoomState {
	return {
		playback: state.playback,
		sequence: state.sequence,
		peers: Array.from(state.peers.values()),
		createdAt: state.createdAt
	};
}

export function validateSerializedRoomState(data: unknown): data is SerializableSyncedRoomState {
	if (!data || typeof data !== 'object') {
		throw new Error('Room state must be an object');
	}

	const state = data as Record<string, unknown>;

	if (!state.playback || typeof state.playback !== 'object') {
		throw new Error('Room state missing playback data');
	}
	const playback = state.playback as Record<string, unknown>;
	if (typeof playback.playing !== 'boolean') {
		throw new Error('Playback missing playing boolean');
	}
	if (typeof playback.anchorStep !== 'number') {
		throw new Error('Playback missing anchorStep number');
	}

	if (!state.sequence || typeof state.sequence !== 'object') {
		throw new Error('Room state missing sequence data');
	}
	const sequence = state.sequence as Record<string, unknown>;
	if (typeof sequence.id !== 'string') {
		throw new Error('Sequence missing id string');
	}

	if (!Array.isArray(state.peers)) {
		throw new Error('Room state peers must be an array');
	}
	for (const peer of state.peers) {
		if (!peer || typeof peer !== 'object') {
			throw new Error('Invalid peer in peers array');
		}
		const p = peer as Record<string, unknown>;
		if (typeof p.nodeId !== 'string') {
			throw new Error('Peer missing nodeId string');
		}
	}

	if (!state.createdAt || typeof state.createdAt !== 'object') {
		throw new Error('Room state missing createdAt timestamp');
	}

	return true;
}

export function deserializeRoomState(serialized: SerializableSyncedRoomState): SyncedRoomState {
	validateSerializedRoomState(serialized);

	return {
		playback: serialized.playback,
		sequence: serialized.sequence,
		peers: new Map(serialized.peers.map((p) => [p.nodeId, p])),
		createdAt: serialized.createdAt
	};
}

export function serializeMessage(message: SyncMessage): string {
	return JSON.stringify(message);
}

export function deserializeMessage(json: string): SyncMessage {
	return JSON.parse(json) as SyncMessage;
}

export function createJoinMessage(
	hlc: HLCTimestamp,
	senderId: string,
	displayName: string,
	viewMode: ViewMode
): JoinMessage {
	return {
		type: 'JOIN',
		hlc,
		senderId,
		payload: { displayName, viewMode }
	};
}

export function createWelcomeMessage(
	hlc: HLCTimestamp,
	senderId: string,
	roomState: SyncedRoomState
): WelcomeMessage {
	return {
		type: 'WELCOME',
		hlc,
		senderId,
		payload: { roomState: serializeRoomState(roomState) }
	};
}

export function createIntentMessage(
	hlc: HLCTimestamp,
	senderId: string,
	intent: PlaybackIntent
): IntentMessage {
	return {
		type: 'INTENT',
		hlc,
		senderId,
		payload: { intent }
	};
}

export function createPeerUpdateMessage(
	hlc: HLCTimestamp,
	senderId: string,
	peerInfo: PeerInfo
): PeerUpdateMessage {
	return {
		type: 'PEER_UPDATE',
		hlc,
		senderId,
		payload: { peerInfo }
	};
}

export function createPeerLeaveMessage(
	hlc: HLCTimestamp,
	senderId: string,
	reason?: string
): PeerLeaveMessage {
	return {
		type: 'PEER_LEAVE',
		hlc,
		senderId,
		payload: { reason }
	};
}

export function createHeartbeatMessage(
	hlc: HLCTimestamp,
	senderId: string,
	seq: number,
	currentStep: number
): HeartbeatMessage {
	return {
		type: 'HEARTBEAT',
		hlc,
		senderId,
		payload: { seq, currentStep }
	};
}

export function createHeartbeatAckMessage(
	hlc: HLCTimestamp,
	senderId: string,
	seq: number,
	currentStep: number
): HeartbeatAckMessage {
	return {
		type: 'HEARTBEAT_ACK',
		hlc,
		senderId,
		payload: { seq, currentStep }
	};
}

export function createStateRequestMessage(
	hlc: HLCTimestamp,
	senderId: string,
	lastKnownHlc?: HLCTimestamp
): StateRequestMessage {
	return {
		type: 'STATE_REQUEST',
		hlc,
		senderId,
		payload: { lastKnownHlc }
	};
}

export function createStateResponseMessage(
	hlc: HLCTimestamp,
	senderId: string,
	roomState: SyncedRoomState
): StateResponseMessage {
	return {
		type: 'STATE_RESPONSE',
		hlc,
		senderId,
		payload: { roomState: serializeRoomState(roomState) }
	};
}
