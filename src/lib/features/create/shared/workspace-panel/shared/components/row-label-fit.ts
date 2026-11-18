/**
 * Decides whether the Create workspace's bottom button row shows its words.
 *
 * A word's width depends on the language, the font and which buttons are
 * there, so no fixed row width can say when the words fit. Instead a hidden
 * copy of the real row is laid out worded in the same container, and the
 * words show only when no two controls in that copy come closer than
 * ROW_LABEL_MIN_GAP and none leaves the row.
 */

/** A control's horizontal extent, in CSS pixels. */
export interface RowSpan {
  left: number;
  right: number;
}

/** The least room between two neighbouring controls with words on. */
export const ROW_LABEL_MIN_GAP = 10;

/** Set on the row when its worded copy fits. */
export const ROW_LABELS_FIT_CLASS = "labels-fit";

/** Set for one style pass so a decision lands without animating. */
export const ROW_LABELS_INSTANT_CLASS = "labels-instant";

/** Wraps the hidden worded copy. */
export const ROW_MEASURE_CLASS = "button-row-measure";

// Sub-pixel layout rounding is not a collision.
const TOLERANCE = 0.5;

/**
 * True when every control stays inside `inner` and keeps at least `minGap`
 * from its neighbour. Controls are compared in left-to-right order, which
 * also catches one control covering another. An empty row has nothing to
 * label, so it never fits.
 */
export function rowHasRoom(
  controls: readonly RowSpan[],
  inner: RowSpan,
  minGap: number = ROW_LABEL_MIN_GAP
): boolean {
  if (controls.length === 0) return false;
  const sorted = [...controls].sort((a, b) => a.left - b.left);
  for (const control of sorted) {
    if (
      control.left < inner.left - TOLERANCE ||
      control.right > inner.right + TOLERANCE
    ) {
      return false;
    }
  }
  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (current.left - previous.right < minGap - TOLERANCE) return false;
  }
  return true;
}

// Removed from every node of the copy so no query, tutorial or panel-flip
// rider ever finds it.
const STRIPPED_ATTRIBUTES = [
  "id",
  "data-testid",
  "data-panel-flip",
  "data-tutorial-target",
  "data-ghost",
  "data-ghost-kind",
  "data-ghost-label",
];

const CONTROL_SELECTOR =
  ".left-zone button, .center-zone button, .right-zone button";

const OWN_CLASSES = new Set([ROW_LABELS_FIT_CLASS, ROW_LABELS_INSTANT_CLASS]);

function classesBesidesOwn(element: Element): string {
  return [...element.classList]
    .filter((name) => !OWN_CLASSES.has(name))
    .join(" ");
}

function addsControl(record: MutationRecord): boolean {
  for (const node of record.addedNodes) {
    if (
      node instanceof Element &&
      (node.matches("button") || node.querySelector("button"))
    ) {
      return true;
    }
  }
  return false;
}

export interface RowLabelFitOptions {
  /**
   * True while the row may lose its words but not gain them, so a change
   * such as Clear stepping aside can never make words appear.
   */
  holdWords?: () => boolean;
}

export interface RowLabelFit {
  /** Measure again on the next frame. */
  refresh(): void;
  stop(): void;
}

/**
 * Keeps `labels-fit` on `row` exactly while its worded copy fits. The copy
 * lives beside the row in its parent, which must be the row's size container
 * so container queries resolve the same for both.
 *
 * A decision made on the first measure, or because a control just arrived,
 * lands without animating, so an arriving control is drawn once in its final
 * shape. A resize, a word changing or fonts loading animate through the
 * row's usual transitions, except when the worded row would be drawn with
 * controls over each other: then the words go in that same frame.
 */
export function fitRowLabels(
  row: HTMLElement,
  { holdWords = () => false }: RowLabelFitOptions = {}
): RowLabelFit {
  const host = row.parentElement;
  if (!host) return { refresh() {}, stop() {} };

  let measure: HTMLElement | null = null;
  let copyStale = true;
  let instantNext = true;
  let decided: boolean | null = null;
  // True when the worded copy has controls over each other or past the row.
  let collides = false;
  let measuredWidth = -1;
  let frame = 0;
  let rowClasses = classesBesidesOwn(row);
  let stopped = false;

  function rebuildCopy(): HTMLElement {
    measure?.remove();
    const wrapper = document.createElement("div");
    wrapper.className = ROW_MEASURE_CLASS;
    wrapper.setAttribute("aria-hidden", "true");
    wrapper.inert = true;
    const copy = row.cloneNode(true) as HTMLElement;
    for (const element of [copy, ...copy.querySelectorAll("*")]) {
      for (const name of STRIPPED_ATTRIBUTES) element.removeAttribute(name);
    }
    copy.classList.remove(ROW_LABELS_INSTANT_CLASS);
    copy.classList.add(ROW_LABELS_FIT_CLASS);
    wrapper.append(copy);
    host!.append(wrapper);
    measure = wrapper;
    copyStale = false;
    return copy;
  }

  function controlSpans(copy: HTMLElement): RowSpan[] {
    return [...copy.querySelectorAll(CONTROL_SELECTOR)]
      .map((control) => control.getBoundingClientRect())
      .filter((bounds) => bounds.width > 0 && bounds.height > 0)
      .map(({ left, right }) => ({ left, right }));
  }

  /** null when the words class changes nothing here (the grid tier). */
  function copyFits(copy: HTMLElement): boolean | null {
    const worded = controlSpans(copy);
    copy.classList.remove(ROW_LABELS_FIT_CLASS);
    const plain = controlSpans(copy);
    copy.classList.add(ROW_LABELS_FIT_CLASS);
    if (
      worded.length === plain.length &&
      worded.every(
        (span, index) =>
          Math.abs(span.left - plain[index]!.left) < TOLERANCE &&
          Math.abs(span.right - plain[index]!.right) < TOLERANCE
      )
    ) {
      return null;
    }
    const box = copy.getBoundingClientRect();
    const style = getComputedStyle(copy);
    const inner = {
      left: box.left + parseFloat(style.paddingLeft),
      right: box.right - parseFloat(style.paddingRight),
    };
    collides = !rowHasRoom(worded, inner, 0);
    return rowHasRoom(worded, inner);
  }

  function hostWidth(): number {
    // Layout width, untouched by any transform a parent panel is travelling by.
    return parseFloat(getComputedStyle(host!).width);
  }

  function apply(fits: boolean, instant: boolean): void {
    if (!instant) {
      row.classList.toggle(ROW_LABELS_FIT_CLASS, fits);
      return;
    }
    row.classList.add(ROW_LABELS_INSTANT_CLASS);
    row.classList.toggle(ROW_LABELS_FIT_CLASS, fits);
    // Resolve styles with transitions off, so restoring them starts none.
    void row.offsetWidth;
    row.classList.remove(ROW_LABELS_INSTANT_CLASS);
  }

  function evaluate(): void {
    if (stopped) return;
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    const copy =
      copyStale || !measure?.isConnected
        ? rebuildCopy()
        : (measure.firstElementChild as HTMLElement);
    measuredWidth = hostWidth();
    let fits = copyFits(copy);
    // Words that would be drawn over each other go in this same frame (a
    // window snapping narrower, a longer language arriving); a row that is
    // only tight eases out.
    const instant = instantNext || (fits === false && collides);
    instantNext = false;
    if (fits === null) {
      // Words cannot show at this size, so the row starts fresh when they
      // can, from the plain shape.
      decided = null;
      row.classList.remove(ROW_LABELS_FIT_CLASS);
      return;
    }
    if (fits && decided === false && holdWords()) fits = false;
    if (fits === decided) return;
    decided = fits;
    apply(fits, instant);
  }

  function schedule(): void {
    if (stopped || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      evaluate();
    });
  }

  const resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[entries.length - 1];
    const width = entry?.contentBoxSize?.[0]?.inlineSize ?? hostWidth();
    // Decide here, after layout and before paint, so no wrong frame shows.
    if (copyStale || Math.abs(width - measuredWidth) > 0.01) evaluate();
  });

  const mutationObserver = new MutationObserver((records) => {
    let changed = false;
    for (const record of records) {
      if (record.target === row && record.type === "attributes") {
        // Only the row's own classes changing beyond this module's matters.
        const next = classesBesidesOwn(row);
        if (next === rowClasses) continue;
        rowClasses = next;
      }
      changed = true;
      if (addsControl(record)) instantNext = true;
    }
    if (!changed) return;
    copyStale = true;
    schedule();
  });

  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  const onFonts = () => schedule();

  evaluate();
  resizeObserver.observe(host);
  mutationObserver.observe(row, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["class"],
  });
  fonts?.addEventListener("loadingdone", onFonts);
  void fonts?.ready.then(onFonts);

  return {
    refresh: schedule,
    stop() {
      stopped = true;
      if (frame) cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      fonts?.removeEventListener("loadingdone", onFonts);
      measure?.remove();
      measure = null;
    },
  };
}
