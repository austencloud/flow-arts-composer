import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createNativeViewerConnection } from "../../src/lib/shared/3d/unreal/state/native-viewer-connection.svelte";

const fake = vi.hoisted(() => ({
  streams: [] as Array<{
    events: Map<string, () => void>;
    response: ((text: string) => void) | null;
    commands: Array<Record<string, unknown>>;
    disconnected: boolean;
    emitUIInteraction(command: Record<string, unknown>): void;
    emit(event: string): void;
    reply(state: object): void;
  }>,
}));

vi.mock("@epicgames-ps/lib-pixelstreamingfrontend-ue5.8", () => ({
  Config: class {
    constructor(_config: unknown) {}
  },
  Flags: new Proxy({}, { get: (_target, key) => String(key) }),
  TextParameters: { SignallingServerUrl: "SignallingServerUrl" },
  PixelStreaming: class {
    events = new Map<string, () => void>();
    response: ((text: string) => void) | null = null;
    commands: Array<Record<string, unknown>> = [];
    disconnected = false;
    constructor() {
      fake.streams.push(this);
    }
    addResponseEventListener(_name: string, listener: (text: string) => void) {
      this.response = listener;
    }
    removeResponseEventListener() {
      this.response = null;
    }
    addEventListener(name: string, listener: () => void) {
      this.events.set(name, listener);
    }
    connect() {}
    disconnect() {
      this.disconnected = true;
    }
    emitUIInteraction(command: Record<string, unknown>) {
      this.commands.push(command);
    }
    emit(event: string) {
      this.events.get(event)?.();
    }
    reply(state: object) {
      const command = this.commands.at(-1)!;
      this.response?.(
        JSON.stringify({
          v: 1,
          type: "result",
          session: command.session,
          revision: command.revision,
          replyTo: command.id,
          ok: true,
          state,
        })
      );
    }
  },
}));

const confirmedState = {
  capabilities: {
    maxPerformers: 1,
    characterIds: ["ch01"],
    propIds: ["staff"],
    cameraModes: ["orbit"],
    playbackActions: ["pause"],
  },
  performers: [
    {
      performerId: "performer-0",
      characterId: "ch01",
      propId: "staff",
      position: { x: 0, z: 0 },
      facingAngle: 0,
    },
  ],
  selectedPerformerId: "performer-0",
  camera: {
    position: { x: 0, y: 2, z: 3 },
    target: { x: 0, y: 1, z: 0 },
    fov: 50,
    mode: "orbit",
    gestureComplete: true,
  },
  playback: {
    preparedClip: { id: "staff", title: "Staff", provenance: "prepared" },
    status: "playing",
    rate: 1,
    phase: 0,
  },
};

async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  fake.streams.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test("waits for host readiness, then restores the stream after disconnect without losing confirmed state", async () => {
  let calls = 0;
  const fetchHost = vi.fn(async () => {
    calls++;
    return {
      ok: true,
      json: async () => ({
        status: calls === 1 ? "starting" : "ready",
        message: calls === 1 ? "Starting Unreal" : "Ready",
      }),
    };
  });
  vi.stubGlobal("fetch", fetchHost);
  const connection = createNativeViewerConnection();
  const parent = document.createElement("div");
  parent.replaceChildren = vi.fn();
  connection.mount(parent);
  expect(connection.message).toBe("Connecting to the Unreal host.");
  expect(connection.error).toBe("");
  await flush();
  expect(fake.streams).toHaveLength(0);
  expect(connection.message).toBe("Starting Unreal");
  expect(connection.error).toBe("");
  expect(fetchHost).toHaveBeenCalledWith(
    "/unreal-host",
    expect.objectContaining({
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json" },
    })
  );

  await vi.advanceTimersByTimeAsync(1000);
  await vi.dynamicImportSettled();
  await flush();
  expect(fetchHost).toHaveBeenCalledTimes(2);
  expect(fake.streams).toHaveLength(1);
  expect(connection.message).toBe("Connecting to the Unreal video and scene.");
  expect(connection.error).toBe("");
  const first = fake.streams[0]!;
  first.emit("dataChannelOpen");
  first.reply(confirmedState);
  await flush();
  expect(connection.status).toBe("ready");
  expect(connection.message).toBe("");
  expect(connection.error).toBe("");
  expect(connection.state).toEqual(confirmedState);

  first.emit("webRtcDisconnected");
  expect(first.disconnected).toBe(true);
  expect(connection.status).toBe("connecting");
  expect(connection.message).toBe("");
  expect(connection.error).toMatch(/stream disconnected/);
  expect(connection.state).toEqual(confirmedState);
  await vi.advanceTimersByTimeAsync(1000);
  await vi.dynamicImportSettled();
  await flush();
  expect(fake.streams).toHaveLength(2);
  expect(connection.message).toBe("Connecting to the Unreal video and scene.");
  expect(connection.error).toBe("");
  const second = fake.streams[1]!;
  second.emit("dataChannelOpen");
  second.reply(confirmedState);
  await flush();
  expect(connection.status).toBe("ready");
  expect(connection.message).toBe("");
  expect(connection.error).toBe("");
  connection.dispose();
  expect(second.disconnected).toBe(true);
  await vi.advanceTimersByTimeAsync(30000);
  expect(fetchHost).toHaveBeenCalledTimes(3);
});

test("an unavailable host reports an error until a new host attempt progresses", async () => {
  let calls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        status: ++calls === 1 ? "unavailable" : "ready",
        message: calls === 1 ? "Unreal is unavailable" : "Ready",
      }),
    }))
  );
  const connection = createNativeViewerConnection();
  const parent = document.createElement("div");
  parent.replaceChildren = vi.fn();
  connection.mount(parent);
  await flush();
  expect(connection.status).toBe("disconnected");
  expect(connection.message).toBe("");
  expect(connection.error).toBe("Unreal is unavailable");

  await vi.advanceTimersByTimeAsync(1000);
  await vi.dynamicImportSettled();
  await flush();
  expect(connection.status).toBe("connecting");
  expect(connection.message).toBe("Connecting to the Unreal video and scene.");
  expect(connection.error).toBe("");
  connection.dispose();
});

test("waiting for the stream stays progress while a stream failure reports an error", async () => {
  vi.stubGlobal("fetch", async () => ({
    ok: true,
    json: async () => ({ status: "ready", message: "Ready" }),
  }));
  const connection = createNativeViewerConnection();
  const parent = document.createElement("div");
  parent.replaceChildren = vi.fn();
  connection.mount(parent);
  await flush();
  await vi.dynamicImportSettled();
  await flush();
  const first = fake.streams[0]!;
  await vi.advanceTimersByTimeAsync(15000);
  expect(first.disconnected).toBe(true);
  expect(connection.status).toBe("connecting");
  expect(connection.message).toMatch(/Waiting for the Unreal video and scene/);
  expect(connection.error).toBe("");

  await vi.advanceTimersByTimeAsync(1000);
  await vi.dynamicImportSettled();
  await flush();
  fake.streams[1]!.emit("webRtcFailed");
  expect(connection.message).toBe("");
  expect(connection.error).toMatch(/video connection failed/);
  connection.dispose();
});

test("disposal aborts a pending host check and leaves no retry behind", async () => {
  let signal: AbortSignal | undefined;
  const fetchHost = vi.fn((_url: string, init: RequestInit) => {
    signal = init.signal ?? undefined;
    return new Promise(() => {});
  });
  vi.stubGlobal("fetch", fetchHost);
  const connection = createNativeViewerConnection();
  const parent = document.createElement("div");
  parent.replaceChildren = vi.fn();
  connection.mount(parent);
  expect(signal?.aborted).toBe(false);
  connection.dispose();
  expect(signal?.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(30000);
  expect(fetchHost).toHaveBeenCalledTimes(1);
});

test("checks a ready stream on return and reconnects when its bridge no longer answers", async () => {
  const fetchHost = vi.fn(async () => ({
    ok: true,
    json: async () => ({ status: "ready", message: "Ready" }),
  }));
  vi.stubGlobal("fetch", fetchHost);
  const connection = createNativeViewerConnection();
  const parent = document.createElement("div");
  parent.replaceChildren = vi.fn();
  connection.mount(parent);
  await flush();
  await vi.dynamicImportSettled();
  await flush();
  expect(connection.error).toBe("");
  expect(fake.streams).toHaveLength(1);
  const first = fake.streams[0]!;
  first.emit("dataChannelOpen");
  first.reply(confirmedState);
  await flush();

  window.dispatchEvent(new Event("pageshow"));
  window.dispatchEvent(new Event("online"));
  expect(first.commands).toHaveLength(2);
  expect(first.commands[1]?.type).toBe("hello");
  await vi.advanceTimersByTimeAsync(8000);
  expect(connection.status).toBe("connecting");
  expect(connection.state).toEqual(confirmedState);
  expect(first.disconnected).toBe(true);
  first.reply(confirmedState);
  await vi.advanceTimersByTimeAsync(1000);
  await vi.dynamicImportSettled();
  await flush();
  expect(fake.streams).toHaveLength(2);
  expect(fetchHost).toHaveBeenCalledTimes(2);
  connection.dispose();
});

test("disposal ignores a pending ready-stream liveness probe", async () => {
  const fetchHost = vi.fn(async () => ({
    ok: true,
    json: async () => ({ status: "ready", message: "Ready" }),
  }));
  vi.stubGlobal("fetch", fetchHost);
  const connection = createNativeViewerConnection();
  const parent = document.createElement("div");
  parent.replaceChildren = vi.fn();
  connection.mount(parent);
  await flush();
  await vi.dynamicImportSettled();
  await flush();
  expect(connection.error).toBe("");
  expect(fake.streams).toHaveLength(1);
  const first = fake.streams[0]!;
  first.emit("dataChannelOpen");
  first.reply(confirmedState);
  await flush();

  window.dispatchEvent(new Event("pageshow"));
  expect(first.commands).toHaveLength(2);
  connection.dispose();
  first.reply(confirmedState);
  await vi.advanceTimersByTimeAsync(30000);
  expect(fetchHost).toHaveBeenCalledTimes(1);
  expect(fake.streams).toHaveLength(1);
});

test("a silent command timeout leaves ready and retries without discarding confirmed state", async () => {
  const fetchHost = vi.fn(async () => ({
    ok: true,
    json: async () => ({ status: "ready", message: "Ready" }),
  }));
  vi.stubGlobal("fetch", fetchHost);
  const connection = createNativeViewerConnection();
  const parent = document.createElement("div");
  parent.replaceChildren = vi.fn();
  connection.mount(parent);
  await flush();
  await vi.dynamicImportSettled();
  await flush();
  const first = fake.streams[0]!;
  first.emit("dataChannelOpen");
  first.reply(confirmedState);
  await flush();

  const failure = expect(
    connection.command("playback", { action: "pause" })
  ).rejects.toThrow(/Reconnecting automatically/);
  window.dispatchEvent(new Event("online"));
  expect(first.commands).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(8000);
  await failure;
  expect(connection.status).toBe("connecting");
  expect(connection.state).toEqual(confirmedState);
  expect(first.disconnected).toBe(true);
  first.reply(confirmedState);
  await vi.advanceTimersByTimeAsync(1000);
  await vi.dynamicImportSettled();
  await flush();
  expect(fake.streams).toHaveLength(2);
  expect(fetchHost).toHaveBeenCalledTimes(2);
  connection.dispose();
});

test("a failed command send recovers immediately", async () => {
  vi.stubGlobal("fetch", async () => ({
    ok: true,
    json: async () => ({ status: "ready", message: "Ready" }),
  }));
  const connection = createNativeViewerConnection();
  const parent = document.createElement("div");
  parent.replaceChildren = vi.fn();
  connection.mount(parent);
  await flush();
  await vi.dynamicImportSettled();
  await flush();
  const first = fake.streams[0]!;
  first.emit("dataChannelOpen");
  first.reply(confirmedState);
  await flush();

  first.emitUIInteraction = () => {
    throw new Error("Data channel closed");
  };
  await expect(
    connection.command("playback", { action: "pause" })
  ).rejects.toThrow(/Reconnecting automatically/);
  expect(connection.status).toBe("connecting");
  expect(first.disconnected).toBe(true);
  connection.dispose();
});

test("a visible idle viewer probes periodically and disposal cancels later probes", async () => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const fetchHost = vi.fn(async () => ({
    ok: true,
    json: async () => ({ status: "ready", message: "Ready" }),
  }));
  vi.stubGlobal("fetch", fetchHost);
  const connection = createNativeViewerConnection();
  const parent = document.createElement("div");
  parent.replaceChildren = vi.fn();
  connection.mount(parent);
  await flush();
  await vi.dynamicImportSettled();
  await flush();
  const first = fake.streams[0]!;
  first.emit("dataChannelOpen");
  first.reply(confirmedState);
  await flush();

  await vi.advanceTimersByTimeAsync(20000);
  expect(first.commands).toHaveLength(2);
  expect(first.commands[1]?.type).toBe("hello");
  window.dispatchEvent(new Event("online"));
  expect(first.commands).toHaveLength(2);
  first.reply(confirmedState);
  await flush();
  await vi.advanceTimersByTimeAsync(20000);
  expect(first.commands).toHaveLength(3);
  connection.dispose();
  await vi.advanceTimersByTimeAsync(60000);
  expect(fetchHost).toHaveBeenCalledTimes(1);
  expect(fake.streams).toHaveLength(1);
});
