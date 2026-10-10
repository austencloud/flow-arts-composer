/**
 * Tests for StateMerger
 *
 * These tests verify the CRDT merge semantics:
 * - Last-Writer-Wins by HLC for playback intents
 * - Union merge for peers with LWW for duplicates
 * - Sequence merging with data preference
 * - Immutability of inputs
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StateMerger } from '#lib/shared/sync/services/state-merger.js';
import { HybridLogicalClock } from '#lib/shared/sync/services/hybrid-logical-clock.js';
import type {
	HLCTimestamp,
	PlaybackIntent,
	PeerInfo,
	SyncedRoomState
} from '#lib/shared/sync/domain/sync-types.js';

describe('StateMerger', () => {
	let hlc: HybridLogicalClock;
	let merger: StateMerger;

	// Helper to create a timestamp
	function createHLC(wallTime: number, logical: number, nodeId: string): HLCTimestamp {
		return { wallTime, logical, nodeId };
	}

	// Helper to create a playback intent
	function createPlaybackIntent(hlcTs: HLCTimestamp, overrides: Partial<PlaybackIntent> = {}): PlaybackIntent {
		return {
			intentId: `${hlcTs.nodeId}-${hlcTs.wallTime}-${hlcTs.logical}`,
			playing: true,
			anchorStep: 0,
			anchorHlc: hlcTs,
			anchorWallTime: Date.now(),
			speed: 1.0,
			loop: true,
			totalSteps: 10,
			...overrides
		};
	}

	// Helper to create a peer info
	function createPeerInfo(nodeId: string, hlcTs: HLCTimestamp, viewMode: 'animation' | 'grid' | 'both' = 'animation'): PeerInfo {
		return {
			nodeId,
			displayName: `User ${nodeId}`,
			viewMode,
			lastSeen: hlcTs
		};
	}

	// Helper to create a room state
	function createRoomState(
		playback: PlaybackIntent,
		peers: Map<string, PeerInfo>,
		createdAt: HLCTimestamp
	): SyncedRoomState {
		return {
			playback,
			sequence: { id: 'seq-1', word: 'TEST' },
			peers,
			createdAt
		};
	}

	beforeEach(() => {
		hlc = new HybridLogicalClock('node-a');
		merger = new StateMerger(hlc);
	});

	describe('merge() - playback', () => {
		it('should take remote playback when it has later HLC', () => {
			const localHlc = createHLC(1000, 0, 'node-a');
			const remoteHlc = createHLC(2000, 0, 'node-b'); // Later

			const local = createRoomState(
				createPlaybackIntent(localHlc, { anchorStep: 5 }),
				new Map(),
				localHlc
			);

			const remote = createRoomState(
				createPlaybackIntent(remoteHlc, { anchorStep: 10 }),
				new Map(),
				remoteHlc
			);

			const result = merger.merge(local, remote);

			expect(result.state.playback.anchorStep).toBe(10);
			expect(result.localChanged).toBe(true);
			expect(result.updatedFields.has('playback')).toBe(true);
		});

		it('should keep local playback when it has later HLC', () => {
			const localHlc = createHLC(2000, 0, 'node-a'); // Later
			const remoteHlc = createHLC(1000, 0, 'node-b');

			const local = createRoomState(
				createPlaybackIntent(localHlc, { anchorStep: 5 }),
				new Map(),
				localHlc
			);

			const remote = createRoomState(
				createPlaybackIntent(remoteHlc, { anchorStep: 10 }),
				new Map(),
				remoteHlc
			);

			const result = merger.merge(local, remote);

			expect(result.state.playback.anchorStep).toBe(5);
			expect(result.updatedFields.has('playback')).toBe(false);
		});

		it('should use logical counter as tiebreaker', () => {
			const localHlc = createHLC(1000, 5, 'node-a');
			const remoteHlc = createHLC(1000, 10, 'node-b'); // Same wallTime, higher logical

			const local = createRoomState(
				createPlaybackIntent(localHlc, { anchorStep: 5 }),
				new Map(),
				localHlc
			);

			const remote = createRoomState(
				createPlaybackIntent(remoteHlc, { anchorStep: 10 }),
				new Map(),
				remoteHlc
			);

			const result = merger.merge(local, remote);

			expect(result.state.playback.anchorStep).toBe(10);
		});
	});

	describe('merge() - peers', () => {
		it('should union merge peers from both states', () => {
			const hlc1 = createHLC(1000, 0, 'node-a');
			const hlc2 = createHLC(1000, 0, 'node-b');
			const hlc3 = createHLC(1000, 0, 'node-c');

			const localPeers = new Map([['node-a', createPeerInfo('node-a', hlc1)]]);
			const remotePeers = new Map([
				['node-b', createPeerInfo('node-b', hlc2)],
				['node-c', createPeerInfo('node-c', hlc3)]
			]);

			const local = createRoomState(createPlaybackIntent(hlc1), localPeers, hlc1);
			const remote = createRoomState(createPlaybackIntent(hlc1), remotePeers, hlc1);

			const result = merger.merge(local, remote);

			expect(result.state.peers.size).toBe(3);
			expect(result.state.peers.has('node-a')).toBe(true);
			expect(result.state.peers.has('node-b')).toBe(true);
			expect(result.state.peers.has('node-c')).toBe(true);
			expect(result.updatedFields.has('peers')).toBe(true);
		});

		it('should take later lastSeen for duplicate peers', () => {
			const hlcOld = createHLC(1000, 0, 'node-a');
			const hlcNew = createHLC(2000, 0, 'node-a'); // Later

			const localPeers = new Map([['node-a', createPeerInfo('node-a', hlcOld, 'animation')]]);
			const remotePeers = new Map([['node-a', createPeerInfo('node-a', hlcNew, 'grid')]]);

			const local = createRoomState(createPlaybackIntent(hlcOld), localPeers, hlcOld);
			const remote = createRoomState(createPlaybackIntent(hlcOld), remotePeers, hlcOld);

			const result = merger.merge(local, remote);

			expect(result.state.peers.get('node-a')?.viewMode).toBe('grid');
		});
	});

	describe('merge() - sequence', () => {
		it('should prefer sequence with data when IDs match', () => {
			const hlcTs = createHLC(1000, 0, 'node-a');

			const local: SyncedRoomState = {
				playback: createPlaybackIntent(hlcTs),
				sequence: { id: 'seq-1', word: 'TEST' }, // No data
				peers: new Map(),
				createdAt: hlcTs
			};

			const remote: SyncedRoomState = {
				playback: createPlaybackIntent(hlcTs),
				sequence: { id: 'seq-1', word: 'TEST', data: { steps: [] } as any }, // Has data
				peers: new Map(),
				createdAt: hlcTs
			};

			const result = merger.merge(local, remote);

			expect(result.state.sequence.data).toBeDefined();
			expect(result.updatedFields.has('sequence')).toBe(true);
		});

		it('should prefer later createdAt when IDs differ', () => {
			const localHlc = createHLC(1000, 0, 'node-a');
			const remoteHlc = createHLC(2000, 0, 'node-b'); // Later

			const local: SyncedRoomState = {
				playback: createPlaybackIntent(localHlc),
				sequence: { id: 'seq-1', word: 'OLD' },
				peers: new Map(),
				createdAt: localHlc
			};

			const remote: SyncedRoomState = {
				playback: createPlaybackIntent(remoteHlc),
				sequence: { id: 'seq-2', word: 'NEW' },
				peers: new Map(),
				createdAt: remoteHlc
			};

			const result = merger.merge(local, remote);

			expect(result.state.sequence.id).toBe('seq-2');
			expect(result.state.sequence.word).toBe('NEW');
		});
	});

	describe('mergeIntent()', () => {
		it('should update state when intent is newer', () => {
			const oldHlc = createHLC(1000, 0, 'node-a');
			const newHlc = createHLC(2000, 0, 'node-b');

			const state = createRoomState(
				createPlaybackIntent(oldHlc, { anchorStep: 5 }),
				new Map(),
				oldHlc
			);

			const newIntent = createPlaybackIntent(newHlc, { anchorStep: 10 });

			const result = merger.mergeIntent(state, newIntent);

			expect(result.playback.anchorStep).toBe(10);
			expect(result).not.toBe(state); // New object
		});

		it('should return same reference when intent is not newer', () => {
			const newHlc = createHLC(2000, 0, 'node-a');
			const oldHlc = createHLC(1000, 0, 'node-b');

			const state = createRoomState(
				createPlaybackIntent(newHlc, { anchorStep: 5 }),
				new Map(),
				newHlc
			);

			const oldIntent = createPlaybackIntent(oldHlc, { anchorStep: 10 });

			const result = merger.mergeIntent(state, oldIntent);

			expect(result.playback.anchorStep).toBe(5);
			expect(result).toBe(state); // Same reference
		});
	});

	describe('mergePeerInfo()', () => {
		it('should add new peer', () => {
			const hlcTs = createHLC(1000, 0, 'node-a');
			const state = createRoomState(createPlaybackIntent(hlcTs), new Map(), hlcTs);

			const newPeer = createPeerInfo('node-b', createHLC(1000, 0, 'node-b'));

			const result = merger.mergePeerInfo(state, newPeer);

			expect(result.peers.has('node-b')).toBe(true);
			expect(result).not.toBe(state);
		});

		it('should update existing peer when newer', () => {
			const oldHlc = createHLC(1000, 0, 'node-b');
			const newHlc = createHLC(2000, 0, 'node-b');

			const existingPeer = createPeerInfo('node-b', oldHlc, 'animation');
			const state = createRoomState(
				createPlaybackIntent(oldHlc),
				new Map([['node-b', existingPeer]]),
				oldHlc
			);

			const updatedPeer = createPeerInfo('node-b', newHlc, 'grid');

			const result = merger.mergePeerInfo(state, updatedPeer);

			expect(result.peers.get('node-b')?.viewMode).toBe('grid');
		});

		it('should return same reference when update is not newer', () => {
			const newHlc = createHLC(2000, 0, 'node-b');
			const oldHlc = createHLC(1000, 0, 'node-b');

			const existingPeer = createPeerInfo('node-b', newHlc, 'animation');
			const state = createRoomState(
				createPlaybackIntent(newHlc),
				new Map([['node-b', existingPeer]]),
				newHlc
			);

			const oldPeer = createPeerInfo('node-b', oldHlc, 'grid');

			const result = merger.mergePeerInfo(state, oldPeer);

			expect(result.peers.get('node-b')?.viewMode).toBe('animation');
			expect(result).toBe(state);
		});
	});

	describe('removePeer()', () => {
		it('should remove existing peer', () => {
			const hlcTs = createHLC(1000, 0, 'node-a');
			const peer = createPeerInfo('node-b', hlcTs);
			const state = createRoomState(
				createPlaybackIntent(hlcTs),
				new Map([['node-b', peer]]),
				hlcTs
			);

			const result = merger.removePeer(state, 'node-b');

			expect(result.peers.has('node-b')).toBe(false);
			expect(result).not.toBe(state);
		});

		it('should return same reference when peer does not exist', () => {
			const hlcTs = createHLC(1000, 0, 'node-a');
			const state = createRoomState(createPlaybackIntent(hlcTs), new Map(), hlcTs);

			const result = merger.removePeer(state, 'nonexistent');

			expect(result).toBe(state);
		});
	});

	describe('createIntent()', () => {
		it('should create intent with fresh HLC timestamp', () => {
			const intent = merger.createIntent(true, 5, 1.5, true, 20);

			expect(intent.playing).toBe(true);
			expect(intent.anchorStep).toBe(5);
			expect(intent.speed).toBe(1.5);
			expect(intent.loop).toBe(true);
			expect(intent.totalSteps).toBe(20);
			expect(intent.anchorHlc.nodeId).toBe('node-a');
			expect(intent.intentId).toContain('node-a');
		});

		it('should create unique intents on successive calls', () => {
			const intent1 = merger.createIntent(true, 0, 1, true, 10);
			const intent2 = merger.createIntent(true, 0, 1, true, 10);

			expect(intent1.intentId).not.toBe(intent2.intentId);
			expect(hlc.compare(intent1.anchorHlc, intent2.anchorHlc)).toBe(-1);
		});
	});

	describe('createPeerInfo()', () => {
		it('should create peer info with correct fields', () => {
			const peer = merger.createPeerInfo('Alice', 'grid');

			expect(peer.displayName).toBe('Alice');
			expect(peer.viewMode).toBe('grid');
			expect(peer.nodeId).toBe('node-a');
			expect(peer.lastSeen.nodeId).toBe('node-a');
		});
	});

	describe('immutability', () => {
		it('should not mutate input states during merge', () => {
			const hlc1 = createHLC(1000, 0, 'node-a');
			const hlc2 = createHLC(2000, 0, 'node-b');

			const localPeers = new Map([['node-a', createPeerInfo('node-a', hlc1)]]);
			const remotePeers = new Map([['node-b', createPeerInfo('node-b', hlc2)]]);

			const local = createRoomState(createPlaybackIntent(hlc1), localPeers, hlc1);
			const remote = createRoomState(createPlaybackIntent(hlc2), remotePeers, hlc2);

			// Clone for comparison
			const localPeersSize = local.peers.size;
			const remotePeersSize = remote.peers.size;

			merger.merge(local, remote);

			// Originals should be unchanged
			expect(local.peers.size).toBe(localPeersSize);
			expect(remote.peers.size).toBe(remotePeersSize);
		});
	});
});
