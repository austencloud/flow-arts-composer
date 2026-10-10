import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => true),
    getPlatform: vi.fn(() => "android"),
    // Capacitor's real implementation is a string concat with no encoding.
    // Modelling it faithfully is the whole point of this suite.
    convertFileSrc: vi.fn((p: string) => `https://localhost/_capacitor_file_${p}`),
  },
}));

import { Capacitor } from "@capacitor/core";
import {
  sharedFileToFile,
  sharedFilesToFiles,
  toFetchableUrl,
} from "#lib/shared/share-intake/services/shared-file-bridge.js";
import { MAX_INTAKE_BYTES } from "#lib/shared/share-intake/services/intake-validator.js";

function descriptor(name: string, uri = `/cache/shared_files/${name}`) {
  return { uri, name, mimeType: "image/png" };
}

// jsdom (as pinned in this repo, v27.4.0) does not implement Blob/File's
// spec-required arrayBuffer() method (jsdom/jsdom#2555). Polyfilled locally
// via FileReader, which jsdom DOES implement, so the assertions below exercise
// the real spec method name instead of a jsdom-specific workaround.
if (typeof File.prototype.arrayBuffer !== "function") {
  File.prototype.arrayBuffer = function (this: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

/** A duck-typed Response so a test can assert the body was never read. */
function fakeResponse(options: {
  ok?: boolean;
  status?: number;
  contentLength?: string | null;
  bytes?: Uint8Array;
  arrayBufferSpy?: ReturnType<typeof vi.fn>;
}) {
  const bytes = options.bytes ?? new Uint8Array([1, 2, 3]);
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    headers: { get: () => options.contentLength ?? null },
    arrayBuffer:
      options.arrayBufferSpy ??
      vi.fn(async () => bytes.buffer.slice(0) as ArrayBuffer),
  };
}

describe("toFetchableUrl", () => {
  beforeEach(() => {
    // The mocked Capacitor.convertFileSrc is a single vi.fn() shared by the
    // whole file (created once inside vi.mock's factory), so its call history
    // accumulates across tests unless cleared here first.
    vi.clearAllMocks();
    vi.mocked(Capacitor.convertFileSrc).mockImplementation(
      (p: string) => `https://localhost/_capacitor_file_${p}`
    );
  });

  it("percent-encodes each path segment before converting", () => {
    // Without this the URL truncates at the '#' and the fetch 404s.
    expect(toFetchableUrl("/cache/shared_files/photo#2.png")).toBe(
      "https://localhost/_capacitor_file_/cache/shared_files/photo%232.png"
    );
  });

  it("encodes spaces and question marks too", () => {
    expect(toFetchableUrl("/c/my photo?.png")).toBe(
      "https://localhost/_capacitor_file_/c/my%20photo%3F.png"
    );
  });

  it("passes an already-schemed uri through untouched", () => {
    // The plugin's own docs say the uri may be a data URL. Encoding one
    // destroys it, and it is already fetchable.
    const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
    expect(toFetchableUrl(dataUrl)).toBe(dataUrl);
    expect(Capacitor.convertFileSrc).not.toHaveBeenCalled();
  });
});

describe("sharedFileToFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Capacitor.convertFileSrc).mockImplementation(
      (p: string) => `https://localhost/_capacitor_file_${p}`
    );
  });

  it("returns a File with the descriptor's name, type, and real bytes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse({})));

    const outcome = await sharedFileToFile(descriptor("a.png"));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.file).toBeInstanceOf(File);
    expect(outcome.file.name).toBe("a.png");
    expect(outcome.file.type).toBe("image/png");
    expect(outcome.file.size).toBe(3);
    expect(new Uint8Array(await outcome.file.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3])
    );
  });

  it("reports the real byte size back on the descriptor", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse({})));

    const outcome = await sharedFileToFile(descriptor("a.png"));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // The durable receiptId is derived from this. The plugin's SharedFile has
    // no size field at all, so without it the id degrades to name+mimeType.
    expect(outcome.descriptor.size).toBe(3);
  });

  it("sanitizes a path-traversing name onto the File", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse({})));

    const outcome = await sharedFileToFile(descriptor("../../evil.png", "/c/x.png"));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.file.name).toBe("evil.png");
  });

  it("records unreachable instead of throwing when the fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("ENOENT");
    }));

    const outcome = await sharedFileToFile(descriptor("gone.png"));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.problem).toMatchObject({ name: "gone.png", reason: "unreachable" });
    expect(outcome.problem.detail).toContain("ENOENT");
  });

  it("records not-found on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse({ ok: false, status: 404 })));

    const outcome = await sharedFileToFile(descriptor("missing.png"));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.problem).toMatchObject({ reason: "not-found", detail: "HTTP 404" });
  });

  it("rejects an oversized declared length WITHOUT reading the body", async () => {
    const arrayBufferSpy = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () =>
      fakeResponse({
        contentLength: String(MAX_INTAKE_BYTES + 1),
        arrayBufferSpy,
      })
    ));

    const outcome = await sharedFileToFile(descriptor("huge.png"));

    expect(outcome.ok).toBe(false);
    // The point of the header check: a 200 MB file must never reach memory.
    expect(arrayBufferSpy).not.toHaveBeenCalled();
  });

  it("rejects an oversized body when no length was declared", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      fakeResponse({ bytes: new Uint8Array(MAX_INTAKE_BYTES + 1) })
    ));

    const outcome = await sharedFileToFile(descriptor("huge.png"));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.problem.reason).toBe("too-large");
  });

  it("records empty for a zero-byte body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse({ bytes: new Uint8Array(0) })));

    const outcome = await sharedFileToFile(descriptor("empty.png"));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.problem.reason).toBe("empty");
  });
});

describe("sharedFilesToFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Capacitor.convertFileSrc).mockImplementation(
      (p: string) => `https://localhost/_capacitor_file_${p}`
    );
  });

  it("keeps order, keeps failures as problems, and never drops silently", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.includes("bad") ? fakeResponse({ ok: false, status: 404 }) : fakeResponse({})
    ));

    const result = await sharedFilesToFiles([
      descriptor("a.png"),
      descriptor("bad.png"),
      descriptor("c.png"),
    ]);

    expect(result.bridged.map((b) => b.file.name)).toEqual(["a.png", "c.png"]);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0].name).toBe("bad.png");
  });

  it("never runs more than four reads at once", async () => {
    let inFlight = 0;
    let peak = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return fakeResponse({});
    }));

    await sharedFilesToFiles(
      Array.from({ length: 20 }, (_, i) => descriptor(`f${i}.png`))
    );

    // Promise.all over 20 descriptors fanned out 20 whole-file reads at once.
    expect(peak).toBeLessThanOrEqual(4);
  });
});
