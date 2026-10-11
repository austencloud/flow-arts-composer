import { describe, expect, it } from "vitest";
import { resolveBrowseInitialViewerMode } from "#lib/features/browse/shared/services/performance-browse-intent.js";
import type { ActiveFilter } from "#lib/shared/browse/engine/types.js";
import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";

function filter(
  type: BrowseFilterType,
  value: ActiveFilter["value"],
  label: string
): ActiveFilter {
  return {
    type,
    value,
    label,
    chipColor: "var(--theme-accent)",
    locked: false,
  };
}

describe("performance Browse intent", () => {
  it.each(["has-public-performance", "no-public-performance"] as const)(
    "opens %s results on Performances",
    (value) => {
      const filters = new Map<string, ActiveFilter>([
        [
          BrowseFilterType.PERFORMANCE_AVAILABILITY,
          filter(
            BrowseFilterType.PERFORMANCE_AVAILABILITY,
            value,
            value === "has-public-performance"
              ? "Has public performances"
              : "No public performances yet"
          ),
        ],
      ]);

      expect(resolveBrowseInitialViewerMode(filters)).toBe("videos");
    }
  );

  it("keeps the performance destination when another rule is stacked", () => {
    const filters = new Map<string, ActiveFilter>([
      [
        BrowseFilterType.PERFORMANCE_AVAILABILITY,
        filter(
          BrowseFilterType.PERFORMANCE_AVAILABILITY,
          "has-public-performance",
          "Has public performances"
        ),
      ],
      [BrowseFilterType.LENGTH, filter(BrowseFilterType.LENGTH, 8, "8 steps")],
    ]);

    expect(resolveBrowseInitialViewerMode(filters)).toBe("videos");
  });

  it("opens recently performed results on Performances", () => {
    const filters = new Map<string, ActiveFilter>([
      [
        BrowseFilterType.RECENT_PERFORMANCE,
        filter(
          BrowseFilterType.RECENT_PERFORMANCE,
          "recent-performance",
          "Recently performed"
        ),
      ],
    ]);

    expect(resolveBrowseInitialViewerMode(filters)).toBe("videos");
  });

  it("leaves the ordinary viewer destination alone without that rule", () => {
    const filters = new Map<string, ActiveFilter>([
      [BrowseFilterType.LENGTH, filter(BrowseFilterType.LENGTH, 8, "8 steps")],
    ]);

    expect(resolveBrowseInitialViewerMode(filters)).toBeUndefined();
  });
});
