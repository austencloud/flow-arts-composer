import { describe, expect, it } from "vitest";
import { acceptBridgeMessage, parseBridgeMessage } from "./bridge-protocol";

const state = {
  capabilities: {
    maxPerformers: 1,
    characterIds: ["ch01"],
    propIds: ["staff", "fan"],
    cameraModes: ["snap", "orbit", "pan", "zoom", "preset", "focus"],
    playbackActions: ["pause", "resume", "restart", "rate"],
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
    position: { x: 0, y: 2.3, z: 5.2 },
    target: { x: 0, y: 1.1, z: 0 },
    fov: 50,
    mode: "orbit",
    gestureComplete: true,
  },
  playback: {
    preparedClip: {
      id: "ch01/staff/A",
      title: "Staff practice loop",
      provenance: "capture",
    },
    status: "playing",
    rate: 1,
    phase: 0,
  },
};

const result = {
  v: 1,
  session: "session-a",
  revision: 3,
  type: "result",
  replyTo: "command-1",
  ok: true,
  state,
};

describe("native viewer bridge messages", () => {
  it("accepts complete results and native state updates", () => {
    expect(parseBridgeMessage(JSON.stringify(result))).toEqual(result);
    const update = {
      ...result,
      type: "state",
      replyTo: undefined,
      ok: undefined,
    };
    expect(parseBridgeMessage(JSON.stringify(update))).toEqual(
      JSON.parse(JSON.stringify(update))
    );
  });

  it("accepts the empty native stage after removing its only performer", () => {
    const emptyState = {
      ...state,
      performers: [],
      selectedPerformerId: null,
      playback: {
        preparedClip: null,
        status: "unavailable",
        rate: 1,
        phase: 0,
      },
    };
    expect(
      parseBridgeMessage(JSON.stringify({ ...result, state: emptyState }))
    ).not.toBeNull();
    expect(
      parseBridgeMessage(
        JSON.stringify({
          ...result,
          state: {
            ...emptyState,
            playback: { ...emptyState.playback, status: "playing" },
          },
        })
      )
    ).toBeNull();
  });

  it("accepts Composer actors waiting for their first motion transfer", () => {
    const waiting = {
      ...state,
      playback: {
        preparedClip: null,
        status: "unavailable",
        rate: 1,
        phase: 0,
      },
    };
    expect(
      parseBridgeMessage(JSON.stringify({ ...result, state: waiting }))
    ).not.toBeNull();
  });

  it("rejects malformed envelopes and incomplete failures", () => {
    expect(parseBridgeMessage("{")).toBeNull();
    expect(parseBridgeMessage("[]")).toBeNull();
    expect(parseBridgeMessage(JSON.stringify({ ...result, v: 2 }))).toBeNull();
    expect(
      parseBridgeMessage(JSON.stringify({ ...result, revision: -1 }))
    ).toBeNull();
    expect(
      parseBridgeMessage(JSON.stringify({ ...result, revision: 1.5 }))
    ).toBeNull();
    expect(
      parseBridgeMessage(JSON.stringify({ ...result, replyTo: "" }))
    ).toBeNull();
    expect(
      parseBridgeMessage(JSON.stringify({ ...result, ok: false }))
    ).toBeNull();
    expect(
      parseBridgeMessage(
        JSON.stringify({
          ...result,
          ok: false,
          error: { code: "cast_limit", message: "One performer" },
        })
      )
    ).not.toBeNull();
  });

  it("rejects nonfinite scene numbers and missing snapshot fields", () => {
    const fields = [
      { ...state, camera: { ...state.camera, fov: null } },
      {
        ...state,
        camera: { ...state.camera, position: { x: null, y: 2, z: 3 } },
      },
      { ...state, performers: [{ ...state.performers[0], facingAngle: null }] },
      { ...state, playback: { ...state.playback, rate: null } },
      { ...state, capabilities: { ...state.capabilities, maxPerformers: -1 } },
      { ...state, selectedPerformerId: undefined },
    ];
    for (const invalidState of fields) {
      expect(
        parseBridgeMessage(JSON.stringify({ ...result, state: invalidState }))
      ).toBeNull();
    }
    expect(
      parseBridgeMessage(
        JSON.stringify(result).replace('"fov":50', '"fov":1e400')
      )
    ).toBeNull();
  });

  it("filters foreign sessions and revisions older than the authored scene", () => {
    const message = parseBridgeMessage(JSON.stringify(result));
    expect(message).not.toBeNull();
    if (!message) return;
    expect(acceptBridgeMessage(message, "session-a", 3)).toBe(true);
    expect(acceptBridgeMessage(message, "session-b", 0)).toBe(false);
    expect(acceptBridgeMessage(message, "session-a", 4)).toBe(false);
  });
});
