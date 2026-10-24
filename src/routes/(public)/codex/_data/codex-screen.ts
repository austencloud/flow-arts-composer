// Which screen /codex shows, read from the URL. The explorer's own params
// (letter, grid, variation, turns, xf) stay letter-explorer-url.ts's; this
// module adds type, adjust and links on top of them.
import type { CodexLayoutMode } from "./codex-fit";

export type CodexScreenKind = "home" | "type" | "letter" | "adjust" | "links";

export interface CodexScreen {
  kind: CodexScreenKind;
  /** 1-6 when a type is in context (its own screen, a letter's type, or the
   *  type Adjust was opened over). */
  type: number | null;
  /** The open letter's label when one is in context. */
  letter: string | null;
}

export const CODEX_SCREEN_PARAMS = ["type", "adjust", "links"] as const;

function parseType(value: string | null): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 6 ? n : null;
}

/**
 * @param letter the open letter (parseLetterExplorerRoute's letter, already
 *   checked against the codex), or null.
 * @param letterType the type number of a letter label (CODEX_BY_LABEL).
 */
export function codexScreen(
  params: URLSearchParams,
  mode: CodexLayoutMode,
  letter: string | null,
  letterType: (label: string) => number | null
): CodexScreen {
  if (mode === "full-board") {
    return letter
      ? { kind: "letter", type: letterType(letter), letter }
      : { kind: "home", type: null, letter: null };
  }
  const adjust = params.get("adjust") === "1";
  if (letter) {
    const type = letterType(letter);
    if (adjust) return { kind: "adjust", type, letter };
    if (params.get("links") === "1") return { kind: "links", type, letter };
    return { kind: "letter", type, letter };
  }
  const type = parseType(params.get("type"));
  if (adjust) return { kind: "adjust", type, letter: null };
  if (type) return { kind: "type", type, letter: null };
  return { kind: "home", type: null, letter: null };
}

export function codexScreenParent(screen: CodexScreen): CodexScreen | null {
  switch (screen.kind) {
    case "home":
      return null;
    case "type":
      return { kind: "home", type: null, letter: null };
    case "letter":
      return { kind: "type", type: screen.type, letter: null };
    case "links":
      return { kind: "letter", type: screen.type, letter: screen.letter };
    case "adjust":
      if (screen.letter) return { kind: "letter", type: screen.type, letter: screen.letter };
      if (screen.type) return { kind: "type", type: screen.type, letter: null };
      return { kind: "home", type: null, letter: null };
  }
}

export function codexScreenDepth(screen: CodexScreen): number {
  const parent = codexScreenParent(screen);
  return parent ? codexScreenDepth(parent) + 1 : 0;
}

/** Writes type, adjust and links. The caller writes or clears the letter
 *  params with writeLetterExplorerRoute. */
export function writeCodexScreen(url: URL, screen: CodexScreen): void {
  for (const p of CODEX_SCREEN_PARAMS) url.searchParams.delete(p);
  if (screen.kind === "type" && screen.type) url.searchParams.set("type", String(screen.type));
  if (screen.kind === "adjust") {
    if (!screen.letter && screen.type) url.searchParams.set("type", String(screen.type));
    url.searchParams.set("adjust", "1");
  }
  if (screen.kind === "links") url.searchParams.set("links", "1");
}
