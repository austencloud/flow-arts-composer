import type { ICollectionCollaborationManager } from "#lib/shared/library/services/contracts/ICollectionCollaborationManager.js";

export function createSharedCollectionsState(
  collaborationManager: ICollectionCollaborationManager
) {
  let items = $state<
    import("#lib/shared/library/services/contracts/ICollectionCollaborationManager.js").ReceivedCollectionItem[]
  >([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let startedFor = $state<string | null>(null);
  let unsubscribe: (() => void) | null = null;

  function stop(): void {
    unsubscribe?.();
    unsubscribe = null;
    startedFor = null;
    items = [];
    loading = false;
    error = null;
  }

  function start(recipientId: string | null): void {
    if (!recipientId) {
      stop();
      return;
    }
    if (startedFor === recipientId) return;

    stop();
    startedFor = recipientId;
    loading = true;
    unsubscribe = collaborationManager.subscribeToReceivedCollections(
      recipientId,
      (nextItems) => {
        if (startedFor !== recipientId) return;
        items = nextItems;
        loading = false;
        error = null;
      },
      (failure) => {
        if (startedFor !== recipientId) return;
        console.error(
          "[shared-collections-state] Subscription failed:",
          failure
        );
        loading = false;
        error = "Shared collections couldn't be loaded.";
      }
    );
  }

  return {
    get items() {
      return items;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    start,
    stop,
  };
}

export type SharedCollectionsState = ReturnType<
  typeof createSharedCollectionsState
>;
