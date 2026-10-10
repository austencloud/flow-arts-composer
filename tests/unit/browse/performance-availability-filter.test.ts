import { describe, expect, it } from "vitest";
import { applyFilter } from "#lib/shared/browse/services/browse-filter.js";
import { applyFilters } from "#lib/shared/browse/services/multi-filter.js";
import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { ActiveFilter } from "#lib/shared/browse/domain/multi-filter-models.js";

function sequence(
  id: string,
  publicPerformanceCount: number | undefined,
  sequenceLength = 4,
  latestPublicPerformanceAt?: Date
): SequenceData {
  return {
    id,
    word: id,
    steps: [],
    sequenceLength,
    ...(publicPerformanceCount !== undefined && { publicPerformanceCount }),
    ...(latestPublicPerformanceAt && { latestPublicPerformanceAt }),
  } as unknown as SequenceData;
}

const pool = [
  sequence("performed", 2, 4),
  sequence("zero", 0, 4),
  sequence("legacy-missing", undefined, 8),
];

describe("performance availability browse filter", () => {
  it("includes only sequences with at least one public performance", () => {
    expect(
      applyFilter(
        pool,
        BrowseFilterType.PERFORMANCE_AVAILABILITY,
        "has-public-performance"
      ).map((item) => item.id)
    ).toEqual(["performed"]);
  });

  it("treats zero and not-yet-backfilled documents as no public performance", () => {
    expect(
      applyFilter(
        pool,
        BrowseFilterType.PERFORMANCE_AVAILABILITY,
        "no-public-performance"
      ).map((item) => item.id)
    ).toEqual(["zero", "legacy-missing"]);
  });

  it("ORs the two mutually exclusive choices when both are selected", () => {
    const filters = new Map<string, ActiveFilter>([
      [
        "performance:has",
        {
          type: BrowseFilterType.PERFORMANCE_AVAILABILITY,
          value: "has-public-performance",
          label: "Has public performances",
          chipColor: "#fff",
        },
      ],
      [
        "performance:none",
        {
          type: BrowseFilterType.PERFORMANCE_AVAILABILITY,
          value: "no-public-performance",
          label: "No public performances yet",
          chipColor: "#fff",
        },
      ],
    ]);

    expect(applyFilters(pool, filters).map((item) => item.id)).toEqual([
      "performed",
      "zero",
      "legacy-missing",
    ]);
  });

  it("composes with other categories using AND", () => {
    const filters = new Map<string, ActiveFilter>([
      [
        "performance",
        {
          type: BrowseFilterType.PERFORMANCE_AVAILABILITY,
          value: "no-public-performance",
          label: "No public performances yet",
          chipColor: "#fff",
        },
      ],
      [
        "length",
        {
          type: BrowseFilterType.LENGTH,
          value: 4,
          label: "4 steps",
          chipColor: "#fff",
        },
      ],
    ]);

    expect(applyFilters(pool, filters).map((item) => item.id)).toEqual([
      "zero",
    ]);
  });

  it("keeps recently performed separate from recently added", () => {
    const now = Date.now();
    const recentlyPerformed = sequence(
      "old-sequence-new-performance",
      1,
      4,
      new Date(now - 2 * 24 * 60 * 60 * 1000)
    );
    const olderPerformance = sequence(
      "old-performance",
      1,
      4,
      new Date(now - 31 * 24 * 60 * 60 * 1000)
    );

    expect(
      applyFilter(
        [recentlyPerformed, olderPerformance],
        BrowseFilterType.RECENT_PERFORMANCE,
        "recent-performance"
      ).map((item) => item.id)
    ).toEqual(["old-sequence-new-performance"]);
  });
});
