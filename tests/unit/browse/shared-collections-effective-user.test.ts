import { describe, expect, it, vi } from "vitest";
import type { ICollectionCollaborationManager } from "#lib/shared/library/services/contracts/ICollectionCollaborationManager.js";
import { createSharedCollectionsState } from "#lib/features/browse/collections/state/shared-collections-state.svelte.js";

describe("shared collections effective identity", () => {
  it("drops late subscription results from the previous identity", () => {
    const subscriptions = new Map<
      string,
      (items: Array<{ collection: { id: string } }>) => void
    >();
    const unsubscribes = new Map<string, ReturnType<typeof vi.fn>>();
    const manager = {
      subscribeToReceivedCollections(
        recipientId: string,
        onItems: (items: Array<{ collection: { id: string } }>) => void
      ) {
        subscriptions.set(recipientId, onItems);
        const unsubscribe = vi.fn();
        unsubscribes.set(recipientId, unsubscribe);
        return unsubscribe;
      },
    } as unknown as ICollectionCollaborationManager;
    const state = createSharedCollectionsState(manager);

    state.start("admin");
    state.start("preview-user");
    expect(unsubscribes.get("admin")).toHaveBeenCalledOnce();

    subscriptions.get("admin")?.([
      { collection: { id: "stale-admin-collection" } },
    ]);
    expect(state.items).toEqual([]);

    subscriptions.get("preview-user")?.([
      { collection: { id: "preview-collection" } },
    ]);
    expect(state.items[0]?.collection.id).toBe("preview-collection");
  });
});
