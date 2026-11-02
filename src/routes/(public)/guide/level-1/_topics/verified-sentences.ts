/**
 * Austen's verified Guide strings, cut at sentence boundaries. The six
 * combination pages show part of a proof paragraph on one screen and the rest
 * on the next (2026-10-31, Cross-Shift's "Break it down"); the catalog keeps
 * each paragraph whole for the print sheets. The cut never changes a word:
 * the sentences come back with the markup and the `<br>` breaks between
 * them as written, and a break left at either end of a cut is dropped.
 */

const BREAK = /^<br\s*\/?>/i;
const TAG = /^<\/?([a-z][a-z0-9-]*)[^>]*?(\/?)>/i;
const VOID = new Set(["br", "img", "hr", "wbr"]);
/** A sentence ends at one of these, plus any closing quote or bracket. */
const END = /[.!?。！？]["'”’)\]]*$/;
/** Full-width marks need no space after them. */
const CJK_END = /[。！？]["'”’)\]]*$/;

/**
 * Where each sentence of `html` starts: index 0, then the first character
 * after each sentence end that sits outside any element, past the spaces or
 * line break that follow it.
 */
function sentenceStarts(html: string): number[] {
  const starts = [0];
  let depth = 0;
  let text = "";
  let i = 0;
  const boundary = () => {
    let j = i;
    while (j < html.length) {
      if (/\s/.test(html[j]!)) j++;
      else if (BREAK.test(html.slice(j))) j += BREAK.exec(html.slice(j))![0].length;
      else break;
    }
    return j;
  };
  while (i < html.length) {
    const atEnd = depth === 0 && END.test(text);
    const rest = html.slice(i);
    const breaksHere = /^\s/.test(rest) || BREAK.test(rest) || CJK_END.test(text);
    if (atEnd && breaksHere) {
      const next = boundary();
      if (next < html.length) starts.push(next);
      i = next;
      text = "";
      continue;
    }
    if (html[i] === "<") {
      const m = TAG.exec(rest);
      if (m) {
        const closing = m[0].startsWith("</");
        const selfClosing = m[2] === "/" || VOID.has(m[1]!.toLowerCase());
        if (closing) depth = Math.max(0, depth - 1);
        else if (!selfClosing) depth++;
        i += m[0].length;
        continue;
      }
    }
    text = (text + html[i]).slice(-4);
    i++;
  }
  return starts;
}

/** The number of sentences in `html`. */
export function sentenceCount(html: string): number {
  return html.trim() ? sentenceStarts(html).length : 0;
}

/**
 * Sentences `from` up to (not including) `to` of `html`, as written. A
 * catalog whose translation has fewer sentences gives what it has.
 */
export function takeSentences(html: string, from: number, to?: number): string {
  const starts = sentenceStarts(html);
  if (from >= starts.length) return "";
  const end = to === undefined || to >= starts.length ? html.length : starts[to]!;
  return html
    .slice(starts[from], end)
    .replace(/(?:\s|<br\s*\/?>)+$/i, "")
    .trim();
}
