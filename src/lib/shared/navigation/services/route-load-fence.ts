/**
 * Latest-run-wins fencing for an async route bootstrap.
 *
 * A route that resolves its content asynchronously has two ways to write the
 * wrong thing into the page. The run can be superseded — the route parameter
 * changed while a lookup was in flight, so the reply describes the previous
 * URL — or the host can be gone, and a write after teardown is at best wasted.
 *
 * Keying the route component on its parameter forces a remount and covers the
 * common case, but it does not stop a promise the old instance is still holding
 * from resolving and assigning. The fence is the second half: take a run before
 * the first `await`, and check it again after every one.
 *
 *     const run = fence.begin();
 *     const data = await load();
 *     if (fence.isStale(run)) return;
 *     sequence = data;
 *
 * Created rather than reused: a search for `isStale`, `requestToken`,
 * `generation`, and `latest-wins` across `src/lib` found only per-file ad-hoc
 * counters (`loop-explorer-state`, `foreground-message-handler`), none of them
 * a shared owner, and none covering disposal.
 */

export interface RouteLoadFence {
  /** Open a new run, superseding any earlier one. */
  begin(): number;
  /** Whether `run` has been superseded or the host was disposed. */
  isStale(run: number): boolean;
  /** Mark the host gone. Every run is stale from here on. */
  dispose(): void;
  /** The run currently allowed to write. */
  readonly current: number;
}

export function createRouteLoadFence(): RouteLoadFence {
  let current = 0;
  let disposed = false;

  return {
    begin() {
      return ++current;
    },
    isStale(run: number) {
      return disposed || run !== current;
    },
    dispose() {
      disposed = true;
    },
    get current() {
      return current;
    },
  };
}
