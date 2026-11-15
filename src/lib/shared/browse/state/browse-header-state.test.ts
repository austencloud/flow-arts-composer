import { describe, expect, it } from "vitest";
import type { BrowseEngine } from "#lib/shared/browse/engine/types.js";
import { createBrowseHeaderState } from "./browse-header-state.svelte";

// A leaving screen is frozen until it unmounts, so its registrations stay in
// the slots. `active` is how the bar stops showing them on the tap instead.
describe("browse header slots", () => {
  it("a registration whose screen is leaving reads as empty, and returns when active again", () => {
    const header = createBrowseHeaderState();
    let active = true;
    header.register({ leaf: () => "Spins", active: () => active });
    header.registerSearch({
      placeholder: () => "Search",
      value: () => "",
      onSearch: () => {},
      active: () => active,
    });
    header.registerFilters({
      engine: () => ({}) as BrowseEngine,
      open: () => {},
      active: () => active,
    });

    expect(header.leaf).toBe("Spins");
    expect(header.search).not.toBeNull();
    expect(header.filters).not.toBeNull();

    active = false;
    expect(header.leaf).toBeNull();
    expect(header.search).toBeNull();
    expect(header.filters).toBeNull();

    active = true;
    expect(header.leaf).toBe("Spins");
  });

  it("a registration without `active` always shows", () => {
    const header = createBrowseHeaderState();
    header.register({ leaf: () => "Spins" });
    expect(header.leaf).toBe("Spins");
  });
});
