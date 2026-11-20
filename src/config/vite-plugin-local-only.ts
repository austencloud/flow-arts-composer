/**
 * Vite Plugin: Local-Only Request Gate
 *
 * Vite skips its own allowedHosts check when server.https is set, which is the
 * normal case here (mkcert dev cert), so a tunnel hostname got through on
 * 2026-11-18. This refuses by hostname and by tunnel forwarding headers
 * instead, on the dev server and the preview server, including websocket
 * upgrades (HMR from https://localhost:5173 sends a local Host and passes).
 */

import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "http";
import type { Duplex } from "stream";
import type { Plugin } from "vite";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

// Set by tunnels and reverse proxies. A request from this computer's own
// browser never carries them.
const FORWARDING_HEADERS = [
  "cf-connecting-ip",
  "cf-ray",
  "cdn-loop",
  "x-forwarded-for",
  "x-forwarded-host",
  "forwarded",
];

function firstValue(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** Host without its port, lower-cased, IPv6 brackets removed. */
function hostnameOf(headers: IncomingHttpHeaders): string {
  // HTTP/2 carries the host as :authority; HTTP/1 as Host.
  const raw = (
    firstValue(headers[":authority"]) || firstValue(headers.host)
  ).trim();
  if (raw.startsWith("[")) {
    const end = raw.indexOf("]");
    return (end === -1 ? raw.slice(1) : raw.slice(1, end)).toLowerCase();
  }
  const colon = raw.lastIndexOf(":");
  return (colon === -1 ? raw : raw.slice(0, colon)).toLowerCase();
}

export function isLocalDevRequest(headers: IncomingHttpHeaders): boolean {
  if (FORWARDING_HEADERS.some((name) => headers[name] !== undefined)) {
    return false;
  }
  const host = hostnameOf(headers);
  return LOCAL_HOSTS.has(host) || host.endsWith(".localhost");
}

interface GateTarget {
  middlewares: { use: (handler: (...args: any[]) => void) => unknown };
  httpServer: {
    prependListener: (event: "upgrade", listener: (...args: any[]) => void) => unknown;
  } | null;
}

function install(server: GateTarget) {
  server.middlewares.use(
    (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      if (isLocalDevRequest(req.headers)) return next();
      res.statusCode = 403;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Forbidden: this dev server answers localhost only.\n");
    },
  );
  server.httpServer?.prependListener(
    "upgrade",
    (req: IncomingMessage, socket: Duplex) => {
      if (!isLocalDevRequest(req.headers)) socket.destroy();
    },
  );
}

/**
 * The gate is skipped only when TKA_DEV_HOST is set, the deliberate opt-in
 * for LAN use. A public hostname additionally needs a login in front of it
 * (Cloudflare Access) and Austen's yes.
 */
export function localOnlyGatePlugin(
  env: NodeJS.ProcessEnv = process.env,
): Plugin {
  const enabled = !env.TKA_DEV_HOST;
  return {
    name: "tka-local-only-gate",
    enforce: "pre",
    configureServer(server) {
      if (enabled) install(server);
    },
    configurePreviewServer(server) {
      if (enabled) install(server);
    },
  };
}
