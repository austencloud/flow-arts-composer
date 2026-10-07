interface PreviewSeekState {
  currentTime: number;
  targetTime: number;
  previousTargetTime: number | null;
  playing: boolean;
  seeking: boolean;
  waiting: boolean;
  awaitingFrame: boolean;
  discontinuity?: boolean;
  sinceLastCorrectionMs: number;
  recoveryElapsedMs?: number;
  targetBuffered?: boolean;
  presentedTime?: number | null;
  sinceLastPresentedFrameMs?: number;
  visible?: boolean;
  /** Sounding music sets the clock and this clip keeps up with it. */
  following?: boolean;
  /** The clip's authored speed, which scales how far it may stray. */
  playbackRate?: number;
}

/** One reading of how far a clip runs ahead of sounding music. */
export interface FollowLead {
  /** When it was read, in performance.now() milliseconds. */
  atMs: number;
  /** How far ahead, in post seconds; behind is negative. */
  seconds: number;
}

/**
 * How far footage that follows sounding music may stray, in post seconds,
 * before it is moved back: the same quarter second the music itself gets.
 */
const FOLLOW_SEEK_SECONDS = 0.25;
/**
 * A muted clip's own clock only ever loses time, about 20 ms at a step, so
 * the clip keeps this far ahead of the music. One lost step leaves it level
 * with the music, and a second close behind leaves it 20 ms back, still
 * within a frame.
 */
export const FOLLOW_AHEAD_SECONDS = 1 / 50;
/** A steady clip changes speed once it is this far from its place... */
const FOLLOW_START_SECONDS = 1 / 180;
/** ...and keeps the change until it is back within this. */
const FOLLOW_STOP_SECONDS = 1 / 1000;
/**
 * How long a clip's speed decision remembers its readings. A muted clip's
 * clock can stall for a moment and then make the time up; a stall shorter
 * than half this window changes nothing.
 */
export const FOLLOW_WINDOW_MS = 50;

export function shouldSeekPreviewVideo(state: PreviewSeekState): boolean {
  const jumped =
    state.discontinuity ||
    (state.previousTargetTime !== null &&
      Math.abs(state.targetTime - state.previousTargetTime) > 0.5);
  // Repeated seeks can leave footage displaying the same frame while the
  // playhead moves. The composition follows the native media clock instead.
  // Footage that follows sounding music gets a quarter second of post time;
  // speed changes close anything smaller.
  const drift = state.following
    ? FOLLOW_SEEK_SECONDS * (state.playbackRate ?? 1)
    : 2;
  const tolerance = state.playing ? (jumped ? 1 / 30 : drift) : 1 / 30;
  if (state.seeking) return false;
  // The native clock can keep advancing after the picture stops. Give a
  // visible, buffered clip one retry even when that clock is on time.
  const presentationStalled =
    state.playing &&
    state.visible === true &&
    state.targetBuffered === true &&
    (state.sinceLastPresentedFrameMs ?? 0) >= 3000 &&
    (state.presentedTime === null ||
      (state.presentedTime !== undefined &&
        Math.abs(state.targetTime - state.presentedTime) > 1 / 30));
  if (presentationStalled && state.sinceLastCorrectionMs >= 3000) return true;
  if (Math.abs(state.currentTime - state.targetTime) <= tolerance) return false;
  if (!state.playing) return true;
  // A decoder that stops presenting frames cannot clear its own recovery
  // gate. Retry a buffered position after giving the current attempt time.
  const recoveryStalled =
    (state.recoveryElapsedMs ?? 0) >= 3000 && state.targetBuffered === true;
  return (
    jumped ||
    (((!state.waiting && !state.awaitingFrame) || recoveryStalled) &&
      state.sinceLastCorrectionMs >= 3000)
  );
}

/** Adds a clip's newest reading and forgets those older than the window. */
export function rememberFollowLead(
  recent: readonly FollowLead[],
  lead: FollowLead
): FollowLead[] {
  return [
    ...recent.filter((entry) => lead.atMs - entry.atMs < FOLLOW_WINDOW_MS),
    lead,
  ];
}

/**
 * The lead a clip's speed follows: the middle of its recent readings, or the
 * one further ahead of the middle two. A stalled clock only ever reads
 * behind, so one stalled reading is no reason to change speed.
 */
function steadyLead(recentLeads: readonly number[]): number | null {
  const sorted = recentLeads.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

/** The speed change for a slip this size, as a share of the authored speed. */
function followNudge(slipSeconds: number): number {
  if (slipSeconds > 0.02) return 0.15;
  if (slipSeconds > 0.01) return 0.1;
  return 0.05;
}

/**
 * The speed footage plays at: its authored speed, or 5%, 10% or 15% off it
 * while it follows sounding music and has slipped from its place, 1/50 s
 * ahead of the music. `recentLeads` are its readings from the last
 * FOLLOW_WINDOW_MS in post seconds, positive ahead; `nudged` says its speed
 * is already off. A clip starts changing speed 1/180 s from its place and
 * keeps the change until it is back within 1 ms, so it never settles at the
 * edge.
 */
export function previewPlaybackRate(
  authoredRate: number,
  recentLeads: readonly number[] = [],
  nudged = false
): number {
  const steady = steadyLead(recentLeads);
  if (steady === null) return authoredRate;
  const offset = steady - FOLLOW_AHEAD_SECONDS;
  const slip = Math.abs(offset);
  if (slip <= (nudged ? FOLLOW_STOP_SECONDS : FOLLOW_START_SECONDS))
    return authoredRate;
  // Ahead of its place slows down; behind speeds up.
  return authoredRate * (1 - Math.sign(offset) * followNudge(slip));
}
