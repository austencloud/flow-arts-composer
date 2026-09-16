/**
 * Export Options State Manager
 *
 * Manages export options for the sequence viewer with localStorage persistence.
 * Options are scoped by export type (video/image) and view mode (split/animation).
 */

// Video FPS options
export type VideoFps = 30 | 60 | 120;

// Video resolution options
export type VideoResolution = 720 | 1080 | 2160 | 4320;

// Video quality tier.
// - "standard": one render per output frame, native resolution.
// - "cinema": 2× supersampling + 4× temporal motion blur. 3D exports only.
//             Roughly 4-8× slower than standard but produces a notably
//             smoother, sharper result - the right choice for finished
//             cuts, portfolio pieces, and anything you plan to share.
export type VideoQuality = "standard" | "cinema";

// Effect overrides for video export
export interface EffectOverride {
  fire: boolean;
  led: boolean;
  trails: boolean;
  charcoal: boolean;
}

// Grid step size options (pixels)
export type GridStepSize = 80 | 120 | 160;

// Composite orientation
export type CompositeOrientation = "horizontal" | "vertical";

export interface VideoExportOptions {
  fps: VideoFps;
  loopCount: number;
  resolution: VideoResolution;
  effectOverrides: EffectOverride | null; // null = use viewer state
  includeStartPlacement: boolean;
  includeEndHold: boolean;
  quality: VideoQuality;
}

export interface SplitExportOptions extends VideoExportOptions {
  compositeOrientation: CompositeOrientation;
  gridStepSize: GridStepSize;
  showStepNumbers: boolean;
  includeStartPlacement: boolean;
}

export interface ImageExportOptions {
  includeStartPlacement: boolean;
  showStepNumbers: boolean;
  showWord: boolean;
  showDifficulty: boolean;
  showNotes: boolean;
  showQRCode: boolean;
  darkMode: boolean;
}

/** The full persisted shape. Also the snapshot/replaceAll payload for view-only link sessions (see `setPersistenceSuspended` below). */
export interface ExportOptionsState {
  video: VideoExportOptions;
  split: SplitExportOptions;
  image: ImageExportOptions;
}

const STORAGE_KEY = "tka_export_options";

// Default values
export const DEFAULT_VIDEO_OPTIONS: VideoExportOptions = {
  fps: 60,
  loopCount: 1,
  resolution: 1080,
  effectOverrides: null,
  includeStartPlacement: true,
  includeEndHold: true, // Overridden to false for loopable sequences at runtime
  quality: "standard",
};

export const DEFAULT_SPLIT_OPTIONS: SplitExportOptions = {
  fps: 60,
  loopCount: 1,
  resolution: 1080,
  effectOverrides: null,
  includeStartPlacement: true,
  includeEndHold: true,
  compositeOrientation: "horizontal",
  gridStepSize: 120,
  showStepNumbers: true,
  quality: "standard",
};

export const DEFAULT_IMAGE_OPTIONS: ImageExportOptions = {
  includeStartPlacement: true,
  showStepNumbers: true,
  showWord: true,
  showDifficulty: true,
  showNotes: true,
  showQRCode: true,
  darkMode: true,
};

/**
 * Effects are mutually exclusive. If multiple are persisted from an older
 * version, keep only the first active one.
 */
function sanitizeEffectOverrides(overrides: EffectOverride | null): EffectOverride | null {
  if (!overrides) return null;
  const keys: (keyof EffectOverride)[] = ["fire", "led", "trails", "charcoal"];
  const activeKeys = keys.filter((k) => overrides[k]);
  if (activeKeys.length <= 1) return overrides;
  // Keep only the first active effect
  const sanitized: EffectOverride = { fire: false, led: false, trails: false, charcoal: false };
  sanitized[activeKeys[0]!] = true;
  return sanitized;
}

function loadFromStorage(): ExportOptionsState {
  if (typeof localStorage === "undefined") {
    return {
      video: { ...DEFAULT_VIDEO_OPTIONS },
      split: { ...DEFAULT_SPLIT_OPTIONS },
      image: { ...DEFAULT_IMAGE_OPTIONS },
    };
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<ExportOptionsState>;
      const video = { ...DEFAULT_VIDEO_OPTIONS, ...parsed.video };
      const split = { ...DEFAULT_SPLIT_OPTIONS, ...parsed.split };
      const {
        columnCount: _legacyColumnCount,
        showCreatorName: _legacyCreatorName,
        ...supportedImage
      } = (parsed.image ?? {}) as Partial<ImageExportOptions> & {
        columnCount?: unknown;
        showCreatorName?: unknown;
      };
      // Sanitize any stale multi-effect state
      video.effectOverrides = sanitizeEffectOverrides(video.effectOverrides);
      split.effectOverrides = sanitizeEffectOverrides(split.effectOverrides);
      const loaded = {
        video,
        split,
        image: {
          ...DEFAULT_IMAGE_OPTIONS,
          ...supportedImage,
        },
      };
      if (
        Object.prototype.hasOwnProperty.call(parsed.image ?? {}, "columnCount") ||
        Object.prototype.hasOwnProperty.call(parsed.image ?? {}, "showCreatorName")
      ) {
        saveToStorage(loaded);
      }
      return loaded;
    }
  } catch (e) {
    console.warn("[ExportOptionsState] Failed to load from storage:", e);
  }

  return {
    video: { ...DEFAULT_VIDEO_OPTIONS },
    split: { ...DEFAULT_SPLIT_OPTIONS },
    image: { ...DEFAULT_IMAGE_OPTIONS },
  };
}

function saveToStorage(state: ExportOptionsState): void {
  if (typeof localStorage === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("[ExportOptionsState] Failed to save to storage:", e);
  }
}

/**
 * Public surface of the export-options state manager. Getters are reactive
 * (backed by $state runes); setters persist to localStorage on every call.
 */
export interface ExportOptionsStateManager {
  // Video options (reactive getters)
  readonly videoFps: VideoFps;
  readonly videoLoopCount: number;
  readonly videoResolution: VideoResolution;
  readonly videoEffectOverrides: EffectOverride | null;
  readonly videoIncludeStartPlacement: boolean;
  readonly videoIncludeEndHold: boolean;
  readonly videoQuality: VideoQuality;

  // Split options (reactive getters)
  readonly splitFps: VideoFps;
  readonly splitLoopCount: number;
  readonly splitOrientation: CompositeOrientation;
  readonly splitGridStepSize: GridStepSize;
  readonly splitShowStepNumbers: boolean;
  readonly splitIncludeStartPlacement: boolean;

  // Image options (reactive getters)
  readonly imageIncludeStartPlacement: boolean;
  readonly imageShowStepNumbers: boolean;
  readonly imageShowWord: boolean;
  readonly imageShowDifficulty: boolean;
  readonly imageShowNotes: boolean;
  readonly imageShowQRCode: boolean;
  readonly imageDarkMode: boolean;

  // Video setters
  setVideoFps(fps: VideoFps): void;
  setVideoLoopCount(count: number): void;
  setVideoResolution(res: VideoResolution): void;
  setVideoEffectOverrides(overrides: EffectOverride | null): void;
  setVideoIncludeStartPlacement(include: boolean): void;
  setVideoIncludeEndHold(include: boolean): void;
  setVideoQuality(q: VideoQuality): void;

  // Split setters
  setSplitFps(fps: VideoFps): void;
  setSplitLoopCount(count: number): void;
  setSplitOrientation(orientation: CompositeOrientation): void;
  setSplitGridStepSize(size: GridStepSize): void;
  setSplitShowStepNumbers(show: boolean): void;
  setSplitIncludeStartPlacement(include: boolean): void;

  // Image setters
  setImageIncludeStartPlacement(include: boolean): void;
  setImageShowStepNumbers(show: boolean): void;
  setImageShowWord(show: boolean): void;
  setImageShowDifficulty(show: boolean): void;
  setImageShowNotes(show: boolean): void;
  setImageShowQRCode(show: boolean): void;
  setImageDarkMode(dark: boolean): void;

  // Bulk getters for export functions
  getVideoOptions(): VideoExportOptions;
  getSplitOptions(): SplitExportOptions;
  getImageOptions(): ImageExportOptions;

  resetToDefaults(): void;

  // View-only link sessions (viewer URL state). A shared link borrows this
  // global singleton instead of constructing a parallel instance, because
  // ~8 files (AnimationSettings.svelte, ExportPopover.svelte, PostStudioPane.svelte,
  // PostStudio.svelte, PostShareSheet.svelte, export-orchestrator.ts,
  // export-coordinator.svelte.ts, create-scene-video-export.svelte.ts) call
  // `getExportOptionsState()` directly with no injection seam. Snapshot ->
  // suspend -> replaceAll -> (on close) replaceAll(snapshot) -> resume leaves
  // the recipient's disk untouched.
  setPersistenceSuspended(suspended: boolean): void;
  snapshot(): ExportOptionsState;
  replaceAll(next: ExportOptionsState): void;
}

/**
 * Creates export options state with Svelte 5 runes and localStorage persistence.
 */
export function createExportOptionsState(): ExportOptionsStateManager {
  const stored = loadFromStorage();

  // Video export options (animation-only mode)
  let videoFps = $state<VideoFps>(stored.video.fps);
  let videoLoopCount = $state(stored.video.loopCount);
  let videoResolution = $state<VideoResolution>(stored.video.resolution ?? 1080);
  let videoEffectOverrides = $state<EffectOverride | null>(stored.video.effectOverrides ?? null);
  let videoIncludeStartPlacement = $state(stored.video.includeStartPlacement ?? true);
  let videoIncludeEndHold = $state(stored.video.includeEndHold ?? true);
  let videoQuality = $state<VideoQuality>(stored.video.quality ?? "standard");

  // Split export options (animation + grid composite)
  let splitFps = $state<VideoFps>(stored.split.fps);
  let splitLoopCount = $state(stored.split.loopCount);
  let splitResolution = $state<VideoResolution>(stored.split.resolution ?? 1080);
  let splitEffectOverrides = $state<EffectOverride | null>(stored.split.effectOverrides ?? null);
  let splitOrientation = $state<CompositeOrientation>(stored.split.compositeOrientation);
  let splitGridStepSize = $state<GridStepSize>(stored.split.gridStepSize);
  let splitShowStepNumbers = $state(stored.split.showStepNumbers);
  let splitIncludeStartPlacement = $state(stored.split.includeStartPlacement);
  let splitIncludeEndHold = $state(stored.split.includeEndHold ?? true);

  // Image export options
  let imageIncludeStartPlacement = $state(stored.image.includeStartPlacement);
  let imageShowStepNumbers = $state(stored.image.showStepNumbers);
  let imageShowWord = $state(stored.image.showWord);
  let imageShowDifficulty = $state(stored.image.showDifficulty);
  let imageShowNotes = $state(stored.image.showNotes);
  let imageShowQRCode = $state(stored.image.showQRCode ?? true);
  let imageDarkMode = $state(stored.image.darkMode);

  // A viewer URL link session suspends disk writes while it borrows this
  // singleton (see `setPersistenceSuspended`); a recipient's tweaks during
  // the session stay session-local instead of overwriting their own saved
  // options.
  let persistenceSuspended = false;

  function buildSnapshot(): ExportOptionsState {
    return {
      video: {
        fps: videoFps,
        loopCount: videoLoopCount,
        resolution: videoResolution,
        effectOverrides: videoEffectOverrides,
        includeStartPlacement: videoIncludeStartPlacement,
        includeEndHold: videoIncludeEndHold,
        quality: videoQuality,
      },
      split: {
        fps: splitFps,
        loopCount: splitLoopCount,
        resolution: splitResolution,
        effectOverrides: splitEffectOverrides,
        compositeOrientation: splitOrientation,
        gridStepSize: splitGridStepSize,
        showStepNumbers: splitShowStepNumbers,
        includeStartPlacement: splitIncludeStartPlacement,
        includeEndHold: splitIncludeEndHold,
        quality: "standard",
      },
      image: {
        includeStartPlacement: imageIncludeStartPlacement,
        showStepNumbers: imageShowStepNumbers,
        showWord: imageShowWord,
        showDifficulty: imageShowDifficulty,
        showNotes: imageShowNotes,
        showQRCode: imageShowQRCode,
        darkMode: imageDarkMode,
      },
    };
  }

  // Persist changes on any update
  function persist() {
    if (persistenceSuspended) return;
    saveToStorage(buildSnapshot());
  }

  return {
    // Video options (getters)
    get videoFps() { return videoFps; },
    get videoLoopCount() { return videoLoopCount; },
    get videoResolution() { return videoResolution; },
    get videoEffectOverrides() { return videoEffectOverrides; },
    get videoIncludeStartPlacement() { return videoIncludeStartPlacement; },
    get videoIncludeEndHold() { return videoIncludeEndHold; },
    get videoQuality() { return videoQuality; },

    // Split options (getters)
    get splitFps() { return splitFps; },
    get splitLoopCount() { return splitLoopCount; },
    get splitOrientation() { return splitOrientation; },
    get splitGridStepSize() { return splitGridStepSize; },
    get splitShowStepNumbers() { return splitShowStepNumbers; },
    get splitIncludeStartPlacement() { return splitIncludeStartPlacement; },

    // Image options (getters)
    get imageIncludeStartPlacement() { return imageIncludeStartPlacement; },
    get imageShowStepNumbers() { return imageShowStepNumbers; },
    get imageShowWord() { return imageShowWord; },
    get imageShowDifficulty() { return imageShowDifficulty; },
    get imageShowNotes() { return imageShowNotes; },
    get imageShowQRCode() { return imageShowQRCode; },
    get imageDarkMode() { return imageDarkMode; },

    // Video setters
    setVideoFps(fps: VideoFps) {
      videoFps = fps;
      persist();
    },
    setVideoLoopCount(count: number) {
      videoLoopCount = Math.max(1, Math.min(10, count));
      persist();
    },
    setVideoResolution(res: VideoResolution) {
      videoResolution = res;
      persist();
    },
    setVideoEffectOverrides(overrides: EffectOverride | null) {
      videoEffectOverrides = overrides;
      persist();
    },
    setVideoIncludeStartPlacement(include: boolean) {
      videoIncludeStartPlacement = include;
      persist();
    },
    setVideoIncludeEndHold(include: boolean) {
      videoIncludeEndHold = include;
      persist();
    },
    setVideoQuality(q: VideoQuality) {
      videoQuality = q;
      persist();
    },

    // Split setters
    setSplitFps(fps: VideoFps) {
      splitFps = fps;
      persist();
    },
    setSplitLoopCount(count: number) {
      splitLoopCount = Math.max(1, Math.min(10, count));
      persist();
    },
    setSplitOrientation(orientation: CompositeOrientation) {
      splitOrientation = orientation;
      persist();
    },
    setSplitGridStepSize(size: GridStepSize) {
      splitGridStepSize = size;
      persist();
    },
    setSplitShowStepNumbers(show: boolean) {
      splitShowStepNumbers = show;
      persist();
    },
    setSplitIncludeStartPlacement(include: boolean) {
      splitIncludeStartPlacement = include;
      persist();
    },

    // Image setters
    setImageIncludeStartPlacement(include: boolean) {
      imageIncludeStartPlacement = include;
      persist();
    },
    setImageShowStepNumbers(show: boolean) {
      imageShowStepNumbers = show;
      persist();
    },
    setImageShowWord(show: boolean) {
      imageShowWord = show;
      persist();
    },
    setImageShowDifficulty(show: boolean) {
      imageShowDifficulty = show;
      persist();
    },
    setImageShowNotes(show: boolean) {
      imageShowNotes = show;
      persist();
    },
    setImageShowQRCode(show: boolean) {
      imageShowQRCode = show;
      persist();
    },
    setImageDarkMode(dark: boolean) {
      imageDarkMode = dark;
      persist();
    },

    // Bulk getters for export functions
    getVideoOptions(): VideoExportOptions {
      return {
        fps: videoFps,
        loopCount: videoLoopCount,
        resolution: videoResolution,
        effectOverrides: videoEffectOverrides,
        includeStartPlacement: videoIncludeStartPlacement,
        includeEndHold: videoIncludeEndHold,
        quality: videoQuality,
      };
    },

    getSplitOptions(): SplitExportOptions {
      return {
        fps: splitFps,
        loopCount: splitLoopCount,
        resolution: splitResolution,
        effectOverrides: splitEffectOverrides,
        includeStartPlacement: splitIncludeStartPlacement,
        includeEndHold: splitIncludeEndHold,
        compositeOrientation: splitOrientation,
        gridStepSize: splitGridStepSize,
        showStepNumbers: splitShowStepNumbers,
        quality: "standard",
      };
    },

    getImageOptions(): ImageExportOptions {
      return {
        includeStartPlacement: imageIncludeStartPlacement,
        showStepNumbers: imageShowStepNumbers,
        showWord: imageShowWord,
        showDifficulty: imageShowDifficulty,
        showNotes: imageShowNotes,
        showQRCode: imageShowQRCode,
        darkMode: imageDarkMode,
      };
    },

    resetToDefaults() {
      videoFps = DEFAULT_VIDEO_OPTIONS.fps;
      videoLoopCount = DEFAULT_VIDEO_OPTIONS.loopCount;
      videoResolution = DEFAULT_VIDEO_OPTIONS.resolution;
      videoEffectOverrides = DEFAULT_VIDEO_OPTIONS.effectOverrides;
      videoIncludeStartPlacement = DEFAULT_VIDEO_OPTIONS.includeStartPlacement;
      videoIncludeEndHold = DEFAULT_VIDEO_OPTIONS.includeEndHold;
      videoQuality = DEFAULT_VIDEO_OPTIONS.quality;
      splitFps = DEFAULT_SPLIT_OPTIONS.fps;
      splitLoopCount = DEFAULT_SPLIT_OPTIONS.loopCount;
      splitResolution = DEFAULT_SPLIT_OPTIONS.resolution;
      splitEffectOverrides = DEFAULT_SPLIT_OPTIONS.effectOverrides;
      splitOrientation = DEFAULT_SPLIT_OPTIONS.compositeOrientation;
      splitGridStepSize = DEFAULT_SPLIT_OPTIONS.gridStepSize;
      splitShowStepNumbers = DEFAULT_SPLIT_OPTIONS.showStepNumbers;
      splitIncludeStartPlacement = DEFAULT_SPLIT_OPTIONS.includeStartPlacement;
      splitIncludeEndHold = DEFAULT_SPLIT_OPTIONS.includeEndHold;
      imageIncludeStartPlacement = DEFAULT_IMAGE_OPTIONS.includeStartPlacement;
      imageShowStepNumbers = DEFAULT_IMAGE_OPTIONS.showStepNumbers;
      imageShowWord = DEFAULT_IMAGE_OPTIONS.showWord;
      imageShowDifficulty = DEFAULT_IMAGE_OPTIONS.showDifficulty;
      imageShowNotes = DEFAULT_IMAGE_OPTIONS.showNotes;
      imageShowQRCode = DEFAULT_IMAGE_OPTIONS.showQRCode;
      imageDarkMode = DEFAULT_IMAGE_OPTIONS.darkMode;
      persist();
    },

    setPersistenceSuspended(suspended: boolean) {
      persistenceSuspended = suspended;
    },

    snapshot(): ExportOptionsState {
      return buildSnapshot();
    },

    replaceAll(next: ExportOptionsState) {
      videoFps = next.video.fps;
      videoLoopCount = next.video.loopCount;
      videoResolution = next.video.resolution;
      videoEffectOverrides = next.video.effectOverrides;
      videoIncludeStartPlacement = next.video.includeStartPlacement;
      videoIncludeEndHold = next.video.includeEndHold;
      videoQuality = next.video.quality;
      splitFps = next.split.fps;
      splitLoopCount = next.split.loopCount;
      splitResolution = next.split.resolution;
      splitEffectOverrides = next.split.effectOverrides;
      splitOrientation = next.split.compositeOrientation;
      splitGridStepSize = next.split.gridStepSize;
      splitShowStepNumbers = next.split.showStepNumbers;
      splitIncludeStartPlacement = next.split.includeStartPlacement;
      splitIncludeEndHold = next.split.includeEndHold;
      imageIncludeStartPlacement = next.image.includeStartPlacement;
      imageShowStepNumbers = next.image.showStepNumbers;
      imageShowWord = next.image.showWord;
      imageShowDifficulty = next.image.showDifficulty;
      imageShowNotes = next.image.showNotes;
      imageShowQRCode = next.image.showQRCode;
      imageDarkMode = next.image.darkMode;
      persist();
    },
  };
}

// Singleton for global access (created once per app)
let singletonInstance: ExportOptionsStateManager | null = null;

export function getExportOptionsState(): ExportOptionsStateManager {
  if (!singletonInstance) {
    singletonInstance = createExportOptionsState();
  }
  return singletonInstance;
}
