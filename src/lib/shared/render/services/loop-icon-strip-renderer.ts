import type { LOOPComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import {
  renderLoopIconStrip,
  type LOOPComponentId,
  type LoopReflectionAxis,
} from "@tka/render-composition";

function toComponentId(c: LOOPComponent): LOOPComponentId {
  return c as unknown as LOOPComponentId;
}

export function renderLOOPIconStrip(
  ctx: CanvasRenderingContext2D,
  components: Set<LOOPComponent>,
  x: number,
  y: number,
  iconSize: number,
  darkMode: boolean,
  reflectionAxis?: LoopReflectionAxis
): number {
  const ids = new Set<LOOPComponentId>();
  for (const c of components) ids.add(toComponentId(c));

  const showFreeform = components.size === 0;
  const result = renderLoopIconStrip(
    ctx,
    ids,
    x,
    y,
    iconSize,
    darkMode,
    showFreeform,
    undefined,
    undefined,
    undefined,
    reflectionAxis
  );
  return result.totalWidth;
}
