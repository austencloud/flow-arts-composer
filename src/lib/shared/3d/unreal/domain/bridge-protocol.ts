export interface NativePerformer {
  performerId: string;
  characterId: string;
  propId: string;
  effect?: "none" | "fire" | "led";
  position: { x: number; z: number };
  facingAngle: number;
}

export interface NativeViewerState {
  capabilities: {
    maxPerformers: number;
    characterIds: string[];
    propIds: string[];
    cameraModes: string[];
    playbackActions: string[];
  };
  performers: NativePerformer[];
  selectedPerformerId: string | null;
  camera: {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
    fov: number;
    mode: string;
    gestureComplete: boolean;
  };
  playback: {
    preparedClip: { id: string; title: string; provenance: string } | null;
    status: string;
    rate: number;
    phase: number;
  };
}

interface CommandHeader {
  v: 1;
  session: string;
  revision: number;
  id: string;
}

export type BridgeCommand = CommandHeader &
  (
    | { type: "hello"; payload?: Record<string, never> }
    | {
        type: "setPerformer";
        payload: NativePerformer & { composerOwned?: boolean };
      }
    | { type: "removePerformer"; payload: { performerId: string } }
    | { type: "select"; payload: { performerId: string | null } }
    | {
        type: "beginMotion";
        payload: {
          performerId: string;
          transferId: string;
          totalChunks: number;
          totalBytes: number;
        };
      }
    | {
        type: "motionChunk";
        payload: { transferId: string; index: number; data: string };
      }
    | { type: "commitMotion"; payload: { transferId: string } }
    | {
        type: "camera";
        payload:
          | {
              mode?: "snap";
              position: { x: number; y: number; z: number };
              target: { x: number; y: number; z: number };
              verticalFov?: number;
            }
          | { mode: "orbit" | "pan"; deltaX: number; deltaY: number }
          | { mode: "zoom"; delta: number; cursorX?: number; cursorY?: number }
          | { mode: "fov"; verticalFov: number }
          | {
              mode: "preset";
              preset:
                | "front"
                | "back"
                | "left"
                | "right"
                | "top"
                | "threeQuarter";
            }
          | { mode: "focus"; performerId: string };
      }
    | {
        type: "playback";
        payload:
          | { action: "pause" | "resume" | "restart" }
          | { action: "rate"; rate: number }
          | {
              action: "sync";
              performers: { performerId: string; seconds: number }[];
              playing: boolean;
              rate: number;
            };
      }
  );

interface MessageHeader {
  v: 1;
  session: string;
  revision: number;
  state: NativeViewerState;
}

export type BridgeMessage = MessageHeader &
  (
    | { type: "state" }
    | { type: "result"; replyTo: string; ok: true; error?: never }
    | {
        type: "result";
        replyTo: string;
        ok: false;
        error: { code: string; message: string };
      }
  );

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(nonempty);
}

function point2(value: unknown): value is { x: number; z: number } {
  return record(value) && finite(value.x) && finite(value.z);
}

function point3(value: unknown): value is { x: number; y: number; z: number } {
  return record(value) && finite(value.x) && finite(value.y) && finite(value.z);
}

function performer(value: unknown): value is NativePerformer {
  return (
    record(value) &&
    nonempty(value.performerId) &&
    nonempty(value.characterId) &&
    nonempty(value.propId) &&
    (value.effect === undefined ||
      value.effect === "none" ||
      value.effect === "fire" ||
      value.effect === "led") &&
    point2(value.position) &&
    finite(value.facingAngle)
  );
}

function viewerState(value: unknown): value is NativeViewerState {
  if (!record(value)) return false;
  const { capabilities, performers, camera, playback } = value;
  if (
    !record(capabilities) ||
    !Array.isArray(performers) ||
    !record(camera) ||
    !record(playback)
  )
    return false;
  if (
    typeof capabilities.maxPerformers !== "number" ||
    !Number.isSafeInteger(capabilities.maxPerformers) ||
    capabilities.maxPerformers < 0 ||
    !stringArray(capabilities.characterIds) ||
    !stringArray(capabilities.propIds) ||
    !stringArray(capabilities.cameraModes) ||
    !stringArray(capabilities.playbackActions) ||
    !performers.every(performer)
  )
    return false;
  if (
    value.selectedPerformerId !== null &&
    !nonempty(value.selectedPerformerId)
  )
    return false;
  if (
    !point3(camera.position) ||
    !point3(camera.target) ||
    !finite(camera.fov) ||
    !nonempty(camera.mode) ||
    typeof camera.gestureComplete !== "boolean"
  )
    return false;
  const clip = playback.preparedClip;
  const validClip =
    clip === null
      ? playback.status === "unavailable"
      : record(clip) &&
        nonempty(clip.id) &&
        nonempty(clip.title) &&
        nonempty(clip.provenance);
  return (
    validClip &&
    nonempty(playback.status) &&
    finite(playback.rate) &&
    finite(playback.phase)
  );
}

export function parseBridgeMessage(text: string): BridgeMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (
    !record(value) ||
    value.v !== 1 ||
    !nonempty(value.session) ||
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    !viewerState(value.state)
  )
    return null;

  if (value.type === "state") return value as unknown as BridgeMessage;
  if (
    value.type !== "result" ||
    !nonempty(value.replyTo) ||
    typeof value.ok !== "boolean"
  )
    return null;
  if (value.ok)
    return value.error === undefined
      ? (value as unknown as BridgeMessage)
      : null;
  return record(value.error) &&
    nonempty(value.error.code) &&
    nonempty(value.error.message)
    ? (value as unknown as BridgeMessage)
    : null;
}

export function acceptBridgeMessage(
  message: BridgeMessage,
  session: string,
  minRevision: number
): boolean {
  return message.session === session && message.revision >= minRevision;
}
