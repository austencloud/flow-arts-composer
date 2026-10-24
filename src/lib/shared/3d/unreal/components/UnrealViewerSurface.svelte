<script lang="ts">
  import { onMount, untrack } from "svelte";
  import {
    PerspectiveCamera,
    Raycaster,
    Plane as GroundPlane,
    Vector2,
    Vector3,
  } from "three";
  import { getViewer3DContext } from "../../context/viewer-3d-context";
  import type { NativeViewerConnection } from "../state/native-viewer-connection.svelte";
  import type { NativeViewerState } from "../domain/bridge-protocol";
  import type { CharacterId } from "../../domain/character-model";
  import {
    Plane,
    PlaneMode,
    userProportionsState,
  } from "@austencloud/scene-3d";
  import { CANONICAL_PERFORMER_ANCHOR_Y } from "../../environments/domain/stage-coordinate-frame";
  import { computeGroupBounds } from "#lib/shared/sequence-viewer/camera-choreography/presets/shots.js";

  import {
    frameNativeCamera,
    toNativeCameraPose,
    toWebCameraPose,
  } from "../domain/native-camera-framing";
  import {
    nativePropId,
    nativePropSelection,
  } from "../domain/native-prop-selection";
  import {
    nativeDragDelta,
    nativeDollyDragDelta,
    nativePinchZoomDelta,
    nativeProjectionFov,
    nativeWheelZoomDelta,
  } from "../domain/native-camera-input";

  let {
    connection,
    sceneOwner = "native",
  }: {
    connection: NativeViewerConnection;
    sceneOwner?: "native" | "composer";
  } = $props();
  const viewer = getViewer3DContext();
  let host!: HTMLDivElement;
  let initialized = $state(false);
  let placing = $state(false);
  let drag: {
    id: number;
    x: number;
    y: number;
    startX: number;
    startY: number;
    move: boolean;
    pan: boolean;
    dolly: boolean;
  } | null = null;
  const touchPointers = new Map<number, { x: number; y: number }>();
  let touchGesture: { x: number; y: number; distance: number } | null = null;
  let lastSubmitted = "";
  let editRevision = 0;
  let sceneEditPending = $state(false);
  let confirmedScene = "";
  let confirmedUnsupported = "";
  let sceneQueue: Promise<void> = Promise.resolve();
  let cameraGeneration = 0;
  let cameraPumpRunning = false;
  type CameraCommand =
    | { mode: "orbit" | "pan"; deltaX: number; deltaY: number }
    | { mode: "zoom"; delta: number; cursorX?: number; cursorY?: number }
    | { mode: "fov"; verticalFov: number }
    | {
        mode: "snap";
        position: { x: number; y: number; z: number };
        target: { x: number; y: number; z: number };
        verticalFov?: number;
      };
  let cameraQueue: CameraCommand[] = [];
  let requestedVerticalFov: number | null = null;
  const camera = new PerspectiveCamera();
  const raycaster = new Raycaster();
  const ground = new GroundPlane(new Vector3(0, 1, 0), 0);
  function webFeetY() {
    // Standalone viewers retain their historical camera origin.
    return sceneOwner === "composer"
      ? CANONICAL_PERFORMER_ANCHOR_Y + userProportionsState.groundY
      : -1.2;
  }

  function streamView() {
    const rect = host.getBoundingClientRect();
    const video = host.querySelector("video");
    const aspect =
      video?.videoWidth && video.videoHeight
        ? video.videoWidth / video.videoHeight
        : rect.height > 0 && rect.width > 0
          ? rect.width / rect.height
          : 1;
    const width = Math.min(rect.width, rect.height * aspect);
    const height = width / aspect;
    return {
      left: rect.left + (rect.width - width) / 2,
      top: rect.top + (rect.height - height) / 2,
      width,
      height,
      aspect,
    };
  }

  function verticalFov(horizontalDegrees: number, aspect: number) {
    return (
      (Math.atan(Math.tan((horizontalDegrees * Math.PI) / 360) / aspect) *
        360) /
      Math.PI
    );
  }

  function frameCamera(
    position: { x: number; y: number; z: number },
    target: { x: number; y: number; z: number }
  ) {
    const radius = computeGroupBounds(
      viewer.performerManager.performers.map((performer) => ({
        position: performer.position,
      }))
    ).radius;
    return frameNativeCamera(
      position,
      target,
      radius,
      streamView().aspect,
      connection.state?.camera.fov ?? 50,
      webFeetY()
    );
  }
  function desiredScene() {
    return {
      performers: viewer.performerManager.performers.map((performer) => ({
        performerId: "performer-0",
        characterId: performer.characterId,
        propId: nativePropId(
          performer.effectiveProp,
          performer.effectivePropBuild
        ),
        position: { x: performer.position.x, z: performer.position.z },
        facingAngle: performer.facingAngle,
      })),
      selected: viewer.selectedPerformerIndices.length > 0,
    };
  }

  function sceneSignature(state: NativeViewerState) {
    return JSON.stringify({
      performers: state.performers,
      selectedPerformerId: state.selectedPerformerId,
    });
  }

  function unsupportedSignature() {
    return JSON.stringify({
      defaults: {
        effortId: viewer.defaultSettings.effortId,
        planeMode: viewer.defaultSettings.planeMode,
        left: viewer.defaultSettings.customLeftPlane,
        right: viewer.defaultSettings.customRightPlane,
      },
      performers: viewer.performerManager.performers.map((performer) => ({
        effortId: performer.settings.effortId,
        effect: performer.settings.effect,
        handEffects: performer.settings.handEffects,
        staffLengthCm: performer.settings.staffLengthCm,
        planeMode: performer.rawPlaneMode,
        left: performer.rawLeftPlane,
        right: performer.rawRightPlane,
        stepOverrides: performer.hasStepOverrides,
      })),
    });
  }

  function restoreUnsupported() {
    viewer.sceneUndo.withoutUndo(() => {
      if (viewer.defaultSettings.effortId !== "linear")
        viewer.setDefaultEffort("linear");
      if (viewer.defaultSettings.planeMode !== PlaneMode.WALL)
        viewer.setDefaultPlaneMode(PlaneMode.WALL);
      if (viewer.defaultSettings.customLeftPlane !== Plane.WALL)
        viewer.setDefaultHandPlane("left", Plane.WALL);
      if (viewer.defaultSettings.customRightPlane !== Plane.WALL)
        viewer.setDefaultHandPlane("right", Plane.WALL);
      for (const performer of viewer.performerManager.performers) {
        if (performer.settings.effortId !== null) performer.resetEffort();
        if (
          performer.settings.effect !== null ||
          performer.settings.handEffects
        )
          performer.resetEffects();
        if (performer.settings.staffLengthCm !== null)
          performer.setStaffLengthCm(null);
        if (performer.hasStepOverrides) performer.clearBeatPlaneOverrides();
        if (
          performer.rawPlaneMode !== PlaneMode.WALL ||
          performer.rawLeftPlane !== Plane.WALL ||
          performer.rawRightPlane !== Plane.WALL
        ) {
          performer.setHandPlane("left", Plane.WALL);
          performer.setHandPlane("right", Plane.WALL);
        }
      }
    });
  }

  function reconcile(state: NativeViewerState) {
    viewer.applyPersistConfig({
      performers: state.performers.map((performer) => ({
        characterId: performer.characterId as CharacterId,
        position: performer.position,
        facingAngle: performer.facingAngle,
        customLeftPlane: Plane.WALL,
        customRightPlane: Plane.WALL,
        settings: {
          prop: nativePropSelection(performer.propId).prop,
          effortId: null,
          effect: null,
          staffLengthCm: null,
        },
      })),
      selectedPerformerIndices: state.selectedPerformerId ? [0] : [],
    });
    viewer.sceneUndo.withoutUndo(() => {
      state.performers.forEach((performer, index) => {
        const local = viewer.performerManager.performers[index];
        if (!local) return;
        const { build } = nativePropSelection(performer.propId);
        if (build) local.setPropBuild(build);
        else local.resetPropBuild();
      });
    });
    restoreUnsupported();
    confirmedScene = sceneSignature(state);
    confirmedUnsupported = unsupportedSignature();
    lastSubmitted = JSON.stringify(desiredScene());
  }

  $effect(() => {
    const state = connection.state;
    const ready = connection.status === "ready";
    untrack(() => {
      if (!ready) {
        initialized = false;
        ++editRevision;
        sceneEditPending = false;
        cameraQueue = [];
        requestedVerticalFov = null;
        ++cameraGeneration;
        cameraPumpRunning = false;
        return;
      }
      if (!state) return;
      if (!initialized && sceneOwner === "composer") {
        initialized = true;
        const savedCamera = viewer.persistedCamera;
        if (savedCamera)
          sendCamera({
            mode: "snap",
            ...toNativeCameraPose(
              savedCamera.position,
              savedCamera.target,
              webFeetY()
            ),
            verticalFov: savedCamera.fov,
          });
        else viewer.focusSelectedPerformers();
        return;
      }
      if (!cameraPumpRunning && cameraQueue.length === 0)
        adoptNativeCamera(state);
      if (!initialized) {
        reconcile(state);
        initialized = true;
        viewer.focusSelectedPerformers();
      }
    });
  });

  // A native state event can originate from the host. Adopt scene changes only
  // after local edits settle, so camera events cannot undo a pending rail edit.
  $effect(() => {
    if (sceneOwner === "composer") return;
    const nativeUpdate = connection.nativeUpdate;
    const pending = sceneEditPending;
    if (!initialized || !nativeUpdate || pending) return;
    untrack(() => {
      const latest = connection.state;
      if (latest && sceneSignature(latest) !== confirmedScene)
        reconcile(latest);
    });
  });

  $effect(() => {
    if (sceneOwner === "composer") return;
    const unsupported = unsupportedSignature();
    if (!initialized || connection.status !== "ready") return;
    if (unsupported === confirmedUnsupported) return;
    untrack(() => {
      if (connection.state) reconcile(connection.state);
      connection.report(
        "Effort, effects, planes, and staff length are not available in this Unreal preview. The confirmed settings were restored."
      );
    });
  });

  $effect(() => {
    if (sceneOwner === "composer") return;
    const scene = desiredScene();
    const encoded = JSON.stringify(scene);
    if (!initialized || connection.status !== "ready") return;
    untrack(() => {
      if (unsupportedSignature() !== confirmedUnsupported) return;
      if (encoded === lastSubmitted) return;
      lastSubmitted = encoded;
      const edit = ++editRevision;
      sceneEditPending = true;
      sceneQueue = sceneQueue.then(async () => {
        if (edit !== editRevision || connection.status !== "ready") return;
        try {
          const performer = scene.performers[0];
          if (performer) await connection.command("setPerformer", performer);
          else
            await connection.command("removePerformer", {
              performerId: "performer-0",
            });
          if (edit !== editRevision) return;
          const state = await connection.command("select", {
            performerId: scene.selected && performer ? "performer-0" : null,
          });
          if (edit === editRevision) {
            reconcile(state);
            connection.report("");
          }
        } catch (cause) {
          if (edit !== editRevision || connection.status !== "ready") return;
          connection.report(
            cause instanceof Error
              ? cause.message
              : "The performer change failed."
          );
          if (connection.state) reconcile(connection.state);
        } finally {
          if (edit === editRevision) sceneEditPending = false;
        }
      });
    });
  });

  // This first host has a fixed stage. Restore the confirmed environment if
  // an existing environment control is used, rather than displaying a false selection.
  $effect(() => {
    if (
      sceneOwner === "native" &&
      initialized &&
      viewer.environmentId !== "void"
    ) {
      untrack(() => {
        connection.report(
          "This Unreal preview has one studio stage. Web environments are not connected yet."
        );
        viewer.applyPersistConfig({ environmentId: "void" });
      });
    }
  });

  function adoptNativeCamera(state: NativeViewerState) {
    requestedVerticalFov = verticalFov(state.camera.fov, streamView().aspect);
    viewer.updateCameraSnapshot({
      ...toWebCameraPose(state.camera.position, state.camera.target, webFeetY()),
      fov: requestedVerticalFov,
      rotation: { x: 0, y: 0, z: 0 },
      timestamp: performance.now(),
    });
  }

  function sendCamera(payload: CameraCommand) {
    if (connection.status !== "ready") return;
    // A rail preset supersedes drags that have not reached the native scene.
    if (payload.mode === "snap") cameraQueue = [];
    if (payload.mode === "snap" && payload.verticalFov)
      requestedVerticalFov = payload.verticalFov;
    if (payload.mode === "fov") {
      requestedVerticalFov = payload.verticalFov;
      if (cameraQueue.at(-1)?.mode === "fov") cameraQueue.pop();
    }
    cameraQueue.push(payload);
    void pumpCamera();
  }

  async function pumpCamera() {
    if (cameraPumpRunning) return;
    cameraPumpRunning = true;
    const generation = cameraGeneration;
    while (
      generation === cameraGeneration &&
      connection.status === "ready" &&
      cameraQueue.length > 0
    ) {
      const payload = cameraQueue.shift()!;
      try {
        const state = await connection.command("camera", payload);
        if (generation === cameraGeneration && cameraQueue.length === 0)
          adoptNativeCamera(state);
      } catch (cause) {
        if (generation === cameraGeneration) {
          cameraQueue = [];
          requestedVerticalFov = null;
          if (connection.status === "ready")
            connection.report(
              cause instanceof Error ? cause.message : "Camera movement failed."
            );
        }
        break;
      }
    }
    if (generation === cameraGeneration) cameraPumpRunning = false;
  }

  function sendCameraDelta(
    mode: "orbit" | "pan",
    deltaX: number,
    deltaY: number
  ) {
    if (connection.status !== "ready") return;
    if (deltaX === 0 && deltaY === 0) return;
    const last = cameraQueue.at(-1);
    if (
      last?.mode === mode &&
      Math.abs(last.deltaX + deltaX) <= 1 &&
      Math.abs(last.deltaY + deltaY) <= 1
    ) {
      last.deltaX += deltaX;
      last.deltaY += deltaY;
      return;
    }
    while (deltaX !== 0 || deltaY !== 0) {
      const x = Math.max(-1, Math.min(1, deltaX));
      const y = Math.max(-1, Math.min(1, deltaY));
      sendCamera({ mode, deltaX: x, deltaY: y });
      deltaX -= x;
      deltaY -= y;
    }
  }

  function placeAt(event: PointerEvent) {
    const state = connection.state;
    const performer =
      viewer.performerManager.performers[viewer.primaryPerformerIndex ?? 0];
    if (!state || !performer) return;
    const rect = streamView();
    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      event.clientX < rect.left ||
      event.clientX > rect.left + rect.width ||
      event.clientY < rect.top ||
      event.clientY > rect.top + rect.height
    )
      return;
    camera.position.set(
      state.camera.position.x,
      state.camera.position.y,
      state.camera.position.z
    );
    camera.fov = verticalFov(state.camera.fov, rect.aspect);
    camera.aspect = rect.aspect;
    camera.lookAt(
      state.camera.target.x,
      state.camera.target.y,
      state.camera.target.z
    );
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    raycaster.setFromCamera(
      new Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((event.clientY - rect.top) / rect.height) * 2
      ),
      camera
    );
    const point = raycaster.ray.intersectPlane(ground, new Vector3());
    if (!point || Math.abs(point.x) > 10 || Math.abs(point.z) > 10) return;
    performer.position.x = point.x;
    performer.position.z = point.z;
    viewer.markFormationCustom();
  }

  function pointerDown(event: PointerEvent) {
    if (connection.status !== "ready") return;
    host.focus();
    host.setPointerCapture(event.pointerId);
    if (event.pointerType === "touch") {
      touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPointers.size > 1) {
        if (drag?.move) viewer.endSpatialEdit();
        drag = null;
        touchGesture = touchCenter();
        return;
      }
    }
    const move = placing || event.shiftKey;
    if (move) viewer.beginSpatialEdit();
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      move,
      pan: event.button === 2,
      dolly: event.button === 1,
    };
    if (move) placeAt(event);
  }

  function pointerMove(event: PointerEvent) {
    if (event.pointerType === "touch" && touchPointers.has(event.pointerId)) {
      touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPointers.size >= 2) {
        const next = touchCenter();
        if (next && touchGesture) {
          const delta = nativeDragDelta(
            next.x - touchGesture.x,
            next.y - touchGesture.y,
            host.clientHeight
          );
          const zoom = nativePinchZoomDelta(touchGesture.distance, next.distance);
          if (zoom) sendZoom(zoom, next.x, next.y);
          if (delta.deltaX || delta.deltaY)
            sendCameraDelta("pan", delta.deltaX, delta.deltaY);
        }
        touchGesture = next;
        return;
      }
    }
    if (!drag || drag.id !== event.pointerId) return;
    if (drag.move) placeAt(event);
    else if (host.clientHeight > 0) {
      const movementX = event.clientX - drag.x;
      const movementY = event.clientY - drag.y;
      if (drag.dolly)
        sendZoom(nativeDollyDragDelta(movementY), drag.startX, drag.startY);
      else {
        const delta = nativeDragDelta(movementX, movementY, host.clientHeight);
        sendCameraDelta(drag.pan ? "pan" : "orbit", delta.deltaX, delta.deltaY);
      }
    }
    drag.x = event.clientX;
    drag.y = event.clientY;
  }

  function touchCenter() {
    const points = [...touchPointers.values()];
    if (points.length < 2) return null;
    const a = points[0]!;
    const b = points[1]!;
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      distance: Math.hypot(a.x - b.x, a.y - b.y),
    };
  }

  function sendZoom(delta: number, clientX: number, clientY: number) {
    const rect = streamView();
    if (rect.width <= 0 || rect.height <= 0 || delta === 0) return;
    const cursorX = Math.max(-1, Math.min(1, ((clientX - rect.left) / rect.width) * 2 - 1));
    const cursorY = Math.max(-1, Math.min(1, 1 - ((clientY - rect.top) / rect.height) * 2));
    while (delta !== 0) {
      const step = Math.max(-2, Math.min(2, delta));
      sendCamera({ mode: "zoom", delta: step, cursorX, cursorY });
      delta -= step;
    }
  }

  function sendProjectionZoom(delta: number) {
    if (connection.status !== "ready" || delta === 0) return;
    const current = requestedVerticalFov ??
      viewer.persistedCamera?.fov ??
      (connection.state
        ? verticalFov(connection.state.camera.fov, streamView().aspect)
        : 50);
    const next = nativeProjectionFov(current, delta);
    sendCamera({ mode: "fov", verticalFov: Math.max(1, Math.min(170, next)) });
  }

  function pointerUp(event: PointerEvent) {
    if (event.pointerType === "touch") {
      touchPointers.delete(event.pointerId);
      touchGesture = touchCenter();
      if (touchPointers.size === 1) {
        const [id, point] = [...touchPointers.entries()][0]!;
        drag = {
          id, x: point.x, y: point.y, startX: point.x, startY: point.y,
          move: false, pan: false, dolly: false,
        };
      }
    }
    if (drag?.id === event.pointerId) {
      if (drag.move) viewer.endSpatialEdit();
      drag = null;
    }
    placing = false;
  }

  function keyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      placing = false;
      return;
    }
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    if (event.shiftKey) {
      const performer =
        viewer.performerManager.performers[viewer.primaryPerformerIndex ?? 0];
      if (!performer) return;
      viewer.beginSpatialEdit();
      performer.position.x += direction[0]! * 0.1;
      performer.position.z += direction[1]! * 0.1;
      viewer.markFormationCustom();
      viewer.endSpatialEdit();
    } else sendCameraDelta("orbit", direction[0] * 0.03, direction[1] * 0.03);
  }

  onMount(() => {
    // Composer shots use the Web stage anchor; the camera adapter maps feet to native Y=0.
    viewer.setStageGroundOffset(
      sceneOwner === "composer" ? CANONICAL_PERFORMER_ANCHOR_Y : 0
    );
    const removeCamera = viewer.registerSnapTo((position, target) =>
      sendCamera({
        mode: "snap",
        ...(sceneOwner === "composer"
          ? toNativeCameraPose(position, target, webFeetY())
          : frameCamera(position, target)),
        ...(sceneOwner === "composer"
          ? { verticalFov: requestedVerticalFov ?? viewer.persistedCamera?.fov ?? 50 }
          : {}),
      })
    );
    void connection.mount(host);
    const removePlacement = viewer.registerPerformerPlacement(() => {
      placing = true;
      host.focus();
    });
    return () => {
      removeCamera();
      removePlacement();
      connection.dispose();
    };
  });
</script>

<!-- The streamed viewport is a focusable application canvas with custom
     pointer and keyboard navigation; it has no equivalent native HTML control. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="native-surface viewer-3d-canvas"
  class:placing
  bind:this={host}
  role="application"
  tabindex="0"
  aria-label="Unreal scene. Drag to orbit, right-drag or two-finger drag to pan, scroll or pinch to zoom. Shift-drag or Shift-arrow keys to move the performer."
  onpointerdown={pointerDown}
  onpointermove={pointerMove}
  onpointerup={pointerUp}
  onpointercancel={pointerUp}
  oncontextmenu={(event) => event.preventDefault()}
  onkeydown={keyDown}
  onwheel={(event) => {
    event.preventDefault();
    const delta = nativeWheelZoomDelta(
      event.deltaY, event.deltaMode, /Mac/.test(navigator.platform), event.ctrlKey
    );
    if (event.ctrlKey) sendProjectionZoom(delta);
    else sendZoom(delta, event.clientX, event.clientY);
  }}
></div>

<style>
  .native-surface {
    position: absolute;
    inset: 0;
    background: #0c1018;
    touch-action: none;
    overflow: hidden;
  }
  .native-surface:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: -3px;
  }
  .native-surface.placing {
    cursor: crosshair;
  }
  .native-surface :global(video) {
    width: 100% !important;
    height: 100% !important;
    object-fit: contain;
    pointer-events: none;
  }
</style>
