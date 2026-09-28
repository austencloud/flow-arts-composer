import { untrack } from "svelte";
import type { StaffTipTrack } from "$lib/shared/media-composition/domain/staff-tip-track";
import {
  loadStaffTipTrack,
  saveStaffTipTrack,
} from "$lib/shared/media-composition/services/staff-tip-track-store";

/**
 * Finding the LED staffs in each take: whether it has been done, how far a
 * search has got, and the ends it found. Keyed by the take's key, so two
 * clips cut from one video share one search.
 *
 * A search runs once per video and is saved on this device. Searching again
 * keeps the old ends in use until the new ones are ready.
 */

export type StaffTipStatus =
  /** Looking for saved ends. */
  | "loading"
  /** Nothing saved and no search yet. */
  | "none"
  | "finding"
  | "ready"
  | "failed";

interface Entry {
  status: StaffTipStatus;
  /** 0 to 1 while finding. */
  progress: number;
  track: StaffTipTrack | null;
}

export interface StaffTipAnalysisDeps {
  load(takeKey: string): Promise<StaffTipTrack | null>;
  save(takeKey: string, track: StaffTipTrack): Promise<void>;
  fetchVideo(url: string, signal: AbortSignal): Promise<Blob>;
  analyze(
    video: Blob,
    options: {
      onProgress?: (fraction: number) => void;
      signal?: AbortSignal;
    }
  ): Promise<StaffTipTrack>;
}

/**
 * The tracker reports each pass from 0 to 1. Learning the empty background is
 * short, reading every frame is the wait, and joining the ends is instant.
 */
const PHASE_SPANS = {
  background: [0, 0.15],
  detect: [0.15, 0.98],
  track: [0.98, 1],
} as const;

const defaultDeps: StaffTipAnalysisDeps = {
  load: loadStaffTipTrack,
  save: saveStaffTipTrack,
  async fetchVideo(url, signal) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Could not read the video (${response.status})`);
    return response.blob();
  },
  async analyze(video, options) {
    // The tracker and its decoder load only when someone asks for it.
    const { analyzeStaffTips } = await import(
      "$lib/shared/media-composition/services/staff-tip-analyzer"
    );
    return analyzeStaffTips(video, {
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.onProgress
        ? {
            onProgress: (fraction: number, phase: keyof typeof PHASE_SPANS) => {
              const [from, to] = PHASE_SPANS[phase] ?? [0, 1];
              options.onProgress!(from + (to - from) * fraction);
            },
          }
        : {}),
    });
  },
};

/** Progress moves the bar in whole percents, not once per decoded frame. */
const PROGRESS_STEP = 0.01;

export function createStaffTipAnalysis(deps: StaffTipAnalysisDeps = defaultDeps) {
  // Raw: a track is thousands of numbers read on every painted frame, and
  // entries are only ever replaced whole.
  let entries = $state.raw<Record<string, Entry>>({});
  const searches = new Map<string, AbortController>();

  function set(takeKey: string, patch: Partial<Entry>): void {
    const current = entries[takeKey] ?? {
      status: "none",
      progress: 0,
      track: null,
    };
    entries = { ...entries, [takeKey]: { ...current, ...patch } };
  }

  /** Reads a take's saved ends once. Call from an effect, not while rendering. */
  function ensure(takeKey: string): void {
    if (untrack(() => entries[takeKey])) return;
    set(takeKey, { status: "loading" });
    void deps
      .load(takeKey)
      .catch(() => null)
      .then((track) => {
        // A search that started meanwhile owns the entry now.
        if (untrack(() => entries[takeKey]?.status) !== "loading") return;
        set(takeKey, track ? { status: "ready", track } : { status: "none" });
      });
  }

  async function find(takeKey: string, url: string): Promise<void> {
    searches.get(takeKey)?.abort();
    const search = new AbortController();
    searches.set(takeKey, search);
    set(takeKey, { status: "finding", progress: 0 });
    let shown = 0;
    try {
      const video = await deps.fetchVideo(url, search.signal);
      const track = await deps.analyze(video, {
        signal: search.signal,
        onProgress: (fraction) => {
          if (search.signal.aborted) return;
          if (Math.abs(fraction - shown) < PROGRESS_STEP && fraction < 1) return;
          shown = fraction;
          set(takeKey, { progress: Math.min(1, Math.max(0, fraction)) });
        },
      });
      if (search.signal.aborted) return;
      set(takeKey, { status: "ready", progress: 1, track });
      // In use at once; saving only spares the next visit the wait.
      await deps.save(takeKey, track).catch((error: unknown) => {
        console.warn("[PostStudio] Staff ends not saved:", error);
      });
    } catch (error) {
      if (search.signal.aborted) return;
      console.error("[PostStudio] Staff search failed:", error);
      set(takeKey, { status: "failed", progress: 0 });
    } finally {
      if (searches.get(takeKey) === search) searches.delete(takeKey);
    }
  }

  /** Stops a search; the ends found before it, if any, stay in use. */
  function cancel(takeKey: string): void {
    const search = searches.get(takeKey);
    if (!search) return;
    search.abort();
    searches.delete(takeKey);
    const track = entries[takeKey]?.track ?? null;
    set(takeKey, { status: track ? "ready" : "none", progress: 0 });
  }

  return {
    ensure,
    find,
    cancel,
    status(takeKey: string): StaffTipStatus {
      return entries[takeKey]?.status ?? "loading";
    },
    progress(takeKey: string): number {
      return entries[takeKey]?.progress ?? 0;
    },
    track(takeKey: string): StaffTipTrack | null {
      return entries[takeKey]?.track ?? null;
    },
    dispose(): void {
      for (const search of searches.values()) search.abort();
      searches.clear();
    },
  };
}

export type StaffTipAnalysis = ReturnType<typeof createStaffTipAnalysis>;
