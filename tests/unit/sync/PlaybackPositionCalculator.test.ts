/**
 * Tests for PlaybackPositionCalculator
 *
 * These tests verify the deterministic playback equation:
 *   step = anchorStep + ((now - anchorWallTime) / beatDuration) * speed
 *
 * Critical properties:
 * - Given the same intent and time, every device calculates the same position
 * - Looping wraps correctly in both directions
 * - Drift correction smoothly converges without jarring jumps
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PlaybackPositionCalculator } from '#lib/shared/sync/services/playback-position-calculator.js';
import type { PlaybackIntent, HLCTimestamp } from '#lib/shared/sync/domain/sync-types.js';

describe('PlaybackPositionCalculator', () => {
	let calculator: PlaybackPositionCalculator;

	// Helper to create a test intent
	function createIntent(overrides: Partial<PlaybackIntent> = {}): PlaybackIntent {
		const hlc: HLCTimestamp = { wallTime: 1000, logical: 0, nodeId: 'test' };
		return {
			intentId: 'test-intent',
			playing: true,
			anchorStep: 0,
			anchorHlc: hlc,
			anchorWallTime: 1000, // Start at wall time 1000
			speed: 1.0,
			loop: false,
			totalSteps: 10,
			...overrides
		};
	}

	beforeEach(() => {
		calculator = new PlaybackPositionCalculator();
		calculator.setStepDuration(1000); // 1 second per beat
	});

	describe('calculatePosition - basic cases', () => {
		it('should return anchor step when paused', () => {
			const intent = createIntent({ playing: false, anchorStep: 5 });
			const result = calculator.calculatePosition(intent, 5000);

			expect(result.step).toBe(5);
			expect(result.beat).toBe(5);
		});

		it('should return anchor step when speed is zero', () => {
			const intent = createIntent({ speed: 0, anchorStep: 3 });
			const result = calculator.calculatePosition(intent, 5000);

			expect(result.step).toBe(3);
		});

		it('should calculate correct position at normal speed', () => {
			const intent = createIntent({
				anchorStep: 0,
				anchorWallTime: 1000,
				speed: 1.0
			});

			// 2 seconds later should be at step 2
			const result = calculator.calculatePosition(intent, 3000);

			expect(result.step).toBe(2);
			expect(result.beat).toBe(2);
			expect(result.beatProgress).toBe(0);
		});

		it('should handle fractional positions', () => {
			const intent = createIntent({
				anchorStep: 0,
				anchorWallTime: 1000,
				speed: 1.0
			});

			// 2.5 seconds later should be at step 2.5
			const result = calculator.calculatePosition(intent, 3500);

			expect(result.step).toBe(2.5);
			expect(result.beat).toBe(2);
			expect(result.beatProgress).toBe(0.5);
		});

		it('should handle speed multiplier', () => {
			const intent = createIntent({
				anchorStep: 0,
				anchorWallTime: 1000,
				speed: 2.0 // 2x speed
			});

			// 2 seconds at 2x speed = 4 steps
			const result = calculator.calculatePosition(intent, 3000);

			expect(result.step).toBe(4);
		});

		it('should handle slow speed', () => {
			const intent = createIntent({
				anchorStep: 0,
				anchorWallTime: 1000,
				speed: 0.5 // 0.5x speed
			});

			// 4 seconds at 0.5x speed = 2 steps
			const result = calculator.calculatePosition(intent, 5000);

			expect(result.step).toBe(2);
		});
	});

	describe('calculatePosition - edge cases', () => {
		it('should handle zero total steps', () => {
			const intent = createIntent({ totalSteps: 0 });
			const result = calculator.calculatePosition(intent, 5000);

			expect(result.step).toBe(0);
			expect(result.isAtEnd).toBe(true);
		});

		it('should clamp negative elapsed time to zero', () => {
			const intent = createIntent({
				anchorStep: 5,
				anchorWallTime: 5000 // Future anchor
			});

			// Current time is before anchor (clock drift scenario)
			const result = calculator.calculatePosition(intent, 3000);

			expect(result.step).toBe(5); // Should stay at anchor, not go negative
		});

		it('should clamp to end when exceeding total steps without loop', () => {
			const intent = createIntent({
				anchorStep: 0,
				anchorWallTime: 1000,
				totalSteps: 5,
				loop: false
			});

			// 10 seconds later should be clamped to step 4 (last step)
			const result = calculator.calculatePosition(intent, 11000);

			expect(result.step).toBe(4);
			expect(result.isAtEnd).toBe(true);
		});

		it('should handle non-zero anchor step', () => {
			const intent = createIntent({
				anchorStep: 5,
				anchorWallTime: 1000,
				totalSteps: 10
			});

			// 2 seconds from step 5 = step 7
			const result = calculator.calculatePosition(intent, 3000);

			expect(result.step).toBe(7);
		});
	});

	describe('calculatePosition - looping', () => {
		it('should wrap forward when looping', () => {
			const intent = createIntent({
				anchorStep: 0,
				anchorWallTime: 1000,
				totalSteps: 4,
				loop: true
			});

			// 6 seconds with 4 steps = step 6 % 4 = 2
			const result = calculator.calculatePosition(intent, 7000);

			expect(result.step).toBe(2);
			expect(result.isLooping).toBe(true);
		});

		it('should handle multiple loop cycles', () => {
			const intent = createIntent({
				anchorStep: 0,
				anchorWallTime: 1000,
				totalSteps: 4,
				loop: true
			});

			// 10 seconds with 4 steps = step 10 % 4 = 2
			const result = calculator.calculatePosition(intent, 11000);

			expect(result.step).toBe(2);
		});
	});

	describe('calculatePosition - reverse playback', () => {
		it('should support negative speed', () => {
			const intent = createIntent({
				anchorStep: 5,
				anchorWallTime: 1000,
				speed: -1.0,
				totalSteps: 10,
				loop: false
			});

			// 2 seconds backwards from step 5 = step 3
			const result = calculator.calculatePosition(intent, 3000);

			expect(result.step).toBe(3);
		});

		it('should clamp to start when reversing without loop', () => {
			const intent = createIntent({
				anchorStep: 2,
				anchorWallTime: 1000,
				speed: -1.0,
				totalSteps: 10,
				loop: false
			});

			// 5 seconds backwards from step 2 would be -3, should clamp to 0
			const result = calculator.calculatePosition(intent, 6000);

			expect(result.step).toBe(0);
		});

		it('should wrap backwards when looping with negative speed', () => {
			const intent = createIntent({
				anchorStep: 1,
				anchorWallTime: 1000,
				speed: -1.0,
				totalSteps: 4,
				loop: true
			});

			// 3 seconds backwards from step 1 = -2, should wrap to step 2
			const result = calculator.calculatePosition(intent, 4000);

			expect(result.step).toBe(2);
			expect(result.isLooping).toBe(true);
		});
	});

	describe('calculateCorrectedPosition - drift correction', () => {
		it('should ignore tiny drift', () => {
			const intent = createIntent({
				anchorStep: 0,
				anchorWallTime: 1000
			});

			// Target is step 2, last rendered was 2.005 (tiny drift)
			const result = calculator.calculateCorrectedPosition(intent, 3000, 2.005);

			expect(result.step).toBe(2.005); // Should keep last rendered
		});

		it('should snap on large drift', () => {
			const intent = createIntent({
				anchorStep: 0,
				anchorWallTime: 1000
			});

			// Target is step 2, last rendered was 5 (large drift)
			const result = calculator.calculateCorrectedPosition(intent, 3000, 5);

			expect(result.step).toBe(2); // Should snap to target
		});

		it('should ease toward target on medium drift', () => {
			const intent = createIntent({
				anchorStep: 0,
				anchorWallTime: 1000
			});

			// Target is step 2, last rendered was 1.5 (medium drift of 0.5)
			const result = calculator.calculateCorrectedPosition(intent, 3000, 1.5, 0.1);

			// Should move 0.1 toward target (max correction)
			expect(result.step).toBe(1.6);
		});

		it('should return target when paused', () => {
			const intent = createIntent({
				playing: false,
				anchorStep: 5
			});

			// Even with drift, should return anchor step when paused
			const result = calculator.calculateCorrectedPosition(intent, 3000, 3);

			expect(result.step).toBe(5);
		});
	});

	describe('calculateAnchorForTarget', () => {
		it('should return the target step directly', () => {
			const anchor = calculator.calculateAnchorForTarget(7.5, Date.now());

			expect(anchor).toBe(7.5);
		});
	});

	describe('setStepDuration', () => {
		it('should affect position calculations', () => {
			const intent = createIntent({
				anchorStep: 0,
				anchorWallTime: 1000
			});

			calculator.setStepDuration(500); // 0.5 seconds per beat

			// 2 seconds at 0.5s/beat = 4 steps
			const result = calculator.calculatePosition(intent, 3000);

			expect(result.step).toBe(4);
		});

		it('should throw on non-positive duration', () => {
			expect(() => calculator.setStepDuration(0)).toThrow();
			expect(() => calculator.setStepDuration(-100)).toThrow();
		});
	});

	describe('determinism', () => {
		it('should produce identical results for identical inputs', () => {
			const intent = createIntent({
				anchorStep: 3,
				anchorWallTime: 1000,
				speed: 1.5,
				totalSteps: 20
			});

			const nowMs = 5000;

			// Calculate multiple times
			const result1 = calculator.calculatePosition(intent, nowMs);
			const result2 = calculator.calculatePosition(intent, nowMs);
			const result3 = calculator.calculatePosition(intent, nowMs);

			expect(result1).toEqual(result2);
			expect(result2).toEqual(result3);
		});

		it('should produce identical results across different calculator instances', () => {
			const intent = createIntent({
				anchorStep: 3,
				anchorWallTime: 1000,
				speed: 1.5,
				totalSteps: 20
			});

			const calc1 = new PlaybackPositionCalculator();
			const calc2 = new PlaybackPositionCalculator();
			calc1.setStepDuration(1000);
			calc2.setStepDuration(1000);

			const nowMs = 5000;

			const result1 = calc1.calculatePosition(intent, nowMs);
			const result2 = calc2.calculatePosition(intent, nowMs);

			expect(result1).toEqual(result2);
		});
	});
});
