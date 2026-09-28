import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedConfig, UserConfig } from "vite";
import { deployStaticCopyPlugin } from "../../../src/config/vite-plugin-deploy-static-copy";

const tempRoots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function listFiles(dir: string): string[] {
  return (fs.readdirSync(dir, { recursive: true }) as string[])
    .filter((entry) => fs.statSync(path.join(dir, entry)).isFile())
    .map((entry) => entry.split(path.sep).join("/"))
    .sort();
}

describe("deployStaticCopyPlugin", () => {
  it("copies static/ into the client build without the files the deploy trim deletes", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-static-copy-"));
    tempRoots.push(root);
    const staticFiles = [
      "robots.txt",
      "images/thumbnails/letter-a.svg",
      "models/forest/oak.glb",
      "textures/autumn-floor/ground-detail-modulation.ktx2",
      // Deleted by scripts/trim-deploy-assets.js, so never copied.
      "sketches/mockup.html",
      "models/autumn/hero-tree-a.glb",
      "models/forest/oak_raw.glb",
      "textures/autumn-floor/soil-albedo.jpg",
    ];
    for (const file of staticFiles) {
      const target = path.join(root, "static", file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file);
    }

    const plugin = deployStaticCopyPlugin();
    const config = plugin.config as (config: UserConfig) => UserConfig | void;
    const configResolved = plugin.configResolved as (config: ResolvedConfig) => void;
    const renderStart = (plugin.renderStart as { handler: () => void }).handler;

    const outDir = ".svelte-kit/output/client";
    expect(config({ build: { outDir } })).toEqual({ build: { copyPublicDir: false } });
    configResolved({
      root,
      publicDir: path.join(root, "static"),
      build: { outDir, write: true, copyPublicDir: false },
    } as ResolvedConfig);
    renderStart();

    expect(listFiles(path.join(root, outDir))).toEqual([
      "images/thumbnails/letter-a.svg",
      "models/forest/oak.glb",
      "robots.txt",
      "textures/autumn-floor/ground-detail-modulation.ktx2",
    ]);
  });
});
