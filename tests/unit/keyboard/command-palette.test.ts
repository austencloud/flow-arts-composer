import { describe, expect, it, vi } from "vitest";
import type { CommandPaletteItem } from "#lib/shared/keyboard/domain/types/keyboard-types.js";
import { CommandPalette } from "#lib/shared/keyboard/services/command-palette.js";
import type { NavigationVisit } from "#lib/shared/navigation/domain/navigation-visit.js";
import type { INavigationVisitPersister } from "#lib/shared/navigation/services/contracts/INavigationVisitPersister.js";

function command(
  id: string,
  overrides: Partial<CommandPaletteItem> = {}
): CommandPaletteItem {
  return {
    id,
    label: id,
    category: "Navigation",
    keywords: [id],
    available: true,
    action: vi.fn(),
    ...overrides,
  };
}

function destination(
  id: string,
  overrides: Partial<CommandPaletteItem> = {}
): CommandPaletteItem {
  return command(id, {
    kind: "destination",
    destinationId: `navigation:${id}`,
    ...overrides,
  });
}

function visitsPersister(
  visits: readonly NavigationVisit[]
): INavigationVisitPersister {
  return {
    getVisits: () => [...visits],
    recordVisit: vi.fn(),
  };
}

describe("CommandPalette suggestions", () => {
  it("keeps the empty state focused on contextual actions for new users", () => {
    const palette = new CommandPalette(visitsPersister([]));
    palette.registerCommand(destination("create"));
    palette.registerCommand(
      command("shortcuts", { kind: "action", category: "Help" })
    );
    palette.registerCommand(command("disabled", { available: false }));

    expect(palette.search("")).toMatchObject([
      { id: "shortcuts", category: "Actions here" },
    ]);
  });

  it("shows recent destinations, excludes the current destination, and avoids duplicates", () => {
    const palette = new CommandPalette(
      visitsPersister([
        {
          destinationId: "navigation:browse:gallery",
          visitCount: 6,
          lastVisitedAt: 30,
        },
        {
          destinationId: "navigation:create:assemble",
          visitCount: 4,
          lastVisitedAt: 20,
        },
        {
          destinationId: "navigation:settings:profile",
          visitCount: 3,
          lastVisitedAt: 10,
        },
      ])
    );
    palette.registerCommand(
      destination("browse-gallery", {
        destinationId: "navigation:browse:gallery",
      })
    );
    palette.registerCommand(
      destination("create-assemble", {
        destinationId: "navigation:create:assemble",
      })
    );
    palette.registerCommand(
      destination("settings-profile", {
        destinationId: "navigation:settings:profile",
      })
    );

    expect(
      palette
        .search("", "navigation:create:assemble")
        .map(({ id, category }) => ({ id, category }))
    ).toEqual([
      { id: "browse-gallery", category: "Recent" },
      { id: "settings-profile", category: "Recent" },
    ]);
  });
});

describe("CommandPalette search", () => {
  it("finds a tab by its parent module and presents destinations before actions", () => {
    const palette = new CommandPalette();
    palette.registerCommand(
      destination("library", {
        label: "Library",
        parentLabel: "Browse",
        keywords: ["saved", "collections"],
      })
    );
    palette.registerCommand(
      command("browse-action", {
        label: "Browse help",
        kind: "action",
        keywords: ["browse"],
      })
    );

    expect(
      palette.search("browse").map(({ id, category }) => ({ id, category }))
    ).toEqual([
      { id: "library", category: "Places" },
      { id: "browse-action", category: "Actions" },
    ]);
  });
});
