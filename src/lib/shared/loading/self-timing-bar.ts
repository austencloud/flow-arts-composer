/**
 * The app's handle on the shared self-timing bar engine. The engine is one
 * classic-script file so app.html's boot screen can run it before any bundle;
 * importing it here defines the factory on the global object, and this module
 * gives it types.
 */
import "./self-timing-bar.engine.js";

export interface SelfTimingProfile {
  v?: number;
  at?: number;
  /** Milestone name to ms from the bar's origin. */
  t: Record<string, number>;
}

export interface SelfTimingMilestone {
  name: string;
  /** ms from the bar's origin. */
  t: number;
  ignored?: true;
}

export interface SelfTimingBarOptions {
  fill: HTMLElement;
  ranks: readonly string[];
  profile?: SelfTimingProfile | null;
  endAfter?: string;
  /** performance.now() at the bar's zero. */
  origin?: number;
  /** The percent the fill shows now. */
  shown?: number;
  /** The percent at fraction 0. */
  floor?: number;
  still?: boolean;
  tickMs?: number;
  log?: SelfTimingMilestone[];
  onSample?: (now: number, percent: number, target: number) => void;
}

export interface SelfTimingBar {
  readonly ranks: readonly string[];
  readonly times: readonly number[];
  readonly log: SelfTimingMilestone[];
  milestone(
    name: string,
    options?: { segment?: boolean }
  ): SelfTimingMilestone | null;
  finish(ms: number, easing?: string): void;
  attach(fill: HTMLElement): void;
  at(now?: number): number;
  expected(now?: number): number;
  top(): string | null;
  arrived(name: string): boolean;
  finished(): boolean;
  profile(): Required<SelfTimingProfile>;
  startTicker(): void;
  stopTicker(): void;
  destroy(): void;
}

type Factory = ((options: SelfTimingBarOptions) => SelfTimingBar) & {
  profileTimes(
    ranks: readonly string[],
    profile: SelfTimingProfile | null | undefined,
    endAfter?: string
  ): { times: number[]; profiled: boolean[] };
};

export const createSelfTimingBar = (
  globalThis as unknown as { __tkaCreateSelfTimingBar: Factory }
).__tkaCreateSelfTimingBar;
