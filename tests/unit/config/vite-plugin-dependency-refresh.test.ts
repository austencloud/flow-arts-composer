import { EventEmitter } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createViteDependencyRefreshPlugin } from "../../../src/config/vite-plugin-dependency-refresh";
import type { ViteDevServer } from "vite";

const POLL_INTERVAL_MS = 20;
const RESTART_DELAY_MS = 20;
const temporaryRoots: string[] = [];
const openServers: EventEmitter[] = [];

afterEach(() => {
  for (const httpServer of openServers.splice(0)) httpServer.emit("close");
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function createProject(installedLockfile: string) {
  const projectRoot = mkdtempSync(
    path.join(tmpdir(), "tka-dependency-refresh-")
  );
  temporaryRoots.push(projectRoot);
  const lockfile = path.join(projectRoot, "node_modules", ".pnpm", "lock.yaml");
  mkdirSync(path.dirname(lockfile), { recursive: true });
  writeFileSync(lockfile, installedLockfile);
  writeFileSync(path.join(projectRoot, "pnpm-lock.yaml"), installedLockfile);
  return { projectRoot, lockfile };
}

// pnpm replaces the installed lockfile atomically, like write-file-atomic.
function replaceFile(filePath: string, content: string) {
  const temporaryPath = `${filePath}.tmp`;
  writeFileSync(temporaryPath, content);
  renameSync(temporaryPath, filePath);
}

function startPlugin(projectRoot: string) {
  const httpServer = new EventEmitter();
  openServers.push(httpServer);
  const restart = vi.fn(async () => {});
  const info = vi.fn();
  const server = {
    httpServer,
    restart,
    config: { logger: { info } },
  } as unknown as ViteDevServer;
  const plugin = createViteDependencyRefreshPlugin({
    projectRoot,
    pollIntervalMs: POLL_INTERVAL_MS,
    restartDelayMs: RESTART_DELAY_MS,
  });
  const configureServer = plugin.configureServer as (
    server: ViteDevServer
  ) => void;
  configureServer(server);
  return { httpServer, restart, info };
}

// Long enough for several polls plus the restart delay.
function quietPeriod(): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(resolve, (POLL_INTERVAL_MS + RESTART_DELAY_MS) * 10)
  );
}

describe("createViteDependencyRefreshPlugin", () => {
  it("restarts once, without forcing, after pnpm rewrites the installed lockfile", async () => {
    const { projectRoot, lockfile } = createProject("packages: {}\n");
    const { restart, info } = startPlugin(projectRoot);
    await quietPeriod();

    replaceFile(lockfile, "packages:\n  three@0.182.0: {}\n");

    await vi.waitFor(() => expect(restart).toHaveBeenCalledOnce(), {
      timeout: 5_000,
    });
    expect(restart).toHaveBeenCalledWith();
    expect(info).toHaveBeenCalledOnce();
  });

  it("waits for the install instead of reacting to git's pnpm-lock.yaml edit", async () => {
    const { projectRoot } = createProject("packages: {}\n");
    const { restart } = startPlugin(projectRoot);
    await quietPeriod();

    replaceFile(
      path.join(projectRoot, "pnpm-lock.yaml"),
      "packages:\n  three@0.182.0: {}\n"
    );
    await quietPeriod();

    expect(restart).not.toHaveBeenCalled();
  });

  it("ignores a rewrite that leaves the installed packages unchanged", async () => {
    const { projectRoot, lockfile } = createProject("packages: {}\n");
    const { restart } = startPlugin(projectRoot);
    await quietPeriod();

    replaceFile(lockfile, "packages: {}\n");
    await quietPeriod();

    expect(restart).not.toHaveBeenCalled();
  });

  it("stops polling when the server closes", async () => {
    const { projectRoot, lockfile } = createProject("packages: {}\n");
    const { httpServer, restart } = startPlugin(projectRoot);
    await quietPeriod();

    httpServer.emit("close");
    replaceFile(lockfile, "packages:\n  three@0.182.0: {}\n");
    await quietPeriod();

    expect(restart).not.toHaveBeenCalled();
  });

  it("polls the same file Vite hashes to decide its dependency cache is stale", () => {
    const viteNodeDist = path.resolve("node_modules/vite/dist/node");
    const viteSource = readdirSync(viteNodeDist, { recursive: true })
      .map(String)
      .filter((file) => file.endsWith(".js"))
      .map((file) => readFileSync(path.join(viteNodeDist, file), "utf8"))
      .join("\n");

    expect(viteSource).toContain('"node_modules/.pnpm/lock.yaml"');
  });
});
