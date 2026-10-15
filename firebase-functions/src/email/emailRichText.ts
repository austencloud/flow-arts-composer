// Release-note text carries the same inline tokens the app renders:
// `[label](url)` links, `{icon:name}` glyphs and `**bold**` runs (which may
// hold the other two). The app's tokenizer lives in
// src/lib/shared/versioning/domain/utils/changelog-rich-text.ts; Functions is
// a separate deploy and cannot import it, so this mirrors its patterns. Keep
// the two in step when the release pipeline gains a token.

import { emailPalette, escapeHtml } from "./emailLayout";

type InlineSegment =
  | { kind: "text"; value: string }
  | { kind: "link"; label: string; href: string };

type Segment = InlineSegment | { kind: "strong"; children: InlineSegment[] };

const TOKEN_PATTERN = /\[([^\]]+)\]\(([^)\s]+)\)|\{icon:([a-z0-9-]+)\}/g;
const BOLD_PATTERN = /\*\*(?=\S)([\s\S]*?\S)\*\*/g;
const APP_ORIGIN = "https://tkaflowarts.com";

function toSegments(input: string): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  for (const match of input.matchAll(BOLD_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) segments.push(...toInline(input.slice(cursor, index)));
    segments.push({ kind: "strong", children: toInline(match[1]!) });
    cursor = index + match[0].length;
  }
  if (cursor < input.length) segments.push(...toInline(input.slice(cursor)));
  return segments;
}

function toInline(input: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let cursor = 0;
  for (const match of input.matchAll(TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      segments.push({ kind: "text", value: input.slice(cursor, index) });
    }
    // Icon glyphs need the app's icon font; an email drops them.
    if (!match[3]) segments.push(toLink(match[1]!, match[2]!));
    cursor = index + match[0].length;
  }
  if (cursor < input.length) {
    segments.push({ kind: "text", value: input.slice(cursor) });
  }
  return segments;
}

function toLink(label: string, url: string): InlineSegment {
  try {
    // Mail has no app router, so relative links resolve against the site.
    const parsed = new URL(url, APP_ORIGIN);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { kind: "text", value: label };
    }
    return { kind: "link", label, href: parsed.href };
  } catch {
    return { kind: "text", value: label };
  }
}

function collapse(value: string): string {
  return value.replace(/\s{2,}/g, " ").trim();
}

/** Links an entry names, in order, so a layout can offer them as buttons. */
export function richTextLinks(
  input: string
): { label: string; href: string }[] {
  return toSegments(input)
    .flatMap((segment) =>
      segment.kind === "strong" ? segment.children : [segment]
    )
    .filter((segment) => segment.kind === "link")
    .map(({ label, href }) => ({ label, href }));
}

/** The first `**bold**` run as plain text, and the rest of the entry after it. */
export function splitLeadingBold(
  input: string
): { lead: string; rest: string } | null {
  const match = /^\s*\*\*(?=\S)([\s\S]*?\S)\*\*/.exec(input);
  if (!match) return null;
  return {
    lead: richTextToPlain(match[1]!, { withUrls: false }),
    rest: input.slice(match[0].length).trim(),
  };
}

/** Plain text for the text/plain part. Links keep their URL in brackets. */
export function richTextToPlain(
  input: string,
  options: { withUrls?: boolean } = {}
): string {
  const withUrls = options.withUrls ?? true;
  const inline = (segment: InlineSegment) =>
    segment.kind === "text"
      ? segment.value
      : withUrls
        ? `${segment.label} (${segment.href})`
        : segment.label;
  return collapse(
    toSegments(input)
      .map((segment) =>
        segment.kind === "strong"
          ? segment.children.map(inline).join("")
          : inline(segment)
      )
      .join("")
  );
}

/** Escaped inline HTML: bold runs in the strong text color, links as pills. */
export function richTextToHtml(input: string): string {
  const inline = (segment: InlineSegment) =>
    segment.kind === "text"
      ? escapeHtml(segment.value)
      : inlineLinkPill(segment.label, segment.href);
  return toSegments(input)
    .map((segment) =>
      segment.kind === "strong"
        ? `<strong style="color:${emailPalette.textStrong};font-weight:650">${segment.children.map(inline).join("")}</strong>`
        : inline(segment)
    )
    .join("")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Links read as pills, never underlined text (.claude/rules/no-text-links.md).
function inlineLinkPill(label: string, href: string): string {
  return `<a href="${escapeHtml(href)}" target="_blank" style="color:${emailPalette.linkText};background-color:${emailPalette.linkFill};border-radius:999px;padding:1px 7px;text-decoration:none;font-weight:600;white-space:nowrap">${escapeHtml(label)}</a>`;
}
