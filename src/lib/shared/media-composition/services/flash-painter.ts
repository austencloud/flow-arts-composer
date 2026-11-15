import type {
  PaintFrame,
  PaintRect,
  PostStudioLayerPainter,
} from "@austencloud/video-editor/render";
import {
  flashBoxAt,
  flashFrameRect,
  flashMarks,
  flashVeilStrength,
  type FlashPlan,
} from "#lib/shared/media-composition/domain/flash.js";

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const FLASH_COLOR = "#ffffff";

/**
 * Paints a flash clip: the white veil over the whole frame, then the four
 * corner marks at the box's corners. The region is the clip's box, so the
 * painter asks for room past it (`paintOverflow`) to reach the frame's
 * edges; the preview's stage and the exported frame both stop at the frame.
 * The picture reads only post time, so a paused preview frame is the
 * exported frame.
 */
class FlashPainter implements PostStudioLayerPainter {
  constructor(private readonly getPlan: () => FlashPlan | null) {}

  async prepare(): Promise<void> {}

  paintOverflow(target: { width: number; height: number }) {
    const reach = this.getPlan()?.reach;
    if (!reach) return { top: 0, right: 0, bottom: 0, left: 0 };
    return {
      left: reach.left * target.width,
      right: reach.right * target.width,
      top: reach.top * target.height,
      bottom: reach.bottom * target.height,
    };
  }

  paint(context: Context, rect: PaintRect, frame: PaintFrame): void {
    const plan = this.getPlan();
    if (!plan || rect.width <= 0 || rect.height <= 0) return;
    const seconds =
      frame.projectTimeSeconds ??
      plan.start + frame.projectProgress * (plan.end - plan.start);
    if (seconds < plan.start || seconds > plan.end) return;
    const box = flashBoxAt(plan, seconds);
    if (!(box.width > 0) || !(box.height > 0)) return;
    const whole = flashFrameRect(rect, box);
    const veil = flashVeilStrength(
      seconds - plan.start,
      plan.strength,
      plan.fade
    );

    context.save();
    if (veil > 0) {
      context.save();
      context.globalAlpha *= veil;
      context.fillStyle = FLASH_COLOR;
      context.fillRect(whole.x, whole.y, whole.width, whole.height);
      context.restore();
    }
    if (plan.marks) {
      const { marks, lineWidth } = flashMarks(rect, whole.width);
      context.strokeStyle = FLASH_COLOR;
      context.lineWidth = lineWidth;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      for (const mark of marks) {
        context.moveTo(mark.from.x, mark.from.y);
        context.lineTo(mark.corner.x, mark.corner.y);
        context.lineTo(mark.to.x, mark.to.y);
      }
      context.stroke();
    }
    context.restore();
  }
}

export function createFlashPainter(
  getPlan: () => FlashPlan | null
): PostStudioLayerPainter {
  return new FlashPainter(getPlan);
}
