import { describe, it, expect, beforeEach, vi } from "vitest";
import { PendingActionQueue, PENDING_ACTION_TTL_MS } from "#lib/shared/sequence-viewer/services/pending-action-queue.js";
describe("PendingActionQueue", () => {
	let queue: PendingActionQueue;

	beforeEach(() => {
		queue = new PendingActionQueue();
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-14T12:00:00Z"));
	});

	it("returns null when empty", () => {
		expect(queue.peek()).toBeNull();
		expect(queue.drain()).toBeNull();
	});

	it("enqueues and peeks without removing", () => {
		queue.enqueue({ type: "save", sequenceId: "abc" });
		expect(queue.peek()?.type).toBe("save");
		expect(queue.peek()?.sequenceId).toBe("abc");
		expect(queue.peek()?.type).toBe("save");
	});

	it("drain returns and clears", () => {
		queue.enqueue({ type: "favorite", sequenceId: "xyz" });
		const drained = queue.drain();
		expect(drained?.type).toBe("favorite");
		expect(queue.peek()).toBeNull();
	});

	it("replaces older entries when newer ones are enqueued", () => {
		queue.enqueue({ type: "save", sequenceId: "old" });
		queue.enqueue({ type: "favorite", sequenceId: "new" });
		expect(queue.peek()?.type).toBe("favorite");
		expect(queue.peek()?.sequenceId).toBe("new");
	});

	it("drops entries older than TTL on read", () => {
		queue.enqueue({ type: "save", sequenceId: "abc" });
		vi.advanceTimersByTime(PENDING_ACTION_TTL_MS + 1);
		expect(queue.peek()).toBeNull();
		expect(queue.drain()).toBeNull();
	});

	it("clear removes pending entry", () => {
		queue.enqueue({ type: "publish", sequenceId: "abc" });
		queue.clear();
		expect(queue.peek()).toBeNull();
	});

	it("bootstrapFromUrl reads ?pending=save", () => {
		const url = new URL("https://tka.app/p/ABC123?pending=save");
		queue.bootstrapFromUrl(url);
		expect(queue.peek()?.type).toBe("save");
	});

	it("bootstrapFromUrl ignores unknown pending types", () => {
		const url = new URL("https://tka.app/p/ABC123?pending=bogus");
		queue.bootstrapFromUrl(url);
		expect(queue.peek()).toBeNull();
	});

	it("bootstrapFromUrl uses sequenceId from URL path segments", () => {
		const url = new URL("https://tka.app/p/ABC123?pending=favorite");
		queue.bootstrapFromUrl(url);
		expect(queue.peek()?.sequenceId).toBe("ABC123");
	});

	it("serializeToUrlParam returns current pending type", () => {
		queue.enqueue({ type: "remix", sequenceId: "abc" });
		expect(queue.serializeToUrlParam()).toBe("remix");
	});

	it("serializeToUrlParam returns null when empty or expired", () => {
		expect(queue.serializeToUrlParam()).toBeNull();
		queue.enqueue({ type: "save", sequenceId: "abc" });
		vi.advanceTimersByTime(PENDING_ACTION_TTL_MS + 1);
		expect(queue.serializeToUrlParam()).toBeNull();
	});
});
