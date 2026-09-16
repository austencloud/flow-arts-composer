import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type {
  CollaborativeVideo,
  StepMap,
} from "$lib/shared/video-collaboration/domain/collaborative-video";
import type { SequenceVideosStore } from "$lib/shared/video-collaboration/state/sequence-videos-store.svelte";
import {
  getStepIndexFromVideo,
  passCountFromStepMap,
  passNumberFromVideo,
} from "$lib/shared/video-collaboration/utils/step-map-utils";
import {
  resolveHandLabeling,
  type HandLabeling,
} from "$lib/shared/video-collaboration/domain/hand-labeling";
import type { VideoPlayheadBridge } from "../../../context/video-playhead-context";

export type PerformanceWorkspaceView = "browse" | "upload" | "map";

interface PerformanceWorkspaceInputs {
  getSequence: () => SequenceData;
  getActive: () => boolean;
  getUploadRequested: () => boolean;
  onWorkOpenChange?: (open: boolean) => void;
}

interface PerformanceWorkspaceDependencies {
  getStore: (sequenceId: string) => SequenceVideosStore;
  playhead: VideoPlayheadBridge | null;
  onTimingSaved: () => void;
}

export function createPerformanceWorkspaceState(
  inputs: PerformanceWorkspaceInputs,
  dependencies: PerformanceWorkspaceDependencies
) {
  let mappingVideoId = $state<string | null>(null);
  let selectedVideoId = $state<string | null>(null);
  let pendingDeleteId = $state<string | null>(null);
  let isDeleting = $state(false);
  let deleteError = $state("");
  let videoAspectRatios = $state<Record<string, number>>({});
  let playerTime = $state(0);
  let activePlayer = $state<HTMLVideoElement | null>(null);

  const store = $derived(dependencies.getStore(inputs.getSequence()?.id ?? ""));
  const videos = $derived(store.videos);
  const view = $derived<PerformanceWorkspaceView>(
    mappingVideoId ? "map" : inputs.getUploadRequested() ? "upload" : "browse"
  );
  const selectedVideo = $derived(
    videos.find((video) => video.id === selectedVideoId) ?? null
  );
  const pendingDeleteVideo = $derived(
    videos.find((video) => video.id === pendingDeleteId) ?? null
  );
  const mappingVideo = $derived(
    videos.find((video) => video.id === mappingVideoId) ?? null
  );
  const selectedVideoAspectRatio = $derived(
    selectedVideo ? (videoAspectRatios[selectedVideo.id] ?? 16 / 9) : 16 / 9
  );
  const activeMap = $derived(
    inputs.getActive() && view === "browse"
      ? (selectedVideo?.beatMap ?? null)
      : null
  );

  $effect(() => {
    const sequence = inputs.getSequence();
    if (!inputs.getActive() || !sequence?.id) return;
    void store.load();
  });

  // Selection follows the collection. Deleting the active take lands on the
  // next real performance instead of leaving the stage pointed at nothing.
  $effect(() => {
    const list = store.videos;
    if (list.length === 0) {
      selectedVideoId = null;
      return;
    }
    if (!list.some((video) => video.id === selectedVideoId)) {
      selectedVideoId = list[0]!.id;
    }
  });

  $effect(() => {
    if (inputs.getActive()) return;
    mappingVideoId = null;
    activePlayer?.pause();
  });

  $effect(() => {
    const map = activeMap;
    dependencies.playhead?.attach(map ?? null);
    playerTime = 0;
    return () => dependencies.playhead?.attach(null);
  });

  // Separate from the attach effect above: re-attaching resets the playhead
  // (map, time, playback source), so a labeling-only change - such as
  // toggling "Mirror me" on a paused video - must not re-run attach.
  $effect(() => {
    const labeling =
      inputs.getActive() && view === "browse" && selectedVideo
        ? resolveHandLabeling(selectedVideo)
        : null;
    dependencies.playhead?.setHandLabeling(labeling);
    return () => dependencies.playhead?.setHandLabeling(null);
  });

  $effect(() => {
    const player = activePlayer;
    const enabled = inputs.getActive() && view === "browse" && player !== null;
    if (!enabled) {
      player?.pause();
      dependencies.playhead?.registerSeek(null);
      return;
    }

    dependencies.playhead?.registerSeek((seconds) => {
      player.currentTime = seconds;
      playerTime = seconds;
    });
    return () => dependencies.playhead?.registerSeek(null);
  });

  const playheadLabel = $derived.by(() => {
    if (!activeMap) return "";
    const step = getStepIndexFromVideo(playerTime, activeMap);
    if (step < 0) return "";
    const move = `Move ${step + 1}`;
    if (passCountFromStepMap(activeMap) < 2) return move;
    return `${move} · pass ${passNumberFromVideo(playerTime, activeMap)}`;
  });

  function selectVideo(videoId: string): void {
    selectedVideoId = videoId;
  }

  function rememberVideoAspectRatio(
    videoId: string,
    width: number,
    height: number
  ): void {
    if (width <= 0 || height <= 0) return;
    const aspectRatio = width / height;
    if (
      !Number.isFinite(aspectRatio) ||
      videoAspectRatios[videoId] === aspectRatio
    )
      return;
    videoAspectRatios = { ...videoAspectRatios, [videoId]: aspectRatio };
  }

  function adoptPlayer(player: HTMLVideoElement | null): void {
    activePlayer = player;
  }

  function reportPlayerTime(seconds: number): void {
    if (!inputs.getActive()) return;
    playerTime = seconds;
    dependencies.playhead?.reportTime(seconds);
  }

  function requestUpload(): void {
    inputs.onWorkOpenChange?.(true);
  }

  function startMapping(videoId: string): void {
    mappingVideoId = videoId;
    inputs.onWorkOpenChange?.(true);
  }

  function returnToBrowsing(): void {
    mappingVideoId = null;
    inputs.onWorkOpenChange?.(false);
  }

  function handleUploaded(video: CollaborativeVideo): void {
    selectedVideoId = video.id;
    returnToBrowsing();
  }

  async function saveStepMap(stepMap: StepMap): Promise<void> {
    if (!mappingVideo) return;
    await store.applyStepMap(mappingVideo.id, stepMap);
    dependencies.onTimingSaved();
    returnToBrowsing();
  }

  // The manager already toasts a failed write, and the control reads its
  // value straight from the stored record, so a rejection here only needs to
  // stop short of an unhandled rejection - the control snaps back on its own.
  async function persistHandLabeling(labeling: HandLabeling): Promise<void> {
    if (!selectedVideo) return;
    try {
      await store.applyHandLabeling(selectedVideo.id, labeling);
    } catch {
      // Already surfaced to the user by the store/manager.
    }
  }

  function requestDelete(videoId: string): void {
    deleteError = "";
    pendingDeleteId = videoId;
  }

  function cancelDelete(): void {
    pendingDeleteId = null;
    deleteError = "";
  }

  async function confirmDelete(): Promise<void> {
    const id = pendingDeleteId;
    if (!id) return;
    isDeleting = true;
    deleteError = "";
    try {
      await store.remove(id);
      pendingDeleteId = null;
    } catch (error) {
      deleteError =
        error instanceof Error
          ? error.message
          : "That performance could not be deleted.";
    } finally {
      isDeleting = false;
    }
  }

  return {
    get active() {
      return inputs.getActive();
    },
    get view() {
      return view;
    },
    get store() {
      return store;
    },
    get videos() {
      return videos;
    },
    get selectedVideo() {
      return selectedVideo;
    },
    get selectedVideoAspectRatio() {
      return selectedVideoAspectRatio;
    },
    get mappingVideo() {
      return mappingVideo;
    },
    get pendingDeleteVideo() {
      return pendingDeleteVideo;
    },
    get isDeleting() {
      return isDeleting;
    },
    get deleteError() {
      return deleteError;
    },
    get playheadLabel() {
      return playheadLabel;
    },
    selectVideo,
    rememberVideoAspectRatio,
    adoptPlayer,
    reportPlayerTime,
    requestUpload,
    startMapping,
    returnToBrowsing,
    handleUploaded,
    saveStepMap,
    persistHandLabeling,
    requestDelete,
    cancelDelete,
    confirmDelete,
  };
}

export type PerformanceWorkspaceState = ReturnType<
  typeof createPerformanceWorkspaceState
>;
