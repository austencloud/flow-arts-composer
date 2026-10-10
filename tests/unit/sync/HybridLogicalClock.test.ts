/**
 * Tests for HybridLogicalClock
 *
 * These tests verify the mathematical guarantees of the HLC algorithm:
 * - Timestamps are monotonically increasing for local events
 * - Causal ordering is preserved across nodes
 * - Comparison is deterministic
 * - Serialization round-trips correctly
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HybridLogicalClock } from '#lib/shared/sync/services/hybrid-logical-clock.js';
import type { HLCTimestamp } from '#lib/shared/sync/domain/sync-types.js';

describe('HybridLogicalClock', () => {
	let clock: HybridLogicalClock;

	beforeEach(() => {
		clock = new HybridLogicalClock('node-a');
	});

	describe('now()', () => {
		it('should generate timestamps with the correct node ID', () => {
			const ts = clock.now();
			expect(ts.nodeId).toBe('node-a');
		});

		it('should generate monotonically increasing timestamps', () => {
			const ts1 = clock.now();
			const ts2 = clock.now();
			const ts3 = clock.now();

			expect(clock.compare(ts1, ts2)).toBe(-1);
			expect(clock.compare(ts2, ts3)).toBe(-1);
			expect(clock.compare(ts1, ts3)).toBe(-1);
		});

		it('should increment logical counter when called in same millisecond', () => {
			// Generate many timestamps quickly to force same-millisecond scenario
			const timestamps: HLCTimestamp[] = [];
			for (let i = 0; i < 100; i++) {
				timestamps.push(clock.now());
			}

			// All should be strictly increasing
			for (let i = 1; i < timestamps.length; i++) {
				expect(clock.compare(timestamps[i - 1], timestamps[i])).toBe(-1);
			}

			// Some should have same wallTime but different logical counter
			const sameWallTime = timestamps.filter((t) => t.wallTime === timestamps[0].wallTime);
			if (sameWallTime.length > 1) {
				expect(sameWallTime[0].logical).toBeLessThan(sameWallTime[sameWallTime.length - 1].logical);
			}
		});
	});

	describe('receive()', () => {
		it('should advance past remote timestamp', () => {
			const remote: HLCTimestamp = {
				wallTime: Date.now() + 1000, // 1 second in the future
				logical: 5,
				nodeId: 'node-b'
			};

			const result = clock.receive(remote);

			// Result should be > remote
			expect(clock.compare(result, remote)).toBe(1);
		});

		it('should handle remote timestamp in the past', () => {
			const localBefore = clock.now();

			const remote: HLCTimestamp = {
				wallTime: Date.now() - 10000, // 10 seconds in the past
				logical: 100,
				nodeId: 'node-b'
			};

			const result = clock.receive(remote);

			// Result should be > both localBefore and remote
			expect(clock.compare(result, localBefore)).toBe(1);
			expect(clock.compare(result, remote)).toBe(1);
		});

		it('should handle remote timestamp with same wall time', () => {
			// Force a specific wall time by generating a local timestamp first
			const local = clock.now();

			const remote: HLCTimestamp = {
				wallTime: local.wallTime,
				logical: local.logical + 10,
				nodeId: 'node-b'
			};

			const result = clock.receive(remote);

			// Result should be > remote (logical should be max + 1)
			expect(clock.compare(result, remote)).toBe(1);
			expect(result.logical).toBeGreaterThan(remote.logical);
		});
	});

	describe('compare()', () => {
		it('should order by wall time first', () => {
			const a: HLCTimestamp = { wallTime: 1000, logical: 5, nodeId: 'node-b' };
			const b: HLCTimestamp = { wallTime: 2000, logical: 0, nodeId: 'node-a' };

			expect(clock.compare(a, b)).toBe(-1);
			expect(clock.compare(b, a)).toBe(1);
		});

		it('should order by logical counter when wall time is equal', () => {
			const a: HLCTimestamp = { wallTime: 1000, logical: 5, nodeId: 'node-z' };
			const b: HLCTimestamp = { wallTime: 1000, logical: 10, nodeId: 'node-a' };

			expect(clock.compare(a, b)).toBe(-1);
			expect(clock.compare(b, a)).toBe(1);
		});

		it('should order by node ID when wall time and logical are equal', () => {
			const a: HLCTimestamp = { wallTime: 1000, logical: 5, nodeId: 'node-a' };
			const b: HLCTimestamp = { wallTime: 1000, logical: 5, nodeId: 'node-b' };

			expect(clock.compare(a, b)).toBe(-1);
			expect(clock.compare(b, a)).toBe(1);
		});

		it('should return 0 for identical timestamps', () => {
			const a: HLCTimestamp = { wallTime: 1000, logical: 5, nodeId: 'node-a' };
			const b: HLCTimestamp = { wallTime: 1000, logical: 5, nodeId: 'node-a' };

			expect(clock.compare(a, b)).toBe(0);
		});
	});

	describe('happenedBefore()', () => {
		it('should return true when a < b', () => {
			const a: HLCTimestamp = { wallTime: 1000, logical: 0, nodeId: 'node-a' };
			const b: HLCTimestamp = { wallTime: 2000, logical: 0, nodeId: 'node-a' };

			expect(clock.happenedBefore(a, b)).toBe(true);
			expect(clock.happenedBefore(b, a)).toBe(false);
		});

		it('should return false when timestamps are equal', () => {
			const a: HLCTimestamp = { wallTime: 1000, logical: 0, nodeId: 'node-a' };
			const b: HLCTimestamp = { wallTime: 1000, logical: 0, nodeId: 'node-a' };

			expect(clock.happenedBefore(a, b)).toBe(false);
		});
	});

	describe('areConcurrent()', () => {
		it('should return true for same wall time and logical, different nodes', () => {
			const a: HLCTimestamp = { wallTime: 1000, logical: 5, nodeId: 'node-a' };
			const b: HLCTimestamp = { wallTime: 1000, logical: 5, nodeId: 'node-b' };

			expect(clock.areConcurrent(a, b)).toBe(true);
		});

		it('should return false for different wall times', () => {
			const a: HLCTimestamp = { wallTime: 1000, logical: 5, nodeId: 'node-a' };
			const b: HLCTimestamp = { wallTime: 1001, logical: 5, nodeId: 'node-b' };

			expect(clock.areConcurrent(a, b)).toBe(false);
		});

		it('should return false for same node ID', () => {
			const a: HLCTimestamp = { wallTime: 1000, logical: 5, nodeId: 'node-a' };
			const b: HLCTimestamp = { wallTime: 1000, logical: 5, nodeId: 'node-a' };

			expect(clock.areConcurrent(a, b)).toBe(false);
		});
	});

	describe('serialize() and deserialize()', () => {
		it('should round-trip correctly', () => {
			const original: HLCTimestamp = {
				wallTime: 1704067200000,
				logical: 42,
				nodeId: 'test-node-123'
			};

			const serialized = clock.serialize(original);
			const deserialized = clock.deserialize(serialized);

			expect(deserialized).toEqual(original);
		});

		it('should produce expected format', () => {
			const ts: HLCTimestamp = {
				wallTime: 1000,
				logical: 5,
				nodeId: 'node-a'
			};

			expect(clock.serialize(ts)).toBe('1000:5:node-a');
		});

		it('should handle node IDs containing colons', () => {
			const original: HLCTimestamp = {
				wallTime: 1000,
				logical: 5,
				nodeId: 'node:with:colons'
			};

			const serialized = clock.serialize(original);
			const deserialized = clock.deserialize(serialized);

			expect(deserialized.nodeId).toBe('node:with:colons');
		});

		it('should throw on invalid format', () => {
			expect(() => clock.deserialize('invalid')).toThrow();
			expect(() => clock.deserialize('not:a:number:node')).toThrow();
			expect(() => clock.deserialize('1000:5:')).toThrow();
		});
	});

	describe('drift protection', () => {
		it('should reset when drift exceeds maxDriftMs', () => {
			const clockWithSmallDrift = new HybridLogicalClock('node-a', 100); // 100ms max drift

			// Receive a timestamp far in the future
			const remote: HLCTimestamp = {
				wallTime: Date.now() + 200, // 200ms in future (exceeds 100ms limit)
				logical: 0,
				nodeId: 'node-b'
			};

			const result = clockWithSmallDrift.receive(remote);

			// Should have reset to near current time (within reason)
			const now = Date.now();
			expect(result.wallTime).toBeLessThanOrEqual(now + 10); // Small tolerance
		});
	});

	describe('cross-node causality', () => {
		it('should maintain causality across multiple nodes', () => {
			const clockA = new HybridLogicalClock('node-a');
			const clockB = new HybridLogicalClock('node-b');
			const clockC = new HybridLogicalClock('node-c');

			// Simulate: A sends to B, B sends to C, C sends to A
			const tsA1 = clockA.now();
			const tsB1 = clockB.receive(tsA1);
			const tsC1 = clockC.receive(tsB1);
			const tsA2 = clockA.receive(tsC1);

			// Chain should be strictly increasing
			expect(clockA.compare(tsA1, tsB1)).toBe(-1);
			expect(clockA.compare(tsB1, tsC1)).toBe(-1);
			expect(clockA.compare(tsC1, tsA2)).toBe(-1);
			expect(clockA.compare(tsA1, tsA2)).toBe(-1);
		});
	});
});
