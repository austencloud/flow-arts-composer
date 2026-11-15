// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  CameraControls,
  configureViewerOrbitNavigation,
  resolveCameraControlsRightAction,
  VIEWER_ORBIT_REST_DISTANCE,
} from "#lib/shared/3d/camera/camera-controls-runtime.js";
import type { ApplicationThreadCameraFrameScheduler } from "#lib/shared/3d/worker-renderer/domain/application-thread-camera.js";
import { ApplicationThreadCameraController } from "#lib/shared/3d/worker-renderer/services/application-thread-camera-controller.js";

class ManualFrameScheduler implements ApplicationThreadCameraFrameScheduler {
  private nextHandle = 1;
  private callbacks = new Map<number, FrameRequestCallback>();

  request(callback: FrameRequestCallback): number {
    const handle = this.nextHandle++;
    this.callbacks.set(handle, callback);
    return handle;
  }

  cancel(handle: number): void {
    this.callbacks.delete(handle);
  }

  step(now: number): void {
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of callbacks) callback(now);
  }

  get pendingFrames(): number {
    return this.callbacks.size;
  }
}

function createElement(): HTMLElement {
  // The shared setup stubs createElement; wheel regression checks need real DOM events.
  const element = document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div"
  );
  Object.defineProperties(element, {
    clientWidth: { value: 800 },
    clientHeight: { value: 400 },
    ownerDocument: { value: document },
    getBoundingClientRect: {
      value: () => ({
        x: 0,
        y: 0,
        top: 0,
        right: 800,
        bottom: 400,
        left: 0,
        width: 800,
        height: 400,
        toJSON: () => ({}),
      }),
    },
  });
  return element as HTMLElement;
}

function pressLeftButton(element: HTMLElement): void {
  // jsdom has no PointerEvent; camera-controls only reads these fields.
  const down = new MouseEvent("pointerdown", {
    button: 0,
    buttons: 1,
    clientX: 400,
    clientY: 200,
    bubbles: true,
  });
  Object.defineProperties(down, {
    pointerId: { value: 1 },
    pointerType: { value: "mouse" },
  });
  element.dispatchEvent(down);
}

describe("ApplicationThreadCameraController", () => {
  it("keeps wheel travel moving past a panned target without collapsing the orbit", () => {
    const element = createElement();
    const scheduler = new ManualFrameScheduler();
    const controller = new ApplicationThreadCameraController(element, {
      initialPosition: [-1.367, 27.09, -70.943],
      initialTarget: [-1.367, 27.09, -69.943],
      frameScheduler: scheduler,
    });
    configureViewerOrbitNavigation(controller.controls);
    scheduler.step(0);
    const before = controller.getSnapshot();
    const wheel = new WheelEvent("wheel", {
      deltaY: -120,
      clientX: 400,
      clientY: 200,
      cancelable: true,
    });
    element.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(controller.controls.mouseButtons.wheel).toBe(
      CameraControls.ACTION.DOLLY
    );
    for (let frame = 1; frame < 90; frame++) scheduler.step(frame * 16);
    const after = controller.getSnapshot();
    expect(after.position[2]).toBeGreaterThan(before.position[2] + 0.01);
    expect(after.target[2]).toBeGreaterThan(before.target[2] + 0.01);
    expect(
      Math.hypot(...after.position.map((value, i) => value - after.target[i]!))
    ).toBeCloseTo(1, 4);
    controller.dispose();
  });

  it("moves a travel-pushed pivot back out before the next rotate", () => {
    const element = createElement();
    const scheduler = new ManualFrameScheduler();
    const controller = new ApplicationThreadCameraController(element, {
      initialPosition: [0, 2.47, -2.64],
      initialTarget: [0, 1.1, 0],
      frameScheduler: scheduler,
    });
    configureViewerOrbitNavigation(controller.controls);
    let now = 0;
    scheduler.step(now);
    for (let tick = 0; tick < 40; tick++) {
      element.dispatchEvent(
        new WheelEvent("wheel", { deltaY: -120, clientX: 400, clientY: 200 })
      );
      scheduler.step((now += 16));
    }
    for (let frame = 0; frame < 120; frame++) scheduler.step((now += 16));
    expect(controller.controls.distance).toBeCloseTo(1, 2);
    const before = controller.getSnapshot();

    pressLeftButton(element);

    const after = controller.getSnapshot();
    expect(controller.controls.distance).toBeCloseTo(
      VIEWER_ORBIT_REST_DISTANCE,
      4
    );
    // Same camera, same view ray: re-seating is invisible until the drag.
    for (let i = 0; i < 3; i++) {
      expect(after.position[i]).toBeCloseTo(before.position[i]!, 6);
    }
    const ray = (s: typeof before) => {
      const d = s.target.map((v, i) => v - s.position[i]!);
      const len = Math.hypot(...d);
      return d.map((v) => v / len);
    };
    ray(after).forEach((v, i) => expect(v).toBeCloseTo(ray(before)[i]!, 6));
    controller.dispose();
  });

  it("does not collapse the orbit when a wheel-out follows a hard wheel-in", () => {
    const element = createElement();
    const scheduler = new ManualFrameScheduler();
    const controller = new ApplicationThreadCameraController(element, {
      initialPosition: [0, 1.1, -2],
      initialTarget: [0, 1.1, 0],
      frameScheduler: scheduler,
    });
    configureViewerOrbitNavigation(controller.controls);
    let now = 0;
    scheduler.step(now);
    // A fast flick queues an end radius well under minDistance...
    for (let tick = 0; tick < 25; tick++) {
      element.dispatchEvent(
        new WheelEvent("wheel", { deltaY: -120, clientX: 400, clientY: 200 })
      );
    }
    scheduler.step((now += 16));
    // ...and one tick back out flips the travel direction mid-flight.
    element.dispatchEvent(
      new WheelEvent("wheel", { deltaY: 120, clientX: 400, clientY: 200 })
    );
    let smallest = Infinity;
    for (let frame = 0; frame < 240; frame++) {
      scheduler.step((now += 16));
      smallest = Math.min(smallest, controller.controls.distance);
    }
    expect(smallest).toBeGreaterThan(0.74);
    expect(controller.controls.distance).toBeGreaterThanOrEqual(0.99);
    controller.dispose();
  });

  it("stops at maxDistance on wheel-out instead of shoving the pivot away", () => {
    const element = createElement();
    const scheduler = new ManualFrameScheduler();
    const controller = new ApplicationThreadCameraController(element, {
      initialPosition: [0, 4, 20],
      initialTarget: [0, 0, 0],
      frameScheduler: scheduler,
    });
    configureViewerOrbitNavigation(controller.controls);
    let now = 0;
    scheduler.step(now);
    for (let tick = 0; tick < 60; tick++) {
      element.dispatchEvent(
        new WheelEvent("wheel", { deltaY: 120, clientX: 400, clientY: 200 })
      );
      scheduler.step((now += 16));
    }
    for (let frame = 0; frame < 240; frame++) scheduler.step((now += 16));
    const after = controller.getSnapshot();
    expect(Math.hypot(...after.target)).toBeLessThan(2);
    expect(controller.controls.distance).toBeLessThanOrEqual(25.01);
    controller.dispose();
  });

  it("keeps a pivot the wheel stopped on without travelling past it", () => {
    const element = createElement();
    const scheduler = new ManualFrameScheduler();
    const controller = new ApplicationThreadCameraController(element, {
      initialPosition: [0, 1.1, -1],
      initialTarget: [0, 1.1, 0],
      frameScheduler: scheduler,
    });
    configureViewerOrbitNavigation(controller.controls);
    scheduler.step(0);
    scheduler.step(16);

    pressLeftButton(element);

    const target = controller.getSnapshot().target;
    expect(target[0]).toBeCloseTo(0, 6);
    expect(target[1]).toBeCloseTo(1.1, 6);
    expect(target[2]).toBeCloseTo(0, 6);
    expect(controller.controls.distance).toBeCloseTo(1, 4);
    controller.dispose();
  });

  it("zooms out about the pivot, not the pointer, so the pivot stays on the performer", () => {
    const element = createElement();
    const scheduler = new ManualFrameScheduler();
    const controller = new ApplicationThreadCameraController(element, {
      initialPosition: [0, 0.5, 6],
      initialTarget: [0, -0.45, 0],
      frameScheduler: scheduler,
    });
    configureViewerOrbitNavigation(controller.controls, {
      pivotCast: () => ({ spots: [{ x: 0, z: 0 }], floorY: -1, headY: 0.8 }),
    });
    let now = 0;
    scheduler.step(now);
    for (let tick = 0; tick < 30; tick++) {
      // Pointer low and to the right, like a pane point under the performer.
      element.dispatchEvent(
        new WheelEvent("wheel", { deltaY: 120, clientX: 700, clientY: 350 })
      );
      scheduler.step((now += 16));
    }
    for (let frame = 0; frame < 240; frame++) scheduler.step((now += 16));
    const target = controller.getSnapshot().target;
    expect(target[0]).toBeCloseTo(0, 4);
    expect(target[1]).toBeCloseTo(-0.45, 4);
    expect(target[2]).toBeCloseTo(0, 4);
    controller.dispose();
  });

  it("keeps the camera above the floor while wheel-in travels toward a point low in the view", () => {
    const element = createElement();
    const scheduler = new ManualFrameScheduler();
    const floorY = -1.012;
    const controller = new ApplicationThreadCameraController(element, {
      initialPosition: [0, 0.2, 6],
      initialTarget: [0, -0.3, 0],
      frameScheduler: scheduler,
    });
    configureViewerOrbitNavigation(controller.controls, {
      pivotCast: () => ({ spots: [{ x: 0, z: 0 }], floorY, headY: 0.8 }),
    });
    let now = 0;
    scheduler.step(now);
    let lowestCamera = Infinity;
    let lowestPivot = Infinity;
    const record = () => {
      const snapshot = controller.getSnapshot();
      lowestCamera = Math.min(lowestCamera, snapshot.position[1]!);
      lowestPivot = Math.min(lowestPivot, snapshot.target[1]!);
    };
    for (let tick = 0; tick < 40; tick++) {
      // Pointer in the bottom third of the view.
      element.dispatchEvent(
        new WheelEvent("wheel", { deltaY: -120, clientX: 400, clientY: 360 })
      );
      scheduler.step((now += 16));
      record();
    }
    for (let frame = 0; frame < 240; frame++) {
      scheduler.step((now += 16));
      record();
    }
    expect(lowestCamera).toBeGreaterThanOrEqual(floorY + 0.25 - 1e-6);
    expect(lowestPivot).toBeGreaterThanOrEqual(floorY - 1e-6);
    // The rig was lifted, not pushed sideways: the travel still went forward.
    expect(controller.getSnapshot().position[2]).toBeLessThan(6);
    controller.dispose();
  });

  it("slides a pivot left near the lens out to the performer when a rotate starts", () => {
    const element = createElement();
    const scheduler = new ManualFrameScheduler();
    const controller = new ApplicationThreadCameraController(element, {
      initialPosition: [0, 0.4, 5],
      initialTarget: [0, 0.4, 3.6],
      frameScheduler: scheduler,
    });
    configureViewerOrbitNavigation(controller.controls, {
      pivotCast: () => ({ spots: [{ x: 0, z: 0 }], floorY: -1, headY: 0.8 }),
    });
    scheduler.step(0);
    scheduler.step(16);
    const before = controller.getSnapshot();

    pressLeftButton(element);

    const after = controller.getSnapshot();
    for (let i = 0; i < 3; i++) {
      expect(after.position[i]).toBeCloseTo(before.position[i]!, 6);
    }
    expect(after.target[2]).toBeCloseTo(0, 4);
    expect(controller.controls.distance).toBeCloseTo(5, 4);
    controller.dispose();
  });

  it("owns the current camera pose and emits a worker-safe rolled snapshot", () => {
    const scheduler = new ManualFrameScheduler();
    const roll = Math.PI / 6;
    const controller = new ApplicationThreadCameraController(createElement(), {
      initialPosition: { x: 2, y: 3, z: 8 },
      initialTarget: { x: 0, y: 1, z: 0 },
      fov: 47,
      roll,
      frameScheduler: scheduler,
    });

    const snapshot = controller.getSnapshot();
    expect(snapshot.position[0]).toBeCloseTo(2);
    expect(snapshot.position[1]).toBeCloseTo(3);
    expect(snapshot.position[2]).toBeCloseTo(8);
    expect(snapshot.target[0]).toBeCloseTo(0);
    expect(snapshot.target[1]).toBeCloseTo(1);
    expect(snapshot.target[2]).toBeCloseTo(0);
    expect(snapshot.fov).toBe(47);
    expect(snapshot.roll).toBe(roll);
    expect(snapshot.up).toEqual([0, 1, 0]);
    expect(snapshot.quaternion).toHaveLength(4);
    expect(snapshot.quaternion).toEqual(controller.camera.quaternion.toArray());
    expect(controller.camera.aspect).toBe(2);

    controller.dispose();
  });

  it("preserves the shared right, middle, and two-finger actions", () => {
    const panning = new ApplicationThreadCameraController(createElement(), {
      initialPosition: [0, 2, 8],
      initialTarget: [0, 0, 0],
      enablePan: true,
      frameScheduler: new ManualFrameScheduler(),
    });
    const orbitOnly = new ApplicationThreadCameraController(createElement(), {
      initialPosition: [0, 2, 8],
      initialTarget: [0, 0, 0],
      enablePan: false,
      frameScheduler: new ManualFrameScheduler(),
    });
    const rightOrbit = new ApplicationThreadCameraController(createElement(), {
      initialPosition: [0, 2, 8],
      initialTarget: [0, 0, 0],
      rightDragAction: "rotate",
      frameScheduler: new ManualFrameScheduler(),
    });

    expect(panning.controls.mouseButtons.right).toBe(
      CameraControls.ACTION.TRUCK
    );
    expect(panning.controls.mouseButtons.middle).toBe(
      CameraControls.ACTION.DOLLY
    );
    expect(panning.controls.touches.two).toBe(
      CameraControls.ACTION.TOUCH_DOLLY_TRUCK
    );
    expect(orbitOnly.controls.mouseButtons.right).toBe(
      CameraControls.ACTION.NONE
    );
    expect(orbitOnly.controls.mouseButtons.middle).toBe(
      CameraControls.ACTION.DOLLY
    );
    expect(orbitOnly.controls.touches.two).toBe(
      CameraControls.ACTION.TOUCH_DOLLY_ROTATE
    );
    expect(rightOrbit.controls.mouseButtons.right).toBe(
      CameraControls.ACTION.ROTATE
    );
    expect(resolveCameraControlsRightAction("pan", false)).toBe(
      CameraControls.ACTION.TRUCK
    );

    panning.dispose();
    orbitOnly.dispose();
    rightOrbit.dispose();
  });

  it("updates on animation frames and stops cleanly while paused or disposed", () => {
    const scheduler = new ManualFrameScheduler();
    const onChange = vi.fn();
    const controller = new ApplicationThreadCameraController(createElement(), {
      initialPosition: [0, 2, 8],
      initialTarget: [0, 0, 0],
      autoRotate: true,
      frameScheduler: scheduler,
      onChange,
    });
    const update = vi.spyOn(controller.controls, "update");

    expect(scheduler.pendingFrames).toBe(1);
    scheduler.step(1_000);
    scheduler.step(1_016);
    expect(update).toHaveBeenNthCalledWith(1, 0);
    expect(update).toHaveBeenNthCalledWith(2, 0.016);
    expect(onChange).toHaveBeenCalled();

    controller.pause();
    expect(controller.isPaused).toBe(true);
    expect(scheduler.pendingFrames).toBe(0);
    scheduler.step(2_000);
    expect(update).toHaveBeenCalledTimes(2);

    controller.resume();
    expect(scheduler.pendingFrames).toBe(1);
    scheduler.step(3_000);
    expect(update).toHaveBeenLastCalledWith(0);

    controller.dispose();
    expect(controller.isDisposed).toBe(true);
    expect(scheduler.pendingFrames).toBe(0);
    expect(() => controller.resume()).toThrow("is disposed");
  });

  it("snaps immediately, reports changes and control-end snapshots", async () => {
    const scheduler = new ManualFrameScheduler();
    const onChange = vi.fn();
    const onControlStart = vi.fn();
    const onControlEnd = vi.fn();
    const controller = new ApplicationThreadCameraController(createElement(), {
      initialPosition: [0, 2, 8],
      initialTarget: [0, 0, 0],
      minDistance: 2,
      maxDistance: 40,
      frameScheduler: scheduler,
      onChange,
      onControlStart,
      onControlEnd,
    });

    await controller.snapTo([4, 5, 12], [1, 1, 0], undefined, false);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        position: [4, 5, 12],
        target: [1, 1, 0],
      })
    );
    expect(controller.controls.minDistance).toBe(2);
    expect(controller.controls.maxDistance).toBe(40);

    controller.controls.dispatchEvent({ type: "controlstart" });
    controller.controls.dispatchEvent({ type: "controlend" });
    expect(onControlStart).toHaveBeenCalledWith(controller.getSnapshot());
    expect(onControlEnd).toHaveBeenCalledWith(controller.getSnapshot());

    controller.dispose();
  });

  it("reports the current animated pose instead of the transition endpoint", () => {
    const scheduler = new ManualFrameScheduler();
    const controller = new ApplicationThreadCameraController(createElement(), {
      initialPosition: [0, 2, 8],
      initialTarget: [0, 0, 0],
      frameScheduler: scheduler,
    });

    void controller.snapTo([12, 8, 20], [4, 2, 1]);
    scheduler.step(1_000);
    scheduler.step(1_016);

    const snapshot = controller.getSnapshot();
    expect(snapshot.position).toEqual(controller.camera.position.toArray());
    expect(snapshot.position).not.toEqual([12, 8, 20]);
    expect(snapshot.target).not.toEqual([4, 2, 1]);

    controller.dispose();
  });
});
