import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bridgeRequest } from "../../../scripts/feature-video/bridge-request.mjs";
import { connect } from "../../../scripts/lib/chrome-cdp.mjs";

let server: http.Server;
let url: URL;
/** What the dev server does with a request. */
let answer: (
  request: http.IncomingMessage,
  response: http.ServerResponse
) => void;

beforeEach(async () => {
  server = http.createServer((request, response) => answer(request, response));
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve())
  );
  url = new URL(
    `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/dev/post-project`
  );
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

describe("bridgeRequest", () => {
  it("sends the body and reads the answer", async () => {
    let sent = "";
    answer = (request, response) => {
      request.on("data", (chunk) => (sent += chunk));
      request.on("end", () => response.end('{"status":"applied"}'));
    };
    await expect(
      bridgeRequest(url, { method: "POST", body: { ops: [] } })
    ).resolves.toEqual({ status: "applied" });
    expect(JSON.parse(sent)).toEqual({ ops: [] });
  });

  it("rejects with the server's message and status", async () => {
    answer = (_request, response) => {
      response.writeHead(409, { "Content-Type": "application/json" });
      response.end('{"message":"Someone has it open."}');
    };
    await expect(bridgeRequest(url)).rejects.toMatchObject({
      message: "Someone has it open.",
      status: 409,
    });
  });

  it("gives up on a server that never answers", async () => {
    answer = () => {};
    await expect(bridgeRequest(url, { timeoutMs: 60 })).rejects.toMatchObject({
      code: "BRIDGE_TIMEOUT",
      message: expect.stringContaining("went unanswered for 0.06 s"),
    });
  });

  it("gives up on an answer that stops partway", async () => {
    answer = (_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.write('{"sessions":');
    };
    await expect(bridgeRequest(url, { timeoutMs: 60 })).rejects.toMatchObject({
      code: "BRIDGE_TIMEOUT",
    });
  });

  it("fails at once on an answer the server cuts off", async () => {
    answer = (_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.write('{"sessions":');
      setTimeout(() => response.destroy(), 10);
    };
    await expect(
      bridgeRequest(url, { timeoutMs: 20000 })
    ).rejects.toMatchObject({ code: "ECONNRESET" });
  });
});

describe("connect", () => {
  it("gives up on a Chrome that never opens the connection", async () => {
    // Takes the upgrade and says nothing back.
    const held: { destroy(): void }[] = [];
    server.on("upgrade", (_request, socket) => held.push(socket));
    await expect(
      connect(url.href.replace("http:", "ws:"), { reachTimeoutMs: 60 })
    ).rejects.toThrow(
      "Chrome did not open its DevTools connection within 60 ms."
    );
    for (const socket of held) socket.destroy();
  });
});
