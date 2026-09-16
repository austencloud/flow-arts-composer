/**
 * invite — "you know you can just take this from me, right?"
 *
 * The presenter demonstrated the app well and never once told anyone they were
 * allowed to touch it. The only affordance was the parked dot, which appears
 * AFTER someone has already grabbed the wheel — no use at all to the person
 * standing back wondering whether the laptop is a video.
 *
 * Austen's ask (2026-08-05): "I want them to know that they can take over at
 * any time, and I want them to know that they can press buttons on the screen."
 *
 * The answer is not a banner. A strip of chrome reading "Live demo — touch
 * anything" sits there for four hours saying the same thing and stops being
 * read within one. An aside from something visibly busy gets read every time,
 * because it arrives as a thought rather than as signage. So the invitation is
 * an intention like any other, and it obeys the same scoring.
 *
 * Three things keep it an invitation instead of a pitch:
 *
 * 1. Appeal 0.10 — it only ever wins when nothing more interesting does.
 * 2. Budgeted and spaced (below), so it is an occasional aside.
 * 3. `calm()` — never over a payoff, an overlay, or a picker. Interrupting the
 *    good bit to advertise is the opposite of drawing someone in.
 *
 * `point-it-out` is the one that actually works on people: it deliberately
 * leaves a specific control hovered and UNPRESSED. An unfinished action is a
 * better invitation than any sentence, because it hands a stranger something
 * concrete to do.
 */

import { safe, type GhostKind } from "../domain/annotations";
import type { GhostContext, Intention } from "../domain/intention";
import { has, labelOf, oneOf, pickOf } from "./helpers";

/** Invitations per session. A four-hour run should offer, not nag. */
const MAX_INVITES = 14;
/** Minimum gap between them, measured on the trail's own clock. */
const MIN_GAP_MS = 90_000;
/**
 * Decisions the ghost must have made before the first invitation. Someone has
 * to watch it DO something before "you can do this too" means anything — an
 * offer in the first five seconds is a popup.
 */
const WARMUP_DECISIONS = 5;

/**
 * The world is calm enough to say something to the room: nothing playing,
 * nothing modal, nothing mid-choice, and no module running its own show.
 */
/*
 * NOT gated on `pickerOpen`. That sensor does not mean "a modal chooser is up"
 * — it is literally `available.option > 0 || available["start-placement"] > 0`,
 * which is TRUE for the entire time the construct screen is on display. Gating
 * on it meant the invitation could never once fire on the busiest, most-watched
 * screen in the app, which is the only screen a passerby is likely to be
 * looking at. The whole family was dead on arrival and the simulation is what
 * showed it: one invitation in 400 decisions.
 */
function calm(ctx: GhostContext): boolean {
  return (
    !ctx.isPlaying &&
    !ctx.viewerOpen &&
    !ctx.presenting &&
    !has(ctx, "dismiss") &&
    !has(ctx, "confirm")
  );
}

function budgetOk(ctx: GhostContext): boolean {
  if (ctx.budgets.invites >= MAX_INVITES) return false;
  if (ctx.trail.entries().length < WARMUP_DECISIONS) return false;
  const since = ctx.trail.lastAt() - ctx.budgets.lastInviteAt;
  return ctx.budgets.lastInviteAt === 0 || since >= MIN_GAP_MS;
}

const canInvite = (ctx: GhostContext) => calm(ctx) && budgetOk(ctx);

function spend(ctx: GhostContext): void {
  ctx.budgets.invites += 1;
  ctx.budgets.lastInviteAt = ctx.trail.lastAt();
}

/**
 * Something worth pointing at. Ordered by how much a stranger gains from
 * pressing it themselves rather than watching it get pressed — an effect or a
 * prop changes the picture instantly, a nav button just moves the furniture.
 */
const POINTABLE: GhostKind[] = [
  "effect",
  "prop",
  "option",
  "play",
  "turn",
  "start-placement",
  "curio",
];

function pointable(ctx: GhostContext): HTMLElement | null {
  for (const kind of POINTABLE) {
    if (!has(ctx, kind)) continue;
    const el = pickOf(ctx, kind);
    if (el) return el;
  }
  return null;
}

export const INVITE_INTENTIONS: Intention[] = [
  {
    id: "offer-the-wheel",
    category: "invite",
    mood: "curious",
    thought: (ctx) =>
      oneOf(ctx, [
        "you can take this from me whenever you want",
        "this is yours if you want it — just touch something",
        "I'm only playing with it until someone else does",
      ]),
    can: canInvite,
    appeal: () => 0.1,
    perform: async (g, ctx) => {
      spend(ctx);
      // Come off whatever it was hovering and sit in the open. The offer is to
      // the room, not about the control under the fingertip.
      g.setHover(null);
      await g.dwell(g.jitter(2600, 1400));
      return true;
    },
  },

  {
    id: "point-it-out",
    category: "invite",
    mood: "curious",
    target: (ctx) => pointable(ctx),
    thought: (ctx, target) =>
      target
        ? oneOf(ctx, [
            `try ${labelOf(target)} — go on, I'll wait`,
            `${labelOf(target)}. that one's yours`,
            `press ${labelOf(target)}, see what it does`,
          ])
        : "press something, see what it does",
    can: (ctx) => canInvite(ctx) && POINTABLE.some((kind) => has(ctx, kind)),
    appeal: () => 0.11,
    perform: async (g, ctx, target) => {
      if (!target) return false;
      spend(ctx);
      // Hover it and LEAVE IT. The whole point is the unpressed button: the
      // ghost has visibly stopped short of doing the thing, and the only way
      // that resolves is if a person finishes it. Never call moveAndPress here.
      await g.hoverOn(target, g.jitter(3200, 1800));
      return true;
    },
  },

  {
    id: "everything-is-live",
    category: "invite",
    mood: "still",
    thought: (ctx) =>
      oneOf(ctx, [
        "everything I press, you can press",
        "none of this is a video, by the way",
        "it's a real app. it's just me driving",
      ]),
    can: canInvite,
    appeal: () => 0.1,
    perform: async (g, ctx) => {
      spend(ctx);
      g.setHover(null);
      await g.dwell(g.jitter(2800, 1400));
      return true;
    },
  },
];
