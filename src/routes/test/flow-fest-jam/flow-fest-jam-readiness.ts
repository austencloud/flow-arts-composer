/**
 * What the jam waits for before anything shows: every piece of the set, every
 * person, and a warm-up. The full list is known from the layout before any of
 * it loads, so the bar is ready over expected from the first frame and never
 * runs backwards.
 *
 * Names: `stage:*` for the ground, woods and build; the cast as the people
 * component reports them (`watcher:<slot>`, `seated:<station>`, `dj`,
 * `performer:<id>`, `performer-motion:<id>` and `plan:<id>`, the props'
 * contact plan, plus `sequences` for the routines they spin); `warm:*` for the shader
 * compile and the smooth frames after it.
 */
import type { FlowFestJamLayout } from "#lib/features/flow-fest-sim/domain/flow-fest-jam-layout.js";

export const JAM_STAGE_PIECES = [
  "stage:terrain",
  "stage:orthophoto",
  "stage:ground",
  "stage:woods",
  "stage:structures",
  "stage:set",
  "stage:physics",
] as const;

export const JAM_WARM_PIECES = ["warm:compiled", "warm:smooth"] as const;

/** Everyone the people component reports as loaded and posed. */
export function jamCastPieces(layout: FlowFestJamLayout): string[] {
  return [
    ...layout.spectators.map((s) => `watcher:${s.id}`),
    ...layout.stations.filter((s) => s.occupied).map((s) => `seated:${s.id}`),
    "dj",
    "sequences",
    ...[...layout.performers, ...layout.outsideSpinners].flatMap((p) => [
      `performer:${p.id}`,
      `performer-motion:${p.id}`,
      `plan:${p.id}`,
    ]),
  ];
}

export type JamLoadStage = "stage" | "cast" | "warm";

export interface JamLoadProgress {
  ready: number;
  expected: number;
  /** ready / expected, never lower than it has been. */
  fraction: number;
  /** The first group still waiting. */
  stage: JamLoadStage;
}

export class JamReadiness {
  private readonly expected: ReadonlySet<string>;
  private readonly ready = new Set<string>();
  private best = 0;

  constructor(expected: Iterable<string>) {
    this.expected = new Set(expected);
  }

  /** A piece arrived. Unknown and repeated names change nothing. */
  mark(name: string): void {
    if (this.expected.has(name)) this.ready.add(name);
  }

  has(name: string): boolean {
    return this.ready.has(name);
  }

  missing(prefix = ""): string[] {
    return [...this.expected].filter((name) => name.startsWith(prefix) && !this.ready.has(name));
  }

  /** Everything but the warm-up: the compile can start. */
  get loaded(): boolean {
    return [...this.expected].every((name) => name.startsWith("warm:") || this.ready.has(name));
  }

  get complete(): boolean {
    return this.ready.size === this.expected.size;
  }

  progress(): JamLoadProgress {
    const expected = this.expected.size;
    const ready = this.ready.size;
    this.best = Math.max(this.best, expected ? ready / expected : 1);
    const missing = this.missing();
    const stage: JamLoadStage = missing.some((n) => n.startsWith("stage:"))
      ? "stage"
      : missing.some((n) => !n.startsWith("warm:"))
        ? "cast"
        : "warm";
    return { ready, expected, fraction: this.best, stage };
  }
}
