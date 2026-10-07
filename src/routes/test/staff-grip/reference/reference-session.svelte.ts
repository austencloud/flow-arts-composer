/**
 * The reference videos loaded into the lab and the one clock they share.
 *
 * The timed video, the one whose Post Studio take carries mapped timing, is
 * the clock; without one the first video is, and the performer stays where
 * the lab put it. Files live only for this visit: a browser cannot reopen a
 * local file from a saved name, so Austen picks them again next time.
 */
import { auth } from "$lib/shared/auth/firebase";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  resolveTakeTiming,
  takeTimingStatus,
  type ResolvedTakeTiming,
} from "$lib/shared/media-composition/domain/take-timing";
import { loadPostProject } from "$lib/shared/media-composition/services/post-project-store";
import {
  localTakeKey,
  loadTakeTiming,
} from "$lib/shared/media-composition/services/take-timing-store";

import { findClapSeconds } from "./clap-finder";
import {
  DEFAULT_PRESET_BY_SLOT,
  loadReferenceCamera,
  saveReferenceCamera,
  type SavedReferenceCamera,
} from "./reference-cameras";
import { decodeOpeningAudio } from "./reference-audio";
import {
  adjacentLandingSeconds,
  followerVideoSeconds,
  labPhaseAtVideoSeconds,
} from "./reference-clock";
import { timedTakeForFile, type TimedTake } from "./reference-take";

export const MAX_REFERENCE_VIDEOS = 3;
export const FRAME_SECONDS = 1 / 30;

export type ClapState = "finding" | "found" | "none";

export interface ReferenceVideo {
  key: string;
  name: string;
  url: string;
  clapSeconds: number | null;
  clapState: ClapState;
  manualOffsetSeconds: number;
  durationSeconds: number | null;
  camera: SavedReferenceCamera;
}

export type ReferenceStatus =
  | "empty"
  | "loading"
  | "no-post"
  | "no-timing"
  | "stale"
  | "ready";

export class ReferenceSession {
  videos = $state.raw<ReferenceVideo[]>([]);
  timed = $state.raw<TimedTake | null>(null);
  /** The loaded video whose file is the timed take. */
  timedVideoKey = $state<string | null>(null);
  postFound = $state(false);
  loading = $state(false);
  /** Seconds in the clock video. */
  time = $state(0);
  playing = $state(false);
  speed = $state(1);

  readonly #files = new Map<string, File>();
  // Set by the constructor; declared with a value so the derived fields
  // below, which read it lazily, are initialised after it.
  readonly #getSequence: () => SequenceData | null = () => null;

  constructor(getSequence: () => SequenceData | null) {
    this.#getSequence = getSequence;
  }

  readonly active = $derived(this.videos.length > 0);

  readonly moveBeats = $derived(
    this.#getSequence()?.steps.map((step) => step.duration ?? 1) ?? []
  );

  readonly resolved = $derived.by((): ResolvedTakeTiming | null =>
    this.timed && this.moveBeats.length > 0
      ? resolveTakeTiming(this.timed.timing, this.moveBeats)
      : null
  );

  readonly clockKey = $derived(
    this.timedVideoKey ?? this.videos[0]?.key ?? null
  );

  readonly status = $derived.by((): ReferenceStatus => {
    if (this.videos.length === 0) return "empty";
    if (this.loading) return "loading";
    if (!this.postFound) return "no-post";
    if (!this.timed) return "no-timing";
    if (takeTimingStatus(this.timed.timing, this.moveBeats) === "stale")
      return "stale";
    return "ready";
  });

  readonly labPhase = $derived(
    this.resolved
      ? labPhaseAtVideoSeconds(this.resolved, this.moveBeats, this.time)
      : null
  );

  readonly durationSeconds = $derived(
    this.videos.find((video) => video.key === this.clockKey)?.durationSeconds ??
      0
  );

  /** Where one video should be right now. */
  videoSeconds(video: ReferenceVideo): number {
    const clock = this.videos.find(
      (candidate) => candidate.key === this.clockKey
    );
    if (!clock || video.key === clock.key) return this.time;
    return followerVideoSeconds(this.time, clock, video);
  }

  async addFiles(files: Iterable<File>, sequenceId: string): Promise<void> {
    const room = MAX_REFERENCE_VIDEOS - this.videos.length;
    const added = [...files]
      .filter((file) => file.type.startsWith("video/"))
      .filter((file) => !this.#files.has(localTakeKey(file)))
      .slice(0, Math.max(0, room));
    if (added.length === 0) return;
    const fresh = added.map((file, index): ReferenceVideo => {
      const key = localTakeKey(file);
      this.#files.set(key, file);
      return {
        key,
        name: file.name,
        url: URL.createObjectURL(file),
        clapSeconds: null,
        clapState: "finding",
        manualOffsetSeconds: 0,
        durationSeconds: null,
        camera: loadReferenceCamera(key) ?? {
          presetId:
            DEFAULT_PRESET_BY_SLOT[this.videos.length + index] ?? "front",
          shot: null,
        },
      };
    });
    this.videos = [...this.videos, ...fresh];
    await this.findTimedTake(sequenceId);
    for (const video of fresh) void this.#findClap(video.key);
  }

  /** Reads the post again, e.g. after Austen maps timing in another tab. */
  async findTimedTake(sequenceId: string): Promise<void> {
    this.loading = true;
    try {
      // The post and timing stores key by the signed-in user, whom Firebase
      // restores after the page loads.
      await auth.authStateReady();
      const project = loadPostProject(sequenceId);
      this.postFound = project !== null;
      let timed: TimedTake | null = null;
      let timedVideoKey: string | null = null;
      if (project) {
        for (const video of this.videos) {
          const file = this.#files.get(video.key);
          if (!file) continue;
          timed = timedTakeForFile(
            project,
            file,
            this.moveBeats,
            loadTakeTiming
          );
          if (timed) {
            timedVideoKey = video.key;
            break;
          }
        }
      }
      this.timed = timed;
      this.timedVideoKey = timedVideoKey;
    } finally {
      this.loading = false;
    }
  }

  async #findClap(key: string): Promise<void> {
    const file = this.#files.get(key);
    const decoded = file ? await decodeOpeningAudio(file) : null;
    const clap = decoded
      ? findClapSeconds(decoded.samples, decoded.sampleRate)
      : null;
    this.#update(key, {
      clapSeconds: clap,
      clapState: clap === null ? "none" : "found",
    });
  }

  #update(key: string, patch: Partial<ReferenceVideo>): void {
    this.videos = this.videos.map((video) =>
      video.key === key ? { ...video, ...patch } : video
    );
  }

  setDuration(key: string, seconds: number): void {
    if (Number.isFinite(seconds))
      this.#update(key, { durationSeconds: seconds });
  }

  setManualOffset(key: string, seconds: number): void {
    this.#update(key, { manualOffsetSeconds: seconds });
  }

  setCamera(key: string, camera: SavedReferenceCamera): void {
    saveReferenceCamera(key, camera);
    this.#update(key, { camera });
  }

  remove(key: string, sequenceId: string): void {
    const video = this.videos.find((candidate) => candidate.key === key);
    if (video) URL.revokeObjectURL(video.url);
    this.#files.delete(key);
    this.videos = this.videos.filter((candidate) => candidate.key !== key);
    if (this.videos.length === 0) this.playing = false;
    void this.findTimedTake(sequenceId);
  }

  seek(seconds: number): void {
    this.time = Math.min(Math.max(0, seconds), this.durationSeconds || seconds);
  }

  stepFrame(direction: 1 | -1): void {
    this.playing = false;
    this.seek(this.time + direction * FRAME_SECONDS);
  }

  stepLanding(direction: 1 | -1): void {
    if (!this.resolved) return;
    const next = adjacentLandingSeconds(this.resolved, this.time, direction);
    if (next === null) return;
    this.playing = false;
    this.seek(next);
  }

  dispose(): void {
    for (const video of this.videos) URL.revokeObjectURL(video.url);
    this.#files.clear();
    this.videos = [];
  }
}
