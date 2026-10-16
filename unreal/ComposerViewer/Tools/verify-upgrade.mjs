import assert from "node:assert/strict";
import fs from "node:fs";
import http2 from "node:http2";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { loadConfigFromFile } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const certRoot = process.env.COMPOSER_TEST_CERT_ROOT ?? root;
const cert = fs.readFileSync(path.join(certRoot, ".cert/dev-cert.pem"));
const key = fs.readFileSync(path.join(certRoot, ".cert/dev-key.pem"));
const loaded = await loadConfigFromFile({ command: "serve", mode: "development" }, path.join(root, "vite.config.ts"));
assert.equal(loaded.config.server?.proxy, undefined, "Vite server.proxy would disable HTTP/2");
const plugin = loaded.config.plugins.find((entry) => entry?.name === "composer-unreal-stream-upgrade");
assert.ok(plugin, "Composer WebSocket upgrade plugin missing");

const server = http2.createSecureServer({ cert, key, allowHTTP1: true }, (_req, res) => {
  res.writeHead(404);
  res.end();
});
await plugin.configureServer({ httpServer: server });
assert.equal(server.listenerCount("upgrade"), 1);
await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
const port = server.address().port;

function connect(host, origin, expectedStatus) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://${host}:${port}/unreal-stream?streamerId=ComposerViewer`, {
      rejectUnauthorized: false,
      origin,
      handshakeTimeout: 5000,
    });
    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error(`WebSocket timed out: ${host}`));
    }, 7000);
    const finish = (error, value) => {
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(value);
    };
    ws.once("unexpected-response", (_request, response) => {
      response.resume();
      finish(expectedStatus === response.statusCode ? null : new Error(`Expected HTTP ${expectedStatus}, got ${response.statusCode}`), response.statusCode);
    });
    ws.once("message", (data) => {
      const message = JSON.parse(data.toString());
      ws.close();
      finish(expectedStatus === 101 && message.type === "config" ? null : new Error(`Unexpected signalling response: ${message.type}`), message.type);
    });
    ws.once("error", (error) => {
      if (expectedStatus === 101) finish(error);
    });
  });
}

try {
  const client = http2.connect(`https://127.0.0.1:${port}`, { rejectUnauthorized: false });
  await new Promise((resolve, reject) => {
    client.once("connect", resolve);
    client.once("error", reject);
  });
  assert.equal(client.alpnProtocol, "h2");
  client.close();
  console.log("HTTPS ALPN: h2");

  assert.equal(await connect("127.0.0.1", "https://localhost:5173", 101), "config");
  console.log("Local same-origin WebSocket: signalling config received");
  assert.equal(await connect("127.0.0.1", "https://example.com", 403), 403);
  console.log("Foreign Origin upgrade: HTTP 403");

  const lanAddress = Object.values(os.networkInterfaces()).flat().find((item) => item?.family === "IPv4" && !item.internal && item.address.startsWith("192.168."))?.address;
  assert.ok(lanAddress, "No local LAN address available for remote-address upgrade check");
  assert.equal(await connect(lanAddress, "https://localhost:5173", 403), 403);
  console.log(`Non-loopback upgrade (${lanAddress}): HTTP 403`);
} finally {
  await new Promise((resolve) => server.close(resolve));
  assert.equal(server.listenerCount("upgrade"), 0, "Upgrade listener should be removed on server close");
}
