import type { HandLabeling } from "#lib/shared/video-collaboration/domain/hand-labeling.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type {
  CollaborativeVideo,
  StepMap,
} from "#lib/shared/video-collaboration/domain/collaborative-video.js";
import type { SequenceVideosStore } from "#lib/shared/video-collaboration/state/sequence-videos-store.svelte.js";
import {
  createVideoPlayheadBridge,
  type VideoPlayheadBridge,
} from "#lib/shared/sequence-viewer/context/video-playhead-context.js";
import {
  createPerformanceWorkspaceState,
  type PerformanceWorkspaceState,
} from "#lib/shared/sequence-viewer/components/sequence-videos/state/performance-workspace-state.svelte.js";

const sequence = {
  id: "performance-sequence",
  word: "TEST",
  steps: [],
} as unknown as SequenceData;

/** What the viewer shows once the pane's effects have settled. */
export interface ViewerPlayheadSnapshot {
  playbackSource: "animation" | "video";
  activeStepMap: StepMap | null;
  activeHandLabeling: HandLabeling | null;
}

/**
 * `wiring: "viewer"` swaps the recording playhead for the real bridge, hosted
 * the way SequenceViewerShell hosts it: each setter is reached through one
 * derived context object that also carries the values those setters write, so
 * it is rebuilt on every change. A pane effect that subscribes to that object
 * re-runs itself forever, which the recording playhead cannot show.
 */
export function createPerformanceWorkspaceHarness(
  initialVideos: CollaborativeVideo[],
  options: { wiring?: "recording" | "viewer" } = {}
): {
  state: PerformanceWorkspaceState;
  viewer: ViewerPlayheadSnapshot;
  setActive: (active: boolean) => void;
  setUploadRequested: (requested: boolean) => void;
  openChanges: boolean[];
  attachedMaps: Array<StepMap | null>;
  labelings: Array<HandLabeling | null>;
  timingSaved: string[];
  dispose: () => void;
} {
  let active = $state(true);
  let uploadRequested = $state(false);
  let videos = $state([...initialVideos]);
  const openChanges: boolean[] = [];
  const attachedMaps: Array<StepMap | null> = [];
  const labelings: Array<HandLabeling | null> = [];
  const timingSaved: string[] = [];

  const store: SequenceVideosStore = {
    sequenceId: sequence.id!,
    get videos() {
      return videos;
    },
    loading: false,
    error: "",
    load: async () => {},
    reload: async () => {},
    add: (video) => {
      videos = [video, ...videos];
    },
    remove: async (videoId) => {
      videos = videos.filter((video) => video.id !== videoId);
    },
    applyStepMap: async (videoId, stepMap) => {
      videos = videos.map((video) =>
        video.id === videoId ? { ...video, beatMap: stepMap } : video
      );
    },
    applyHandLabeling: async (videoId, handLabeling) => {
      videos = videos.map((video) =>
        video.id === videoId ? { ...video, handLabeling } : video
      );
    },
  };

  let playbackSource = $state<"animation" | "video">("animation");
  let activeStepMap = $state<StepMap | null>(null);
  let activeHandLabeling = $state<HandLabeling | null>(null);
  const viewerContext = $derived.by(() => ({
    playbackSource,
    activeStepMap,
    activeHandLabeling,
    setPlaybackSource: (next: "animation" | "video") => {
      playbackSource = next;
    },
    setActiveStepMap: (next: StepMap | null) => {
      activeStepMap = next;
    },
    setActiveHandLabeling: (next: HandLabeling | null) => {
      activeHandLabeling = next;
    },
    onVideoTimeUpdate: () => {},
  }));

  const recordingPlayhead: VideoPlayheadBridge = {
    attach: (map) => attachedMaps.push(map),
    setHandLabeling: (labeling) => labelings.push(labeling),
    reportTime: () => {},
    registerSeek: () => {},
    seekToStep: () => false,
  };
  const playhead =
    options.wiring === "viewer"
      ? createVideoPlayheadBridge({
          setPlaybackSource: (next) => viewerContext.setPlaybackSource(next),
          setActiveStepMap: (next) => viewerContext.setActiveStepMap(next),
          setActiveHandLabeling: (next) =>
            viewerContext.setActiveHandLabeling(next),
          onVideoTimeUpdate: () => viewerContext.onVideoTimeUpdate(),
        })
      : recordingPlayhead;

  let state!: PerformanceWorkspaceState;
  const dispose = $effect.root(() => {
    state = createPerformanceWorkspaceState(
      {
        getSequence: () => sequence,
        getActive: () => active,
        getUploadRequested: () => uploadRequested,
        onWorkOpenChange: (open) => openChanges.push(open),
      },
      {
        getStore: () => store,
        playhead,
        onTimingSaved: () => timingSaved.push("saved"),
      }
    );
  });

  return {
    state,
    viewer: {
      get playbackSource() {
        return playbackSource;
      },
      get activeStepMap() {
        return activeStepMap;
      },
      get activeHandLabeling() {
        return activeHandLabeling;
      },
    },
    setActive: (next) => {
      active = next;
    },
    setUploadRequested: (next) => {
      uploadRequested = next;
    },
    openChanges,
    attachedMaps,
    labelings,
    timingSaved,
    dispose,
  };
}
