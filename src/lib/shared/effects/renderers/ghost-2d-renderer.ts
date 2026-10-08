import type { Ghost2DParams } from "../translators/canvas2d-types";
import {
  resolveGhostAngleQuantization,
  resolveGhostHistoryCapacity,
  resolveGhostLifetimeSeconds,
  resolveGhostPositionQuantization,
} from "../domain/ghost-parameters";
import {
  GHOST_FROST_WHITE,
  GHOST_RIM_FROST_MIX,
  resolveGhost2DAgeVisual,
} from "./ghost-chrono-frost-2d";
import {
  GhostPoseHistory,
  selectGhostAgeStratifiedSamples,
  type GhostPoseSample,
} from "./ghost-pose-history";

/**
 * Ghost = prop onion-skin (decaying ghost trail).
 *
 * Ghost ghosts the REAL PROP SPRITE — the same graphic the engine draws live — at
 * recent past poses. The live prop (drawn at full opacity by the prop renderer)
 * is the head; Ghost lays faded copies of it behind, fading to NOTHING over a
 * short trail window, so the prop trails out behind himself and old poses vanish
 * cleanly. Every layer is cut from that sprite, so a ghost keeps the prop's own
 * texture and colors (a bark stick stays bark with its tape, a staff keeps its
 * hand color) instead of a flat hand tint. There is no persistent floor (that merged every faded ghost into a
 * muddy solid) — a ghost decays to zero and is pruned.
 *
 * Capture is keyed by the prop's QUANTIZED POSE (position + angle): it is
 * granularity-independent (smooth motion lives in the pose, not the step index)
 * and self-deduping (a slow/stationary prop doesn't stack ghosts; revisiting a
 * pose on the next loop just refreshes its recency, so the trail re-forms as the
 * prop passes). Only poses touched within the last `tailSec` seconds are kept, so
 * the live set — and the per-frame cost — stays small (clear + a handful of
 * blits, no shadow blur, no figure cache). The exposure wipes when the sequence
 * changes (`epoch`).
 */
export interface GhostProp {
  /** Stable per-prop id (0 blue, 1 red, …) — keeps each hand's trail separate. */
  id: number;
  /** The prop sprite to blit (already colored). */
  image: CanvasImageSource;
  /** Prop center in canvas pixels. */
  centerX: number;
  centerY: number;
  /** Staff rotation in radians. */
  angle: number;
  /** Pre-scaled draw size in canvas pixels. */
  width: number;
  height: number;
  /** Horizontal mirror (asymmetric props). */
  flipped: boolean;
}

export interface GhostInput {
  /** This frame's live props (blue, red, …) to capture/ghost. */
  props: GhostProp[];
  /** Fractional playback position in steps (unused for keying; kept for parity). */
  currentStep: number;
  /** Sequence content hash — changes on sequence change → wipe the exposure. */
  epoch: string | number;
}

const MAX_VISIBLE_GHOSTS_PER_PROP = 10;
const MAX_TREATMENTS_PER_SPRITE = 12;

type TreatmentSurface = HTMLCanvasElement | OffscreenCanvas;

interface GhostSpriteTreatment {
  rim: TreatmentSurface;
  frost: TreatmentSurface;
  width: number;
  height: number;
}

interface TreatmentCanvas {
  canvas: TreatmentSurface;
  ctx: CanvasRenderingContext2D;
}

export class Ghost2DRenderer {
  private readonly history = new GhostPoseHistory<GhostProp>();
  private knownPropIds = new Set<number>();
  private treatmentCache = new WeakMap<
    object,
    Map<string, GhostSpriteTreatment | null>
  >();

  render(
    ctx: CanvasRenderingContext2D,
    params: Ghost2DParams,
    input: GhostInput,
    deltaTime: number,
    _scale: number
  ): void {
    const { props, epoch } = input;
    const w = ctx.canvas?.width ?? 0;
    const h = ctx.canvas?.height ?? 0;
    if (w <= 0 || h <= 0) return;

    this.history.setEpoch(epoch);
    this.history.advance(deltaTime);

    // Knob mapping:
    //   intensity → overall trail opacity (peak alpha of the freshest ghost)
    //   decay     → Persistence: how long a ghost lasts before fading out
    //   interval  → Density (0-1, higher = denser): finer pose sampling
    const intensity = Math.max(0, Math.min(1, params.intensity ?? 1));
    const tailSec = resolveGhostLifetimeSeconds(params.decay);
    const density = Math.max(0, Math.min(1, params.interval ?? 0.5));
    const posQuant = resolveGhostPositionQuantization(density, w, 4);
    const angQuant = resolveGhostAngleQuantization(density);
    const currentKeys = new Set<string>();

    // Capture / refresh the current poses.
    for (const g of props) {
      if ((g.image as HTMLImageElement).complete === false) continue;
      const key =
        `${g.id}|${Math.round(g.centerX / posQuant)}|` +
        `${Math.round(g.centerY / posQuant)}|${Math.round(g.angle / angQuant)}`;
      currentKeys.add(key);
      this.knownPropIds.add(g.id);
      this.history.capture(key, () => ({ ...g }));
    }
    const capacityPerProp = resolveGhostHistoryCapacity(
      density,
      MAX_VISIBLE_GHOSTS_PER_PROP
    );
    this.history.prune(
      tailSec,
      capacityPerProp * Math.max(1, this.knownPropIds.size)
    );

    // Draw oldest-first so young, brighter ice remains readable on top.
    ctx.clearRect(0, 0, w, h);
    const prevAlpha = ctx.globalAlpha;
    const prevComposite = ctx.globalCompositeOperation;
    try {
      for (const sample of this.visibleSamples(currentKeys)) {
        const visual = resolveGhost2DAgeVisual(
          sample.ageSeconds,
          tailSec,
          intensity
        );
        if (visual.rimAlpha <= 0.012) continue;
        this.blit(ctx, sample.snapshot, visual);
      }
    } finally {
      ctx.globalAlpha = prevAlpha;
      ctx.globalCompositeOperation = prevComposite;
    }
  }

  private visibleSamples(
    currentKeys: ReadonlySet<string>
  ): GhostPoseSample<GhostProp>[] {
    const byProp = new Map<number, GhostPoseSample<GhostProp>[]>();
    for (const sample of this.history.samples(currentKeys)) {
      const samples = byProp.get(sample.snapshot.id) ?? [];
      samples.push(sample);
      byProp.set(sample.snapshot.id, samples);
    }

    const selected: GhostPoseSample<GhostProp>[] = [];
    for (const samples of byProp.values()) {
      selected.push(
        ...selectGhostAgeStratifiedSamples(samples, MAX_VISIBLE_GHOSTS_PER_PROP)
      );
    }
    return selected.sort((a, b) => b.ageSeconds - a.ageSeconds);
  }

  private blit(
    ctx: CanvasRenderingContext2D,
    g: GhostProp,
    visual: ReturnType<typeof resolveGhost2DAgeVisual>
  ): void {
    const treatment = this.resolveTreatment(g);
    ctx.save();
    ctx.translate(g.centerX, g.centerY);
    ctx.rotate(g.angle);
    if (g.flipped) ctx.scale(-1, 1);

    if (!treatment) {
      ctx.globalAlpha = Math.max(visual.bodyAlpha, visual.rimAlpha * 0.72);
      ctx.drawImage(g.image, -g.width / 2, -g.height / 2, g.width, g.height);
      ctx.restore();
      return;
    }

    // The body is the real sprite, faded: same bark, tape and colors as the
    // live prop. Frost and rim sit on top as light, never as a recolor.
    const x = -treatment.width / 2;
    const y = -treatment.height / 2;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = visual.bodyAlpha;
    ctx.drawImage(g.image, -g.width / 2, -g.height / 2, g.width, g.height);
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = visual.frostAlpha;
    ctx.drawImage(treatment.frost, x, y);
    ctx.globalAlpha = visual.rimAlpha;
    ctx.drawImage(treatment.rim, x, y);
    ctx.restore();
  }

  private resolveTreatment(g: GhostProp): GhostSpriteTreatment | null {
    const imageKey = g.image as object;
    let treatments = this.treatmentCache.get(imageKey);
    if (!treatments) {
      treatments = new Map();
      this.treatmentCache.set(imageKey, treatments);
    }

    const width = Math.max(1, Math.ceil(g.width));
    const height = Math.max(1, Math.ceil(g.height));
    const key = `${width}x${height}`;
    if (treatments.has(key)) return treatments.get(key) ?? null;
    if (treatments.size >= MAX_TREATMENTS_PER_SPRITE) treatments.clear();

    const treatment = this.buildTreatment(g.image, width, height);
    treatments.set(key, treatment);
    return treatment;
  }

  private buildTreatment(
    image: CanvasImageSource,
    spriteWidth: number,
    spriteHeight: number
  ): GhostSpriteTreatment | null {
    const rimRadius = Math.max(
      2,
      Math.min(9, Math.round(Math.min(spriteWidth, spriteHeight) * 0.07))
    );
    const padding = rimRadius + 2;
    const width = spriteWidth + padding * 2;
    const height = spriteHeight + padding * 2;
    const rim = this.createTreatmentCanvas(width, height);
    const frost = this.createTreatmentCanvas(width, height);
    if (!rim || !frost) return null;

    this.buildRim(
      rim.ctx,
      image,
      padding,
      spriteWidth,
      spriteHeight,
      rimRadius,
      width,
      height
    );
    this.buildFrost(
      frost.ctx,
      image,
      padding,
      spriteWidth,
      spriteHeight,
      width,
      height
    );
    return {
      rim: rim.canvas,
      frost: frost.canvas,
      width,
      height,
    };
  }

  private createTreatmentCanvas(
    width: number,
    height: number
  ): TreatmentCanvas | null {
    try {
      const canvas: TreatmentSurface =
        typeof OffscreenCanvas !== "undefined"
          ? new OffscreenCanvas(width, height)
          : document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
      return ctx ? { canvas, ctx } : null;
    } catch {
      return null;
    }
  }

  private buildRim(
    ctx: CanvasRenderingContext2D,
    image: CanvasImageSource,
    padding: number,
    spriteWidth: number,
    spriteHeight: number,
    radius: number,
    width: number,
    height: number
  ): void {
    // Spread the sprite outward in every direction, then cut the sprite itself
    // back out. What remains is a ring carrying the colors at the prop's edge.
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
    const directions = 16;
    for (let index = 0; index < directions; index += 1) {
      const angle = (index / directions) * Math.PI * 2;
      ctx.drawImage(
        image,
        padding + Math.cos(angle) * radius,
        padding + Math.sin(angle) * radius,
        spriteWidth,
        spriteHeight
      );
    }
    ctx.globalCompositeOperation = "destination-out";
    ctx.drawImage(image, padding, padding, spriteWidth, spriteHeight);
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = GHOST_RIM_FROST_MIX;
    ctx.fillStyle = GHOST_FROST_WHITE;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
  }

  private buildFrost(
    ctx: CanvasRenderingContext2D,
    image: CanvasImageSource,
    padding: number,
    spriteWidth: number,
    spriteHeight: number,
    width: number,
    height: number
  ): void {
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = GHOST_FROST_WHITE;
    const shardCount = Math.max(
      18,
      Math.min(72, Math.round((spriteWidth * spriteHeight) / 160))
    );
    for (let index = 0; index < shardCount; index += 1) {
      const x = padding + ((index * 37 + index * index * 11) % spriteWidth);
      const y = padding + ((index * 53 + index * index * 7) % spriteHeight);
      const shardWidth = 1 + (index % 3);
      const shardHeight = 2 + ((index * 5) % 7);
      ctx.fillRect(x, y, shardWidth, shardHeight);
    }
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(image, padding, padding, spriteWidth, spriteHeight);
  }

  /** Reset all cross-frame state. Called on dispose + canvas clear. */
  reset(): void {
    this.history.reset();
    this.knownPropIds.clear();
    this.treatmentCache = new WeakMap();
  }

  dispose(): void {
    this.reset();
  }
}
