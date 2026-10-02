import {
  POST_BACKGROUNDS,
  POST_CANVAS_RATIOS,
  type PostAnimationItem,
  type PostItem,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";
import {
  addTunnelHook,
  deleteItem,
  findTunnelHook,
  lineUpTunnelHook,
  removeTunnelHook,
  setProjectBackground,
  setProjectCanvas,
  setTunnelHookSpeed,
  trimItem,
  updateItem,
  type EditContext,
  type PostItemPatch,
} from "$lib/shared/media-composition/domain/post-project-edits";
import { EASING_PRESETS } from "$lib/shared/media-composition/domain/post-project-keyframes";
import {
  TunnelHookSchema,
  type TunnelHook,
} from "$lib/shared/media-composition/domain/tunnel-hook";

/**
 * Named edits for saved posts, in a form a command line can send. Each op is
 * one of the timeline's own pure edits, so a scripted change lays out and
 * validates exactly like the same change made by hand.
 *
 * An item is named by id, or by `hook` (the animation with the opening), `animations`
 * (every live animation) or `all`.
 */

type Speed = NonNullable<TunnelHook["speed"]>;

export type PostProjectOp =
  | {
      op: "add-hook";
      seconds?: number;
      fold?: number;
      mirror?: boolean;
      speed?: string | number[];
    }
  | { op: "remove-hook" }
  | { op: "line-up-hook" }
  | { op: "hook-speed"; speed: string | number[] }
  | { op: "appearance"; item?: string; set: Record<string, unknown> }
  | { op: "item"; item: string; patch: PostItemPatch }
  | { op: "trim"; item: string; edge: "start" | "end"; seconds: number }
  | { op: "delete"; item: string }
  | { op: "canvas"; canvas: string }
  | { op: "background"; background: string };

/** The curve names the hook's speed panel offers, plus `default` for the original ease. */
export const POST_OP_SPEED_NAMES = [
  ...Object.keys(EASING_PRESETS).filter((id) => id !== "hold"),
  "default",
] as const;

function parseSpeed(value: string | number[]): Speed | null {
  if (Array.isArray(value)) return validSpeed(value);
  if (value === "default") return null;
  const preset = (EASING_PRESETS as Record<string, unknown>)[value];
  if (Array.isArray(preset)) return validSpeed(preset);
  if (/^[-\d.,\s]+$/.test(value)) return validSpeed(value.split(","));
  throw new Error(
    `Unknown speed "${value}". Use ${POST_OP_SPEED_NAMES.join(", ")} or x1,y1,x2,y2.`
  );
}

function validSpeed(raw: unknown[]): Speed {
  const numbers = raw.map(Number);
  const parsed = TunnelHookSchema.shape.speed.safeParse(numbers);
  if (!parsed.success || !parsed.data)
    throw new Error(
      "A speed curve is four numbers x1,y1,x2,y2 with x between 0 and 1 and y between -1 and 2."
    );
  return parsed.data;
}

function itemIds(project: PostProject, selector: string): string[] {
  const all: PostItem[] = project.tracks.flatMap((track) => track.items);
  if (selector === "all") return all.map((item) => item.id);
  if (selector === "animations")
    return all.filter((item) => item.kind === "animation").map((i) => i.id);
  if (selector === "hook") {
    const hook = findTunnelHook(project);
    if (!hook) throw new Error("This post has no opening tunnel.");
    return [hook.id];
  }
  if (!all.some((item) => item.id === selector))
    throw new Error(`No item "${selector}" in this post.`);
  return [selector];
}

function applyOp(
  project: PostProject,
  op: PostProjectOp,
  ctx: EditContext
): PostProject {
  switch (op.op) {
    case "add-hook": {
      const hook: TunnelHook = {
        fold: 8,
        mirror: false,
        speed: [0, 0, 0.58, 1],
      };
      if (op.fold !== undefined) {
        const parsed = TunnelHookSchema.shape.fold.safeParse(op.fold);
        if (!parsed.success) throw new Error("fold must be 2, 4 or 8.");
        hook.fold = parsed.data;
      }
      if (op.mirror !== undefined) hook.mirror = op.mirror;
      if (op.speed !== undefined) {
        const speed = parseSpeed(op.speed);
        if (speed) hook.speed = speed;
        else delete hook.speed;
      }
      const result = addTunnelHook(project, ctx, {
        ...(op.seconds !== undefined ? { seconds: op.seconds } : {}),
        hook,
      });
      if (!result)
        throw new Error(
          findTunnelHook(project)
            ? "This post already has an opening tunnel."
            : "The opening tunnel needs a live animation in the post to open."
        );
      return result.project;
    }
    case "remove-hook":
      return removeTunnelHook(project, ctx);
    case "line-up-hook": {
      if (!findTunnelHook(project))
        throw new Error("This post has no opening tunnel.");
      return lineUpTunnelHook(project, ctx);
    }
    case "hook-speed": {
      if (!findTunnelHook(project))
        throw new Error("This post has no opening tunnel.");
      return setTunnelHookSpeed(project, parseSpeed(op.speed), ctx);
    }
    case "appearance": {
      let next = project;
      for (const id of itemIds(project, op.item ?? "animations")) {
        const item = next.tracks
          .flatMap((track) => track.items)
          .find((candidate) => candidate.id === id);
        if (item?.kind !== "animation") continue;
        const merged: Record<string, unknown> = {
          ...(item.animationAppearance ?? {}),
        };
        for (const [key, value] of Object.entries(op.set)) {
          if (value === null) delete merged[key];
          else merged[key] = value;
        }
        next = updateItem(
          next,
          id,
          {
            animationAppearance:
              merged as PostAnimationItem["animationAppearance"],
          },
          ctx
        );
      }
      return next;
    }
    case "item": {
      let next = project;
      for (const id of itemIds(project, op.item))
        next = updateItem(next, id, op.patch, ctx);
      return next;
    }
    case "trim": {
      if (op.edge !== "start" && op.edge !== "end")
        throw new Error("edge must be start or end.");
      return trimItem(
        project,
        itemIds(project, op.item)[0]!,
        op.edge,
        op.seconds,
        ctx
      );
    }
    case "delete": {
      let next = project;
      for (const id of itemIds(project, op.item))
        next = deleteItem(next, id, ctx);
      return next;
    }
    case "canvas": {
      const canvas = POST_CANVAS_RATIOS.find((ratio) => ratio === op.canvas);
      if (!canvas)
        throw new Error(
          `canvas must be one of ${POST_CANVAS_RATIOS.join(", ")}.`
        );
      return setProjectCanvas(project, canvas, ctx);
    }
    case "background": {
      const background = POST_BACKGROUNDS.find(
        (value) => value === op.background
      );
      if (!background)
        throw new Error(
          `background must be one of ${POST_BACKGROUNDS.join(", ")}.`
        );
      return setProjectBackground(project, background, ctx);
    }
    default:
      throw new Error(`Unknown edit "${(op as { op?: unknown }).op}".`);
  }
}

/** Applies the ops in order. Throws, naming the failing op, before returning anything partial. */
export function applyPostProjectOps(
  project: PostProject,
  ops: PostProjectOp[],
  ctx: EditContext
): PostProject {
  if (!Array.isArray(ops) || ops.length === 0)
    throw new Error("Send at least one edit.");
  let next = project;
  ops.forEach((op, index) => {
    try {
      next = applyOp(next, op, ctx);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`Edit ${index + 1} (${op?.op}): ${message}`);
    }
  });
  return next;
}
