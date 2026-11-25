// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "fuse-recipe-panel";

async function loadPanel() {
  vi.resetModules();
  return (await import("#lib/features/fuse/state/fuse-recipe-panel.svelte.js"))
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
    panel.destination = "start";
    panel.open = true;
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}")).toEqual({
      open: true,
      content: "recipe",
      destination: "start",
      side: "left",
      section: "effects",
    });

    panel.side = "right";
    panel.section = "display";
    panel.open = false;
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}")).toEqual({
      open: false,
      content: "recipe",
      destination: "start",
      side: "right",
      section: "display",
    });
  });

  it("brings back whose settings were open", async () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ open: true, destination: "start", side: "right" })
    );
    const panel = await loadPanel();
    expect(panel.side).toBe("right");
  });

  // Customize shares the hand-settings column, so a reload has to bring back
  // which of the two was open, and anything else falls back to hand settings.
  it("brings back Customize and its page, and only a content it knows", async () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ open: true, content: "customize", section: "display" })
    );
    const panel = await loadPanel();
    expect(panel.content).toBe("customize");
    expect(panel.section).toBe("display");

    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ open: true, content: "mystery", section: "mystery" })
    );
    const unknown = await loadPanel();
    expect(unknown.content).toBe("recipe");
    expect(unknown.section).toBe("effects");
  });
});
