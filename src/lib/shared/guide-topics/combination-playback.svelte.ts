/**
 * Plays the six combination examples on a HandCombinationBoard: the hands
 * glide from their start points and the arrows fade in, as
 * LessonPictographStage plays a move. A cell holds its finished picture
 * between plays, and a hover or tap replays it. `playOnView` plays all six
 * left to right once the board comes into view. Reduced motion and print
 * keep the finished pictures.
 */
import { reducedMotion } from "#lib/shared/transitions/motion.js";
import { startPlacementDeriver } from "#lib/shared/pictograph/shared/services/start-placement-deriver.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import {
  HAND_COMBINATIONS,
  combinationPictographData,
  type HandCombination,
  type HandCombinationId,
} from "./hand-motions-topic.js";

/** Where the example's hands start, for a picture that plays its move. */
function startPose(data: PictographData): PictographData | null {
  try {
    return startPlacementDeriver.deriveFromFirstStep(
      data as unknown as StepData
    ) as unknown as PictographData;
  } catch {
    return null;
  }
}

/**
 * A combination's finished picture plus what a PictographContainer needs to
 * play its move: the start pose and the move as a step (the container plays
 * a move only for a step).
 */
export function combinationMove(combination: HandCombination) {
  const data = combinationPictographData(combination);
  return {
    data,
    start: startPose(data),
    step: createStepData({ ...data, id: data.id }),
  };
}

const PLAY_MS = 1050;
const STAGGER_MS = 350;

export class CombinationPlayback {
  /** A cell's progress from 0 to 1; a cell left out shows its finished picture. */
  progress = $state<Partial<Record<HandCombinationId, number>>>({});
  #startedAt = new Map<HandCombinationId, number>();
  #frame: number | null = null;

  readonly cellProgress = (id: HandCombinationId): number | null =>
    this.progress[id] ?? null;

  readonly replay = (id: HandCombinationId): void => {
    if (reducedMotion() || (this.progress[id] ?? 1) !== 1) return;
    this.#play([id]);
  };

  readonly settle = (): void => {
    this.#startedAt.clear();
    if (this.#frame !== null) cancelAnimationFrame(this.#frame);
    this.#frame = null;
    this.progress = {};
  };

  /** Plays all six once `board` comes into view; returns the cleanup. */
  playOnView(board: HTMLElement): () => void {
    let observer: IntersectionObserver | undefined;
    window.addEventListener("beforeprint", this.settle);
    const cleanup = () => {
      observer?.disconnect();
      window.removeEventListener("beforeprint", this.settle);
      this.settle();
    };
    if (reducedMotion()) return cleanup;
    const ids = HAND_COMBINATIONS.map((combination) => combination.id);
    // The examples wait at their start points until the board is in view.
    for (const id of ids) this.progress[id] = 0;
    observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer?.disconnect();
        this.#play(ids);
      },
      { threshold: 0.35 }
    );
    observer.observe(board);
    return cleanup;
  }

  #play(ids: readonly HandCombinationId[]) {
    const now = performance.now();
    ids.forEach((id, index) => {
      this.#startedAt.set(id, now + index * STAGGER_MS);
      this.progress[id] = 0;
    });
    this.#frame ??= requestAnimationFrame(this.#tick);
  }

  #tick = (now: number) => {
    for (const [id, start] of this.#startedAt) {
      const linear = Math.min(1, Math.max(0, (now - start) / PLAY_MS));
      this.progress[id] = 1 - Math.pow(1 - linear, 3);
      if (linear >= 1) this.#startedAt.delete(id);
    }
    this.#frame =
      this.#startedAt.size > 0 ? requestAnimationFrame(this.#tick) : null;
  };
}
