import type { PixelStreaming } from "@epicgames-ps/lib-pixelstreamingfrontend-ue5.8";
import {
  parseBridgeMessage,
  type NativeViewerState,
} from "../domain/bridge-protocol";

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
    if (!stream || (!ready && type !== "hello"))
      return Promise.reject(
        new Error("Connect to the Unreal viewer before editing.")
      );
    const id = `${session}:${++revision}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        error =
          "Unreal did not confirm the change. Reconnect to reconcile the scene.";
        reject(new Error(error));
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
      } catch (cause) {
        clearTimeout(timer);
        pending.delete(id);
        reject(
          cause instanceof Error
            ? cause
            : new Error("Unable to send the viewer command.")
        );
      }
    });
  }

  function disconnected(message: string) {
    dispose(true);
    status = "disconnected";
    error = message;
  }

  async function mount(parent: HTMLElement) {
    const current = ++generation;
    mountedParent = parent;
    status = "connecting";
    state = null;
    nativeUpdate = null;
    error = "";
    connectTimer = setTimeout(() => {
      if (current === generation && status !== "ready") {
        disconnected(
          "The Unreal viewer did not connect. Check that the local viewer host is running."
        );
      }
    }, 15000);
    try {
      const { Config, PixelStreaming, Flags, TextParameters } =
        await import("@epicgames-ps/lib-pixelstreamingfrontend-ue5.8");
      if (generation !== current) return;
      session = crypto.randomUUID();
      revision = 0;
      acknowledgedRevision = -1;
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
        if (ready || current !== generation) return;
        void command("hello")
          .then(() => {
            if (current !== generation) return;
            if (connectTimer) clearTimeout(connectTimer);
            connectTimer = null;
            ready = true;
            status = "ready";
            error = "";
          })
          .catch((cause: Error) => {
            if (current === generation) disconnected(cause.message);
          });
      });
      stream.addEventListener("webRtcDisconnected", () => {
        if (current === generation)
          disconnected(
            "The Unreal stream disconnected. Reconnect when the viewer host is running."
          );
      });
      stream.addEventListener("webRtcFailed", () => {
        if (current === generation)
          disconnected(
            "The Unreal video connection failed. Check that the local viewer host is running."
          );
      });
      stream.addEventListener("playStreamRejected", () => {
        if (current === generation) needsPlay = true;
      });
      stream.addEventListener("playStream", () => {
        if (current === generation) needsPlay = false;
      });
      stream.connect();
    } catch (cause) {
      if (generation === current)
        disconnected(
          cause instanceof Error
            ? cause.message
            : "Unable to load the Unreal viewer."
        );
    }
  }

  function dispose(preserveParent = false) {
    ++generation;
    ready = false;
    if (connectTimer) clearTimeout(connectTimer);
    connectTimer = null;
    rejectPending("The viewer connection closed.");
    stream?.removeResponseEventListener("composer-viewer");
    stream?.disconnect();
    stream = null;
    if (!preserveParent) mountedParent = null;
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
    reconnect(parent?: HTMLElement) {
      const target = parent ?? mountedParent;
      if (!target) {
        error = "The Unreal viewer surface is not mounted.";
        return;
      }
      dispose();
      target.replaceChildren();
      void mount(target);
    },
  };
}

export type NativeViewerConnection = ReturnType<
  typeof createNativeViewerConnection
>;
