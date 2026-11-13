/// <reference lib="webworker" />

/**
 * Mandala measure worker: one of the pool `mandala-workers.ts` keeps. It
 * measures sequences, outlines shapes and compares pairs of shapes off the
 * page (`mandala-measure-work.ts` does the work). Plain maths only: no DOM.
 */
import {
  doMandalaWork,
  type MandalaWorkIn,
  type MandalaWorkResult,
} from "../services/mandala-measure-work";

export interface MandalaWorkerRequest {
  id: number;
  task: MandalaWorkIn;
}

export type MandalaWorkerReply =
  | { id: number; type: "progress"; share: number }
  | { id: number; type: "done"; result: MandalaWorkResult }
  | { id: number; type: "error"; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<MandalaWorkerRequest>): void => {
  const { id, task } = event.data;
  try {
    const { result, transfer } = doMandalaWork(task, (share) => {
      const progress: MandalaWorkerReply = { id, type: "progress", share };
      scope.postMessage(progress);
    });
    const done: MandalaWorkerReply = { id, type: "done", result };
    scope.postMessage(done, transfer);
  } catch (error) {
    const failed: MandalaWorkerReply = {
      id,
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    };
    scope.postMessage(failed);
  }
};
