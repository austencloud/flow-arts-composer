import { describe, expect, it } from "vitest";

import {
  createDesktopAssetResolver,
  createDesktopFetch,
  toBundlePath,
} from "#lib/shared/desktop/desktop-asset-url.js";

const ORIGIN = "https://tka-assets.localhost";
const PAGE = "https://tauri.localhost";

describe("toBundlePath", () => {
  it("maps static asset roots to bundle-relative paths", () => {
    expect(toBundlePath("/models/forest/forest-environment.glb")).toBe(
      "models/forest/forest-environment.glb"
    );
    expect(toBundlePath("/draco/draco_decoder.wasm")).toBe(
      "draco/draco_decoder.wasm"
    );
    expect(toBundlePath("/textures/moon.png?v=2")).toBe("textures/moon.png");
  });

  it("maps R2 URLs under the r2/ prefix", () => {
    expect(
      toBundlePath(
        "https://assets.tkaflowarts.com/models/avatars/v2026-07-23-r1/x-bot.glb.bin"
      )
    ).toBe("r2/models/avatars/v2026-07-23-r1/x-bot.glb.bin");
    expect(toBundlePath("https://pub-abc.r2.dev/models/ocean/reef.glb")).toBe(
      "r2/models/ocean/reef.glb"
    );
  });

  it("maps absolute same-origin URLs like relative ones", () => {
    expect(toBundlePath(`${PAGE}/models/x.glb`, PAGE)).toBe("models/x.glb");
    expect(toBundlePath("https://example.com/models/x.glb", PAGE)).toBeNull();
  });

  it("ignores everything the bundle cannot hold", () => {
    expect(toBundlePath("/images/props/staff.svg")).toBeNull();
    expect(toBundlePath("data:image/png;base64,AAAA")).toBeNull();
    expect(toBundlePath("blob:https://tauri.localhost/abc")).toBeNull();
    expect(toBundlePath("/models/")).toBeNull();
    expect(toBundlePath("/models/../secrets")).toBeNull();
    expect(toBundlePath("")).toBeNull();
    expect(toBundlePath("not a url")).toBeNull();
  });
});

describe("createDesktopAssetResolver", () => {
  const bundled = new Set([
    "models/forest/forest-environment.glb",
    "r2/models/ocean/ocean_flora_scene.glb",
    "models/celestial/cloud break.glb",
  ]);
  const resolve = createDesktopAssetResolver({
    origin: `${ORIGIN}/`,
    has: (path) => bundled.has(path),
    pageOrigin: PAGE,
  });

  it("rewrites bundled assets onto the scheme origin", () => {
    expect(resolve("/models/forest/forest-environment.glb")).toBe(
      `${ORIGIN}/models/forest/forest-environment.glb`
    );
    expect(
      resolve("https://assets.tkaflowarts.com/models/ocean/ocean_flora_scene.glb")
    ).toBe(`${ORIGIN}/r2/models/ocean/ocean_flora_scene.glb`);
  });

  it("percent-encodes path segments it emits", () => {
    expect(resolve("/models/celestial/cloud%20break.glb")).toBe(
      `${ORIGIN}/models/celestial/cloud%20break.glb`
    );
  });

  it("passes unbundled and foreign URLs through unchanged", () => {
    const unbundled = "/models/winter/winter-environment.glb";
    expect(resolve(unbundled)).toBe(unbundled);
    const foreign = "https://cdn.example.com/models/x.glb";
    expect(resolve(foreign)).toBe(foreign);
    expect(resolve("/images/grid/diamond.svg")).toBe("/images/grid/diamond.svg");
  });
});

describe("createDesktopFetch", () => {
  const resolve = (url: string) =>
    url === "/animations/turns/turn-left-90.glb"
      ? "https://tka-assets.localhost/animations/turns/turn-left-90.glb"
      : url;

  it("rewrites string, URL, and Request inputs that resolve onto the bundle", async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const base = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push([
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        init,
      ]);
      return new Response("");
    }) as typeof fetch;
    const wrapped = createDesktopFetch(resolve, base);

    await wrapped("/animations/turns/turn-left-90.glb", { method: "HEAD" });
    await wrapped(new Request("https://tauri.localhost/animations/turns/turn-left-90.glb"));
    await wrapped("/api/things");

    expect(calls[0]).toEqual([
      "https://tka-assets.localhost/animations/turns/turn-left-90.glb",
      { method: "HEAD" },
    ]);
    // Absolute same-origin Request URLs are the resolver's job; here it is a passthrough.
    expect(calls[1][0]).toBe("https://tauri.localhost/animations/turns/turn-left-90.glb");
    expect(calls[2][0]).toBe("/api/things");
  });
});
