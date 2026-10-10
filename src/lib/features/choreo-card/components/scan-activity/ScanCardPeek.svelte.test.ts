import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type {
  CodeEntry,
  ScanEventRow,
} from "#lib/features/choreo-card/state/scan-activity-state.svelte.js";
import ScanCardPeek from "./ScanCardPeek.svelte";

vi.mock("#lib/shared/browse/components/PropAwareThumbnail.svelte", async () => {
  const stub = await import("./__test-stubs__/PropAwareThumbnailStub.svelte");
  return { default: stub.default };
});

vi.mock("#lib/shared/render/get-glyph-cache.js", () => ({
  getGlyphCache: () => ({
    getGlyphDataUrl: () => null,
    loadGlyphsByLetter: () => Promise.resolve(),
  }),
}));

const sequence = createSequenceData({
  id: "sequence-9XAK",
  name: "Assemble Sequence",
  word: "AAAA",
  steps: [],
});

const event: ScanEventRow = {
  id: "shortcodes/9XAK/scanEvents/live",
  code: "9XAK",
  timestamp: "2026-07-22T08:30:00.000Z",
  city: "Chicago",
  country: "US",
  lat: 41.85,
  lng: -87.65,
  deviceId: "device-1",
  userId: null,
  leftPropType: PropType.POI,
  rightPropType: PropType.FAN,
  catDogMode: true,
};

function entry(overrides: Partial<CodeEntry> = {}): CodeEntry {
  return {
    code: "9XAK",
    word: "Assemble Sequence",
    ownerId: null,
    createdAt: "2026-06-27T00:00:00.000Z",
    encoded: "encoded",
    scanCount: 2,
    lastScannedAt: event.timestamp,
    lastCity: event.city,
    lastCountry: event.country,
    leftPropType: PropType.STAFF,
    rightPropType: PropType.STAFF,
    catDogMode: false,
    metadataAvailable: true,
    embeddedFallback: null,
    decoded: sequence,
    previewSource: "encoded",
    integrityOk: true,
    decoding: false,
    ...overrides,
  };
}

function renderPeek(codeEntry: CodeEntry | null) {
  return render(ScanCardPeek, {
    code: "9XAK",
    entry: codeEntry,
    event,
    relatedEvents: [event],
    onSelectEvent: vi.fn(),
    onClose: vi.fn(),
  });
}

describe("ScanCardPeek", () => {
  it("renders the preview with the physical props recorded on that scan", async () => {
    renderPeek(entry());

    const preview = page.getByTestId("prop-aware-preview");
    await expect
      .element(preview)
      .toHaveAttribute("data-left-prop", PropType.POI);
    await expect
      .element(preview)
      .toHaveAttribute("data-right-prop", PropType.FAN);
    await expect.element(preview).toHaveAttribute("data-cat-dog", "true");
    await expect
      .element(page.getByText("Card preview unavailable"))
      .not.toBeInTheDocument();
  });

  it("distinguishes an in-flight preview from a terminally unavailable one", async () => {
    const screen = renderPeek(null);
    await expect
      .element(page.getByText("Loading card preview"))
      .toBeInTheDocument();

    await screen.rerender({
      code: "9XAK",
      entry: entry({
        metadataAvailable: false,
        integrityOk: false,
        decoded: null,
        previewSource: null,
      }),
      event,
      relatedEvents: [event],
      onSelectEvent: vi.fn(),
      onClose: vi.fn(),
    });

    await expect
      .element(page.getByText("Card preview unavailable"))
      .toBeInTheDocument();
    await expect
      .element(page.getByText("Loading card preview"))
      .not.toBeInTheDocument();
  });

  it("renders a repeated TKA word once in the alphabet", async () => {
    renderPeek(entry({ word: "ABAB" }));

    const title = page.getByRole("heading", { name: "AB" });
    await expect.element(title).toBeInTheDocument();
    await expect.element(page.getByText("ABAB")).not.toBeInTheDocument();
    expect(
      document.querySelector(".peek-title .tka-label.glyphs")
    ).not.toBeNull();
  });
});
