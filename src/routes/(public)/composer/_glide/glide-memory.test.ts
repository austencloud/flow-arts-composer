import { describe, expect, it, vi } from "vitest";
import { createGlideMemory } from "./glide-memory";

describe("createGlideMemory", () => {
  it("holds a place restored before the stage starts until it is taken", () => {
    const memory = createGlideMemory();
    memory.snapshot.restore({ stop: 3, pan: 120 });

    expect(memory.takeRestored()).toEqual({ stop: 3, pan: 120 });
    expect(memory.takeRestored()).toBeNull();
  });

  it("moves a running stage straight to a restored place", () => {
    const memory = createGlideMemory();
    const jump = vi.fn();
    memory.connect({ resting: () => ({ stop: 0, pan: 0 }), jump });

    memory.snapshot.restore({ stop: 2, pan: 40 });

    expect(jump).toHaveBeenCalledWith({ stop: 2, pan: 40 });
    expect(memory.takeRestored()).toBeNull();
  });

  it("captures the running stage's place, and nothing once it stops", () => {
    const memory = createGlideMemory();
    const disconnect = memory.connect({
      resting: () => ({ stop: 4, pan: 75 }),
      jump: vi.fn(),
    });

    expect(memory.snapshot.capture()).toEqual({ stop: 4, pan: 75 });
    disconnect();
    expect(memory.snapshot.capture()).toBeNull();
  });

  it("keeps a newer stage connected when an older one disconnects late", () => {
    const memory = createGlideMemory();
    const older = memory.connect({
      resting: () => ({ stop: 1, pan: 0 }),
      jump: vi.fn(),
    });
    memory.connect({ resting: () => ({ stop: 5, pan: 0 }), jump: vi.fn() });

    older();

    expect(memory.snapshot.capture()).toEqual({ stop: 5, pan: 0 });
  });

  it("ignores an entry saved while the page was plain", () => {
    const memory = createGlideMemory();
    memory.snapshot.restore(null);

    expect(memory.takeRestored()).toBeNull();
  });
});
