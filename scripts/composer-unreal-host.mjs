import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const loopbackAddresses = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Only a same-origin page on this machine may start its installed host. */
export function isLocalHostRequest(request) {
  if (!loopbackAddresses.has(request.socket.remoteAddress)) return false;
  try {
    const origin = new URL(request.headers.origin);
    const authority = request.headers[":authority"] ?? request.headers.host;
    if (request.headers.host && request.headers.host !== authority) return false;
    return (
      loopbackHosts.has(origin.hostname) &&
      origin.protocol === (request.socket.encrypted ? "https:" : "http:") &&
      origin.host === authority &&
      request.headers.origin === origin.origin
    );
  } catch {
    return false;
  }
}

async function probeHost() {
  try {
    const response = await fetch("http://127.0.0.1:18889/health", {
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return false;
    const health = await response.json();
    return (
      health.service === "composer-viewer" && health.streamerReady === true
    );
  } catch {
    // Stopped services are the normal first-open case.
    return false;
  }
}

/** Single flight per Vite process; ensure-host.ps1 also locks across worktrees. */
export function createHostRecovery({
  probe,
  start,
  now = Date.now,
  platform = process.platform,
  log = console.error,
}) {
  let pending = null;
  let nextAttempt = 0;
  let wasReady = false;
  let state = {
    status: "starting",
    message: "Starting the local Unreal host.",
  };

  function launch() {
    pending = Promise.resolve()
      .then(start)
      .then((result) => {
        state = result;
      })
      .catch((error) => {
        log("[unreal-host]", error);
        state = {
          status: "unavailable",
          message:
            "The local Unreal host could not start. Retrying automatically.",
        };
      })
      .finally(() => {
        nextAttempt = now() + 5000;
        pending = null;
      });
  }

  return async function ensure() {
    if (platform !== "win32") {
      return {
        status: "unavailable",
        message: "The local Unreal viewer requires its installed Windows host.",
      };
    }
    if (await probe()) {
      // Clear native crash backoff once a real streamer has registered.
      if (!wasReady) {
        if (pending) void pending.then(launch);
        else launch();
      }
      wasReady = true;
      return { status: "ready", message: "The local Unreal host is ready." };
    }
    wasReady = false;
    if (!pending && now() >= nextAttempt) {
      state = {
        status: "starting",
        message: "Starting the local Unreal performer. This can take a moment.",
      };
      launch();
    }
    return state.status === "ready"
      ? {
          status: "starting",
          message: "Waiting for the local Unreal performer.",
        }
      : state;
  };
}

export function composerUnrealHostPlugin() {
  return {
    name: "composer-unreal-host",
    apply: "serve",
    configureServer(server) {
      const ensure = createHostRecovery({
        probe: probeHost,
        async start() {
          const script = path.join(
            server.config.root,
            "unreal/ComposerViewer/Tools/ensure-host.ps1"
          );
          const powershell = path.join(
            process.env.SystemRoot ?? "C:\\Windows",
            "System32/WindowsPowerShell/v1.0/powershell.exe"
          );
          const { stdout, stderr } = await execFileAsync(
            powershell,
            ["-NoProfile", "-NonInteractive", "-File", script],
            { windowsHide: true, timeout: 45000, maxBuffer: 65536 }
          );
          if (stderr.trim())
            server.config.logger.warn(`[unreal-host] ${stderr.trim()}`);
          const result = JSON.parse(stdout.trim());
          if (
            !["ready", "starting", "unavailable"].includes(result.status) ||
            typeof result.message !== "string"
          ) {
            throw new Error("Unexpected local host status response.");
          }
          return result;
        },
        log: (...args) =>
          server.config.logger.error(args.map(String).join(" ")),
      });
      server.middlewares.use((request, response, next) => {
        if (request.url?.split("?")[0] !== "/unreal-host") return next();
        if (!isLocalHostRequest(request)) {
          response.writeHead(403).end();
          return;
        }
        if (request.method !== "POST") {
          response.writeHead(405, { Allow: "POST" }).end();
          return;
        }
        if (
          request.headers["content-type"]?.split(";")[0] !== "application/json"
        ) {
          response.writeHead(415).end();
          return;
        }
        // The request accepts no paths, commands, or launch options.
        request.resume();
        void ensure()
          .then((state) => {
            response.writeHead(200, {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            });
            response.end(JSON.stringify(state));
          })
          .catch((error) => {
            server.config.logger.error(`[unreal-host] ${error}`);
            response.writeHead(500).end();
          });
      });
    },
  };
}
