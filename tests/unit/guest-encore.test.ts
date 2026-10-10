import { describe, expect, it } from "vitest";
import {
  createGuestEncoreState,
  GUEST_ENCORE_STORAGE_KEY,
} from "#lib/shared/auth/state/guest-encore-state.svelte.js";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe("guest encore", () => {
  it("requires five encounters and an existing sequence, then an explicit claim", () => {
    const state = createGuestEncoreState(() => memoryStorage());
    expect(state.prompt("one", 4)).toBeNull();
    expect(state.claim("one", 4)).toBe(false);
    expect(state.prompt(null, 20)).toBeNull();
    expect(state.claim(null, 20)).toBe(false);
    expect(state.prompt("one", 5)).toBe("offer");
    expect(state.maxSteps("guest", "one")).toBe(8);
    expect(state.claim("one", 5)).toBe(true);
    expect(state.maxSteps("guest", "one")).toBe(16);
  });

  it("preserves one sequence's allowance across reloads without granting another", () => {
    const storage = memoryStorage();
    const first = createGuestEncoreState(() => storage);
    first.claim("one", 5);
    const restored = createGuestEncoreState(() => storage);
    expect(restored.maxSteps("guest", "one")).toBe(16);
    expect(restored.maxSteps("guest", "two")).toBe(8);
    expect(restored.maxSteps("guest", null)).toBe(8);
    expect(restored.prompt("one", 100)).toBe("limit");
    expect(restored.prompt("two", 100)).toBe("spent");
    expect(restored.claim("two", 100)).toBe(false);
    expect(restored.maxSteps("user", "one")).toBe(64);
    expect(restored.maxSteps("premium", "one")).toBe(64);
  });

  it("notices an exception already claimed in another tab", () => {
    const storage = memoryStorage();
    const first = createGuestEncoreState(() => storage);
    const second = createGuestEncoreState(() => storage);
    expect(first.claim("one", 5)).toBe(true);
    expect(second.claim("two", 5)).toBe(false);
    expect(second.maxSteps("guest", "two")).toBe(8);
  });

  it("ignores malformed saved data and keeps the session working when storage is denied", () => {
    const storage = memoryStorage();
    storage.setItem(GUEST_ENCORE_STORAGE_KEY, "not JSON");
    expect(createGuestEncoreState(() => storage).maxSteps("guest", "one")).toBe(
      8
    );
    storage.setItem(GUEST_ENCORE_STORAGE_KEY, '{"sequenceId":7}');
    expect(createGuestEncoreState(() => storage).maxSteps("guest", "one")).toBe(
      8
    );
    const state = createGuestEncoreState(() => {
      throw new Error("Storage blocked");
    });
    expect(state.claim("one", 5)).toBe(true);
    expect(state.maxSteps("guest", "one")).toBe(16);
    expect(state.claim("two", 20)).toBe(false);
  });
});
