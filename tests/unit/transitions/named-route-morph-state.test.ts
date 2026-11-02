// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  ignoreViewTransitionSkip,
  runNamedRouteMorph,
} from "../../../src/lib/shared/transitions/named-route-morph-state.svelte";

function rejectedReadyProbe(): {
  ready: Promise<void>;
  catchReady: ReturnType<typeof vi.fn>;
} {
  const catchReady = vi.fn(() => Promise.resolve());
  return {
    ready: { catch: catchReady } as unknown as Promise<void>,
    catchReady,
  };
}

describe("named route morph cancellation", () => {
  it("observes the browser's rejected ready promise without rethrowing", () => {
    const { ready, catchReady } = rejectedReadyProbe();

    ignoreViewTransitionSkip({ ready, finished: Promise.resolve() });

    expect(catchReady).toHaveBeenCalledOnce();
    const ignoreRejection = catchReady.mock.calls[0]?.[0] as
      | ((error: unknown) => unknown)
      | undefined;
    expect(ignoreRejection).toBeTypeOf("function");
    expect(
      ignoreRejection?.(
        new DOMException(
          "Transition was aborted because of invalid state",
          "InvalidStateError"
        )
      )
    ).toBeUndefined();
  });

  it("attaches the cancellation handler as soon as a route morph starts", async () => {
    const { ready, catchReady } = rejectedReadyProbe();

    const transition = runNamedRouteMorph(() => ({
      ready,
      finished: Promise.resolve(),
    }));

    expect(transition.ready).toBe(ready);
    expect(catchReady).toHaveBeenCalledOnce();
    await transition.finished;
  });
});
