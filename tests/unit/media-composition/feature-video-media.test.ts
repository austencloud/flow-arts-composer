import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FeatureMediaError,
  mediaResponse,
  parseByteRange,
  resolveFeatureMediaFile,
} from "$lib/server/feature-video-media";
import { tempFeatureRoot } from "./feature-video-test-helpers";

describe("parseByteRange", () => {
  it.each<[string | null, ReturnType<typeof parseByteRange>]>([
    ["bytes=0-99", { start: 0, end: 99 }],
    ["bytes=500-", { start: 500, end: 999 }],
    ["bytes=-100", { start: 900, end: 999 }],
    ["bytes=-5000", { start: 0, end: 999 }],
    ["bytes=900-5000", { start: 900, end: 999 }],
    ["bytes=1000-", "unsatisfiable"],
    ["bytes=-0", "unsatisfiable"],
    ["bytes=5-2", null],
    ["bytes=0-1,5-9", null],
    ["items=0-9", null],
    ["bytes=-", null],
    [null, null],
  ])("reads %s of a 1000-byte file", (header, expected) => {
    expect(parseByteRange(header, 1000)).toEqual(expected);
  });
});

describe("feature video media files", () => {
  let project: string;

  beforeEach(async () => {
    project = await tempFeatureRoot();
    const footage = path.join(project, "media", "footage");
    await fs.mkdir(path.join(footage, "folder.mp4"), { recursive: true });
    await fs.writeFile(path.join(footage, "a.mp4"), "0123456789");
    await fs.writeFile(path.join(project, "project.json"), "{}");
  });

  afterEach(async () => {
    await fs.rm(project, { recursive: true, force: true });
  });

  async function status(relativePath: string): Promise<number> {
    try {
      await resolveFeatureMediaFile(project, relativePath);
      return 200;
    } catch (cause) {
      if (cause instanceof FeatureMediaError) return cause.status;
      throw cause;
    }
  }

  it("finds a file in the media folder", async () => {
    expect(
      await resolveFeatureMediaFile(project, "footage/a.mp4")
    ).toMatchObject({ size: 10, contentType: "video/mp4" });
  });

  it.each([
    "",
    "../project.json",
    "footage/../../project.json",
    "footage\\a.mp4",
    "%2e%2e/a.mp4",
    "C:/a.mp4",
    "footage//a.mp4",
    "./footage/a.mp4",
  ])("refuses %j with 400", async (relativePath) => {
    expect(await status(relativePath)).toBe(400);
  });

  it.each(["footage/run.exe", "project.json"])(
    "refuses %s with 415",
    async (relativePath) => {
      expect(await status(relativePath)).toBe(415);
    }
  );

  it.each(["footage/missing.mp4", "footage/folder.mp4"])(
    "answers 404 for %s",
    async (relativePath) => {
      expect(await status(relativePath)).toBe(404);
    }
  );

  it("refuses a link that leads out of the media folder", async () => {
    const outside = await tempFeatureRoot();
    await fs.writeFile(path.join(outside, "secret.mp4"), "secret");
    const link = path.join(project, "media", "footage", "link");
    await fs.symlink(outside, link, "junction");
    try {
      expect(await status("footage/link/secret.mp4")).toBe(403);
    } finally {
      // Remove the link itself before anything deletes folders recursively.
      await fs.unlink(link);
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it("sends the whole file without a range", async () => {
    const media = await resolveFeatureMediaFile(project, "footage/a.mp4");
    const response = mediaResponse(media, null);
    expect(response.status).toBe(200);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-length")).toBe("10");
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(await response.text()).toBe("0123456789");
  });

  it("sends only the asked-for bytes", async () => {
    const media = await resolveFeatureMediaFile(project, "footage/a.mp4");
    const response = mediaResponse(media, "bytes=2-5");
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(response.headers.get("content-length")).toBe("4");
    expect(await response.text()).toBe("2345");
  });

  it("answers 416 for a range past the end", async () => {
    const media = await resolveFeatureMediaFile(project, "footage/a.mp4");
    const response = mediaResponse(media, "bytes=10-");
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */10");
  });
});
