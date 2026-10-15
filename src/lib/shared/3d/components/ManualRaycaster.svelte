<script lang="ts">
  import {
    resolveThrelteScene,
    resolveThrelteRenderer,
  } from "../scene-boot/threlte-handles";
  /**
   * ManualRaycaster
   *
   * Implements manual raycasting for click detection on 3D objects.
   * Bypasses Threlte's interactivity plugin which has issues with multiple Three.js instances.
   * Also supports drag-to-move by raycasting against a ground plane.
   */
  import { useThrelte } from "@threlte/core";
  import { Raycaster, Vector2, Vector3, Plane, Object3D, Mesh } from "three";
  import type { Intersection } from "three";
  import { onMount, onDestroy } from "svelte";

  interface Props {
    /** Callback when a mesh is clicked, with the mesh and intersection point */
    onMeshClick?: (mesh: Object3D, point: Vector3) => void;
    /** Callback when pointer is released */
    onPointerUp?: () => void;
    /** Callback during drag with ground plane coordinates */
    onDrag?: (position: { x: number; z: number }) => void;
    /** Whether dragging is currently active (controls ground plane raycasting) */
    isDragging?: boolean;
    /** Callback when mouse enters a mesh */
    onMeshEnter?: (mesh: Object3D) => void;
    /** Callback when mouse leaves a mesh */
    onMeshLeave?: (mesh: Object3D) => void;
  }

  let {
    onMeshClick,
    onPointerUp,
    onDrag,
    isDragging = false,
    onMeshEnter,
    onMeshLeave,
  }: Props = $props();

  const { scene: sceneValue, camera, renderer: rendererValue } = useThrelte();
  const scene = resolveThrelteScene(sceneValue);
  const renderer = resolveThrelteRenderer(rendererValue);

  const raycaster = new Raycaster();
  const pointer = new Vector2();

  // Ground plane for drag raycasting (y = 0, facing up)
  const groundPlane = new Plane(new Vector3(0, 1, 0), 0);
  const intersectPoint = new Vector3();

  let currentHovered: Object3D | null = null;
  let canvasElement: HTMLCanvasElement | null = null;

  function getCanvasCoords(event: PointerEvent): Vector2 {
    if (!canvasElement) return pointer;

    const rect = canvasElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    return pointer;
  }

  function findIntersection(event: PointerEvent): Intersection | null {
    const cam = camera.current;
    if (!cam) return null;

    getCanvasCoords(event);
    raycaster.setFromCamera(pointer, cam);

    // Only raycast against meshes (not lights, cameras, etc.)
    const intersects = raycaster.intersectObjects(scene.children, true);

    // Find first mesh intersection
    for (const intersection of intersects) {
      if (intersection.object instanceof Mesh) {
        return intersection;
      }
    }

    return null;
  }

  /**
   * Walk up the parent hierarchy to find a group named PERFORMER_X
   * Returns the performer ID (e.g., "performer-0") or null if not found
   */
  function findPerformerAncestor(object: Object3D): string | null {
    let current: Object3D | null = object;
    while (current) {
      if (current.name?.startsWith("PERFORMER_")) {
        // Extract the ID part after PERFORMER_
        return current.name.replace("PERFORMER_", "");
      }
      current = current.parent;
    }
    return null;
  }

  function handlePointerDown(event: PointerEvent) {
    const intersection = findIntersection(event);
    if (intersection && onMeshClick) {
      const performerId = findPerformerAncestor(intersection.object);
      if (performerId) {
        const virtualMesh = new Object3D();
        virtualMesh.name = `PERFORMER_${performerId}`;
        onMeshClick(virtualMesh, intersection.point);
      } else {
        onMeshClick(intersection.object, intersection.point);
      }
    }
  }

  function handlePointerUp(event: PointerEvent) {
    onPointerUp?.();
  }

  function handlePointerMove(event: PointerEvent) {
    // If dragging, raycast against ground plane for position updates
    if (isDragging && onDrag) {
      const cam = camera.current;
      if (cam) {
        getCanvasCoords(event);
        raycaster.setFromCamera(pointer, cam);

        // Intersect with ground plane (y = 0)
        if (raycaster.ray.intersectPlane(groundPlane, intersectPoint)) {
          onDrag({ x: intersectPoint.x, z: intersectPoint.z });
        }
      }
      return; // Skip hover logic during drag
    }

    const intersection = findIntersection(event);
    const hitObject = intersection?.object ?? null;

    if (hitObject !== currentHovered) {
      if (currentHovered) {
        onMeshLeave?.(currentHovered);
      }
      if (hitObject) {
        onMeshEnter?.(hitObject);
      }
      currentHovered = hitObject;
    }
  }

  function bindEvents() {
    canvasElement = renderer.domElement;
    if (!canvasElement) return false;
    canvasElement.addEventListener("pointerdown", handlePointerDown);
    canvasElement.addEventListener("pointerup", handlePointerUp);
    canvasElement.addEventListener("pointermove", handlePointerMove);
    return true;
  }

  function unbindEvents() {
    if (canvasElement) {
      canvasElement.removeEventListener("pointerdown", handlePointerDown);
      canvasElement.removeEventListener("pointerup", handlePointerUp);
      canvasElement.removeEventListener("pointermove", handlePointerMove);
    }
  }

  onMount(() => {
    if (bindEvents()) return;
    let attempts = 0;
    const id = setInterval(() => {
      if (bindEvents() || ++attempts > 20) clearInterval(id);
    }, 50);
    return () => clearInterval(id);
  });

  onDestroy(() => {
    unbindEvents();
  });
</script>
