import { describe, expect, it, vi } from "vitest";
import {
  clearSequenceDeletionIntent,
  isSequenceDeletionIntended,
  markSequenceLocalDeletionComplete,
  runSequencePermanentDeletion,
  runSequencePersistenceMutation,
} from "#lib/shared/library/services/sequence-persistence-coordinator.js";

describe("sequence-persistence-coordinator", () => {
  it("waits for an active save before running permanent deletion", async () => {
    let releaseSave: (() => void) | undefined;
    const order: string[] = [];
    const save = runSequencePersistenceMutation("sequence-1", async () => {
      order.push("save-started");
      await new Promise<void>((resolve) => {
        releaseSave = resolve;
      });
      order.push("save-finished");
    });

    await vi.waitFor(() => expect(releaseSave).toBeTypeOf("function"));

    const deletion = runSequencePermanentDeletion(["sequence-1"], async () => {
      order.push("delete");
    });
    await Promise.resolve();

    expect(order).toEqual(["save-started"]);
    releaseSave?.();
    await Promise.all([save, deletion]);
    expect(order).toEqual(["save-started", "save-finished", "delete"]);
  });

  it("keeps deletion intent until an explicit save clears it", async () => {
    await runSequencePermanentDeletion(["sequence-2"], async () => undefined);

    expect(isSequenceDeletionIntended("sequence-2")).toBe(true);
    expect(localStorage.getItem("tka-sequence-deletion-intents:v1")).toContain(
      "sequence-2"
    );

    markSequenceLocalDeletionComplete(["sequence-2"]);
    expect(isSequenceDeletionIntended("sequence-2")).toBe(true);
    expect(
      localStorage.getItem("tka-sequence-deletion-intents:v1")
    ).not.toContain("sequence-2");

    clearSequenceDeletionIntent("sequence-2");
    expect(isSequenceDeletionIntended("sequence-2")).toBe(false);
  });

  it("queues a later explicit save behind deletion", async () => {
    let releaseDelete: (() => void) | undefined;
    const order: string[] = [];
    const deletion = runSequencePermanentDeletion(["sequence-3"], async () => {
      order.push("delete-started");
      await new Promise<void>((resolve) => {
        releaseDelete = resolve;
      });
      order.push("delete-finished");
    });

    await vi.waitFor(() => expect(releaseDelete).toBeTypeOf("function"));
    clearSequenceDeletionIntent("sequence-3");
    const save = runSequencePersistenceMutation("sequence-3", async () => {
      order.push("save");
    });
    await Promise.resolve();

    expect(order).toEqual(["delete-started"]);
    releaseDelete?.();
    await Promise.all([deletion, save]);
    expect(order).toEqual(["delete-started", "delete-finished", "save"]);
  });
});
