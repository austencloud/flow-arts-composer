import { describe, expect, it, vi } from "vitest";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PerspectiveCamera,
  Raycaster,
  Vector2,
  Vector3,
} from "three";
import {
  clampPerformerPosition,
  clampGroupTranslation,
  createPerformerPointerInteraction,
  getPointerIntent,
  intersectHorizontalPlane,
  isWithinMinimumTouchTarget,
  resolveCameraRelativeNudge,
  resolvePerformerDragPosition,
  resolveTouchIntent,
  snapStagePositionToEightDirections,
} from "$lib/shared/3d/components/performer-interaction/performer-pointer-interaction.svelte";

function expectPositionCloseTo(
  actual: { x: number; z: number },
  expected: { x: number; z: number }
): void {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.z).toBeCloseTo(expected.z);
}

describe("performer pointer interaction", () => {
  it("keeps movement inside the click threshold until travel exceeds 8px", () => {
    expect(getPointerIntent({ x: 10, y: 10 }, { x: 18, y: 10 })).toBe("click");
    expect(getPointerIntent({ x: 10, y: 10 }, { x: 18.01, y: 10 })).toBe(
      "drag"
    );
  });

  it("uses immediate touch drag only for the selected performer", () => {
    expect(
      resolveTouchIntent({ selected: true, heldMs: 0, travelPx: 5.01 })
    ).toBe("drag");
    expect(
      resolveTouchIntent({ selected: false, heldMs: 249, travelPx: 4 })
    ).toBe("tap");
    expect(
      resolveTouchIntent({ selected: false, heldMs: 250, travelPx: 4 })
    ).toBe("drag");
    expect(
      resolveTouchIntent({ selected: false, heldMs: 300, travelPx: 5.01 })
    ).toBe("camera");
  });

  it("keeps a 44px minimum touch target around projected performers", () => {
    expect(isWithinMinimumTouchTarget({ x: 22, y: 0 }, { x: 0, y: 0 })).toBe(
      true
    );
    expect(isWithinMinimumTouchTarget({ x: 22.01, y: 0 }, { x: 0, y: 0 })).toBe(
      false
    );
  });

  it("intersects a horizontal drag plane and preserves the original grab offset", () => {
    expect(
      intersectHorizontalPlane(
        { x: 0, y: 4, z: 0 },
        { x: 0.5, y: -1, z: 0.25 },
        0,
        { x: 1, z: -2 }
      )
    ).toEqual({ x: 3, z: -1 });
  });

  it("rejects grazing rays instead of sending a performer toward infinity", () => {
    expect(
      intersectHorizontalPlane(
        { x: 0, y: 4, z: 0 },
        { x: 1, y: -0.00001, z: 0 },
        0,
        { x: 0, z: 0 }
      )
    ).toBeNull();
  });

  it("clamps to the stable deck bounds with performer clearance", () => {
    expect(
      clampPerformerPosition(
        { x: 20, z: -20 },
        { width: 10, depth: 8, zOffset: 1 },
        0.5
      )
    ).toEqual({ x: 4.5, z: -2.5 });
  });

  it("clamps one translation for the whole formation", () => {
    expect(
      clampGroupTranslation(
        [
          { x: 2, z: 0 },
          { x: 4, z: 1 },
        ],
        { x: 3, z: -4 },
        { width: 10, depth: 8, zOffset: 0 },
        0.5
      )
    ).toEqual({ x: 0.5, z: -3.5 });
  });

  it("projects Shift-drag movement onto the nearest of eight ground directions", () => {
    const cases = [
      { target: { x: 3, z: 0.5 }, angle: 0 },
      { target: { x: 3, z: 2 }, angle: Math.PI / 4 },
      { target: { x: 0.5, z: 3 }, angle: Math.PI / 2 },
      { target: { x: -2, z: 3 }, angle: (3 * Math.PI) / 4 },
      { target: { x: -3, z: 0.5 }, angle: Math.PI },
      { target: { x: -3, z: -2 }, angle: (-3 * Math.PI) / 4 },
      { target: { x: -0.5, z: -3 }, angle: -Math.PI / 2 },
      { target: { x: 2, z: -3 }, angle: -Math.PI / 4 },
    ];

    for (const { target, angle } of cases) {
      const snapped = snapStagePositionToEightDirections(
        { x: 0, z: 0 },
        target
      );
      expect(Math.atan2(snapped.z, snapped.x)).toBeCloseTo(angle);
    }

    expectPositionCloseTo(
      snapStagePositionToEightDirections({ x: 0, z: 0 }, { x: 3, z: 2 }),
      { x: 2.5, z: 2.5 }
    );
    expectPositionCloseTo(
      snapStagePositionToEightDirections({ x: 1, z: 2 }, { x: 4, z: 2.4 }),
      { x: 4, z: 2 }
    );
  });

  it("stops constrained diagonal movement at the first stage edge", () => {
    expectPositionCloseTo(
      resolvePerformerDragPosition(
        { x: 4, z: 0 },
        { x: 9, z: 5 },
        { width: 10, depth: 10 },
        true
      ),
      { x: 4.5, z: 0.5 }
    );
  });

  it("leaves free dragging unconstrained when Shift is not held", () => {
    expect(
      resolvePerformerDragPosition(
        { x: 0, z: 0 },
        { x: 3, z: 2 },
        { width: 10, depth: 10 },
        false
      )
    ).toEqual({ x: 3, z: 2 });
  });

  it("snaps camera-relative arrow movement to the nearest stage axis", () => {
    expect(resolveCameraRelativeNudge("ArrowUp", Math.PI / 2, 0.25)).toEqual({
      x: -0.25,
      z: 0,
    });
    expect(resolveCameraRelativeNudge("ArrowRight", Math.PI / 2, 1)).toEqual({
      x: 0,
      z: -1,
    });
  });
});

describe("performer press vs camera-controls listener ordering", () => {
  function firePointer(
    target: EventTarget,
    type: string,
    init: {
      clientX: number;
      clientY: number;
      pointerId?: number;
      pointerType?: string;
      button?: number;
      ctrlKey?: boolean;
      metaKey?: boolean;
      shiftKey?: boolean;
    }
  ): void {
    const Ctor =
      typeof PointerEvent !== "undefined" ? PointerEvent : MouseEvent;
    const event = new Ctor(type, {
      bubbles: true,
      cancelable: true,
      clientX: init.clientX,
      clientY: init.clientY,
      button: init.button ?? 0,
      ctrlKey: init.ctrlKey,
      metaKey: init.metaKey,
      shiftKey: init.shiftKey,
    });
    if (!("pointerId" in event)) {
      Object.defineProperty(event, "pointerId", {
        value: init.pointerId ?? 1,
      });
      Object.defineProperty(event, "pointerType", {
        value: init.pointerType ?? "mouse",
      });
    }
    if (init.pointerType && "pointerId" in event) {
      Object.defineProperty(event, "pointerType", { value: init.pointerType });
    }
    target.dispatchEvent(event);
  }

  function buildHarness() {
    // The global test setup replaces document.createElement with inert mocks
    // that cannot dispatch events, so the canvas stand-in is a raw
    // EventTarget — jsdom's dispatch honors capture ordering, which is the
    // behavior under test.
    const canvas = new EventTarget() as unknown as HTMLCanvasElement;
    Object.assign(canvas, {
      style: {},
      dataset: {},
      getBoundingClientRect: () =>
        ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect,
      setPointerCapture: () => {},
      hasPointerCapture: () => false,
      releasePointerCapture: () => {},
    });

    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 2, 8);
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld(true);

    const proxy = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
    proxy.position.y = 1;
    proxy.userData = { performerIndex: 0, performerPickTarget: true };
    proxy.updateMatrixWorld(true);

    // The proxy is deliberately nearer and taller than the visible knee.
    // A drag anchored to the proxy can look plausible while the rendered
    // surface separates from the cursor under this perspective camera.
    const visualRoot = new Group();
    visualRoot.userData = {
      performerIndex: 0,
      performerVisualPickTarget: true,
    };
    const planeRoot = new Group();
    planeRoot.userData = { performerInteractionExcluded: true };
    const activePlane = new Mesh(
      new PlaneGeometry(10, 10),
      new MeshBasicMaterial()
    );
    planeRoot.add(activePlane);
    const visibleKnee = new Mesh(
      new BoxGeometry(1.2, 1.6, 1),
      new MeshBasicMaterial()
    );
    visibleKnee.position.set(0, 0.7, -1);
    visualRoot.add(planeRoot, visibleKnee);
    visualRoot.updateMatrixWorld(true);

    const viewer = {
      primaryPerformerIndex: null as number | null,
      selectedPerformerIndices: [] as number[],
      performerSelectionMode: false,
      isCameraDragging: false,
      performerManager: {
        performers: [
          { position: { x: 0, z: 0 } },
          { position: { x: 1, z: 0 } },
        ],
        handleDrag: vi.fn(),
      },
      replacePerformerSelection: vi.fn((index: number) => {
        viewer.selectedPerformerIndices = [index];
        viewer.primaryPerformerIndex = index;
      }),
      togglePerformerSelection: vi.fn((index: number) => {
        viewer.selectedPerformerIndices =
          viewer.selectedPerformerIndices.includes(index)
            ? viewer.selectedPerformerIndices.filter((value) => value !== index)
            : [...viewer.selectedPerformerIndices, index];
        viewer.primaryPerformerIndex =
          viewer.selectedPerformerIndices.at(-1) ?? null;
      }),
      clearPerformerSelection: vi.fn(() => {
        viewer.selectedPerformerIndices = [];
        viewer.primaryPerformerIndex = null;
      }),
      setPerformerSelectionMode: vi.fn((value: boolean) => {
        viewer.performerSelectionMode = value;
      }),
      beginSpatialEdit: vi.fn(),
      endSpatialEdit: vi.fn(),
      cancelSpatialEdit: vi.fn(),
      markFormationCustom: vi.fn(),
      cameraChoreography: { controls: null },
    };

    // Simulates orbit controls: registered on the canvas BEFORE the
    // interaction attaches, flags a camera drag on pointerdown — the exact
    // ordering that suppressed every performer press before the capture fix.
    const orbitDown = vi.fn(() => {
      viewer.isCameraDragging = true;
    });
    canvas.addEventListener("pointerdown", orbitDown);

    const interaction = createPerformerPointerInteraction({
      canvas,
      camera: () => camera,
      viewer,
      groundY: () => 0,
      stageBounds: () => ({ width: 10, depth: 10, zOffset: 0 }),
    });
    interaction.registerPickTarget(proxy);
    interaction.registerVisualPickTarget(0, visualRoot);
    const detach = interaction.attach();
    const moveHandle = new EventTarget() as unknown as HTMLElement;
    Object.assign(moveHandle, {
      style: {},
      setPointerCapture: () => {},
      hasPointerCapture: () => false,
      releasePointerCapture: () => {},
    });
    moveHandle.addEventListener("pointerdown", (event) =>
      interaction.onMoveHandlePointerDown(event as PointerEvent, 0)
    );
    moveHandle.addEventListener("pointermove", (event) =>
      interaction.onMoveHandlePointerMove(event as PointerEvent)
    );
    moveHandle.addEventListener("pointerup", (event) =>
      interaction.onMoveHandlePointerUp(event as PointerEvent)
    );
    return {
      canvas,
      moveHandle,
      viewer,
      orbitDown,
      interaction,
      detach,
      camera,
      proxy,
      visualRoot,
      activePlane,
      visibleKnee,
    };
  }

  it.each([35, 65])(
    "keeps the rendered grab point attached when dragging to x=%i",
    (pointerX) => {
      const { canvas, viewer, detach, camera, visibleKnee } = buildHarness();
      const raycaster = new Raycaster();
      raycaster.setFromCamera(new Vector2(0, 0), camera);
      const grabbedPoint = raycaster.intersectObject(visibleKnee)[0]?.point;
      expect(grabbedPoint).toBeDefined();

      firePointer(canvas, "pointerdown", { clientX: 50, clientY: 50 });
      expect(canvas.dataset.performerDragAnchorSource).toBe("visual");
      firePointer(canvas, "pointermove", { clientX: pointerX, clientY: 50 });

      const nextPosition =
        viewer.performerManager.handleDrag.mock.lastCall?.[1];
      expect(nextPosition).toBeDefined();
      const movedGrabPoint = grabbedPoint!
        .clone()
        .add(new Vector3(nextPosition!.x, 0, nextPosition!.z))
        .project(camera);
      const projectedPointer = {
        x: ((movedGrabPoint.x + 1) * 100) / 2,
        y: ((1 - movedGrabPoint.y) * 100) / 2,
      };

      expect(projectedPointer.x).toBeCloseTo(pointerX, 5);
      expect(projectedPointer.y).toBeCloseTo(50, 5);
      firePointer(canvas, "pointerup", { clientX: pointerX, clientY: 50 });
      detach();
    }
  );

  it("falls back to the forgiving proxy when no visible surface is hit", () => {
    const { canvas, detach, visualRoot } = buildHarness();
    visualRoot.visible = false;
    firePointer(canvas, "pointerdown", { clientX: 50, clientY: 50 });
    expect(canvas.dataset.performerDragAnchorSource).toBe("proxy");
    firePointer(canvas, "pointerup", { clientX: 50, clientY: 50 });
    detach();
  });

  it("compensates when the anchored surface deforms during the drag", () => {
    const { canvas, viewer, detach, camera, visibleKnee } = buildHarness();
    const raycaster = new Raycaster();
    raycaster.setFromCamera(new Vector2(0, 0), camera);
    const grabbedPoint = raycaster.intersectObject(visibleKnee)[0]?.point;
    expect(grabbedPoint).toBeDefined();

    firePointer(canvas, "pointerdown", { clientX: 50, clientY: 50 });
    const positions = visibleKnee.geometry.getAttribute("position");
    expect(positions).toBeDefined();
    if (!positions) throw new Error("The visible knee needs vertex positions");
    for (let index = 0; index < positions.count; index += 1)
      positions.setX(index, positions.getX(index) + 0.2);
    positions.needsUpdate = true;
    firePointer(canvas, "pointermove", { clientX: 65, clientY: 50 });

    const nextPosition = viewer.performerManager.handleDrag.mock.lastCall?.[1];
    expect(nextPosition).toBeDefined();
    const movedGrabPoint = grabbedPoint!
      .clone()
      .add(new Vector3(0.2 + nextPosition!.x, 0, nextPosition!.z))
      .project(camera);
    expect(((movedGrabPoint.x + 1) * 100) / 2).toBeCloseTo(65, 5);
    expect(((1 - movedGrabPoint.y) * 100) / 2).toBeCloseTo(50, 5);
    firePointer(canvas, "pointerup", { clientX: 65, clientY: 50 });
    detach();
  });

  it("selects a performer even though the camera listener registered first", () => {
    const { canvas, viewer, orbitDown, detach } = buildHarness();
    firePointer(canvas, "pointerdown", { clientX: 50, clientY: 50 });
    expect(orbitDown).not.toHaveBeenCalled();
    firePointer(canvas, "pointerup", { clientX: 50, clientY: 50 });
    expect(viewer.replacePerformerSelection).toHaveBeenCalledWith(0);
    detach();
  });

  it("consumes Escape when it deselects, so the viewer shell stays open", () => {
    const { canvas, viewer, detach } = buildHarness();
    viewer.primaryPerformerIndex = 0;
    viewer.selectedPerformerIndices = [0];
    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    canvas.dispatchEvent(escape);
    expect(viewer.clearPerformerSelection).toHaveBeenCalledTimes(1);
    expect(escape.defaultPrevented).toBe(true);
    detach();
  });

  it("lets Escape through when nothing is selected", () => {
    const { canvas, viewer, detach } = buildHarness();
    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    canvas.dispatchEvent(escape);
    expect(viewer.clearPerformerSelection).not.toHaveBeenCalled();
    expect(escape.defaultPrevented).toBe(false);
    detach();
  });

  it("lets an empty press through to the camera controls", () => {
    const { canvas, viewer, orbitDown, detach } = buildHarness();
    firePointer(canvas, "pointerdown", { clientX: 2, clientY: 2 });
    expect(orbitDown).toHaveBeenCalledTimes(1);
    expect(viewer.clearPerformerSelection).not.toHaveBeenCalled();
    detach();
  });

  it("does not treat an active performer plane as the performer's body", () => {
    const { canvas, viewer, orbitDown, detach, camera, proxy, activePlane } =
      buildHarness();
    const raycaster = new Raycaster();
    raycaster.setFromCamera(new Vector2(0.5, 0), camera);
    expect(raycaster.intersectObject(activePlane)).toHaveLength(1);
    expect(raycaster.intersectObject(proxy)).toHaveLength(0);

    firePointer(canvas, "pointerdown", { clientX: 75, clientY: 50 });

    expect(orbitDown).toHaveBeenCalledTimes(1);
    expect(viewer.replacePerformerSelection).not.toHaveBeenCalled();
    expect(viewer.beginSpatialEdit).not.toHaveBeenCalled();
    detach();
  });

  it("moves every selected performer through one direct drag edit", () => {
    const { canvas, viewer, detach } = buildHarness();
    viewer.selectedPerformerIndices = [0, 1];
    viewer.primaryPerformerIndex = 0;

    firePointer(canvas, "pointerdown", { clientX: 50, clientY: 50 });
    firePointer(canvas, "pointermove", { clientX: 65, clientY: 50 });
    firePointer(canvas, "pointerup", { clientX: 65, clientY: 50 });

    expect(viewer.beginSpatialEdit).toHaveBeenCalledTimes(1);
    expect(viewer.endSpatialEdit).toHaveBeenCalledTimes(1);
    expect(
      viewer.performerManager.handleDrag.mock.calls.map(([index]) => index)
    ).toEqual([0, 1]);
    detach();
  });

  it("moves the selected formation from the explicit move handle", () => {
    const { moveHandle, viewer, detach } = buildHarness();
    viewer.selectedPerformerIndices = [0, 1];
    viewer.primaryPerformerIndex = 0;

    firePointer(moveHandle, "pointerdown", { clientX: 50, clientY: 50 });
    firePointer(moveHandle, "pointermove", { clientX: 65, clientY: 50 });
    firePointer(moveHandle, "pointerup", { clientX: 65, clientY: 50 });

    expect(viewer.beginSpatialEdit).toHaveBeenCalledTimes(1);
    expect(viewer.endSpatialEdit).toHaveBeenCalledTimes(1);
    expect(
      viewer.performerManager.handleDrag.mock.calls.map(([index]) => index)
    ).toEqual([0, 1]);
    detach();
  });

  it("uses desktop modifiers to toggle an arbitrary selection", () => {
    const { canvas, viewer, detach } = buildHarness();
    viewer.selectedPerformerIndices = [1];
    viewer.primaryPerformerIndex = 1;

    firePointer(canvas, "pointerdown", {
      clientX: 50,
      clientY: 50,
      ctrlKey: true,
    });
    firePointer(canvas, "pointerup", {
      clientX: 50,
      clientY: 50,
      ctrlKey: true,
    });

    expect(viewer.togglePerformerSelection).toHaveBeenCalledWith(0);
    expect(viewer.selectedPerformerIndices).toEqual([1, 0]);
    detach();
  });

  it("enters touch selection mode after the existing hold threshold", () => {
    vi.useFakeTimers();
    try {
      const { canvas, viewer, detach } = buildHarness();

      firePointer(canvas, "pointerdown", {
        clientX: 50,
        clientY: 50,
        pointerType: "touch",
      });
      vi.advanceTimersByTime(250);

      expect(viewer.setPerformerSelectionMode).toHaveBeenCalledWith(true);
      expect(viewer.togglePerformerSelection).toHaveBeenCalledWith(0);
      firePointer(canvas, "pointerup", {
        clientX: 50,
        clientY: 50,
        pointerType: "touch",
      });
      detach();
    } finally {
      vi.useRealTimers();
    }
  });

  it("nudges the selected formation with one keyboard spatial edit", () => {
    const { canvas, viewer, detach } = buildHarness();
    viewer.selectedPerformerIndices = [0, 1];
    viewer.primaryPerformerIndex = 1;

    canvas.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
      })
    );

    expect(viewer.beginSpatialEdit).toHaveBeenCalledTimes(1);
    expect(viewer.endSpatialEdit).toHaveBeenCalledTimes(1);
    expect(
      viewer.performerManager.handleDrag.mock.calls.map(([index]) => index)
    ).toEqual([0, 1]);
    detach();
  });
});
