import { z } from "zod";

/**
 * What a tutorial post is, in the words Austen edits it in: which takes, which
 * acts in which order, and what the captions say. The compiler turns it into
 * a free-layout preset; nothing else reads it, so the preset stays the only
 * thing the evaluator, the preview and the export know about.
 *
 * The acts follow one template - full speed with the animation, the slow
 * breakdown, the card - because that is the post he makes. Each act can be
 * switched off, pointed at either take, trimmed and slowed.
 */

const IdSchema = z.string().trim().min(1);
const SecondsSchema = z.number().finite().nonnegative();

export const POST_PLAN_MIN_SPEED = 0.25;
export const POST_PLAN_MAX_SPEED = 1;
export const POST_PLAN_MIN_ZOOM = 1;
export const POST_PLAN_MAX_ZOOM = 3;
/** A shorter act would be over before anyone could read it. */
export const POST_PLAN_MIN_ACT_SECONDS = 0.5;

export const PostTakeRefSchema = z.discriminatedUnion("kind", [
  /**
   * A file from this device. Its URL does not survive a reload, so the plan
   * keeps what identifies it and asks for the same file again.
   */
  z
    .object({
      kind: z.literal("local"),
      name: z.string().trim().min(1),
      size: z.number().int().nonnegative(),
      lastModified: z.number().finite(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("catalog"),
      videoId: IdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("linked"),
      url: z.string().trim().min(1),
    })
    .strict(),
]);

export type PostTakeRef = z.infer<typeof PostTakeRefSchema>;

export const PostTakeSchema = z
  .object({
    id: IdSchema,
    label: z.string().trim().min(1).max(120),
    ref: PostTakeRefSchema,
    /** The take's timing is stored under this key; see take-timing-store. */
    takeKey: IdSchema,
    durationSeconds: z.number().finite().positive(),
  })
  .strict();

export type PostTake = z.infer<typeof PostTakeSchema>;

/**
 * How the footage sits in its area.
 * - area: in a full-frame act, "frame" runs the take behind the strip;
 *   "above-strip" fits it into the space above, so nothing is covered.
 * - fit: cover crops to fill the area; contain shows the whole picture.
 * - zoom scales the picture about the area's centre.
 * - pan moves it across whatever overflows the area: ±0.5 reaches either
 *   edge, and with nothing overflowing it has no effect.
 */
export const PostFramingSchema = z
  .object({
    area: z.enum(["frame", "above-strip"]),
    fit: z.enum(["cover", "contain"]),
    zoom: z.number().finite().min(POST_PLAN_MIN_ZOOM).max(POST_PLAN_MAX_ZOOM),
    panX: z.number().finite().min(-0.5).max(0.5),
    panY: z.number().finite().min(-0.5).max(0.5),
  })
  .strict();

export type PostFraming = z.infer<typeof PostFramingSchema>;

export const PostStripSchema = z.enum([
  "off",
  "arrows",
  "mandala",
  "alternate",
]);
export type PostStrip = z.infer<typeof PostStripSchema>;

export const PerformanceActSchema = z
  .object({
    id: IdSchema,
    kind: z.literal("performance"),
    label: z.string().trim().min(1).max(60),
    enabled: z.boolean(),
    takeId: IdSchema.nullable(),
    /** Take media seconds. */
    sourceIn: SecondsSchema,
    /** Take media seconds; null runs to the end of the take. */
    sourceOut: SecondsSchema.nullable(),
    speed: z
      .number()
      .finite()
      .min(POST_PLAN_MIN_SPEED)
      .max(POST_PLAN_MAX_SPEED),
    /**
     * - split: the take above, the animation (trails, beat number, letter)
     *   below, for the full-speed run.
     * - full: the take fills the frame, with the strip along the bottom.
     */
    layout: z.enum(["split", "full"]),
    /** Full layout: what the strip's square shows. */
    strip: PostStripSchema,
    /** Full layout: the carousel of upcoming moves beside the square. */
    carousel: z.boolean(),
    framing: PostFramingSchema,
  })
  .strict()
  .refine((act) => act.sourceOut === null || act.sourceOut > act.sourceIn, {
    message: "An act must end after it starts",
    path: ["sourceOut"],
  });

export type PerformanceAct = z.infer<typeof PerformanceActSchema>;

export const CardActSchema = z
  .object({
    id: IdSchema,
    kind: z.literal("card"),
    label: z.string().trim().min(1).max(60),
    enabled: z.boolean(),
    seconds: z.number().finite().min(1).max(30),
  })
  .strict();

export type CardAct = z.infer<typeof CardActSchema>;

export const PostActSchema = z.union([PerformanceActSchema, CardActSchema]);
export type PostAct = z.infer<typeof PostActSchema>;

export const CaptionSchema = z
  .object({
    id: IdSchema,
    /** The act it belongs to; its times count from that act's start. */
    actId: IdSchema,
    text: z.string().max(140),
    startSeconds: SecondsSchema,
    endSeconds: SecondsSchema,
    position: z.enum(["top", "middle", "bottom"]),
    size: z.enum(["s", "m", "l"]),
  })
  .strict()
  .refine((caption) => caption.endSeconds > caption.startSeconds, {
    message: "A caption must end after it starts",
    path: ["endSeconds"],
  });

export type Caption = z.infer<typeof CaptionSchema>;

export const PostPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    sequenceId: IdSchema,
    takes: z.array(PostTakeSchema),
    acts: z.array(PostActSchema).min(1),
    captions: z.array(CaptionSchema),
    /**
     * - takes: each full-speed act carries its own take's sound; slowed acts
     *   are silent.
     * - silent: no sound, for music added in the app it is posted from.
     */
    audio: z.enum(["takes", "silent"]),
    updatedAt: z.number().finite().int().nonnegative(),
  })
  .strict()
  .superRefine((plan, context) => {
    const takes = new Set<string>();
    plan.takes.forEach((take, index) => {
      if (takes.has(take.id)) {
        context.addIssue({
          code: "custom",
          path: ["takes", index, "id"],
          message: "Duplicate take id",
        });
      }
      takes.add(take.id);
    });
    const acts = new Set<string>();
    plan.acts.forEach((act, index) => {
      if (acts.has(act.id)) {
        context.addIssue({
          code: "custom",
          path: ["acts", index, "id"],
          message: "Duplicate act id",
        });
      }
      acts.add(act.id);
      if (act.kind === "performance" && act.takeId && !takes.has(act.takeId)) {
        context.addIssue({
          code: "custom",
          path: ["acts", index, "takeId"],
          message: "An act names a take the post does not have",
        });
      }
    });
    plan.captions.forEach((caption, index) => {
      if (!acts.has(caption.actId)) {
        context.addIssue({
          code: "custom",
          path: ["captions", index, "actId"],
          message: "A caption names an act the post does not have",
        });
      }
    });
  });

export type PostPlan = z.infer<typeof PostPlanSchema>;

export const POST_ACT = {
  fullSpeed: "full-speed",
  breakdown: "breakdown",
  card: "card",
} as const;

export const DEFAULT_FRAMING: PostFraming = {
  area: "frame",
  fit: "cover",
  zoom: 1,
  panX: 0,
  panY: 0,
};

/** Half speed: slow enough to follow, quick enough not to drag. */
export const DEFAULT_BREAKDOWN_SPEED = 0.5;

/**
 * Austen's post: the full-speed take split with the animation, the slow
 * take full frame with the strip, then the card. With one take the
 * breakdown replays it at half speed; a second, slowly performed take
 * replaces that when added.
 */
export function createDefaultPostPlan(input: {
  sequenceId: string;
  now: number;
}): PostPlan {
  return {
    schemaVersion: 1,
    sequenceId: input.sequenceId,
    takes: [],
    acts: [
      {
        id: POST_ACT.fullSpeed,
        kind: "performance",
        label: "Full speed",
        enabled: true,
        takeId: null,
        sourceIn: 0,
        sourceOut: null,
        speed: 1,
        layout: "split",
        strip: "off",
        carousel: false,
        framing: DEFAULT_FRAMING,
      },
      {
        id: POST_ACT.breakdown,
        kind: "performance",
        label: "Breakdown",
        enabled: true,
        takeId: null,
        sourceIn: 0,
        sourceOut: null,
        speed: DEFAULT_BREAKDOWN_SPEED,
        layout: "full",
        strip: "alternate",
        carousel: true,
        framing: DEFAULT_FRAMING,
      },
      {
        id: POST_ACT.card,
        kind: "card",
        label: "Card",
        enabled: true,
        seconds: 5,
      },
    ],
    captions: [],
    audio: "takes",
    updatedAt: input.now,
  };
}

function withTimestamp(plan: PostPlan, now: number): PostPlan {
  return { ...plan, updatedAt: now };
}

/**
 * Adds a take and points the acts at it the way the template expects: the
 * first take drives both performance acts; a second one takes over the
 * breakdown at full speed, since it was performed slowly already. A take
 * already in the plan is refreshed in place (a local file picked again).
 */
export function addTakeToPlan(
  plan: PostPlan,
  take: PostTake,
  now: number
): PostPlan {
  const existing = plan.takes.findIndex(
    (candidate) => candidate.takeKey === take.takeKey
  );
  if (existing >= 0) {
    const takes = [...plan.takes];
    takes[existing] = { ...take, id: plan.takes[existing]!.id };
    return withTimestamp({ ...plan, takes }, now);
  }
  const takes = [...plan.takes, take];
  const acts = plan.acts.map((act): PostAct => {
    if (act.kind !== "performance") return act;
    if (plan.takes.length === 0) {
      return { ...act, takeId: take.id, sourceIn: 0, sourceOut: null };
    }
    if (plan.takes.length === 1 && act.id === POST_ACT.breakdown) {
      return {
        ...act,
        takeId: take.id,
        sourceIn: 0,
        sourceOut: null,
        speed: 1,
      };
    }
    return act;
  });
  return withTimestamp({ ...plan, takes, acts }, now);
}

/**
 * Removes a take. Acts that used it fall back to the first take left, from
 * its start; with none left they have no take and are skipped.
 */
export function removeTakeFromPlan(
  plan: PostPlan,
  takeId: string,
  now: number
): PostPlan {
  const takes = plan.takes.filter((take) => take.id !== takeId);
  const fallback = takes[0]?.id ?? null;
  const acts = plan.acts.map((act): PostAct => {
    if (act.kind !== "performance" || act.takeId !== takeId) return act;
    return { ...act, takeId: fallback, sourceIn: 0, sourceOut: null };
  });
  return withTimestamp({ ...plan, takes, acts }, now);
}

export function updateAct(
  plan: PostPlan,
  actId: string,
  edit: (act: PostAct) => PostAct,
  now: number
): PostPlan {
  let changed = false;
  const acts = plan.acts.map((act) => {
    if (act.id !== actId) return act;
    const next = edit(act);
    if (next !== act) changed = true;
    return next;
  });
  if (!changed) return plan;
  const parsed = PostPlanSchema.safeParse({ ...plan, acts });
  return parsed.success ? withTimestamp(parsed.data, now) : plan;
}

/** Any other edit to the plan, kept only when the result is valid. */
export function editPlan(
  plan: PostPlan,
  edit: (plan: PostPlan) => PostPlan,
  now: number
): PostPlan {
  const next = edit(plan);
  if (next === plan) return plan;
  const parsed = PostPlanSchema.safeParse(next);
  return parsed.success ? withTimestamp(parsed.data, now) : plan;
}

export function updateCaption(
  plan: PostPlan,
  captionId: string,
  edit: (caption: Caption) => Caption,
  now: number
): PostPlan {
  const captions = plan.captions.map((caption) =>
    caption.id === captionId ? edit(caption) : caption
  );
  const parsed = PostPlanSchema.safeParse({ ...plan, captions });
  return parsed.success ? withTimestamp(parsed.data, now) : plan;
}

export function addCaption(
  plan: PostPlan,
  caption: Caption,
  now: number
): PostPlan {
  const parsed = PostPlanSchema.safeParse({
    ...plan,
    captions: [...plan.captions, caption],
  });
  return parsed.success ? withTimestamp(parsed.data, now) : plan;
}

export function removeCaption(
  plan: PostPlan,
  captionId: string,
  now: number
): PostPlan {
  return withTimestamp(
    {
      ...plan,
      captions: plan.captions.filter((caption) => caption.id !== captionId),
    },
    now
  );
}

/** Austen's own captions from the DCK video, offered as one-tap starters. */
export const CAPTION_STARTERS = [
  "Practice with me!",
  "Watch hands closely",
  "Go slower to learn faster",
  "Now repeat 100x",
] as const;
