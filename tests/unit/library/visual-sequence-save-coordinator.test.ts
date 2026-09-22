import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { LibraryError } from "$lib/shared/library/domain/library-error";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { DEFAULT_TRAIL_SETTINGS } from "$lib/shared/animation-engine/domain/types/trail-types";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
import type { PresentationIntent } from "$lib/shared/foundation/domain/models/presentation-intent";

const { computeHash, showToast, removeToast, onGuestSaveSucceeded } =
  vi.hoisted(() => ({
    computeHash: vi.fn(async () => "content-hash"),
    showToast: vi.fn(() => "toast-id"),
    removeToast: vi.fn(),
    onGuestSaveSucceeded: vi.fn(),
  }));

vi.mock("$lib/shared/library/services/sequence-content-hasher", () => ({
  computeHash,
}));

vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  showToast,
  removeToast,
}));

vi.mock(
  "$lib/shared/onboarding/state/post-save-activation-state.svelte",
  () => ({
    postSaveActivation: { onGuestSaveSucceeded },
  })
);

import { VisualSequenceSaveCoordinator } from "$lib/features/library/services/implementations/VisualSequenceSaveCoordinator";

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
  computeHash.mockClear();
  showToast.mockClear();
  removeToast.mockClear();
  onGuestSaveSucceeded.mockClear();
});

describe("VisualSequenceSaveCoordinator", () => {
  it("clears progress at the guest limit without stacking an error or success on the auth modal", async () => {
    const error = new LibraryError("Guest save limit", "GUEST_CAP");
    const coordinator = new VisualSequenceSaveCoordinator({
      saveSequence: vi.fn().mockRejectedValue(error),
    });
    expect(await coordinator.save(SEQUENCE)).toEqual({
      status: "failed",
      error,
    });
    expect(removeToast).toHaveBeenCalledWith("toast-id", "programmatic");
    expect(showToast).toHaveBeenCalledOnce();
    expect(onGuestSaveSucceeded).not.toHaveBeenCalled();
  });
  it("saves the sequence with the presentation visible at the click site", async () => {
    const saveSequence = vi.fn().mockResolvedValue({
      sequenceId: "seq-1",
      persisted: true,
      isGuest: false,
    });
    const coordinator = new VisualSequenceSaveCoordinator({ saveSequence });

    const outcome = await coordinator.save(SEQUENCE, {
      leftPropType: PropType.POI,
      rightPropType: PropType.FAN,
      catDogModeEnabled: true,
      pathShape: "concave",
    });

    expect(outcome.status).toBe("saved");
    const saved = saveSequence.mock.calls[0]![0] as SequenceData;
    expect(saved.intendedProp).toEqual({
      leftPropType: PropType.POI,
      rightPropType: PropType.FAN,
      catDogMode: true,
    });
    expect(saved.creatorIntent?.propConfig).toEqual(saved.intendedProp);
    expect(saved.metadata?.pathShape).toBe("concave");
    expect(saveSequence.mock.calls[0]![1]).toMatchObject({
      name: "AB",
      visibility: "public",
    });
    expect(onGuestSaveSucceeded).toHaveBeenCalledWith("seq-1");
  });

  it("shares one persistence operation across concurrent clicks", async () => {
    let finish!: (value: {
      sequenceId: string;
      persisted: boolean;
      isGuest: boolean;
    }) => void;
    const pending = new Promise<{
      sequenceId: string;
      persisted: boolean;
      isGuest: boolean;
    }>((resolve) => {
      finish = resolve;
    });
    const saveSequence = vi.fn(() => pending);
    const coordinator = new VisualSequenceSaveCoordinator({ saveSequence });

    const first = coordinator.save(SEQUENCE);
    const second = coordinator.save(SEQUENCE);
    await Promise.resolve();
    await Promise.resolve();
    expect(saveSequence).toHaveBeenCalledTimes(1);

    finish({ sequenceId: "seq-1", persisted: true, isGuest: false });
    expect(await first).toEqual(await second);
  });

  it("reports an existing library match without treating it as a failure", async () => {
    const saveSequence = vi
      .fn()
      .mockRejectedValue(
        new LibraryError("Already saved", "ALREADY_EXISTS", "seq-1")
      );
    const coordinator = new VisualSequenceSaveCoordinator({ saveSequence });

    const outcome = await coordinator.save(SEQUENCE);

    expect(outcome.status).toBe("already-saved");
    expect(showToast).toHaveBeenCalledWith("Already in library", "info");
  });

  const PRESENTATION = {
    primaryPropColors: { left: "#00ff00", right: "#ff00ff" },
    trail: DEFAULT_TRAIL_SETTINGS,
    effects: DEFAULT_EFFECTS_CONFIG,
  } satisfies PresentationIntent;

  it("writes a recorded presentation onto creatorIntent", async () => {
    const saveSequence = vi.fn(async () => ({
      persisted: true,
      sequenceId: "seq-1",
    }));
    const coordinator = new VisualSequenceSaveCoordinator({ saveSequence });
    await coordinator.save(SEQUENCE, { presentation: PRESENTATION });
    const stored = saveSequence.mock.calls[0]?.[0] as SequenceData;
    expect(stored.creatorIntent?.presentation).toEqual(PRESENTATION);
  });

  it("writes an explicit null when the creator chose the default look", async () => {
    const saveSequence = vi.fn(async () => ({
      persisted: true,
      sequenceId: "seq-1",
    }));
    const coordinator = new VisualSequenceSaveCoordinator({ saveSequence });
    await coordinator.save(SEQUENCE, { presentation: null });
    const stored = saveSequence.mock.calls[0]?.[0] as SequenceData;
    expect(stored.creatorIntent).toHaveProperty("presentation");
    expect(stored.creatorIntent?.presentation).toBeNull();
  });

  it("leaves a saved presentation alone when the intent omits it", async () => {
    const saveSequence = vi.fn(async () => ({
      persisted: true,
      sequenceId: "seq-1",
    }));
    const coordinator = new VisualSequenceSaveCoordinator({ saveSequence });
    await coordinator.save(
      {
        ...SEQUENCE,
        creatorIntent: { presentation: PRESENTATION },
      } as SequenceData,
      {}
    );
    const stored = saveSequence.mock.calls[0]?.[0] as SequenceData;
    expect(stored.creatorIntent?.presentation).toEqual(PRESENTATION);
  });

  it("carries a saved explicit null when the intent omits it", async () => {
    const saveSequence = vi.fn(async () => ({
      persisted: true,
      sequenceId: "seq-1",
    }));
    const coordinator = new VisualSequenceSaveCoordinator({ saveSequence });
    await coordinator.save(
      { ...SEQUENCE, creatorIntent: { presentation: null } } as SequenceData,
      {}
    );
    const stored = saveSequence.mock.calls[0]?.[0] as SequenceData;
    expect(stored.creatorIntent).toHaveProperty("presentation");
    expect(stored.creatorIntent?.presentation).toBeNull();
  });

  it("does not add a presentation key when nothing was saved or captured", async () => {
    const saveSequence = vi.fn(async () => ({
      persisted: true,
      sequenceId: "seq-1",
    }));
    const coordinator = new VisualSequenceSaveCoordinator({ saveSequence });
    await coordinator.save(SEQUENCE, {});
    const stored = saveSequence.mock.calls[0]?.[0] as SequenceData;
    expect(stored.creatorIntent).not.toHaveProperty("presentation");
  });

  it("treats an explicit undefined presentation as absent", async () => {
    const saveSequence = vi.fn(async () => ({
      persisted: true,
      sequenceId: "seq-1",
    }));
    const coordinator = new VisualSequenceSaveCoordinator({ saveSequence });
    await coordinator.save(SEQUENCE, { presentation: undefined });
    const stored = saveSequence.mock.calls[0]?.[0] as SequenceData;
    expect(stored.creatorIntent).not.toHaveProperty("presentation");
  });
});
