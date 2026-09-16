/**
 * build — making a sequence, one small decision at a time.
 *
 * These lift almost directly from construct-attract-act.svelte.ts, which is
 * exactly what the spec predicted: its fiddleTurns / fiddleFilter / pageSections
 * beats were already intention-sized. What changes is that nothing here
 * sequences them — the mind does, differently every time.
 */

import { safe } from "../domain/annotations";
import type { Intention } from "../domain/intention";
import { visibleAll } from "../services/sensors";
import {
  byStage,
  has,
  oneOf,
  pickOf,
  pressKind,
  restlessness,
  stageOf,
} from "./helpers";
import { monologueFor } from "./monologue";

export const BUILD_INTENTIONS: Intention[] = [
  {
    id: "pick-start",
    category: "build",
    changesPresentation: true,
    target: (ctx) => pickOf(ctx, "start-placement"),
    thought: (ctx, target) =>
      monologueFor("start-placement", target, ctx, "Let's start somewhere."),
    can: (ctx) => !ctx.hasSequence && has(ctx, "start-placement"),
    appeal: () => 0.9,
    perform: async (g, ctx, target) => {
      if (!target || g.halted()) return false;
      await g.browseThenPress(target, visibleAll(safe("start-placement")));
      return true;
    },
  },

  {
    id: "add-step",
    category: "build",
    changesPresentation: true,
    target: (ctx) => pickOf(ctx, "option"),
    // Names the letter it is about to add. "What comes next?" said nothing about
    // the forty pictographs on screen; "P looks like it fits" is a decision.
    thought: (ctx, target) =>
      monologueFor(
        "option",
        target,
        ctx,
        ctx.sequenceLength > 3 ? "One more after that." : "What comes next?"
      ),
    // The one intention whose job is repetition: a person building a sequence
    // presses option after option, and the novelty penalty made that
    // impossible (see Intention.repeatable). `can` carries the ceiling that
    // novelty used to provide by accident.
    repeatable: true,
    can: (ctx) =>
      ctx.hasSequence && ctx.sequenceLength < 16 && has(ctx, "option"),
    // Strong until it is a real sequence, then tapering — a sequence that never
    // stops growing stops being a demonstration and becomes a wall. The knee is
    // deliberately past 8: eight steps is a word, three is a fragment.
    appeal: (ctx) =>
      ctx.sequenceLength < 8
        ? 0.9
        : Math.max(0.12, 0.9 - (ctx.sequenceLength - 8) * 0.1),
    perform: async (g, ctx, target) => {
      if (!target || g.halted()) return false;
      await g.browseThenPress(target, visibleAll(safe("option")));
      return true;
    },
  },

  /**
   * The All / Continuous filter — the worked example of the understanding
   * mechanism (spec: 2026-08-06-ghost-understanding-design.md).
   *
   * The domain fact this whole arc turns on:
   *
   *   getReversalCount(option, sequence)
   *
   * Continuity is NOT a property of a letter. It is a property of the
   * transition from where the sequence currently is — the same letter is
   * continuous in one sequence and a reversal in another. That is what makes
   * the toggle confusing (the surviving set changes between steps, which is
   * inexplicable if you think it filters letters) and it is exactly what the
   * realization consists of.
   *
   * So the arc is:
   *
   *   curious    the motive comes from PLAYBACK, not from the picker. Nobody
   *              constrains their option space for fun; they do it after
   *              something felt lumpy and they went looking for why.
   *   confused   forty options became six. "Did I break it?" is the honest
   *              first reaction, and the ghost only says it if the count
   *              really collapsed.
   *   understood met the collapse a second time and the survivors had CHANGED.
   *              Now it is a recommendation, not a restriction.
   *
   * Past `understood`, going back to All means the opposite of what it meant at
   * `confused`: not a panicked retreat but "I want that letter and I'll take
   * the reversal."
   */
  {
    id: "filter-continuous",
    category: "build",
    concept: "continuity",
    thought: (ctx) =>
      byStage(
        ctx,
        "continuity",
        {
          // First encounter. It does not know what the control is — it knows
          // something in what it just watched felt wrong and it is hunting.
          unaware: [
            "Something in that felt lumpy.",
            "One of those didn't sit right. Which one?",
            "Is there a reason that snagged?",
          ],
          confused: [
            "Let's try that filter again.",
            "What is this actually doing to the list?",
          ],
          understood: [
            "Continuous. I want it to keep flowing.",
            "Only what carries on from here, then.",
            "Show me the ones that won't fight the last step.",
          ],
        },
        "What actually follows this?"
      ),
    // Never before there is something to be dissatisfied WITH. A filter pressed
    // by someone who has not watched their sequence is someone reading the UI,
    // not someone using it.
    can: (ctx) =>
      has(ctx, "option-filter") &&
      ctx.sequenceLength >= 3 &&
      ((ctx.performed.get("play-it") ?? 0) > 0 || ctx.available.option > 20),
    appeal: (ctx) =>
      stageOf(ctx, "continuity") === "understood" ? 0.45 : 0.55,
    mood: "unsure",
    /**
     * The evidence. A belief moves only on a measured collapse, and the jump to
     * `understood` additionally requires that the SURVIVING SET differ from
     * last time — the one observation that proves the filter is about
     * transitions rather than about letters, and the one no single before/after
     * can show on its own. That is what `conceptNotes` is for.
     */
    learn: (before, after, ctx) => {
      const collapsed = after.available.option < before.available.option * 0.6;
      if (!collapsed) return null;

      const survivors = String(after.available.option);
      const lastTime = ctx.conceptNotes.get("continuity");
      ctx.conceptNotes.set("continuity", survivors);

      const stage = stageOf(ctx, "continuity");
      if (stage === "confused" && lastTime && lastTime !== survivors) {
        return "understood";
      }
      return stage === "understood" ? "understood" : "confused";
    },
    reaction: (ctx) =>
      stageOf(ctx, "continuity") === "understood"
        ? oneOf(ctx, [
            "Oh — it's not the letters. It's what follows THIS one.",
            "It changes every step. Of course it does.",
          ])
        : stageOf(ctx, "continuity") === "confused"
          ? oneOf(ctx, ["…oh. That's not many.", "Where did the rest go?"])
          : null,
    perform: async (g, ctx) => {
      if (!(await pressKind(g, ctx, "option-filter"))) return false;
      await g.sleep(g.jitter(600, 500));
      if (g.halted()) return true;
      // The retreat a person makes from a filter that filtered EVERYTHING out.
      // Still correct at every stage: understanding the control does not make
      // an empty list useful.
      const left = await g.waitFor(safe("option"), 2500);
      if (!left.length && !g.halted()) {
        await pressKind(g, ctx, "option-filter", 800);
        await g.sleep(g.jitter(400, 300));
      }
      return true;
    },
  },

  {
    id: "fiddle-turns",
    category: "build",
    changesPresentation: true,
    thought: (ctx) =>
      oneOf(ctx, [
        "What if this hand turned instead?",
        "Let's put a turn on it.",
        "What happens if I add rotation here?",
      ]),
    // A turn decorates a sequence that already exists. Firing it at one or two
    // steps is the "sets a turn value and then never applies an option" tell
    // Austen watched live — it reads as fiddling with settings instead of
    // making something. Decoration waits until there is something to decorate.
    can: (ctx) => ctx.sequenceLength >= 4 && has(ctx, "turn"),
    appeal: () => 0.4,
    perform: async (g, ctx) => {
      if (!(await pressKind(g, ctx, "turn"))) return false;
      await g.sleep(g.jitter(500, 500));
      // Sometimes the other hand too — the grid re-derives either way.
      if (ctx.rng.next() < 0.35 && !g.halted()) {
        await pressKind(g, ctx, "turn", 1500);
      }
      return true;
    },
  },

  {
    id: "clear-and-restart",
    category: "reset",
    changesPresentation: true,
    thought: (ctx) =>
      oneOf(ctx, [
        "Let's try something completely different.",
        "Scrap it. Start again.",
        "I want to build something else.",
      ]),
    // Only once it has actually FINISHED something. At three steps this was
    // outscoring `add-step` and throwing away a fragment — the ghost binned
    // every sequence it started at exactly three, seven times in a 200-decision
    // run, which is why nobody ever saw it make anything.
    /*
     * The payoff guard, and it is the most important clause in this file.
     *
     * A 289-decision simulation extended five sequences — the biggest single
     * press in the app, a fragment becoming a finished loop — and binned ALL
     * FIVE within 4 to 22 seconds. Restlessness pins at 1.0 after 90s in one
     * module, so clear sat at a permanent 0.55 while add-step tapered off past
     * eight steps, and clearing simply won every time the sequence got good.
     *
     * Nobody finishes a thing and immediately throws it away. `lastPayoffAt` is
     * stamped by the mind whenever a savor-bearing intention lands, so for the
     * following minute the ghost lives with what it just made.
     */
    can: (ctx) =>
      ctx.sequenceLength >= 6 &&
      has(ctx, "clear") &&
      ctx.trail.lastAt() - ctx.budgets.lastPayoffAt > 60_000,
    // Boredom, not length, is the motive. A long sequence is a reason to keep
    // playing with it, not a reason to bin it.
    appeal: (ctx) => Math.min(0.6, restlessness(ctx) * 0.55),
    mood: "bored",
    perform: async (g, ctx) => {
      if (!(await pressKind(g, ctx, "clear"))) return false;
      // Clearing raises a confirmation unless the operator turned it off, and a
      // modal the ghost walks away from is the worst state in the system: the
      // backdrop makes every other control fail the hit-test, so the whole bag
      // goes quiet and the tour is over until a human dismisses it. Going
      // through with the dialog is part of the intention, not a follow-up.
      const confirms = await g.waitFor(safe("confirm"), 1200);
      if (!confirms.length || g.halted()) return true;
      await g.moveAndPress(confirms[0]!);
      await g.sleep(g.jitter(700, 500));
      return true;
    },
  },
];
