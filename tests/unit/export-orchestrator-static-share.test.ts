import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "../../src/lib/shared/foundation/domain/models/sequence-data";
import type { Sharer } from "../../src/lib/shared/share/services/sharer";

const staticShareMocks = vi.hoisted(() => ({
  compositionSettings: {
    darkMode: false,
    includeStartPlacement: true,
    addStepNumbers: true,
    addWord: true,
    addUserInfo: true,
    addDifficultyLevel: false,
    showNotes: false,
    customNotesText: "",
  },
  shareBlobNatively: vi.fn(),
}));

vi.mock(
  "../../src/lib/shared/share/state/image-composition-state.svelte",
  () => ({
    getImageCompositionManager: () => ({
      getSettings: () => ({ ...staticShareMocks.compositionSettings }),
    }),
  })
);

vi.mock(
  "../../src/lib/shared/foundation/services/file-downloader",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../src/lib/shared/foundation/services/file-downloader")
      >();
    return {
      ...actual,
      shareBlobNatively: staticShareMocks.shareBlobNatively,
    };
  }
);

vi.mock("../../src/lib/shared/settings/state/settings-state.svelte", () => ({
  settingsService: {
    settings: {
      propType: "staff",
      leftPropType: "staff",
      rightPropType: "staff",
    },
  },
}));

import { ExportOrchestrator } from "../../src/lib/shared/export-panel/services/export-orchestrator";

const sequence = {
  id: "static-share",
  name: "Static Share",
  word: "STATIC",
  steps: [{ letter: "A" }],
} as unknown as SequenceData;

function makeHarness() {
  const blob = new Blob(["prepared-image"], { type: "image/png" });
  const getImageBlob = vi.fn().mockResolvedValue(blob);
  const generateFilename = vi.fn(() => "Static Share.png");
  const downloadImage = vi.fn().mockResolvedValue(undefined);
  const sharer = {
    getImageBlob,
    generateFilename,
    downloadImage,
  } as unknown as Sharer;

  return {
    blob,
    getImageBlob,
    generateFilename,
    downloadImage,
    orchestrator: new ExportOrchestrator(sharer),
  };
}

describe("ExportOrchestrator static mobile share", () => {
  beforeEach(() => {
    staticShareMocks.shareBlobNatively.mockReset();
  });

  it("creates the native share promise synchronously from a prepared blob", async () => {
    const harness = makeHarness();
    let finishShare!: () => void;
    staticShareMocks.shareBlobNatively.mockReturnValueOnce(
      new Promise((resolve) => {
        finishShare = () =>
          resolve({ status: "shared", filename: "Static Share.png" });
      })
    );

    await harness.orchestrator.prepareStaticShare(sequence);

    const exportPromise = harness.orchestrator.export(
      sequence,
      { format: "static" },
      {
        isMobile: true,
      }
    );

    expect(staticShareMocks.shareBlobNatively).toHaveBeenCalledOnce();
    expect(staticShareMocks.shareBlobNatively).toHaveBeenCalledWith(
      harness.blob,
      "Static Share.png",
      {
        title: "Static Share",
        text: "Flow Arts Composer sequence: Static Share",
      }
    );
    expect(harness.getImageBlob).toHaveBeenCalledTimes(1);
    expect(harness.getImageBlob).toHaveBeenCalledWith(
      sequence,
      expect.objectContaining({ showNotes: false })
    );

    finishShare();
    await expect(exportPromise).resolves.toEqual({ success: true });
  });

  it("prepares on a cold tap without attempting a late native share", async () => {
    const harness = makeHarness();

    const result = await harness.orchestrator.export(
      sequence,
      { format: "static" },
      {
        isMobile: true,
      }
    );

    expect(result).toEqual({
      success: false,
      error: "Image is still preparing. Tap Share Image again.",
    });
    expect(harness.getImageBlob).toHaveBeenCalledOnce();
    expect(staticShareMocks.shareBlobNatively).not.toHaveBeenCalled();
  });

  it("reports native-sheet dismissal as cancellation, not failure", async () => {
    const harness = makeHarness();
    staticShareMocks.shareBlobNatively.mockResolvedValueOnce({
      status: "canceled",
      filename: "Static Share.png",
    });
    await harness.orchestrator.prepareStaticShare(sequence);

    await expect(
      harness.orchestrator.export(
        sequence,
        { format: "static" },
        {
          isMobile: true,
        }
      )
    ).resolves.toEqual({ success: true, canceled: true });
  });
});
