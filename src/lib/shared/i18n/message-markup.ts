// A translated sentence can carry three inline tags so its emphasis and line
// breaks survive translation: <strong>, <em>, and <br>. Each locale wraps its
// own words, because the emphasized phrase moves with word order (German puts
// "Raute" mid-sentence where English opens with "Diamond"). MessageMarkup.svelte
// renders these segments as real elements. Nothing here reaches {@html}, so any
// other tag, attribute, or stray "<" stays visible as ordinary text.

export type MessageSegment =
  | { kind: "text"; text: string; strong: boolean; em: boolean }
  | { kind: "break" };

const MARKUP_TAG = /<(\/?)(strong|em)>|<br\s*\/?>/g;

export function toMessageSegments(message: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let strongDepth = 0;
  let emDepth = 0;
  let cursor = 0;

  const pushText = (text: string) => {
    if (!text) return;
    segments.push({
      kind: "text",
      text,
      strong: strongDepth > 0,
      em: emDepth > 0,
    });
  };

  for (const match of message.matchAll(MARKUP_TAG)) {
    const index = match.index ?? 0;
    pushText(message.slice(cursor, index));
    cursor = index + match[0].length;

    const [, closing, tag] = match;
    if (!tag) {
      segments.push({ kind: "break" });
      continue;
    }
    // A stray closing tag is ignored rather than counted below zero, so it
    // cannot silently cancel emphasis that a later opening tag asks for.
    const step = closing ? -1 : 1;
    if (tag === "strong") strongDepth = Math.max(0, strongDepth + step);
    else emDepth = Math.max(0, emDepth + step);
  }
  pushText(message.slice(cursor));

  return segments;
}
