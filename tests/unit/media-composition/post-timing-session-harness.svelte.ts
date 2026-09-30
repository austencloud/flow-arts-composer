import {
  createTakeTiming,
  type TakeTiming,
  type ResolvedTakeTiming,
  type TimingSection,
} from "$lib/shared/media-composition/domain/take-timing";
import {
  createPostTimingSession,
  type TimingHost,
} from "$lib/shared/share/components/post-studio/builder/post-timing-session.svelte";

/** A Timing session over one untapped take, with no video attached. */
export function createPostTimingSessionHarness(
  resolved: ResolvedTakeTiming | null = null
) {
  let undoCount = 0;
  let redoCount = 0;
  let timing = $state<TakeTiming>(
    createTakeTiming({
      sequenceId: "dck",
      takeKey: "take-a",
      durationSeconds: 60,
      now: 1,
    })
  );
  const builder = {
    takes: [{ id: "take-a", label: "Take A", durationSeconds: 60 }],
    selectedTakeId: "take-a",
    moveBeats: [1, 1, 1, 1, 1, 1, 1, 1],
    takesInUse: [],
    mediaUrl: () => null,
    timing: () => timing,
    resolvedTiming: () => resolved,
    timingStatus: () => "untapped",
    editSection: (
      _takeId: string,
      sectionId: string,
      edit: (section: TimingSection) => TimingSection
    ) => {
      timing = {
        ...timing,
        sections: timing.sections.map((section) =>
          section.id === sectionId ? edit(section) : section
        ),
      };
    },
    editTiming: (
      _takeId: string,
      edit: (current: TakeTiming) => TakeTiming
    ) => {
      timing = edit(timing);
    },
    confirmTiming: () => {},
    canUndoTiming: () => false,
    undoTiming: () => {
      undoCount += 1;
    },
    canRedoTiming: () => false,
    redoTiming: () => {
      redoCount += 1;
    },
    exitTiming: () => {},
  } as unknown as TimingHost;
  let session!: ReturnType<typeof createPostTimingSession>;
  const dispose = $effect.root(() => {
    session = createPostTimingSession(builder);
  });
  return {
    session,
    tapCount: () => timing.sections[0]!.taps.length,
    historyCalls: () => ({ undo: undoCount, redo: redoCount }),
    dispose,
  };
}
