/**
 * Tests for sync message (de)serialization validation.
 *
 * Regression guard: validateSerializedRoomState must ACCEPT the exact shape
 * serializeRoomState produces. The canonical playback field is `playing`
 * (PlaybackIntent), but the validator previously checked `isPlaying` — a field
 * that never exists — so every WELCOME / STATE_RESPONSE payload threw and a
 * joining peer never received room state. This locks the round-trip.
 */

import { describe, it, expect } from 'vitest';
import {
	serializeRoomState,
	validateSerializedRoomState
} from '#lib/shared/sync/domain/sync-messages.js';
import { createInitialRoomState } from '#lib/shared/sync/domain/sync-types.js';
import type { SyncedSequence } from '#lib/shared/sync/domain/sync-types.js';

const sequence: SyncedSequence = { id: 'seq-1', word: 'BOOK' };

describe('validateSerializedRoomState', () => {
	it('accepts the exact shape serializeRoomState produces (round-trip)', () => {
		const state = createInitialRoomState('node-a', sequence, 8);
		const serialized = serializeRoomState(state);

		// This is the regression: before the fix the serializer's own output
		// failed its own validator because the validator checked `isPlaying`.
		expect(() => validateSerializedRoomState(serialized)).not.toThrow();
		expect(validateSerializedRoomState(serialized)).toBe(true);
	});

	it('validates the canonical `playing` boolean, not `isPlaying`', () => {
		const state = createInitialRoomState('node-a', sequence, 8);
		const serialized = serializeRoomState(state);

		// Canonical field present → valid.
		expect(serialized.playback).toHaveProperty('playing');
		expect(serialized.playback).not.toHaveProperty('isPlaying');
		expect(validateSerializedRoomState(serialized)).toBe(true);
	});

	it('throws when the playback `playing` boolean is missing', () => {
		const state = createInitialRoomState('node-a', sequence, 8);
		const serialized = serializeRoomState(state) as unknown as Record<string, unknown>;
		const playback = { ...(serialized.playback as Record<string, unknown>) };
		delete playback.playing;

		expect(() =>
			validateSerializedRoomState({ ...serialized, playback })
		).toThrow(/playing/);
	});
});
