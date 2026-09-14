import { beforeEach, describe, expect, it, vi } from "vitest";

const readFile = vi.hoisted(() => vi.fn());
vi.mock("node:fs/promises", () => ({
  readFile,
  default: { readFile },
}));

import { GET } from "./[kind]/[name]/+server";

function event(kind: string, name: string) {
  return {
    params: { kind, name },
    url: new URL("https://localhost:5173/test/character-playground/thumbs"),
    getClientAddress: () => "::1",
  } as Parameters<typeof GET>[0];
}

describe("character creator thumbnail boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readFile.mockResolvedValue(Buffer.from("png"));
  });

  it("serves an allowlisted thumbnail as a local PNG", async () => {
    const response = await GET(event("hair", "short01"));
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(readFile).toHaveBeenCalledOnce();
  });

  it.each(["constructor", "__proto__", "../../clothes", "missing"])(
    "rejects malformed asset group %s without reading a file",
    async (kind) => {
      await expect(GET(event(kind, "short01"))).rejects.toMatchObject({
        status: 404,
      });
      expect(readFile).not.toHaveBeenCalled();
    }
  );

  it("rejects a path-like asset name without reading a file", async () => {
    await expect(GET(event("hair", "../../short01"))).rejects.toMatchObject({
      status: 404,
    });
    expect(readFile).not.toHaveBeenCalled();
  });
});
