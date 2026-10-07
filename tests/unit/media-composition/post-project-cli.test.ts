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

interface Session {
  id: string;
  sequenceId: string;
  featureSlug: string | null;
}
const ORDINARY: Session = {
  id: "ordinary",
  sequenceId: "seq",
  featureSlug: null,
};
const PROMO: Session = {
  id: "promo-editor",
  sequenceId: "seq",
  featureSlug: "promo",
};

let server: http.Server;
let url: string;
let folder: string;
let sessions: Session[];
let calls: { method: string; path: string; body: unknown }[];

/** A dev server stand-in for the bridge and the feature video routes. */
beforeEach(async () => {
  calls = [];
  sessions = [];
  folder = await fs.mkdtemp(path.join(os.tmpdir(), "feature-cli-"));
  server = http.createServer((request, response) => {
    let text = "";
    request.on("data", (chunk) => (text += chunk));
    request.on("end", () => {
      const target = new URL(request.url ?? "/", "http://localhost");
      calls.push({
        method: request.method ?? "GET",
        path: target.pathname,
        body: text ? JSON.parse(text) : undefined,
      });
      const send = (status: number, value: unknown) => {
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(JSON.stringify(value));
      };
      switch (`${request.method} ${target.pathname}`) {
        case "GET /api/dev/post-project":
          return send(
            200,
            target.searchParams.has("commandId")
              ? { status: "completed" }
              : target.searchParams.has("sessionId")
                ? { snapshot: { tracks: [] } }
                : { sessions }
          );
        case "POST /api/dev/post-project":
          return send(200, { status: "pending", commandId: "c1" });
        case "GET /api/dev/feature-videos":
          return send(200, { projects: [], unreadable: [] });
        case "POST /api/dev/feature-videos":
          return send(201, { file: { slug: "promo" }, folder });
        case "GET /api/dev/feature-videos/promo":
          return send(200, {
            file: { project: { tracks: [] } },
            fingerprint: "f",
            folder,
          });
        case "POST /api/dev/feature-videos/promo/ops":
          return send(200, { status: "applied", revision: 2 });
        case "POST /api/dev/feature-videos/promo/duplicate":
          return send(201, { file: { slug: "promo-30s" }, folder });
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

/** Runs the CLI against the stand-in; reports failures instead of throwing. */
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

const posts = () =>
  calls
    .filter((call) => call.method === "POST")
    .map((call) => [call.path, call.body]);

describe("post-project.mjs with feature videos", () => {
  it("sends a feature video's edit to the editor that has it open", async () => {
    sessions = [ORDINARY, PROMO];
    expect((await cli("background", "blur", "--feature", "promo")).code).toBe(
      0
    );
    expect(posts()).toEqual([
      [
        "/api/dev/post-project",
        {
          kind: "ops",
          sessionId: "promo-editor",
          ops: [{ op: "background", background: "blur" }],
        },
      ],
    ]);
  });

  it("writes the edit to the file when no editor has it open", async () => {
    sessions = [ORDINARY];
    const result = await cli(
      "remove-take",
      "--take",
      "take-2",
      "--feature",
      "promo"
    );
    expect(result.code).toBe(0);
    expect(posts()).toEqual([
      [
        "/api/dev/feature-videos/promo/ops",
        { ops: [{ op: "remove-take", take: "take-2" }] },
      ],
    ]);
  });

  it("stops while two editors have it open", async () => {
    sessions = [PROMO, { ...PROMO, id: "second" }];
    const result = await cli("background", "blur", "--feature", "promo");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "2 editors have promo open. Close all but one, then try again."
    );
    expect(posts()).toEqual([]);
  });

  it("never sends an edit without --feature to a feature video's editor", async () => {
    sessions = [PROMO];
    const alone = await cli("background", "blur");
    expect(alone.code).toBe(1);
    expect(alone.stderr).toContain("No open Post Studio editor matches");
    sessions = [ORDINARY, PROMO];
    expect((await cli("background", "blur")).code).toBe(0);
    expect(posts()).toEqual([
      [
        "/api/dev/post-project",
        {
          kind: "ops",
          sessionId: "ordinary",
          ops: [{ op: "background", background: "blur" }],
        },
      ],
    ]);
  });

  it("creates, copies, lists and shows feature videos through their routes", async () => {
    const created = await cli(
      "create",
      "promo",
      "--sequence",
      "DCKΨ-",
      "--title",
      "Promo 1.0",
      "--canvas",
      "9:16"
    );
    expect(created.code).toBe(0);
    const copied = await cli(
      "duplicate",
      "promo",
      "promo-30s",
      "--share-media",
      "--title",
      "Promo 30"
    );
    expect(copied.code).toBe(0);
    expect(posts()).toEqual([
      [
        "/api/dev/feature-videos",
        {
          slug: "promo",
          title: "Promo 1.0",
          sequenceId: "DCKΨ-",
          canvas: "9:16",
        },
      ],
      [
        "/api/dev/feature-videos/promo/duplicate",
        { slug: "promo-30s", title: "Promo 30", shareMedia: true },
      ],
    ]);
    expect(JSON.parse((await cli("features")).stdout)).toEqual({
      projects: [],
      unreadable: [],
    });
    const shown = await cli("show", "--feature", "promo", "--json");
    expect(JSON.parse(shown.stdout)).toEqual({ tracks: [] });
    expect(calls.at(-1)?.path).toBe("/api/dev/feature-videos/promo");
  });

  it.skipIf(!canEncode)(
    "copies footage into the project and adds it as a take",
    async () => {
      const source = path.join(folder, "Opening Shot.mp4");
      execFileSync(toolPath("ffmpeg"), [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=320x240:rate=30",
        "-t",
        "1",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        source,
      ]);
      const result = await cli(
        "add-take",
        source,
        "--feature",
        "promo",
        "--label",
        "Opening",
        "--append"
      );
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        media: "footage/opening-shot.mp4",
        converted: false,
      });
      const [sent] = posts() as [
        string,
        { ops: { op: string; durationSeconds: number }[] },
      ][];
      expect(sent?.[0]).toBe("/api/dev/feature-videos/promo/ops");
      expect(sent?.[1].ops[0]).toMatchObject({
        op: "add-take",
        url: "/api/dev/feature-videos/promo/media/footage/opening-shot.mp4",
        label: "Opening",
        append: true,
      });
      expect(sent?.[1].ops[0]?.durationSeconds).toBeCloseTo(1, 1);
      await fs.access(
        path.join(folder, "media", "footage", "opening-shot.mp4")
      );
    }
  );
});
