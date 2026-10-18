import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import {
  createHostRecovery,
  isLocalHostRequest,
} from "./composer-unreal-host.mjs";

const localRequest = (
  origin = "https://[::1]:5173",
  address = "::1",
  host = "[::1]:5173"
) => ({
  socket: { remoteAddress: address, encrypted: true },
  headers: { origin, host },
});

test("host startup requires a same-origin loopback request", () => {
  assert.equal(isLocalHostRequest(localRequest()), true);
  assert.equal(
    isLocalHostRequest(
      localRequest("https://localhost:5190", "127.0.0.1", "localhost:5190")
    ),
    true
  );
  for (const request of [
    localRequest("https://attacker.example"),
    localRequest("https://[::1]:5174"),
    localRequest("http://[::1]:5173"),
    localRequest(undefined, "192.168.1.10"),
    localRequest("null"),
    localRequest("file://localhost"),
    localRequest("https://localhost.evil:5173"),
    localRequest("https://[::1]:5173/path"),
  ])
    assert.equal(isLocalHostRequest(request), false);
  assert.equal(
    isLocalHostRequest({ socket: { remoteAddress: "::1" }, headers: {} }),
    false
  );
});

test("concurrent page retries start only one host and wait for streamer readiness", async () => {
  let starts = 0;
  let finish;
  let ready = false;
  const ensure = createHostRecovery({
    platform: "win32",
    probe: async () => ready,
    start: () => {
      starts++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  const responses = await Promise.all(
    Array.from({ length: 8 }, () => ensure())
  );
  assert.equal(starts, 1);
  assert.ok(responses.every((response) => response.status === "starting"));
  assert.equal((await ensure()).status, "starting");
  ready = true;
  assert.equal((await ensure()).status, "ready");
  finish({ status: "starting", message: "Loading" });
  await setImmediate();
  assert.equal((await ensure()).status, "ready");
});

test("failed startup is contained, paced, and retried without reloading the page", async () => {
  let time = 0;
  let starts = 0;
  const ensure = createHostRecovery({
    platform: "win32",
    probe: async () => false,
    now: () => time,
    log: () => {},
    start: async () => {
      starts++;
      throw new Error("host unavailable");
    },
  });
  assert.equal((await ensure()).status, "starting");
  await setImmediate();
  assert.equal((await ensure()).status, "unavailable");
  assert.equal(starts, 1);
  time = 5000;
  assert.equal((await ensure()).status, "starting");
  await setImmediate();
  assert.equal(starts, 2);
});

test("a later crash restarts the host after an earlier successful connection", async () => {
  let ready = true;
  let time = 0;
  let starts = 0;
  const ensure = createHostRecovery({
    platform: "win32",
    probe: async () => ready,
    now: () => time,
    start: async () => {
      starts++;
      return { status: "ready", message: "Ready" };
    },
  });
  assert.equal((await ensure()).status, "ready");
  await setImmediate();
  ready = false;
  time = 1000;
  assert.equal((await ensure()).status, "starting");
  assert.equal(starts, 1);
  time = 6000;
  assert.equal((await ensure()).status, "starting");
  await setImmediate();
  assert.equal(starts, 2);
});

test("unsupported machines do not try launching Windows processes", async () => {
  const ensure = createHostRecovery({
    platform: "linux",
    probe: () => {
      throw new Error("unexpected probe");
    },
    start: () => {
      throw new Error("unexpected start");
    },
  });
  assert.equal((await ensure()).status, "unavailable");
});
