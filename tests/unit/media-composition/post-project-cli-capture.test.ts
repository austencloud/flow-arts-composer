import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toolPath } from "../../../scripts/feature-video/media-import.mjs";

const run = promisify(execFile);
const CLI = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../scripts/post-project.mjs"
);
const canEncode = (() => {
  try {
    return execFileSync(toolPath("ffmpeg"), ["-hide_banner", "-encoders"], {
      encoding: "utf8",
    }).includes(" libx264 ");
  } catch {
    return false;
  }
})();

let server: http.Server;
let url: string;
let folder: string;
type Post = { takes: unknown[]; tracks: unknown[] };
let takes: unknown[];
let tracks: unknown[];
/** The post as an edit leaves it, on disk or in the editor. */
let edited: Post | null;
/** The post an open editor holds, or null when none has it open. */
let editor: Post | null;
let posts: { path: string; body: { ops: Record<string, unknown>[] } }[];

beforeEach(async () => {
  takes = [];
  tracks = [];
  edited = null;
  editor = null;
  posts = [];
  folder = await fs.mkdtemp(path.join(os.tmpdir(), "capture-cli-"));
  server = http.createServer((request, response) => {
    let text = "";
    request.on("data", (chunk) => (text += chunk));
    request.on("end", () => {
      const target = new URL(request.url ?? "/", "http://localhost");
      const send = (status: number, value: unknown) => {
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(JSON.stringify(value));
      };
      const query = target.searchParams;
      switch (`${request.method} ${target.pathname}`) {
        case "GET /api/dev/post-project":
          if (query.get("commandId"))
            return send(200, {
              commandId: query.get("commandId"),
              status: "completed",
              message: "Applied in editor.",
            });
          if (query.get("sessionId")) return send(200, { snapshot: editor });
          return send(200, {
            sessions: editor ? [{ id: "editor-1", featureSlug: "promo" }] : [],
          });
        case "POST /api/dev/post-project":
          posts.push({ path: target.pathname, body: JSON.parse(text) });
          if (edited) editor = edited;
          return send(200, { commandId: "command-1", status: "pending" });
        case "GET /api/dev/feature-videos/promo":
          return send(200, {
            file: { project: { takes, tracks } },
            fingerprint: "f",
            folder,
          });
        case "POST /api/dev/feature-videos/promo/ops":
          posts.push({ path: target.pathname, body: JSON.parse(text) });
          if (edited) ({ takes, tracks } = edited);
          return send(200, { status: "applied", revision: 2 });
        default:
          return send(404, { message: "No such route." });
      }
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve())
  );
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(folder, { recursive: true, force: true });
});

async function cli(...args: string[]) {
  try {
    const { stdout, stderr } = await run(process.execPath, [
      CLI,
      ...args,
      "--url",
      url,
    ]);
    return { code: 0, stdout, stderr };
  } catch (cause) {
    const failed = cause as { code?: number; stdout?: string; stderr?: string };
    return {
      code: failed.code ?? 1,
      stdout: failed.stdout ?? "",
      stderr: failed.stderr ?? "",
    };
  }
}

const mediaUrl = (rel: string) => `/api/dev/feature-videos/promo/media/${rel}`;

describe("capture-info", () => {
  it("reports the folder, the recordings already there and the takes", async () => {
    await fs.mkdir(path.join(folder, "media", "captures"), { recursive: true });
    await fs.writeFile(
      path.join(folder, "media", "captures", "builder.1.mp4"),
      "x"
    );
    takes = [
      {
        id: "take-1",
        label: "builder",
        ref: { kind: "linked", url: mediaUrl("captures/builder.1.mp4") },
      },
    ];
    const result = await cli("capture-info", "--feature", "promo");
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      folder,
      existing: ["builder.1.mp4"],
      takes: [
        {
          id: "take-1",
          label: "builder",
          url: mediaUrl("captures/builder.1.mp4"),
        },
      ],
    });
  });

  it("reports no recordings when the folder does not exist yet", async () => {
    const result = await cli("capture-info", "--feature", "promo");
    expect(JSON.parse(result.stdout).existing).toEqual([]);
  });
});

describe.skipIf(!canEncode)("link-capture", () => {
  async function makeRecording(rel: string) {
    const file = path.join(folder, "media", ...rel.split("/"));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await run(toolPath("ffmpeg"), [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=64x112:d=1",
      "-pix_fmt",
      "yuv420p",
      file,
    ]);
  }

  it("adds a take the first time, labelled with the capture id", async () => {
    await makeRecording("captures/builder.1.mp4");
    const result = await cli(
      "link-capture",
      "--feature",
      "promo",
      "--capture",
      "builder",
      "--media",
      "captures/builder.1.mp4"
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      media: "captures/builder.1.mp4",
      take: null,
    });
    expect(posts).toHaveLength(1);
    const op = posts[0]!.body.ops[0]!;
    expect(op).toMatchObject({
      op: "add-take",
      url: mediaUrl("captures/builder.1.mp4"),
      label: "builder",
    });
    expect(op.durationSeconds).toBeCloseTo(1, 1);
  });

  it("relinks the take that plays an earlier recording", async () => {
    await makeRecording("captures/builder.2.mp4");
    takes = [
      {
        id: "take-1",
        label: "other",
        ref: { kind: "linked", url: mediaUrl("footage/a.mp4") },
      },
      {
        id: "take-2",
        label: "builder",
        ref: { kind: "linked", url: mediaUrl("captures/builder.1.mp4") },
      },
    ];
    const result = await cli(
      "link-capture",
      "--feature",
      "promo",
      "--capture",
      "builder",
      "--media",
      "captures/builder.2.mp4"
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ take: "take-2" });
    const op = posts[0]!.body.ops[0]!;
    expect(op).toMatchObject({
      op: "relink-take",
      take: "take-2",
      url: mediaUrl("captures/builder.2.mp4"),
    });
  });

  const builder = (n: number) => ({
    id: "take-2",
    label: "builder",
    ref: { kind: "linked", url: mediaUrl(`captures/builder.${n}.mp4`) },
  });
  const clip = (id: string, duration: number) => ({
    id,
    kind: "video",
    takeId: "take-2",
    duration,
  });

  it("finds the earlier take in the open editor's post", async () => {
    await makeRecording("captures/builder.2.mp4");
    editor = { takes: [builder(1)], tracks: [] };
    const result = await cli(
      "link-capture",
      "--feature",
      "promo",
      "--capture",
      "builder",
      "--media",
      "captures/builder.2.mp4"
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      take: "take-2",
      edit: { status: "completed" },
    });
    expect(posts).toHaveLength(1);
    expect(posts[0]!.path).toBe("/api/dev/post-project");
    expect(posts[0]!.body.ops[0]).toMatchObject({
      op: "relink-take",
      take: "take-2",
    });
  });

  it("names the clips a shorter recording removed or cut back", async () => {
    await makeRecording("captures/builder.2.mp4");
    takes = [builder(1)];
    tracks = [{ items: [clip("whole", 4), clip("late", 3)] }];
    edited = { takes: [builder(2)], tracks: [{ items: [clip("whole", 1)] }] };
    const result = await cli(
      "link-capture",
      "--feature",
      "promo",
      "--capture",
      "builder",
      "--media",
      "captures/builder.2.mp4"
    );
    expect(result.code).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.clips).toEqual({
      removed: ["late"],
      shortened: [{ id: "whole", from: 4, to: 1 }],
    });
    expect(output.note).toContain("Check the timeline");
  });

  it("refuses a media path that is not a recording of that capture", async () => {
    const result = await cli(
      "link-capture",
      "--feature",
      "promo",
      "--capture",
      "builder",
      "--media",
      "footage/a.mp4"
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--media must be captures/builder.<n>.mp4");
    expect(posts).toEqual([]);
  });
});
