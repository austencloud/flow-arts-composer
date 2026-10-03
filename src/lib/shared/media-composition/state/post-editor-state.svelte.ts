import { t } from "$lib/shared/i18n/i18n.svelte.js";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepMap } from "$lib/shared/video-collaboration/domain/collaborative-video";
import type { PostTake } from "$lib/shared/media-composition/domain/post-plan";
import { takeRole } from "$lib/shared/media-composition/domain/post-plan-compiler";
import { takeDisplayLabel } from "$lib/shared/media-composition/domain/post-take-labels";
import {
  POST_FRAME_RATE,
  POST_MIN_ITEM_SECONDS,
  POST_TIME_EPSILON,
  PostProjectSchema,
  findItem,
  itemEnd,
  mainItemAt,
  projectDurationSeconds,
  type PostAnimationItem,
  type PostItem,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";
import {
  addOverlayItem,
  addTitlesItem,
  addTake,
  addTunnelHook as addProjectTunnelHook,
  findTunnelHook,
  removeTunnelHook as removeProjectTunnelHook,
  cleanLabel,
  appendCardClip,
  appendVideoClip,
  deleteItem,
  duplicateItem,
  finish,
  removeTake as removeProjectTake,
  setProjectAudio,
  splitItemAt,
  trimItem,
  type EditContext,
  type NewOverlaySpec,
} from "$lib/shared/media-composition/domain/post-project-edits";
import {
  applyTutorialTemplate,
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
  TakeTimingSchema,
  type ResolvedTakeTiming,
  type TakeTiming,
  type TakeTimingStatus,
} from "$lib/shared/media-composition/domain/take-timing";
import {
  evaluatePresetLayers,
  evaluateRegionRects,
  isVisibleLayer,
  type EvaluatedFrameLayer,
  type RegionRect,
  type TakeClock,
} from "$lib/shared/media-composition/services/frame-evaluator";
import {
  openPostProject,
  backupPostProjectBeforeImport,
  savePostProject,
} from "$lib/shared/media-composition/services/post-project-store";
import {
  projectDraftRecord,
  resolvePostStudioDraft,
} from "$lib/shared/media-composition/services/post-project-backup";
import { normalizeProject } from "$lib/shared/media-composition/domain/post-project-normalize";
import { bridgeLockedChange } from "$lib/shared/media-composition/domain/post-project-bridge-guard";
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

type MappingAppearance = NonNullable<PostAnimationItem["animationAppearance"]>;
type TakeHistoryEntry =
  | { kind: "timing"; timing: TakeTiming }
  | { kind: "appearance"; appearance: MappingAppearance | undefined };

export interface PostEditorDeps {
  getSequence: () => SequenceData;
  /** A recovered full draft to open in place of this browser's saved copy. */
  initialProject?: PostProject;
  /** Catalog videos for the sequence, looked up by id. */
  getCatalogVideo?: (videoId: string) => CatalogTakeSource | null;
  /** True when a painter can draw the beat overlay on animation items. */
  hasAnimationOverlay?: () => boolean;
  now?: () => number;
}

/** A pure project edit; returning the same project means nothing changed. */
export type PostEdit = (
  project: PostProject,
  context: EditContext
) => PostProject;

export function createPostEditorState(deps: PostEditorDeps) {
  const now = deps.now ?? (() => Date.now());
  const context = (): EditContext => ({ now: now() });
  const sequence = $derived(deps.getSequence());
  const moveBeats = $derived(sequence.steps.map((step) => step.duration ?? 1));

  const initialProject = PostProjectSchema.safeParse(deps.initialProject);
  let project = $state.raw<PostProject>(
    initialProject.success && initialProject.data.sequenceId === sequence.id
      ? // A post saved with its opening as a separate item opens as one item.
        normalizeProject(initialProject.data)
      : openPostProject(sequence.id, now())
  );
  // History keeps its original objects; saved copies must still be newer
  // than the edit that undo, session cancellation, or import replaces.
  let savedUpdatedAt = project.updatedAt;
  let past = $state.raw<PostProject[]>([]);
  let future = $state.raw<PostProject[]>([]);
  /** The project a drag started from; each live step re-applies to it. */
  let gestureBase = $state.raw<PostProject | null>(null);
  /** The setting changed last and when, so a slider drag undoes as one step. */
  let lastSetting: { key: string; at: number } | null = null;
  /**
   * A stretch of editing that lands as one undo step, or none if cancelled:
   * the crop screen. Undo and Redo stay inside it while it is open.
   */
  let session = $state.raw<{
    base: PostProject;
    pastAtStart: PostProject[];
    futureAtStart: PostProject[];
    /** Undo steps made inside the session and not undone. */
    steps: number;
    /** Steps undone inside the session that Redo can bring back. */
    undone: number;
  } | null>(null);

  let media = $state.raw<Record<string, TakeMedia>>({});
  let imageMedia = $state.raw<Record<string, TakeMedia>>({});
  let timings = $state.raw<Record<string, TakeTiming>>({});
  let timingUndo = $state.raw<Record<string, TakeHistoryEntry[]>>({});
  let timingRedo = $state.raw<Record<string, TakeHistoryEntry[]>>({});
  let lastMappingSetting: Record<string, { key: string; at: number }> = {};
  let saveError = $state<string | null>(null);
  let saveRevision = $state(0);
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
  /** The animation whose opening tunnel, not the rest of it, is selected. */
  let tunnelSelectedFor = $state<string | null>(null);
  let timingTakeId = $state<string | null>(null);

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

  const compiled = $derived<CompiledPostProject | null>(
    compilePostProject(project, {
      now: project.updatedAt,
      animationOverlay: deps.hasAnimationOverlay?.() ?? false,
    })
  );

  /** The timeline's length, hidden tracks included, so nothing sits past it. */
  const durationSeconds = $derived(projectDurationSeconds(project));

  /** Every layer at the playhead, one a fade leaves fully clear included. */
  const presentLayers = $derived.by((): EvaluatedFrameLayer[] => {
    if (!compiled || compiled.durationSeconds <= 0) return [];
    return evaluatePresetLayers(
      compiled.preset,
      compiled.durationSeconds,
      previewSeconds,
      {
        steps: sequence.steps,
        startPlacementDuration: 1,
        sequencePeriod: sequence.period ?? sequence.orientationCycleCount ?? 1,
        clocks,
      }
    );
  });

  const frameLayers = $derived(presentLayers.filter(isVisibleLayer));

  /** Every region's rect at the playhead: static, or where its motion or a
   *  keyframed box has carried it. The canvas positions its region divs from
   *  this map, keyed by region id (an item's own id, one region each). */
  const regionRects = $derived.by((): Map<string, RegionRect> => {
    if (!compiled || compiled.durationSeconds <= 0) return new Map();
    return evaluateRegionRects(
      compiled.preset,
      compiled.durationSeconds,
      previewSeconds
    );
  });

  const selectedItem = $derived(
    selectedItemId ? (findItem(project, selectedItemId)?.item ?? null) : null
  );
  const selectedPart = $derived(
    tunnelSelectedFor !== null &&
      tunnelSelectedFor === selectedItemId &&
      selectedItem?.kind === "animation" &&
      selectedItem.tunnelHook
      ? ("tunnel" as const)
      : null
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
    if (selectedItemId && !findItem(next, selectedItemId))
      selectedItemId = null;
    if (previewSeconds > projectDurationSeconds(next)) {
      previewSeconds = projectDurationSeconds(next);
    }
  }

  /** A new undo step inside an open session; it also ends any redo. */
  function countSessionStep(): void {
    if (session) session = { ...session, steps: session.steps + 1, undone: 0 };
  }

  function snapshotFor(current: PostProject): PostProject {
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
    return {
      ...current,
      updatedAt: Math.max(current.updatedAt, savedUpdatedAt),
      timings: embedded,
    };
  }

  function persistProject(
    timingResult?: { ok: true } | { ok: false; error: string }
  ): void {
    savedUpdatedAt = Math.max(now(), project.updatedAt, savedUpdatedAt + 1);
    const result = savePostProject(snapshotFor(project));
    saveRevision += 1;
    saveError = !result.ok
      ? `Post Studio could not save this post: ${result.error}`
      : timingResult && !timingResult.ok
        ? `Post Studio could not save this take's separate timing: ${timingResult.error}`
        : null;
  }

  function commit(next: PostProject): boolean {
    if (next === project) return false;
    past = [...past, project].slice(-HISTORY_DEPTH);
    future = [];
    countSessionStep();
    project = next;
    lastSetting = null;
    keepSelectionValid(next);
    persistProject();
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
      if (session) session = { ...session, undone: 0 };
      project = next;
      keepSelectionValid(next);
      persistProject();
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
    countSessionStep();
    persistProject();
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
    if (gestureBase) {
      cancelGesture();
      return;
    }
    if (session && session.steps === 0) return;
    lastSetting = null;
    const previous = past[past.length - 1];
    if (!previous) return;
    const undone = project;
    past = past.slice(0, -1);
    future = [...future, project];
    if (session) {
      session = {
        ...session,
        steps: session.steps - 1,
        undone: session.undone + 1,
      };
    }
    project = previous;
    keepSelectionValid(previous);
    replayTiming(undone, "before");
    persistProject();
  }

  function redo(): void {
    if (gestureBase) {
      cancelGesture();
      return;
    }
    if (session && session.undone === 0) return;
    lastSetting = null;
    const next = future[future.length - 1];
    if (!next) return;
    future = future.slice(0, -1);
    past = [...past, project];
    if (session) {
      session = {
        ...session,
        steps: session.steps + 1,
        undone: session.undone - 1,
      };
    }
    project = next;
    keepSelectionValid(next);
    replayTiming(next, "after");
    persistProject();
  }

  /**
   * Opens a session: what follows lands as one undo step when it ends kept,
   * and a slider change cannot join an edit made before it. False when one
   * is already open.
   */
  function beginSession(): boolean {
    if (session) return false;
    if (gestureBase) endGesture();
    session = {
      base: project,
      pastAtStart: past,
      futureAtStart: future,
      steps: 0,
      undone: 0,
    };
    lastSetting = null;
    return true;
  }

  /**
   * Closes the session. Kept, its changes become one undo step, or none when
   * they came back to where it began; not kept, the project and both undo
   * lists return to how they were when it opened. A drag still running ends
   * with it, kept or dropped the same way.
   */
  function endSession(keep: boolean): void {
    const open = session;
    if (!open) return;
    if (gestureBase) {
      if (keep) endGesture();
      else cancelGesture();
    }
    session = null;
    lastSetting = null;
    if (keep && differs(open.base, project)) {
      past = [...open.pastAtStart, open.base].slice(-HISTORY_DEPTH);
      future = [];
      persistProject();
      return;
    }
    project = open.base;
    past = open.pastAtStart;
    future = open.futureAtStart;
    keepSelectionValid(open.base);
    persistProject();
  }

  /** Whether two projects differ in more than when they were saved. */
  function differs(a: PostProject, b: PostProject): boolean {
    if (a === b) return false;
    return (
      JSON.stringify({ ...a, updatedAt: 0 }) !==
      JSON.stringify({ ...b, updatedAt: 0 })
    );
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
    persistProject();
  }

  /**
   * Saves the post now, as the Save button asks. Edits already save
   * themselves; this stamps the time so this copy is the newest wherever
   * it is saved, and it adds no undo step.
   */
  function saveNow(): void {
    if (gestureBase) return;
    const next = {
      ...project,
      updatedAt: Math.max(now(), project.updatedAt + 1, savedUpdatedAt + 1),
    };
    const effect = timingEffects.get(project);
    if (effect) timingEffects.set(next, effect);
    project = next;
    persistProject();
  }

  // ---- Takes and their media -----------------------------------------------

  function openTiming(
    take: PostTake,
    legacy?: StepMap,
    sourceProject: PostProject = project
  ): TakeTiming {
    const saved = loadTakeTiming(sequence.id, take.takeKey);
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
    legacy?: StepMap,
    sourceProject: PostProject = project
  ): void {
    const previous = media[take.id];
    if (previous?.owned && previous.url !== url)
      URL.revokeObjectURL(previous.url);
    media = { ...media, [take.id]: { url, owned } };
    if (
      timings[take.id]?.takeKey !== take.takeKey ||
      timings[take.id]?.sequenceId !== sequence.id
    ) {
      timings = {
        ...timings,
        [take.id]: openTiming(take, legacy, sourceProject),
      };
    }
  }

  function nextTakeId(): string {
    let index = project.takes.length + 1;
    while (project.takes.some((take) => take.id === `take-${index}`))
      index += 1;
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
      else if (
        project.timings?.[take.id] ||
        loadTakeTiming(sequence.id, take.takeKey)
      ) {
        timings = { ...timings, [take.id]: openTiming(take) };
      }
    } else if (take.ref.kind === "linked") {
      attach(take, take.ref.url, false);
    } else {
      timings = { ...timings, [take.id]: openTiming(take) };
    }
  }
  timingTakeId = takesInUse[0]?.id ?? project.takes[0]?.id ?? null;

  for (const image of project.images ?? []) {
    if (image.ref.kind === "linked") {
      imageMedia[image.id] = { url: image.ref.url, owned: false };
    }
  }

  /** Import through the same atomic history path as every other edit. */
  function importProject(
    next: PostProject,
    files: ReadonlyMap<string, File> = new Map()
  ): void {
    if (gestureBase || session)
      throw new Error("Finish the current edit before importing a post.");
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
    const currentSnapshot = snapshotFor(project);
    const transfer = resolvePostStudioDraft(sequence.id, [
      projectDraftRecord({
        ...validated,
        updatedAt: Math.max(validated.updatedAt, currentSnapshot.updatedAt + 1),
      }),
      { key: "before-import", value: JSON.stringify(currentSnapshot) },
    ]);
    const parsed = {
      ...validated,
      timings: transfer?.timings ?? validated.timings,
    };
    for (const asset of [...parsed.takes, ...(parsed.images ?? [])]) {
      if (asset.ref.kind === "local" && !files.has(asset.ref.name)) {
        throw new Error(`Missing media: ${asset.ref.name}`);
      }
    }
    // Preserve the old post before changing the project or its loaded media.
    backupPostProjectBeforeImport(snapshotFor(project));
    const retained: Record<string, TakeTiming> = {};
    for (const take of parsed.takes) {
      const existing = timings[take.id];
      const imported = parsed.timings?.[take.id];
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
    for (const take of parsed.takes) {
      if (take.ref.kind === "linked")
        attach(take, take.ref.url, false, undefined, parsed);
      else if (take.ref.kind === "local") {
        const file = files.get(take.ref.name);
        if (!file) throw new Error(`Missing video: ${take.ref.name}`);
        attach(take, URL.createObjectURL(file), true, undefined, parsed);
      } else
        timings = {
          ...timings,
          [take.id]: timings[take.id] ?? openTiming(take, undefined, parsed),
        };
    }
    const nextImages = { ...imageMedia };
    for (const image of parsed.images ?? []) {
      if (image.ref.kind === "linked")
        nextImages[image.id] = { url: image.ref.url, owned: false };
      else if (image.ref.kind === "local") {
        const file = files.get(image.ref.name);
        if (!file) throw new Error(`Missing image: ${image.ref.name}`);
        nextImages[image.id] = { url: URL.createObjectURL(file), owned: true };
      }
    }
    playing = false;
    imageMedia = nextImages;
    commit(parsed);
    previewSeconds = 0;
    selectedItemId = null;
    timingTakeId = parsed.takes[0]?.id ?? null;
  }

  /**
   * Takes a newer save of this post from another open tab, so tabs on one
   * post never drift apart. It joins the undo history like an edit but is
   * not saved again: the other tab already saved it. A copy that needs a
   * video only the other tab holds (a file picked there) is left alone.
   */
  function adoptSaved(next: PostProject): boolean {
    if (gestureBase || session) return false;
    const parsed = PostProjectSchema.safeParse(next);
    if (
      !parsed.success ||
      parsed.data.sequenceId !== project.sequenceId ||
      // This tab's own saves carry savedUpdatedAt, so only a later save from
      // somewhere else gets through.
      parsed.data.updatedAt <= Math.max(project.updatedAt, savedUpdatedAt)
    )
      return false;
    const incoming = parsed.data;
    const known = new Map(
      project.takes.map((take) => [take.id, JSON.stringify(take.ref)])
    );
    const added = incoming.takes.filter(
      (take) => known.get(take.id) !== JSON.stringify(take.ref)
    );
    if (added.some((take) => take.ref.kind === "local")) return false;
    const nextTimings = { ...timings };
    for (const [takeId, timing] of Object.entries(incoming.timings ?? {})) {
      const mine = nextTimings[takeId];
      if (!mine || timing.updatedAt > mine.updatedAt)
        nextTimings[takeId] = timing;
    }
    timings = nextTimings;
    for (const take of added) {
      if (take.ref.kind === "linked")
        attach(take, take.ref.url, false, undefined, incoming);
      else
        timings = {
          ...timings,
          [take.id]: timings[take.id] ?? openTiming(take, undefined, incoming),
        };
    }
    const nextImages = { ...imageMedia };
    for (const image of incoming.images ?? [])
      if (image.ref.kind === "linked" && !nextImages[image.id])
        nextImages[image.id] = { url: image.ref.url, owned: false };
    imageMedia = nextImages;
    past = [...past, project].slice(-HISTORY_DEPTH);
    future = [];
    project = incoming;
    savedUpdatedAt = Math.max(savedUpdatedAt, incoming.updatedAt);
    lastSetting = null;
    keepSelectionValid(incoming);
    return true;
  }

  /** Apply a local dev manifest edit without replacing loaded footage or the playhead. */
  function replaceManifestFromDev(
    candidate: unknown,
    expectedSnapshot: PostProject
  ): { ok: true } | { ok: false; error: string } {
    if (gestureBase || session)
      return { ok: false, error: "Finish the current edit first." };
    const current = PostProjectSchema.parse(snapshotFor(project));
    if (
      JSON.stringify(current) !==
      JSON.stringify(PostProjectSchema.parse(expectedSnapshot))
    )
      return {
        ok: false,
        error: "The editor changed since this manifest was read.",
      };
    const parsed = PostProjectSchema.safeParse(candidate);
    if (!parsed.success)
      return {
        ok: false,
        error: "The replacement is not a valid Post Studio project.",
      };
    const next = parsed.data;
    if (next.sequenceId !== project.sequenceId)
      return {
        ok: false,
        error: "The replacement belongs to another sequence.",
      };
    const locked = bridgeLockedChange(current, next);
    if (locked)
      return {
        ok: false,
        error: `${locked} cannot be changed through the manifest bridge.`,
      };
    const normalized = normalizeProject(next);
    const withoutTimestamp = (value: PostProject) => ({
      ...value,
      updatedAt: 0,
    });
    if (
      JSON.stringify(withoutTimestamp(normalized)) ===
      JSON.stringify(withoutTimestamp(project))
    )
      return { ok: true };
    commit({
      ...normalized,
      updatedAt: Math.max(now(), project.updatedAt + 1, normalized.updatedAt),
    });
    return { ok: true };
  }

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
    const stored = withTake.takes.find(
      (entry) => entry.takeKey === take.takeKey
    );
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
    if (
      !take ||
      take.ref.kind !== "local" ||
      take.ref.name !== file.name ||
      take.ref.size !== file.size ||
      take.ref.lastModified !== file.lastModified
    )
      return false;
    attach(take, URL.createObjectURL(file), true);
    return true;
  }

  /** Restore selected source files after reload without replacing the user's edits. */
  function relinkProjectFiles(files: ReadonlyMap<string, File>): number {
    const matches = (ref: PostTake["ref"]): File | undefined => {
      if (ref.kind !== "local") return undefined;
      const file = files.get(ref.name);
      return file &&
        file.size === ref.size &&
        file.lastModified === ref.lastModified
        ? file
        : undefined;
    };
    let linked = 0;
    for (const take of project.takes) {
      const file = matches(take.ref);
      if (file) {
        attach(take, URL.createObjectURL(file), true);
        linked++;
      }
    }
    const nextImages = { ...imageMedia };
    for (const asset of project.images ?? []) {
      const file = matches(asset.ref);
      if (!file) continue;
      const previous = nextImages[asset.id];
      if (previous?.owned) URL.revokeObjectURL(previous.url);
      nextImages[asset.id] = { url: URL.createObjectURL(file), owned: true };
      linked++;
    }
    imageMedia = nextImages;
    return linked;
  }

  function renameTake(takeId: string, label: string): void {
    const name = cleanLabel(label);
    if (!name) return;
    edit((current, ctx) => {
      const take = current.takes.find((entry) => entry.id === takeId);
      if (!take) return current;
      const previousName = takeDisplayLabel(current, takeId);
      const tracks = current.tracks.map((track) => ({
        ...track,
        items: track.items.map((item) =>
          item.kind === "video" &&
          item.takeId === takeId &&
          item.label === previousName
            ? { ...item, label: name }
            : item
        ),
      }));
      if (take.label === name && previousName === name) return current;
      return {
        ...current,
        takes: current.takes.map((entry) =>
          entry.id === takeId ? { ...entry, label: name } : entry
        ),
        tracks,
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
    // With the opening tunnel in hand, only the tunnel goes; the animation stays.
    if (selectedPart === "tunnel") {
      if (gestureBase) return false;
      const kept = target.id;
      if (!commit(removeProjectTunnelHook(project, context()))) return false;
      selectedItemId = findItem(project, kept) ? kept : null;
      tunnelSelectedFor = null;
      return true;
    }
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

  /** Titles go over the opening tunnel when the post has one, else at `at`. */
  function addTitles(at: number): string | null {
    if (gestureBase) return null;
    const result = addTitlesItem(project, context(), { at });
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

  /** Puts the tunnel hook in front of the post; everything moves later by its length. */
  function addTunnelHook(): string | null {
    if (gestureBase) return null;
    const result = addProjectTunnelHook(project, context(), {
      clock: { timings, moveBeats },
    });
    if (!result || !commit(result.project)) return null;
    selectedItemId = result.itemId;
    return result.itemId;
  }

  /** Takes the hook out and brings everything back to where it was. */
  function removeTunnelHook(): boolean {
    if (gestureBase || !findTunnelHook(project)) return false;
    const next = removeProjectTunnelHook(project, context());
    selectedItemId = null;
    return commit(next);
  }

  /**
   * A trim shows the frame at the edge being dragged, as InShot does: the
   * new first frame, or the last one.
   */
  function trimLive(
    itemId: string,
    edge: "start" | "end",
    seconds: number
  ): void {
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

  function applyTemplate(template: PostProject): boolean {
    if (gestureBase) return false;
    return commit(applyTutorialTemplate(project, template, context()));
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

  function setAudio(audio: PostProject["audio"]): void {
    edit((current, ctx) => setProjectAudio(current, audio, ctx));
  }

  // ---- Timing ------------------------------------------------------------

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
    const result = saveTakeTiming(next);
    persistProject(result);
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
    const appearances = { ...project.mappingPreviewAppearances };
    if (appearance) appearances[takeId] = appearance;
    else delete appearances[takeId];
    project = finish(
      {
        ...project,
        mappingPreviewAppearances: Object.keys(appearances).length
          ? appearances
          : undefined,
      },
      context()
    );
    persistProject();
  }

  function editMappingPreviewAppearance(
    takeId: string,
    appearance: MappingAppearance,
    settingKey?: string
  ): boolean {
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
        appearance: project.mappingPreviewAppearances?.[takeId],
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
    if (!playing && previewSeconds >= durationSeconds - 1e-3)
      previewSeconds = 0;
    playing = durationSeconds > 0 && !playing;
  }

  function pause(): void {
    playing = false;
  }

  function dispose(): void {
    for (const held of Object.values(media)) {
      if (held.owned) URL.revokeObjectURL(held.url);
    }
    for (const held of Object.values(imageMedia)) {
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
    get snapshot() {
      return snapshotFor(project);
    },
    get saveError() {
      return saveError;
    },
    get saveRevision() {
      return saveRevision;
    },
    saveNow,
    get takes() {
      return project.takes;
    },
    takeDisplayLabel(takeId: string): string {
      return takeDisplayLabel(project, takeId);
    },
    get images() {
      return project.images ?? [];
    },
    imageUrl(imageId: string): string | null {
      return imageMedia[imageId]?.url ?? null;
    },
    importProject,
    replaceManifestFromDev,
    get compiled() {
      return compiled;
    },
    get durationSeconds() {
      return durationSeconds;
    },
    get frameLayers() {
      return frameLayers;
    },
    /** `frameLayers` plus any a fade leaves fully clear, for the crop screen. */
    get presentLayers() {
      return presentLayers;
    },
    get regionRects() {
      return regionRects;
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
      tunnelSelectedFor = null;
    },
    /** `"tunnel"` while an animation's opening tunnel is what is selected. */
    get selectedPart() {
      return selectedPart;
    },
    /** Selects an animation's opening tunnel, which has a look of its own. */
    selectTunnel(itemId: string) {
      selectedItemId = findItem(project, itemId) ? itemId : null;
      tunnelSelectedFor = selectedItemId;
    },
    get tunnelHook() {
      return findTunnelHook(project);
    },
    get selectedItem() {
      return selectedItem;
    },
    get canUndo() {
      return (
        gestureBase !== null ||
        (past.length > 0 && (!session || session.steps > 0))
      );
    },
    get canRedo() {
      return (
        gestureBase !== null ||
        (future.length > 0 && (!session || session.undone > 0))
      );
    },
    get inGesture() {
      return gestureBase !== null;
    },
    get inSession() {
      return session !== null;
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
    canRedoTiming(takeId: string): boolean {
      return (timingRedo[takeId]?.length ?? 0) > 0;
    },
    editTiming,
    editMappingPreviewAppearance,
    undoTiming,
    redoTiming,
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
    beginSession,
    endSession,
    undo,
    redo,
    trimLive,
    splitAtPlayhead,
    deleteSelected,
    duplicateSelected,
    addOverlay,
    addTitles,
    addCard,
    addTunnelHook,
    removeTunnelHook,
    applyTutorial,
    applyTemplate,
    setAudio,
    seedAudio,
    addLocalVideo,
    addCatalogVideo,
    appendTakeClip,
    relinkLocalTake,
    relinkProjectFiles,
    attachCatalogTakes,
    renameTake,
    adoptSaved,
    removeTake,
    seek,
    advance,
    togglePlayback,
    pause,
    dispose,
  };
}

export type PostEditorState = ReturnType<typeof createPostEditorState>;
