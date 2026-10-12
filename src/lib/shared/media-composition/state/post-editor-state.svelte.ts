import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type {
  ArrangementCell,
  ArrangementSnapshot,
} from "#lib/shared/media-composition/domain/arrangement.js";
import { isVisibleCell } from "#lib/shared/media-composition/domain/arrangement-edits.js";
import type { StepMap } from "#lib/shared/video-collaboration/domain/collaborative-video.js";
import {
  createVideoEditorState,
  type LibraryTakeSource,
  type VideoEditorHost,
  type VideoEditorState,
} from "@austencloud/video-editor";
import type { PostProject } from "@austencloud/video-editor/core";
import {
  PostProjectSchema,
  normalizeProject,
  editContext,
  tkaPlugin,
} from "#lib/shared/post-studio-plugin/index.js";
import {
  addArrangementItem,
  addTitlesItem,
  addTunnelHook as addProjectTunnelHook,
  clearArrangementCell,
  findTunnelHook,
  removeTunnelHook as removeProjectTunnelHook,
} from "#lib/shared/media-composition/domain/post-project-edits.js";
import {
  applyTutorialTemplate,
  applyTutorialPreset,
  type TutorialLabels,
} from "#lib/shared/media-composition/domain/post-project-looks.js";
import { bridgeLockedChange } from "#lib/shared/media-composition/domain/post-project-bridge-guard.js";
import type { PostTimingEffect } from "#lib/shared/media-composition/services/post-editor-history-store.js";
import {
  devicePostEditorStore,
  editorStoreOf,
  type PostEditorStore,
} from "#lib/shared/media-composition/services/post-editor-store.js";
import { postOwnerId } from "#lib/shared/media-composition/services/post-project-store.js";
import { getPreviewVideoCache } from "#lib/shared/media-composition/get-preview-video-cache.js";
import { tkaEditorTranslate } from "./editor-strings";
import { createPostTimingState } from "./post-timing-state.svelte";

/**
 * The timeline editor's working state: the package's editor state with
 * tka's take timing riding along. The project, its undo history, the media,
 * the selection and the preview clock live in `createVideoEditorState`; each
 * take's timing, the tunnel selection and the timing undo live in
 * `createPostTimingState`. The canvas, the timeline, the inspector and the
 * export all read this one object, so an edit in one shows in all of them.
 *
 * Nothing here touches Firestore. The project and the timings save through
 * the editor's store as they change: this device by default, or a feature
 * video's folder on disk. The undo history is kept in the tab, so Undo
 * still works after a reload.
 */

export type PostEditorMode = "edit" | "timing" | "arrangement";

/** A catalog video as the editor needs it. */
export interface CatalogTakeSource {
  videoId: string;
  label: string;
  url: string;
  durationSeconds: number;
  /** A map tapped in an older editor, seeded into the timing on first open. */
  legacyStepMap?: StepMap;
}

export interface PostEditorDeps {
  /** Null for a post that starts from an arrangement or plain footage. */
  getSequence: () => SequenceData | null;
  /** A recovered full draft to open in place of this browser's saved copy. */
  initialProject?: PostProject;
  /** Catalog videos for the sequence, looked up by id. */
  getCatalogVideo?: (videoId: string) => CatalogTakeSource | null;
  /** True when a painter can draw the beat overlay on animation items. */
  hasAnimationOverlay?: () => boolean;
  /**
   * Where the post, its timings and its undo history are kept: this
   * device's storage unless a feature video passes its own.
   */
  store?: PostEditorStore;
  now?: () => number;
  /** The host services the screen adds (toasts, shortcuts, haptics, media library); see tka-host. */
  services?: Pick<
    VideoEditorHost<PostTimingEffect>,
    "notify" | "shortcuts" | "haptics" | "mediaLibrary" | "footage" | "confirmations"
  >;
}

/** A pure project edit; returning the same project means nothing changed. */
export type { PostEdit } from "@austencloud/video-editor";

export function createPostEditorState(deps: PostEditorDeps) {
  const store = deps.store ?? devicePostEditorStore;
  const now = deps.now ?? (() => Date.now());
  const sequenceId =
    deps.initialProject?.sequenceId ?? deps.getSequence()?.id ?? null;
  if (!sequenceId) throw new Error("A Post Studio project needs an identity.");
  const timing = createPostTimingState({ ...deps, sequenceId, store, now });
  const host: VideoEditorHost<PostTimingEffect> = {
    get ownerId() {
      return postOwnerId();
    },
    store: editorStoreOf(store),
    translate: tkaEditorTranslate,
    now,
    dev: import.meta.env.DEV,
    previewCache: getPreviewVideoCache(),
    ...deps.services,
  };
  const core = createVideoEditorState<PostTimingEffect>(host, tkaPlugin, {
    subjectId: sequenceId,
    ...(deps.initialProject ? { initialProject: deps.initialProject } : {}),
    // Every catalog take that attaches is looked up here first, so its
    // older editor's map can seed the timing as the video arrives.
    libraryTake: (videoId) => {
      const video = deps.getCatalogVideo?.(videoId) ?? null;
      if (video) timing.rememberLegacy(video);
      return video;
    },
    extension: timing.extension,
  });
  timing.selectedTakeId =
    core.takesInUse[0]?.id ?? core.project.takes[0]?.id ?? null;

  /** The cell in hand, tied to its arrangement so any other selection drops it. */
  let cellSelection = $state<{ itemId: string; cellId: string } | null>(null);
  /** The selected arrangement's selected cell while it is on screen. */
  const selectedCell = $derived.by((): ArrangementCell | null => {
    const held = cellSelection;
    const item = core.selectedItem;
    if (!held || held.itemId !== item?.id || item.kind !== "arrangement")
      return null;
    const cell = item.snapshot.cells.find((c) => c.id === held.cellId);
    return cell && isVisibleCell(cell, item.snapshot) ? cell : null;
  });

  /** Selects one of the selected arrangement's cells; null selects the grid. */
  function selectCell(cellId: string | null): boolean {
    if (cellId === null) {
      cellSelection = null;
      return true;
    }
    const item = core.selectedItem;
    if (item?.kind !== "arrangement") return false;
    const cell = item.snapshot.cells.find((c) => c.id === cellId);
    if (!cell || !isVisibleCell(cell, item.snapshot)) return false;
    cellSelection = { itemId: item.id, cellId };
    return true;
  }

  /** Empties the selected cell in one undo step; the cell stays selected. */
  function clearSelectedCell(): boolean {
    const item = core.selectedItem;
    const cell = selectedCell;
    if (!item || !cell || core.isLocked(item.id)) return false;
    return core.edit((current, ctx) =>
      clearArrangementCell(current, item.id, cell.id, ctx)
    );
  }

  /** A new arrangement, selected, from a blank or a saved grid. */
  function addArrangement(
    snapshot: ArrangementSnapshot,
    at: number
  ): string | null {
    if (core.inGesture) return null;
    const result = addArrangementItem(
      core.project,
      snapshot,
      at,
      editContext(now())
    );
    if (!core.commit(result.project)) return null;
    core.selectedItemId = result.itemId;
    cellSelection = null;
    return result.itemId;
  }

  /** Import through the same atomic history path as every other edit. */
  function importProject(
    next: PostProject,
    files: ReadonlyMap<string, File> = new Map()
  ): void {
    core.importProject(next, files);
    timing.selectedTakeId = core.project.takes[0]?.id ?? null;
  }

  /** Apply a local dev manifest edit without replacing loaded footage or the playhead. */
  function replaceManifestFromDev(
    candidate: unknown,
    expectedSnapshot: PostProject
  ): { ok: true } | { ok: false; error: string } {
    if (core.inGesture || core.inSession)
      return { ok: false, error: "Finish the current edit first." };
    const current = PostProjectSchema.parse(core.snapshot);
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
    if (next.sequenceId !== core.project.sequenceId)
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
      JSON.stringify(withoutTimestamp(core.project))
    )
      return { ok: true };
    const incoming = {
      ...normalized,
      updatedAt: Math.max(
        now(),
        core.project.updatedAt + 1,
        normalized.updatedAt
      ),
    };
    // A take the edit adds or points at another file plays straight away.
    // Its timing opens first, so the save holds it: a feature video's disk
    // save skips a copy older than the editor's own.
    core.loadSavedMedia(incoming);
    core.commit(incoming);
    return { ok: true };
  }

  function addCatalogVideo(video: CatalogTakeSource): string | null {
    timing.rememberLegacy(video);
    return core.addLibraryVideo(video);
  }

  /** A library take added by id; the catalog's own record still seeds an older timing map. */
  function addLibraryVideo(video: LibraryTakeSource): string | null {
    const known = deps.getCatalogVideo?.(video.videoId) ?? null;
    if (known) timing.rememberLegacy(known);
    return core.addLibraryVideo(video);
  }

  /** The catalog loads after the editor opens; saved takes get their video. */
  function attachCatalogTakes(): void {
    core.attachLibraryTakes();
  }

  /**
   * The package state's part, read as tka reads it: the opening tunnel counts
   * only while the selected animation still carries it (an undo can take the
   * hook away under the selection).
   */
  function selectedPart(): "tunnel" | null {
    const item = core.selectedItem;
    return core.selectedPart === "tunnel" &&
      item?.kind === "animation" &&
      item.tunnelHook
      ? "tunnel"
      : null;
  }

  function deleteSelected(): boolean {
    // With a cell in hand, Delete empties the cell; the arrangement stays.
    if (selectedCell) return clearSelectedCell();
    if (selectedPart() !== "tunnel") return core.deleteSelected();
    const target = core.selectedItem;
    if (!target || core.isLocked(target.id)) return false;
    // With the opening tunnel in hand, only the tunnel goes; the animation stays.
    if (core.inGesture) return false;
    const kept = target.id;
    if (!core.commit(removeProjectTunnelHook(core.project, editContext(now()))))
      return false;
    // The setter keeps the animation only if it is still there, and drops
    // the tunnel part.
    core.selectedItemId = kept;
    return true;
  }

  /** Titles go over the opening tunnel when the post has one, else at `at`. */
  function addTitles(at: number): string | null {
    if (core.inGesture) return null;
    const result = addTitlesItem(core.project, editContext(now()), { at });
    if (!result || !core.commit(result.project)) return null;
    timing.selectKeepingPart(result.itemId);
    return result.itemId;
  }

  /** Puts the tunnel hook in front of the post; everything moves later by its length. */
  function addTunnelHook(): string | null {
    if (core.inGesture) return null;
    const result = addProjectTunnelHook(core.project, editContext(now()), {
      clock: { timings: timing.timings, moveBeats: timing.moveBeats },
    });
    if (!result || !core.commit(result.project)) return null;
    timing.selectKeepingPart(result.itemId);
    return result.itemId;
  }

  /** Takes the hook out and brings everything back to where it was. */
  function removeTunnelHook(): boolean {
    if (core.inGesture || !findTunnelHook(core.project)) return false;
    const next = removeProjectTunnelHook(core.project, editContext(now()));
    timing.selectKeepingPart(null);
    return core.commit(next);
  }

  /**
   * Builds the whole tutorial on what is there. When both clips come from
   * one take, that take's timing is split where the slow-mo starts, and the
   * slow part counts from move 1 again. It is one undo step with the post,
   * even when only the timing changed.
   */
  function applyTutorial(labels: TutorialLabels): boolean {
    if (core.inGesture) return false;
    const project = core.project;
    const result = applyTutorialPreset(project, labels, editContext(now()));
    const split = result.timingSplit;
    const before = split
      ? (timing.timing(split.takeId) ?? undefined)
      : undefined;
    if (split) timing.splitTakeTimingAt(split.takeId, split.atSeconds);
    const after = split
      ? (timing.timing(split.takeId) ?? undefined)
      : undefined;
    const timingChanged = Boolean(before && after && after !== before);
    const next =
      result.project === project && timingChanged
        ? { ...project, updatedAt: now() }
        : result.project;
    const effect =
      split && before && after && timingChanged
        ? { takeId: split.takeId, before, after }
        : undefined;
    if (!core.commit(next, effect)) return false;
    timing.selectKeepingPart(null);
    core.seek(0);
    return true;
  }

  function applyTemplate(template: PostProject): boolean {
    if (core.inGesture) return false;
    return core.commit(
      applyTutorialTemplate(core.project, template, editContext(now()))
    );
  }

  return {
    get sequence() {
      return timing.sequence;
    },
    get moveBeats() {
      return timing.moveBeats;
    },
    get subjectId() {
      return core.subjectId;
    },
    get project() {
      return core.project;
    },
    get snapshot() {
      return core.snapshot;
    },
    get saveError() {
      return core.saveError;
    },
    get saveRevision() {
      return core.saveRevision;
    },
    saveNow: core.saveNow,
    get takes() {
      return core.takes;
    },
    takeDisplayLabel: core.takeDisplayLabel,
    get images() {
      return core.images;
    },
    imageUrl: core.imageUrl,
    importProject,
    replaceManifestFromDev,
    get compiled() {
      return core.compiled;
    },
    get durationSeconds() {
      return core.durationSeconds;
    },
    get frameLayers() {
      return core.frameLayers;
    },
    /** `frameLayers` plus any a fade leaves fully clear, for the crop screen. */
    get presentLayers() {
      return core.presentLayers;
    },
    get regionRects() {
      return core.regionRects;
    },
    get previewSeconds() {
      return core.previewSeconds;
    },
    get isPlaying() {
      return core.isPlaying;
    },
    host,
    get mode() {
      return core.mode as PostEditorMode;
    },
    set mode(next: PostEditorMode) {
      if (next === "timing") core.pause();
      core.mode = next;
    },
    get selectedItemId() {
      return core.selectedItemId;
    },
    set selectedItemId(next: string | null) {
      if (next !== core.selectedItemId) cellSelection = null;
      core.selectedItemId = next;
    },
    /** `"tunnel"` while an animation's opening tunnel is what is selected. */
    get selectedPart() {
      return selectedPart();
    },
    /** Selects an animation's opening tunnel, which has a look of its own. */
    selectTunnel(itemId: string): void {
      cellSelection = null;
      core.selectPart(itemId, "tunnel");
    },
    /** Package parts; tka's only part is the opening tunnel. */
    selectPart: (itemId: string, part: string) => core.selectPart(itemId, part),
    get tunnelHook() {
      return timing.tunnelHook;
    },
    get selectedItem() {
      return core.selectedItem;
    },
    /** The selected arrangement's cell in hand, or null for the whole grid. */
    get selectedCellId() {
      return selectedCell?.id ?? null;
    },
    get selectedCell() {
      return selectedCell;
    },
    selectCell,
    clearSelectedCell,
    get canUndo() {
      return core.canUndo;
    },
    get canRedo() {
      return core.canRedo;
    },
    get inGesture() {
      return core.inGesture;
    },
    get inSession() {
      return core.inSession;
    },
    /** The item a split at the playhead would cut, or null. */
    get splitTarget() {
      return core.splitTarget;
    },
    /** A selection whose layer is not locked. */
    get selectionEditable() {
      return core.selectionEditable;
    },
    isLocked: core.isLocked,
    get takesInUse() {
      return core.takesInUse;
    },
    // TimingHost: the take the Timing tool shows.
    get selectedTakeId() {
      return timing.selectedTakeId;
    },
    set selectedTakeId(next: string | null) {
      timing.selectedTakeId = next;
    },
    mediaUrl: core.mediaUrl,
    timing: timing.timing,
    resolvedTiming: timing.resolvedTiming,
    timingStatus: timing.timingStatus,
    canUndoTiming: timing.canUndoTiming,
    canRedoTiming: timing.canRedoTiming,
    editTiming: timing.editTiming,
    editMappingPreviewAppearance: timing.editMappingPreviewAppearance,
    undoTiming: timing.undoTiming,
    redoTiming: timing.redoTiming,
    confirmTiming: timing.confirmTiming,
    exitTiming(_reason: "done" | "back"): void {
      core.mode = "edit";
    },
    persist: core.persist,
    commit: core.commit,
    amend: core.amend,
    editContext: core.editContext,
    edit: core.edit,
    editSetting: core.editSetting,
    beginGesture: core.beginGesture,
    gestureStep: core.gestureStep,
    endGesture: core.endGesture,
    cancelGesture: core.cancelGesture,
    beginSession: core.beginSession,
    endSession: core.endSession,
    undo: core.undo,
    redo: core.redo,
    trimLive: core.trimLive,
    splitAtPlayhead: core.splitAtPlayhead,
    deleteSelected,
    duplicateSelected: core.duplicateSelected,
    addOverlay: core.addOverlay,
    addArrangement,
    addTitles,
    addCard: core.addCard,
    addTunnelHook,
    removeTunnelHook,
    applyTutorial,
    applyTemplate,
    setAudio: core.setAudio,
    seedAudio: core.seedAudio,
    addLocalVideo: core.addLocalVideo,
    addCatalogVideo,
    addLibraryVideo,
    appendTakeClip: core.appendTakeClip,
    relinkLocalTake: core.relinkLocalTake,
    relinkProjectFiles: core.relinkProjectFiles,
    attachCatalogTakes,
    attachLibraryTakes: core.attachLibraryTakes,
    renameTake: core.renameTake,
    adoptSaved: core.adoptSaved,
    loadSaved: core.loadSaved,
    loadSavedMedia: core.loadSavedMedia,
    /** Removes a take and every clip cut from it; the timing state picks the next take to time. */
    removeTake: core.removeTake,
    seek: core.seek,
    advance: core.advance,
    togglePlayback: core.togglePlayback,
    pause: core.pause,
    /**
     * Releases the media. Forwards to the package state's dispose, which calls
     * the extension's dispose hook when it has one; the timing extension has none.
     */
    dispose: core.dispose,
  };
}

export type PostEditorState = ReturnType<typeof createPostEditorState>;

/**
 * Fails the type gate when the wrapper stops being a package state, member by member and
 * signature by signature (plan 2A risk R13).
 */
type Conforms<T extends VideoEditorState<PostTimingEffect>> = T;
export type PostEditorStateConforms = Conforms<PostEditorState>;
