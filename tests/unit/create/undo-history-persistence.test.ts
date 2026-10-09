// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/environment", () => ({
  browser: true,
  dev: true,
  building: false,
  version: "test",
}));

const { UndoManager, UndoOperationType } =
  await import("$lib/features/create/shared/services/undo-manager");

const UNDO_KEY = "tka_build_undo_history";

function snapshot(timestamp: number) {
  return {
    sequence: null,
    selectedStepNumber: null,
    activeSection: "generate" as const,
    timestamp,
  };
}

describe("Create undo history persistence", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("writes after the tap, once for a burst of changes", () => {
    vi.useFakeTimers();
    const manager = new UndoManager();
    const write = vi.spyOn(Storage.prototype, "setItem");

    manager.pushUndo(UndoOperationType.GENERATE_SEQUENCE, snapshot(1));
    manager.pushUndo(UndoOperationType.GENERATE_SEQUENCE, snapshot(2));
    manager.undo();

    expect(write).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(write).toHaveBeenCalledTimes(2);
    expect(JSON.parse(localStorage.getItem(UNDO_KEY) ?? "[]")).toHaveLength(1);
  });

  it("flushes a queued write when the page goes away", () => {
    vi.useFakeTimers();
    const manager = new UndoManager();

    manager.pushUndo(UndoOperationType.GENERATE_SEQUENCE, snapshot(1));
    window.dispatchEvent(new Event("pagehide"));

    expect(JSON.parse(localStorage.getItem(UNDO_KEY) ?? "[]")).toHaveLength(1);
  });
});
