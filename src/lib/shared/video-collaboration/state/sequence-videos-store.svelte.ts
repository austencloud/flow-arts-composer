/**
 * sequence-videos-store.svelte.ts
 *
 * One reactive list of performance videos per sequence, shared by every
 * surface that shows them.
 *
 * Before this store existed each surface called getVideosForSequence into its
 * own local state, so an upload in one place never reached the others and a
 * delete left a second list showing a record that no longer existed. Reads go
 * through the cache; writes rewrite the cached array, so a single mutation
 * reaches every mounted consumer.
 */
import {
  deleteVideo,
  getVideosForSequence,
  saveVideo,
  updateStepMap,
  updateHandLabeling,
} from "../services/collaborative-video-manager";
import type {
  CollaborativeVideo,
  StepMap,
} from "../domain/collaborative-video";
import type { HandLabeling } from "../domain/hand-labeling";

/**
 * How many sequences keep a live list. A browse session moves through a lot of
 * sequences and every retained list holds its video records, so the least
 * recently used one is dropped past this point.
 */
const MAX_CACHED_SEQUENCES = 8;

export interface SequenceVideosStore {
  readonly sequenceId: string;
  readonly videos: CollaborativeVideo[];
  readonly loading: boolean;
  /** Empty when the list arrived. A failed load is not an empty gallery. */
  readonly error: string;
  /** Fetches once. Later calls are no-ops while a list is already held. */
  load(): Promise<void>;
  /** Fetches again regardless of what is held. */
  reload(): Promise<void>;
  add(video: CollaborativeVideo): void;
  remove(videoId: string): Promise<void>;
  applyStepMap(videoId: string, stepMap: StepMap): Promise<void>;
  applyHandLabeling(videoId: string, handLabeling: HandLabeling): Promise<void>;
}

function createStore(sequenceId: string): SequenceVideosStore {
  let videos = $state<CollaborativeVideo[]>([]);
  let loading = $state(false);
  let error = $state("");
  let loaded = false;
  let inFlight: Promise<void> | null = null;

  async function fetchList(): Promise<void> {
    loading = true;
    error = "";
    try {
      videos = await getVideosForSequence(sequenceId);
      loaded = true;
    } catch (cause) {
      videos = [];
      error =
        cause instanceof Error
          ? cause.message
          : "Performance videos could not be loaded.";
    } finally {
      loading = false;
      inFlight = null;
    }
  }

  function run(): Promise<void> {
    // Two surfaces mounting at once must not fire two reads.
    inFlight ??= fetchList();
    return inFlight;
  }

  return {
    sequenceId,
    get videos() {
      return videos;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    load() {
      if (loaded && !error) return inFlight ?? Promise.resolve();
      return run();
    },
    reload() {
      loaded = false;
      return run();
    },
    add(video) {
      // Newest first, matching the order getVideosForSequence returns.
      videos = [video, ...videos.filter((held) => held.id !== video.id)];
      loaded = true;
    },
    async remove(videoId) {
      await deleteVideo(videoId);
      videos = videos.filter((held) => held.id !== videoId);
    },
    async applyStepMap(videoId, stepMap) {
      await updateStepMap(videoId, stepMap);
      videos = videos.map((held) =>
        held.id === videoId
          ? { ...held, beatMap: stepMap, updatedAt: new Date() }
          : held
      );
    },
    async applyHandLabeling(videoId, handLabeling) {
      await updateHandLabeling(videoId, handLabeling);
      videos = videos.map((held) =>
        held.id === videoId
          ? { ...held, handLabeling, updatedAt: new Date() }
          : held
      );
    },
  };
}

/** Insertion order is the recency order; re-inserting moves an entry to the end. */
const stores = new Map<string, SequenceVideosStore>();

export function getSequenceVideosStore(
  sequenceId: string
): SequenceVideosStore {
  const held = stores.get(sequenceId);
  if (held) {
    stores.delete(sequenceId);
    stores.set(sequenceId, held);
    return held;
  }

  const store = createStore(sequenceId);
  stores.set(sequenceId, store);

  while (stores.size > MAX_CACHED_SEQUENCES) {
    const oldest = stores.keys().next().value;
    if (oldest === undefined) break;
    stores.delete(oldest);
  }

  return store;
}

/** Saves the record and puts it in the shared list in one step. */
export async function saveSequenceVideo(
  video: CollaborativeVideo
): Promise<void> {
  if (!video.sequenceId) {
    throw new Error("A sequence video must include a sequence association");
  }
  await saveVideo(video);
  getSequenceVideosStore(video.sequenceId).add(video);
}

/** Test seam. Production code never needs this. */
export function resetSequenceVideoStores(): void {
  stores.clear();
}
