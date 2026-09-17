import { beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "fuse-recipe-panel";

async function loadPanel() {
  vi.resetModules();
  return (await import("$lib/features/fuse/state/fuse-recipe-panel.svelte"))
    .fuseRecipePanel;
}

describe("fuseRecipePanel", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("starts shut with no editor when nothing is stored", async () => {
    const panel = await loadPanel();
    expect(panel.open).toBe(false);
    expect(panel.destination).toBeNull();
  });

  it("restores an open editor from sessionStorage", async () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ open: true, destination: "pairing" })
    );
    const panel = await loadPanel();
    expect(panel.open).toBe(true);
    expect(panel.destination).toBe("pairing");
  });

  it("ignores a destination it does not know", async () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ open: true, destination: "mystery" })
    );
    const panel = await loadPanel();
    expect(panel.open).toBe(true);
    expect(panel.destination).toBeNull();
  });

  it("survives unreadable storage", async () => {
    sessionStorage.setItem(STORAGE_KEY, "{not json");
    const panel = await loadPanel();
    expect(panel.open).toBe(false);
    expect(panel.destination).toBeNull();
  });

  it("writes every change back", async () => {
    const panel = await loadPanel();
    panel.destination = "grid";
    panel.open = true;
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}")).toEqual({
      open: true,
      destination: "grid",
    });

    panel.open = false;
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}")).toEqual({
      open: false,
      destination: "grid",
    });
  });
});
