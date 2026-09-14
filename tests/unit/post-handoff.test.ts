import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const detectPlatform = vi.hoisted(() => vi.fn(() => "desktop"));
const supportsNativeFileShare = vi.hoisted(() => vi.fn(() => true));
const canNativeShareFile = vi.hoisted(() => vi.fn(() => true));

vi.mock("$lib/shared/mobile/services/platform-detector", () => ({
  detectPlatform,
}));

vi.mock("$lib/shared/foundation/services/file-downloader", async () => {
  const actual = await vi.importActual<
    typeof import("$lib/shared/foundation/services/file-downloader")
  >("$lib/shared/foundation/services/file-downloader");
  return { ...actual, supportsNativeFileShare, canNativeShareFile };
});

const {
  buildArtifactFilename,
  copyLink,
  copyPreparedLink,
  resolveDestinations,
} = await import("$lib/shared/share/services/post-handoff");

function pngBlob(): Blob {
  return new Blob(["x"], { type: "image/png" });
}

describe("post handoff destinations", () => {
  beforeEach(() => {
    detectPlatform.mockReturnValue("desktop");
    supportsNativeFileShare.mockReturnValue(true);
    canNativeShareFile.mockReturnValue(true);
  });

  it("leads with the native file share on mobile", () => {
    detectPlatform.mockReturnValue("mobile");

    const destinations = resolveDestinations({
      artifact: "video",
      blob: pngBlob(),
      filename: "FΨ.mp4",
    });

    expect(destinations[0]?.id).toBe("native-share");
    expect(destinations[0]?.primary).toBe(true);
  });

  it("offers capable desktops both native sharing and an explicit download", () => {
    const destinations = resolveDestinations({
      artifact: "card",
      blob: pngBlob(),
      filename: "FΨ.png",
    });

    expect(destinations.map((d) => d.id)).toEqual(
      expect.arrayContaining(["native-share", "download", "send-to-phone"])
    );
  });

  it("omits the clipboard-to-Facebook path for video, which cannot be copied", () => {
    const destinations = resolveDestinations({
      artifact: "video",
      blob: pngBlob(),
      filename: "FΨ.mp4",
    });

    expect(destinations.map((d) => d.id)).not.toContain("copy-image-facebook");
  });

  it("offers the clipboard-to-Facebook path for a card", () => {
    const destinations = resolveDestinations({
      artifact: "card",
      blob: pngBlob(),
      filename: "FΨ.png",
    });

    expect(destinations.map((d) => d.id)).toContain("copy-image-facebook");
  });

  it("still offers copy-caption while the video render is in flight", () => {
    const destinations = resolveDestinations({
      artifact: "video",
      blob: null,
      filename: "FΨ.mp4",
    });

    expect(destinations.map((d) => d.id)).toContain("copy-caption");
  });

  it.each(["mobile", "desktop"])(
    "drops native sharing for unsupported payloads on %s",
    (platform) => {
      detectPlatform.mockReturnValue(platform);
      canNativeShareFile.mockReturnValue(false);

      const destinations = resolveDestinations({
        artifact: "video",
        blob: pngBlob(),
        filename: "FΨ.mp4",
      });

      expect(destinations.map((d) => d.id)).not.toContain("native-share");
      expect(destinations.map((d) => d.id)).toContain("download");
    }
  );

  it("keeps download and phone transfer when desktop sharing is unavailable", () => {
    supportsNativeFileShare.mockReturnValue(false);
    const destinations = resolveDestinations({
      artifact: "video",
      blob: pngBlob(),
      filename: "test.mp4",
    });
    expect(destinations.map((d) => d.id)).not.toContain("native-share");
    expect(destinations.map((d) => d.id)).toEqual(
      expect.arrayContaining(["download", "send-to-phone"])
    );
  });
});

describe("artifact filenames", () => {
  it("simplifies a repeated LOOP word", () => {
    expect(buildArtifactFilename("FΨFΨFΨFΨ", "video")).toBe("FΨ.mp4");
  });

  it("preserves Greek glyphs rather than mangling them to underscores", () => {
    expect(buildArtifactFilename("ΣΦΛ", "card")).toBe("ΣΦΛ.png");
  });

  it("falls back to a usable name when the word is empty", () => {
    expect(buildArtifactFilename("", "card")).toBe("sequence.png");
  });

  it("strips characters that are illegal in a path", () => {
    expect(buildArtifactFilename("A/B:C", "card")).toBe("A_B_C.png");
  });
});

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe("prepared link clipboard handoff", () => {
  const originalClipboardItem = globalThis.ClipboardItem;

  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    if (originalClipboardItem) {
      Object.defineProperty(globalThis, "ClipboardItem", {
        configurable: true,
        value: originalClipboardItem,
      });
    } else {
      Reflect.deleteProperty(globalThis, "ClipboardItem");
    }
  });

  it("starts ClipboardItem writing before the lazy link resolves", async () => {
    let resolveUrl!: (url: string) => void;
    const preparedUrl = new Promise<string>((resolve) => {
      resolveUrl = resolve;
    });
    let textBlob: Promise<Blob> | undefined;
    class ClipboardItemStub {
      constructor(items: Record<string, Promise<Blob>>) {
        textBlob = items["text/plain"];
      }
    }
    Object.defineProperty(globalThis, "ClipboardItem", {
      configurable: true,
      value: ClipboardItemStub,
    });
    const write = vi.fn(async () => {
      await textBlob;
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write },
    });

    const copying = copyPreparedLink(preparedUrl);

    expect(write).toHaveBeenCalledOnce();
    expect(textBlob).toBeDefined();
    resolveUrl("https://tkaflowarts.com/sequence/ABCD");
    expect(await readBlobText(await textBlob!)).toBe(
      "https://tkaflowarts.com/sequence/ABCD"
    );
    await expect(copying).resolves.toMatchObject({ status: "done" });
  });

  it("falls back to writeText after preparation when promised ClipboardItems are unavailable", async () => {
    Reflect.deleteProperty(globalThis, "ClipboardItem");
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    await expect(
      copyPreparedLink(Promise.resolve("https://tkaflowarts.com/sequence/ABCD"))
    ).resolves.toMatchObject({ status: "done" });
    expect(writeText).toHaveBeenCalledWith(
      "https://tkaflowarts.com/sequence/ABCD"
    );
  });

  it.each([false, true])(
    "finishes plain text after an early item acknowledgement (later write denied: %s)",
    async (denied) => {
      let resolveUrl!: (url: string) => void;
      const pending = new Promise<string>((resolve) => {
        resolveUrl = resolve;
      });
      class ClipboardItemStub {
        constructor(public items: Record<string, Promise<Blob>>) {}
      }
      Object.defineProperty(globalThis, "ClipboardItem", {
        configurable: true,
        value: ClipboardItemStub,
      });
      const writeText = vi.fn(async () => {
        if (denied) throw new Error("User gesture expired");
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { write: vi.fn(async () => {}), writeText },
      });
      let finished = false;
      const copying = copyPreparedLink(pending).then((result) => {
        finished = true;
        return result;
      });
      await Promise.resolve();
      expect(finished).toBe(false);
      expect(writeText).not.toHaveBeenCalled();
      resolveUrl("https://tkaflowarts.com/sequence/ABCD");
      await expect(copying).resolves.toMatchObject({ status: "done" });
      expect(writeText).toHaveBeenCalledWith(
        "https://tkaflowarts.com/sequence/ABCD"
      );
    }
  );

  it("allows a fresh retry after clipboard denial and a later preparation failure", async () => {
    let rejectUrl!: (reason: Error) => void;
    const pending = new Promise<string>((_, reject) => {
      rejectUrl = reject;
    });
    class ClipboardItemStub {
      constructor(public items: Record<string, Promise<Blob>>) {}
    }
    Object.defineProperty(globalThis, "ClipboardItem", {
      configurable: true,
      value: ClipboardItemStub,
    });
    const write = vi.fn(async (items: ClipboardItemStub[]) => {
      await items[0]!.items["text/plain"];
    });
    write.mockRejectedValueOnce(new Error("Clipboard denied"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write },
    });
    await expect(copyPreparedLink(pending)).resolves.toMatchObject({
      status: "failed",
    });
    rejectUrl(new Error("Link creation failed after permission denial"));
    await expect(
      copyPreparedLink(Promise.resolve("https://tkaflowarts.com/sequence/ABCD"))
    ).resolves.toMatchObject({ status: "done", message: "Link copied" });
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("reports a rejected preparation without claiming the link was copied", async () => {
    Reflect.deleteProperty(globalThis, "ClipboardItem");
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    await expect(
      copyPreparedLink(Promise.reject(new Error("mint failed")))
    ).resolves.toEqual({
      status: "failed",
      message: "Couldn't copy link",
    });
    expect(writeText).not.toHaveBeenCalled();
  });
});

describe("direct link copy", () => {
  const originalExecCommand = document.execCommand;
  const mockedCreateElement = document.createElement;

  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    document.execCommand = originalExecCommand;
    // The global setup stubs createElement with plain objects; the selection
    // fallback appends a real textarea, so restore jsdom's own for this file.
    document.createElement =
      Object.getPrototypeOf(document).createElement.bind(document);
  });

  afterEach(() => {
    document.createElement = mockedCreateElement;
  });

  it("copies through a selection when the Clipboard API refuses", async () => {
    const writeText = vi.fn(async () => {
      throw new DOMException("Write permission denied.", "NotAllowedError");
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    let selected = "";
    document.execCommand = vi.fn(() => {
      selected = document.querySelector("textarea")?.value ?? "";
      return true;
    });

    await expect(
      copyLink("https://tkaflowarts.com/sequence/ABCD")
    ).resolves.toEqual({ status: "done", message: "Link copied" });
    expect(writeText).toHaveBeenCalledOnce();
    expect(selected).toBe("https://tkaflowarts.com/sequence/ABCD");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("reports failure honestly when every clipboard path is closed", async () => {
    document.execCommand = vi.fn(() => false);
    await expect(
      copyLink("https://tkaflowarts.com/sequence/ABCD")
    ).resolves.toEqual({ status: "failed", message: "Couldn't copy link" });
  });
});
