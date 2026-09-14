import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import { viewerState } from "./pending-edit-harness.svelte";
import { createPendingEditEffect } from "$lib/features/create/shared/state/managers/pending-edit-manager.svelte";
import type { DeepLinkSequenceHandler } from "$lib/features/create/shared/services/deep-link-sequence-handler";
import type { CreateModuleState } from "$lib/features/create/shared/state/create-module-state.svelte";
import type { ConstructTabState } from "$lib/features/create/shared/state/construct-tab-state.svelte";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

vi.mock("$lib/shared/navigation/state/navigation-state.svelte", () => ({
  navigationState: { currentModule: "create" },
}));
vi.mock(
  "$lib/shared/sequence-viewer/state/sequence-viewer-overlay-state.svelte",
  async () => {
    const { viewerState } = await import("./pending-edit-harness.svelte");
    return { getSequenceOverlayState: () => viewerState };
  }
);

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  viewerState.isOpen = false;
});

describe("Remix into an already mounted Create workspace", () => {
  it("loads each new remix when the viewer closes without a module change", () => {
    let pending: SequenceData | null = null;
    const setCurrentSequence = vi.fn();
    const syncPickerStateWithSequence = vi.fn();
    const setShowStartPositionPicker = vi.fn();
    const loadFromPendingEdit = vi.fn(
      async (apply: (sequence: SequenceData) => void) => {
        if (!pending) return { loaded: false };
        apply(pending);
        pending = null;
        return { loaded: true, source: "pendingEdit" as const };
      }
    );
    dispose = createPendingEditEffect({
      getDeepLinker: () =>
        ({
          hasPendingEdit: () => pending !== null,
          loadFromPendingEdit,
        }) as unknown as DeepLinkSequenceHandler,
      getCreateModuleState: () => ({}) as CreateModuleState,
      getConstructTabState: () =>
        ({
          sequenceState: { setCurrentSequence },
          syncPickerStateWithSequence,
          setShowStartPositionPicker,
        }) as unknown as ConstructTabState,
      isServicesInitialized: () => true,
    });
    flushSync();

    for (const id of ["41DG", "second-remix"]) {
      viewerState.isOpen = true;
      flushSync();
      const sequence = { id, steps: [] } as unknown as SequenceData;
      pending = sequence;
      flushSync();
      expect(setCurrentSequence).not.toHaveBeenCalledWith(sequence);

      viewerState.isOpen = false;
      flushSync();
      expect(setCurrentSequence).toHaveBeenLastCalledWith(sequence);
      expect(pending).toBeNull();
    }

    expect(loadFromPendingEdit).toHaveBeenCalledTimes(2);
    expect(syncPickerStateWithSequence).toHaveBeenCalledTimes(2);
    expect(setShowStartPositionPicker).toHaveBeenLastCalledWith(false);
    viewerState.isOpen = true;
    flushSync();
    viewerState.isOpen = false;
    flushSync();
    expect(loadFromPendingEdit).toHaveBeenCalledTimes(2);
  });
});
