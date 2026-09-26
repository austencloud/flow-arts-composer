import { describe, expect, it } from "vitest";
import type { ShortcutContext } from "./types/keyboard-types";
import type { ShortcutWithBinding } from "../services/types";
import {
  buildShortcutCatalog,
  getShortcutContextLabel,
} from "./shortcut-center-catalog";
import { localizeShortcut } from "./shortcut-presentation";
import { setLocale } from "$lib/shared/i18n/i18n.svelte.js";

function item(
  id: string,
  label: string,
  context: ShortcutContext | ShortcutContext[],
  key: string,
  options: {
    description?: string;
    customized?: boolean;
    modifiers?: ShortcutWithBinding["effectiveBinding"]["modifiers"];
  } = {}
): ShortcutWithBinding {
  const modifiers = options.modifiers ?? [];

  return {
    shortcut: {
      id,
      label,
      description: options.description,
      key,
      modifiers,
      context,
      scope: "action",
      priority: "medium",
      preventDefault: true,
      stopPropagation: false,
      action: () => {},
      enabled: true,
    },
    defaultBinding: { key, modifiers },
    effectiveBinding: { key, modifiers },
    customBinding: options.customized ? { keyCombo: key } : null,
    isCustomized: options.customized ?? false,
    isDisabled: false,
  };
}

describe("shortcut center catalog", () => {
  const items = [
    item("global.help", "Keyboard shortcuts", "global", "?"),
    item("create.save", "Save sequence", "create", "s", {
      description: "Save the current sequence",
      customized: true,
    }),
    item("realm.play", "Play scene", "realm", "Space"),
    item("animation.seek", "Seek forward", "animation-panel", "ArrowRight"),
  ];

  it("searches translated shortcut labels after a locale change without changing registration", async () => {
    const registered = item("create.shuffle-prop", "Shuffle Prop", "create", "r", {
      description: "Pick a random prop type",
    });
    try {
      await setLocale("de");
      const german = localizeShortcut(registered);
      expect(german.shortcut.label).toBe("Zufällige Requisite");
      expect(buildShortcutCatalog([german], "all", "create", "zufällige")).toHaveLength(1);
      expect(registered.shortcut.label).toBe("Shuffle Prop");

      await setLocale("en");
      expect(localizeShortcut(registered).shortcut.label).toBe("Shuffle Prop");
    } finally {
      await setLocale("en");
    }
  });

  it("shows global and active-area commands in This area", () => {
    const catalog = buildShortcutCatalog(items, "current", "create", "");

    expect(catalog.map(({ context }) => context)).toEqual(["global", "create"]);
    expect(
      catalog.flatMap(({ items }) => items).map(({ shortcut }) => shortcut.id)
    ).toEqual(["global.help", "create.save"]);
  });

  it("derives Changed from effective customization state", () => {
    const catalog = buildShortcutCatalog(items, "changed", "realm", "");

    expect(catalog.flatMap(({ items }) => items)).toHaveLength(1);
    expect(catalog[0]?.items[0]?.shortcut.id).toBe("create.save");
  });

  it("searches descriptions, contexts, IDs, and readable key names", () => {
    expect(
      buildShortcutCatalog(items, "all", "create", "current sequence")
    ).toHaveLength(1);
    expect(
      buildShortcutCatalog(items, "all", "create", "animation panel")
    ).toHaveLength(1);
    expect(
      buildShortcutCatalog(items, "all", "create", "realm.play")
    ).toHaveLength(1);
    expect(
      buildShortcutCatalog(items, "all", "create", "arrow right")
    ).toHaveLength(1);
  });

  it("can filter the current area to modifier-specific commands", () => {
    const modifierItems = [
      item("create.mirror", "Mirror", "create", "m", {
        modifiers: ["alt"],
      }),
      item("create.save", "Save", "create", "s", {
        modifiers: ["ctrl"],
      }),
    ];

    const catalog = buildShortcutCatalog(
      modifierItems,
      "current",
      "create",
      "Alt+"
    );

    expect(catalog.flatMap(({ items }) => items)).toHaveLength(1);
    expect(catalog[0]?.items[0]?.shortcut.id).toBe("create.mirror");
  });

  it("labels newly registered contexts without requiring an allowlist entry", () => {
    expect(getShortcutContextLabel("future-workspace" as ShortcutContext)).toBe(
      "Future workspace"
    );
  });
});
