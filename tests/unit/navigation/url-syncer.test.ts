import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

const navigation = vi.hoisted(() => ({ replaceState: vi.fn() }));
const appPage = vi.hoisted(() => ({
  state: { moduleId: "create", sectionId: "construct" } as App.PageState,
}));
const generateShareURL = vi.hoisted(() => vi.fn());

vi.mock("$app/env", () => ({ browser: true }));
vi.mock("$app/navigation", () => ({
  pushState: vi.fn(),
  replaceState: navigation.replaceState,
}));
vi.mock("$app/state", () => ({ page: appPage }));
vi.mock("#lib/shared/navigation/services/sequence-encoder.js", () => ({
  generateShareURL,
}));

import { URLSyncer } from "#lib/shared/navigation/services/url-syncer.js";

const sequence = { steps: [{}] } as SequenceData;

describe("URLSyncer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    window.history.replaceState(
      {},
      "",
      "/create/construct?keep=yes&open=create%3Aold#workspace"
    );
    generateShareURL.mockReturnValue({
      url: "http://localhost:3000/?open=create%3Anew",
      length: 42,
      compressed: true,
      savings: 50,
    });
  });

  it("updates only its owned parameter", () => {
    new URLSyncer().syncURLWithSequence(sequence, "create", {
      immediate: true,
    });

    const [destination, state] = navigation.replaceState.mock.calls[0] ?? [];
    const nextUrl = new URL(String(destination));
    expect(nextUrl.pathname).toBe("/create/construct");
    expect(nextUrl.searchParams.get("keep")).toBe("yes");
    expect(nextUrl.searchParams.get("open")).toBe("create:new");
    expect(nextUrl.hash).toBe("#workspace");
    expect(state).toEqual({ moduleId: "create", sectionId: "construct" });
  });

  it("exposes cancellation for caller-owned debouncing", () => {
    vi.useFakeTimers();
    const sync = new URLSyncer().createDebouncedSync("create", 100);

    sync(sequence);
    sync.cancel();
    vi.advanceTimersByTime(100);

    expect(generateShareURL).not.toHaveBeenCalled();
  });
});
