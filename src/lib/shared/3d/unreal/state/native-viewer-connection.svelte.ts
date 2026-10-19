import type { PixelStreaming } from "@epicgames-ps/lib-pixelstreamingfrontend-ue5.8";
import {
  parseBridgeMessage,
  type NativeViewerState,
} from "../domain/bridge-protocol";

type HostStatus = {
  status: "ready" | "starting" | "unavailable";
  message: string;
};

/** One connection belongs to one mounted viewer. No shared socket or native clock. */
export function createNativeViewerConnection() {
  let status = $state<"connecting" | "ready" | "disconnected">("connecting");
  let state = $state<NativeViewerState | null>(null);
  let nativeUpdate = $state<NativeViewerState | null>(null);
  let error = $state("");
  let needsPlay = $state(false);
  let stream: PixelStreaming | null = null;
  let mountedParent: HTMLElement | null = null;
  let connectTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let livenessTimer: ReturnType<typeof setInterval> | null = null;
  let hostTimeout: ReturnType<typeof setTimeout> | null = null;
  let hostAbort: AbortController | null = null;
  let activeAttempt = 0;
  let livenessProbe = 0;
  let retryCount = 0;
  let session = "";
  let revision = 0;
  let acknowledgedRevision = -1;
  let generation = 0;
  let ready = false;
  const pending = new Map<
    string,
    {
      resolve: (state: NativeViewerState) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  function rejectPending(message: string) {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error(message));
    }
    pending.clear();
  }

  function command(
    type: string,
    payload: object = {}
  ): Promise<NativeViewerState> {
    if (!stream || (!ready && type !== "hello")) {
      return Promise.reject(
        new Error("Connect to the Unreal viewer before editing.")
      );
    }
    const id = `${session}:${++revision}`;
    const current = generation;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        error =
          "The Unreal scene stopped responding. Reconnecting automatically.";
        reject(new Error(error));
        if (current === generation && ready && mountedParent) {
          scheduleRecovery(error);
        }
      }, 8000);
      pending.set(id, { resolve, reject, timer });
      try {
        stream!.emitUIInteraction({
          v: 1,
          session,
          revision,
          id,
          type,
          payload,
        });
      } catch {
        clearTimeout(timer);
        pending.delete(id);
        const message =
          "The Unreal command connection failed. Reconnecting automatically.";
        reject(new Error(message));
        if (current === generation && ready && mountedParent) {
          scheduleRecovery(message);
        }
      }
    });
  }

  function clearConnection() {
    ++generation;
    ready = false;
    livenessProbe = 0;
    if (connectTimer) clearTimeout(connectTimer);
    if (retryTimer) clearTimeout(retryTimer);
    if (hostTimeout) clearTimeout(hostTimeout);
    connectTimer = null;
    retryTimer = null;
    hostTimeout = null;
    hostAbort?.abort();
    hostAbort = null;
    rejectPending("The viewer connection closed.");
    const previousStream = stream;
    stream = null;
    previousStream?.removeResponseEventListener("composer-viewer");
    previousStream?.disconnect();
    needsPlay = false;
  }

  function scheduleRecovery(message: string, unavailable = false) {
    if (!mountedParent) return;
    clearConnection();
    status = unavailable ? "disconnected" : "connecting";
    error = message;
    const delay = Math.min(15000, 1000 * 2 ** Math.min(retryCount++, 4));
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void attemptConnection();
    }, delay);
  }

  async function ensureHost(current: number): Promise<HostStatus> {
    const abort = new AbortController();
    hostAbort = abort;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, 10000);
    hostTimeout = timeout;
    try {
      const response = await fetch("/unreal-host", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: abort.signal,
      });
      if (current !== generation) {
        throw new Error("Viewer request was replaced.");
      }
      const result: unknown = await response.json();
      if (!response.ok || !result || typeof result !== "object") {
        throw new Error("The local Unreal host did not answer correctly.");
      }
      const host = result as Partial<HostStatus>;
      if (
        !["ready", "starting", "unavailable"].includes(host.status ?? "") ||
        typeof host.message !== "string"
      ) {
        throw new Error("The local Unreal host returned an invalid status.");
      }
      return host as HostStatus;
    } catch (cause) {
      if (timedOut) {
        throw new Error("The local Unreal host is taking too long to answer.");
      }
      throw cause;
    } finally {
      clearTimeout(timeout);
      if (hostTimeout === timeout) hostTimeout = null;
      if (hostAbort === abort) hostAbort = null;
    }
  }

  async function attemptConnection() {
    const parent = mountedParent;
    if (!parent || activeAttempt || ready) return;
    const current = ++generation;
    activeAttempt = current;
    status = "connecting";
    try {
      const host = await ensureHost(current);
      if (current !== generation || !mountedParent) return;
      if (host.status !== "ready") {
        scheduleRecovery(host.message, host.status === "unavailable");
        return;
      }
      const { Config, PixelStreaming, Flags, TextParameters } =
        await import("@epicgames-ps/lib-pixelstreamingfrontend-ue5.8");
      if (current !== generation || !mountedParent) return;
      session = crypto.randomUUID();
      revision = 0;
      acknowledgedRevision = -1;
      let helloPending = false;
      const config = new Config({
        useUrlParams: false,
        initialSettings: {
          [TextParameters.SignallingServerUrl]: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/unreal-stream`,
          [Flags.AutoConnect]: false,
          [Flags.AutoPlayVideo]: true,
          [Flags.StartVideoMuted]: true,
          [Flags.MatchViewportResolution]: true,
          [Flags.KeyboardInput]: false,
          [Flags.MouseInput]: false,
          [Flags.TouchInput]: false,
          [Flags.GamepadInput]: false,
          [Flags.SuppressBrowserKeys]: false,
          [Flags.HoveringMouseMode]: true,
        },
      });
      parent.replaceChildren();
      stream = new PixelStreaming(config, { videoElementParent: parent });
      stream.addResponseEventListener("composer-viewer", (text) => {
        if (current !== generation) return;
        const message = parseBridgeMessage(text);
        if (!message || message.session !== session) return;
        const request =
          message.type === "result" ? pending.get(message.replyTo) : undefined;
        if (message.revision >= acknowledgedRevision) {
          acknowledgedRevision = message.revision;
          state = message.state;
          if (message.type === "state") nativeUpdate = message.state;
        }
        if (request && message.type === "result") {
          clearTimeout(request.timer);
          pending.delete(message.replyTo);
          if (message.ok) request.resolve(state ?? message.state);
          else {
            error =
              message.error?.message ?? "Unreal could not apply this change.";
            request.reject(new Error(error));
          }
        }
      });
      stream.addEventListener("dataChannelOpen", () => {
        if (ready || helloPending || current !== generation) return;
        helloPending = true;
        void command("hello")
          .then(() => {
            if (current !== generation) return;
            if (connectTimer) clearTimeout(connectTimer);
            connectTimer = null;
            ready = true;
            retryCount = 0;
            status = "ready";
            error = "";
          })
          .catch((cause: Error) => {
            if (current === generation) scheduleRecovery(cause.message);
          });
      });
      stream.addEventListener("webRtcDisconnected", () => {
        if (current === generation) {
          scheduleRecovery(
            "The Unreal stream disconnected. Reconnecting automatically."
          );
        }
      });
      stream.addEventListener("webRtcFailed", () => {
        if (current === generation) {
          scheduleRecovery(
            "The Unreal video connection failed. Reconnecting automatically."
          );
        }
      });
      stream.addEventListener("playStreamRejected", () => {
        if (current === generation) needsPlay = true;
      });
      stream.addEventListener("playStream", () => {
        if (current === generation) needsPlay = false;
      });
      connectTimer = setTimeout(() => {
        if (current === generation && !ready) {
          scheduleRecovery(
            "Waiting for the Unreal video and scene. Reconnecting automatically."
          );
        }
      }, 15000);
      stream.connect();
    } catch (cause) {
      if (current === generation) {
        scheduleRecovery(
          cause instanceof Error
            ? cause.message
            : "Unable to reach the local Unreal host.",
          true
        );
      }
    } finally {
      if (activeAttempt === current) activeAttempt = 0;
    }
  }

  function reconnect(parent?: HTMLElement) {
    const target = parent ?? mountedParent;
    if (!target) {
      error = "The Unreal viewer surface is not mounted.";
      return;
    }
    mountedParent = target;
    clearConnection();
    activeAttempt = 0;
    retryCount = 0;
    status = "connecting";
    error = "";
    void attemptConnection();
  }

  function onReturn() {
    if (!mountedParent) return;
    if (!ready) {
      if (!activeAttempt) reconnect();
      return;
    }
    if (livenessProbe || pending.size) return;
    const current = generation;
    livenessProbe = current;
    void command("hello")
      .catch((cause: Error) => {
        if (current === generation && ready && mountedParent) {
          scheduleRecovery(cause.message);
        }
      })
      .finally(() => {
        if (livenessProbe === current) livenessProbe = 0;
      });
  }

  function onVisibilityChange() {
    if (document.visibilityState === "visible") onReturn();
  }

  function mount(parent: HTMLElement) {
    if (mountedParent) dispose();
    mountedParent = parent;
    state = null;
    nativeUpdate = null;
    retryCount = 0;
    status = "connecting";
    error = "";
    window.addEventListener("online", onReturn);
    window.addEventListener("pageshow", onReturn);
    document.addEventListener("visibilitychange", onVisibilityChange);
    livenessTimer = setInterval(() => {
      if (ready && document.visibilityState === "visible") onReturn();
    }, 20000);
    void attemptConnection();
  }

  function dispose() {
    mountedParent = null;
    clearConnection();
    activeAttempt = 0;
    if (livenessTimer) clearInterval(livenessTimer);
    livenessTimer = null;
    window.removeEventListener("online", onReturn);
    window.removeEventListener("pageshow", onReturn);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  }

  return {
    get status() {
      return status;
    },
    get state() {
      return state;
    },
    get nativeUpdate() {
      return nativeUpdate;
    },
    get error() {
      return error;
    },
    get needsPlay() {
      return needsPlay;
    },
    command,
    mount,
    dispose,
    play: () => stream?.play(),
    report: (message: string) => {
      error = message;
    },
    reconnect,
  };
}

export type NativeViewerConnection = ReturnType<
  typeof createNativeViewerConnection
>;
