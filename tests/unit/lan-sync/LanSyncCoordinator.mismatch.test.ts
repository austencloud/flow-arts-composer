/**
 * Regression test for LanSyncCoordinator sequence-mismatch detection.
 *
 * handleStateUpdate merged the incoming update into _playbackState and THEN
 * compared `update.sequenceId !== this._playbackState.sequenceId` — but the
 * merge had just written that field, so the comparison was always false and the
 * mismatch callbacks were dead code. A peer switching to a different sequence
 * was never reported. The fix captures the previous sequenceId before the merge.
 */

import { describe, it, expect, vi } from 'vitest';
import { LanSyncCoordinator } from '#lib/shared/lan-sync/services/lan-sync-coordinator.js';
import type { PeerConnectionManager } from '#lib/shared/lan-sync/services/peer-connection-manager.js';
import type { SyncRoomBroadcaster } from '#lib/shared/lan-sync/services/sync-room-broadcaster.js';
import {
	createInitialConnectionState,
	type SyncMessage
} from '#lib/shared/lan-sync/domain/models/lan-sync-models.js';

function makeHarness() {
	let messageHandler: ((m: SyncMessage) => void) | null = null;

	const peerManager = {
		connectionState: createInitialConnectionState(),
		onMessage: (cb: (m: SyncMessage) => void) => {
			messageHandler = cb;
			return () => {};
		},
		onConnectionStateChange: () => () => {},
		broadcast: vi.fn()
	} as unknown as PeerConnectionManager;

	const broadcaster = {
		broadcast: vi.fn(),
		stopBroadcasting: vi.fn().mockResolvedValue(undefined),
		destroy: vi.fn()
	} as unknown as SyncRoomBroadcaster;

	const coordinator = new LanSyncCoordinator(peerManager, broadcaster);
	return {
		coordinator,
		fireMessage: (m: SyncMessage) => messageHandler?.(m)
	};
}

describe('LanSyncCoordinator sequence-mismatch detection', () => {
	it('fires the mismatch callback when a STATE_UPDATE carries a different sequenceId', () => {
		const { coordinator, fireMessage } = makeHarness();

		coordinator.setSequenceId('seq-A');

		const mismatch = vi.fn();
		coordinator.onSequenceMismatch(mismatch);

		fireMessage({
			type: 'STATE_UPDATE',
			timestamp: Date.now() + 100_000,
			senderId: 'peer',
			state: { sequenceId: 'seq-B' }
		});

		expect(mismatch).toHaveBeenCalledTimes(1);
		expect(mismatch).toHaveBeenCalledWith('seq-B');
	});

	it('does NOT fire the mismatch callback when the sequenceId matches', () => {
		const { coordinator, fireMessage } = makeHarness();

		coordinator.setSequenceId('seq-A');

		const mismatch = vi.fn();
		coordinator.onSequenceMismatch(mismatch);

		fireMessage({
			type: 'STATE_UPDATE',
			timestamp: Date.now() + 100_000,
			senderId: 'peer',
			state: { sequenceId: 'seq-A', currentStep: 3 }
		});

		expect(mismatch).not.toHaveBeenCalled();
	});
});
