import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProxyServer } from "http-proxy-3";
import {
  createLocalHostHandler,
  createLocalHostRecovery,
  isLocalHostRequest,
} from "./composer-unreal-host.mjs";

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Wrangler owns compiled SvelteKit routes and static files, including ranges and MIME. */
export function createComposerUnrealPreview({ backendPort, ensure, log = console.error }) {
  const pages = createProxyServer({ target: `http://127.0.0.1:${backendPort}` });
  const stream = createProxyServer({ target: "ws://127.0.0.1:18889", ws: true });
  const sockets = new Set();
  pages.on("error", (error, _request, response) => {
    log(`[compiled-preview] ${error}`);
    if (response && !response.headersSent) response.writeHead(502).end();
    else response?.destroy();
  });
  stream.on("error", (error, _request, socket) => {
    log(`[unreal-stream] ${error}`);
    socket?.destroy();
  });
  const host = createLocalHostHandler(ensure, log);
  const server = http.createServer((request, response) => {
    host(request, response, () => pages.web(request, response));
  });
  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/unreal-stream" && url.pathname !== "/unreal-stream/") {
      socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      return;
    }
    if (!isLocalHostRequest(request)) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    request.url = `/${url.search}`;
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    stream.ws(request, socket, head);
  });
  server.once("close", () => {
    for (const socket of sockets) socket.destroy();
    sockets.clear();
    pages.close();
    stream.close();
  });
  return server;
}

function portArg(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value < 1024 || value > 65535)
    throw new Error(`${name} must be a free port from 1024 to 65535`);
  return value;
}

export async function assertPortFree(port) {
  const probe = net.createServer();
  try {
    await new Promise((resolve, reject) => {
      probe.once("error", reject);
      probe.listen(port, "127.0.0.1", resolve);
    });
  } catch (error) {
    throw new Error(`Loopback port ${port} is unavailable: ${error.message}`);
  } finally {
    if (probe.listening) await new Promise((resolve) => probe.close(resolve));
  }
}

/** Catch Windows archive extraction that turns UTF-8 asset names into CP437 mojibake. */
export function assertUnicodePreviewAssets(root, output) {
  for (const relative of [
    "images/letters_trimmed/Type6/β.svg",
    "data/arrow_placement/special/from_layer2/β_placements.json",
  ]) {
    const source = path.join(root, "static", relative);
    const compiled = path.join(output, relative);
    if (!existsSync(source))
      throw new Error(`Worktree is missing Unicode source asset ${relative}`);
    if (!existsSync(compiled))
      throw new Error(`Compiled preview is missing Unicode asset ${relative}; extract the build archive with UTF-8 filenames`);
    if (!readFileSync(compiled).equals(readFileSync(source)))
      throw new Error(`Compiled preview Unicode asset differs from worktree source: ${relative}`);
  }
}

async function waitForPages(port, child, getChildError) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (getChildError()) throw getChildError();
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error("Compiled Pages backend exited before serving");
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(1500),
      });
      await response.body?.cancel();
      if (response.status < 500) return;
    } catch { /* Wrangler is starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Compiled Pages backend did not become ready");
}

export async function startCompiledPreview(args = process.argv.slice(2)) {
  const root = process.cwd();
  if (path.resolve(root) !== scriptRoot)
    throw new Error("Run the compiled preview from its own worktree root");
  const port = portArg(args, "--port", 4188);
  const backendPort = portArg(args, "--backend-port", port + 1);
  if (port === backendPort) throw new Error("Preview and backend ports must differ");
  const output = path.join(root, ".svelte-kit/cloudflare");
  if (!existsSync(path.join(output, "_worker.js")) || !existsSync(path.join(output, "_app")))
    throw new Error("Build this worktree before starting the compiled preview");
  assertUnicodePreviewAssets(root, output);
  const wrangler = path.join(root, "node_modules/wrangler/bin/wrangler.js");
  if (!existsSync(wrangler)) throw new Error("Wrangler is missing from this worktree");
  await assertPortFree(port);
  await assertPortFree(backendPort);
  const child = spawn(process.execPath, [wrangler, "pages", "dev", output,
    "--port", String(backendPort), "--ip", "127.0.0.1",
    "--show-interactive-dev-session=false"], {
    cwd: root, stdio: "inherit", windowsHide: true,
  });
  let childError = null;
  child.on("error", (error) => { childError = error; });
  const stop = () => child.kill();
  let server;
  try {
    await waitForPages(backendPort, child, () => childError);
    server = createComposerUnrealPreview({
      backendPort,
      ensure: createLocalHostRecovery({ root }),
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
    server.once("close", stop);
    child.once("exit", () => { server.closeAllConnections(); server.close(); });
    process.once("SIGINT", () => server.close());
    process.once("SIGTERM", () => server.close());
    console.log(`Compiled Composer preview: http://127.0.0.1:${port}/stage`);
    return { server, backend: child };
  } catch (error) {
    if (server?.listening) server.close();
    stop();
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startCompiledPreview().catch((error) => {
    console.error(`[compiled-preview] ${error.message}`);
    process.exitCode = 1;
  });
}
