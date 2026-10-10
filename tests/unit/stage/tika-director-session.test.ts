import { describe, expect, it, vi } from "vitest";
import { createTikaDirectorSession } from "#lib/features/stage/state/tika-director-session.js";
import type { TikaDirectorResponse } from "#lib/features/stage/domain/tika-director.js";

const response: TikaDirectorResponse = {
  kind: "apply",
  summary: "Applied distinct props.",
  actions: [{ type: "assign-distinct-props" }],
};

function deferred() {
  let resolve!: (value: TikaDirectorResponse) => void;
  const promise = new Promise<TikaDirectorResponse>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("TIKA scene request ownership", () => {
  it("rejects a result after authored scene state changes", async () => {
    let revision = "before";
    const session = createTikaDirectorSession({
      getRevision: () => revision,
      isDisposed: () => false,
    });
    const pending = deferred();
    const apply = vi.fn();
    const result = session.execute(
      () => pending.promise,
      apply,
      new AbortController().signal
    );
    revision = "edited";
    pending.resolve(response);
    await expect(result).rejects.toThrow("scene changed");
    expect(apply).not.toHaveBeenCalled();
  });

  it("does not apply an aborted request even when its resolver ignores cancellation", async () => {
    const session = createTikaDirectorSession({
      getRevision: () => "same",
      isDisposed: () => false,
    });
    const pending = deferred();
    const controller = new AbortController();
    const apply = vi.fn();
    const result = session.execute(
      () => pending.promise,
      apply,
      controller.signal
    );
    controller.abort();
    pending.resolve(response);
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(apply).not.toHaveBeenCalled();
  });

  it("does not apply to a disposed Stage", async () => {
    let disposed = false;
    const session = createTikaDirectorSession({
      getRevision: () => "same",
      isDisposed: () => disposed,
    });
    const pending = deferred();
    const apply = vi.fn();
    const result = session.execute(
      () => pending.promise,
      apply,
      new AbortController().signal
    );
    disposed = true;
    pending.resolve(response);
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(apply).not.toHaveBeenCalled();
  });

  it("refuses to pop history after an intervening edit", async () => {
    let revision = "before";
    const session = createTikaDirectorSession({
      getRevision: () => revision,
      isDisposed: () => false,
    });
    const undo = vi.fn();
    const result = await session.execute(
      async () => response,
      () => {
        revision = "tika-applied";
        return undo;
      },
      new AbortController().signal
    );
    revision = "manual-edit";
    expect(result.undo?.()).toBe(false);
    expect(undo).not.toHaveBeenCalled();
  });

  it("undoes its unchanged operation only once", async () => {
    const session = createTikaDirectorSession({
      getRevision: () => "same",
      isDisposed: () => false,
    });
    const undo = vi.fn();
    const result = await session.execute(
      async () => response,
      () => undo,
      new AbortController().signal
    );
    expect(result.undo?.()).toBe(true);
    expect(result.undo?.()).toBe(false);
    expect(undo).toHaveBeenCalledTimes(1);
  });
});
