import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Adapter, Emulator } from "@sveltejs/kit";
import { shareCloudflareDevPlatform } from "../../../src/config/cloudflare-dev-platform.js";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function createProject(): string {
  const root = mkdtempSync(path.join(tmpdir(), "tka-cloudflare-dev-platform-"));
  temporaryRoots.push(root);
  writeFileSync(path.join(root, "wrangler.toml"), 'name = "tka"\n');
  return root;
}

// Mirrors @sveltejs/adapter-cloudflare 7.2: each emulate() call gets a fresh
// cache, and `emulated ??= await start()` lets concurrent first requests each
// start their own platform proxy, which is one workerd process apiece.
function createCloudflareLikeAdapter(
  startProxy: () => Promise<App.Platform>
): Adapter {
  return {
    name: "cloudflare-like",
    adapt() {},
    emulate() {
      let emulated:
        | { platform: App.Platform; prerender_platform: App.Platform }
        | undefined;
      return {
        async platform({ prerender }) {
          emulated ??= {
            platform: await startProxy(),
            prerender_platform: {} as App.Platform,
          };
          return prerender ? emulated.prerender_platform : emulated.platform;
        },
      };
    },
  };
}

function startProxySlowly() {
  return vi.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return {} as App.Platform;
  });
}

async function emulate(adapter: Adapter): Promise<Emulator> {
  const emulator = await adapter.emulate?.();
  if (!emulator) throw new Error("adapter has no emulator");
  return emulator;
}

function requestPlatform(emulator: Emulator, prerender = false) {
  return emulator.platform?.({ config: {}, prerender });
}

describe("shareCloudflareDevPlatform", () => {
  it("starts one platform for a burst of first requests", async () => {
    const startProxy = startProxySlowly();
    const emulator = await emulate(
      shareCloudflareDevPlatform(createCloudflareLikeAdapter(startProxy), {
        root: createProject(),
      })
    );

    const platforms = await Promise.all(
      Array.from({ length: 10 }, () => requestPlatform(emulator))
    );

    expect(startProxy).toHaveBeenCalledOnce();
    expect(new Set(platforms).size).toBe(1);
    expect(await requestPlatform(emulator, true)).not.toBe(platforms[0]);
  });

  it("retries a failed start with the next waiting request", async () => {
    const startProxy = vi
      .fn<() => Promise<App.Platform>>()
      .mockRejectedValueOnce(new Error("workerd exited"))
      .mockResolvedValue({} as App.Platform);
    const emulator = await emulate(
      shareCloudflareDevPlatform(createCloudflareLikeAdapter(startProxy), {
        root: createProject(),
      })
    );

    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () => requestPlatform(emulator))
    );

    expect(results.map((result) => result.status)).toEqual([
      "rejected",
      "fulfilled",
      "fulfilled",
    ]);
    expect(startProxy).toHaveBeenCalledTimes(2);
  });

  it("keeps the running platform when Vite restarts and reloads the config", async () => {
    const root = createProject();
    const startProxy = startProxySlowly();
    const beforeRestart = await emulate(
      shareCloudflareDevPlatform(createCloudflareLikeAdapter(startProxy), {
        root,
      })
    );
    const platform = await requestPlatform(beforeRestart);

    const afterRestart = await emulate(
      shareCloudflareDevPlatform(createCloudflareLikeAdapter(startProxy), {
        root,
      })
    );

    expect(await requestPlatform(afterRestart)).toBe(platform);
    expect(startProxy).toHaveBeenCalledOnce();
  });

  it("starts a new platform when local Cloudflare vars change", async () => {
    const root = createProject();
    const startProxy = startProxySlowly();
    const beforeEdit = await emulate(
      shareCloudflareDevPlatform(createCloudflareLikeAdapter(startProxy), {
        root,
      })
    );
    const platform = await requestPlatform(beforeEdit);

    writeFileSync(path.join(root, ".dev.vars"), "API_TOKEN=local\n");
    const afterEdit = await emulate(
      shareCloudflareDevPlatform(createCloudflareLikeAdapter(startProxy), {
        root,
      })
    );

    expect(await requestPlatform(afterEdit)).not.toBe(platform);
    expect(startProxy).toHaveBeenCalledTimes(2);
  });
});
