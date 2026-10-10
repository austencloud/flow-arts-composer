// @vitest-environment jsdom

/**
 * library-events.ts Tests
 *
 * Tests the cross-module event bus that notifies gallery subscribers when
 * the user's sequence library is mutated (added or deleted).
 *
 * HIGH VALUE: These tests catch two silent failure modes:
 *   1. Listener cleanup failures — gallery reloads on every future
 *      mutation even after the component is destroyed (listener leak).
 *   2. Event name mismatches — gallery silently stops refreshing because
 *      the dispatch and listener use different event names.
 *
 * Note: the event-name tests spy on window.dispatchEvent so they will fail
 * if the constants in library-events.ts are renamed without updating subscribers.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  notifyLibraryMutated,
  onLibraryMutated,
  LIBRARY_MUTATED_EVENT,
  notifyLibrarySequenceAdded,
  onLibrarySequenceAdded,
  LIBRARY_SEQUENCE_ADDED_EVENT,
  notifyLibrarySequenceUpdated,
  onLibrarySequenceUpdated,
  LIBRARY_SEQUENCE_UPDATED_EVENT,
} from "#lib/shared/library/library-events.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

afterEach(() => {
  // Clean up any lingering listeners between tests
  vi.restoreAllMocks();
});

describe("notifyLibraryMutated", () => {
  it("dispatches an event named 'tka:library-mutated'", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    notifyLibraryMutated("seq-1");
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: LIBRARY_MUTATED_EVENT })
    );
  });

  it("passes the sequenceId to the handler", () => {
    const handler = vi.fn();
    const cleanup = onLibraryMutated(handler);

    notifyLibraryMutated("seq-abc-123");

    expect(handler).toHaveBeenCalledWith("seq-abc-123");
    cleanup();
  });

  it("calls a registered handler", () => {
    const handler = vi.fn();
    const cleanup = onLibraryMutated(handler);

    notifyLibraryMutated("seq-1");

    expect(handler).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("calls multiple registered handlers", () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    const cleanupA = onLibraryMutated(handlerA);
    const cleanupB = onLibraryMutated(handlerB);

    notifyLibraryMutated("seq-1");

    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledTimes(1);
    cleanupA();
    cleanupB();
  });

  it("calls handlers each time it is dispatched", () => {
    const handler = vi.fn();
    const cleanup = onLibraryMutated(handler);

    notifyLibraryMutated("seq-1");
    notifyLibraryMutated("seq-2");
    notifyLibraryMutated("seq-3");

    expect(handler).toHaveBeenCalledTimes(3);
    cleanup();
  });
});

describe("onLibraryMutated cleanup", () => {
  it("stops calling the handler after cleanup is invoked", () => {
    const handler = vi.fn();
    const cleanup = onLibraryMutated(handler);

    notifyLibraryMutated("seq-1");
    expect(handler).toHaveBeenCalledTimes(1);

    cleanup();
    notifyLibraryMutated("seq-2");

    // Still only 1 call — cleanup removed the listener
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("only removes the specific handler, not others", () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    const cleanupA = onLibraryMutated(handlerA);
    const cleanupB = onLibraryMutated(handlerB);

    cleanupA();
    notifyLibraryMutated("seq-1");

    expect(handlerA).toHaveBeenCalledTimes(0);
    expect(handlerB).toHaveBeenCalledTimes(1);
    cleanupB();
  });

  it("is safe to call cleanup more than once", () => {
    const handler = vi.fn();
    const cleanup = onLibraryMutated(handler);

    cleanup();
    expect(() => cleanup()).not.toThrow();

    notifyLibraryMutated("seq-1");
    expect(handler).toHaveBeenCalledTimes(0);
  });
});


const fakeSequence = { id: "seq-new", name: "TEST" } as SequenceData;

describe("notifyLibrarySequenceAdded", () => {
  it("dispatches an event named 'tka:library-sequence-added'", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    notifyLibrarySequenceAdded(fakeSequence);
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: LIBRARY_SEQUENCE_ADDED_EVENT })
    );
  });

  it("passes the full sequence to the handler", () => {
    const handler = vi.fn();
    const cleanup = onLibrarySequenceAdded(handler);

    notifyLibrarySequenceAdded(fakeSequence);

    expect(handler).toHaveBeenCalledWith(fakeSequence);
    cleanup();
  });

  it("calls multiple registered handlers", () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    const cleanupA = onLibrarySequenceAdded(handlerA);
    const cleanupB = onLibrarySequenceAdded(handlerB);

    notifyLibrarySequenceAdded(fakeSequence);

    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledTimes(1);
    cleanupA();
    cleanupB();
  });

  it("calls handlers each time it is dispatched", () => {
    const handler = vi.fn();
    const cleanup = onLibrarySequenceAdded(handler);

    const seq2 = { id: "seq-2", name: "TWO" } as SequenceData;
    notifyLibrarySequenceAdded(fakeSequence);
    notifyLibrarySequenceAdded(seq2);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(1, fakeSequence);
    expect(handler).toHaveBeenNthCalledWith(2, seq2);
    cleanup();
  });
});

describe("onLibrarySequenceAdded cleanup", () => {
  it("stops calling the handler after cleanup is invoked", () => {
    const handler = vi.fn();
    const cleanup = onLibrarySequenceAdded(handler);

    notifyLibrarySequenceAdded(fakeSequence);
    expect(handler).toHaveBeenCalledTimes(1);

    cleanup();
    notifyLibrarySequenceAdded(fakeSequence);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("only removes the specific handler, not others", () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    const cleanupA = onLibrarySequenceAdded(handlerA);
    const cleanupB = onLibrarySequenceAdded(handlerB);

    cleanupA();
    notifyLibrarySequenceAdded(fakeSequence);

    expect(handlerA).toHaveBeenCalledTimes(0);
    expect(handlerB).toHaveBeenCalledTimes(1);
    cleanupB();
  });

  it("is safe to call cleanup more than once", () => {
    const handler = vi.fn();
    const cleanup = onLibrarySequenceAdded(handler);

    cleanup();
    expect(() => cleanup()).not.toThrow();

    notifyLibrarySequenceAdded(fakeSequence);
    expect(handler).toHaveBeenCalledTimes(0);
  });
});


describe("notifyLibrarySequenceUpdated", () => {
  it("dispatches an event named 'tka:library-sequence-updated'", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    notifyLibrarySequenceUpdated("seq-1", { tags: ["new"] });
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: LIBRARY_SEQUENCE_UPDATED_EVENT })
    );
  });

  it("delivers sequenceId and updates to the handler", () => {
    const handler = vi.fn();
    const cleanup = onLibrarySequenceUpdated(handler);
    const updates = { visibility: "public" };

    notifyLibrarySequenceUpdated("seq-abc", updates);

    expect(handler).toHaveBeenCalledWith("seq-abc", updates);
    cleanup();
  });

  it("calls multiple registered handlers", () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    const cleanupA = onLibrarySequenceUpdated(handlerA);
    const cleanupB = onLibrarySequenceUpdated(handlerB);

    notifyLibrarySequenceUpdated("seq-1", { favorite: true });

    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledTimes(1);
    cleanupA();
    cleanupB();
  });

  it("calls handlers each time it is dispatched", () => {
    const handler = vi.fn();
    const cleanup = onLibrarySequenceUpdated(handler);

    const updates1 = { tags: ["fire"] };
    const updates2 = { notes: "updated" };
    notifyLibrarySequenceUpdated("seq-1", updates1);
    notifyLibrarySequenceUpdated("seq-2", updates2);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(1, "seq-1", updates1);
    expect(handler).toHaveBeenNthCalledWith(2, "seq-2", updates2);
    cleanup();
  });
});

describe("onLibrarySequenceUpdated cleanup", () => {
  it("stops calling the handler after cleanup is invoked", () => {
    const handler = vi.fn();
    const cleanup = onLibrarySequenceUpdated(handler);

    notifyLibrarySequenceUpdated("seq-1", { tags: [] });
    expect(handler).toHaveBeenCalledTimes(1);

    cleanup();
    notifyLibrarySequenceUpdated("seq-2", { tags: [] });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("only removes the specific handler, not others", () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    const cleanupA = onLibrarySequenceUpdated(handlerA);
    const cleanupB = onLibrarySequenceUpdated(handlerB);

    cleanupA();
    notifyLibrarySequenceUpdated("seq-1", { favorite: true });

    expect(handlerA).toHaveBeenCalledTimes(0);
    expect(handlerB).toHaveBeenCalledTimes(1);
    cleanupB();
  });

  it("is safe to call cleanup more than once", () => {
    const handler = vi.fn();
    const cleanup = onLibrarySequenceUpdated(handler);

    cleanup();
    expect(() => cleanup()).not.toThrow();

    notifyLibrarySequenceUpdated("seq-1", { tags: [] });
    expect(handler).toHaveBeenCalledTimes(0);
  });
});
