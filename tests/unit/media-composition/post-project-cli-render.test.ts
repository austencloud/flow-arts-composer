import { execFile } from "node:child_process";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);
const CLI = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../scripts/post-project.mjs"
);

let server: http.Server;
let url: string;
/** Whether an editor has the feature video open. */
let editorOpen: boolean;
/** The render statuses the bridge answers, in turn. */
let statuses: Record<string, unknown>[];
let posts: { path: string; body: Record<string, unknown> }[];
/** The project on disk. */
let disk: Record<string, unknown>;

beforeEach(async () => {
  editorOpen = true;
  statuses = [];
  posts = [];
  disk = { audio: "takes", tracks: [] };
  server = http.createServer((request, response) => {
    let text = "";
    request.on("data", (chunk) => (text += chunk));
    request.on("end", () => {
      const target = new URL(request.url ?? "/", "http://localhost");
      const query = target.searchParams;
      const send = (status: number, value: unknown) => {
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(JSON.stringify(value));
      };
      switch (`${request.method} ${target.pathname}`) {
        case "GET /api/dev/post-project":
          if (query.get("renderId"))
            return send(
              200,
              statuses.shift() ?? { state: "failed", message: "No status." }
            );
          if (query.get("commandId"))
            return send(200, {
              commandId: query.get("commandId"),
              status: "completed",
              message: "Applied in editor.",
            });
          return send(200, {
            sessions: editorOpen
              ? [{ id: "editor-1", featureSlug: "promo" }]
              : [],
          });
        case "POST /api/dev/post-project": {
          const body = JSON.parse(text);
          posts.push({ path: target.pathname, body });
          if (body.kind === "render")
            return send(200, { renderId: "render-1", state: "queued" });
          return send(200, { commandId: "command-1", status: "pending" });
        }
        case "GET /api/dev/feature-videos/promo":
          return send(200, {
            file: { project: disk },
            fingerprint: "f",
            folder: "C:/promo",
          });
        case "POST /api/dev/feature-videos/promo/ops":
          posts.push({ path: target.pathname, body: JSON.parse(text) });
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
});

async function cli(...args: string[]) {
  try {
    const { stdout, stderr } = await run(
      process.execPath,
      [CLI, ...args, "--url", url],
      { env: { ...process.env, TKA_RENDER_POLL_MS: "10" } }
    );
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

describe("render", () => {
  it("renders through the open editor and prints the saved file", async () => {
    statuses = [
      { state: "queued", phase: null, percent: 0 },
      { state: "rendering", phase: "rendering", percent: 50 },
      {
        state: "completed",
        phase: "rendering",
        percent: 100,
        file: "exports/check.mp4",
        path: "C:/promo/exports/check.mp4",
        bytes: 2048,
      },
    ];
    const result = await cli("render", "--feature", "promo", "--name", "check");
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      file: "exports/check.mp4",
      path: "C:/promo/exports/check.mp4",
      bytes: 2048,
    });
    expect(result.stderr).toContain("rendering 50%");
    expect(posts).toEqual([
      {
        path: "/api/dev/post-project",
        body: { kind: "render", sessionId: "editor-1", name: "check.mp4" },
      },
    ]);
  });

  it("fails with the editor's reason", async () => {
    statuses = [
      {
        state: "failed",
        phase: null,
        percent: 0,
        message: "The render was cancelled.",
      },
    ];
    const result = await cli("render", "--feature", "promo");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("The render was cancelled.");
    expect(posts[0]!.body).toEqual({ kind: "render", sessionId: "editor-1" });
  });

  it("says how to open the editor when none has it", async () => {
    editorOpen = false;
    const result = await cli("render", "--feature", "promo");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      `Open http://localhost:${new URL(url).port}/post?feature=promo, or pass --open.`
    );
    expect(posts).toEqual([]);
  });

  it("stops at a feature video that does not exist", async () => {
    editorOpen = false;
    const result = await cli("render", "--feature", "nope");
    expect(result.code).toBe(1);
    // This stand-in dev server answers so for any feature video but promo.
    expect(result.stderr).toContain("No such route.");
    expect(result.stderr).not.toContain("or pass --open");
    expect(posts).toEqual([]);
  });
});

describe("sound and add-card", () => {
  it("send their ops", async () => {
    editorOpen = false;
    expect((await cli("sound", "silent", "--feature", "promo")).code).toBe(0);
    const added = await cli(
      "add-card",
      "--feature",
      "promo",
      "--label",
      "End",
      "--qr-url",
      "https://example.com/end",
      "--fade-in",
      "0.5"
    );
    expect(added.code).toBe(0);
    expect(posts).toEqual([
      {
        path: "/api/dev/feature-videos/promo/ops",
        body: { ops: [{ op: "sound", sound: "silent" }] },
      },
      {
        path: "/api/dev/feature-videos/promo/ops",
        body: {
          ops: [
            {
              op: "add-card",
              label: "End",
              qrUrl: "https://example.com/end",
              fadeIn: 0.5,
            },
          ],
        },
      },
    ]);
  });
});

describe("show", () => {
  it("prints a card's link and the sound", async () => {
    editorOpen = false;
    disk = {
      audio: "silent",
      tracks: [
        {
          items: [
            {
              id: "card-1",
              kind: "card",
              start: 0,
              duration: 5,
              label: "End",
              qrUrl: "https://example.com/end",
            },
          ],
        },
      ],
    };
    const result = await cli("show", "--feature", "promo");
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
      'track 0  card-1  card  0.00s +5.00s  "End"  QR https://example.com/end\nsound silent\n'
    );
  });
});

describe("stills and contact-sheet", () => {
  it("refuse bad times and column counts before ffmpeg runs", async () => {
    const stills = await cli("stills", "x.mp4", "--at", "soon");
    expect(stills.code).toBe(1);
    expect(stills.stderr).toContain(
      "--at takes seconds separated by commas, like 0,4,6.5."
    );
    const sheet = await cli("contact-sheet", "x.mp4", "--columns", "0");
    expect(sheet.code).toBe(1);
    expect(sheet.stderr).toContain(
      "--columns must be a whole number from 1 to 30."
    );
  });
});
