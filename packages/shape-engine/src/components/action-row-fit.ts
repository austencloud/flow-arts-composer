/**
 * Fits the Shape Engine's action row (Open, Save, Share, Customize) to its
 * box in every language.
 *
 * A word's width depends on the language and the font, and a container width
 * cannot know either, so the row is laid out at each rung of a ladder in turn
 * and the first rung where every button's words sit whole inside its button
 * wins. Icons go before words; two rows of two is the last resort and never
 * on a phone. The ladder's looks live in ShapeMatrixDrill.svelte, keyed on
 * the row's `data-fit-rung`:
 *
 *   1  as the drill's tier draws it (icon and word, suffix where shown)
 *   2  words only
 *   3  words only, tight side padding
 *   4  words only, tight, widths by content instead of equal shares
 *   5  two rows of two, words only
 */

export type ActionRowRung = 1 | 2 | 3 | 4 | 5;

/** Least room between a button's border and its words, in CSS pixels. */
export const ACTION_ROW_MIN_EDGE = 8;

// Sub-pixel layout rounding is not a cut word.
const TOLERANCE = 0.5;

/** The rung to stop at: the phone tier never gets a second row. */
export function lastActionRowRung(twoRowsAllowed: boolean): ActionRowRung {
  return twoRowsAllowed ? 5 : 4;
}

/**
 * The first rung `fitsAt` accepts, or the last rung when none does. The
 * caller lays the row out at a rung inside `fitsAt`, so the rungs are only
 * tried in order and never past the last one.
 */
export function chooseActionRowRung(
  fitsAt: (rung: ActionRowRung) => boolean,
  twoRowsAllowed: boolean
): ActionRowRung {
  const last = lastActionRowRung(twoRowsAllowed);
  for (let rung = 1; rung < last; rung++) {
    if (fitsAt(rung as ActionRowRung)) return rung as ActionRowRung;
  }
  return last;
}

/** A horizontal extent, in CSS pixels. */
export interface Span {
  left: number;
  right: number;
}

/** True when `words` sit inside `button` with at least `edge` to spare. */
export function wordsFit(
  words: Span,
  button: Span,
  edge: number = ACTION_ROW_MIN_EDGE
): boolean {
  return (
    words.left >= button.left + edge - TOLERANCE &&
    words.right <= button.right - edge + TOLERANCE
  );
}

function wordsInsideButtons(row: HTMLElement): boolean {
  for (const button of row.querySelectorAll("button")) {
    const box = button.getBoundingClientRect();
    if (box.width === 0) continue;
    const range = document.createRange();
    range.selectNodeContents(button);
    const words = range.getBoundingClientRect();
    if (words.width > 0 && !wordsFit(words, box)) return false;
  }
  return row.scrollWidth <= row.clientWidth + TOLERANCE;
}

/** The CSS owns the phone tier; it says so through this property. */
function twoRowsAllowed(row: HTMLElement): boolean {
  return (
    getComputedStyle(row).getPropertyValue("--action-row-two-rows").trim() !==
    "0"
  );
}

/**
 * Svelte action: keeps `data-fit-rung` on the row at the first rung where
 * every word fits. It measures again when the row's box, a button or its
 * words change, or fonts arrive. Each decision is made in the observer
 * callback, after layout and before paint, with transitions off, so no wrong
 * frame shows and nothing animates between rungs.
 */
export function fitActionRow(row: HTMLElement): { destroy(): void } {
  const host = row.parentElement;
  let stopped = false;
  let dirty = true;
  let measuredWidth = -1;

  function evaluate(): void {
    if (stopped) return;
    const width = row.clientWidth;
    // Not laid out (hidden ancestor): keep the last decision for when it is.
    if (width === 0) return;
    if (!dirty && Math.abs(width - measuredWidth) < 0.01) return;
    dirty = false;
    measuredWidth = width;
    row.setAttribute("data-fit-measuring", "");
    const rung = chooseActionRowRung((candidate) => {
      row.setAttribute("data-fit-rung", String(candidate));
      return wordsInsideButtons(row);
    }, twoRowsAllowed(row));
    row.setAttribute("data-fit-rung", String(rung));
    // Resolve the final styles with transitions off, so restoring them
    // starts none.
    void row.offsetWidth;
    row.removeAttribute("data-fit-measuring");
  }

  // The host, not the row: a second row changes the row's height, and an
  // observed size changing inside its own callback trips the loop guard.
  const resizeObserver = new ResizeObserver(() => evaluate());
  resizeObserver.observe(host ?? row);

  const mutationObserver = new MutationObserver(() => {
    dirty = true;
    evaluate();
  });
  mutationObserver.observe(row, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  const onFonts = () => {
    dirty = true;
    evaluate();
  };
  fonts?.addEventListener("loadingdone", onFonts);
  void fonts?.ready.then(onFonts);

  evaluate();

  return {
    destroy() {
      stopped = true;
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      fonts?.removeEventListener("loadingdone", onFonts);
    },
  };
}
