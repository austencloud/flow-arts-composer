import type { StripPatternEngine } from "../services/strip-pattern-engine";
import type { PoiDeviceManager } from "../services/poi-device-manager";
import * as poiImageLibrary from "#lib/shared/poi/services/poi-image-library.js";
import type { StripPattern, PatternParams, RGBColor } from "#lib/shared/poi/domain/strip-pattern.js";
import type { PoiDeviceInfo } from "../domain/device-types";
import type { IPatternPreset } from "#lib/shared/poi/domain/pattern-presets.js";
import type { PatternTimeline, PatternClip } from "../domain/pattern-timeline-types";
import type { PoiImageLibraryEntry } from "#lib/shared/poi/domain/poi-image-library-entry.js";
import {
  createEmptyPatternTimeline,
  insertClip as insertPatternClip,
  removePatternClip,
} from "../domain/pattern-timeline-types";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import { libraryState } from "#lib/features/library/state/library-state.svelte.js";
import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";

/**
 * Rich playback state for the LED staff preview. When clips abut and
 * blend mode is on, `secondary` is the outgoing pattern and `blendT`
 * walks from 0 (fully secondary) to 1 (fully primary) across the first
 * `blendSteps` of the incoming clip.
 */
export interface BlendInfo {
  /** The clip currently under the playhead (or the fallback active pattern) */
  readonly primary: StripPattern | null;
  /** The outgoing clip, if we're currently crossfading in from one */
  readonly secondary: StripPattern | null;
  /**
   * Blend progress: 0 = fully secondary (just entered primary),
   *                 1 = fully primary (blend complete).
   * Always 0 when secondary is null.
   */
  readonly blendT: number;
}

const STORAGE_KEY = "tka-poi-settings";
const IMAGE_STORAGE_KEY = "tka-poi-image";
const TIMELINE_STORAGE_KEY = "tka-poi-timeline";
const SEQUENCE_STORAGE_KEY = "tka-poi-sequence-id";

// Clips carry full StripPattern data (Uint8Array of ledCount × frameCount × 3
// bytes). For a typical 16-LED / 180-frame clip that's ~8.6 KB of raw bytes;
// base64-encoded it's ~11.5 KB. A dozen clips fits comfortably in localStorage.
// The main win: surviving Vite hot module reloads during development so a
// half-built sequence isn't wiped every time you tweak a component.

interface SerializedFrame {
  /** base64 of the frame's RGB Uint8Array */
  c: string;
}
interface SerializedPattern {
  ledCount: number;
  frameCount: number;
  frames: SerializedFrame[];
  metadata: StripPattern["metadata"];
}
interface SerializedClip {
  id: string;
  startStep: number;
  endStep: number;
  pattern: SerializedPattern;
  presetId?: string;
  label?: string;
}
interface SerializedTimeline {
  clips: SerializedClip[];
  transition: "hard" | "blend";
  blendSteps?: number;
  totalSteps: number;
  bpm: number;
  /** Schema version so we can migrate or bail on old shapes */
  version: 1;
}

function uint8ToBase64(arr: Uint8Array): string {
  // Chunked to avoid String.fromCharCode.apply stack overflow on very large arrays
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < arr.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      arr.subarray(i, Math.min(i + chunk, arr.length)) as unknown as number[],
    );
  }
  return btoa(binary);
}
function base64ToUint8(b64: string): Uint8Array {
  const s = atob(b64);
  const arr = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i);
  return arr;
}

function serializePattern(p: StripPattern): SerializedPattern {
  return {
    ledCount: p.ledCount,
    frameCount: p.frameCount,
    frames: p.frames.map((f) => ({ c: uint8ToBase64(f.colors) })),
    metadata: { ...p.metadata },
  };
}
function deserializePattern(s: SerializedPattern): StripPattern {
  return {
    ledCount: s.ledCount,
    frameCount: s.frameCount,
    frames: s.frames.map((sf) => ({ colors: base64ToUint8(sf.c) })),
    metadata: { ...s.metadata },
  };
}

function serializeTimeline(
  tl: PatternTimeline,
  totalSteps: number,
  bpm: number,
): SerializedTimeline {
  return {
    clips: tl.clips.map((c) => ({
      id: c.id,
      startStep: c.startStep,
      endStep: c.endStep,
      pattern: serializePattern(c.pattern),
      presetId: c.presetId,
      label: c.label,
    })),
    transition: tl.transition,
    blendSteps: tl.blendSteps,
    totalSteps,
    bpm,
    version: 1,
  };
}
function deserializeTimeline(s: SerializedTimeline): {
  timeline: PatternTimeline;
  totalSteps: number;
  bpm: number;
} {
  return {
    timeline: {
      clips: s.clips.map((c) => ({
        id: c.id,
        startStep: c.startStep,
        endStep: c.endStep,
        pattern: deserializePattern(c.pattern),
        presetId: c.presetId,
        label: c.label,
      })),
      transition: s.transition,
      blendSteps: s.blendSteps,
    },
    totalSteps: s.totalSteps,
    bpm: s.bpm,
  };
}

function saveTimelineToStorage(payload: SerializedTimeline): void {
  try {
    localStorage.setItem(TIMELINE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota exceeded or serialization failed - silently drop. The user's
    // in-memory timeline still works; they just won't get reload survival.
  }
}
function loadTimelineFromStorage(): SerializedTimeline | null {
  try {
    const raw = localStorage.getItem(TIMELINE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SerializedTimeline;
    if (parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

interface PersistedSettings {
  activePresetId: string;
  ledCount: number;
  frameCount: number;
  persistenceDuration: number;
  rpm: number;
  showFullDisc: boolean;
  /** How long one full pattern loop takes on the virtual LED staff, in seconds */
  cycleDuration: number;
  patternParams: PatternParams;
  /** Tracks whether the active pattern came from an image upload */
  hasUploadedImage: boolean;
  uploadedImageName?: string;
}

function loadSettings(): Partial<PersistedSettings> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSettings(settings: PersistedSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* quota exceeded - ignore */ }
}

function saveImageDataUrl(dataUrl: string): void {
  try {
    localStorage.setItem(IMAGE_STORAGE_KEY, dataUrl);
  } catch { /* quota exceeded - too large for localStorage, silently skip */ }
}

function loadImageDataUrl(): string | null {
  try {
    return localStorage.getItem(IMAGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function clearImageDataUrl(): void {
  try {
    localStorage.removeItem(IMAGE_STORAGE_KEY);
  } catch { /* ignore */ }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function dataUrlToImageData(dataUrl: string): Promise<ImageData> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height);
}

export function createPoiState(
  patternEngine: StripPatternEngine,
  deviceManager: PoiDeviceManager,
) {
  const saved = loadSettings();

  // Pattern state
  let activePattern = $state<StripPattern | null>(null);
  // Surfaced to the UI when preset generation throws, so the user gets
  // feedback instead of silently keeping a stale pattern.
  let generationError = $state<string | null>(null);
  let activePresetId = $state<string>(saved.activePresetId ?? "solid");
  let ledCount = $state(saved.ledCount ?? 200);
  let frameCount = $state(saved.frameCount ?? 180);

  // Device state
  let connectedDevices = $state<PoiDeviceInfo[]>([]);
  let uploadProgress = $state<number | null>(null);

  // 3D rendering state
  let persistenceDuration = $state(saved.persistenceDuration ?? 0.12);

  // Spin preview state (persisted here, consumed by PovSpinPreview)
  let rpm = $state(saved.rpm ?? 120);
  let showFullDisc = $state(saved.showFullDisc ?? false);

  // Virtual LED staff preview state - how long one pattern loop takes on a
  // stationary staff. Own-clock playback, independent of sequence beats.
  let cycleDuration = $state(saved.cycleDuration ?? 3.0);

  // Restored from localStorage when present so a half-built sequence
  // survives Vite hot module reloads and full-page refreshes. Clips
  // are serialized by base64-encoding each frame's Uint8Array.
  const savedTimeline = loadTimelineFromStorage();
  const restoredTimeline = savedTimeline ? deserializeTimeline(savedTimeline) : null;

  // One-shot migration: the timeline used to default to `transition: "hard"`,
  // which meant existing users never got a crossfade unless they found the
  // small wave-square toggle. Blend is now the default. On the first load
  // after this migration ships, we upgrade any stored timeline to blend so
  // existing users see the feature working. The MIGRATION_KEY flag makes
  // this run exactly once - future toggles to "hard" are respected.
  const BLEND_MIGRATION_KEY = "tka-poi-blend-default-migration-v1";
  if (restoredTimeline && typeof localStorage !== "undefined") {
    try {
      if (localStorage.getItem(BLEND_MIGRATION_KEY) !== "done") {
        restoredTimeline.timeline = {
          ...restoredTimeline.timeline,
          transition: "blend",
          blendSteps:
            restoredTimeline.timeline.blendSteps &&
            restoredTimeline.timeline.blendSteps > 0
              ? restoredTimeline.timeline.blendSteps
              : 2.0,
        };
        localStorage.setItem(BLEND_MIGRATION_KEY, "done");
      }
    } catch {
      // Storage unavailable - fall back to whatever was restored
    }
  }

  let patternTimeline = $state<PatternTimeline>(
    restoredTimeline?.timeline ?? createEmptyPatternTimeline(),
  );
  // ── Sequence integration (Phase 3a) ──
  // When a real TKA sequence is loaded, `totalSteps` is driven by the
  // sequence's step count. Otherwise the user picks a beat count manually
  // via the Beats scrub, which writes `manualTotalBeats`.
  let loadedSequence = $state<SequenceData | null>(null);
  let loadedSteps = $state<readonly StepData[]>([]);
  let manualTotalBeats = $state(restoredTimeline?.totalSteps ?? 16);
  const totalSteps = $derived(
    loadedSequence && loadedSteps.length > 0
      ? loadedSteps.length
      : manualTotalBeats,
  );
  let bpm = $state(restoredTimeline?.bpm ?? 120);
  let isTimelinePlaying = $state(false);
  /**
   * 0-based fractional beat position of the playhead.
   * Intentionally NOT persisted: resuming mid-beat on reload is jarring,
   * and reading it in the save effect would cause a save per animation
   * frame during playback.
   */
  let playheadBeat = $state(0);

  // Default generation params
  let patternParams = $state<PatternParams>(saved.patternParams ?? {
    primaryColor: { r: 0, g: 255, b: 136 },
    secondaryColor: { r: 59, g: 130, b: 246 },
    speed: 1.0,
    brightness: 1.0,
  });

  // Track whether current pattern is from an uploaded image
  let hasUploadedImage = $state(saved.hasUploadedImage ?? false);
  let uploadedImageName = $state(saved.uploadedImageName ?? "");

  // ── Image library (per-account) ───────────────────────────────────
  // Every upload the user does (via the upload zone or a timeline
  // drop) is also pushed to Firebase Storage + Firestore as a library
  // entry the user can re-apply later. The list streams from Firestore
  // via onSnapshot, so changes from another device or tab show up live.
  let libraryEntries = $state<PoiImageLibraryEntry[]>([]);
  const unsubscribeLibrary = poiImageLibrary.subscribe((entries) => {
    libraryEntries = entries;
  });

  // Reactive "is a user signed in" - reads the authState $state rune so
  // this derived re-evaluates whenever sign-in / sign-out happens.
  const isAuthenticated = $derived(authState.user !== null);

  // Rich playback state for the LED staff. Tracks both the primary
  // (incoming) pattern and, during a crossfade, the secondary (outgoing)
  // pattern plus a 0..1 blend progress. The staff sampler lerps between
  // them per-LED when secondary is non-null.
  const blendInfo = $derived.by<BlendInfo>(() => {
    // Free-run fallback: no clips on the timeline
    if (patternTimeline.clips.length === 0) {
      return { primary: activePattern, secondary: null, blendT: 0 };
    }

    const oneBased = playheadBeat + 1;

    // Find the clip at the current beat. Track its index so we can peek
    // at the previous clip to decide whether we're in a blend-in zone.
    let currentClip: PatternClip | null = null;
    let currentIdx = -1;
    for (let i = 0; i < patternTimeline.clips.length; i++) {
      const c = patternTimeline.clips[i]!;
      if (oneBased >= c.startStep && oneBased < c.endStep + 1) {
        currentClip = c;
        currentIdx = i;
        break;
      }
    }

    // Gap: no clip at this beat → fall back to the free-run pattern
    if (!currentClip) {
      return { primary: activePattern, secondary: null, blendT: 0 };
    }

    // Hard mode or no blend configured
    if (
      patternTimeline.transition !== "blend" ||
      !patternTimeline.blendSteps ||
      patternTimeline.blendSteps <= 0
    ) {
      return { primary: currentClip.pattern, secondary: null, blendT: 0 };
    }

    // Only blend within the first `blendSteps` of the clip
    const progressIntoClip = oneBased - currentClip.startStep;
    if (progressIntoClip >= patternTimeline.blendSteps) {
      return { primary: currentClip.pattern, secondary: null, blendT: 0 };
    }

    // Only blend if the previous clip immediately abuts this one
    const prevClip = currentIdx > 0 ? patternTimeline.clips[currentIdx - 1] : null;
    if (!prevClip || prevClip.endStep + 1 !== currentClip.startStep) {
      return { primary: currentClip.pattern, secondary: null, blendT: 0 };
    }

    const t = Math.max(0, Math.min(1, progressIntoClip / patternTimeline.blendSteps));
    return {
      primary: currentClip.pattern,
      secondary: prevClip.pattern,
      blendT: t,
    };
  });

  // Thin compatibility shim - any component that only needs "what's the
  // current pattern roughly" can keep reading `playbackPattern` without
  // caring about blend details. Currently read by PovSpinPreview (the
  // spinning disc) and LedStaffPreview.
  const playbackPattern = $derived<StripPattern | null>(blendInfo.primary);

  // Persist settings whenever they change
  $effect(() => {
    saveSettings({
      activePresetId,
      ledCount,
      frameCount,
      persistenceDuration,
      rpm,
      showFullDisc,
      cycleDuration,
      patternParams,
      hasUploadedImage,
      uploadedImageName,
    });
  });

  // Persist the pattern timeline whenever its structure changes.
  // Deliberately does NOT read playheadBeat - playhead is ephemeral, and
  // reading it here would save on every animation frame during playback.
  $effect(() => {
    saveTimelineToStorage(serializeTimeline(patternTimeline, totalSteps, bpm));
  });

  // Restore uploaded image on load (runs once)
  if (saved.hasUploadedImage) {
    const storedDataUrl = loadImageDataUrl();
    if (storedDataUrl) {
      dataUrlToImageData(storedDataUrl).then((imgData) => {
        activePattern = patternEngine.fromImage(imgData, ledCount);
        if (activePattern) {
          activePattern.metadata.name = uploadedImageName || "Restored";
          activePattern.metadata.source = "image-upload";
        }
      }).catch(() => {
        // Image restore failed - fall back to preset
        hasUploadedImage = false;
        clearImageDataUrl();
        generateFromPreset();
      });
    } else {
      hasUploadedImage = false;
    }
  }

  function generateFromPreset(): void {
    try {
      activePattern = patternEngine.generate(
        activePresetId, ledCount, frameCount, patternParams
      );
      generationError = null;
      // Switching to a preset clears the persisted image
      hasUploadedImage = false;
      clearImageDataUrl();
    } catch (err) {
      console.error("Pattern generation failed:", err);
      const detail = err instanceof Error ? err.message : String(err);
      generationError = `Couldn't generate the "${activePresetId}" pattern. ${detail}`;
      toast.error(generationError);
    }
  }

  function loadFromImage(imageData: ImageData): void {
    activePattern = patternEngine.fromImage(imageData, ledCount);
    hasUploadedImage = false;
    clearImageDataUrl();
  }

  async function loadFromFile(file: File): Promise<void> {
    const bitmap = await createImageBitmap(file);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    const imgData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    bitmap.close();
    activePattern = patternEngine.fromImage(imgData, ledCount);
    if (activePattern) {
      activePattern.metadata.sourceImagePath = file.name;
      activePattern.metadata.name = file.name.replace(/\.[^.]+$/, "");
    }

    // Persist the image for reload
    try {
      const dataUrl = await fileToDataUrl(file);
      saveImageDataUrl(dataUrl);
      hasUploadedImage = true;
      uploadedImageName = file.name.replace(/\.[^.]+$/, "");
    } catch {
      // If we can't persist the image (too large, etc), that's OK
      hasUploadedImage = false;
    }

    // Fire-and-forget: save a copy to the user's cloud image library.
    // Silent on failure - the in-memory pattern still works even if
    // the user is offline, signed out, or Firebase is unreachable.
    poiImageLibrary.upload(file, "upload-zone").catch((err) => {
      // Non-blocking: the in-memory pattern still works. We log so
      // rules/network/auth issues are visible in devtools - the most
      // common cause of "my image didn't show up in the library" is a
      // Firebase rules mismatch that otherwise fails silently.
      console.warn("[poi] Library upload (upload-zone) failed:", err);
    });
  }

  function toImageData(): ImageData | null {
    if (!activePattern) return null;
    return patternEngine.toImageData(activePattern);
  }

  async function scanDevices(): Promise<void> {
    const devices = await deviceManager.scanAll();
    connectedDevices = devices;
  }

  async function connectDevice(device: PoiDeviceInfo): Promise<void> {
    await deviceManager.connect(device);
    // Refresh device list
    connectedDevices = deviceManager.connections.map((c) => c.deviceInfo);
  }

  async function uploadToDevice(deviceId: string, slot: number = 0): Promise<void> {
    if (!activePattern) return;
    uploadProgress = 0;
    try {
      await deviceManager.uploadPattern(deviceId, activePattern, slot, (pct) => {
        uploadProgress = pct;
      });
    } finally {
      uploadProgress = null;
    }
  }

  async function uploadToAll(slot: number = 0): Promise<void> {
    if (!activePattern) return;
    uploadProgress = 0;
    try {
      await deviceManager.uploadToAll(activePattern, slot, (pct) => {
        uploadProgress = pct;
      });
    } finally {
      uploadProgress = null;
    }
  }


  /**
   * Paint a new clip covering [startStep..endStep], snapshotting the
   * current active pattern. Clamps to the timeline length and rejects
   * if there's no active pattern to snapshot.
   */
  function paintClip(startStep: number, endStep: number): PatternClip | null {
    if (!activePattern) return null;
    const s = Math.max(1, Math.min(totalSteps, Math.round(startStep)));
    const e = Math.max(1, Math.min(totalSteps, Math.round(endStep)));
    const lo = Math.min(s, e);
    const hi = Math.max(s, e);

    // Label: if the active pattern came from an image upload, use the
    // image's filename - the activePresetId may still hold the preset
    // that was selected *before* the image was uploaded, which would
    // be misleading ("Rainbow Sweep" on a clip containing an X image).
    let clipLabel: string;
    if (hasUploadedImage) {
      clipLabel = uploadedImageName || activePattern.metadata.name || "Image";
    } else {
      const presets = patternEngine.getPresets();
      clipLabel =
        presets.find((p) => p.id === activePresetId)?.name ??
        activePattern.metadata.name;
    }

    const clip: PatternClip = {
      id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      startStep: lo,
      endStep: hi,
      pattern: activePattern,
      presetId: hasUploadedImage ? undefined : activePresetId,
      label: clipLabel,
    };

    patternTimeline = insertPatternClip(patternTimeline, clip);
    return clip;
  }

  /**
   * Build a StripPattern from an image file and drop it as a new clip
   * at the given beat range. Does NOT touch the active pattern - this
   * is a pure "add a clip" operation, independent of the left-column
   * authoring state.
   */
  async function dropImageAsClip(
    file: File,
    startStep: number,
    endStep: number,
  ): Promise<PatternClip | null> {
    // Decode the file to ImageData (reuse the same dance as loadFromFile)
    const bitmap = await createImageBitmap(file);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    const imgData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    bitmap.close();

    // Generate a fresh StripPattern - note this is a new pattern object,
    // unrelated to activePattern
    const pattern = patternEngine.fromImage(imgData, ledCount);
    pattern.metadata.name = file.name.replace(/\.[^.]+$/, "");
    pattern.metadata.source = "image-upload";
    pattern.metadata.sourceImagePath = file.name;

    // Clamp + normalize bounds
    const s = Math.max(1, Math.min(totalSteps, Math.round(startStep)));
    const e = Math.max(1, Math.min(totalSteps, Math.round(endStep)));
    const lo = Math.min(s, e);
    const hi = Math.max(s, e);

    const clip: PatternClip = {
      id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      startStep: lo,
      endStep: hi,
      pattern,
      presetId: undefined,
      label: pattern.metadata.name || file.name,
    };

    patternTimeline = insertPatternClip(patternTimeline, clip);

    // Fire-and-forget: save a copy to the user's cloud image library.
    poiImageLibrary.upload(file, "timeline-drop").catch((err) => {
      console.warn("[poi] Library upload (timeline-drop) failed:", err);
    });

    return clip;
  }

  function deleteClip(clipId: string): void {
    patternTimeline = removePatternClip(patternTimeline, clipId);
  }

  function clearTimeline(): void {
    patternTimeline = createEmptyPatternTimeline();
  }

  /**
   * Advance the playhead forward by `dt` seconds of wall-clock time.
   * Wraps around at the end of the timeline so playback loops.
   * Does nothing if playback is paused.
   */
  function advancePlayhead(dt: number): void {
    if (!isTimelinePlaying) return;
    const beatsPerSec = bpm / 60;
    let next = playheadBeat + dt * beatsPerSec;
    if (next >= totalSteps) {
      next = ((next % totalSteps) + totalSteps) % totalSteps;
    }
    playheadBeat = next;
  }

  function setIsTimelinePlaying(v: boolean): void {
    isTimelinePlaying = v;
  }

  function setPlayheadBeat(v: number): void {
    const clamped = Math.max(0, Math.min(totalSteps - 0.0001, v));
    playheadBeat = clamped;
  }

  function setTotalBeats(n: number): void {
    // Ignored while a sequence drives the beat count - the Beats scrub
    // is disabled in that case, so this is a defense-in-depth no-op.
    if (loadedSequence) return;
    manualTotalBeats = Math.max(1, Math.min(128, Math.round(n)));
    if (playheadBeat >= manualTotalBeats) playheadBeat = 0;
  }

  // ── Sequence load / unload ───────────────────────────────────────
  /**
   * Load a TKA sequence into the lab. The timeline's beat count is
   * now derived from the sequence's step count, and any existing
   * clips are clamped/trimmed to the new bounds so none dangle past
   * the end of the shorter sequence.
   */
  function loadSequence(seq: SequenceData, steps: readonly StepData[]): void {
    loadedSequence = seq;
    loadedSteps = steps;
    try {
      localStorage.setItem(SEQUENCE_STORAGE_KEY, seq.id ?? "");
    } catch { /* ignore */ }

    const newMax = Math.max(1, steps.length);
    // Drop clips that start past the new end; trim ones that overhang.
    patternTimeline = {
      ...patternTimeline,
      clips: patternTimeline.clips
        .filter((c) => c.startStep <= newMax)
        .map((c) => ({ ...c, endStep: Math.min(c.endStep, newMax) })),
    };
    if (playheadBeat >= newMax) playheadBeat = 0;
  }

  /**
   * Detach the currently loaded sequence and fall back to the manual
   * abstract-beat mode (the previous `manualTotalBeats` is preserved).
   * Clips painted while the sequence was loaded are kept - they may
   * sit beyond the new bounds, in which case the timeline renderer
   * simply doesn't draw them.
   */
  function unloadSequence(): void {
    loadedSequence = null;
    loadedSteps = [];
    try {
      localStorage.removeItem(SEQUENCE_STORAGE_KEY);
    } catch { /* ignore */ }
    if (playheadBeat >= manualTotalBeats) playheadBeat = 0;
  }

  // ── Session restore: look up the saved sequence ID in libraryState ──
  // The library may not be loaded synchronously on factory creation, so
  // we mirror PhraseEffortLabModule's pattern: trigger a load if needed
  // and use an effect to retry once sequences populate.
  const savedSequenceId = (() => {
    try {
      return localStorage.getItem(SEQUENCE_STORAGE_KEY);
    } catch {
      return null;
    }
  })();

  let hasRestoredSequence = false;
  function tryRestoreSequence(): boolean {
    if (hasRestoredSequence || loadedSequence) return false;
    if (!savedSequenceId) {
      hasRestoredSequence = true;
      return false;
    }
    if (libraryState.sequences.length === 0) return false;

    const saved = libraryState.getSequenceById(savedSequenceId);
    if (!saved) {
      // The saved ID no longer resolves (sequence deleted or library
      // filtered it out). Stop trying so we don't loop forever.
      hasRestoredSequence = true;
      return false;
    }

    hasRestoredSequence = true;
    // LibrarySequence's step data matches SequenceData shape for our
    // read-only use (we only consume `.steps`, `.word`, `.name`, `.id`).
    const seq = saved as unknown as SequenceData;
    loadSequence(seq, seq.steps ?? []);
    return true;
  }

  // Kick off a library load if the user had a sequence selected last
  // time but the library hasn't loaded yet.
  if (savedSequenceId && libraryState.sequences.length === 0) {
    void libraryState.loadSequences();
  }

  // Retry restore whenever the library sequences list changes.
  $effect(() => {
    if (hasRestoredSequence || loadedSequence) return;
    // Reactive read so the effect re-runs when library populates.
    const _seqs = libraryState.sequences;
    if (_seqs.length === 0) return;
    tryRestoreSequence();
  });

  // Synchronous first attempt in case the library is already warm
  // (e.g. returning to the lab tab after visiting the library first).
  tryRestoreSequence();

  function setBpm(n: number): void {
    bpm = Math.max(20, Math.min(300, Math.round(n)));
  }

  /**
   * Flip between hard cuts and blended crossfades at clip boundaries.
   * Mutates via spread so the save effect picks it up and persists.
   */
  function setTransitionMode(mode: "hard" | "blend"): void {
    patternTimeline = { ...patternTimeline, transition: mode };
  }

  /**
   * Set the crossfade length in beats (only honored when transition
   * is "blend"). Clamped to [0.25, 4.0] to match the Fade scrub.
   */
  function setBlendSteps(b: number): void {
    const clamped = Math.max(0.25, Math.min(4.0, b));
    patternTimeline = { ...patternTimeline, blendSteps: clamped };
  }

  // ── Image library actions ────────────────────────────────────────

  /**
   * Load a library entry as the active pattern - same effect as
   * uploading its source file fresh, but without re-hitting Storage
   * for the binary (we already have a URL).
   */
  async function loadFromLibrary(entry: PoiImageLibraryEntry): Promise<void> {
    const imgData = await poiImageLibrary.loadAsImageData(entry);
    activePattern = patternEngine.fromImage(imgData, ledCount);
    if (activePattern) {
      activePattern.metadata.name = entry.name;
      activePattern.metadata.source = "image-upload";
      activePattern.metadata.sourceImagePath = entry.originalFileName;
    }
    hasUploadedImage = true;
    uploadedImageName = entry.name;
    // NOTE: deliberately does NOT overwrite the `tka-poi-image`
    // localStorage entry. The library is the source of truth now -
    // that localStorage slot is a guest-only fallback.
  }

  /**
   * Drop a library entry onto the pattern timeline as a new clip,
   * mirroring the file-drop path but skipping the file-decode step.
   */
  async function dropLibraryEntryAsClip(
    entry: PoiImageLibraryEntry,
    startStep: number,
    endStep: number,
  ): Promise<PatternClip | null> {
    const imgData = await poiImageLibrary.loadAsImageData(entry);
    const pattern = patternEngine.fromImage(imgData, ledCount);
    pattern.metadata.name = entry.name;
    pattern.metadata.source = "image-upload";
    pattern.metadata.sourceImagePath = entry.originalFileName;

    const s = Math.max(1, Math.min(totalSteps, Math.round(startStep)));
    const e = Math.max(1, Math.min(totalSteps, Math.round(endStep)));
    const lo = Math.min(s, e);
    const hi = Math.max(s, e);

    const clip: PatternClip = {
      id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      startStep: lo,
      endStep: hi,
      pattern,
      presetId: undefined,
      label: entry.name,
    };

    patternTimeline = insertPatternClip(patternTimeline, clip);
    return clip;
  }

  async function renameLibraryEntry(id: string, name: string): Promise<void> {
    await poiImageLibrary.rename(id, name);
  }

  async function deleteLibraryEntry(id: string): Promise<void> {
    await poiImageLibrary.deleteEntry(id);
  }

  /**
   * Tear down any live subscriptions. Called by the module root when
   * the POV Pattern Lab is unmounted so we don't leak Firestore
   * listeners across module switches.
   */
  function dispose(): void {
    try {
      unsubscribeLibrary();
    } catch {
      /* ignore */
    }
  }

  return {
    // Getters
    get activePattern() { return activePattern; },
    get generationError() { return generationError; },
    get activePresetId() { return activePresetId; },
    get ledCount() { return ledCount; },
    get frameCount() { return frameCount; },
    get connectedDevices() { return connectedDevices; },
    get uploadProgress() { return uploadProgress; },
    get persistenceDuration() { return persistenceDuration; },
    get rpm() { return rpm; },
    get showFullDisc() { return showFullDisc; },
    get cycleDuration() { return cycleDuration; },
    get patternParams() { return patternParams; },
    get hasUploadedImage() { return hasUploadedImage; },
    get presets(): IPatternPreset[] { return patternEngine.getPresets(); },

    // Timeline
    get patternTimeline() { return patternTimeline; },
    get totalSteps() { return totalSteps; },
    get bpm() { return bpm; },
    get isTimelinePlaying() { return isTimelinePlaying; },
    get playheadBeat() { return playheadBeat; },
    get playbackPattern() { return playbackPattern; },
    get blendInfo() { return blendInfo; },

    // Sequence integration
    get loadedSequence() { return loadedSequence; },
    get loadedSteps() { return loadedSteps; },

    // Image library
    get libraryEntries() { return libraryEntries; },
    get isAuthenticated() { return isAuthenticated; },

    // Setters
    setActivePresetId(id: string) { activePresetId = id; },
    setLedCount(n: number) { ledCount = n; },
    setFrameCount(n: number) { frameCount = n; },
    setPersistenceDuration(s: number) { persistenceDuration = Math.max(0.03, Math.min(1.0, s)); },
    setRpm(v: number) { rpm = v; },
    setShowFullDisc(v: boolean) { showFullDisc = v; },
    setCycleDuration(v: number) { cycleDuration = Math.max(0.2, Math.min(30, v)); },
    setPatternParams(p: PatternParams) { patternParams = p; },
    setPrimaryColor(c: RGBColor) { patternParams = { ...patternParams, primaryColor: c }; },
    setSecondaryColor(c: RGBColor) { patternParams = { ...patternParams, secondaryColor: c }; },

    // Actions
    generateFromPreset,
    clearGenerationError() { generationError = null; },
    loadFromImage,
    loadFromFile,
    toImageData,
    scanDevices,
    connectDevice,
    uploadToDevice,
    uploadToAll,

    // Timeline actions
    paintClip,
    dropImageAsClip,
    deleteClip,
    clearTimeline,
    advancePlayhead,
    setIsTimelinePlaying,
    setPlayheadBeat,
    setTotalBeats,
    setBpm,
    setTransitionMode,
    setBlendSteps,

    // Sequence actions
    loadSequence,
    unloadSequence,

    // Image library actions
    loadFromLibrary,
    dropLibraryEntryAsClip,
    renameLibraryEntry,
    deleteLibraryEntry,

    // Teardown
    dispose,
  };
}

export type PoiState = ReturnType<typeof createPoiState>;
