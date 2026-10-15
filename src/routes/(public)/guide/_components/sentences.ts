/**
 * Sentence splitting for centred Guide text. The Guide pages rule
 * (docs/architecture/visual-design-canon.md, "Guide pages") starts each
 * sentence of a centred block on its own line, split at render time so every
 * locale follows without separate strings. `Sentences.svelte` renders the
 * pieces; a block that needs custom markup (an inline link slot) splits with
 * `sentences()` and sets its own `.sentence` spans.
 */

/** Splits plain text after a sentence's closing mark (and any closing quote or bracket). */
export const sentences = (text: string): string[] =>
  text.split(/(?<=[.!?]["'”’)\]]*)\s+/).filter((s) => s.length > 0);

const TAG = /^<\/?([a-z][a-z0-9-]*)[^>]*?(\/?)>/i;
const VOID = new Set(["br", "img", "hr", "wbr"]);

/**
 * Splits authored HTML the same way, but only between top-level sentences:
 * a break inside an open element (a coloured span, <strong>) would leave a
 * half-open tag in each piece, so that text stays in one sentence.
 */
export function htmlSentences(html: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  let lastText = "";
  let i = 0;
  while (i < html.length) {
    const ch = html[i]!;
    if (ch === "<") {
      const m = TAG.exec(html.slice(i));
      if (m) {
        const closing = m[0].startsWith("</");
        const selfClosing = m[2] === "/" || VOID.has(m[1]!.toLowerCase());
        if (closing) depth = Math.max(0, depth - 1);
        else if (!selfClosing) depth++;
        i += m[0].length;
        continue;
      }
    }
    if (/\s/.test(ch) && depth === 0 && /[.!?]["'”’)\]]*$/.test(lastText)) {
      const piece = html.slice(start, i).trim();
      if (piece) out.push(piece);
      while (i < html.length && /\s/.test(html[i]!)) i++;
      start = i;
      lastText = "";
      continue;
    }
    lastText = (lastText + ch).slice(-4);
    i++;
  }
  const rest = html.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}
