import { beforeEach, describe, expect, it } from "vitest";
import {
  deferLifecycleEvent,
  dueLifecycleEvents,
  enqueueLifecycleEvent,
  readLifecycleOutbox,
  type LifecycleOutboxStorage,
} from "#lib/shared/analytics/services/posthog-lifecycle-outbox.js";

function createStorage(): LifecycleOutboxStorage {
  let value: string | null = null;
  return {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
  };
}

const envelope = {
  event: "sequence_save" as const,
  eventId: "6a0d8c75-cf65-4c53-a378-f6533d654c73",
  occurredAt: "2026-08-21T12:00:00.000Z",
  properties: {
    sequenceId: "sequence-1",
    stepCount: 20,
    visibility: "public" as const,
    durability: "cloud" as const,
  },
};

describe("PostHog lifecycle outbox", () => {
  let storage: LifecycleOutboxStorage;

  beforeEach(() => {
    storage = createStorage();
  });

  it("returns only due events owned by the current Firebase UID", () => {
    enqueueLifecycleEvent(
      { ownerUid: "uid-a", envelope, sessionId: "session-1" },
      storage,
      1_000
    );

    expect(dueLifecycleEvents("uid-a", storage, 1_000)).toHaveLength(1);
    expect(dueLifecycleEvents("uid-b", storage, 1_000)).toEqual([]);
  });

  it("keeps the original envelope while backing off a failed delivery", () => {
    enqueueLifecycleEvent(
      { ownerUid: "uid-a", envelope, sessionId: "session-1" },
      storage,
      1_000
    );
    deferLifecycleEvent(envelope.eventId, storage, 1_000);

    expect(dueLifecycleEvents("uid-a", storage, 5_999)).toEqual([]);
    expect(dueLifecycleEvents("uid-a", storage, 6_000)[0]).toMatchObject({
      attempts: 1,
      envelope,
    });
  });

  it("drops expired or malformed persisted entries", () => {
    storage.setItem("ignored", JSON.stringify([{ ownerUid: "uid-a" }]));
    expect(readLifecycleOutbox(storage, 1_000)).toEqual([]);
  });
});
