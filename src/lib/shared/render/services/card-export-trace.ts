type Detail = Record<string, string | number | boolean>;
type Outcome = "ok" | "error";

interface Span {
  phase: string;
  startMs: number;
  durationMs?: number;
  detail?: Detail;
}

let nextTraceId = 0;
const MAX_SPANS = 64;

/** Local diagnostics only: no sequence content, links, or account data. */
export class CardExportTrace {
  private readonly id = ++nextTraceId;
  private readonly started = performance.now();
  private readonly spans: Span[] = [];
  private readonly details: Detail = {};
  private finished = false;

  constructor(private readonly enabled: boolean) {}

  note(key: string, value: string | number | boolean): void {
    if (this.enabled) this.details[key] = value;
  }

  start(phase: string): (detail?: Detail) => void {
    if (!this.enabled || this.finished || this.spans.length >= MAX_SPANS)
      return () => {};
    const startTime = performance.now();
    const span: Span = { phase, startMs: startTime - this.started };
    this.spans.push(span);
    // Start events identify the active stage even when a request never finishes.
    console.debug(
      "[Card export timing]",
      JSON.stringify({ id: this.id, phase, event: "start" })
    );
    return (detail) => {
      if (span.durationMs !== undefined || this.finished) return;
      span.durationMs = performance.now() - startTime;
      span.detail = detail;
      performance.measure(`card-export.${phase}`, {
        start: startTime,
        end: startTime + span.durationMs,
        detail: { id: this.id, ...detail },
      });
      // The bounded report below retains the timings. Don't accumulate entries
      // in a long-lived tab; an attached PerformanceObserver still receives them.
      performance.clearMeasures(`card-export.${phase}`);
    };
  }

  async measure<T>(
    phase: string,
    work: () => Promise<T>,
    detail?: Detail
  ): Promise<T> {
    const end = this.start(phase);
    try {
      const value = await work();
      end(detail);
      return value;
    } catch (error) {
      end({ ...detail, outcome: "error" });
      throw error;
    }
  }

  finish(outcome: Outcome = "ok"): void {
    if (!this.enabled || this.finished) return;
    this.finished = true;
    const durationMs = performance.now() - this.started;
    console.info(
      "[Card export timing]",
      JSON.stringify({
        id: this.id,
        outcome,
        durationMs,
        detail: this.details,
        // Spans may overlap; their durations must not be summed into a total.
        spans: this.spans.map((span) => ({
          ...span,
          durationMs: span.durationMs ?? durationMs - span.startMs,
          ...(span.durationMs === undefined ? { incomplete: true } : {}),
        })),
      })
    );
  }
}

export function startCardExportTrace(): CardExportTrace {
  return new CardExportTrace(
    typeof window !== "undefined" &&
      (import.meta.env.DEV ||
        new URLSearchParams(window.location.search).get("profileCard") === "1")
  );
}
