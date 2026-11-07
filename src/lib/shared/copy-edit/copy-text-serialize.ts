/**
 * The string format of a page's copy.json, and the two ways out of it.
 *
 * A string carries the same three tags as a translated sentence (<strong>,
 * <em>, <br>, owned by message-markup.ts) plus {0}, {1}... where the page
 * renders something that is not editable text, such as a LinkChip. Parsing
 * gives flat tokens to render. Serialising walks tokens or an edited DOM back
 * to the string, so an untouched block always compares equal to what was saved.
 */
import { toMessageSegments } from "#lib/shared/i18n/message-markup.js";

export type CopyToken =
  | { kind: "text"; text: string; strong: boolean; em: boolean }
  | { kind: "island"; index: number; strong: boolean; em: boolean }
  | { kind: "break" };

const ISLAND = /\{(0|[1-9]\d*)\}/g;

/** A placeholder with no island to fill it stays as the literal text. */
export function parseCopyText(
  source: string,
  islandCount: number
): CopyToken[] {
  const tokens: CopyToken[] = [];
  for (const segment of toMessageSegments(source)) {
    if (segment.kind === "break") {
      tokens.push(segment);
      continue;
    }
    const { strong, em } = segment;
    let cursor = 0;
    for (const match of segment.text.matchAll(ISLAND)) {
      const index = Number(match[1]);
      if (index >= islandCount) continue;
      const before = segment.text.slice(cursor, match.index);
      if (before) tokens.push({ kind: "text", text: before, strong, em });
      tokens.push({ kind: "island", index, strong, em });
      cursor = match.index + match[0].length;
    }
    const rest = segment.text.slice(cursor);
    if (rest) tokens.push({ kind: "text", text: rest, strong, em });
  }
  return tokens;
}

type Tag = "strong" | "em";

/** Tags stay open across neighbouring tokens, so markup round trips as written. */
export function serializeCopyTokens(tokens: readonly CopyToken[]): string {
  let out = "";
  const open: Tag[] = [];
  const moveTo = (strong: boolean, em: boolean) => {
    const wanted = (tag: Tag) => (tag === "strong" ? strong : em);
    while (open.some((tag) => !wanted(tag))) out += `</${open.pop()}>`;
    for (const tag of ["strong", "em"] as const) {
      if (wanted(tag) && !open.includes(tag)) {
        out += `<${tag}>`;
        open.push(tag);
      }
    }
  };

  tokens.forEach((token, position) => {
    if (token.kind === "break") {
      // A line break takes no emphasis of its own: it stays inside a tag only
      // when the words after it are still in that tag.
      const next = tokens.slice(position + 1).find((t) => t.kind !== "break");
      moveTo(next?.strong ?? false, next?.em ?? false);
      out += "<br>";
      return;
    }
    moveTo(token.strong, token.em);
    out += token.kind === "island" ? `{${token.index}}` : token.text;
  });
  moveTo(false, false);
  return out;
}

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/**
 * Reads an edited block back into tokens. Browsers type a no-break space at
 * the end of a line and leave a lone <br> in an emptied block, and neither is
 * something the writer put there. Ctrl+B and Ctrl+I insert <b> and <i>, which
 * count as <strong> and <em>. Any other element contributes only its text.
 */
export function copyTokensFromDom(root: Node): CopyToken[] {
  const tokens: CopyToken[] = [];
  const walk = (parent: Node, strong: boolean, em: boolean) => {
    parent.childNodes.forEach((node) => {
      if (node.nodeType === TEXT_NODE) {
        const text = (node.nodeValue ?? "").replaceAll(" ", " ");
        if (text) tokens.push({ kind: "text", text, strong, em });
        return;
      }
      if (node.nodeType !== ELEMENT_NODE) return;
      const element = node as Element;
      const island = element.getAttribute("data-island");
      if (island !== null) {
        tokens.push({ kind: "island", index: Number(island), strong, em });
        return;
      }
      const tag = element.tagName.toLowerCase();
      if (tag === "br") {
        tokens.push({ kind: "break" });
        return;
      }
      walk(
        element,
        strong || tag === "strong" || tag === "b",
        em || tag === "em" || tag === "i"
      );
    });
  };
  walk(root, false, false);
  if (tokens.at(-1)?.kind === "break") tokens.pop();
  return tokens;
}
