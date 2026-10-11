import { describe, it, expect, beforeEach, vi } from "vitest";
import { PendingActionQueue } from "#lib/shared/sequence-viewer/services/pending-action-queue.js";

describe("PendingActionQueue — URL bootstrap and replay", () => {
	let queue: PendingActionQueue;

	beforeEach(() => {
		queue = new PendingActionQueue();
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-14T12:00:00Z"));
	});

	it("survives a webview → real-browser handoff via URL", () => {
		const landedUrl = new URL("https://tka.app/p/ABC123?pending=save");
		queue.bootstrapFromUrl(landedUrl);

		const drained = queue.drain();
		expect(drained).not.toBeNull();
		expect(drained?.type).toBe("save");
		expect(drained?.sequenceId).toBe("ABC123");
		expect(queue.peek()).toBeNull();
	});

	it("expires pending action from URL bootstrap after TTL", () => {
		const landedUrl = new URL("https://tka.app/p/ABC123?pending=save");
		queue.bootstrapFromUrl(landedUrl);
		vi.advanceTimersByTime(10 * 60 * 1000 + 1);
		expect(queue.drain()).toBeNull();
	});

	it("gracefully handles URL without pending param", () => {
		const url = new URL("https://tka.app/p/ABC123?bpm=180");
		queue.bootstrapFromUrl(url);
		expect(queue.peek()).toBeNull();
	});
});
