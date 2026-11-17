/**
 * The order openSentFile tries things in, which nobody sees go wrong: a file
 * that carries its sequence must never pay for the QR decoder, only pictures
 * reach the QR path, and a miss is reported exactly once.
 */
import { describe, expect, it, vi } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  openSentFile,
  type OpenSentFileDeps,
} from "#lib/shared/share/services/open-sent-file.js";
import type { SequenceFileReadResult } from "#lib/shared/share/services/sequence-file-reader.js";

const sequence = { id: "x", word: "A", steps: [{}, {}] } as unknown as SequenceData;

function embedded(link?: string): SequenceFileReadResult {
  return {
    sequence,
    fileKind: "png",
    payload: {
      format: "flow-arts-sequence",
      version: 1,
      app: "Flow Arts Composer",
      notation: "The Kinetic Alphabet",
      word: "A",
      encoding: "flow-arts-flat",
      sequence: "flat",
      ...(link && { link }),
    },
  };
}

function fakes(overrides: Partial<OpenSentFileDeps> = {}) {
  const deps: OpenSentFileDeps = {
    readEmbedded: vi.fn(async () => null),
    decodeQr: vi.fn(async () => []),
    extractCode: vi.fn((raw: string) =>
      raw.startsWith("https://tka.run/") ? raw.slice(16) : null
    ),
    resolveCode: vi.fn(async () => sequence),
    open: vi.fn(async () => {}),
    notFound: vi.fn(),
    openFailed: vi.fn(),
    trackOpened: vi.fn(),
    trackNotFound: vi.fn(),
    sniffKind: vi.fn(async () => "other" as const),
    ...overrides,
  };
  return deps;
}

const picture = new File([new Uint8Array([1])], "card.png", {
  type: "image/png",
});
const video = new File([new Uint8Array([1])], "clip.mp4", {
  type: "video/mp4",
});

describe("openSentFile", () => {
  it("opens a carried sequence without touching the QR decoder", async () => {
    const deps = fakes({ readEmbedded: vi.fn(async () => embedded()) });
    expect(await openSentFile(picture, "picker", deps)).toBe("embedded");
    expect(deps.open).toHaveBeenCalledWith(sequence, undefined);
    expect(deps.decodeQr).not.toHaveBeenCalled();
    expect(deps.trackOpened).toHaveBeenCalledTimes(1);
    expect(deps.notFound).not.toHaveBeenCalled();
  });

  it("keeps the short code of a link the file carries", async () => {
    const deps = fakes({
      readEmbedded: vi.fn(async () => embedded("https://tka.run/AB12")),
    });
    await openSentFile(picture, "drop", deps);
    expect(deps.open).toHaveBeenCalledWith(sequence, "AB12");
  });

  it("falls back to the card QR for a picture", async () => {
    const deps = fakes({
      decodeQr: vi.fn(async () => ["https://example.com", "https://tka.run/AB12"]),
    });
    expect(await openSentFile(picture, "drop", deps)).toBe("qr");
    expect(deps.resolveCode).toHaveBeenCalledWith("AB12");
    expect(deps.open).toHaveBeenCalledWith(sequence, "AB12");
    expect(deps.trackNotFound).not.toHaveBeenCalled();
  });

  it("never looks for a QR in a video", async () => {
    const deps = fakes();
    expect(await openSentFile(video, "picker", deps)).toBe("not-found");
    expect(deps.decodeQr).not.toHaveBeenCalled();
  });

  it("reports a miss once: one toast, one event", async () => {
    const deps = fakes({
      decodeQr: vi.fn(async () => ["https://example.com/not-a-card"]),
      sniffKind: vi.fn(async () => "png" as const),
    });
    expect(await openSentFile(picture, "drop", deps)).toBe("not-found");
    expect(deps.notFound).toHaveBeenCalledTimes(1);
    expect(deps.trackNotFound).toHaveBeenCalledTimes(1);
    expect(deps.trackNotFound).toHaveBeenCalledWith("png", "drop");
    expect(deps.open).not.toHaveBeenCalled();
  });

  it("says so once when a found sequence fails to open", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const deps = fakes({
        readEmbedded: vi.fn(async () => embedded()),
        open: vi.fn(async () => {
          throw new Error("hydrate");
        }),
      });
      expect(await openSentFile(picture, "picker", deps)).toBe("failed");
      expect(deps.openFailed).toHaveBeenCalledTimes(1);
      expect(deps.notFound).not.toHaveBeenCalled();
      expect(deps.trackOpened).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  it("treats a broken decoder or an unresolved code as a miss", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const broken = fakes({
        decodeQr: vi.fn(async () => {
          throw new Error("wasm");
        }),
      });
      expect(await openSentFile(picture, "picker", broken)).toBe("not-found");
      expect(broken.notFound).toHaveBeenCalledTimes(1);

      const unresolved = fakes({
        decodeQr: vi.fn(async () => ["https://tka.run/ZZZZ"]),
        resolveCode: vi.fn(async () => null),
      });
      expect(await openSentFile(picture, "picker", unresolved)).toBe(
        "not-found"
      );
      expect(unresolved.open).not.toHaveBeenCalled();
      expect(unresolved.trackNotFound).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
});
