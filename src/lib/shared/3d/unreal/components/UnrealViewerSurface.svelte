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
  import { Plane, PlaneMode } from "@austencloud/scene-3d";

  let { connection }: { connection: NativeViewerConnection } = $props();
  const viewer = getViewer3DContext();
  let host!: HTMLDivElement;
  let initialized = $state(false);
  let placing = $state(false);
  let drag: {
    id: number;
    x: number;
    y: number;
    move: boolean;
    pan: boolean;
  } | null = null;
  let lastSubmitted = "";
  let editRevision = 0;
  let sceneEditPending = $state(false);
  let confirmedScene = "";
  let confirmedUnsupported = "";
  let sceneQueue: Promise<void> = Promise.resolve();
  let cameraDeltaInFlight = false;
  let cameraGeneration = 0;
  let queuedCameraDelta: {
    mode: "orbit" | "pan";
    deltaX: number;
    deltaY: number;
  } | null = null;
  const camera = new PerspectiveCamera();
  const raycaster = new Raycaster();
  const ground = new GroundPlane(new Vector3(0, 1, 0), 0);

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

  function desiredScene() {
    return {
      performers: viewer.performerManager.performers.map((performer) => ({
        performerId: "performer-0",
        characterId: performer.characterId,
        propId: performer.effectiveProp,
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
          prop: performer.propId,
          effortId: null,
          effect: null,
          staffLengthCm: null,
        },
      })),
      selectedPerformerIndices: state.selectedPerformerId ? [0] : [],
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
        queuedCameraDelta = null;
        ++cameraGeneration;
        cameraDeltaInFlight = false;
        return;
      }
      if (!state) return;
      viewer.updateCameraSnapshot({
        position: state.camera.position,
        target: state.camera.target,
        fov: verticalFov(state.camera.fov, streamView().aspect),
        rotation: { x: 0, y: 0, z: 0 },
        timestamp: performance.now(),
      });
      if (!initialized) {
        reconcile(state);
        initialized = true;
      }
    });
  });

  // A native state event can originate from the host. Adopt scene changes only
  // after local edits settle, so camera events cannot undo a pending rail edit.
  $effect(() => {
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
          if (edit === editRevision) reconcile(state);
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
    if (initialized && viewer.environmentId !== "void") {
      untrack(() => {
        connection.report(
          "This Unreal preview has one studio stage. Web environments are not connected yet."
        );
        viewer.applyPersistConfig({ environmentId: "void" });
      });
    }
  });

  function sendCamera(payload: object) {
    if (connection.status !== "ready") return;
    void connection.command("camera", payload).catch((cause: Error) => {
      if (connection.status === "ready") connection.report(cause.message);
    });
  }

  function sendCameraDelta(
    mode: "orbit" | "pan",
    deltaX: number,
    deltaY: number
  ) {
    if (connection.status !== "ready") return;
    if (queuedCameraDelta?.mode === mode) {
      queuedCameraDelta.deltaX += deltaX;
      queuedCameraDelta.deltaY += deltaY;
    } else {
      queuedCameraDelta = { mode, deltaX, deltaY };
    }
    if (cameraDeltaInFlight) return;
    cameraDeltaInFlight = true;
    const generation = cameraGeneration;
    void (async () => {
      while (
        generation === cameraGeneration &&
        queuedCameraDelta &&
        connection.status === "ready"
      ) {
        const payload = queuedCameraDelta;
        queuedCameraDelta = null;
        try {
          await connection.command("camera", payload);
        } catch (cause) {
          if (generation === cameraGeneration && connection.status === "ready")
            connection.report(
              cause instanceof Error ? cause.message : "Camera movement failed."
            );
          break;
        }
      }
      if (generation === cameraGeneration) cameraDeltaInFlight = false;
    })();
  }

  function placeAt(event: PointerEvent) {
    const state = connection.state;
    const performer = viewer.performerManager.performers[0];
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
    const move = placing || event.shiftKey;
    if (move) viewer.beginSpatialEdit();
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      move,
      pan: event.button !== 0 || event.altKey,
    };
    if (move) placeAt(event);
  }

  function pointerMove(event: PointerEvent) {
    if (!drag || drag.id !== event.pointerId) return;
    if (drag.move) placeAt(event);
    else if (host.clientWidth > 0 && host.clientHeight > 0)
      sendCameraDelta(
        drag.pan ? "pan" : "orbit",
        (event.clientX - drag.x) / host.clientWidth,
        (event.clientY - drag.y) / host.clientHeight
      );
    drag.x = event.clientX;
    drag.y = event.clientY;
  }

  function pointerUp() {
    if (drag?.move) viewer.endSpatialEdit();
    drag = null;
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
      const performer = viewer.performerManager.performers[0];
      if (!performer) return;
      viewer.beginSpatialEdit();
      performer.position.x += direction[0]! * 0.1;
      performer.position.z += direction[1]! * 0.1;
      viewer.markFormationCustom();
      viewer.endSpatialEdit();
    } else sendCameraDelta("orbit", direction[0] * 0.03, direction[1] * 0.03);
  }

  onMount(() => {
    // The native host keeps feet at y=0 and looks at the torso around y=1.1.
    // Shared camera preset buttons use this value as their target height.
    viewer.setStageGroundOffset(1.1);
    void connection.mount(host);
    const removeCamera = viewer.registerSnapTo((position, target) =>
      sendCamera({ position, target })
    );
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
  aria-label="Unreal scene. Drag to orbit, Alt-drag to pan, scroll to zoom. Shift-drag or Shift-arrow keys to move the performer."
  onpointerdown={pointerDown}
  onpointermove={pointerMove}
  onpointerup={pointerUp}
  onpointercancel={pointerUp}
  oncontextmenu={(event) => event.preventDefault()}
  onkeydown={keyDown}
  onwheel={(event) => {
    event.preventDefault();
    sendCamera({
      mode: "zoom",
      delta: Math.max(-1, Math.min(1, event.deltaY / 500)),
    });
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
