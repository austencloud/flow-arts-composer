<script lang="ts">
  import { T, useThrelte, useTask } from "@threlte/core";
  import { TransformControls } from "@threlte/extras";
  import {
    AdditiveBlending,
    DoubleSide,
    Group,
    Matrix4,
    Mesh,
    MeshBasicMaterial,
    Raycaster,
    Vector2,
    Vector3,
    type Camera,
    type InstancedMesh,
    type Object3D,
  } from "three";
  import { onMount, onDestroy } from "svelte";
  import type { ComposerEditorState } from "./composer-editor-state.svelte";
  import type { Command } from "#lib/shared/history/command-stack.svelte.js";
  import type {
    ComposerPlacement,
    SceneComposerPlugin,
    SceneObjectAdapter,
    SceneObjectHandle,
  } from "./types";
  import { validateComposerPlacement } from "./validate-composer-placement";
  import { isEditableKeyboardTarget } from "#lib/shared/keyboard/domain/shortcut-target-resolution.js";

  interface Props {
    editorState: ComposerEditorState;
    plugin: SceneComposerPlugin;
    onSave?: () => void;
  }

  const { editorState, plugin, onSave }: Props = $props();

  const _tempVec = new Vector3();
  const _worldPos = new Vector3();

  // ── Gizmo drag → undo/redo commands ──

  let dragStartPos: Vector3 | null = null;
  let dragStartRot = $state<{ x: number; y: number; z: number } | null>(null);
  let dragStartScale: Vector3 | null = null;
  let dragStartNative: ComposerPlacement | null = null;

  function captureBeforeDrag(obj: Object3D) {
    const native = editorState.nativeSelection;
    if (native) {
      dragStartNative = native.adapter.read(native.handle);
      return;
    }
    dragStartPos = obj.position.clone();
    dragStartRot = { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z };
    dragStartScale = obj.scale.clone();
  }

  function captureAfterDrag(obj: Object3D) {
    const native = editorState.nativeSelection;
    if (native && dragStartNative) {
      const before = dragStartNative;
      const after = native.adapter.read(native.handle);
      const { adapter, handle, target } = native;
      const validationError = validateComposerPlacement(
        after,
        editorState.validationPlacements,
        plugin.constraints,
        { ignoreId: handle.id }
      );
      if (validationError) {
        adapter.applyPlacement(handle, before, target);
        dragStartNative = null;
        return;
      }
      const cmd: Command = {
        label: `Move ${handle.label}`,
        execute() {
          adapter.applyPlacement(handle, after, target);
          editorState.upsertPlacement(after);
        },
        undo() {
          adapter.applyPlacement(handle, before, target);
          editorState.upsertPlacement(before);
        },
      };
      editorState.commands.execute(cmd);
      dragStartNative = null;
      return;
    }

    if (!dragStartPos || !dragStartRot || !dragStartScale) return;

    const beforePos = dragStartPos.clone();
    const beforeRotX = dragStartRot.x;
    const beforeRotY = dragStartRot.y;
    const beforeRotZ = dragStartRot.z;
    const beforeScale = dragStartScale.clone();
    const afterPos = obj.position.clone();
    const afterRotX = obj.rotation.x;
    const afterRotY = obj.rotation.y;
    const afterRotZ = obj.rotation.z;
    const afterScale = obj.scale.clone();
    const target = obj;

    const composerId = findComposerId(obj);
    const currentPlacement = composerId
      ? editorState.placements.find((placement) => placement.id === composerId)
      : undefined;
    if (currentPlacement && composerId) {
      const nextPlacement: ComposerPlacement = {
        ...currentPlacement,
        position: [afterPos.x, afterPos.y, afterPos.z],
        rotation: [
          obj.quaternion.x,
          obj.quaternion.y,
          obj.quaternion.z,
          obj.quaternion.w,
        ],
        scale: [afterScale.x, afterScale.y, afterScale.z],
      };
      const validationError = validateComposerPlacement(
        nextPlacement,
        editorState.validationPlacements,
        plugin.constraints,
        { ignoreId: composerId }
      );
      if (validationError) {
        target.position.copy(beforePos);
        target.rotation.set(beforeRotX, beforeRotY, beforeRotZ);
        target.scale.copy(beforeScale);
        return;
      }
    }

    const cmd: Command = {
      label: `Move ${composerId ?? "object"}`,
      execute() {
        target.position.copy(afterPos);
        target.rotation.set(afterRotX, afterRotY, afterRotZ);
        target.scale.copy(afterScale);
        if (composerId) syncPlacementFromObject(composerId, target);
      },
      undo() {
        target.position.copy(beforePos);
        target.rotation.set(beforeRotX, beforeRotY, beforeRotZ);
        target.scale.copy(beforeScale);
        if (composerId) syncPlacementFromObject(composerId, target);
      },
    };

    editorState.commands.execute(cmd);
    dragStartPos = null;
    dragStartRot = null;
    dragStartScale = null;
  }

  function syncPlacementFromObject(id: string, obj: Object3D) {
    obj.getWorldPosition(_worldPos);
    editorState.updatePlacement(id, {
      position: [_worldPos.x, _worldPos.y, _worldPos.z],
      rotation: [
        obj.quaternion.x,
        obj.quaternion.y,
        obj.quaternion.z,
        obj.quaternion.w,
      ],
      scale: [obj.scale.x, obj.scale.y, obj.scale.z],
    });
  }

  function findComposerId(obj: Object3D): string | null {
    let current: Object3D | null = obj;
    while (current) {
      if (current.userData?.composerId)
        return current.userData.composerId as string;
      current = current.parent;
    }
    return null;
  }

  function findComposerRoot(obj: Object3D): Object3D | null {
    const id = findComposerId(obj);
    if (!id) return null;
    let root = obj;
    while (root.parent && root.parent.userData?.composerId === id) {
      root = root.parent;
    }
    return root;
  }

  function isComposerToolObject(obj: Object3D): boolean {
    let current: Object3D | null = obj;
    while (current) {
      if (
        current.userData?.__isComposerGhost ||
        current.userData?.__isComposerHover ||
        current.userData?.__isComposerProxy ||
        current.type === "TransformControlsGizmo" ||
        current.type === "TransformControlsPlane"
      ) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  function isTransformControlsGizmoObject(obj: Object3D): boolean {
    let current: Object3D | null = obj;
    while (current) {
      if (current.type === "TransformControlsGizmo") return true;
      current = current.parent;
    }
    return false;
  }

  function isTransformControlsPlaneObject(obj: Object3D): boolean {
    let current: Object3D | null = obj;
    while (current) {
      if (current.type === "TransformControlsPlane") return true;
      current = current.parent;
    }
    return false;
  }

  function isHoverFeedbackObject(obj: Object3D): boolean {
    let current: Object3D | null = obj;
    while (current) {
      if (current.userData?.__isComposerHover) return true;
      current = current.parent;
    }
    return false;
  }

  // ── Hover feedback ──

  const hoverInstanceMatrix = new Matrix4();
  const hoverWorldMatrix = new Matrix4();
  const hoverMaterial = new MeshBasicMaterial({
    color: 0xb7f4ff,
    blending: AdditiveBlending,
    side: DoubleSide,
    transparent: true,
    opacity: 0.34,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    toneMapped: false,
  });
  const hoverOverlay = new Group();
  hoverOverlay.visible = false;
  hoverOverlay.renderOrder = 1000;
  hoverOverlay.frustumCulled = false;
  hoverOverlay.userData.__isComposerHover = true;
  type HoveredEditable =
    | { kind: "composer"; object: Object3D }
    | {
        kind: "native";
        adapter: SceneObjectAdapter;
        handle: SceneObjectHandle;
      };
  let hoveredKey: string | null = null;
  let hoveredEditable: HoveredEditable | null = null;

  function canvasElement(): HTMLCanvasElement | null {
    return (
      (renderer as any)?.current?.domElement ??
      (renderer as any)?.domElement ??
      null
    );
  }

  function clearHoverFeedback(): void {
    hoveredKey = null;
    hoveredEditable = null;
    hoverOverlay.visible = false;
    hoverOverlay.clear();
    const canvas = canvasElement();
    if (canvas)
      canvas.style.cursor = editorState.gizmoDragging ? "grabbing" : "";
  }

  function showHoverFeedback(key: string): void {
    if (hoverOverlay.children.length === 0) {
      clearHoverFeedback();
      return;
    }
    hoveredKey = key;
    hoverOverlay.visible = true;
    hoverOverlay.updateMatrixWorld(true);
    const canvas = canvasElement();
    if (canvas) canvas.style.cursor = "grab";
  }

  function addHoverMesh(source: Mesh, worldMatrix: Matrix4): void {
    const highlight = new Mesh(source.geometry, hoverMaterial);
    highlight.matrixAutoUpdate = false;
    highlight.matrix.copy(worldMatrix);
    highlight.renderOrder = 1000;
    highlight.frustumCulled = false;
    highlight.userData.__isComposerHover = true;
    hoverOverlay.add(highlight);
  }

  function addObjectHoverMeshes(object: Object3D): void {
    object.updateWorldMatrix(true, true);
    object.traverse((child) => {
      const mesh = child as Mesh;
      if (!(mesh as any).isMesh || !mesh.geometry) return;
      addHoverMesh(mesh, mesh.matrixWorld);
    });
  }

  function setObjectHoverFeedback(object: Object3D): void {
    const composerId = findComposerId(object) ?? object.uuid;
    hoveredEditable = { kind: "composer", object };
    if (hoveredKey === composerId && hoverOverlay.visible) return;
    hoverOverlay.clear();
    addObjectHoverMeshes(object);
    showHoverFeedback(composerId);
  }

  function setHandleHoverFeedback(
    adapter: SceneObjectAdapter,
    handle: SceneObjectHandle
  ): void {
    if (handle.locked) {
      clearHoverFeedback();
      return;
    }
    hoveredEditable = { kind: "native", adapter, handle };
    if (hoveredKey === handle.id && hoverOverlay.visible) return;

    hoverOverlay.clear();
    for (const member of handle.members ?? [
      { object: handle.object, instanceId: handle.instanceId },
    ]) {
      if (member.instanceId === undefined) {
        addObjectHoverMeshes(member.object);
        continue;
      }

      const instance = member.object as InstancedMesh;
      instance.updateWorldMatrix(true, false);
      instance.getMatrixAt(member.instanceId, hoverInstanceMatrix);
      hoverWorldMatrix.multiplyMatrices(
        instance.matrixWorld,
        hoverInstanceMatrix
      );
      addHoverMesh(instance as unknown as Mesh, hoverWorldMatrix);
    }
    showHoverFeedback(handle.id);
  }

  export function handlePointerEnter(group: Object3D) {
    if (editorState.activeCatalogItem || editorState.gizmoDragging) return;
    setObjectHoverFeedback(group);
  }

  export function handlePointerLeave() {
    if (editorState.gizmoDragging) return;
    clearHoverFeedback();
  }

  export function handleClick(group: Object3D) {
    if (editorState.activeCatalogItem) return;
    clearHoverFeedback();
    editorState.select(group);
  }

  export function handleMissedClick() {
    if (editorState.activeCatalogItem) return;
    editorState.deselect();
  }

  // ── Camera + WASD panning ──

  const { camera, renderer, scene } = useThrelte();
  const getCamera = (): Camera | null => {
    const c = (camera as any).current ?? camera;
    return c?.isCamera ? c : null;
  };

  const panKeys = new Set<string>();
  const PAN_SPEED = 8;

  const nativeRaycaster = new Raycaster();
  const nativePointer = new Vector2();
  const appliedNativePlacements = new Set<string>();
  let nativeSnapshotReady = false;

  $effect(() => {
    plugin.sceneId;
    appliedNativePlacements.clear();
    nativeSnapshotReady = false;
    clearHoverFeedback();
    editorState.setNativeScenePlacements([]);
  });

  useTask(() => {
    const adapter = plugin.nativeObjects;
    const activeScene = (scene as any)?.current ?? scene;
    if (!adapter || !activeScene) return;
    const pending = editorState.placements.filter(
      (placement) =>
        placement.source === "native" &&
        !appliedNativePlacements.has(placement.id)
    );
    if (nativeSnapshotReady && pending.length === 0) return;

    const handles = adapter.enumerate(activeScene);
    if (handles.length === 0) return;
    const handlesById = new Map(handles.map((handle) => [handle.id, handle]));
    for (const placement of pending) {
      const handle = handlesById.get(placement.id);
      if (!handle) continue;
      adapter.applyPlacement(handle, placement);
      appliedNativePlacements.add(placement.id);
    }
    if (!nativeSnapshotReady) {
      editorState.setNativeScenePlacements(
        handles.map((handle) => adapter.read(handle))
      );
      nativeSnapshotReady = true;
    }
  });

  function selectHoveredEditable(event: PointerEvent): boolean {
    const hovered = hoveredEditable;
    if (!hovered) return false;

    event.preventDefault();
    event.stopImmediatePropagation();
    clearHoverFeedback();
    if (hovered.kind === "composer") {
      editorState.select(hovered.object);
    } else {
      editorState.selectNative(hovered.adapter, hovered.handle);
    }
    return true;
  }

  function handleScenePointerDown(event: PointerEvent): void {
    const adapter = plugin.nativeObjects;
    if (editorState.activeCatalogItem || editorState.gizmoDragging) return;
    if (event.button !== 0) return;

    const canvas =
      (renderer as any)?.current?.domElement ?? (renderer as any)?.domElement;
    const activeCamera = getCamera();
    const activeScene = (scene as any)?.current ?? scene;
    if (!canvas || !activeCamera || !activeScene) return;

    const rect = canvas.getBoundingClientRect();
    nativePointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    nativePointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    nativeRaycaster.setFromCamera(nativePointer, activeCamera);
    adapter?.enumerate(activeScene);

    const hits = nativeRaycaster.intersectObjects(activeScene.children, true);
    const firstActionableHit = hits.find(
      (hit) =>
        !isHoverFeedbackObject(hit.object) &&
        !isTransformControlsPlaneObject(hit.object)
    );
    if (
      firstActionableHit &&
      isTransformControlsGizmoObject(firstActionableHit.object)
    ) {
      return;
    }
    if (selectHoveredEditable(event)) return;

    for (const hit of hits) {
      // TransformControls owns presses on its handles. Everything else that
      // can be edited claims the press before the camera starts an orbit.
      if (isHoverFeedbackObject(hit.object)) continue;
      if (isTransformControlsPlaneObject(hit.object)) continue;
      if (isTransformControlsGizmoObject(hit.object)) return;
      if (isComposerToolObject(hit.object)) return;

      const composerRoot = findComposerRoot(hit.object);
      if (composerRoot) {
        event.preventDefault();
        event.stopImmediatePropagation();
        clearHoverFeedback();
        editorState.select(composerRoot);
        return;
      }

      if (!adapter) continue;
      const handle = adapter.resolveHit(hit);
      if (!handle) continue;
      if (handle.locked) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      clearHoverFeedback();
      editorState.selectNative(adapter, handle);
      return;
    }
  }

  function handleSceneHover(event: PointerEvent): void {
    if (editorState.activeCatalogItem || editorState.gizmoDragging) {
      clearHoverFeedback();
      return;
    }

    const canvas = canvasElement();
    const activeCamera = getCamera();
    const activeScene = (scene as any)?.current ?? scene;
    if (!canvas || !activeCamera || !activeScene) return;

    const rect = canvas.getBoundingClientRect();
    nativePointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    nativePointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    nativeRaycaster.setFromCamera(nativePointer, activeCamera);

    const adapter = plugin.nativeObjects;
    const hits = nativeRaycaster.intersectObjects(activeScene.children, true);
    for (const hit of hits) {
      if (isHoverFeedbackObject(hit.object)) continue;
      if (isTransformControlsPlaneObject(hit.object)) continue;
      if (isTransformControlsGizmoObject(hit.object)) {
        clearHoverFeedback();
        return;
      }
      if (isComposerToolObject(hit.object)) {
        clearHoverFeedback();
        return;
      }

      const composerRoot = findComposerRoot(hit.object);
      if (composerRoot) {
        setObjectHoverFeedback(composerRoot);
        return;
      }

      if (!adapter) continue;
      const handle = adapter.resolveHit(hit);
      if (!handle) continue;
      setHandleHoverFeedback(adapter, handle);
      return;
    }
    clearHoverFeedback();
  }

  function releaseGizmoDrag(): void {
    if (!editorState.gizmoDragging) return;
    editorState.setGizmoDragging(false);
    clearHoverFeedback();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (isEditableKeyboardTarget(event.target)) return;
    const key = event.key.toLowerCase();

    if (key === "1") {
      editorState.setGizmoMode("translate");
      return;
    }
    if (key === "2") {
      editorState.setGizmoMode("rotate");
      return;
    }
    if (key === "3") {
      editorState.setGizmoMode("scale");
      return;
    }
    if (key === "escape") {
      editorState.deselect();
      editorState.stopPlacement();
      return;
    }

    if (key === "delete" || key === "backspace") {
      const sel = editorState.selectedObject;
      if (sel) {
        const native = editorState.nativeSelection;
        if (native) {
          if (native.handle.locked) return;
          const before = native.adapter.read(native.handle);
          const after = { ...before, visible: false };
          const { adapter, handle } = native;
          const cmd: Command = {
            label: `Delete ${handle.label}`,
            execute() {
              adapter.applyPlacement(handle, after);
              editorState.upsertPlacement(after);
            },
            undo() {
              adapter.applyPlacement(handle, before);
              editorState.upsertPlacement(before);
            },
          };
          editorState.commands.execute(cmd);
          editorState.deselect();
          return;
        }

        const id = findComposerId(sel);
        if (id) {
          const placement = editorState.placements.find((p) => p.id === id);
          if (placement) {
            const cmd: Command = {
              label: `Delete ${placement.objectKey}`,
              execute() {
                editorState.removePlacement(id);
                sel.visible = false;
              },
              undo() {
                editorState.addPlacement(placement);
                sel.visible = true;
              },
            };
            editorState.commands.execute(cmd);
            editorState.deselect();
          }
        }
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && key === "s") {
      event.preventDefault();
      onSave?.();
      return;
    }

    if (["w", "a", "s", "d", "q", "e"].includes(key)) {
      panKeys.add(key);
      event.preventDefault();
      event.stopPropagation();
    }
    if (event.key === "Shift") panKeys.add("shift");
  }

  function handleKeyUp(event: KeyboardEvent) {
    panKeys.delete(event.key.toLowerCase());
    if (event.key === "Shift") panKeys.delete("shift");
  }

  useTask((delta) => {
    if (editorState.gizmoDragging) return;
    if (panKeys.size === 0) return;
    const cam = getCamera();
    if (!cam) return;

    const speed = (panKeys.has("shift") ? PAN_SPEED * 3 : PAN_SPEED) * delta;
    const forward = (panKeys.has("w") ? 1 : 0) - (panKeys.has("s") ? 1 : 0);
    const strafe = (panKeys.has("d") ? 1 : 0) - (panKeys.has("a") ? 1 : 0);
    const vertical = (panKeys.has("e") ? 1 : 0) - (panKeys.has("q") ? 1 : 0);
    if (forward === 0 && strafe === 0 && vertical === 0) return;

    cam.getWorldDirection(_tempVec);
    const fwdLen = Math.sqrt(_tempVec.x ** 2 + _tempVec.z ** 2) || 1;
    const nfx = _tempVec.x / fwdLen;
    const nfz = _tempVec.z / fwdLen;
    const nrx = -nfz;
    const nrz = nfx;

    const dx = (nfx * forward + nrx * strafe) * speed;
    const dz = (nfz * forward + nrz * strafe) * speed;
    const dy = vertical * speed;

    cam.position.x += dx;
    cam.position.y += dy;
    cam.position.z += dz;
    editorState.panTarget(dx, dy, dz);
  });

  onMount(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    const canvas = canvasElement();
    canvas?.addEventListener("pointerdown", handleScenePointerDown, true);
    canvas?.addEventListener("pointermove", handleSceneHover);
    canvas?.addEventListener("pointerleave", clearHoverFeedback);
    window.addEventListener("pointerup", releaseGizmoDrag);
    window.addEventListener("blur", releaseGizmoDrag);
    if (document.pointerLockElement) document.exitPointerLock();
  });

  onDestroy(() => {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
    const canvas = canvasElement();
    canvas?.removeEventListener("pointerdown", handleScenePointerDown, true);
    canvas?.removeEventListener("pointermove", handleSceneHover);
    canvas?.removeEventListener("pointerleave", clearHoverFeedback);
    window.removeEventListener("pointerup", releaseGizmoDrag);
    window.removeEventListener("blur", releaseGizmoDrag);
    editorState.setGizmoDragging(false);
    clearHoverFeedback();
    editorState.deselect();
    hoverOverlay.clear();
    hoverMaterial.dispose();
  });
</script>

<T is={hoverOverlay} dispose={false} />

{#if editorState.selectedObject && !editorState.selectedLocked}
  <TransformControls
    object={editorState.selectedObject}
    mode={editorState.gizmoMode}
    translationSnap={0.5}
    rotationSnap={Math.PI / 12}
    scaleSnap={0.1}
    onmouseDown={() => {
      panKeys.clear();
      editorState.setGizmoDragging(true);
      clearHoverFeedback();
      if (editorState.selectedObject)
        captureBeforeDrag(editorState.selectedObject);
    }}
    onmouseUp={() => {
      try {
        if (editorState.selectedObject)
          captureAfterDrag(editorState.selectedObject);
      } finally {
        releaseGizmoDrag();
      }
    }}
    onobjectChange={() => {
      const native = editorState.nativeSelection;
      if (native) native.adapter.previewTransform(native.handle, native.target);
    }}
  />
{/if}
