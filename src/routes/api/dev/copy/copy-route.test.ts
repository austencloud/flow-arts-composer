import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";

const env = vi.hoisted(() => ({ dev: true }));
vi.mock("$app/env", () => ({
  get dev() {
    return env.dev;
  },
}));
import { POST } from "./+server";

const FILE = "src/page/copy.json";

const post = (body: unknown, contentType = "application/json") =>
  POST({
    request: new Request("https://localhost/api/dev/copy", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: JSON.stringify(body),
    }),
  } as RequestEvent);

describe("dev copy endpoint", () => {
  let root: string;

  beforeEach(() => {
    env.dev = true;
    root = mkdtempSync(join(tmpdir(), "copy-route-"));
    mkdirSync(join(root, "src/page"), { recursive: true });
    writeFileSync(join(root, FILE), '{"a":"old"}');
    vi.spyOn(process, "cwd").mockReturnValue(root);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it("refuses in production without touching the file", async () => {
    env.dev = false;
    const response = await post({ file: FILE, copy: { a: "new" } });
    expect(response.status).toBe(403);
    expect(readFileSync(join(root, FILE), "utf-8")).toBe('{"a":"old"}');
  });

  it("never creates a file", async () => {
    const response = await post({
      file: "src/other/copy.json",
      copy: { a: "new" },
    });
    expect(response.status).toBe(404);
  });

  it("refuses a value that is not a string", async () => {
    const response = await post({ file: FILE, copy: { a: { nested: "x" } } });
    expect(response.status).toBe(400);
    expect(readFileSync(join(root, FILE), "utf-8")).toBe('{"a":"old"}');
  });

  it("refuses a path outside the copy.json convention", async () => {
    const response = await post({ file: "../copy.json", copy: { a: "new" } });
    expect(response.status).toBe(400);
  });

  it("refuses a body a foreign page could send without a preflight", async () => {
    const response = await post(
      { file: FILE, copy: { a: "new" } },
      "text/plain"
    );
    expect(response.status).toBe(415);
  });

  it("writes formatted JSON and leaves no temp file behind", async () => {
    const response = await post({ file: FILE, copy: { a: "new", b: "two" } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(readFileSync(join(root, FILE), "utf-8")).toBe(
      '{\n  "a": "new",\n  "b": "two"\n}\n'
    );
    expect(readdirSync(join(root, "src/page"))).toEqual(["copy.json"]);
  });
});
