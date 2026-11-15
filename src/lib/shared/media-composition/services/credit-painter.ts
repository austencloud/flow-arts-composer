import type {
  PaintFrame,
  PaintRect,
  PostStudioLayerPainter,
} from "@austencloud/video-editor/render";
import {
  CREDIT_GRADIENT_FROM,
  CREDIT_GRADIENT_TO,
  CREDIT_LEAD_ALPHA,
  CREDIT_LEAD_FONT,
  CREDIT_LEAD_PX,
  CREDIT_WORDMARK,
  CREDIT_WORDMARK_PX,
  CREDIT_WORDMARK_TRACKING,
  creditGradientLine,
  creditLayout,
  type CreditInk,
  type CreditPlan,
} from "#lib/shared/media-composition/domain/credit.js";
import {
  BRAND_SERIF,
  BRAND_SERIF_FONT,
  loadBrandSerif,
} from "#lib/shared/media-composition/services/brand-serif.js";

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const leadFont = (px: number) => CREDIT_LEAD_FONT.replace("{px}", String(px));
const wordmarkFont = (px: number) => `${BRAND_SERIF_FONT} ${px}px ${BRAND_SERIF}`;

/** A line's ink at the font the context has; trailing tracking taken off. */
function inkOf(context: Context, text: string, tracking: number): CreditInk {
  const metrics = context.measureText(text);
  return {
    width: Math.max(0, metrics.width - tracking),
    ascent: metrics.actualBoundingBoxAscent,
    descent: metrics.actualBoundingBoxDescent,
  };
}

/**
 * Paints a credit clip: the small line in grey sans, the wordmark in the
 * brand serif with its gradient, fitted to the clip's box. No shadow or
 * outline: the credit sits on the end screen's black. The picture reads
 * nothing but the plan, so a paused frame is the exported frame.
 */
class CreditPainter implements PostStudioLayerPainter {
  constructor(private readonly getPlan: () => CreditPlan | null) {}

  async prepare(): Promise<void> {
    await loadBrandSerif();
  }

  paint(context: Context, rect: PaintRect, frame: PaintFrame): void {
    const plan = this.getPlan();
    if (!plan || rect.width <= 0 || rect.height <= 0) return;
    const seconds = frame.projectTimeSeconds;
    if (seconds !== undefined && (seconds < plan.start || seconds > plan.end))
      return;

    context.save();
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    const tracking = CREDIT_WORDMARK_PX * CREDIT_WORDMARK_TRACKING;
    context.font = wordmarkFont(CREDIT_WORDMARK_PX);
    context.letterSpacing = `${tracking}px`;
    const wordmark = inkOf(context, CREDIT_WORDMARK, tracking);
    context.letterSpacing = "0px";
    let lead: CreditInk | null = null;
    if (plan.lead) {
      context.font = leadFont(CREDIT_LEAD_PX);
      lead = inkOf(context, plan.lead, 0);
    }
    const layout = creditLayout(rect, wordmark, lead);
    if (!(layout.scale > 0)) {
      context.restore();
      return;
    }

    if (lead && layout.leadBaseline !== null) {
      context.save();
      context.globalAlpha *= CREDIT_LEAD_ALPHA;
      context.font = leadFont(CREDIT_LEAD_PX * layout.scale);
      context.fillStyle = "#ffffff";
      context.fillText(
        plan.lead,
        layout.centerX - (lead.width * layout.scale) / 2,
        layout.leadBaseline
      );
      context.restore();
    }

    const line = creditGradientLine(layout);
    const gradient = context.createLinearGradient(
      line.x0,
      line.y0,
      line.x1,
      line.y1
    );
    gradient.addColorStop(0, CREDIT_GRADIENT_FROM);
    gradient.addColorStop(1, CREDIT_GRADIENT_TO);
    context.font = wordmarkFont(CREDIT_WORDMARK_PX * layout.scale);
    context.letterSpacing = `${tracking * layout.scale}px`;
    context.fillStyle = gradient;
    context.fillText(CREDIT_WORDMARK, layout.wordmarkLeft, layout.wordmarkBaseline);
    context.restore();
  }
}

export function createCreditPainter(
  getPlan: () => CreditPlan | null
): PostStudioLayerPainter {
  return new CreditPainter(getPlan);
}
