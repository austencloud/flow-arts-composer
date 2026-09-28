import { createHash } from "node:crypto";
import { readFileSync, unwatchFile, watchFile, type Stats } from "node:fs";
import { getInstalledDependencyStatePath } from "./vite-dependency-cache";
import type { Plugin, ViteDevServer } from "vite";

interface ViteDependencyRefreshPluginOptions {
  projectRoot: string;
  pollIntervalMs?: number;
  restartDelayMs?: number;
}

function hashInstalledDependencyState(statePath: string): string | null {
  try {
    return createHash("sha256").update(readFileSync(statePath)).digest("hex");
  } catch {
    return null;
  }
}

/**
 * Restarts Vite once after pnpm changes node_modules.
 *
 * Vite decides whether its optimized dependency cache is stale by hashing the
 * lockfile pnpm writes into node_modules at the end of an install, so a plain
 * restart re-optimizes exactly when installed packages changed. Reacting to
 * pnpm-lock.yaml instead restarted the server when git merged a lockfile edit,
 * before any install ran: that restart rebuilt nothing, and the install that
 * followed went unnoticed.
 *
 * Vite's own watcher always ignores node_modules, so the plugin polls the file.
 */
export function createViteDependencyRefreshPlugin({
  projectRoot,
  pollIntervalMs = 1000,
  restartDelayMs = 750,
}: ViteDependencyRefreshPluginOptions): Plugin {
  return {
    name: "dependency-cache-live-refresh",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      const statePath = getInstalledDependencyStatePath(projectRoot);
      let knownState = hashInstalledDependencyState(statePath);
      let restartTimer: ReturnType<typeof setTimeout> | undefined;

      const restartIfDependenciesChanged = () => {
        restartTimer = undefined;
        const currentState = hashInstalledDependencyState(statePath);
        // A missing file means an install is still rebuilding node_modules.
        // Its final write schedules another check.
        if (currentState === null || currentState === knownState) return;

        knownState = currentState;
        server.config.logger.info(
          "Installed dependencies changed. Restarting Vite to refresh its dependency cache..."
        );
        void server.restart();
      };

      const scheduleRefresh = (current: Stats, previous: Stats) => {
        if (
          current.mtimeMs === previous.mtimeMs &&
          current.size === previous.size
        ) {
          return;
        }

        if (restartTimer) clearTimeout(restartTimer);
        restartTimer = setTimeout(restartIfDependenciesChanged, restartDelayMs);
      };

      watchFile(
        statePath,
        { interval: pollIntervalMs, persistent: false },
        scheduleRefresh
      );
      server.httpServer?.once("close", () => {
        if (restartTimer) clearTimeout(restartTimer);
        unwatchFile(statePath, scheduleRefresh);
      });
    },
  };
}
