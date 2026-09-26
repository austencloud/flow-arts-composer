import { t } from "$lib/shared/i18n/i18n.svelte.js";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepMap } from "$lib/shared/video-collaboration/domain/collaborative-video";
import type { PostTake } from "$lib/shared/media-composition/domain/post-plan";
import { takeRole } from "$lib/shared/media-composition/domain/post-plan-compiler";
import {
  POST_FRAME_RATE,
  POST_MIN_ITEM_SECONDS,
  POST_TIME_EPSILON,
  findItem,
  itemEnd,
  mainItemAt,
  projectDurationSeconds,
  type PostItem,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";
import {
  addOverlayItem,
  addTake,
  appendCardClip,
  appendVideoClip,
  deleteItem,
  duplicateItem,
  removeTake as removeProjectTake,
  setProjectAudio,
  splitItemAt,
  trimItem,
  type EditContext,
  type NewOverlaySpec,
} from "$lib/shared/media-composition/domain/post-project-edits";
import {
  applyTutorialPreset,
  type TutorialLabels,
} from "$lib/shared/media-composition/domain/post-project-looks";
import {
  compilePostProject,
  type CompiledPostProject,
} from "$lib/shared/media-composition/domain/post-project-compiler";
import {
  confirmTakeTiming,
  resolveTakeTiming,
  splitTimingSection,
  takeSampleAt,
  takeTimingFromLegacyMarks,
  takeTimingStatus,
  type ResolvedTakeTiming,
  type TakeTiming,
  type TakeTimingStatus,
} from "$lib/shared/media-composition/domain/take-timing";
import {
  evaluatePresetFrame,
  evaluateRegionRects,
  type EvaluatedFrameLayer,
  type RegionRect,
  type TakeClock,
} from "$lib/shared/media-composition/services/frame-evaluator";
import {
  openPostProject,
  savePostProject,
} from "$lib/shared/media-composition/services/post-project-store";
import {
  catalogTakeKey,
  loadTakeTiming,
  localTakeKey,
  openTakeTiming,
  saveTakeTiming,
} from "$lib/shared/media-composition/services/take-timing-store";

/**
 * The timeline editor's working state: the project with its undo history,
 * each take's footage and timing, the selection and the preview clock. The
 * canvas, the timeline, the inspector and the export all read it, so an edit
 * in one shows in all of them.
 *
 * Nothing here touches Firestore. The project and the timings save on this
 * device as they change.
 */

export type PostEditorMode = "edit" | "timing";

/** A catalog video as the editor needs it. */
export interface CatalogTakeSource {
  videoId: string;
  label: string;
  url: string;
  durationSeconds: number;
  /** A map tapped in an older editor, seeded into the timing on first open. */
  legacyStepMap?: StepMap;
}

interface TakeMedia {
  url: string;
  /** An object URL this state made and must release. */
  owned: boolean;
}

/** How many edits can be undone. */
const HISTORY_DEPTH = 100;
/** How many edits of one take's timing can be undone. */
const TIMING_UNDO_DEPTH = 50;
/** Changes to one setting this close together undo as one. */
const SETTING_JOIN_MS = 800;
const FRAME_SECONDS = 1 / POST_FRAME_RATE;

export interface PostEditorDeps {
  getSequence: () => SequenceData;
  /** Catalog videos for the sequence, looked up by id. */
  getCatalogVideo?: (videoId: string) => CatalogTakeSource | null;
  /** True when a painter can draw the beat overlay on animation items. */
  hasAnimationOverlay?: () => boolean;
  now?: () => number;
}

/** A pure project edit; returning the same project means nothing changed. */
export type PostEdit = (project: PostProject, context: EditContext) => PostProject;

export function createPostEditorState(deps: PostEditorDeps) {
  const now = deps.now ?? (() => Date.now());
  const context = (): EditContext => ({ now: now() });
  const sequence = $derived(deps.getSequence());
  const moveBeats = $derived(sequence.steps.map((step) => step.duration ?? 1));

  let project = $state.raw<PostProject>(openPostProject(sequence.id, now()));
  let past = $state.raw<PostProject[]>([]);
  let future = $state.raw<PostProject[]>([]);
  /** The project a drag started from; each live step re-applies to it. */
  let gestureBase: PostProject | null = null;
  /** The setting changed last and when, so a slider drag undoes as one step. */
  let lastSetting: { key: string; at: number } | null = null;

  let media = $state.raw<Record<string, TakeMedia>>({});
  let timings = $state.raw<Record<string, TakeTiming>>({});
  let timingUndo = $state.raw<Record<string, TakeTiming[]>>({});
  /**
   * Timing an edit changed along with the post, keyed by the project the
   * edit made, so undoing that edit puts the take's timing back too.
   */
  const timingEffects = new WeakMap<
    PostProject,
    { takeId: string; before: TakeTiming; after: TakeTiming }
  >();

  let previewSeconds = $state(0);
  let playing = $state(false);
  let mode = $state<PostEditorMode>("edit");
  let selectedItemId = $state<string | null>(null);
  let timingTakeId = $state<string | null>(null);
  /** What a preview drag moves on a video that does not fill the frame. */
  let previewDragTarget = $state<"box" | "picture">("box");

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
        sampleAt: (mediaSeconds) => takeSampleAt(timing, mediaSeconds),
      };
    }
    return out;
  });

  const compiled = $derived<CompiledPostProject | null>(
    compilePostProject(project, {
      now: project.updatedAt,
      animationOverlay: deps.hasAnimationOverlay?.() ?? false,
    })
  );

  /** The timeline's length, hidden tracks included, so nothing sits past it. */
  const durationSeconds = $derived(projectDurationSeconds(project));

  const frameLayers = $derived.by((): EvaluatedFrameLayer[] => {
    if (!compiled || compiled.durationSeconds <= 0) return [];
    return evaluatePresetFrame(
      compiled.preset,
      compiled.durationSeconds,
      previewSeconds,
      {
        steps: sequence.steps,
        startPlacementDuration: 1,
        clocks,
      }
    );
  });

  /** Every region's rect at the playhead: static, or where its motion or a
   *  keyframed box has carried it. The canvas positions its region divs from
   *  this map, keyed by region id (an item's own id, one region each). */
  const regionRects = $derived.by((): Map<string, RegionRect> => {
    if (!compiled || compiled.durationSeconds <= 0) return new Map();
    return evaluateRegionRects(compiled.preset, compiled.durationSeconds, previewSeconds);
  });

  const selectedItem = $derived(
    selectedItemId ? (findItem(project, selectedItemId)?.item ?? null) : null
  );

  /** Takes the post's clips use, in timeline order: their timing matters. */
  const takesInUse = $derived.by((): PostTake[] => {
    const used: string[] = [];
    for (const track of project.tracks) {
      for (const item of track.items) {
        if (item.kind === "video" && !used.includes(item.takeId)) {
          used.push(item.takeId);
        }
      }
    }
    return used
      .map((id) => project.takes.find((take) => take.id === id))
      .filter((take): take is PostTake => Boolean(take));
  });

  function statusOf(takeId: string): TakeTimingStatus {
    const timing = timings[takeId];
    return timing ? takeTimingStatus(timing, moveBeats) : "untapped";
  }

  // ---- The project and its history ---------------------------------------

  function keepSelectionValid(next: PostProject): void {
    if (selectedItemId && !findItem(next, selectedItemId)) selectedItemId = null;
    if (previewSeconds > projectDurationSeconds(next)) {
      previewSeconds = projectDurationSeconds(next);
    }
  }

  function commit(next: PostProject): boolean {
    if (next === project) return false;
    past = [...past, project].slice(-HISTORY_DEPTH);
    future = [];
    project = next;
    lastSetting = null;
    keepSelectionValid(next);
    savePostProject(next);
    return true;
  }

  /** Applies one edit as one undo step; false when it changed nothing. */
  function edit(change: PostEdit): boolean {
    if (gestureBase) return false;
    return commit(change(project, context()));
  }

  /**
   * An edit from a setting that changes many times a second while dragged.
   * Changes to the same setting in quick succession join one undo step.
   */
  function editSetting(key: string, change: PostEdit): boolean {
    if (gestureBase) return false;
    const at = now();
    const next = change(project, context());
    if (next === project) return false;
    const joins =
      lastSetting !== null &&
      lastSetting.key === key &&
      at - lastSetting.at < SETTING_JOIN_MS &&
      past.length > 0;
    if (joins) {
      future = [];
      project = next;
      keepSelectionValid(next);
      savePostProject(next);
    } else {
      commit(next);
    }
    lastSetting = { key, at };
    return true;
  }

  /**
   * A drag is one undo step however many frames it takes. Each live step
   * re-applies its edit to the project the drag started from, so a trim
   * dragged out and back lands exactly where it began.
   */
  function beginGesture(): void {
    gestureBase ??= project;
  }

  function gestureStep(change: PostEdit): void {
    if (!gestureBase) return;
    const next = change(gestureBase, context());
    project = next;
    keepSelectionValid(next);
  }

  function endGesture(): void {
    const base = gestureBase;
    gestureBase = null;
    lastSetting = null;
    if (!base || project === base) return;
    past = [...past, base].slice(-HISTORY_DEPTH);
    future = [];
    savePostProject(project);
  }

  function cancelGesture(): void {
    const base = gestureBase;
    gestureBase = null;
    lastSetting = null;
    if (!base) return;
    project = base;
    keepSelectionValid(base);
  }

  function undo(): void {
    if (gestureBase) return;
    lastSetting = null;
    const previous = past[past.length - 1];
    if (!previous) return;
    const undone = project;
    past = past.slice(0, -1);
    future = [...future, project];
    project = previous;
    keepSelectionValid(previous);
    savePostProject(previous);
    replayTiming(undone, "before");
  }

  function redo(): void {
    if (gestureBase) return;
    lastSetting = null;
    const next = future[future.length - 1];
    if (!next) return;
    future = future.slice(0, -1);
    past = [...past, project];
    project = next;
    keepSelectionValid(next);
    savePostProject(next);
    replayTiming(next, "after");
  }

  /**
   * Sets a take's timing to how it was before or after the edit that made
   * `edited`. Timing changed since then, by tapping, is left alone.
   */
  function replayTiming(edited: PostProject, side: "before" | "after"): void {
    const effect = timingEffects.get(edited);
    if (!effect) return;
    const expected = side === "before" ? effect.after : effect.before;
    if (timings[effect.takeId] !== expected) return;
    setTiming(effect.takeId, effect[side], false);
  }

  /**
   * Opens the post with a setting from elsewhere, such as the sound picked
   * in a link, without adding an undo step.
   */
  function seedAudio(audio: PostProject["audio"]): void {
    if (gestureBase) return;
    const next = setProjectAudio(project, audio, context());
    if (next === project) return;
    project = next;
    savePostProject(next);
  }

  // ---- Takes and their media -----------------------------------------------

  function openTiming(take: PostTake, legacy?: StepMap): TakeTiming {
    const saved = loadTakeTiming(sequence.id, take.takeKey);
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
        saveTakeTiming(seeded);
        return seeded;
      }
    }
    return openTakeTiming({
      sequenceId: sequence.id,
      takeKey: take.takeKey,
      durationSeconds: take.durationSeconds,
      movesPerPass: moveBeats.length,
      now: now(),
    });
  }

  function attach(
    take: PostTake,
    url: string,
    owned: boolean,
    legacy?: StepMap
  ): void {
    const previous = media[take.id];
    if (previous?.owned && previous.url !== url) URL.revokeObjectURL(previous.url);
    media = { ...media, [take.id]: { url, owned } };
    if (!timings[take.id]) {
      timings = { ...timings, [take.id]: openTiming(take, legacy) };
    }
  }

  function nextTakeId(): string {
    let index = project.takes.length + 1;
    while (project.takes.some((take) => take.id === `take-${index}`)) index += 1;
    return `take-${index}`;
  }

  // Takes saved in the project: catalog and linked ones come straight back,
  // a local file waits to be picked again.
  for (const take of project.takes) {
    if (take.ref.kind === "catalog") {
      const video = deps.getCatalogVideo?.(take.ref.videoId);
      // Without its video yet, the timing waits too, so an older editor's
      // map can still seed it when the catalog arrives.
      if (video) attach(take, video.url, false, video.legacyStepMap);
    } else if (take.ref.kind === "linked") {
      attach(take, take.ref.url, false);
    } else {
      timings = { ...timings, [take.id]: openTiming(take) };
    }
  }
  timingTakeId = takesInUse[0]?.id ?? project.takes[0]?.id ?? null;

  /** The catalog loads after the editor opens; saved takes get their video. */
  function attachCatalogTakes(): void {
    for (const take of project.takes) {
      if (take.ref.kind !== "catalog" || media[take.id]) continue;
      const video = deps.getCatalogVideo?.(take.ref.videoId);
      if (video) attach(take, video.url, false, video.legacyStepMap);
    }
  }

  /**
   * Adds a video to the end of the main track, InShot style: the take joins
   * the project (once per file) and a clip of all of it lands on the
   * timeline, selected, with the playhead on its first frame.
   */
  function placeTake(take: PostTake): string | null {
    if (gestureBase) return null;
    const ctx = context();
    const withTake = addTake(project, take, ctx);
    const stored = withTake.takes.find((entry) => entry.takeKey === take.takeKey);
    const placed = stored ? appendVideoClip(withTake, stored.id, ctx) : null;
    if (!placed) {
      commit(withTake);
      return null;
    }
    commit(placed.project);
    selectItemAtStart(placed.itemId);
    return placed.itemId;
  }

  /** Puts another whole clip of a take on the end of the main track. */
  function appendTakeClip(takeId: string): string | null {
    const take = project.takes.find((entry) => entry.id === takeId);
    return take ? placeTake(take) : null;
  }

  function selectItemAtStart(itemId: string): void {
    const item = findItem(project, itemId)?.item;
    if (!item) return;
    selectedItemId = itemId;
    previewSeconds = item.start;
  }

  function takeForKey(takeKey: string): PostTake | undefined {
    return project.takes.find((take) => take.takeKey === takeKey);
  }

  function addLocalVideo(file: File, durationSeconds: number): string | null {
    const takeKey = localTakeKey(file);
    const take: PostTake = takeForKey(takeKey) ?? {
      id: nextTakeId(),
      label:
        file.name
          .replace(/\.[^.]+$/, "")
          .trim()
          .slice(0, 120) || t("post_editor_default_take"),
      ref: {
        kind: "local",
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
      },
      takeKey,
      durationSeconds,
    };
    attach(take, URL.createObjectURL(file), true);
    return placeTake(take);
  }

  function addCatalogVideo(video: CatalogTakeSource): string | null {
    const takeKey = catalogTakeKey(video.videoId);
    const take: PostTake = takeForKey(takeKey) ?? {
      id: nextTakeId(),
      label: video.label.trim().slice(0, 120) || t("post_editor_default_take"),
      ref: { kind: "catalog", videoId: video.videoId },
      takeKey,
      durationSeconds: video.durationSeconds,
    };
    attach(take, video.url, false, video.legacyStepMap);
    return placeTake(take);
  }

  /** Reattaches a saved local take; false when the file is a different one. */
  function relinkLocalTake(takeId: string, file: File): boolean {
    const take = project.takes.find((candidate) => candidate.id === takeId);
    if (!take || take.takeKey !== localTakeKey(file)) return false;
    attach(take, URL.createObjectURL(file), true);
    return true;
  }

  function renameTake(takeId: string, label: string): void {
    const name = label.trim().slice(0, 120);
    if (!name) return;
    edit((current, ctx) => {
      const take = current.takes.find((entry) => entry.id === takeId);
      if (!take || take.label === name) return current;
      return {
        ...current,
        takes: current.takes.map((entry) =>
          entry.id === takeId ? { ...entry, label: name } : entry
        ),
        updatedAt: ctx.now,
      };
    });
  }

  /** Removes a take and every clip cut from it. */
  function removeTake(takeId: string): void {
    const changed = edit((current, ctx) =>
      removeProjectTake(current, takeId, ctx)
    );
    if (!changed) return;
    // Undo can bring the take back, so its media and timing stay loaded
    // until the editor closes.
    if (timingTakeId === takeId) {
      timingTakeId = takesInUse[0]?.id ?? project.takes[0]?.id ?? null;
    }
  }

  // ---- Edits the toolbar and keys make -------------------------------------

  /** A locked layer's items cannot be moved, trimmed, split or removed. */
  function isLocked(itemId: string): boolean {
    const located = findItem(project, itemId);
    return located ? project.tracks[located.trackIndex]!.locked : false;
  }

  /**
   * What a split at this time cuts: the selection when the playhead is
   * inside it, else the main clip there. Both pieces must stay long enough
   * to grab.
   */
  function splitTargetAt(seconds: number): PostItem | null {
    const inside = (item: PostItem) =>
      seconds - item.start > POST_MIN_ITEM_SECONDS + POST_TIME_EPSILON &&
      itemEnd(item) - seconds > POST_MIN_ITEM_SECONDS + POST_TIME_EPSILON;
    for (const item of [selectedItem, mainItemAt(project, seconds)]) {
      if (item && inside(item) && !isLocked(item.id)) return item;
    }
    return null;
  }

  const splitTarget = $derived(splitTargetAt(previewSeconds));
  const selectionEditable = $derived(
    selectedItem !== null && !isLocked(selectedItem.id)
  );

  /** Splits at the playhead and selects the second piece. */
  function splitAtPlayhead(): boolean {
    const target = splitTarget;
    if (!target || gestureBase) return false;
    const result = splitItemAt(project, target.id, previewSeconds, context());
    if (!result || !commit(result.project)) return false;
    selectedItemId = result.newItemId;
    return true;
  }

  function deleteSelected(): boolean {
    const target = selectedItem;
    if (!target || isLocked(target.id)) return false;
    return edit((current, ctx) => deleteItem(current, target.id, ctx));
  }

  function duplicateSelected(): boolean {
    const target = selectedItem;
    if (!target || gestureBase || isLocked(target.id)) return false;
    const result = duplicateItem(project, target.id, context());
    if (!result || !commit(result.project)) return false;
    selectedItemId = result.newItemId;
    return true;
  }

  function addOverlay(spec: NewOverlaySpec): string | null {
    if (gestureBase) return null;
    const result = addOverlayItem(project, spec, context());
    if (!result || !commit(result.project)) return null;
    selectedItemId = result.itemId;
    return result.itemId;
  }

  /** The choreo card goes on the end of the main track, like the Tutorial's. */
  function addCard(): string | null {
    if (gestureBase) return null;
    const result = appendCardClip(project, context());
    if (!commit(result.project)) return null;
    selectItemAtStart(result.itemId);
    return result.itemId;
  }

  /**
   * A trim shows the frame at the edge being dragged, as InShot does: the
   * new first frame, or the last one.
   */
  function trimLive(itemId: string, edge: "start" | "end", seconds: number): void {
    if (isLocked(itemId)) return;
    gestureStep((base, ctx) => trimItem(base, itemId, edge, seconds, ctx));
    const trimmed = findItem(project, itemId)?.item;
    if (!trimmed) return;
    previewSeconds =
      edge === "start"
        ? trimmed.start
        : Math.max(trimmed.start, itemEnd(trimmed) - FRAME_SECONDS);
  }

  /**
   * Builds the whole tutorial on what is there. When both clips come from
   * one take, that take's timing is split where the slow-mo starts, and the
   * slow part counts from move 1 again. It is one undo step with the post,
   * even when only the timing changed.
   */
  function applyTutorial(labels: TutorialLabels): boolean {
    if (gestureBase) return false;
    const result = applyTutorialPreset(project, labels, context());
    const split = result.timingSplit;
    const before = split ? timings[split.takeId] : undefined;
    if (split) splitTakeTimingAt(split.takeId, split.atSeconds);
    const after = split ? timings[split.takeId] : undefined;
    const timingChanged = Boolean(before && after && after !== before);
    const next =
      result.project === project && timingChanged
        ? { ...project, updatedAt: now() }
        : result.project;
    if (!commit(next)) return false;
    if (split && before && after && timingChanged) {
      timingEffects.set(next, { takeId: split.takeId, before, after });
    }
    selectedItemId = null;
    previewSeconds = 0;
    return true;
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
      splitTimingSection(timing, atSeconds, partId, now(), moveBeats, "restarts")
    );
  }

  function setAudio(audio: PostProject["audio"]): void {
    edit((current, ctx) => setProjectAudio(current, audio, ctx));
  }

  // ---- Timing ------------------------------------------------------------

  function setTiming(takeId: string, next: TakeTiming, remember: boolean): void {
    const current = timings[takeId];
    if (!current || next === current) return;
    if (remember) {
      const stack = [...(timingUndo[takeId] ?? []), current].slice(
        -TIMING_UNDO_DEPTH
      );
      timingUndo = { ...timingUndo, [takeId]: stack };
    }
    timings = { ...timings, [takeId]: next };
    saveTakeTiming(next);
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

  function undoTiming(takeId: string): void {
    const stack = timingUndo[takeId];
    const previous = stack?.[stack.length - 1];
    if (!previous) return;
    timingUndo = { ...timingUndo, [takeId]: stack.slice(0, -1) };
    setTiming(takeId, { ...previous, updatedAt: now() }, false);
  }

  function confirmTiming(takeId: string): void {
    const current = timings[takeId];
    if (!current) return;
    setTiming(takeId, confirmTakeTiming(current, moveBeats, now()), false);
  }

  // ---- The preview clock ---------------------------------------------------

  function seek(seconds: number): void {
    previewSeconds = Math.min(durationSeconds, Math.max(0, seconds));
  }

  function advance(deltaSeconds: number): void {
    if (!playing) return;
    const next = previewSeconds + deltaSeconds;
    if (next >= durationSeconds) {
      previewSeconds = durationSeconds;
      playing = false;
      return;
    }
    previewSeconds = next;
  }

  function togglePlayback(): void {
    if (!playing && previewSeconds >= durationSeconds - 1e-3) previewSeconds = 0;
    playing = durationSeconds > 0 && !playing;
  }

  function pause(): void {
    playing = false;
  }

  function dispose(): void {
    for (const held of Object.values(media)) {
      if (held.owned) URL.revokeObjectURL(held.url);
    }
  }

  return {
    get sequence() {
      return sequence;
    },
    get moveBeats() {
      return moveBeats;
    },
    get project() {
      return project;
    },
    get takes() {
      return project.takes;
    },
    get compiled() {
      return compiled;
    },
    get durationSeconds() {
      return durationSeconds;
    },
    get frameLayers() {
      return frameLayers;
    },
    get regionRects() {
      return regionRects;
    },
    get previewDragTarget() {
      return previewDragTarget;
    },
    set previewDragTarget(next: "box" | "picture") {
      previewDragTarget = next;
    },
    get previewSeconds() {
      return previewSeconds;
    },
    get isPlaying() {
      return playing;
    },
    get mode() {
      return mode;
    },
    set mode(next: PostEditorMode) {
      if (next === "timing") playing = false;
      mode = next;
    },
    get selectedItemId() {
      return selectedItemId;
    },
    set selectedItemId(next: string | null) {
      selectedItemId = next && findItem(project, next) ? next : null;
    },
    get selectedItem() {
      return selectedItem;
    },
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
    get inGesture() {
      return gestureBase !== null;
    },
    /** The item a split at the playhead would cut, or null. */
    get splitTarget() {
      return splitTarget;
    },
    /** A selection whose layer is not locked. */
    get selectionEditable() {
      return selectionEditable;
    },
    isLocked,
    get takesInUse() {
      return takesInUse;
    },
    // TimingHost: the take the Timing tool shows.
    get selectedTakeId() {
      return timingTakeId;
    },
    set selectedTakeId(next: string | null) {
      timingTakeId = next;
    },
    mediaUrl(takeId: string): string | null {
      return media[takeId]?.url ?? null;
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
    editTiming,
    undoTiming,
    confirmTiming,
    exitTiming(_reason: "done" | "back"): void {
      mode = "edit";
    },
    edit,
    editSetting,
    beginGesture,
    gestureStep,
    endGesture,
    cancelGesture,
    undo,
    redo,
    trimLive,
    splitAtPlayhead,
    deleteSelected,
    duplicateSelected,
    addOverlay,
    addCard,
    applyTutorial,
    setAudio,
    seedAudio,
    addLocalVideo,
    addCatalogVideo,
    appendTakeClip,
    relinkLocalTake,
    attachCatalogTakes,
    renameTake,
    removeTake,
    seek,
    advance,
    togglePlayback,
    pause,
    dispose,
  };
}

export type PostEditorState = ReturnType<typeof createPostEditorState>;
