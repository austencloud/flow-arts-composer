import { describe, it, expect } from "vitest";
import { DefaultArrowPlacementRepository } from "#lib/shared/pictograph/arrow/positioning/default-override/services/default-arrow-placement-repository.js";

// Persister is unused on the read/local path; a no-op double satisfies the ctor.
const noopPersister = {
  loadAll: async () => [],
  saveValue: async () => {},
  deleteValue: async () => {},
  subscribe: () => () => {},
} as unknown as import("#lib/shared/pictograph/arrow/positioning/default-override/services/default-arrow-placement-persister.js").DefaultArrowPlacementPersister;

describe("default repo per-prop", () => {
  it("local save + getValue round-trip under a prop", () => {
    const repo = new DefaultArrowPlacementRepository(noopPersister);
    repo.saveDefaultLocal("diamond", "fan", "pro", "pro_to_layer1_alpha", "0", [5, 6]);
    expect(repo.getValue("diamond", "fan", "pro", "pro_to_layer1_alpha", "0")).toEqual([5, 6]);
    expect(repo.hasValue("diamond", "fan", "pro", "pro_to_layer1_alpha", "0")).toBe(true);
    expect(repo.getValue("diamond", "staff", "pro", "pro_to_layer1_alpha", "0")).toBeNull();
  });
});
