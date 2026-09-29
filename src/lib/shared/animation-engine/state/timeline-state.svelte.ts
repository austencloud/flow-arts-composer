/**
 * Timeline Editor State
 *
 * Svelte 5 runes-based state management for the DAW-style timeline editor.
 * Core state and mutations for project, tracks, clips, playback, viewport, and selection.
 *
 * Decomposed from 908 lines to ~550 lines + 5 action modules.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { TimeSignatureKey } from "$lib/shared/foundation/domain/models/time-signature";
import type {
  TimelineProject,
  TimelineTrack,
  TimelineClip,
  PlayheadState,
  SelectionState,
  ViewportState,
  SnapSettings,
  TimeSeconds,
} from "../domain/timeline-types";
import {
  createProject,
  createTrack,
  createClip,
  createDefaultPlayheadState,
  createDefaultSelectionState,
  createDefaultViewportState,
  generateClipId,
  getClipEndTime,
  calculateProjectDuration,
  snapTime,
} from "../domain/timeline-types";

import {
  loadFromStorage,
  saveToStorage,
  TIMELINE_STORAGE_KEYS,
} from "$lib/shared/animation-engine/timeline/state/timeline-storage";
import { getStepTimes } from "$lib/shared/animation-engine/timeline/services/step-grid-calculator";
import { createPlayheadActions } from "$lib/shared/animation-engine/timeline/state/actions/playhead-actions";
import { createSelectionActions } from "$lib/shared/animation-engine/timeline/state/actions/selection-actions";
import { createViewportActions } from "$lib/shared/animation-engine/timeline/state/actions/viewport-actions";
import { createUIStateActions } from "$lib/shared/animation-engine/timeline/state/actions/ui-state-actions";
import { getTimelineUndoManager } from "$lib/shared/animation-engine/timeline/services/timeline-undo-manager";
import type { TimelineUndoOperationType } from "$lib/shared/animation-engine/timeline/domain/types";

// Project Deduplication Helper

/**
 * Deduplicate clips and tracks within a project to prevent Svelte each_key_duplicate errors.
 * Removes items with duplicate IDs, keeping the first occurrence.
 */
function deduplicateProjectClips(proj: TimelineProject): TimelineProject {
  // First deduplicate tracks by ID
  const seenTrackIds = new Set<string>();
  const dedupedTracks = proj.tracks.filter((track) => {
    if (seenTrackIds.has(track.id)) {
      console.warn(`[Timeline] Removed duplicate track ID: ${track.id}`);
      return false;
    }
    seenTrackIds.add(track.id);
    return true;
  });

  // Then deduplicate clips within each track
  const tracksWithDedupedClips = dedupedTracks.map((track) => {
    const seenClipIds = new Set<string>();
    const dedupedClips = track.clips.filter((clip) => {
      if (seenClipIds.has(clip.id)) {
        console.warn(
          `[Timeline] Removed duplicate clip ID in track ${track.id}: ${clip.id}`
        );
        return false;
      }
      seenClipIds.add(clip.id);
      return true;
    });
    return { ...track, clips: dedupedClips };
  });

  // Also check for clips that exist across multiple tracks (shouldn't happen)
  const allClipIds = new Set<string>();
  const finalTracks = tracksWithDedupedClips.map((track) => {
    const uniqueClips = track.clips.filter((clip) => {
      if (allClipIds.has(clip.id)) {
        console.warn(
          `[Timeline] Removed cross-track duplicate clip ID: ${clip.id}`
        );
        return false;
      }
      allClipIds.add(clip.id);
      return true;
    });
    return { ...track, clips: uniqueClips };
  });

  return { ...proj, tracks: finalTracks };
}

function withoutUnavailableAudio(proj: TimelineProject): TimelineProject {
  if (!proj.audio?.hasAudio) return proj;
  return {
    ...proj,
    audio: { hasAudio: false, fileName: null, duration: 0, bpm: null },
  };
}

// ============================================================================
// State Factory
// ============================================================================

export type TimelineState = ReturnType<typeof createTimelineState>;

export function createTimelineState() {
  // =========================================================================
  // Core State
  // =========================================================================

  // Loading and error state
  let isLoading = $state(true);
  let loadError = $state<string | null>(null);

  // Load project from storage and deduplicate to prevent Svelte each_key_duplicate errors
  let project = $state<TimelineProject>(createProject());
  let playhead = $state<PlayheadState>(createDefaultPlayheadState());
  let selection = $state<SelectionState>(createDefaultSelectionState());
  let viewport = $state<ViewportState>(createDefaultViewportState());

  // Initialize state from storage
  try {
    const storedProject = deduplicateProjectClips(
      loadFromStorage(TIMELINE_STORAGE_KEYS.PROJECT, createProject())
    );
    project = withoutUnavailableAudio(storedProject);
    if (storedProject.audio?.hasAudio) {
      saveToStorage(TIMELINE_STORAGE_KEYS.PROJECT, project);
    }
    viewport = loadFromStorage(
      TIMELINE_STORAGE_KEYS.VIEWPORT,
      createDefaultViewportState()
    );
    isLoading = false;
  } catch (err) {
    console.error("[Timeline] Failed to load from storage:", err);
    loadError = "Failed to load project. Starting fresh.";
    project = createProject();
    viewport = createDefaultViewportState();
    isLoading = false;
  }

  // UI State
  let isClipInspectorOpen = $state(false);
  let isTrackSettingsOpen = $state(false);
  let isProjectSettingsOpen = $state(false);
  let clipBeingEdited = $state<string | null>(null);

  // Undo/Redo state
  const undoManager = getTimelineUndoManager();
  let audioUrl = $state<string | null>(null);
  undoManager.init(
    () => project,
    () => audioUrl
  );

  let canUndo = $state(undoManager.canUndo);
  let canRedo = $state(undoManager.canRedo);
  let undoDescription = $state<string | null>(undoManager.undoDescription);
  let redoDescription = $state<string | null>(undoManager.redoDescription);
  let editInProgress = false;

  // Subscribe to undo manager changes
  undoManager.subscribe(() => {
    canUndo = undoManager.canUndo;
    canRedo = undoManager.canRedo;
    undoDescription = undoManager.undoDescription;
    redoDescription = undoManager.redoDescription;
  });

  // Helper to wrap mutations with undo capture
  function withUndo<T>(
    type: TimelineUndoOperationType,
    description: string,
    fn: () => T
  ): T {
    if (editInProgress) return fn();
    undoManager.captureState(type, description);
    try {
      const result = fn();
      undoManager.commitState();
      return result;
    } catch (error) {
      undoManager.cancelPending();
      throw error;
    }
  }

  function beginEdit(
    type: TimelineUndoOperationType,
    description: string
  ): void {
    if (editInProgress) return;
    editInProgress = true;
    undoManager.captureState(type, description);
  }

  function endEdit(): void {
    if (!editInProgress) return;
    editInProgress = false;
    undoManager.commitState();
  }

  // Drag state
  let isDragging = $state(false);
  let dragClipId = $state<string | null>(null);
  let dragStartX = $state(0);
  let dragStartTime = $state<TimeSeconds>(0);

  // =========================================================================
  // Derived State
  // =========================================================================

  const selectedClips = $derived(
    project.tracks
      .flatMap((t) => t.clips)
      .filter((c) => selection.selectedClipIds.includes(c.id))
  );

  const selectedClip = $derived(
    selectedClips.length === 1 ? selectedClips[0] : null
  );
  // Deduplicate clips by ID to prevent Svelte each_key_duplicate errors
  const allClips = $derived.by(() => {
    const clips = project.tracks.flatMap((t) => t.clips);
    const seenIds = new Set<string>();
    return clips.filter((clip) => {
      if (seenIds.has(clip.id)) {
        console.warn(
          `[Timeline] Filtered duplicate clip ID in allClips: ${clip.id}`
        );
        return false;
      }
      seenIds.add(clip.id);
      return true;
    });
  });
  const clipEdges = $derived(
    allClips.flatMap((c) => [c.startTime, getClipEndTime(c)])
  );
  const totalDuration = $derived(calculateProjectDuration(project));
  const hasSelection = $derived(selection.selectedClipIds.length > 0);

  // Calculate beat marker times for snap functionality
  const beatMarkerTimes = $derived.by(() => {
    if (project.defaultBpm <= 0) return [];
    const ts = project.timeSignature ?? "4/4";
    return getStepTimes(project.defaultBpm, totalDuration + 10, ts);
  });

  // =========================================================================
  // Helper Functions
  // =========================================================================

  function saveProject() {
    saveToStorage(TIMELINE_STORAGE_KEYS.PROJECT, project);
  }

  // =========================================================================
  // Initialize Action Modules
  // =========================================================================

  const playheadActions = createPlayheadActions({
    getPlayhead: () => playhead,
    setPlayhead: (p) => (playhead = p),
    getTotalDuration: () => totalDuration,
    getFrameRate: () => project.frameRate,
  });

  const selectionActions = createSelectionActions({
    getSelection: () => selection,
    setSelection: (s) => (selection = s),
    getAllClips: () => allClips,
  });

  const viewportActions = createViewportActions({
    getViewport: () => viewport,
    setViewport: (v) => (viewport = v),
    getTotalDuration: () => totalDuration,
    getPlayheadPosition: () => playhead.position,
  });

  const uiStateActions = createUIStateActions({
    getClipBeingEdited: () => clipBeingEdited,
    setClipBeingEdited: (id) => (clipBeingEdited = id),
    getIsClipInspectorOpen: () => isClipInspectorOpen,
    setIsClipInspectorOpen: (open) => (isClipInspectorOpen = open),
    getIsTrackSettingsOpen: () => isTrackSettingsOpen,
    setIsTrackSettingsOpen: (open) => (isTrackSettingsOpen = open),
    getIsProjectSettingsOpen: () => isProjectSettingsOpen,
    setIsProjectSettingsOpen: (open) => (isProjectSettingsOpen = open),
    selectClip: selectionActions.selectClip,
  });

  // =========================================================================
  // Project Mutations
  // =========================================================================

  function setProjectName(name: string) {
    if (name === project.name) return;
    withUndo("UPDATE_PROJECT", "Rename project", () => {
      project = { ...project, name, updatedAt: new Date() };
      saveProject();
    });
  }

  function setDefaultBpm(bpm: number) {
    if (bpm === project.defaultBpm) return;
    withUndo("UPDATE_PROJECT", "Change project tempo", () => {
      project = { ...project, defaultBpm: bpm, updatedAt: new Date() };
      saveProject();
    });
  }

  function setTimeSignature(timeSignature: TimeSignatureKey) {
    if (timeSignature === project.timeSignature) return;
    withUndo("UPDATE_PROJECT", "Change time signature", () => {
      project = { ...project, timeSignature, updatedAt: new Date() };
      saveProject();
    });
  }

  function setFrameRate(frameRate: 24 | 30 | 60) {
    if (frameRate === project.frameRate) return;
    withUndo("UPDATE_PROJECT", "Change frame rate", () => {
      project = { ...project, frameRate, updatedAt: new Date() };
      saveProject();
    });
  }

  function updateSnapSettings(settings: Partial<SnapSettings>) {
    if (
      Object.entries(settings).every(
        ([key, value]) => project.snap[key as keyof SnapSettings] === value
      )
    )
      return;
    withUndo("UPDATE_PROJECT", "Change snap settings", () => {
      project = {
        ...project,
        snap: { ...project.snap, ...settings },
        updatedAt: new Date(),
      };
      saveProject();
    });
  }

  function loadProject(newProject: TimelineProject) {
    // Deduplicate clips before loading to prevent render errors
    project = withoutUnavailableAudio(deduplicateProjectClips(newProject));
    audioUrl = null;
    editInProgress = false;
    undoManager.clear();
    selection = createDefaultSelectionState();
    playhead = createDefaultPlayheadState();
    saveProject();
  }

  function resetProject() {
    project = createProject();
    audioUrl = null;
    editInProgress = false;
    undoManager.clear();
    selection = createDefaultSelectionState();
    playhead = createDefaultPlayheadState();
    saveProject();
  }

  // =========================================================================
  // Track Mutations
  // =========================================================================

  function addTrack(name?: string): TimelineTrack {
    const newOrder = project.tracks.length;
    const trackName = name ?? `Track ${newOrder + 1}`;
    const track = createTrack(trackName, newOrder);

    return withUndo("ADD_TRACK", `Add track "${trackName}"`, () => {
      project = {
        ...project,
        tracks: [...project.tracks, track],
        updatedAt: new Date(),
      };
      saveProject();
      return track;
    });
  }

  function removeTrack(trackId: string) {
    if (project.tracks.length <= 1) {
      console.warn("Cannot remove last track");
      return;
    }

    const track = project.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const trackName = track.name;

    withUndo("REMOVE_TRACK", `Remove track "${trackName}"`, () => {
      project = {
        ...project,
        tracks: project.tracks
          .filter((t) => t.id !== trackId)
          .map((t, i) => ({ ...t, order: i })),
        updatedAt: new Date(),
      };

      selection = {
        ...selection,
        selectedClipIds: selection.selectedClipIds.filter(
          (id) => !track?.clips.some((c) => c.id === id)
        ),
      };

      saveProject();
    });
  }

  function updateTrack(trackId: string, updates: Partial<TimelineTrack>) {
    const track = project.tracks.find((candidate) => candidate.id === trackId);
    if (
      !track ||
      Object.entries(updates).every(
        ([key, value]) => track[key as keyof TimelineTrack] === value
      )
    )
      return;
    withUndo("UPDATE_TRACK", `Update track "${track.name}"`, () => {
      project = {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId ? { ...t, ...updates } : t
        ),
        updatedAt: new Date(),
      };
      saveProject();
    });
  }

  function setTrackMuted(trackId: string, muted: boolean) {
    updateTrack(trackId, { muted });
  }

  function setTrackSolo(trackId: string, solo: boolean) {
    if (!project.tracks.some((track) => track.id === trackId)) return;
    if (solo) {
      if (
        project.tracks.every((track) => track.solo === (track.id === trackId))
      )
        return;
      withUndo("UPDATE_TRACK", "Solo track", () => {
        project = {
          ...project,
          tracks: project.tracks.map((t) => ({ ...t, solo: t.id === trackId })),
          updatedAt: new Date(),
        };
        saveProject();
      });
    } else {
      updateTrack(trackId, { solo: false });
    }
  }

  function reorderTracks(trackIds: string[]) {
    const reordered = trackIds
      .map((id, i) => {
        const track = project.tracks.find((t) => t.id === id);
        return track ? { ...track, order: i } : null;
      })
      .filter((t): t is TimelineTrack => t !== null);

    if (
      reordered.length !== project.tracks.length ||
      reordered.every(
        (track, index) =>
          track.id === project.tracks[index]?.id &&
          track.order === project.tracks[index]?.order
      )
    )
      return;
    withUndo("REORDER_TRACKS", "Reorder tracks", () => {
      project = { ...project, tracks: reordered, updatedAt: new Date() };
      saveProject();
    });
  }

  // =========================================================================
  // Clip Mutations
  // =========================================================================

  function addClip(
    sequence: SequenceData,
    trackId: string,
    startTime: TimeSeconds,
    options?: Partial<TimelineClip>
  ): TimelineClip {
    const track = project.tracks.find((t) => t.id === trackId);
    if (!track) {
      console.error(`Track ${trackId} not found`);
      trackId = project.tracks[0]?.id ?? "";
    }

    const snappedStart = snapTime(
      startTime,
      project.snap,
      beatMarkerTimes,
      clipEdges,
      playhead.position
    );
    const clip = createClip(sequence, trackId, snappedStart, options);
    const clipName = sequence.word || sequence.name || "clip";

    return withUndo("ADD_CLIP", `Add "${clipName}"`, () => {
      project = {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                clips: [...t.clips, clip].sort(
                  (a, b) => a.startTime - b.startTime
                ),
              }
            : t
        ),
        updatedAt: new Date(),
      };

      saveProject();
      return clip;
    });
  }

  function removeClip(clipId: string) {
    const clip = allClips.find((c) => c.id === clipId);
    if (!clip) return;
    const clipName = clip?.label || clip?.sequence?.name || "clip";

    withUndo("REMOVE_CLIP", `Remove "${clipName}"`, () => {
      project = {
        ...project,
        tracks: project.tracks.map((t) => ({
          ...t,
          clips: t.clips.filter((c) => c.id !== clipId),
        })),
        updatedAt: new Date(),
      };

      selection = {
        ...selection,
        selectedClipIds: selection.selectedClipIds.filter(
          (id) => id !== clipId
        ),
      };

      saveProject();
    });
  }

  function removeSelectedClips() {
    if (selection.selectedClipIds.length === 0) return;

    const count = selection.selectedClipIds.length;
    withUndo(
      "REMOVE_CLIPS",
      `Remove ${count} clip${count > 1 ? "s" : ""}`,
      () => {
        project = {
          ...project,
          tracks: project.tracks.map((t) => ({
            ...t,
            clips: t.clips.filter(
              (c) => !selection.selectedClipIds.includes(c.id)
            ),
          })),
          updatedAt: new Date(),
        };

        selection = { ...selection, selectedClipIds: [] };
        saveProject();
      }
    );
  }

  function updateClip(clipId: string, updates: Partial<TimelineClip>) {
    const clip = allClips.find((candidate) => candidate.id === clipId);
    if (
      !clip ||
      Object.entries(updates).every(
        ([key, value]) => clip[key as keyof TimelineClip] === value
      )
    )
      return;
    withUndo(
      "UPDATE_CLIP",
      `Update "${clip.label || clip.sequence?.name || "clip"}"`,
      () => updateClipWithoutUndo(clipId, updates)
    );
  }

  function updateClipWithoutUndo(
    clipId: string,
    updates: Partial<TimelineClip>
  ) {
    project = {
      ...project,
      tracks: project.tracks.map((t) => ({
        ...t,
        clips: t.clips
          .map((c) => (c.id === clipId ? { ...c, ...updates } : c))
          .sort((a, b) => a.startTime - b.startTime),
      })),
      updatedAt: new Date(),
    };
    saveProject();
  }

  function moveClip(
    clipId: string,
    newStartTime: TimeSeconds,
    newTrackId?: string,
    options?: { skipSnap?: boolean }
  ) {
    // Apply snap unless explicitly skipped (e.g., when caller already snapped)
    const finalTime = options?.skipSnap
      ? newStartTime
      : snapTime(
          newStartTime,
          project.snap,
          beatMarkerTimes,
          clipEdges.filter((t) => {
            const clip = allClips.find((c) => c.id === clipId);
            return clip
              ? t !== clip.startTime && t !== getClipEndTime(clip)
              : true;
          }),
          playhead.position
        );

    const clipToMove = allClips.find((clip) => clip.id === clipId);
    if (
      !clipToMove ||
      (clipToMove.startTime === finalTime &&
        (!newTrackId || newTrackId === clipToMove.trackId))
    )
      return;
    const mutate = () => {
      if (newTrackId && newTrackId !== clipToMove.trackId) {
        const clip = allClips.find((c) => c.id === clipId);
        if (!clip) return;

        project = {
          ...project,
          tracks: project.tracks.map((t) => {
            if (t.id === clip.trackId) {
              return { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
            } else if (t.id === newTrackId) {
              const movedClip = {
                ...clip,
                trackId: newTrackId,
                startTime: finalTime,
              };
              return {
                ...t,
                clips: [...t.clips, movedClip].sort(
                  (a, b) => a.startTime - b.startTime
                ),
              };
            }
            return t;
          }),
          updatedAt: new Date(),
        };
        saveProject();
      } else {
        updateClipWithoutUndo(clipId, { startTime: finalTime });
      }
    };
    if (editInProgress) mutate();
    else withUndo("MOVE_CLIP", "Move clip", mutate);
  }

  function setClipDuration(clipId: string, duration: TimeSeconds) {
    updateClip(clipId, { duration: Math.max(0.1, duration) });
  }

  function setClipInOutPoints(
    clipId: string,
    inPoint: number,
    outPoint: number
  ) {
    updateClip(clipId, {
      inPoint: Math.max(0, Math.min(1, inPoint)),
      outPoint: Math.max(0, Math.min(1, outPoint)),
    });
  }

  function setClipPlaybackRate(clipId: string, rate: number) {
    updateClip(clipId, { playbackRate: Math.max(0.1, Math.min(4, rate)) });
  }

  function setClipLoop(clipId: string, loop: boolean, loopCount: number = 0) {
    updateClip(clipId, { loop, loopCount });
  }

  function duplicateClip(clipId: string): TimelineClip | null {
    const clip = allClips.find((c) => c.id === clipId);
    if (!clip) return null;

    const newClip: TimelineClip = {
      ...clip,
      id: generateClipId(),
      startTime: getClipEndTime(clip),
    };

    const clipName = clip.label || clip.sequence?.name || "clip";

    return withUndo("DUPLICATE_CLIP", `Duplicate "${clipName}"`, () => {
      project = {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === clip.trackId
            ? {
                ...t,
                clips: [...t.clips, newClip].sort(
                  (a, b) => a.startTime - b.startTime
                ),
              }
            : t
        ),
        updatedAt: new Date(),
      };

      saveProject();
      return newClip;
    });
  }

  // =========================================================================
  // Audio Mutations
  // =========================================================================

  function setAudioFile(fileName: string, url: string) {
    if (audioUrl === url && project.audio.fileName === fileName) return;
    withUndo("UPDATE_AUDIO", "Select audio", () => {
      undoManager.trackAudioUrl(url);
      audioUrl = url;
      project = {
        ...project,
        audio: { hasAudio: true, fileName, duration: 0, bpm: null },
        updatedAt: new Date(),
      };
      saveProject();
    });
  }

  function setAudioDuration(duration: TimeSeconds) {
    if (project.audio.duration === duration) return;
    project = {
      ...project,
      audio: { ...project.audio, duration },
      updatedAt: new Date(),
    };
    saveProject();
  }

  function setAudioBpm(bpm: number | null) {
    if (project.audio.bpm === bpm) return;
    withUndo("UPDATE_AUDIO", "Change audio BPM", () => {
      project = {
        ...project,
        audio: { ...project.audio, bpm },
        updatedAt: new Date(),
      };
      saveProject();
    });
  }

  function clearAudio() {
    if (!audioUrl && !project.audio.hasAudio) return;
    withUndo("UPDATE_AUDIO", "Clear audio", () => {
      audioUrl = null;
      project = {
        ...project,
        audio: { hasAudio: false, fileName: null, duration: 0, bpm: null },
        updatedAt: new Date(),
      };
      saveProject();
    });
  }

  function getAudioUrl(): string | null {
    return audioUrl;
  }

  // =========================================================================
  // Drag Handling
  // =========================================================================

  function startDrag(clipId: string, startX: number) {
    const clip = allClips.find((c) => c.id === clipId);
    if (!clip || clip.locked) return;

    isDragging = true;
    dragClipId = clipId;
    dragStartX = startX;
    dragStartTime = clip.startTime;
    beginEdit("MOVE_CLIP", "Move clip");
  }

  function updateDrag(currentX: number) {
    if (!isDragging || !dragClipId) return;

    const deltaX = currentX - dragStartX;
    const deltaTime = deltaX / viewport.pixelsPerSecond;
    const newTime = Math.max(0, dragStartTime + deltaTime);

    moveClip(dragClipId, newTime);
  }

  function endDrag() {
    endEdit();
    isDragging = false;
    dragClipId = null;
    saveProject();
  }

  // =========================================================================
  // Return State Object
  // =========================================================================

  // Clear load error after user has seen it
  function clearLoadError() {
    loadError = null;
  }

  // Undo/Redo operations
  function undo() {
    endEdit();
    const snapshot = undoManager.undo();
    if (snapshot) {
      project = deduplicateProjectClips(snapshot.project);
      audioUrl = snapshot.audioUrl ?? null;
      saveProject();
    }
  }

  function redo() {
    endEdit();
    const snapshot = undoManager.redo();
    if (snapshot) {
      project = deduplicateProjectClips(snapshot.project);
      audioUrl = snapshot.audioUrl ?? null;
      saveProject();
    }
  }

  return {
    // Loading/error state getters
    get isLoading() {
      return isLoading;
    },
    get loadError() {
      return loadError;
    },
    clearLoadError,

    // Undo/redo state getters
    get canUndo() {
      return canUndo;
    },
    get canRedo() {
      return canRedo;
    },
    get undoDescription() {
      return undoDescription;
    },
    get redoDescription() {
      return redoDescription;
    },
    undo,
    redo,
    beginEdit,
    endEdit,

    // Core state getters
    get project() {
      return project;
    },
    get playhead() {
      return playhead;
    },
    get selection() {
      return selection;
    },
    get viewport() {
      return viewport;
    },

    // Derived getters
    get selectedClips() {
      return selectedClips;
    },
    get selectedClip() {
      return selectedClip;
    },
    get allClips() {
      return allClips;
    },
    get totalDuration() {
      return totalDuration;
    },
    get hasSelection() {
      return hasSelection;
    },

    // UI state getters
    get isClipInspectorOpen() {
      return isClipInspectorOpen;
    },
    get isTrackSettingsOpen() {
      return isTrackSettingsOpen;
    },
    get isProjectSettingsOpen() {
      return isProjectSettingsOpen;
    },
    get clipBeingEdited() {
      return clipBeingEdited;
    },
    get isDragging() {
      return isDragging;
    },

    // Project mutations
    setProjectName,
    setDefaultBpm,
    setTimeSignature,
    setFrameRate,
    updateSnapSettings,
    loadProject,
    resetProject,

    // Track mutations
    addTrack,
    removeTrack,
    updateTrack,
    setTrackMuted,
    setTrackSolo,
    reorderTracks,

    // Clip mutations
    addClip,
    removeClip,
    removeSelectedClips,
    updateClip,
    moveClip,
    setClipDuration,
    setClipInOutPoints,
    setClipPlaybackRate,
    setClipLoop,
    duplicateClip,

    // Selection mutations (from extracted module)
    ...selectionActions,

    // Playhead mutations (from extracted module)
    ...playheadActions,

    // Viewport mutations (from extracted module)
    ...viewportActions,

    // Audio mutations
    setAudioFile,
    setAudioDuration,
    setAudioBpm,
    clearAudio,
    getAudioUrl,

    // UI state mutations (from extracted module)
    ...uiStateActions,

    // Drag handling
    startDrag,
    updateDrag,
    endDrag,
  };
}

// ============================================================================
// Singleton Instance
// ============================================================================

let timelineStateInstance: TimelineState | null = null;

export function getTimelineState(): TimelineState {
  if (!timelineStateInstance) {
    timelineStateInstance = createTimelineState();
  }
  return timelineStateInstance;
}

/**
 * Reset the singleton (useful for testing)
 */
export function resetTimelineState(): void {
  timelineStateInstance = null;
}
