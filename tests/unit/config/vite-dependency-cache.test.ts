import {
  createViteDependencyCachePlan,
  getViteDependencyCacheDir,
  resolveViteDevPort,
} from "../../../src/config/vite-dependency-cache";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryRoots: string[] = [];

function createTemporaryProject(): string {
  const projectRoot = mkdtempSync(
    path.join(tmpdir(), "tka-vite-dependency-cache-")
  );
  temporaryRoots.push(projectRoot);
  return projectRoot;
}

function writeFile(filePath: string, contents: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents, "utf8");
}

function writeMetadata(
  cacheDir: string,
  dependencyId: string,
  sourcePath: string
): void {
  const metadataPath = path.join(cacheDir, "deps", "_metadata.json");
  const relativeSourcePath = path
    .relative(path.dirname(metadataPath), sourcePath)
    .replaceAll(path.sep, "/");

  writeFile(
    metadataPath,
    JSON.stringify({
      optimized: {
        [dependencyId]: { src: relativeSourcePath },
      },
    })
  );
}

afterEach(() => {
  for (const projectRoot of temporaryRoots.splice(0)) {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

describe("resolveViteDevPort", () => {
  it("uses either Vite CLI port syntax before the startup environment", () => {
    expect(
      resolveViteDevPort(["vite", "--port", "5174"], {
        TKA_VITE_PORT: "5185",
      })
    ).toBe(5174);
    expect(resolveViteDevPort(["vite", "--port=5185"])).toBe(5185);
  });

  it("falls back to the canonical development port", () => {
    expect(resolveViteDevPort(["vite"])).toBe(5173);
  });
});

describe("createViteDependencyCachePlan", () => {
  it("isolates dependency caches by development port", () => {
    const projectRoot = createTemporaryProject();

    expect(getViteDependencyCacheDir(projectRoot, 5173)).not.toBe(
      getViteDependencyCacheDir(projectRoot, 5174)
    );
  });

  it("keeps a cache whose source belongs to the installed package", () => {
    const projectRoot = createTemporaryProject();
    const installedSource = path.join(
      projectRoot,
      "node_modules/@scope/package/dist/index.js"
    );
    writeFile(
      path.join(projectRoot, "node_modules/@scope/package/package.json"),
      "{}"
    );
    writeFile(installedSource, "export {};\n");

    const cacheDir = getViteDependencyCacheDir(projectRoot, 5173);
    writeMetadata(cacheDir, "@scope/package", installedSource);

    expect(createViteDependencyCachePlan({ projectRoot })).toMatchObject({
      forceRefresh: false,
      reason: null,
      staleDependencies: [],
    });
  });

  it("forces Vite to rebuild when cached source points at an old package", () => {
    const projectRoot = createTemporaryProject();
    writeFile(
      path.join(projectRoot, "node_modules/@scope/package/package.json"),
      "{}"
    );
    const staleSource = path.join(
      projectRoot,
      "node_modules/.pnpm/@scope+package@1.0.0/node_modules/@scope/package/dist/index.js"
    );
    writeFile(staleSource, "export {};\n");

    const cacheDir = getViteDependencyCacheDir(projectRoot, 5173);
    writeMetadata(cacheDir, "@scope/package/card", staleSource);

    expect(createViteDependencyCachePlan({ projectRoot })).toMatchObject({
      forceRefresh: true,
      reason: "stale-dependencies",
      staleDependencies: ["@scope/package"],
    });
  });

  it("forces Vite to rebuild corrupt metadata", () => {
    const projectRoot = createTemporaryProject();
    const cacheDir = getViteDependencyCacheDir(projectRoot, 5173);
    writeFile(path.join(cacheDir, "deps", "_metadata.json"), "not json");

    expect(createViteDependencyCachePlan({ projectRoot })).toMatchObject({
      forceRefresh: true,
      reason: "invalid-metadata",
    });
  });

  it("forces one clean optimizer pass after startup repairs the install", () => {
    const projectRoot = createTemporaryProject();

    expect(
      createViteDependencyCachePlan({
        env: { TKA_FORCE_VITE_DEPS: "1" },
        projectRoot,
      })
    ).toMatchObject({
      forceRefresh: true,
      reason: "repaired-install",
    });
  });
});
