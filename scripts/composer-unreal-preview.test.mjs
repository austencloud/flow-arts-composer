import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { assertPortFree, assertUnicodePreviewAssets, createComposerUnrealPreview } from "./composer-unreal-preview.mjs";

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve));
}

function request(port, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: pathname,
      ...options }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode,
        headers: response.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("compiled preview forwards SvelteKit routes and static response headers", async () => {
  const backend = http.createServer((req, res) => {
    if (req.url === "/stage") {
      res.writeHead(200, { "Content-Type": "text/html" }).end("stage route");
    } else {
      res.writeHead(206, { "Content-Type": "video/mp4",
        "Content-Range": "bytes 0-3/10", "Accept-Ranges": "bytes" }).end("1234");
    }
  });
  const backendPort = await listen(backend);
  const preview = createComposerUnrealPreview({ backendPort,
    ensure: async () => ({ status: "ready", message: "Ready" }) });
  const port = await listen(preview);
  try {
    const route = await request(port, "/stage");
    assert.equal(route.status, 200);
    assert.equal(route.body, "stage route");
    const asset = await request(port, "/assets/clip.mp4", { headers: { Range: "bytes=0-3" } });
    assert.equal(asset.status, 206);
    assert.equal(asset.headers["content-type"], "video/mp4");
    assert.equal(asset.headers["content-range"], "bytes 0-3/10");
  } finally {
    await close(preview);
    await close(backend);
  }
});

test("preview preflight rejects an occupied loopback port", async () => {
  const occupied = http.createServer();
  const port = await listen(occupied);
  try {
    await assert.rejects(assertPortFree(port), /Loopback port .* is unavailable/);
  } finally {
    await close(occupied);
  }
  await assertPortFree(port);
});

test("preview preflight catches corrupted Unicode asset names", () => {
  const root = mkdtempSync(path.join(tmpdir(), "composer-preview-assets-"));
  const output = path.join(root, "compiled");
  try {
    const svg = path.join(output, "images/letters_trimmed/Type6/β.svg");
    const placement = path.join(output, "data/arrow_placement/special/from_layer2/β_placements.json");
    const sourceSvg = path.join(root, "static/images/letters_trimmed/Type6/β.svg");
    const sourcePlacement = path.join(root, "static/data/arrow_placement/special/from_layer2/β_placements.json");
    mkdirSync(path.dirname(svg), { recursive: true });
    mkdirSync(path.dirname(placement), { recursive: true });
    mkdirSync(path.dirname(sourceSvg), { recursive: true });
    mkdirSync(path.dirname(sourcePlacement), { recursive: true });
    writeFileSync(sourceSvg, "valid svg");
    writeFileSync(sourcePlacement, "valid placement");
    writeFileSync(path.join(path.dirname(svg), "╬▓.svg"), "broken name");
    writeFileSync(path.join(path.dirname(placement), "╬▓_placements.json"), "broken name");
    assert.throws(() => assertUnicodePreviewAssets(root, output), /missing Unicode asset.*β.svg/);
    writeFileSync(svg, "valid svg");
    assert.throws(() => assertUnicodePreviewAssets(root, output), /missing Unicode asset.*β_placements.json/);
    writeFileSync(placement, "wrong content");
    assert.throws(() => assertUnicodePreviewAssets(root, output), /differs from worktree source.*β_placements.json/);
    writeFileSync(placement, "valid placement");
    assert.doesNotThrow(() => assertUnicodePreviewAssets(root, output));
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("preview host endpoint accepts only same-origin loopback POST", async () => {
  const backend = http.createServer((_req, res) => res.end("backend"));
  const backendPort = await listen(backend);
  let starts = 0;
  const preview = createComposerUnrealPreview({ backendPort,
    ensure: async () => { starts++; return { status: "ready", message: "Ready" }; } });
  const port = await listen(preview);
  try {
    const host = `127.0.0.1:${port}`;
    const headers = { Origin: `http://${host}`, "Content-Type": "application/json" };
    assert.equal((await request(port, "/unreal-host", { method: "POST", headers })).status, 200);
    assert.equal((await request(port, "/unreal-host", { method: "POST",
      headers: { ...headers, Origin: "http://attacker.example" } })).status, 403);
    assert.equal((await request(port, "/unreal-host", { method: "GET", headers })).status, 405);
    assert.equal(starts, 1);
  } finally {
    await close(preview);
    await close(backend);
  }
});

test("WebSocket upgrade rejects a foreign origin before reaching the streamer", async () => {
  const preview = createComposerUnrealPreview({ backendPort: 1,
    ensure: async () => ({ status: "ready", message: "Ready" }) });
  const port = await listen(preview);
  const socket = net.connect(port, "127.0.0.1");
  try {
    await once(socket, "connect");
    socket.write(`GET /unreal-stream HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n` +
      "Connection: Upgrade\r\nUpgrade: websocket\r\nOrigin: http://attacker.example\r\n\r\n");
    const [data] = await once(socket, "data");
    assert.match(data.toString(), /403 Forbidden/);
  } finally {
    socket.destroy();
    await close(preview);
  }
});
