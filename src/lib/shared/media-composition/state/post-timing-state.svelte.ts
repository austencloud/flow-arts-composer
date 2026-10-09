import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepMap } from "$lib/shared/video-collaboration/domain/collaborative-video";
import type {
  StateExtension,
  VideoEditorState,
} from "@austencloud/video-editor";
import {
  finish,
  takeRole,
  type PostProject,
  type PostTake,
} from "@austencloud/video-editor/core";
import type {
  FrameAlignment,
  TakeClock,
} from "@austencloud/video-editor/render";
import {
  PostProjectSchema,
  type PostAnimationItem,
  editContext,
  tkaFrameAlignment,
} from "$lib/shared/post-studio-plugin";
import { findTunnelHook } from "$lib/shared/media-composition/domain/post-project-edits";
import {
  confirmTakeTiming,
  resolveTakeTiming,
  splitTimingSection,
  takeSampleAt,
  takeTimingFromLegacyMarks,
  takeTimingStatus,
  TakeTimingSchema,
  type ResolvedTakeTiming,
  type TakeTiming,
  type TakeTimingStatus,
} from "$lib/shared/media-composition/domain/take-timing";
import {
  projectDraftRecord,
  resolvePostStudioDraft,
} from "$lib/shared/media-composition/services/post-project-backup";
import type { PostTimingEffect } from "$lib/shared/media-composition/services/post-editor-history-store";
import type { PostEditorStore } from "$lib/shared/media-composition/services/post-editor-store";
import { deepEqual } from "$lib/shared/sequence-viewer/services/viewer-url-state-codec";
import type { CatalogTakeSource } from "./post-editor-state.svelte";

/**
 * Each take's timing, the tunnel selection and the timing undo, riding
 * along with the package's editor state as its extension. The editor knows
 * nothing about timing: it calls the hooks below when media attaches, a
 * project opens, imports or is adopted, and when Undo crosses a step that
 * changed a timing. Timings save through the editor's store as they change,
 * and each save also saves the post, which embeds them.
 */

/** How many edits of one take's timing can be undone. */
const TIMING_UNDO_DEPTH = 50;
/** Changes to one setting this close together undo as one (the editor's own value). */
const SETTING_JOIN_MS = 800;

type MappingAppearance = NonNullable<PostAnimationItem["animationAppearance"]>;
type TakeHistoryEntry =
  | { kind: "timing"; timing: TakeTiming }
  | { kind: "appearance"; appearance: MappingAppearance | undefined };

export interface PostTimingDeps {
  getSequence: () => SequenceData;
  /** Catalog videos for the sequence, looked up by id. */
  getCatalogVideo?: (videoId: string) => CatalogTakeSource | null;
  /** True when a painter can draw the beat overlay on animation items. */
  hasAnimationOverlay?: () => boolean;
  store: PostEditorStore;
  now: () => number;
}

export function createPostTimingState(deps: PostTimingDeps) {
  const store = deps.store;
  const now = deps.now;
  const sequence = $derived(deps.getSequence());
  const moveBeats = $derived(sequence.steps.map((step) => step.duration ?? 1));

  /** The editor this timing rides along with, set when it builds the extension. */
  let editor = $state.raw<VideoEditorState<PostTimingEffect> | null>(null);
  function core(): VideoEditorState<PostTimingEffect> {
    if (!editor) throw new Error("The take timing has no editor yet.");
    return editor;
  }

  let timings = $state.raw<Record<string, TakeTiming>>({});
  let timingUndo = $state.raw<Record<string, TakeHistoryEntry[]>>({});
  let timingRedo = $state.raw<Record<string, TakeHistoryEntry[]>>({});
  let lastMappingSetting: Record<string, { key: string; at: number }> = {};
  let timingTakeId = $state<string | null>(null);
  /** The animation whose opening tunnel, not the rest of it, is selected. */
  let tunnelSelectedFor = $state<string | null>(null);
  /** True while the wrapper selects the way an edit does, keeping the tunnel. */
  let keepingPart = false;
  /**
   * The step map an older editor tapped for each catalog video, as the last
   * add or catalog lookup of that video carried it. It seeds a timing the
   * first time the video's take opens.
   */
  const legacyMaps = new Map<string, StepMap>();
  /**
   * The project an import or a newer save is bringing in while its takes
   * load: the editor passes the same object to `importing` or `adopting` and
   * then to `takeWithoutMedia`. An open or undo asks `takeReady` first, which
   * ends it.
   */
  let merging: PostProject | null = null;

  const resolved = $derived.by(() => {
    const out: Record<string, ResolvedTakeTiming> = {};
    for (const [takeId, timing] of Object.entries(timings)) {
      out[takeId] = resolveTakeTiming(timing, moveBeats);
    }
    return out;
  });

  const clocks = $derived.by(() => {
    const out: Record<string, TakeClock> = {};
    for (const [takeId, timing] of Object.entries(resolved)) {
      out[takeRole(takeId)] = {
        sampleAt: (mediaSeconds, options) =>
          takeSampleAt(timing, mediaSeconds, options),
      };
    }
    return out;
  });

  /** The alignment the frame evaluator reads: the sequence and the take clocks. */
  const alignment = $derived<FrameAlignment>(
    tkaFrameAlignment({
      steps: sequence.steps,
      startPlacementDuration: 1,
      sequencePeriod: sequence.period ?? sequence.orientationCycleCount ?? 1,
      clocks,
    })
  );

  const selectedPart = $derived.by(() => {
    if (!editor) return null;
    const selectedItem = editor.selectedItem;
    return tunnelSelectedFor !== null &&
      tunnelSelectedFor === editor.selectedItemId &&
      selectedItem?.kind === "animation" &&
      selectedItem.tunnelHook
      ? ("tunnel" as const)
      : null;
  });

  function statusOf(takeId: string): TakeTimingStatus {
    const timing = timings[takeId];
    return timing ? takeTimingStatus(timing, moveBeats) : "untapped";
  }

  function openTiming(
    take: PostTake,
    legacy?: StepMap,
    sourceProject: PostProject = core().project
  ): TakeTiming {
    const saved = store.loadTiming(sequence.id, take.takeKey);
    const embedded = sourceProject.timings?.[take.id];
    const validEmbedded =
      embedded?.sequenceId === sequence.id &&
      embedded.takeKey === take.takeKey &&
      TakeTimingSchema.safeParse(embedded).success
        ? embedded
        : null;
    if (saved && validEmbedded) {
      return saved.updatedAt > validEmbedded.updatedAt ? saved : validEmbedded;
    }
    if (validEmbedded) return validEmbedded;
    if (saved) return saved;
    // A catalog video mapped in the older editor seeds its landings once.
    if (legacy && legacy.stepCount === moveBeats.length) {
      const seeded = takeTimingFromLegacyMarks({
        sequenceId: sequence.id,
        takeKey: take.takeKey,
        durationSeconds: take.durationSeconds,
        marks: legacy.beatTimestamps,
        ...(legacy.endTimestamp !== undefined
          ? { endMark: legacy.endTimestamp }
          : {}),
        now: now(),
      });
      if (seeded) {
        store.saveTiming(seeded);
        return seeded;
      }
    }
    return store.openTiming({
      sequenceId: sequence.id,
      takeKey: take.takeKey,
      durationSeconds: take.durationSeconds,
      movesPerPass: moveBeats.length,
      now: now(),
    });
  }

  /** Records the step map a catalog video carries, or that it carries none. */
  function rememberLegacy(video: CatalogTakeSource): void {
    if (video.legacyStepMap) legacyMaps.set(video.videoId, video.legacyStepMap);
    else legacyMaps.delete(video.videoId);
  }

  function setTiming(
    takeId: string,
    next: TakeTiming,
    remember: boolean
  ): void {
    const current = timings[takeId];
    if (!current || next === current) return;
    delete lastMappingSetting[takeId];
    if (remember) {
      const stack = [
        ...(timingUndo[takeId] ?? []),
        { kind: "timing" as const, timing: current },
      ].slice(-TIMING_UNDO_DEPTH);
      timingUndo = { ...timingUndo, [takeId]: stack };
      timingRedo = { ...timingRedo, [takeId]: [] };
    }
    timings = { ...timings, [takeId]: next };
    const result = store.saveTiming(next);
    core().persist(
      result.ok
        ? null
        : `Post Studio could not save this take's separate timing: ${result.error}`
    );
  }

  /**
   * Sets a take's timing to how it was before or after the edit that carried
   * `effect`. Timing changed since then, by tapping, is left alone.
   */
  function replayTiming(
    effect: PostTimingEffect,
    side: "before" | "after"
  ): void {
    const expected = side === "before" ? effect.after : effect.before;
    // Compared by value: after a reload the timing is a fresh copy.
    if (!deepEqual(timings[effect.takeId], expected)) return;
    setTiming(effect.takeId, effect[side], false);
  }

  function editTiming(
    takeId: string,
    change: (timing: TakeTiming) => TakeTiming
  ): void {
    const current = timings[takeId];
    if (!current) return;
    const next = change(current);
    if (next === current) return;
    setTiming(takeId, { ...next, confirmedAt: null, updatedAt: now() }, true);
  }

  /** Mapping appearance shares the take's undo order without touching tracks. */
  function writeMappingAppearance(
    takeId: string,
    appearance: MappingAppearance | undefined
  ): void {
    const project = core().project;
    const appearances = { ...project.mappingPreviewAppearances };
    if (appearance) appearances[takeId] = appearance;
    else delete appearances[takeId];
    core().amend(
      finish(
        {
          ...project,
          mappingPreviewAppearances: Object.keys(appearances).length
            ? appearances
            : undefined,
        },
        editContext(now())
      )
    );
  }

  function editMappingPreviewAppearance(
    takeId: string,
    appearance: MappingAppearance,
    settingKey?: string
  ): boolean {
    const project = core().project;
    if (!timings[takeId] || !project.takes.some((take) => take.id === takeId))
      return false;
    const current = project.mappingPreviewAppearances?.[takeId];
    if (JSON.stringify(current) === JSON.stringify(appearance)) return false;
    const at = now();
    const last = lastMappingSetting[takeId];
    const previous = timingUndo[takeId]?.at(-1);
    const joins =
      !!settingKey &&
      last?.key === settingKey &&
      at - last.at < SETTING_JOIN_MS &&
      previous?.kind === "appearance";
    if (!joins) {
      timingUndo = {
        ...timingUndo,
        [takeId]: [
          ...(timingUndo[takeId] ?? []),
          { kind: "appearance" as const, appearance: current },
        ].slice(-TIMING_UNDO_DEPTH),
      };
    }
    timingRedo = { ...timingRedo, [takeId]: [] };
    if (settingKey) lastMappingSetting[takeId] = { key: settingKey, at };
    else delete lastMappingSetting[takeId];
    writeMappingAppearance(takeId, appearance);
    return true;
  }

  function currentTakeHistoryEntry(
    takeId: string,
    kind: TakeHistoryEntry["kind"]
  ): TakeHistoryEntry | null {
    if (kind === "appearance")
      return {
        kind,
        appearance: core().project.mappingPreviewAppearances?.[takeId],
      };
    const timing = timings[takeId];
    return timing ? { kind, timing } : null;
  }

  function applyTakeHistoryEntry(
    takeId: string,
    entry: TakeHistoryEntry
  ): void {
    if (entry.kind === "appearance")
      writeMappingAppearance(takeId, entry.appearance);
    else setTiming(takeId, { ...entry.timing, updatedAt: now() }, false);
  }

  function undoTiming(takeId: string): void {
    const stack = timingUndo[takeId];
    const previous = stack?.[stack.length - 1];
    if (!previous) return;
    const current = currentTakeHistoryEntry(takeId, previous.kind);
    if (!current) return;
    delete lastMappingSetting[takeId];
    timingUndo = { ...timingUndo, [takeId]: stack.slice(0, -1) };
    timingRedo = {
      ...timingRedo,
      [takeId]: [...(timingRedo[takeId] ?? []), current].slice(
        -TIMING_UNDO_DEPTH
      ),
    };
    applyTakeHistoryEntry(takeId, previous);
  }

  function redoTiming(takeId: string): void {
    const stack = timingRedo[takeId];
    const next = stack?.[stack.length - 1];
    if (!next) return;
    const current = currentTakeHistoryEntry(takeId, next.kind);
    if (!current) return;
    delete lastMappingSetting[takeId];
    timingRedo = { ...timingRedo, [takeId]: stack.slice(0, -1) };
    timingUndo = {
      ...timingUndo,
      [takeId]: [...(timingUndo[takeId] ?? []), current].slice(
        -TIMING_UNDO_DEPTH
      ),
    };
    applyTakeHistoryEntry(takeId, next);
  }

  function confirmTiming(takeId: string): void {
    const current = timings[takeId];
    if (!current) return;
    setTiming(takeId, confirmTakeTiming(current, moveBeats, now()), true);
  }

  /** Starts a new timing part at a media time unless one already starts near it. */
  function splitTakeTimingAt(takeId: string, atSeconds: number): void {
    const current = timings[takeId];
    if (!current) return;
    let index = current.sections.length + 1;
    while (current.sections.some((entry) => entry.id === `part-${index}`)) {
      index += 1;
    }
    const partId = `part-${index}`;
    editTiming(takeId, (timing) =>
      splitTimingSection(
        timing,
        atSeconds,
        partId,
        now(),
        moveBeats,
        "restarts"
      )
    );
  }

  /** Whether the timing loaded for the take is the one for its media. */
  function isLoaded(take: PostTake): boolean {
    const loaded = timings[take.id];
    return (
      loaded?.takeKey === take.takeKey && loaded.sequenceId === sequence.id
    );
  }

  /** The editor's hooks; the editor builds them once, before saved media loads. */
  function extension(
    state: VideoEditorState<PostTimingEffect>
  ): StateExtension<PostTimingEffect> {
    editor = state;
    return {
      embed(current) {
        const embedded: Record<string, TakeTiming> = {};
        for (const take of current.takes) {
          const timing = timings[take.id];
          if (
            timing?.sequenceId === current.sequenceId &&
            timing.takeKey === take.takeKey &&
            TakeTimingSchema.safeParse(timing).success
          )
            embedded[take.id] = timing;
        }
        return { ...current, timings: embedded };
      },
      takeReady(take) {
        merging = null;
        return isLoaded(take);
      },
      takeAttached(take, source) {
        if (isLoaded(take)) return;
        const legacy =
          take.ref.kind === "catalog"
            ? legacyMaps.get(take.ref.videoId)
            : undefined;
        timings = {
          ...timings,
          [take.id]: openTiming(take, legacy, source),
        };
      },
      takeWithoutMedia(take, source) {
        if (source === merging) {
          // An import or a newer save keeps a timing this editor holds.
          timings = {
            ...timings,
            [take.id]: timings[take.id] ?? openTiming(take, undefined, source),
          };
        } else if (take.ref.kind === "catalog") {
          // Without its video yet, the timing waits too, so an older editor's
          // map can still seed it when the catalog arrives.
          if (
            source.timings?.[take.id] ||
            store.loadTiming(sequence.id, take.takeKey)
          ) {
            timings = {
              ...timings,
              [take.id]: openTiming(take, undefined, source),
            };
          }
        } else {
          timings = {
            ...timings,
            [take.id]: openTiming(take, undefined, source),
          };
        }
      },
      takeRemoved(takeId) {
        // Undo can bring the take back, so its timing stays loaded until the
        // editor closes.
        if (timingTakeId === takeId) {
          const current = core();
          timingTakeId =
            current.takesInUse[0]?.id ?? current.project.takes[0]?.id ?? null;
        }
      },
      prepareImport(incoming) {
        const next = incoming as PostProject;
        const importedTimings = Object.fromEntries(
          Object.entries(next.timings ?? {}).map(([takeId, timing]) => [
            takeId,
            { ...timing, sequenceId: sequence.id },
          ])
        );
        const validated = PostProjectSchema.parse({
          ...next,
          sequenceId: sequence.id,
          timings: importedTimings,
        });
        const currentSnapshot = core().snapshot;
        const transfer = resolvePostStudioDraft(sequence.id, [
          projectDraftRecord({
            ...validated,
            updatedAt: Math.max(
              validated.updatedAt,
              currentSnapshot.updatedAt + 1
            ),
          }),
          { key: "before-import", value: JSON.stringify(currentSnapshot) },
        ]);
        return {
          ...validated,
          timings: transfer?.timings ?? validated.timings,
        };
      },
      importing(next) {
        merging = next;
        const retained: Record<string, TakeTiming> = {};
        for (const take of next.takes) {
          const existing = timings[take.id];
          const imported = next.timings?.[take.id];
          if (
            existing?.sequenceId !== sequence.id ||
            existing.takeKey !== take.takeKey
          )
            continue;
          if (
            imported?.takeKey === take.takeKey &&
            imported.updatedAt > existing.updatedAt
          )
            continue;
          retained[take.id] = existing;
        }
        timings = retained;
      },
      adopting(next) {
        merging = next;
        const nextTimings = { ...timings };
        for (const [takeId, timing] of Object.entries(next.timings ?? {})) {
          const mine = nextTimings[takeId];
          if (!mine || timing.updatedAt > mine.updatedAt)
            nextTimings[takeId] = timing;
        }
        timings = nextTimings;
      },
      replayEffect(effect, direction) {
        replayTiming(effect, direction === "undo" ? "before" : "after");
      },
      alignment: () => alignment,
      compileContext: () => ({
        animationOverlay: deps.hasAnimationOverlay?.() ?? false,
      }),
      selected() {
        if (!keepingPart) tunnelSelectedFor = null;
      },
    };
  }

  return {
    extension,
    get sequence() {
      return sequence;
    },
    get moveBeats() {
      return moveBeats;
    },
    // TimingHost: the take the Timing tool shows.
    get selectedTakeId() {
      return timingTakeId;
    },
    set selectedTakeId(next: string | null) {
      timingTakeId = next;
    },
    timing(takeId: string): TakeTiming | null {
      return timings[takeId] ?? null;
    },
    resolvedTiming(takeId: string): ResolvedTakeTiming | null {
      return resolved[takeId] ?? null;
    },
    timingStatus: statusOf,
    canUndoTiming(takeId: string): boolean {
      return (timingUndo[takeId]?.length ?? 0) > 0;
    },
    canRedoTiming(takeId: string): boolean {
      return (timingRedo[takeId]?.length ?? 0) > 0;
    },
    editTiming,
    editMappingPreviewAppearance,
    undoTiming,
    redoTiming,
    confirmTiming,
    splitTakeTimingAt,
    rememberLegacy,
    get clocks() {
      return clocks;
    },
    /** Every take's timing, as the tunnel hook's line-up reads them. */
    get timings() {
      return timings;
    },
    /** `"tunnel"` while an animation's opening tunnel is what is selected. */
    get selectedPart() {
      return selectedPart;
    },
    /** Selects an animation's opening tunnel, which has a look of its own. */
    selectTunnel(itemId: string): void {
      const current = core();
      current.selectedItemId = itemId;
      tunnelSelectedFor = current.selectedItemId;
    },
    /**
     * Selects as the editor's own edits do: a tunnel chosen earlier stays
     * chosen, so it is selected again when its animation is.
     */
    selectKeepingPart(itemId: string | null): void {
      keepingPart = true;
      try {
        core().selectedItemId = itemId;
      } finally {
        keepingPart = false;
      }
    },
    get tunnelHook() {
      return findTunnelHook(core().project);
    },
  };
}

export type PostTimingState = ReturnType<typeof createPostTimingState>;
