/**
 * AUDIT (read-only): path composition in the dev-guarded filesystem writers.
 *
 * These endpoints 403 outside `vite dev`, so nothing here is a production
 * exposure. What they establish is the difference between the two shapes the
 * repository uses for the same job: siblings that sanitise every segment they
 * interpolate, and one that interpolates two request fields raw.
 *
 * `fs` is mocked, so the suite observes the composed path without touching
 * disk. `$app/environment` reports dev:true (see the suite's stub).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";

const writes: Array<{ file: string; bytes: number }> = [];
const dirs: string[] = [];

vi.mock("fs", () => {
  const api = {
    existsSync: () => false,
    mkdirSync: (dir: string) => {
      dirs.push(dir);
    },
    writeFileSync: (file: string, data: Buffer) => {
      writes.push({ file, bytes: data.length });
    },
  };
  return { ...api, default: api };
});

const PNG_BASE64 = Buffer.from("not-really-a-png").toString("base64");

function saveRequest(body: unknown) {
  return {
    request: new Request("https://localhost:5173/api/dev/save-pictograph", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  };
}

/** Where the endpoint intends to write: <cwd>/static/pictographs/... */
const INTENDED_ROOT = path.join(process.cwd(), "static", "pictographs");

function escapesIntendedRoot(target: string): boolean {
  const resolved = path.resolve(target);
  return (
    resolved !== INTENDED_ROOT && !resolved.startsWith(INTENDED_ROOT + path.sep)
  );
}

describe("/api/dev/save-pictograph composes its path from unvalidated fields", () => {
  beforeEach(() => {
    writes.length = 0;
    dirs.length = 0;
  });

  it("writes inside static/pictographs for an ordinary request", async () => {
    const { POST } =
      await import("../../src/routes/api/dev/save-pictograph/+server");
    const response = await POST(
      saveRequest({
        letter: "A",
        variation: 1,
        gridMode: "diamond",
        base64: PNG_BASE64,
      }) as never
    );

    expect(response.status).toBe(200);
    expect(dirs).toHaveLength(1);
    expect(escapesIntendedRoot(dirs[0]!)).toBe(false);
  });

  it("follows `gridMode` out of the static tree", async () => {
    const { POST } =
      await import("../../src/routes/api/dev/save-pictograph/+server");
    // `gridMode` is typed "diamond" | "box" but never checked at runtime; it is
    // interpolated straight into path.join.
    const response = await POST(
      saveRequest({
        letter: "A",
        variation: 1,
        gridMode: "../../../../tmp/audit-escape",
        base64: PNG_BASE64,
      }) as never
    );

    expect(response.status).toBe(200);
    expect(escapesIntendedRoot(dirs[0]!)).toBe(true);
    expect(path.resolve(dirs[0]!)).toContain("tmp/audit-escape");
  });

  it("follows `propType` out of the static tree through the filename", async () => {
    const { POST } =
      await import("../../src/routes/api/dev/save-pictograph/+server");
    const response = await POST(
      saveRequest({
        letter: "A",
        variation: 1,
        gridMode: "diamond",
        propType: "../../../../../tmp/audit-escape/owned",
        base64: PNG_BASE64,
      }) as never
    );

    expect(response.status).toBe(200);
    expect(writes).toHaveLength(1);
    expect(escapesIntendedRoot(writes[0]!.file)).toBe(true);
  });

  it("decodes the base64 body before any length check", async () => {
    const { POST } =
      await import("../../src/routes/api/dev/save-pictograph/+server");
    // There is no bound on `base64` at all; the buffer is allocated whatever
    // its size, and the response reports it back.
    const big = "A".repeat(4 * 1024 * 1024);
    const response = await POST(
      saveRequest({
        letter: "A",
        variation: 1,
        gridMode: "diamond",
        base64: big,
      }) as never
    );

    const payload = (await response.json()) as { sizeBytes: number };
    // 4 MiB of base64 decodes to exactly 3 MiB, allocated with no check.
    expect(payload.sizeBytes).toBe(Buffer.from(big, "base64").length);
    expect(payload.sizeBytes).toBe(3 * 1024 * 1024);
  });
});

describe("the sibling endpoints that do sanitise (contrast)", () => {
  it("view-capture collapses every unsafe character in its directory segment", async () => {
    const { POST } =
      await import("../../src/routes/api/dev/view-capture/+server");
    const response = await POST({
      request: new Request("https://localhost:5173/api/dev/view-capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sceneId: "../../../../tmp/audit-escape",
          base64: PNG_BASE64,
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { path: string };
    expect(payload.path).not.toContain("..");
    expect(payload.path).toMatch(/^\/captures\/[a-z0-9-_]+\//i);
  });
});
