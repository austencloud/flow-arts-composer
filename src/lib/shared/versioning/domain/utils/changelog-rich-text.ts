// Changelog entry text carries three inline tokens, authored by the release
// pipeline: markdown links `[label](url)`, icon glyphs `{icon:name}`, and
// `**bold**` runs (which may contain the other two). This module is the single
// tokenizer; ChangelogRichText.svelte renders the segments, and plaintext
// consumers (clipboard copy) strip them.

export type ChangelogInlineSegment =
  | { kind: "text"; value: string }
  | { kind: "link"; label: string; href: string; external: boolean }
  | { kind: "icon"; name: string };

export type ChangelogSegment =
  | ChangelogInlineSegment
  | { kind: "strong"; children: ChangelogInlineSegment[] };

const TOKEN_PATTERN = /\[([^\]]+)\]\(([^)\s]+)\)|\{icon:([a-z0-9-]+)\}/g;

/** A `**run**` whose text starts and ends flush with the markers, so `2 ** 3` stays text. */
const BOLD_PATTERN = /\*\*(?=\S)([\s\S]*?\S)\*\*/g;

const INTERNAL_HOSTS = new Set([
  "tkaflowarts.com",
  "www.tkaflowarts.com",
  "localhost",
]);

export function toChangelogSegments(input: string): ChangelogSegment[] {
  const segments: ChangelogSegment[] = [];
  let cursor = 0;
  for (const match of input.matchAll(BOLD_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      segments.push(...toInlineSegments(input.slice(cursor, index)));
    }
    segments.push({ kind: "strong", children: toInlineSegments(match[1]!) });
    cursor = index + match[0].length;
  }
  if (cursor < input.length) {
    segments.push(...toInlineSegments(input.slice(cursor)));
  }
  return segments;
}

function toInlineSegments(input: string): ChangelogInlineSegment[] {
  const segments: ChangelogInlineSegment[] = [];
  let cursor = 0;
  for (const match of input.matchAll(TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      segments.push({ kind: "text", value: input.slice(cursor, index) });
    }
    if (match[3]) {
      const name = match[3];
      segments.push({
        kind: "icon",
        name: name.startsWith("fa-") ? name : `fa-${name}`,
      });
    } else {
      segments.push(toLink(match[1]!, match[2]!));
    }
    cursor = index + match[0].length;
  }
  if (cursor < input.length) {
    segments.push({ kind: "text", value: input.slice(cursor) });
  }
  return segments;
}

function toLink(label: string, url: string): ChangelogInlineSegment {
  try {
    const parsed = new URL(url, "https://tkaflowarts.com");
    const internal = INTERNAL_HOSTS.has(parsed.hostname);
    return {
      kind: "link",
      label,
      href: internal
        ? parsed.pathname + parsed.search + parsed.hash
        : parsed.href,
      external: !internal,
    };
  } catch {
    return { kind: "text", value: label };
  }
}

/** Entry text with tokens flattened: links become their label, icons and bold markers vanish. */
export function changelogPlainText(input: string): string {
  return toChangelogSegments(input)
    .flatMap((s) => (s.kind === "strong" ? s.children : [s]))
    .map((s) =>
      s.kind === "text" ? s.value : s.kind === "link" ? s.label : ""
    )
    .join("")
    .replace(/\s{2,}/g, " ")
    .trim();
}
