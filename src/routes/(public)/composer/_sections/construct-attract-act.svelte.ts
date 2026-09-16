/**
 * Construct Attract Act — drives the Construct demo while nobody is touching
 * it (spec: docs/superpowers/specs/2026-07-19-construct-attract-demo-design.md).
 *
 * A thin SCRIPT on the shared attract-ghost core (attract-ghost.svelte.ts owns
 * the motor model, press gate, and pause/park/resume lifecycle). Each cycle it
 * taps a random start position, then random valid options, by querying the
 * REAL rendered picker DOM and dispatching real clicks — so the demo can only
 * ever tap what a human could tap, and the validity engine stays the single
 * source of truth. Personality beats: browsing alternatives, glancing at the
 * workspace, fiddling turns and the All/Continuous filter, paging the letter
 * families, pressing Play, pausing to look closer, trying props, revisiting a
 * step, and pressing Build another itself.
 */

import {
  createAttractGhost,
  type AttractActHandle,
} from "$lib/shared/attract/services/attract-ghost.svelte";

const START_SEL =
  '[data-testid="start-placement-picker"] .pictograph-container[role="button"]';
// The option grid renders OptionCard ("option-card") on the wide desktop layout
// and OptionViewerSection tiles ("option-item") on the swipe/fallback layouts —
// the demo pane uses the fallback, so the act must match BOTH. (Matching only
// option-card was the bug that froze the act at step 0: waitFor timed out every
// cycle and the loop restarted from the start position forever.)
const OPTION_SEL = '[data-testid="option-card"], [data-testid="option-item"]';
// The section uses ViewSequenceButton's Play variant inside [data-demo-play].
// The act presses it after the last step so every attract cycle ends on the
// real payoff: the sequence animating.
const PLAY_SEL = "[data-demo-play] button";
// The play-phase canvas stage. The act "taps" it mid-playback to pause and
// resume — teaching the tap-to-toggle interaction by demonstrating it.
const STAGE_SEL = "[data-demo-stage]";
// Prop tiles it can get curious about mid-play (never the already-active one —
// pressing the same prop reads as a misclick, not a decision).
const PROP_SEL = ".prop-option:not(.active)";
// Turn-picker segments it can fiddle with mid-build — always a NOT-selected
// count, so every press visibly moves the glass indicator.
const TURN_BLUE_SEL = ".turns-group.blue .segment:not(.selected)";
const TURN_RED_SEL = ".turns-group.red .segment:not(.selected)";
// The option picker's section pager (embla arrows) and its All/Continuous
// filter pill — with the full letter set the picker sections into swipe
// pages, and the ghost browses across them like a person flipping cards.
const NEXT_SEL = ".picker-pane .embla__button--next";
const FILTER_SEL = ".picker-pane .filter-toggle";
// The newest workspace cell — where a just-picked step lands. The act glances
// here after some picks, and clicks one mid-play to demonstrate cell-seek.
const CELL_SEL = ".step-cell";
// The Build another button — the act presses the REAL button when it's done
// watching, so even the cycle reset is a visible decision, not a silent jump.
const AGAIN_SEL = "[data-demo-again]";

export type ConstructAttractAct = AttractActHandle;
export type { GhostState } from "$lib/shared/attract/services/attract-ghost.svelte";

export interface ConstructBoardProgress {
  phase: "pick-start" | "add-step" | "play";
  stepCount: number;
}

export function createConstructAttractAct(opts: {
  /** The demo band — coordinate space for the ghost AND the query root. */
  getRoot: () => HTMLElement | null;
  /** Clears the section's board state (steps + start position). */
  resetBoard: () => void;
  /** Reads the visitor's live build so a resumed ghost can carry it forward. */
  getBoardProgress: () => ConstructBoardProgress;
  /**
   * Toggles the player's playback (AnimationPlayer's onTogglePlaybackRef fn).
   * The real tap-to-toggle listens for POINTER events, and the act must never
   * dispatch synthetic pointerdown (that would trip the section's takeover
   * capture listener) — so the ghost performs the press visually and this
   * callback performs the toggle.
   */
  togglePlayback: () => void;
  /** Steps per cycle — matches the section's MAX_STEPS. */
  stepsPerCycle: number;
  /**
   * The focused public story teaches one path: start, add beats, play. The
   * older full presentation keeps its prop, turn, filter, and seeking beats.
   */
  focused?: boolean;
  stepMs?: number;
  doneMs?: number;
}): ConstructAttractAct {
  // Tune-by-eye pacing, one place (spec §Attract loop). Most dwells are
  // jittered inline — fixed intervals read as a metronome, not a person.
  const STEP_MS = opts.stepMs ?? 1200;
  const DONE_MS = opts.doneMs ?? 2500;

  const { core: g, run } = createAttractGhost({ getRoot: opts.getRoot });

  // A takeover aborts the current script, so resume enters through cycle()
  // again. Remember that specific exit and keep the visitor's live board;
  // ordinary automatic cycles still begin from a clean slate.
  let continueCurrentBoard = false;


  /** Watch the just-picked step land: drift over and rest BESIDE the newest
   *  workspace cell — deliberately no hover mark, because brightening the
   *  pictograph reads as trying to click it (workspace cells aren't
   *  interactive during the build). Looking, not pressing. */
  async function glanceAtWorkspace(): Promise<void> {
    const root = opts.getRoot();
    if (!root || g.halted()) return;
    const cells = [...root.querySelectorAll<HTMLElement>(CELL_SEL)].filter(
      (el) => el.offsetParent !== null
    );
    const last = cells[cells.length - 1];
    if (!last) return;
    g.setHover(null);
    const r = last.getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    await g.glideTo(
      r.right - rr.left + g.jitter(10, 12),
      r.bottom - rr.top + g.jitter(6, 10)
    );
    await g.dwell(g.jitter(650, 650));
  }

  /** Flip to another letter-family page (the sections swipe like cards) —
   *  the "what else is over here" browse a person does with a pager. */
  async function pageSections(): Promise<void> {
    const next = await g.waitFor(NEXT_SEL, 800);
    if (!next.length || g.halted()) return;
    await g.moveAndPress(next[0]!);
    await g.sleep(g.jitter(500, 400));
  }

  /** Toggle the picker's All/Continuous pill — and toggle it back if the
   *  continuous subset comes up empty for the current position, the same
   *  retreat a person makes from a filter that filtered everything out. */
  async function fiddleFilter(): Promise<void> {
    const pill = await g.waitFor(FILTER_SEL, 800);
    if (!pill.length || g.halted()) return;
    await g.moveAndPress(pill[0]!);
    await g.sleep(g.jitter(600, 500));
    if (g.halted()) return;
    const options = await g.waitFor(OPTION_SEL, 2500);
    if (!options.length && !g.halted()) {
      const back = await g.waitFor(FILTER_SEL, 800);
      if (back.length) {
        await g.moveAndPress(back[0]!);
        await g.sleep(g.jitter(400, 300));
      }
    }
  }

  /** Mid-build curiosity: change a hand's turns (sometimes both). Every press
   *  lands on a not-selected count, so the glass indicator visibly moves —
   *  and the option grid re-derives with the new turns, a real decision with
   *  real consequences. */
  async function fiddleTurns(): Promise<void> {
    const first = Math.random() < 0.5 ? TURN_BLUE_SEL : TURN_RED_SEL;
    const segs = await g.waitFor(first, 1500);
    if (!segs.length || g.halted()) return;
    await g.moveAndPress(g.pick(segs));
    await g.sleep(g.jitter(500, 500));
    if (Math.random() < 0.35 && !g.halted()) {
      const other = first === TURN_BLUE_SEL ? TURN_RED_SEL : TURN_BLUE_SEL;
      const segs2 = await g.waitFor(other, 1500);
      if (segs2.length && !g.halted()) {
        await g.moveAndPress(g.pick(segs2));
        await g.sleep(g.jitter(400, 400));
      }
    }
  }

  async function performCycle(resumingVisitorBuild: boolean): Promise<void> {
    // A fresh loop takes a breath before appearing. Clicking the parked ghost
    // is different: it should leave the corner immediately, with no dead beat.
    if (!resumingVisitorBuild) {
      await g.sleep(500);
      if (g.halted()) return;
    }

    let firstActionAfterResume = resumingVisitorBuild;

    let progress = opts.getBoardProgress();
    if (progress.phase === "pick-start") {
      const starts = await g.waitFor(START_SEL);
      if (!starts.length || g.halted()) {
        await g.sleep(1500);
        return;
      }
      // Even the start position gets a moment of choice.
      firstActionAfterResume = false;
      await g.browseAndPick(starts);
      if (g.halted()) return;
      progress = opts.getBoardProgress();
    }

    // One mid-build moment (most cycles) where it reconsiders the turns, and
    // sometimes one where it plays with the All/Continuous filter.
    const turnMoment =
      !opts.focused && Math.random() < 0.7
        ? 1 + Math.floor(Math.random() * 2)
        : -1;
    const filterMoment =
      !opts.focused && Math.random() < 0.35
        ? Math.floor(Math.random() * opts.stepsPerCycle)
        : -1;

    // Resume at the next unbuilt step. If the visitor already built past the
    // attract act's usual four-count, keep every step and head straight to Play.
    const nextStepIndex = Math.min(progress.stepCount, opts.stepsPerCycle);
    for (let i = nextStepIndex; i < opts.stepsPerCycle && !g.halted(); i++) {
      // Full step beat BEFORE querying: the option grid reloads after every
      // pick. The first resumed action skips it so the parked ghost moves as
      // soon as it is clicked; later picks keep the stale-card safety gap.
      if (firstActionAfterResume) firstActionAfterResume = false;
      else await g.sleep(STEP_MS);
      if (i === turnMoment) await fiddleTurns();
      if (i === filterMoment) await fiddleFilter();
      // Sometimes flip to another letter-family page before choosing.
      if (!opts.focused && Math.random() < 0.3) await pageSections();
      const options = await g.waitFor(OPTION_SEL);
      if (!options.length || g.halted()) return;
      await g.browseAndPick(options);
      // The focused story always follows the pictograph into the workspace.
      // The full act keeps the more occasional, curious glance.
      if (
        i < opts.stepsPerCycle - 1 &&
        (opts.focused || Math.random() < 0.35)
      ) {
        await glanceAtWorkspace();
      }
    }

    // The payoff, played with a personality: the ghost presses Play, settles
    // in to watch, pauses the canvas to look closer, resumes, gets curious
    // and flips through a prop or two mid-playback (the whole board re-skins
    // live), revisits a step it liked, watches a little more, gets bored, and
    // presses Build another itself. Every beat is a visible decision; the
    // ghost never leaves the screen, and dwell times are jittered so it reads
    // as a person, not a metronome.
    progress = opts.getBoardProgress();
    if (progress.phase !== "play") {
      if (firstActionAfterResume) firstActionAfterResume = false;
      else await g.sleep(DONE_MS / 2);
      const play = await g.waitFor(PLAY_SEL, 4000);
      if (!play.length || g.halted()) return;
      await g.moveAndPress(play[0]!);
    }

    const stage = await g.waitFor(STAGE_SEL, 4000);
    if (!stage.length || g.halted()) return;
    await g.restBeside(stage[0]!);
    await g.dwell(g.jitter(2000, 1500)); // settle in, watch

    if (g.halted()) return;
    await g.moveAndPress(stage[0]!, opts.togglePlayback); // pause — look closer
    await g.dwell(g.jitter(1200, 800)); // hold the freeze
    if (g.halted()) return;
    await g.moveAndPress(stage[0]!, opts.togglePlayback); // resume
    await g.restBeside(stage[0]!);
    await g.dwell(g.jitter(1400, 1000)); // watch a little more

    // Curiosity: browse the props, decide, try one (sometimes two).
    if (!opts.focused) {
      const props = await g.waitFor(PROP_SEL, 2000);
      if (props.length && !g.halted()) {
        const tries = Math.random() < 0.5 ? 2 : 1;
        for (let i = 0; i < tries && !g.halted(); i++) {
          const fresh = await g.waitFor(PROP_SEL, 2000);
          if (!fresh.length) break;
          await g.browseAndPick(fresh);
          await g.dwell(g.jitter(1400, 900)); // admire the new prop
        }
        if (g.halted()) return;
        await g.restBeside(stage[0]!);
        await g.dwell(g.jitter(1000, 800));
      }

      // "Wait, do that bit again": click an earlier workspace cell — the player
      // snaps to that step (the viewer-parity seek), demonstrating that the left
      // rail is a scrubber, not just a readout.
      if (Math.random() < 0.6 && !g.halted()) {
        const cells = await g.waitFor(CELL_SEL, 1500);
        if (cells.length >= 2 && !g.halted()) {
          await g.moveAndPress(g.pick(cells.slice(0, -1)));
          if (!g.halted()) {
            await g.restBeside(stage[0]!);
            await g.dwell(g.jitter(1400, 1000)); // watch the replay land
          }
        }
      }
    }

    // Bored now. Build another — pressed for real, like everything else.
    if (g.halted()) return;
    const again = await g.waitFor(AGAIN_SEL, 2000);
    if (again.length) {
      await g.moveAndPress(again[0]!);
      await g.sleep(300);
    }
  }

  async function cycle(): Promise<void> {
    const resumingVisitorBuild = continueCurrentBoard;
    continueCurrentBoard = false;
    if (!resumingVisitorBuild) opts.resetBoard();

    try {
      await performCycle(resumingVisitorBuild);
    } finally {
      // pause() is the only exit that should preserve the board. Timeouts and
      // transient DOM misses still get the established fresh-cycle recovery.
      if (g.paused) continueCurrentBoard = true;
    }
  }

  return run(cycle);
}
