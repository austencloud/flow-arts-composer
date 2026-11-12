/**
 * Prose for the reflow column. The print sheets broke lines by hand; most of
 * those `<br>`s fall between sentences, where a screen sets its own breaks, so
 * they become spaces. Two kinds stay, because without them the words run
 * together (2026-11-11 review walk):
 *   - a `<br>` before a bullet line ("• ..."), and
 *   - a `<br>` after a line that does not end a sentence and is a label: a
 *     bullet line, or one short enough to be a heading line ("Notice the
 *     pattern: Pro - Anti - Hybrid"). A long unfinished line is a sentence
 *     the sheet wrapped by hand, so its break becomes a space.
 */
const BR = /<br\s*\/?>/gi;
const STARTS_WITH_BULLET = /^(?:\s|<[^>]+>)*•/;
const ENDS_A_SENTENCE = /[.!?…:]["'”’)\]]*$/;

const LABEL_MAX = 60;
const plainEnd = (html: string) =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();

export function flowProse(html: string): string {
  const parts = html.split(BR);
  if (parts.length < 2) return html.replace(/\s{2,}/g, " ");
  let out = parts[0]!;
  let line = parts[0]!;
  for (let i = 1; i < parts.length; i++) {
    const next = parts[i]!;
    const text = plainEnd(line);
    const label =
      text.length > 0 &&
      !ENDS_A_SENTENCE.test(text) &&
      (STARTS_WITH_BULLET.test(line) || text.length <= LABEL_MAX);
    const keep = STARTS_WITH_BULLET.test(next) || label;
    out += keep ? `<br>${next}` : ` ${next}`;
    line = next;
  }
  return out.replace(/\s{2,}/g, " ");
}
