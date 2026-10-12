import type CameraControls from "camera-controls";
import {
  CapsuleGeometry,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Quaternion,
  Sprite,
  SpriteMaterial,
  Vector3,
} from "three";

import {
  createPerformerPointerInteraction,
  type PerformerPointerInteraction,
  type StageBounds,
  type StagePosition,
} from "../../components/performer-interaction/performer-pointer-interaction.svelte";
import type { WorkerCameraSnapshot } from "../domain/worker-renderer-protocol";
import {
  assessWorkerPerformerInteractionCapability,
  type WorkerPerformerInteractionCapability,
} from "./worker-performer-interaction-capability";

// PerformerPickProxy is a legacy Svelte presentation, so its dimensions cannot
// be imported. This worker bridge mirrors that canonical invisible hit volume;
// the contract test reads the component source and fails if either side drifts.
export const WORKER_PERFORMER_PICK_PROXY = {
  radius: 0.5,
  length: 0.8,
  capSegments: 4,
  radialSegments: 12,
  centerHeight: 0.9,
} as const;

export const WORKER_PERFORMER_BADGE_PICK_SCALE = 0.22;

export interface WorkerPerformerInteractionCameraArbiter {
  enabled: boolean;
  readonly azimuthAngle: number;
}

export interface WorkerPerformerInteractionViewer {
  readonly primaryPerformerIndex: number | null;
  readonly selectedPerformerIndices: readonly number[];
  readonly performerSelectionMode: boolean;
  readonly isCameraDragging: boolean;
  registerPerformerPlacement?(fn: () => void): () => void;
  readonly performerManager: {
    readonly performers: Array<{ position: StagePosition }>;
    handleDrag(index: number, position: StagePosition): void;
  };
  replacePerformerSelection(index: number): void;
  togglePerformerSelection(index: number): void;
  clearPerformerSelection(): void;
  setPerformerSelectionMode(value: boolean): void;
  beginSpatialEdit(): void;
  endSpatialEdit(): void;
  cancelSpatialEdit(): void;
  markFormationCustom(): void;
}

export interface WorkerPerformerInteractionPerformer {
  index: number;
  position: StagePosition;
  interactive?: boolean;
  badge?: {
    visible: boolean;
    worldY: number;
  };
}

export interface WorkerPerformerInteractionFrame {
  camera: WorkerCameraSnapshot | null;
  performers: readonly WorkerPerformerInteractionPerformer[];
  groundY: number;
  stageBounds: StageBounds;
  /**
   * The legacy renderer can pin a drag to a deforming triangle under the
   * cursor. That animated surface does not exist on the app thread, so callers
   * requiring it must remain on the legacy renderer.
   */
  requireRenderedSurfaceAnchors?: boolean;
}

export interface WorkerPerformerInteractionBridgeOptions {
  /** Stable container above both transferred worker canvases. */
  interactionSurface: HTMLElement;
  /** Optional coordinate host for a projected move hint. */
  projectionContainer?: HTMLElement;
  viewer: WorkerPerformerInteractionViewer;
  cameraArbiter: WorkerPerformerInteractionCameraArbiter | null;
  onHintDismissed?: () => void;
}

export interface ProjectedWorkerStagePosition {
  x: number;
  y: number;
  visible: boolean;
}

interface PickProxy {
  mesh: Mesh;
  unregister: () => void;
}

interface BadgeProxy {
  sprite: Sprite;
  unregister: () => void;
}

interface CachedElementRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function createCameraArbitrationAdapter(
  options: WorkerPerformerInteractionBridgeOptions
): CameraControls | null {
  if (!options.cameraArbiter) return null;
  const controls = {
    get enabled() {
      return options.cameraArbiter?.enabled ?? false;
    },
    set enabled(value: boolean) {
      if (options.cameraArbiter) options.cameraArbiter.enabled = value;
    },
    get azimuthAngle() {
      return options.cameraArbiter?.azimuthAngle ?? 0;
    },
  };
  return controls as unknown as CameraControls;
}

/**
 * App-thread interaction for an OffscreenCanvas scene. Rendering stays in the
 * worker; this class owns only camera math and the same invisible hit volumes
 * the legacy viewer already uses.
 */
export class WorkerPerformerInteractionBridge {
  private readonly camera = new PerspectiveCamera(50, 1, 0.1, 1000);
  private readonly interaction: PerformerPointerInteraction;
  private readonly pickMaterial = new MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
  });
  private readonly badgeMaterial = new SpriteMaterial({
    transparent: true,
    opacity: 0,
    depthTest: false,
  });
  private readonly pickProxies = new Map<number, PickProxy>();
  private readonly badgeProxies = new Map<number, BadgeProxy>();
  private readonly activePointerIds = new Set<number>();
  private frame: WorkerPerformerInteractionFrame = {
    camera: null,
    performers: [],
    groundY: 0,
    stageBounds: { width: 0, depth: 0 },
  };
  private detachInteraction: (() => void) | null = null;
  private layoutObserver: ResizeObserver | null = null;
  private surfaceRect: CachedElementRect;
  private projectionRect: CachedElementRect;
  private attachmentRequested = false;
  private disposed = false;

  private readonly refreshAfterViewportMove = (): void => {
    this.refreshLayout();
  };

  private readonly trackPointerDown = (event: PointerEvent): void => {
    this.activePointerIds.add(event.pointerId);
  };

  private readonly trackPointerEnd = (event: PointerEvent): void => {
    this.activePointerIds.delete(event.pointerId);
  };

  constructor(
    private readonly options: WorkerPerformerInteractionBridgeOptions
  ) {
    this.surfaceRect = this.measureRect(options.interactionSurface);
    this.projectionRect = this.measureRect(
      options.projectionContainer ?? options.interactionSurface
    );
    if (typeof ResizeObserver !== "undefined") {
      this.layoutObserver = new ResizeObserver(() => this.refreshLayout());
      this.layoutObserver.observe(options.interactionSurface);
      if (
        options.projectionContainer &&
        options.projectionContainer !== options.interactionSurface
      ) {
        this.layoutObserver.observe(options.projectionContainer);
      }
    }
    window.addEventListener("scroll", this.refreshAfterViewportMove, true);
    window.addEventListener("resize", this.refreshAfterViewportMove);
    const cameraControls = createCameraArbitrationAdapter(options);
    const viewer = {
      get primaryPerformerIndex() {
        return options.viewer.primaryPerformerIndex;
      },
      get selectedPerformerIndices() {
        return options.viewer.selectedPerformerIndices;
      },
      get performerSelectionMode() {
        return options.viewer.performerSelectionMode;
      },
      get isCameraDragging() {
        return options.viewer.isCameraDragging;
      },
      performerManager: options.viewer.performerManager,
      replacePerformerSelection: (index: number) =>
        options.viewer.replacePerformerSelection(index),
      togglePerformerSelection: (index: number) =>
        options.viewer.togglePerformerSelection(index),
      clearPerformerSelection: () => options.viewer.clearPerformerSelection(),
      setPerformerSelectionMode: (value: boolean) =>
        options.viewer.setPerformerSelectionMode(value),
      beginSpatialEdit: () => options.viewer.beginSpatialEdit(),
      endSpatialEdit: () => options.viewer.endSpatialEdit(),
      cancelSpatialEdit: () => options.viewer.cancelSpatialEdit(),
      markFormationCustom: () => options.viewer.markFormationCustom(),
      cameraChoreography: { controls: cameraControls },
    };
    this.interaction = createPerformerPointerInteraction({
      // The existing owner only needs the HTMLElement event/rect/style/dataset
      // contract. The legacy name is `canvas`; the worker's stable container is
      // intentionally used so an atomic canvas handoff cannot drop a gesture.
      canvas: options.interactionSurface as HTMLCanvasElement,
      camera: () => this.camera,
      viewer,
      groundY: () => this.frame.groundY,
      stageBounds: () => this.frame.stageBounds,
      onHintDismissed: options.onHintDismissed,
    });
  }

  get hoveredIndex(): number | null {
    return this.interaction.hoveredIndex;
  }

  get draggingIndex(): number | null {
    return this.interaction.draggingIndex;
  }

  get placing(): boolean {
    return this.interaction.placing;
  }

  togglePlacement(): void {
    this.interaction.togglePlacement();
  }

  takeMoveHint(): boolean {
    return this.interaction.takeMoveHint();
  }

  update(
    frame: WorkerPerformerInteractionFrame
  ): WorkerPerformerInteractionCapability {
    this.assertUsable();
    this.frame = frame;
    const capability = this.getCapability();
    if (!capability.supported) {
      this.stopListening();
      this.clearProxies();
      return capability;
    }

    this.applyCamera(frame.camera!);
    this.synchronizeProxies(frame.performers);
    if (this.attachmentRequested && !this.detachInteraction) {
      this.attachPointerTracking();
      this.detachInteraction = this.interaction.attach();
    }
    return capability;
  }

  getCapability(): WorkerPerformerInteractionCapability {
    const surface = this.options.interactionSurface;
    const rect = this.surfaceRect;
    return assessWorkerPerformerInteractionCapability({
      camera: this.frame.camera,
      cameraArbitrationAvailable: this.options.cameraArbiter !== null,
      surfaceWidth: rect.width,
      surfaceHeight: rect.height,
      pointerCaptureAvailable:
        typeof surface.setPointerCapture === "function" &&
        typeof surface.hasPointerCapture === "function" &&
        typeof surface.releasePointerCapture === "function",
      stageBounds: this.frame.stageBounds,
      groundY: this.frame.groundY,
      performers: this.frame.performers
        .filter((performer) => performer.interactive !== false)
        .map((performer) => ({
          index: performer.index,
          position: performer.position,
          badgeVisible: performer.badge?.visible,
          badgeWorldY: performer.badge?.worldY,
        })),
      viewerPerformerCount:
        this.options.viewer.performerManager.performers.length,
      requireRenderedSurfaceAnchors: this.frame.requireRenderedSurfaceAnchors,
    });
  }

  attach(): WorkerPerformerInteractionCapability {
    this.assertUsable();
    this.attachmentRequested = true;
    const capability = this.getCapability();
    if (capability.supported && !this.detachInteraction) {
      this.attachPointerTracking();
      this.detachInteraction = this.interaction.attach();
    }
    return capability;
  }

  detach(): void {
    this.attachmentRequested = false;
    this.stopListening();
  }

  private stopListening(): void {
    for (const pointerId of this.activePointerIds) {
      this.interaction.cancelPointer({ pointerId } as PointerEvent);
    }
    this.activePointerIds.clear();
    this.detachInteraction?.();
    this.detachInteraction = null;
    this.detachPointerTracking();
  }

  projectStagePosition(
    position: StagePosition,
    worldY = this.frame.groundY + 0.08
  ): ProjectedWorkerStagePosition | null {
    if (!this.frame.camera) return null;
    const surfaceRect = this.surfaceRect;
    const hostRect = this.projectionRect;
    if (surfaceRect.width <= 0 || surfaceRect.height <= 0) return null;
    const projected = new Vector3(position.x, worldY, position.z).project(
      this.camera
    );
    return {
      x:
        surfaceRect.left -
        hostRect.left +
        ((projected.x + 1) * surfaceRect.width) / 2,
      y:
        surfaceRect.top -
        hostRect.top +
        ((1 - projected.y) * surfaceRect.height) / 2,
      visible:
        projected.z >= -1 &&
        projected.z <= 1 &&
        projected.x >= -1 &&
        projected.x <= 1 &&
        projected.y >= -1 &&
        projected.y <= 1,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.attachmentRequested = false;
    this.stopListening();
    this.clearProxies();
    this.pickMaterial.dispose();
    this.badgeMaterial.dispose();
    this.layoutObserver?.disconnect();
    this.layoutObserver = null;
    window.removeEventListener("scroll", this.refreshAfterViewportMove, true);
    window.removeEventListener("resize", this.refreshAfterViewportMove);
    this.disposed = true;
  }

  private applyCamera(snapshot: WorkerCameraSnapshot): void {
    const rect = this.surfaceRect;
    this.camera.aspect =
      rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 1;
    this.camera.fov = snapshot.fov;
    this.camera.position.fromArray(snapshot.position);
    if (snapshot.up) this.camera.up.fromArray(snapshot.up);
    else this.camera.up.set(0, 1, 0);
    if (snapshot.quaternion)
      this.camera.quaternion.copy(
        new Quaternion().fromArray(snapshot.quaternion)
      );
    else this.camera.lookAt(...snapshot.target);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
  }

  /**
   * Cache layout after the browser has already performed it. Reading the same
   * rect from every choreography-frame update forced a synchronous reflow in
   * the production viewer while a replacement worker was booting.
   */
  private refreshLayout(): void {
    this.surfaceRect = this.measureRect(this.options.interactionSurface);
    this.projectionRect = this.measureRect(
      this.options.projectionContainer ?? this.options.interactionSurface
    );
  }

  private measureRect(element: HTMLElement): CachedElementRect {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }

  private synchronizeProxies(
    performers: readonly WorkerPerformerInteractionPerformer[]
  ): void {
    const active = new Set<number>();
    for (const performer of performers) {
      if (performer.interactive === false) continue;
      active.add(performer.index);
      let proxy = this.pickProxies.get(performer.index);
      if (!proxy) {
        const mesh = new Mesh(
          new CapsuleGeometry(
            WORKER_PERFORMER_PICK_PROXY.radius,
            WORKER_PERFORMER_PICK_PROXY.length,
            WORKER_PERFORMER_PICK_PROXY.capSegments,
            WORKER_PERFORMER_PICK_PROXY.radialSegments
          ),
          this.pickMaterial
        );
        mesh.userData = {
          performerIndex: performer.index,
          performerPickTarget: true,
        };
        proxy = {
          mesh,
          unregister: this.interaction.registerPickTarget(mesh),
        };
        this.pickProxies.set(performer.index, proxy);
      }
      proxy.mesh.position.set(
        performer.position.x,
        this.frame.groundY + WORKER_PERFORMER_PICK_PROXY.centerHeight,
        performer.position.z
      );
      proxy.mesh.updateMatrixWorld(true);

      if (performer.badge?.visible) {
        let badge = this.badgeProxies.get(performer.index);
        if (!badge) {
          const sprite = new Sprite(this.badgeMaterial);
          sprite.scale.set(
            WORKER_PERFORMER_BADGE_PICK_SCALE,
            WORKER_PERFORMER_BADGE_PICK_SCALE,
            1
          );
          sprite.userData = {
            performerIndex: performer.index,
            performerPickTarget: true,
          };
          badge = {
            sprite,
            unregister: this.interaction.registerPickTarget(sprite),
          };
          this.badgeProxies.set(performer.index, badge);
        }
        badge.sprite.position.set(
          performer.position.x,
          performer.badge.worldY,
          performer.position.z
        );
        badge.sprite.updateMatrixWorld(true);
      } else this.removeBadgeProxy(performer.index);
    }

    for (const index of this.pickProxies.keys()) {
      if (!active.has(index)) this.removePickProxy(index);
    }
    for (const index of this.badgeProxies.keys()) {
      if (!active.has(index)) this.removeBadgeProxy(index);
    }
  }

  private removePickProxy(index: number): void {
    const proxy = this.pickProxies.get(index);
    if (!proxy) return;
    proxy.unregister();
    proxy.mesh.geometry.dispose();
    this.pickProxies.delete(index);
  }

  private removeBadgeProxy(index: number): void {
    const proxy = this.badgeProxies.get(index);
    if (!proxy) return;
    proxy.unregister();
    this.badgeProxies.delete(index);
  }

  private clearProxies(): void {
    for (const index of [...this.pickProxies.keys()])
      this.removePickProxy(index);
    for (const index of [...this.badgeProxies.keys()])
      this.removeBadgeProxy(index);
  }

  private attachPointerTracking(): void {
    const canvas = this.options.interactionSurface;
    // Register first so a performer press can still stop the camera listener
    // immediately afterward without hiding its pointer identity from cleanup.
    canvas.addEventListener("pointerdown", this.trackPointerDown, {
      capture: true,
    });
    canvas.addEventListener("pointerup", this.trackPointerEnd);
    canvas.addEventListener("pointercancel", this.trackPointerEnd);
    canvas.addEventListener("lostpointercapture", this.trackPointerEnd);
  }

  private detachPointerTracking(): void {
    const canvas = this.options.interactionSurface;
    canvas.removeEventListener("pointerdown", this.trackPointerDown, {
      capture: true,
    });
    canvas.removeEventListener("pointerup", this.trackPointerEnd);
    canvas.removeEventListener("pointercancel", this.trackPointerEnd);
    canvas.removeEventListener("lostpointercapture", this.trackPointerEnd);
  }

  private assertUsable(): void {
    if (this.disposed)
      throw new Error("WorkerPerformerInteractionBridge is disposed.");
  }
}

export function createWorkerPerformerInteractionBridge(
  options: WorkerPerformerInteractionBridgeOptions
): WorkerPerformerInteractionBridge {
  return new WorkerPerformerInteractionBridge(options);
}
