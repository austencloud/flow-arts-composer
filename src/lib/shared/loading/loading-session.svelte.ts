/**
 * One load, shown by one self-timing bar, however many surfaces show it.
 *
 * A session starts when something begins loading and owns the bar's timing:
 * its milestones, the profile it replays, and the profile it saves when the
 * load completes. Surfaces (LoadingCapsule) attach their fill element to it,
 * so a placeholder that hands over to the real view mid-load hands over the
 * bar too, at the position it showed, instead of starting a new one from
 * zero.
 *
 * Profiles are stored per kind of load under
 * `localStorage["tka-loading-profile:<key>"]`, last completed load wins, the
 * same rule the boot screen's "tka-boot-profile" follows.
 */
import { reducedMotion } from "#lib/shared/transitions/motion.js";
import {
  createSelfTimingBar,
  type SelfTimingBar,
  type SelfTimingProfile,
} from "./self-timing-bar";

export interface LoadingSessionSpec {
  /** Names this kind of load; its timing is remembered under it. */
  key: string;
  /** Milestones in arrival order. The first arrives when the session opens;
   * the last is `complete()`. */
  ranks: readonly string[];
  /** A first visit's timing: ms from the session's start per milestone. */
  defaultProfile: Record<string, number>;
  /** The milestone the end must trail (default: the one before it). */
  endAfter?: string;
}

export interface LoadingSession {
  readonly key: string;
  /** Where the fill is on screen, in percent; updated per tick. */
  readonly percent: number;
  readonly done: boolean;
  /** No stored timing for this kind of load yet: the default is playing. */
  readonly firstVisit: boolean;
  /** Shows the bar on this fill element. Returns the detach. */
  attach(fill: HTMLElement): () => void;
  /** A milestone arrived (first arrival only; unknown names are ignored). */
  reach(name: string): void;
  /** The load finished: the fill runs to full and the timing is stored. */
  complete(): void;
  /** The load was given up (its view left first): nothing is stored. */
  abandon(): void;
}

const STORAGE_PREFIX = "tka-loading-profile:";
/** The empty end of the scale, as on the boot screen. */
export const LOADING_FLOOR_PERCENT = 4;
const FINISH_MS = 200;

interface LoadingBarProbe {
  key: string;
  firstVisit: boolean;
  milestones: SelfTimingBar["log"];
  outcome?: "complete" | "abandoned";
}

function readProfile(key: string): SelfTimingProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SelfTimingProfile | null;
    if (!parsed || parsed.v !== 1 || !parsed.t) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeProfile(key: string, profile: SelfTimingProfile): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(profile));
  } catch {
    // Storage blocked: the next load replays the default.
  }
}

// Silent probe for timeline captures, like window.__tkaBootBar.
function probe(entry: LoadingBarProbe): void {
  const target = window as unknown as { __tkaLoadingBars?: LoadingBarProbe[] };
  const list = (target.__tkaLoadingBars ??= []);
  list.push(entry);
  if (list.length > 20) list.shift();
}

export function createLoadingSession(spec: LoadingSessionSpec): LoadingSession {
  const stored = readProfile(spec.key);
  const last = spec.ranks[spec.ranks.length - 1]!;
  // The bar runs on a detached element until a surface attaches, so the
  // timing starts with the load rather than with the first paint of it.
  const parked = document.createElement("div");
  let fill: HTMLElement = parked;
  let percent = $state(LOADING_FLOOR_PERCENT);
  let done = $state(false);
  let ended = false;

  const bar = createSelfTimingBar({
    fill: parked,
    ranks: spec.ranks,
    profile: stored ?? { t: spec.defaultProfile },
    endAfter: spec.endAfter,
    origin: performance.now(),
    shown: LOADING_FLOOR_PERCENT,
    floor: LOADING_FLOOR_PERCENT,
    still: reducedMotion(),
    onSample: (_now, at) => {
      percent = at;
    },
  });
  const entry: LoadingBarProbe = {
    key: spec.key,
    firstVisit: !stored,
    milestones: bar.log,
  };
  probe(entry);

  function onVisibility(): void {
    if (document.hidden) bar.stopTicker();
    else bar.startTicker();
  }
  document.addEventListener("visibilitychange", onVisibility);
  bar.milestone(spec.ranks[0]!);
  bar.startTicker();

  function end(outcome: "complete" | "abandoned"): void {
    ended = true;
    entry.outcome = outcome;
    document.removeEventListener("visibilitychange", onVisibility);
  }

  return {
    key: spec.key,
    get percent() {
      return percent;
    },
    get done() {
      return done;
    },
    firstVisit: !stored,
    attach(next) {
      fill = next;
      bar.attach(next);
      return () => {
        // The surface left. Park the bar so a surface that takes over
        // continues from here; a finished bar has nothing left to show.
        if (fill !== next || ended) return;
        fill = parked;
        bar.attach(parked);
      };
    },
    reach(name) {
      if (ended || name === last) return;
      bar.milestone(name);
    },
    complete() {
      if (ended) return;
      bar.milestone(last);
      writeProfile(spec.key, bar.profile());
      bar.finish(FINISH_MS, "ease");
      percent = 100;
      done = true;
      end("complete");
    },
    abandon() {
      if (ended) return;
      bar.destroy();
      end("abandoned");
    },
  };
}
