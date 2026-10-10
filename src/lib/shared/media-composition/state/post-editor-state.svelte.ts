import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepMap } from "$lib/shared/video-collaboration/domain/collaborative-video";
import {
  createVideoEditorState,
  type VideoEditorHost,
  type VideoEditorState,
} from "@austencloud/video-editor";
import type { PostProject } from "@austencloud/video-editor/core";
import {
  PostProjectSchema,
  normalizeProject,
  editContext,
  tkaPlugin,
} from "$lib/shared/post-studio-plugin";
import {
  addTitlesItem,
  addTunnelHook as addProjectTunnelHook,
  findTunnelHook,
  removeTunnelHook as removeProjectTunnelHook,
} from "$lib/shared/media-composition/domain/post-project-edits";
import {
  applyTutorialTemplate,
  applyTutorialPreset,
  type TutorialLabels,
} from "$lib/shared/media-composition/domain/post-project-looks";
import { bridgeLockedChange } from "$lib/shared/media-composition/domain/post-project-bridge-guard";
import type { PostTimingEffect } from "$lib/shared/media-composition/services/post-editor-history-store";
import {
  devicePostEditorStore,
  editorStoreOf,
  type PostEditorStore,
} from "$lib/shared/media-composition/services/post-editor-store";
import { postOwnerId } from "$lib/shared/media-composition/services/post-project-store";
import { getPreviewVideoCache } from "$lib/shared/media-composition/get-preview-video-cache";
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

export interface PostEditorDeps {
  getSequence: () => SequenceData;
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
    "notify" | "shortcuts" | "haptics" | "mediaLibrary"
  >;
}

/** A pure project edit; returning the same project means nothing changed. */
export type { PostEdit } from "@austencloud/video-editor";

export function createPostEditorState(deps: PostEditorDeps) {
  const store = deps.store ?? devicePostEditorStore;
  const now = deps.now ?? (() => Date.now());
  const timing = createPostTimingState({ ...deps, store, now });
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
    subjectId: deps.getSequence().id,
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

  let mode = $state<PostEditorMode>("edit");

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

  /** The catalog loads after the editor opens; saved takes get their video. */
  function attachCatalogTakes(): void {
    core.attachLibraryTakes();
  }

  function deleteSelected(): boolean {
    if (timing.selectedPart !== "tunnel") return core.deleteSelected();
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
      return mode;
    },
    set mode(next: PostEditorMode) {
      if (next === "timing") core.pause();
      mode = next;
    },
    get selectedItemId() {
      return core.selectedItemId;
    },
    set selectedItemId(next: string | null) {
      core.selectedItemId = next;
    },
    /** `"tunnel"` while an animation's opening tunnel is what is selected. */
    get selectedPart() {
      return timing.selectedPart;
    },
    /** Selects an animation's opening tunnel, which has a look of its own. */
    selectTunnel: timing.selectTunnel,
    /** Package parts; tka's only part is the opening tunnel, still held by the timing state. */
    selectPart(itemId: string, part: string) {
      if (part === "tunnel") timing.selectTunnel(itemId);
      else core.selectPart(itemId, part);
    },
    get tunnelHook() {
      return timing.tunnelHook;
    },
    get selectedItem() {
      return core.selectedItem;
    },
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
      mode = "edit";
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
    addLibraryVideo: core.addLibraryVideo,
    appendTakeClip: core.appendTakeClip,
    relinkLocalTake: core.relinkLocalTake,
    relinkProjectFiles: core.relinkProjectFiles,
    attachCatalogTakes,
    attachLibraryTakes: core.attachLibraryTakes,
    renameTake: core.renameTake,
    adoptSaved: core.adoptSaved,
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
