<script lang="ts">
  /**
   * Museum Scene Editor
   *
   * F2 toggles editor mode. OrbitControls for camera. Click to select objects.
   * TransformControls gizmo for transform. 1/2/3 for translate/rotate/scale.
   *
   * Uses OrbitControls (industry standard for 3D editors) + TransformControls
   * from @threlte/extras. TransformControls auto-pauses OrbitControls during drag.
   */
  import { useThrelte, useTask } from "@threlte/core";
  import { TransformControls } from "@threlte/extras";
  import {
    Raycaster,
    Vector2,
    Vector3,
    type Object3D,
    type Camera,
  } from "three";
  import {
    resolveScene,
    resolveCamera,
    resolveRenderer,
  } from "../resolve-threlte-scene";
  import { createMetadataSceneObjectAdapter } from "#lib/shared/3d/scene-composer/metadata-scene-object-adapter.js";
  import type {
    ComposerPlacement,
    SceneObjectHandle,
  } from "#lib/shared/3d/scene-composer/types.js";
  import {
    CommandStack,
    type Command,
  } from "#lib/shared/history/command-stack.svelte.js";

  const _tempVec2 = new Vector3();
  const _worldPos = new Vector3();
  import { onMount, onDestroy } from "svelte";
  import { museum3dEditorState } from "../../state/museum-3d-editor-state.svelte";
  import { museumEditorOverrides } from "../../state/museum-editor-overrides";
  import { isEditableKeyboardTarget } from "#lib/shared/keyboard/domain/shortcut-target-resolution.js";

  interface Props {
    /** Called after any editor drag/undo/redo so the parent can sync grid data */
    onOverrideChanged?: () => void;
  }

  let { onOverrideChanged }: Props = $props();

  const museumObjects = createMetadataSceneObjectAdapter({
    sceneId: "museum",
    editableRoles: new Set(),
    lockedRoles: new Set(),
    editableNamePatterns: [/^plaque-/, /^performer-station-/, /^furniture-/],
  });
  const commands = new CommandStack();
  let selectedHandle: SceneObjectHandle | null = null;
  let dragStartPlacement: ComposerPlacement | null = null;

  function captureBeforeDrag() {
    if (!selectedHandle) return;
    dragStartPlacement = museumObjects.read(selectedHandle);
  }

  /** Save position override for a named object after any transform change */
  function saveOverrideForHandle(handle: SceneObjectHandle) {
    const obj = handle.object;
    if (!obj.name) return;
    obj.getWorldPosition(_worldPos);
    museumEditorOverrides.set(obj.name, {
      x: _worldPos.x,
      y: _worldPos.y,
      z: _worldPos.z,
    });
    // Notify parent so it can update grid data for interactions
    onOverrideChanged?.();
  }

  function captureAfterDrag() {
    if (!selectedHandle || !dragStartPlacement) return;
    const handle = selectedHandle;
    const target = museum3dEditorState.selectedObject ?? undefined;
    const before = dragStartPlacement;
    const after = museumObjects.read(handle);
    const command: Command = {
      label: `Move ${handle.label}`,
      execute() {
        museumObjects.applyPlacement(handle, after, target);
        saveOverrideForHandle(handle);
      },
      undo() {
        museumObjects.applyPlacement(handle, before, target);
        saveOverrideForHandle(handle);
      },
    };
    commands.record(command);
    dragStartPlacement = null;
    saveOverrideForHandle(handle);
  }

  function undo() {
    commands.undo();
  }

  function redo() {
    commands.redo();
  }

  const ctx = useThrelte();
  const getScene = () => resolveScene(ctx);
  const getCamera = (): Camera | null => resolveCamera(ctx);
  const getCanvas = (): HTMLCanvasElement | null =>
    resolveRenderer(ctx)?.domElement ?? null;

  const raycaster = new Raycaster();
  const pointer = new Vector2();

  // Track whether TransformControls is actively dragging
  let gizmoDragging = false;

  function findClickedObject(event: PointerEvent): SceneObjectHandle | null {
    const cam = getCamera();
    const scene = getScene();
    if (!cam || !scene) return null;

    const canvas = getCanvas();
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, cam);
    const intersects = raycaster.intersectObjects(scene.children, true);

    for (const hit of intersects) {
      // Skip gizmo meshes
      let isGizmo = false;
      let parent: Object3D | null = hit.object;
      while (parent) {
        if (
          (parent as any).isTransformControls ||
          parent.type === "TransformControlsGizmo" ||
          parent.type === "TransformControlsPlane"
        ) {
          isGizmo = true;
          break;
        }
        parent = parent.parent;
      }
      if (isGizmo) return null; // Click was on gizmo - don't change selection

      const handle = museumObjects.resolveHit(hit);
      if (handle) return handle;
    }
    return null;
  }

  function deselect(): void {
    if (selectedHandle && museum3dEditorState.selectedObject) {
      museumObjects.disposeTransformTarget(
        selectedHandle,
        museum3dEditorState.selectedObject
      );
    }
    selectedHandle = null;
    dragStartPlacement = null;
    museum3dEditorState.deselect();
  }

  function select(handle: SceneObjectHandle): void {
    deselect();
    selectedHandle = handle;
    museum3dEditorState.select(museumObjects.createTransformTarget(handle));
  }

  function handlePointerDown(event: PointerEvent) {
    if (event.button !== 0) return; // Left click only
    if (gizmoDragging) return;
    // Don't interfere with placement mode - PlacementGhost handles clicks
    if (museum3dEditorState.placementDef) return;

    // Defer so TransformControls processes first
    requestAnimationFrame(() => {
      if (gizmoDragging) return;
      const handle = findClickedObject(event);
      if (handle) {
        select(handle);
      } else {
        deselect();
      }
    });
  }

  function handleDoubleClick(event: MouseEvent) {
    // Double-click: focus orbit on the clicked point (standard 3D editor behavior)
    const cam = getCamera();
    const scene = getScene();
    const canvas = getCanvas();
    if (!cam || !scene || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, cam);
    const hits = raycaster.intersectObjects(scene.children, true);

    for (const hit of hits) {
      if (
        (hit.object as any).isInstancedMesh ||
        (hit.object as any).isTransformControls
      )
        continue;
      // Focus orbit target on the hit point
      museum3dEditorState.focusOnPoint(hit.point.x, hit.point.y, hit.point.z);
      break;
    }
  }

  // ── WASD keyboard panning ──
  const panKeys = new Set<string>();
  const PAN_SPEED = 8; // units/sec

  function handleKeyDown(event: KeyboardEvent) {
    if (isEditableKeyboardTarget(event.target)) return;
    const key = event.key.toLowerCase();

    // Gizmo mode
    if (key === "1") {
      museum3dEditorState.setMode("translate");
      return;
    }
    if (key === "2") {
      museum3dEditorState.setMode("rotate");
      return;
    }
    if (key === "3") {
      museum3dEditorState.setMode("scale");
      return;
    }
    if (key === "escape") {
      deselect();
      return;
    }

    // Ctrl+Z/Ctrl+Shift+Z undo/redo
    if ((event.ctrlKey || event.metaKey) && key === "z") {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
      return;
    }

    // WASD + Q/E for panning
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

  // Each frame: pan the orbit target (and camera follows via OrbitControls)
  useTask((delta) => {
    if (panKeys.size === 0) return;
    const cam = getCamera();
    if (!cam) return;

    const speed = (panKeys.has("shift") ? PAN_SPEED * 3 : PAN_SPEED) * delta;
    const forward = (panKeys.has("w") ? 1 : 0) - (panKeys.has("s") ? 1 : 0);
    const strafe = (panKeys.has("d") ? 1 : 0) - (panKeys.has("a") ? 1 : 0);
    const vertical = (panKeys.has("e") ? 1 : 0) - (panKeys.has("q") ? 1 : 0);

    if (forward === 0 && strafe === 0 && vertical === 0) return;

    // Project camera's look direction onto the XZ plane for forward/right
    cam.getWorldDirection(_tempVec2);
    const fwdX = _tempVec2.x;
    const fwdZ = _tempVec2.z;
    const fwdLen = Math.sqrt(fwdX * fwdX + fwdZ * fwdZ) || 1;
    // Normalized forward on XZ
    const nfx = fwdX / fwdLen;
    const nfz = fwdZ / fwdLen;
    // Right = forward rotated 90° clockwise on XZ
    const nrx = -nfz;
    const nrz = nfx;

    const dx = (nfx * forward + nrx * strafe) * speed;
    const dz = (nfz * forward + nrz * strafe) * speed;
    const dy = vertical * speed;

    // Move both camera and orbit target together - OrbitControls maintains
    // the relative offset between camera and target automatically.
    cam.position.x += dx;
    cam.position.y += dy;
    cam.position.z += dz;
    museum3dEditorState.panTarget(dx, dy, dz);
  });

  onMount(() => {
    const canvas = getCanvas();
    if (canvas) {
      canvas.addEventListener("pointerdown", handlePointerDown);
      canvas.addEventListener("dblclick", handleDoubleClick);
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // Release pointer lock on entering editor mode
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  });

  onDestroy(() => {
    const canvas = getCanvas();
    if (canvas) {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("dblclick", handleDoubleClick);
    }
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
    deselect();
  });
</script>

<!-- TransformControls: gizmo on selected object -->
{#if museum3dEditorState.selectedObject}
  <TransformControls
    object={museum3dEditorState.selectedObject}
    mode={museum3dEditorState.gizmoMode}
    translationSnap={0.5}
    rotationSnap={Math.PI / 12}
    scaleSnap={0.1}
    onmouseDown={() => {
      gizmoDragging = true;
      if (museum3dEditorState.selectedObject) {
        captureBeforeDrag();
      }
    }}
    onmouseUp={() => {
      gizmoDragging = false;
      if (museum3dEditorState.selectedObject) {
        captureAfterDrag();
      }
    }}
    onobjectChange={() => {
      if (selectedHandle && museum3dEditorState.selectedObject) {
        museumObjects.previewTransform(
          selectedHandle,
          museum3dEditorState.selectedObject
        );
      }
    }}
  />
{/if}
