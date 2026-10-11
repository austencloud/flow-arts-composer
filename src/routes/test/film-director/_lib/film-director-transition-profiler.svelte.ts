import type {
  EnvironmentTransitionObservation,
  EnvironmentTransitionPhase,
} from "#lib/shared/3d/environments/domain/environment-transition.js";

export interface FilmDirectorTransitionProfile {
  from: string | null;
  to: string;
  totalMs: number;
  phaseMs: Partial<Record<EnvironmentTransitionPhase, number>>;
  maxFrameGapMs: number;
  frameGapsOver100Ms: number;
  longTaskCount: number;
  totalLongTaskMs: number;
  maxLongTaskMs: number;
  resourceCount: number;
  transferredBytes: number;
  resources: string[];
}

interface ActiveTransition {
  from: string | null;
  to: string;
  startedAt: number;
  phase: EnvironmentTransitionPhase;
  phaseStartedAt: number;
  phaseMs: Partial<Record<EnvironmentTransitionPhase, number>>;
  maxFrameGapMs: number;
  frameGapsOver100Ms: number;
  longTaskCount: number;
  totalLongTaskMs: number;
  maxLongTaskMs: number;
}

interface FilmDirectorTransitionDebugHandle {
  readonly active: ActiveTransition | null;
  readonly profiles: readonly FilmDirectorTransitionProfile[];
}

type DebugWindow = Window & {
  __tkaFilmDirectorTransitions?: FilmDirectorTransitionDebugHandle;
};

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function resourceLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

/**
 * Records the time that disappears between one finished set and the next.
 * The director keeps this handle in development so a beautiful dissolve cannot
 * disguise a frozen browser, a late download, or a shader hitch.
 */
export function createFilmDirectorTransitionProfiler() {
  let active = $state<ActiveTransition | null>(null);
  let profiles = $state<FilmDirectorTransitionProfile[]>([]);
  let animationFrame: number | null = null;
  let lastFrameAt = 0;
  let lastSettledKey: string | null = null;
  let longTaskObserver: PerformanceObserver | null = null;

  function sampleFrame(timestamp: number): void {
    if (!active) {
      animationFrame = null;
      return;
    }

    const gap = Math.max(0, timestamp - lastFrameAt);
    active.maxFrameGapMs = Math.max(active.maxFrameGapMs, gap);
    if (gap >= 100) active.frameGapsOver100Ms += 1;
    lastFrameAt = timestamp;
    animationFrame = requestAnimationFrame(sampleFrame);
  }

  function begin(
    observation: EnvironmentTransitionObservation<string>,
    now: number
  ): void {
    performance.clearResourceTimings();
    active = {
      from: lastSettledKey ?? observation.mountedKey,
      to: observation.requestedKey,
      startedAt: now,
      phase: observation.phase,
      phaseStartedAt: now,
      phaseMs: {},
      maxFrameGapMs: 0,
      frameGapsOver100Ms: 0,
      longTaskCount: 0,
      totalLongTaskMs: 0,
      maxLongTaskMs: 0,
    };
    lastFrameAt = now;
    if (animationFrame === null)
      animationFrame = requestAnimationFrame(sampleFrame);
  }

  function changePhase(phase: EnvironmentTransitionPhase, now: number): void {
    if (!active || active.phase === phase) return;
    active.phaseMs[active.phase] =
      (active.phaseMs[active.phase] ?? 0) + (now - active.phaseStartedAt);
    active.phase = phase;
    active.phaseStartedAt = now;
  }

  function finish(now: number): void {
    if (!active) return;
    changePhase("idle", now);

    const resources = performance
      .getEntriesByType("resource")
      .filter((entry) => entry.startTime >= active!.startedAt)
      .filter((entry) => entry.startTime <= now) as PerformanceResourceTiming[];
    const profile: FilmDirectorTransitionProfile = {
      from: active.from,
      to: active.to,
      totalMs: roundMs(now - active.startedAt),
      phaseMs: Object.fromEntries(
        Object.entries(active.phaseMs).map(([phase, duration]) => [
          phase,
          roundMs(duration),
        ])
      ),
      maxFrameGapMs: roundMs(active.maxFrameGapMs),
      frameGapsOver100Ms: active.frameGapsOver100Ms,
      longTaskCount: active.longTaskCount,
      totalLongTaskMs: roundMs(active.totalLongTaskMs),
      maxLongTaskMs: roundMs(active.maxLongTaskMs),
      resourceCount: resources.length,
      transferredBytes: resources.reduce(
        (total, resource) => total + resource.transferSize,
        0
      ),
      resources: resources.map((resource) => resourceLabel(resource.name)),
    };

    profiles = [...profiles, profile];
    console.info("[FilmDirector] environment transition", profile);
    lastSettledKey = active.to;
    active = null;
  }

  function beginHostTransition(from: string | null, to: string): void {
    begin(
      {
        mountedKey: from,
        requestedKey: to,
        phase: "waiting",
        settled: false,
      },
      performance.now()
    );
  }

  function observe(
    observation: EnvironmentTransitionObservation<string>
  ): void {
    const now = performance.now();
    if (!active && observation.settled) {
      lastSettledKey = observation.mountedKey;
      return;
    }
    if (!active && observation.phase !== "idle") begin(observation, now);
    if (!active) return;

    changePhase(observation.phase, now);
    if (
      observation.settled &&
      observation.mountedKey === active.to &&
      observation.requestedKey === active.to
    ) {
      finish(now);
    }
  }

  function start(): void {
    performance.setResourceTimingBufferSize(2_000);
    if (
      typeof PerformanceObserver !== "undefined" &&
      PerformanceObserver.supportedEntryTypes.includes("longtask")
    ) {
      longTaskObserver = new PerformanceObserver((list) => {
        if (!active) return;
        for (const entry of list.getEntries()) {
          if (entry.startTime < active.startedAt) continue;
          active.longTaskCount += 1;
          active.totalLongTaskMs += entry.duration;
          active.maxLongTaskMs = Math.max(active.maxLongTaskMs, entry.duration);
        }
      });
      longTaskObserver.observe({ type: "longtask", buffered: true });
    }

    if (import.meta.env.DEV) {
      const debugWindow = window as DebugWindow;
      Object.defineProperty(debugWindow, "__tkaFilmDirectorTransitions", {
        configurable: true,
        value: {
          get active() {
            return active;
          },
          get profiles() {
            return profiles;
          },
        } satisfies FilmDirectorTransitionDebugHandle,
      });
    }
  }

  function destroy(): void {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
    longTaskObserver?.disconnect();
    longTaskObserver = null;
    if (import.meta.env.DEV) {
      delete (window as DebugWindow).__tkaFilmDirectorTransitions;
    }
  }

  return {
    get active() {
      return active;
    },
    get profiles() {
      return profiles;
    },
    observe,
    beginHostTransition,
    start,
    destroy,
  };
}

export type FilmDirectorTransitionProfiler = ReturnType<
  typeof createFilmDirectorTransitionProfiler
>;
