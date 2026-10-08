import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FeatureExportError,
  saveFeatureExport,
} from "$lib/server/feature-video-exports";
import { featureVideos } from "$lib/server/feature-video-store";
import {
  FEATURE_EXPORT_NAME_RULE,
  defaultFeatureExportName,
  featureVideoExportUrl,
  isFeatureExportName,
  isSavedFeatureExport,
} from "$lib/shared/media-composition/domain/feature-video-export";
import { POST as exportRoute } from "../../../src/routes/api/dev/feature-videos/[slug]/exports/+server";
import {
  routeEvent,
  tempFeatureRoot,
  thrownStatus,
} from "./feature-video-test-helpers";

/** The first bytes of an MP4: a box size, "ftyp", then a brand. */
const MP4_HEAD = [0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d];

/** A stand-in MP4 of `bytes` bytes (at least 12): a real head, then zeros. */
function mp4(bytes = 64): Uint8Array {
  const data = new Uint8Array(bytes);
  data.set(MP4_HEAD);
  return data;
}

function stream(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

describe("export names", () => {
  it.each([
    "promo.mp4",
    "Promo 1.0 final.MP4",
    "a_b-c.d.mp4",
    `${"a".repeat(100)}.mp4`,
  ])("takes %j", (name) => {
    expect(isFeatureExportName(name)).toBe(true);
  });

  it.each([
    "promo",
    "promo.mov",
    ".promo.mp4",
    "-promo.mp4",
    "../promo.mp4",
    "a/b.mp4",
    "a\\b.mp4",
    "a..b.mp4",
    "con.mp4",
    "LPT1.mp4",
    `${"a".repeat(101)}.mp4`,
    "",
    7,
    null,
  ])("refuses %j", (name) => {
    expect(isFeatureExportName(name)).toBe(false);
  });

  it("names a render after its project and the time it was made", () => {
    expect(
      defaultFeatureExportName("promo-1-0", new Date(2026, 9, 7, 9, 5, 3))
    ).toBe("promo-1-0-20261007-090503.mp4");
    expect(isFeatureExportName(defaultFeatureExportName("promo-1-0"))).toBe(
      true
    );
  });

  it("builds the route a render is sent to", () => {
    expect(featureVideoExportUrl("promo")).toBe(
      "/api/dev/feature-videos/promo/exports"
    );
    expect(featureVideoExportUrl("promo", "cut 1.mp4")).toBe(
      "/api/dev/feature-videos/promo/exports?name=cut%201.mp4"
    );
    expect(() => featureVideoExportUrl("../x")).toThrow(
      '"../x" is not a feature video name.'
    );
  });

  it("knows the dev server's answer for a saved render", () => {
    const saved = {
      file: "exports/a.mp4",
      path: "E:/videos/promo/exports/a.mp4",
      bytes: 9,
    };
    expect(isSavedFeatureExport(saved)).toBe(true);
    expect(isSavedFeatureExport({ ...saved, file: "a.mp4" })).toBe(false);
    expect(isSavedFeatureExport({ ...saved, bytes: 0 })).toBe(false);
    expect(isSavedFeatureExport({ ...saved, path: 3 })).toBe(false);
    expect(isSavedFeatureExport(null)).toBe(false);
  });
});

describe("saveFeatureExport", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await tempFeatureRoot();
    await fs.writeFile(path.join(dir, "project.json"), "{}");
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const exportsList = () => fs.readdir(path.join(dir, "exports"));

  it("keeps a render and never replaces an earlier one", async () => {
    const first = await saveFeatureExport(dir, {
      name: "check.mp4",
      body: stream(mp4(40), mp4(24)),
    });
    expect(first).toEqual({
      file: "exports/check.mp4",
      path: path.join(dir, "exports", "check.mp4"),
      bytes: 64,
    });
    const second = await saveFeatureExport(dir, {
      name: "check.mp4",
      body: stream(mp4()),
    });
    expect(second.file).toBe("exports/check-2.mp4");
    expect((await exportsList()).sort()).toEqual(["check-2.mp4", "check.mp4"]);
    expect((await fs.readFile(first.path)).subarray(0, 12)).toEqual(
      Buffer.from(MP4_HEAD)
    );
  });

  it("refuses an empty body or one that is not an MP4, and keeps nothing", async () => {
    await expect(
      saveFeatureExport(dir, { name: "check.mp4", body: stream() })
    ).rejects.toBeInstanceOf(FeatureExportError);
    await expect(
      saveFeatureExport(dir, { name: "check.mp4", body: stream() })
    ).rejects.toMatchObject({ status: 400, message: "The render was empty." });
    await expect(
      saveFeatureExport(dir, {
        name: "check.mp4",
        body: stream(new TextEncoder().encode("not a video at all")),
      })
    ).rejects.toMatchObject({
      status: 415,
      message: "That is not an MP4 file.",
    });
    expect(await exportsList()).toEqual([]);
  });

  it("stops a render past the cap and keeps nothing", async () => {
    await expect(
      saveFeatureExport(dir, {
        name: "check.mp4",
        body: stream(mp4(12), mp4(12)),
        maxBytes: 16,
      })
    ).rejects.toMatchObject({
      status: 413,
      message: "A render can be at most 16 bytes.",
    });
    expect(await exportsList()).toEqual([]);
  });

  it("refuses a declared size past the cap before reading", async () => {
    await expect(
      saveFeatureExport(dir, {
        name: "check.mp4",
        body: stream(mp4()),
        declaredBytes: 17,
        maxBytes: 16,
      })
    ).rejects.toMatchObject({ status: 413 });
  });

  it("refuses an upload that stopped short of its declared size, and keeps nothing", async () => {
    await expect(
      saveFeatureExport(dir, {
        name: "check.mp4",
        body: stream(mp4(64)),
        declaredBytes: 128,
      })
    ).rejects.toMatchObject({
      status: 400,
      message: "The upload stopped before the whole render arrived.",
    });
    expect(await exportsList()).toEqual([]);
    const kept = await saveFeatureExport(dir, {
      name: "check.mp4",
      body: stream(mp4(64)),
      declaredBytes: 64,
    });
    expect(kept).toMatchObject({ file: "exports/check.mp4", bytes: 64 });
  });

  it("refuses a bad name and a folder with no project", async () => {
    await expect(
      saveFeatureExport(dir, { name: "../check.mp4", body: stream(mp4()) })
    ).rejects.toMatchObject({ status: 400, message: FEATURE_EXPORT_NAME_RULE });
    await fs.rm(path.join(dir, "project.json"));
    await expect(
      saveFeatureExport(dir, { name: "check.mp4", body: stream(mp4()) })
    ).rejects.toMatchObject({
      status: 404,
      message: "This feature video has no project file.",
    });
  });
});

describe("the exports route", () => {
  let root: string;
  let savedRoot: string | undefined;

  beforeEach(async () => {
    savedRoot = process.env.TKA_FEATURE_VIDEO_ROOT;
    root = await tempFeatureRoot();
    process.env.TKA_FEATURE_VIDEO_ROOT = root;
    await featureVideos().create({
      slug: "promo",
      title: "Promo",
      sequenceId: "seq",
    });
  });

  afterEach(async () => {
    if (savedRoot === undefined) delete process.env.TKA_FEATURE_VIDEO_ROOT;
    else process.env.TKA_FEATURE_VIDEO_ROOT = savedRoot;
    await fs.rm(root, { recursive: true, force: true });
  });

  const send = (query: string, body?: Uint8Array, type = "video/mp4") =>
    exportRoute(
      routeEvent(`/api/dev/feature-videos/promo/exports${query}`, {
        method: "POST",
        params: { slug: "promo" },
        headers: { "content-type": type },
        ...(body ? { body } : {}),
      }) as never
    );
  const exportsList = () => fs.readdir(path.join(root, "promo", "exports"));

  it("keeps the render in the project's exports folder", async () => {
    const response = await send("?name=check.mp4", mp4());
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      file: "exports/check.mp4",
      bytes: 64,
    });
    expect(await exportsList()).toEqual(["check.mp4"]);
  });

  it("names a render after the project and the time when no name is sent", async () => {
    const response = await send("", mp4());
    expect((await response.json()).file).toMatch(
      /^exports\/promo-\d{8}-\d{6}\.mp4$/
    );
  });

  it("refuses another type, a bad name and an empty body", async () => {
    expect(
      await thrownStatus(() =>
        send("?name=check.mp4", mp4(), "application/json")
      )
    ).toBe(415);
    expect(await thrownStatus(() => send("?name=..%2Fcheck.mp4", mp4()))).toBe(
      400
    );
    expect(await thrownStatus(() => send("?name=check.mp4"))).toBe(400);
    expect(await exportsList()).toEqual([]);
  });
});
