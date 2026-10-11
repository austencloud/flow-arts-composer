import { describe, expect, it, vi } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

vi.mock("$app/env", () => ({ browser: true }));
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));

import {
  DeepLinker,
  deepLinker,
} from "#lib/shared/navigation/services/deep-linker.js";
import { getDeepLinker } from "#lib/shared/navigation/get-deep-linker.js";

const sequence = {
  id: "letter-draft",
  name: "B draft",
  word: "B",
  steps: [],
} as SequenceData;

describe("deep-link handoff ownership", () => {
  it("gives app initialization and Create the same in-memory owner", () => {
    expect(getDeepLinker()).toBe(deepLinker);
  });

  it("survives a realistic cold module load before consumption", () => {
    vi.useFakeTimers();
    const linker = new DeepLinker();
    linker.setData("create", sequence, "construct");

    vi.advanceTimersByTime(15_000);

    expect(linker.consumeData("create")).toEqual({
      sequence,
      tabId: "construct",
    });
    vi.useRealTimers();
  });
});
