import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

/**
 * buildVisualSequenceSaveMenuItem's direct-call branch (no onSaveToLibrary
 * host callback) is the whole save action for its callers - the shared
 * ContextMenu component awaits it with no catch of its own. Before this file
 * added its own try/catch, a setup failure (for example the lazy
 * registration chunk failing to load) rejected silently: the dialog-less
 * menu item just did nothing. These checks confirm a failure now surfaces as
 * a toast instead of an unhandled rejection, and that a normal save is left
 * alone - coordinator.save() already reports its own outcome.
 */

const { showToast, getVisualSequenceSaveCoordinator } = vi.hoisted(() => ({
  showToast: vi.fn(() => "toast-id"),
  getVisualSequenceSaveCoordinator: vi.fn(),
}));

vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  showToast,
}));

vi.mock("$lib/shared/library/get-visual-sequence-save-coordinator", () => ({
  getVisualSequenceSaveCoordinator,
}));

import { buildVisualSequenceSaveMenuItem } from "$lib/shared/library/services/visual-sequence-save-menu-item";

const SEQUENCE = {
  id: "seq-1",
  name: "AB",
  word: "AB",
  steps: [{ letter: "A" }, { letter: "B" }],
  thumbnails: [],
  isFavorite: false,
  isCircular: false,
  tags: [],
  metadata: {},
} as unknown as SequenceData;

beforeEach(() => {
  showToast.mockClear();
  getVisualSequenceSaveCoordinator.mockReset();
});

describe("buildVisualSequenceSaveMenuItem direct-call branch", () => {
  it("shows a toast instead of letting a setup failure vanish", async () => {
    getVisualSequenceSaveCoordinator.mockRejectedValue(
      new Error("Visual sequence saving has not been registered")
    );
    const item = buildVisualSequenceSaveMenuItem(SEQUENCE);

    await expect(item.action()).resolves.toBeUndefined();

    expect(showToast).toHaveBeenCalledWith(
      "Couldn't save this sequence right now",
      "error"
    );
  });

  it("saves through the coordinator and leaves its own outcome toast alone", async () => {
    const save = vi.fn().mockResolvedValue({ status: "saved" });
    getVisualSequenceSaveCoordinator.mockResolvedValue({ save });
    const item = buildVisualSequenceSaveMenuItem(SEQUENCE, { pathShape: "concave" });

    await item.action();

    expect(save).toHaveBeenCalledWith(SEQUENCE, { pathShape: "concave" });
    expect(showToast).not.toHaveBeenCalled();
  });

  it("defers entirely to the host callback when one is supplied", async () => {
    const onSaveToLibrary = vi.fn().mockResolvedValue(undefined);
    const item = buildVisualSequenceSaveMenuItem(SEQUENCE, {}, onSaveToLibrary);

    await item.action();

    expect(onSaveToLibrary).toHaveBeenCalledTimes(1);
    expect(getVisualSequenceSaveCoordinator).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });
});
