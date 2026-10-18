import type { Petals2DParams } from "../translators/canvas2d-types";
import type { PetalPalette } from "../domain/petal-palettes";
import {
  drawPetalEmberRim,
  drawPetalSilhouette,
} from "../domain/petal-palettes";
import type { EmitterTip } from "./emitter-tip";
import { PetalFlightSim, type FlyingPetal } from "./petal-flight-sim";
import { petalBodyToWorld } from "../domain/petal-aero";
import {
  PETAL_SPRITE_HALF,
  PETAL_SPRITE_SIDE,
  PetalSpriteCache,
} from "./petal-sprite-cache";

const FADE_IN_SECONDS = 0.06;
/** The last third of a petal's life fades, so it thins out as it falls away. */
const FADE_OUT_FRACTION = 0.35;
/** Seconds an ash petal's rim glows, shorter than the ash itself. */
const EMBER_SECONDS = 1.35;
/** Narrowest a petal gets edge-on, as a share of its width, so it stays a
 *  visible sliver instead of vanishing mid-turn. */
const EDGE_ON_WIDTH = 0.14;
/** The stage light: from the upper left, in front of the stage. */
const LIGHT_X = -0.45;
const LIGHT_Y = -0.6;
const LIGHT_Z = 0.66;
const axis = { x: 0, y: 0, z: 0 };

/**
 * Canvas2D petals. `PetalFlightSim` sheds the petals along the props' path and
 * flies them; this draws each one as its face looks from the front of the
 * stage: the petal's across and tip axes, seen from the front, become the
 * drawing's axes, so a tilted petal foreshortens and a turned one shows its
 * back mirrored and paler. The light it catches blends a lit and a shaded
 * painting of it.
 *
 * Ember rim (ash palette only): petals flagged at birth carry a short orange
 * glow along their edge that cools while the ash keeps falling.
 */
export class Petals2DRenderer {
  private readonly sim: PetalFlightSim;
  private readonly sprites = new PetalSpriteCache();

  constructor(random: () => number = Math.random) {
    this.sim = new PetalFlightSim(random);
  }

  render(
    ctx: CanvasRenderingContext2D,
    params: Petals2DParams,
    emitters: EmitterTip[],
    dt: number,
    scale: number = 1
  ): void {
    this.sim.step(params, emitters, dt, scale);
    if (this.sim.petals.length === 0) return;

    const prevAlpha = ctx.globalAlpha;
    const prevComposite = ctx.globalCompositeOperation;
    const savedTransform = ctx.getTransform();
    try {
      for (const p of this.sim.petals) {
        this.drawPetal(ctx, p, params.resolvedPalette);
      }
    } finally {
      ctx.setTransform(savedTransform);
      ctx.globalAlpha = prevAlpha;
      ctx.globalCompositeOperation = prevComposite;
    }
  }

  private drawPetal(
    ctx: CanvasRenderingContext2D,
    p: FlyingPetal,
    palette: PetalPalette
  ): void {
    const life = p.age / p.maxAge;
    const fadeIn = p.age < FADE_IN_SECONDS ? p.age / FADE_IN_SECONDS : 1;
    const fadeOut =
      life > 1 - FADE_OUT_FRACTION ? (1 - life) / FADE_OUT_FRACTION : 1;
    const alpha = fadeIn * fadeOut * p.opacity;
    if (alpha <= 0.02) return;
    // A fading petal also shrinks a little, so it reads as falling away into
    // the dark rather than turning grey where it hangs.
    const size = p.size * (0.7 + 0.3 * fadeOut);

    // The petal's axes seen from the front, in canvas axes (y down): across
    // draws along the sprite's x, and the tip along the sprite's -y.
    petalBodyToWorld(p.body, 1, 0, 0, axis);
    let acrossX = axis.x;
    let acrossY = -axis.y;
    petalBodyToWorld(p.body, 0, 1, 0, axis);
    const downX = -axis.x;
    const downY = axis.y;
    petalBodyToWorld(p.body, 0, 0, 1, axis);
    const front = axis.z >= 0;
    // Edge-on it stays a visible sliver instead of vanishing mid-turn.
    const length = Math.hypot(downX, downY);
    if (length > 1e-3) {
      const perpX = downY / length;
      const perpY = -downX / length;
      const shown = (acrossX * perpX + acrossY * perpY) * (front ? 1 : -1);
      if (shown < EDGE_ON_WIDTH) {
        const widen = (EDGE_ON_WIDTH - shown) * (front ? 1 : -1);
        acrossX += perpX * widen;
        acrossY += perpY * widen;
      }
    }
    // The face's normal, turned toward the viewer, against the stage light.
    const facing =
      (front ? 1 : -1) *
      (axis.x * LIGHT_X - axis.y * LIGHT_Y + axis.z * LIGHT_Z);
    const light = facing > 0 ? 0.25 + facing * 0.75 : 0.25 - facing * 0.15;

    const set = this.sprites.get(p.shape, p.tint);
    ctx.globalCompositeOperation = "source-over";
    if (!set) {
      ctx.setTransform(acrossX, acrossY, downX, downY, p.x, p.y);
      ctx.globalAlpha = alpha * (0.7 + light * 0.3);
      drawPetalSilhouette(ctx, p.shape, size, p.tint);
    } else {
      const k = size / PETAL_SPRITE_HALF;
      ctx.setTransform(
        acrossX * k,
        acrossY * k,
        downX * k,
        downY * k,
        p.x,
        p.y
      );
      const offset = -PETAL_SPRITE_SIDE / 2;
      ctx.globalAlpha = alpha;
      ctx.drawImage(front ? set.frontShade : set.backShade, offset, offset);
      ctx.globalAlpha = alpha * light;
      ctx.drawImage(front ? set.frontLit : set.backLit, offset, offset);
    }

    if (p.ember && palette.emberEdge && p.age < EMBER_SECONDS) {
      const emberAlpha = (1 - p.age / EMBER_SECONDS) * alpha * 1.15;
      if (emberAlpha <= 0.02) return;
      const rim = this.sprites.ember(p.shape, palette.emberEdge.color);
      if (rim) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = Math.min(1, emberAlpha);
        const offset = -PETAL_SPRITE_SIDE / 2;
        ctx.drawImage(rim, offset, offset);
      } else {
        drawPetalEmberRim(
          ctx,
          p.shape,
          size,
          palette.emberEdge.color,
          emberAlpha
        );
      }
    }
  }

  dispose(): void {
    this.sim.clear();
    this.sprites.clear();
  }
}
