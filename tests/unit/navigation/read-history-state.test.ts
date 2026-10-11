import { stringify } from "devalue";
import { describe, expect, it } from "vitest";

import { readHistoryState } from "#lib/shared/navigation-coordinator/read-history-state.js";

describe("readHistoryState", () => {
  // The shape SvelteKit 3 writes for goto(url, { shallow: true, state }).
  it("decodes the page state SvelteKit 3 stores as a devalue string", () => {
    const entry = {
      "sveltekit:metadata": {
        historyIndex: 4,
        navigationIndex: 2,
        resetIndex: 0,
        pageUrl: "https://flowarts.test/browse/library",
        state: stringify({ moduleId: "browse", sectionId: "library" }),
      },
    };

    expect(readHistoryState(entry)).toEqual({
      moduleId: "browse",
      sectionId: "library",
    });
  });

  it("still reads entries an older build nested under sveltekit:states", () => {
    const entry = {
      "sveltekit:history": 3,
      "sveltekit:states": { moduleId: "create", sectionId: "construct" },
    };

    expect(readHistoryState(entry)).toEqual({
      moduleId: "create",
      sectionId: "construct",
    });
  });

  it("reads a flat entry pushed outside SvelteKit", () => {
    expect(readHistoryState({ moduleId: "learn" })).toEqual({
      moduleId: "learn",
    });
  });

  it("ignores entries that carry no module", () => {
    expect(readHistoryState(null)).toBeNull();
    expect(
      readHistoryState({
        "sveltekit:metadata": { historyIndex: 1, state: stringify({}) },
      })
    ).toBeNull();
    expect(
      readHistoryState({
        "sveltekit:metadata": { historyIndex: 1, state: "not devalue" },
      })
    ).toBeNull();
  });
});
