import {
  createTakeTiming,
  type TakeTiming,
  type TimingSection,
} from "$lib/shared/media-composition/domain/take-timing";
import {
  createPostTimingSession,
  type TimingHost,
} from "$lib/shared/share/components/post-studio/builder/post-timing-session.svelte";

/** A Timing session over one untapped take, with no video attached. */
export function createPostTimingSessionHarness() {
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
    resolvedTiming: () => null,
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
    editTiming: (_takeId: string, edit: (current: TakeTiming) => TakeTiming) => {
      timing = edit(timing);
    },
    confirmTiming: () => {},
    canUndoTiming: () => false,
    undoTiming: () => {},
    exitTiming: () => {},
  } as unknown as TimingHost;
  let session!: ReturnType<typeof createPostTimingSession>;
  const dispose = $effect.root(() => {
    session = createPostTimingSession(builder);
  });
  return {
    session,
    tapCount: () => timing.sections[0]!.taps.length,
    dispose,
  };
}
