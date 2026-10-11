import { describe, expect, it, vi } from "vitest";
import { CommandPalette } from "#lib/shared/keyboard/services/command-palette.js";

describe("command palette dynamic actions", () => {
  it("resolves availability and labels when the palette is searched", () => {
    let available = false;
    let actionLabel = "Move clip";
    const palette = new CommandPalette();
    palette.registerCommand({
      id: "action.undo",
      label: "Undo",
      category: "Actions",
      kind: "action",
      keywords: ["undo"],
      available: () => available,
      resolvePresentation: () => ({ label: `Undo: ${actionLabel}` }),
      action: vi.fn(),
    });

    expect(palette.search("undo")).toEqual([]);

    available = true;
    actionLabel = "Delete step";
    expect(palette.search("undo")[0]?.label).toBe("Undo: Delete step");
  });

  it("refuses execution when a dynamic action becomes unavailable", async () => {
    let available = true;
    const action = vi.fn();
    const palette = new CommandPalette();
    palette.registerCommand({
      id: "action.redo",
      label: "Redo",
      category: "Actions",
      kind: "action",
      keywords: ["redo"],
      available: () => available,
      action,
    });

    await palette.executeCommand("action.redo");
    available = false;

    await expect(palette.executeCommand("action.redo")).rejects.toThrow(
      "not available"
    );
    expect(action).toHaveBeenCalledOnce();
  });
});
