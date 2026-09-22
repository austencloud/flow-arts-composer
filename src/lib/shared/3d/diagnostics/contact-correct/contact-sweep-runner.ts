import type { ContactSweepFrame } from "./contact-sweep-metrics";

export interface ContactSweepSample {
  phase: number;
  frame: ContactSweepFrame;
}

export interface ContactSweepRun {
  status: "complete" | "cancelled" | "budget-exhausted" | "failed";
  samples: readonly ContactSweepSample[];
  reason: string | null;
}

export async function runContactCorrectSweep(options: {
  phases: readonly number[];
  sample: (
    phase: number,
    signal: AbortSignal
  ) => Promise<ContactSweepFrame | null>;
  signal?: AbortSignal;
  maxDurationMs?: number;
}): Promise<ContactSweepRun> {
  const startedAt = performance.now();
  const maxDurationMs = options.maxDurationMs ?? 60_000;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  const samples: ContactSweepSample[] = [];
  try {
    for (const phase of options.phases) {
      if (controller.signal.aborted)
        return { status: "cancelled", samples, reason: "cancelled" };
      const remainingMs = maxDurationMs - (performance.now() - startedAt);
      if (remainingMs <= 0)
        return {
          status: "budget-exhausted",
          samples,
          reason: "60-second-budget",
        };
      let timedOut = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let cancelId: ReturnType<typeof setTimeout> | undefined;
      let removeAbortListener: (() => void) | undefined;
      try {
        const result = await new Promise<
          | { type: "frame"; frame: ContactSweepFrame | null }
          | { type: "sample-threw" }
          | { type: "cancelled" }
          | { type: "deadline" }
        >((resolve) => {
          const abort = () => {
            // Let a callback that synchronously aborts and returns its final
            // frame settle first. A callback that honours abort by never
            // resolving still releases on the next task.
            if (!timedOut)
              cancelId = setTimeout(() => resolve({ type: "cancelled" }), 0);
          };
          controller.signal.addEventListener("abort", abort, { once: true });
          removeAbortListener = () =>
            controller.signal.removeEventListener("abort", abort);
          timeoutId = setTimeout(() => {
            timedOut = true;
            controller.abort();
            resolve({ type: "deadline" });
          }, remainingMs);
          void Promise.resolve()
            .then(() => options.sample(phase, controller.signal))
            .then((frame) => resolve({ type: "frame", frame }))
            .catch(() => resolve({ type: "sample-threw" }));
        });
        if (result.type === "deadline")
          return {
            status: "budget-exhausted",
            samples,
            reason: "60-second-budget",
          };
        if (result.type === "cancelled")
          return { status: "cancelled", samples, reason: "cancelled" };
        if (result.type === "sample-threw")
          return { status: "failed", samples, reason: `sample-threw:${phase}` };
        // A synchronous final sample can return just after the absolute
        // deadline. Never append it and accidentally certify an over-budget run.
        if (performance.now() - startedAt >= maxDurationMs)
          return {
            status: "budget-exhausted",
            samples,
            reason: "60-second-budget",
          };
        if (!result.frame)
          return { status: "failed", samples, reason: `no-frame:${phase}` };
        samples.push({ phase, frame: result.frame });
      } catch {
        return { status: "failed", samples, reason: `sample-threw:${phase}` };
      } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        if (cancelId !== undefined) clearTimeout(cancelId);
        removeAbortListener?.();
      }
    }
    if (controller.signal.aborted)
      return { status: "cancelled", samples, reason: "cancelled" };
    if (performance.now() - startedAt >= maxDurationMs)
      return {
        status: "budget-exhausted",
        samples,
        reason: "60-second-budget",
      };
    return { status: "complete", samples, reason: null };
  } finally {
    options.signal?.removeEventListener("abort", cancel);
  }
}
