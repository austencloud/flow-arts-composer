import { Color, Vector3, type Camera, type Object3D } from "three";
import { Canvas2DVisibilityFadeManager } from "#lib/shared/animation-engine/services/canvas2d/canvas-2d-visibility-fade-manager.js";
import type {
  DynamicLightManager,
  LightHandle,
} from "../../effects/lighting/dynamic-light-manager";
import {
  TrailRenderer3D,
  type TrailRendererConfig,
} from "../../effects/trails/trail-renderer-3d";
import type { WorkerTrailEffectFrame } from "../domain/worker-renderer-protocol";

const TRAIL_FADE_IN_MS = 300;
const TRAIL_FADE_OUT_MS = 200;

interface TrailRendererPort {
  readonly object3D: Object3D;
  updateConfig(config: Partial<TrailRendererConfig>): void;
  setVisibilityAlpha(alpha: number): void;
  addPoint(position: Vector3): void;
  update(cameraPosition: Vector3): void;
  dispose(): void;
}

type CreateTrailRenderer = (
  config: Partial<TrailRendererConfig>
) => TrailRendererPort;

/** Exact Trail3D lifecycle without its Svelte/Threlte shell. */
export class WorkerTrailEffect3D {
  private readonly parent: Object3D;
  private readonly lightManager: DynamicLightManager | null;
  private readonly renderer: TrailRendererPort;
  private readonly visibility = new Canvas2DVisibilityFadeManager(
    TRAIL_FADE_IN_MS,
    TRAIL_FADE_OUT_MS,
    false
  );
  private readonly position = new Vector3();
  private readonly lightColor: Color;
  private readonly capacityKey: string;
  private lightHandle: LightHandle | null = null;
  private fadeClockMs = 0;
  private enabled = false;
  private pendingSample = false;
  private lastSampleSequence = -1;
  private disposed = false;

  constructor(
    parent: Object3D,
    lightManager: DynamicLightManager | null,
    frame: WorkerTrailEffectFrame,
    createRenderer: CreateTrailRenderer = (config) =>
      new TrailRenderer3D(config)
  ) {
    this.parent = parent;
    this.lightManager = lightManager;
    this.capacityKey = WorkerTrailEffect3D.capacityKey(frame);
    this.renderer = createRenderer(frame.config as TrailRendererConfig);
    this.renderer.setVisibilityAlpha(0);
    this.parent.add(this.renderer.object3D);
    this.lightColor = new Color(
      frame.config.color === "rainbow" ? "#ffffff" : frame.config.color
    );
    this.setFrame(frame);
  }

  static capacityKey(frame: WorkerTrailEffectFrame): string {
    return `${frame.config.maxPoints}:${frame.config.qualityTier}`;
  }

  matchesCapacity(frame: WorkerTrailEffectFrame): boolean {
    return this.capacityKey === WorkerTrailEffect3D.capacityKey(frame);
  }

  setFrame(frame: WorkerTrailEffectFrame): void {
    if (this.disposed) return;
    this.enabled = frame.enabled;
    this.visibility.setVisible(frame.enabled);
    this.position.fromArray(frame.position);
    this.renderer.updateConfig(frame.config as Partial<TrailRendererConfig>);
    if (frame.sampleSequence !== this.lastSampleSequence) {
      this.lastSampleSequence = frame.sampleSequence;
      this.pendingSample = frame.enabled;
    }
  }

  setEnabled(enabled: boolean): void {
    if (this.disposed) return;
    this.enabled = enabled;
    this.visibility.setVisible(enabled);
    if (!enabled) this.pendingSample = false;
  }

  update(deltaSeconds: number, camera: Camera): void {
    if (this.disposed) return;
    this.fadeClockMs += Math.max(0, deltaSeconds) * 1000;
    const fade = this.visibility.updateProgress(this.fadeClockMs);
    this.renderer.setVisibilityAlpha(fade.alpha);

    if (this.enabled && this.pendingSample) {
      this.renderer.addPoint(this.position);
      this.pendingSample = false;
    }
    if (this.enabled || fade.alpha > 0) {
      this.renderer.update(camera.position);
    }

    if (this.lightManager && fade.alpha > 0) {
      const intensity = 0.5 * fade.alpha;
      if (!this.lightHandle) {
        this.lightHandle = this.lightManager.requestLight(
          this.position,
          this.lightColor,
          intensity,
          3
        );
      } else {
        this.lightManager.updateLight(
          this.lightHandle,
          this.position,
          intensity
        );
      }
    } else if (this.lightHandle && this.lightManager) {
      this.lightManager.releaseLight(this.lightHandle);
      this.lightHandle = null;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.lightHandle && this.lightManager) {
      this.lightManager.releaseLight(this.lightHandle);
      this.lightHandle = null;
    }
    this.parent.remove(this.renderer.object3D);
    this.renderer.dispose();
  }
}
