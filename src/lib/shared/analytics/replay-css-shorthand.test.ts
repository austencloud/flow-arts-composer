/**
 * Session replay copies each stylesheet rule's `cssText`. When one rule sets a
 * shorthand from a custom property (`background: var(--x)`) and later sets one
 * of its longhands (`background-clip: text`), Chrome serializes the rule with
 * that shorthand's longhands empty, so replays draw the element without it:
 * gradient-text icons and headings turn invisible, shimmer bars lose their
 * colour, borders and padding go missing. Real visitors see none of this.
 *
 * Keep such longhands in their own rule with the same selector, placed right
 * after; it cascades the same and serializes whole.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const LONGHANDS: Record<string, string> = {
  background:
    "background-(?:image|position|position-x|position-y|size|repeat|attachment|origin|clip|color)",
  border:
    "border-(?:top|right|bottom|left|width|style|color|image)(?:-[a-z]+)?",
  padding: "padding-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?",
  margin: "margin-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?",
  font: "font-(?:style|variant|weight|stretch|size|family)|line-height",
  mask: "mask-(?:image|position|size|repeat|origin|clip|composite|mode)",
  inset: "top|right|bottom|left",
  outline: "outline-(?:width|style|color)",
  flex: "flex-(?:grow|shrink|basis)",
  "grid-template": "grid-template-(?:rows|columns|areas)",
  overflow: "overflow-(?:x|y)",
  gap: "row-gap|column-gap",
  "border-radius": "border-(?:top|bottom)-(?:left|right)-radius",
};

const SRC = join(process.cwd(), "src");

function styleFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "node_modules" && name !== "private") styleFiles(path, out);
    } else if (name.endsWith(".svelte") || name.endsWith(".css")) {
      out.push(path);
    }
  }
  return out;
}

function cssOf(path: string, text: string): string[] {
  if (path.endsWith(".css")) return [text];
  return [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(
    (m) => m[1] ?? ""
  );
}

/** Top-level declarations of a block body as [name, value]. */
function declarations(body: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= body.length; i++) {
    const ch = body[i] ?? ";";
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === ";" && depth === 0) {
      const match = /^\s*(-?-?[a-zA-Z-]+)\s*:([\s\S]*)$/.exec(
        body.slice(start, i)
      );
      if (match) out.push([match[1]!.toLowerCase(), match[2]!]);
      start = i + 1;
    }
  }
  return out;
}

export function findReplayLossyRules(css: string): string[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const found: string[] = [];
  for (const block of clean.matchAll(/([^{};]*)\{([^{}]*)\}/g)) {
    const decls = declarations(block[2] ?? "");
    decls.forEach(([name, value], index) => {
      const longhands = LONGHANDS[name];
      if (!longhands || !value.includes("var(")) return;
      const pattern = new RegExp(`^(?:-webkit-)?(?:${longhands})$`);
      const later = decls.slice(index + 1).find(([n]) => pattern.test(n));
      if (later) {
        found.push(
          `${(block[1] ?? "").trim()} { ${name}: var(...); ${later[0]} }`
        );
      }
    });
  }
  return found;
}

describe("styles replays can copy", () => {
  it("flags a var() shorthand followed by its longhand in one rule", () => {
    expect(
      findReplayLossyRules(
        ".a i { background: var(--g); background-clip: text; }"
      )
    ).toHaveLength(1);
    expect(
      findReplayLossyRules(
        ".a i { background: var(--g); }\n.a i { background-clip: text; }"
      )
    ).toEqual([]);
    expect(
      findReplayLossyRules(
        ".d { border: 1px solid var(--x); border-radius: 4px; }"
      )
    ).toEqual([]);
  });

  it("no app stylesheet sets a longhand after a var() shorthand in the same rule", () => {
    const offenders: string[] = [];
    for (const path of styleFiles(SRC)) {
      const text = readFileSync(path, "utf8");
      for (const css of cssOf(path, text)) {
        for (const rule of findReplayLossyRules(css)) {
          offenders.push(`${relative(SRC, path)}: ${rule}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
