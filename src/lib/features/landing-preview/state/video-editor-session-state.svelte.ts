import type { VideoCache } from "#lib/shared/video/services/video-cache.js";
import type {
  CurationProgress,
  LinkingProgress,
  ShowcaseVideo,
  UserProfile,
  VideoCategory,
  VideoStats,
} from "../types";
import type { VideoEditorMode } from "./video-editor-types";

export interface VideoEditorSessionState {
  readonly videos: ShowcaseVideo[];
  readonly categories: VideoCategory[];
  readonly quickPerformers: UserProfile[];
  readonly mode: VideoEditorMode;
  readonly currentVideoShortcode: string | null;
  readonly videoUrl: string | null;
  readonly currentIndex: number;
  readonly saving: boolean;
  readonly currentVideo: ShowcaseVideo | null;
  readonly uncuratedVideos: ShowcaseVideo[];
  readonly unlinkableVideos: ShowcaseVideo[];
  readonly unnamedVideos: ShowcaseVideo[];
  readonly curationProgress: CurationProgress;
  readonly linkingProgress: LinkingProgress;
  readonly renamingProgress: {
    current: number;
    total: number;
    named: number;
  };
  readonly stats: VideoStats;

  setMode(mode: VideoEditorMode): void;
  setCurrentVideoShortcode(shortcode: string | null): void;
  setCurrentIndex(index: number): void;
  setSaving(saving: boolean): void;
  clearVideoUrl(): void;
  updateLocalVideo(shortcode: string, updates: Partial<ShowcaseVideo>): void;
  getVideoList(): ShowcaseVideo[];
  syncVideos(videos: ShowcaseVideo[]): void;
  syncCategories(categories: VideoCategory[]): void;
  syncQuickPerformers(performers: UserProfile[]): void;
}

interface CreateVideoEditorSessionOptions {
  readonly videos: ShowcaseVideo[];
  readonly categories: VideoCategory[];
  readonly quickPerformers: UserProfile[];
  readonly videoCache: VideoCache;
  readonly onVideosUpdate: (videos: ShowcaseVideo[]) => void;
}

export function createVideoEditorSessionState({
  videos: initialVideos,
  categories: initialCategories,
  quickPerformers: initialQuickPerformers,
  videoCache,
  onVideosUpdate,
}: CreateVideoEditorSessionOptions): VideoEditorSessionState {
  let videos = $state(initialVideos);
  let categories = $state(initialCategories);
  let quickPerformers = $state(initialQuickPerformers);
  let mode = $state<VideoEditorMode>("closed");
  let currentVideoShortcode = $state<string | null>(null);
  let videoUrl = $state<string | null>(null);
  let currentIndex = $state(0);
  let saving = $state(false);
  let expectedVideoUrl = $state<string | null>(null);

  const uncuratedVideos = $derived.by(() =>
    videos.filter(
      (video) =>
        !video.excluded && (!video.category || video.performers.length === 0)
    )
  );
  const unlinkableVideos = $derived.by(() =>
    videos.filter(
      (video) =>
        video.title &&
        video.title.length > 0 &&
        video.linkedSequences.length === 0
    )
  );
  const unnamedVideos = $derived.by(() =>
    videos.filter((video) => {
      if (video.excluded) return false;
      if (!video.title || video.title === video.shortcode) return true;
      return /^[A-Za-z0-9_-]{8,}$/.test(video.title);
    })
  );
  const currentVideo = $derived.by((): ShowcaseVideo | null => {
    if (mode === "closed") return null;
    if (currentVideoShortcode) {
      return (
        videos.find((video) => video.shortcode === currentVideoShortcode) ??
        null
      );
    }

    const list = getVideoList();
    if (list.length === 0) return null;
    return list[Math.min(currentIndex, list.length - 1)] ?? null;
  });
  const curationProgress = $derived<CurationProgress>({
    current: currentIndex + 1,
    total: uncuratedVideos.length,
    done: videos.length - uncuratedVideos.length,
  });
  const linkingProgress = $derived<LinkingProgress>({
    current: currentIndex + 1,
    total: unlinkableVideos.length,
    linked: videos.filter((video) => video.linkedSequences.length > 0).length,
  });
  const renamingProgress = $derived({
    current: currentIndex + 1,
    total: unnamedVideos.length,
    named: videos.filter(
      (video) => video.title && !/^[A-Za-z0-9_-]{8,}$/.test(video.title)
    ).length,
  });
  const stats = $derived<VideoStats>({
    total: videos.length,
    featured: videos.filter((video) => video.featured).length,
    categorized: videos.filter((video) => video.category).length,
    uncategorized: videos.filter((video) => !video.category).length,
    withWord: videos.filter((video) => video.title && video.title.length > 0)
      .length,
  });

  $effect(() => {
    if (!currentVideo) {
      expectedVideoUrl = null;
      videoUrl = null;
      return;
    }

    const targetUrl = currentVideo.videoUrl;
    expectedVideoUrl = targetUrl;
    videoUrl = null;
    void videoCache
      .getVideoUrl(targetUrl, { cacheIfMissing: true, priority: 100 })
      .then((url) => {
        if (expectedVideoUrl === targetUrl) videoUrl = url;
      });
  });

  function setMode(nextMode: VideoEditorMode): void {
    mode = nextMode;
  }

  function setCurrentVideoShortcode(shortcode: string | null): void {
    currentVideoShortcode = shortcode;
  }

  function setCurrentIndex(index: number): void {
    currentIndex = index;
  }

  function setSaving(nextSaving: boolean): void {
    saving = nextSaving;
  }

  function clearVideoUrl(): void {
    expectedVideoUrl = null;
    videoUrl = null;
  }

  function updateLocalVideo(
    shortcode: string,
    updates: Partial<ShowcaseVideo>
  ): void {
    const index = videos.findIndex((video) => video.shortcode === shortcode);
    const existingVideo = videos[index];
    if (index === -1 || !existingVideo) return;
    videos[index] = { ...existingVideo, ...updates };
    videos = [...videos];
    onVideosUpdate(videos);
  }

  function getVideoList(): ShowcaseVideo[] {
    if (mode === "curate") return uncuratedVideos;
    if (mode === "link") return unlinkableVideos;
    if (mode === "rename") return unnamedVideos;
    return [];
  }

  function syncVideos(nextVideos: ShowcaseVideo[]): void {
    videos = nextVideos;
  }

  function syncCategories(nextCategories: VideoCategory[]): void {
    categories = nextCategories;
  }

  function syncQuickPerformers(nextPerformers: UserProfile[]): void {
    quickPerformers = nextPerformers;
  }

  return {
    get videos() {
      return videos;
    },
    get categories() {
      return categories;
    },
    get quickPerformers() {
      return quickPerformers;
    },
    get mode() {
      return mode;
    },
    get currentVideoShortcode() {
      return currentVideoShortcode;
    },
    get videoUrl() {
      return videoUrl;
    },
    get currentIndex() {
      return currentIndex;
    },
    get saving() {
      return saving;
    },
    get currentVideo() {
      return currentVideo;
    },
    get uncuratedVideos() {
      return uncuratedVideos;
    },
    get unlinkableVideos() {
      return unlinkableVideos;
    },
    get unnamedVideos() {
      return unnamedVideos;
    },
    get curationProgress() {
      return curationProgress;
    },
    get linkingProgress() {
      return linkingProgress;
    },
    get renamingProgress() {
      return renamingProgress;
    },
    get stats() {
      return stats;
    },
    setMode,
    setCurrentVideoShortcode,
    setCurrentIndex,
    setSaving,
    clearVideoUrl,
    updateLocalVideo,
    getVideoList,
    syncVideos,
    syncCategories,
    syncQuickPerformers,
  };
}
