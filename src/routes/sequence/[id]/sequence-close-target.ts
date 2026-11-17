/**
 * Where the viewer's Back goes on the standalone /sequence page, and what the
 * page's doors into the Composer report.
 *
 * A cold arrival is someone who reached this page from outside the app: a
 * card scan, or a shared link opened as the first page of the visit. Their
 * Back used to go to the gallery wall; it now opens the Composer, because
 * nothing behind them in the app is theirs to go back to. A return path
 * handed over by the app still wins, and someone who walked here inside the
 * app goes back the way they came. The browser's own Back is never
 * intercepted.
 */

/** How a cold visitor arrived. Null when they came through the app. */
export type SequenceArrival = "scan" | "link" | null;

export type SequenceCloseTarget =
  | { kind: "path"; path: string }
  | { kind: "history-back" }
  /** The Composer: with this sequence, unless Construct already holds work. */
  | { kind: "composer" };

export function resolveSequenceArrival(input: {
  returnPath?: string | null;
  scanOrigin: boolean;
  /** This page was reached by a client navigation inside the app. */
  reachedInApp: boolean;
}): SequenceArrival {
  if (input.returnPath) return null;
  if (input.scanOrigin) return "scan";
  return input.reachedInApp ? null : "link";
}

export function resolveSequenceCloseTarget(input: {
  returnPath?: string | null;
  arrival: SequenceArrival;
}): SequenceCloseTarget {
  if (input.returnPath) return { kind: "path", path: input.returnPath };
  if (input.arrival) return { kind: "composer" };
  return { kind: "history-back" };
}

/** Where a close landed, as `viewer_closed` reports it. */
export type SequenceCloseLanding =
  | "composer_this_sequence"
  | "composer_own_work"
  | "return_path"
  | "history_back";

/**
 * A pressed Back is not a request to edit: when Construct already holds work,
 * the Composer opens on that work and this sequence is not handed over.
 */
export function resolveSequenceCloseLanding(
  target: SequenceCloseTarget,
  constructHoldsWork: boolean
): SequenceCloseLanding {
  switch (target.kind) {
    case "path":
      return "return_path";
    case "history-back":
      return "history_back";
    case "composer":
      return constructHoldsWork ? "composer_own_work" : "composer_this_sequence";
  }
}

/** The page's ways into the Composer, as `sequence_remix_started.source`. */
export type SequenceDoor =
  | "composer_line"
  | "compact_header"
  | "header"
  | "overflow"
  | "close";

/** `arrival` on the door events: absent unless the visitor arrived cold. */
export function arrivalProperties(arrival: SequenceArrival): {
  arrival?: "cold_scan" | "cold_link";
} {
  if (arrival === "scan") return { arrival: "cold_scan" };
  if (arrival === "link") return { arrival: "cold_link" };
  return {};
}
