import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowseSortMethod } from "#lib/shared/browse/domain/enums/browse-enums.js";
import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
import { applyFilter } from "#lib/shared/browse/services/browse-filter.js";
import { sortSequences } from "#lib/shared/browse/services/browse-sorter.js";
import {
  resolveBrowseDate,
  withLibraryBrowseDate,
} from "#lib/shared/browse/services/browse-date.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

function sequence(
  id: string,
  dates: { dateAdded?: Date; birthday?: Date; createdAt?: Date }
): SequenceData {
  return {
    id,
    word: id,
    steps: [],
    ...dates,
  } as SequenceData;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("browse dates", () => {
  it("uses the owning library's createdAt when dateAdded is absent", () => {
    const createdAt = new Date("2026-08-06T12:00:00Z");
    const normalized = withLibraryBrowseDate(
      sequence("saved-today", {
        birthday: new Date("2020-01-01T00:00:00Z"),
        createdAt,
      })
    );

    expect(normalized.dateAdded).toEqual(createdAt);
    expect(resolveBrowseDate(normalized)).toEqual(createdAt);
  });

  it("keeps an explicit dateAdded instead of replacing it", () => {
    const dateAdded = new Date("2026-07-01T00:00:00Z");
    const normalized = withLibraryBrowseDate(
      sequence("already-normalized", {
        dateAdded,
        createdAt: new Date("2026-08-06T00:00:00Z"),
      })
    );

    expect(normalized.dateAdded).toEqual(dateAdded);
  });

  it("sorts and filters a newly added legacy sequence by library membership date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T18:00:00Z"));

    const recent = withLibraryBrowseDate(
      sequence("recent", {
        birthday: new Date("2019-01-01T00:00:00Z"),
        createdAt: new Date("2026-08-06T12:00:00Z"),
      })
    );
    const older = withLibraryBrowseDate(
      sequence("older", {
        birthday: new Date("2026-01-01T00:00:00Z"),
        createdAt: new Date("2026-06-01T00:00:00Z"),
      })
    );

    expect(
      sortSequences([older, recent], BrowseSortMethod.DATE_ADDED).map(
        (item) => item.id
      )
    ).toEqual(["recent", "older"]);
    expect(
      applyFilter([older, recent], BrowseFilterType.RECENT, "recent").map(
        (item) => item.id
      )
    ).toEqual(["recent"]);
  });
});
