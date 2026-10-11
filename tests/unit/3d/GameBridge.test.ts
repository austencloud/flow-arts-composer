import { describe, it, expect, vi } from "vitest";
import { GameBridge } from "#lib/shared/3d/debug/game-bridge.js";
import type {
  GameBridgeBindings,
  PhysicsBindings,
  CameraBindings,
  PlaybackBindings,
  PerformerLike,
  PerformerManager,
  BridgeRequest,
  BridgeResponse,
} from "#lib/shared/3d/debug/game-bridge-types.js";


function createMockPerformer(overrides: Partial<PerformerLike> = {}): PerformerLike {
  return {
    position: { x: 0, y: 0, z: 0 },
    isPlaying: false,
    hasSequence: false,
    currentStepIndex: 0,
    totalSteps: 0,
    loop: false,
    loadedSequence: null,
    play: vi.fn(),
    pause: vi.fn(),
    reset: vi.fn(),
    nextStep: vi.fn(),
    prevStep: vi.fn(),
    goToStep: vi.fn(),
    ...overrides,
  };
}

function createMockPerformerManager(
  performers: PerformerLike[] = [],
  activeIndex = 0,
): PerformerManager {
  return {
    performers,
    activeIndex,
    selectPerformer: vi.fn((_i: number) => {
      // no-op for testing
    }),
    setSpeed: vi.fn(),
  };
}

function createMockBindings(overrides?: {
  physics?: Partial<PhysicsBindings>;
  camera?: Partial<CameraBindings>;
  playback?: Partial<PlaybackBindings>;
}): GameBridgeBindings {
  return {
    physics: {
      getPlayerPosition: () => ({ x: 1, y: 0.85, z: 2 }),
      getPlayerVelocity: () => ({ x: 0, y: 0, z: 0 }),
      isGrounded: () => true,
      movePlayer: vi.fn(),
      teleportPlayer: vi.fn(),
      raycast: () => ({ hit: false }),
      ...overrides?.physics,
    },
    camera: {
      getYaw: () => 0,
      getPitch: () => 0,
      getMode: () => "first_person",
      setYaw: vi.fn(),
      setPitch: vi.fn(),
      setMode: vi.fn(),
      ...overrides?.camera,
    },
    playback: {
      getPerformerManager: () => null,
      getSpeed: () => 1,
      setSpeed: vi.fn(),
      ...overrides?.playback,
    },
  };
}

/**
 * Helper to exercise GameBridge methods.
 * Since executeMethod is private, we call handleRequest directly.
 *
 * IMPORTANT: Tests that call `move` must use vi.useFakeTimers() because
 * GameBridge.move() internally does `await new Promise(r => setTimeout(r, 16))`
 * per step. With fake timers, vi.runAllTimersAsync() flushes those sleeps.
 *
 * We use numeric literal 1 for WebSocket.OPEN readyState instead of the
 * WebSocket.OPEN constant, since jsdom may not define it in all configs.
 */
function createTestBridge(bindings: GameBridgeBindings) {
  const sentMessages: string[] = [];

  // Create bridge instance
  const bridge = new GameBridge(bindings, {
    wsUrl: "ws://test",
    debug: false,
    autoReconnect: false,
  });

  // Mock WebSocket — capture sent messages
  // readyState: 1 === WebSocket.OPEN (use literal to avoid jsdom dependency)
  const mockWs = {
    readyState: 1,
    send: vi.fn((data: string) => sentMessages.push(data)),
    close: vi.fn(),
    onopen: null as ((ev: Event) => void) | null,
    onclose: null as ((ev: CloseEvent) => void) | null,
    onmessage: null as ((ev: MessageEvent) => void) | null,
    onerror: null as ((ev: Event) => void) | null,
  };

  // Inject the mock WebSocket
  (bridge as any).ws = mockWs;
  (bridge as any).isAuthenticated = true;

  /**
   * Send a request and return the response.
   * For async methods like `move`, caller must use fake timers:
   *   vi.useFakeTimers();
   *   const promise = sendRequest("move", { direction: "forward", distance: 1 });
   *   await vi.runAllTimersAsync();
   *   const response = await promise;
   *   vi.useRealTimers();
   */
  async function sendRequest(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<BridgeResponse> {
    const request: BridgeRequest = {
      type: "request",
      id: `test-${Date.now()}-${Math.random()}`,
      method,
      params,
    };

    // Trigger the message handler (returns promise for async methods)
    await (bridge as any).handleRequest(request);

    // Find the response in sent messages
    const responses = sentMessages
      .map((s) => JSON.parse(s) as BridgeResponse)
      .filter((m) => m.type === "response" && m.id === request.id);

    return responses[responses.length - 1]!;
  }

  return { bridge, sendRequest, sentMessages, mockWs };
}

describe("GameBridge", () => {
  describe("state queries", () => {
    it("getState returns all required fields", async () => {
      const bindings = createMockBindings();
      const { sendRequest } = createTestBridge(bindings);

      const response = await sendRequest("getState");

      expect(response.error).toBeUndefined();
      const state = response.result as any;
      expect(state.position).toEqual({ x: 1, y: 0.85, z: 2 });
      expect(state.rotation).toHaveProperty("yaw");
      expect(state.rotation).toHaveProperty("pitch");
      expect(state.velocity).toBeDefined();
      expect(state.grounded).toBe(true);
      expect(state.cameraMode).toBe("first_person");
      expect(state.isPlaying).toBe(false);
      expect(state.hasSequence).toBe(false);
      expect(state.timestamp).toBeGreaterThan(0);
    });

    it("getState with no performer returns safe defaults", async () => {
      const bindings = createMockBindings({
        playback: { getPerformerManager: () => null },
      });
      const { sendRequest } = createTestBridge(bindings);

      const response = await sendRequest("getState");
      const state = response.result as any;

      expect(state.isPlaying).toBe(false);
      expect(state.hasSequence).toBe(false);
    });

    it("getScene filters performers by radius", async () => {
      const performer = createMockPerformer({
        position: { x: 5, y: 0, z: 0 },
      });
      const pm = createMockPerformerManager([performer]);
      const bindings = createMockBindings({
        physics: { getPlayerPosition: () => ({ x: 0, y: 0.85, z: 0 }) },
        playback: { getPerformerManager: () => pm },
      });
      const { sendRequest } = createTestBridge(bindings);

      // Radius 10 should include
      const r1 = await sendRequest("getScene", { radius: 10 });
      expect((r1.result as any).objects).toHaveLength(1);

      // Radius 3 should exclude
      const r2 = await sendRequest("getScene", { radius: 3 });
      expect((r2.result as any).objects).toHaveLength(0);
    });

    it("getScene filters by type", async () => {
      const performer = createMockPerformer({
        position: { x: 1, y: 0, z: 0 },
      });
      const pm = createMockPerformerManager([performer]);
      const bindings = createMockBindings({
        physics: { getPlayerPosition: () => ({ x: 0, y: 0.85, z: 0 }) },
        playback: { getPerformerManager: () => pm },
      });
      const { sendRequest } = createTestBridge(bindings);

      // Filter for performers — should include
      const r1 = await sendRequest("getScene", { radius: 10, types: ["performer"] });
      expect((r1.result as any).objects).toHaveLength(1);

      // Filter for props only — performer excluded
      const r2 = await sendRequest("getScene", { radius: 10, types: ["prop"] });
      expect((r2.result as any).objects).toHaveLength(0);
    });
  });

  describe("movement commands", () => {
    it("move forward with yaw=0 applies positive Z", async () => {
      vi.useFakeTimers();
      const movePlayer = vi.fn();
      const bindings = createMockBindings({
        physics: { movePlayer },
      });
      const { sendRequest } = createTestBridge(bindings);

      const promise = sendRequest("move", { direction: "forward", distance: 1 });
      await vi.runAllTimersAsync();
      await promise;

      expect(movePlayer).toHaveBeenCalled();
      const firstCall = movePlayer.mock.calls[0]!;
      const movement = firstCall[0] as { x: number; y: number; z: number };
      expect(movement.z).toBeGreaterThan(0);
      vi.useRealTimers();
    });

    it("move left applies perpendicular offset from yaw", async () => {
      vi.useFakeTimers();
      const movePlayer = vi.fn();
      const bindings = createMockBindings({
        physics: { movePlayer },
        camera: { getYaw: () => 0 }, // facing +Z
      });
      const { sendRequest } = createTestBridge(bindings);

      const promise = sendRequest("move", { direction: "left", distance: 1 });
      await vi.runAllTimersAsync();
      await promise;

      expect(movePlayer).toHaveBeenCalled();
      const firstCall = movePlayer.mock.calls[0]!;
      const movement = firstCall[0] as { x: number; z: number };
      // Left from +Z facing is -X direction: sin(0 - PI/2) = -1
      expect(movement.x).toBeLessThan(0);
      vi.useRealTimers();
    });

    it("move with sprint doubles the movement vector", async () => {
      vi.useFakeTimers();
      const movePlayer = vi.fn();
      const bindings = createMockBindings({
        physics: { movePlayer },
      });

      // Without sprint
      const { sendRequest: sendNormal } = createTestBridge(bindings);
      const p1 = sendNormal("move", { direction: "forward", distance: 1 });
      await vi.runAllTimersAsync();
      await p1;
      const normalZ = (movePlayer.mock.calls[0]![0] as { z: number }).z;

      // Reset and test with sprint
      movePlayer.mockClear();
      const { sendRequest: sendSprint } = createTestBridge(
        createMockBindings({ physics: { movePlayer } }),
      );
      const p2 = sendSprint("move", { direction: "forward", distance: 1, sprint: true });
      await vi.runAllTimersAsync();
      await p2;
      const sprintZ = (movePlayer.mock.calls[0]![0] as { z: number }).z;

      expect(Math.abs(sprintZ)).toBeCloseTo(Math.abs(normalZ) * 2, 2);
      vi.useRealTimers();
    });

    it("move with distance 3.0 breaks into 6 steps", async () => {
      vi.useFakeTimers();
      const movePlayer = vi.fn();
      const bindings = createMockBindings({
        physics: { movePlayer },
      });
      const { sendRequest } = createTestBridge(bindings);

      const promise = sendRequest("move", { direction: "forward", distance: 3 });
      await vi.runAllTimersAsync();
      await promise;

      // ceil(3 / 0.5) = 6 steps
      expect(movePlayer).toHaveBeenCalledTimes(6);
      vi.useRealTimers();
    });

    it("teleport calls teleportPlayer with exact coordinates", async () => {
      const teleportPlayer = vi.fn();
      const bindings = createMockBindings({
        physics: { teleportPlayer },
      });
      const { sendRequest } = createTestBridge(bindings);

      await sendRequest("teleport", { x: 5, y: 0, z: 10 });

      expect(teleportPlayer).toHaveBeenCalledWith({ x: 5, y: 0, z: 10 });
    });
  });

  describe("jump", () => {
    it("jump when grounded succeeds and applies Y impulse", async () => {
      const movePlayer = vi.fn();
      const bindings = createMockBindings({
        physics: { isGrounded: () => true, movePlayer },
      });
      const { sendRequest } = createTestBridge(bindings);

      const response = await sendRequest("jump");
      const result = response.result as any;

      expect(result.success).toBe(true);
      expect(movePlayer).toHaveBeenCalledWith(
        expect.objectContaining({ y: 5.0 }),
        expect.any(Number),
      );
    });

    it("jump when airborne fails", async () => {
      const movePlayer = vi.fn();
      const bindings = createMockBindings({
        physics: { isGrounded: () => false, movePlayer },
      });
      const { sendRequest } = createTestBridge(bindings);

      const response = await sendRequest("jump");
      const result = response.result as any;

      expect(result.success).toBe(false);
      expect(movePlayer).not.toHaveBeenCalled();
    });
  });

  describe("camera", () => {
    it("look converts degrees to radians", async () => {
      const setYaw = vi.fn();
      const bindings = createMockBindings({
        camera: { setYaw, getYaw: () => Math.PI / 2 },
      });
      const { sendRequest } = createTestBridge(bindings);

      await sendRequest("look", { yaw: 90 });

      expect(setYaw).toHaveBeenCalledWith(expect.closeTo(Math.PI / 2, 4));
    });

    it("lookAt computes correct yaw to face target", async () => {
      const setYaw = vi.fn();
      const bindings = createMockBindings({
        physics: { getPlayerPosition: () => ({ x: 0, y: 0.85, z: 0 }) },
        camera: { setYaw },
      });
      const { sendRequest } = createTestBridge(bindings);

      // Target at (1, 0, 0) from origin — yaw should be atan2(1, 0) = PI/2
      await sendRequest("lookAt", { x: 1, y: 0.85, z: 0 });

      expect(setYaw).toHaveBeenCalledWith(expect.closeTo(Math.PI / 2, 4));
    });

    it("setCameraMode accepts valid mode", async () => {
      const setMode = vi.fn();
      const bindings = createMockBindings({ camera: { setMode } });
      const { sendRequest } = createTestBridge(bindings);

      const response = await sendRequest("setCameraMode", { mode: "first_person" });
      const result = response.result as any;

      expect(result.success).toBe(true);
      expect(setMode).toHaveBeenCalledWith("first_person");
    });

    it("setCameraMode rejects invalid mode", async () => {
      const setMode = vi.fn();
      const bindings = createMockBindings({ camera: { setMode } });
      const { sendRequest } = createTestBridge(bindings);

      const response = await sendRequest("setCameraMode", { mode: "invalid" });
      const result = response.result as any;

      expect(result.success).toBe(false);
      expect(setMode).not.toHaveBeenCalled();
    });
  });

  describe("interaction stubs", () => {
    it("interact returns not-implemented without crashing", async () => {
      const bindings = createMockBindings();
      const { sendRequest } = createTestBridge(bindings);

      const response = await sendRequest("interact", {});
      const result = response.result as any;

      expect(result.success).toBe(false);
      expect(result.error).toContain("Not implemented");
    });

    it("selectPerformer with valid index succeeds", async () => {
      const performer = createMockPerformer();
      const pm = createMockPerformerManager([performer]);
      const bindings = createMockBindings({
        playback: { getPerformerManager: () => pm },
      });
      const { sendRequest } = createTestBridge(bindings);

      const response = await sendRequest("selectPerformer", { index: 0 });
      const result = response.result as any;

      expect(result.success).toBe(true);
      expect(pm.selectPerformer).toHaveBeenCalledWith(0);
    });

    it("selectPerformer with out-of-bounds index fails", async () => {
      const pm = createMockPerformerManager([]);
      const bindings = createMockBindings({
        playback: { getPerformerManager: () => pm },
      });
      const { sendRequest } = createTestBridge(bindings);

      const response = await sendRequest("selectPerformer", { index: 99 });
      const result = response.result as any;

      expect(result.success).toBe(false);
    });
  });

  describe("playback", () => {
    it("play action calls performer.play()", async () => {
      const performer = createMockPerformer({ hasSequence: true });
      const pm = createMockPerformerManager([performer]);
      const bindings = createMockBindings({
        playback: { getPerformerManager: () => pm },
      });
      const { sendRequest } = createTestBridge(bindings);

      await sendRequest("playback", { action: "play" });

      expect(performer.play).toHaveBeenCalled();
    });

    it("goto action calls goToStep with index", async () => {
      const performer = createMockPerformer({ totalSteps: 10 });
      const pm = createMockPerformerManager([performer]);
      const bindings = createMockBindings({
        playback: { getPerformerManager: () => pm },
      });
      const { sendRequest } = createTestBridge(bindings);

      await sendRequest("playback", { action: "goto", step: 3 });

      expect(performer.goToStep).toHaveBeenCalledWith(3);
    });

    it("getPlaybackState with no performer returns safe defaults", async () => {
      const bindings = createMockBindings();
      const { sendRequest } = createTestBridge(bindings);

      const response = await sendRequest("getPlaybackState");
      const state = response.result as any;

      expect(state.isPlaying).toBe(false);
      expect(state.currentStep).toBe(0);
      expect(state.totalSteps).toBe(0);
    });
  });

  describe("error handling", () => {
    it("unknown method returns error", async () => {
      const bindings = createMockBindings();
      const { sendRequest } = createTestBridge(bindings);

      const response = await sendRequest("nonexistentMethod");

      expect(response.error).toContain("Unknown method");
    });
  });

  describe("tick events", () => {
    it("emits position_update when moved > 0.1m", () => {
      const bindings = createMockBindings({
        physics: {
          getPlayerPosition: () => ({ x: 1, y: 0.85, z: 2 }),
          getPlayerVelocity: () => ({ x: 1, y: 0, z: 0 }),
        },
      });
      const { bridge, mockWs } = createTestBridge(bindings);

      // First tick establishes baseline at (1, 0.85, 2)
      bridge.tick();

      // Update position to > 0.1m away (use 0.15m on X to exceed threshold)
      (bindings.physics as any).getPlayerPosition = () => ({
        x: 1.15,
        y: 0.85,
        z: 2,
      });

      bridge.tick();

      // Check that a position_update event was sent
      const events = (mockWs.send as any).mock.calls
        .map((c: string[]) => JSON.parse(c[0]))
        .filter((m: any) => m.type === "event" && m.event === "position_update");

      expect(events.length).toBeGreaterThan(0);
    });

    it("emits grounded_changed when state flips", () => {
      let grounded = true;
      const bindings = createMockBindings({
        physics: { isGrounded: () => grounded },
      });
      const { bridge, mockWs } = createTestBridge(bindings);

      bridge.tick(); // establishes baseline (grounded = true)

      grounded = false;
      bridge.tick(); // should emit grounded_changed

      const events = (mockWs.send as any).mock.calls
        .map((c: string[]) => JSON.parse(c[0]))
        .filter(
          (m: any) => m.type === "event" && m.event === "grounded_changed",
        );

      expect(events.length).toBeGreaterThan(0);
      // The last grounded_changed event should reflect the flip to false
      expect(events[events.length - 1].data.grounded).toBe(false);
    });

    it("tick does nothing when disconnected", () => {
      const bindings = createMockBindings();
      const { bridge, mockWs } = createTestBridge(bindings);

      // Disconnect
      (bridge as any).isAuthenticated = false;
      (bridge as any).ws = null;

      // Should not throw
      expect(() => bridge.tick()).not.toThrow();
      expect(mockWs.send).not.toHaveBeenCalled();
    });
  });
});
