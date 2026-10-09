import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cdpClient,
  navigate,
  waitFor,
} from "../../../scripts/lib/chrome-cdp.mjs";

type Listener = (event: { data?: string }) => void;

/** Stands in for an open WebSocket to Chrome. */
class FakeSocket {
  readyState = 1;
  sent: { id: number; method: string; params: Record<string, unknown> }[] = [];
  private listeners = new Map<string, Listener[]>();
  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  send(text: string) {
    this.sent.push(JSON.parse(text));
  }
  close() {
    this.readyState = 3;
    this.emit("close", {});
  }
  emit(type: string, event: { data?: string }) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
  reply(message: object) {
    this.emit("message", { data: JSON.stringify(message) });
  }
}

const ended = (message: string) => ({ code: "CDP_ENDED", message });

afterEach(() => {
  vi.useRealTimers();
});

describe("cdpClient", () => {
  it("answers commands and keeps only the events it was asked to keep", async () => {
    const socket = new FakeSocket();
    const client = cdpClient(socket, {
      bufferEvents: ["Page.screencastFrame"],
    });
    const enabled = client.send("Page.enable");
    const missing = client.send("DOM.getDocument", { depth: 1 });
    expect(socket.sent).toEqual([
      { id: 1, method: "Page.enable", params: {} },
      { id: 2, method: "DOM.getDocument", params: { depth: 1 } },
    ]);
    socket.reply({ id: 1, result: { ok: true } });
    socket.reply({ id: 2, error: { message: "No document" } });
    await expect(enabled).resolves.toEqual({ ok: true });
    await expect(missing).rejects.toThrow("No document");

    socket.reply({ method: "Page.screencastFrame", params: { n: 1 } });
    socket.reply({ method: "Page.loadEventFired", params: {} });
    const batch = await client.readEvents({ afterSequence: 0 });
    expect(
      batch.events.map((event: { method: string }) => event.method)
    ).toEqual(["Page.screencastFrame"]);
  });

  it("rejects the waiting command and every later one when the connection closes", async () => {
    const socket = new FakeSocket();
    const client = cdpClient(socket);
    const waiting = client.send("Runtime.evaluate");
    socket.close();
    await expect(waiting).rejects.toMatchObject(
      ended("The DevTools connection closed.")
    );
    await expect(client.send("Page.enable")).rejects.toMatchObject(
      ended("The DevTools connection closed.")
    );
    expect(socket.sent).toHaveLength(1);
  });

  it.each([
    ["Inspector.targetCrashed", {}, "The page crashed."],
    [
      "Inspector.detached",
      { reason: "target_closed" },
      "DevTools was detached from the page (target_closed).",
    ],
  ])(
    "fails at once on %s, though the socket stays open",
    async (method, params, message) => {
      const socket = new FakeSocket();
      const client = cdpClient(socket);
      const waiting = client.send("Runtime.evaluate");
      socket.reply({ method, params });
      await expect(waiting).rejects.toMatchObject(ended(message));
      await expect(client.send("Page.stopScreencast")).rejects.toMatchObject(
        ended(message)
      );
      // The first reason stays when the socket closes afterwards.
      socket.close();
      await expect(client.send("Page.enable")).rejects.toMatchObject(
        ended(message)
      );
    }
  );

  it("rejects a command Chrome leaves unanswered past the time limit", async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const client = cdpClient(socket, { commandTimeoutMs: 1000 });
    const answered = client.send("Page.enable");
    socket.reply({ id: 1, result: {} });
    await answered;
    // An answered command leaves no timer to keep the process alive.
    expect(vi.getTimerCount()).toBe(0);

    const stuck = client.send("Runtime.evaluate");
    const outcome = expect(stuck).rejects.toThrow(
      "Chrome did not answer Runtime.evaluate within 1000 ms."
    );
    vi.advanceTimersByTime(1000);
    await outcome;
    await stuck.catch((cause: { code?: string }) =>
      expect(cause.code).toBeUndefined()
    );
    // A late answer is ignored, and the connection still works.
    socket.reply({ id: 2, result: {} });
    const next = client.send("Page.enable");
    socket.reply({ id: 3, result: { ok: true } });
    await expect(next).resolves.toEqual({ ok: true });
  });
});

describe("waitFor", () => {
  it("stops at once when the connection has ended", async () => {
    const send = vi.fn(async () => {
      throw Object.assign(new Error("The page crashed."), {
        code: "CDP_ENDED",
      });
    });
    await expect(
      waitFor({ send }, "window.ready", { timeoutMs: 60000, intervalMs: 1 })
    ).rejects.toThrow("The page crashed.");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("names the last error the page threw when it times out", async () => {
    const send = vi.fn(async () => ({
      result: {},
      exceptionDetails: {
        exception: { description: "ReferenceError: app is not defined" },
      },
    }));
    await expect(
      waitFor({ send }, "app.ready", {
        timeoutMs: 5,
        intervalMs: 1,
        label: "app ready",
      })
    ).rejects.toThrow(
      "Timed out after 5ms waiting for: app ready (last error: ReferenceError: app is not defined)"
    );
  });
});

describe("navigate", () => {
  it("throws when Chrome could not load the page instead of waiting on its error page", async () => {
    const send = vi.fn(async () => ({
      frameId: "main",
      errorText: "net::ERR_CONNECTION_REFUSED",
    }));
    await expect(navigate({ send }, "http://localhost:5193/")).rejects.toThrow(
      "Chrome could not load http://localhost:5193/: net::ERR_CONNECTION_REFUSED"
    );
    expect(send).toHaveBeenCalledTimes(1);
  });
});
