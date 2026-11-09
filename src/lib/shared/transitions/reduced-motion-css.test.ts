/**
 * Reduced motion must stop animations, never start them. A universal
 * selector that assigns animation names under the media query gives every
 * element and pseudo-element one CSSAnimation per name: on /create that was
 * about 38,000 animations the moment reduced motion switched on, and on a
 * busier page the tab stopped answering. app.css already shortens every
 * running animation; the reduced-motion blocks may only set `animation: none`
 * or timing on broad selectors.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd(), "src");

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "private" || entry.name === "node_modules") return [];
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(full);
    return entry.name.endsWith(".css") ? [full] : [];
  });
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Bodies of every `@media (...prefers-reduced-motion: reduce...)` block. */
function reducedMotionBlocks(css: string): string[] {
  const blocks: string[] = [];
  const opener = /@media[^{]*prefers-reduced-motion\s*:\s*reduce[^{]*\{/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(css))) {
    let depth = 1;
    let i = opener.lastIndex;
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") depth -= 1;
      i += 1;
    }
    blocks.push(css.slice(opener.lastIndex, i - 1));
  }
  return blocks;
}

/** Top-level `selector { declarations }` rules inside one block body. */
function rulesIn(block: string): { selector: string; body: string }[] {
  const rules: { selector: string; body: string }[] = [];
  let depth = 0;
  let start = 0;
  let selectorEnd = -1;
  for (let i = 0; i < block.length; i += 1) {
    const ch = block[i];
    if (ch === "{") {
      if (depth === 0) selectorEnd = i;
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        rules.push({
          selector: block.slice(start, selectorEnd).trim(),
          body: block.slice(selectorEnd + 1, i),
        });
        start = i + 1;
      }
    } else if (ch === ";" && depth === 0) {
      start = i + 1;
    }
  }
  return rules;
}

const UNIVERSAL = /(^|[\s,>+~(])\*(?=$|[\s,:.[)>+~])/;

/** Animation names a rule assigns, ignoring `none` and timing-only shorthands. */
function assignedAnimationNames(body: string): string[] {
  const names: string[] = [];
  for (const decl of body.split(";")) {
    const [prop, ...rest] = decl.split(":");
    const property = prop?.trim().toLowerCase();
    const value = rest
      .join(":")
      .replace(/!important/i, "")
      .trim();
    if (!value || value.toLowerCase() === "none") continue;
    if (property === "animation-name") names.push(value);
    if (
      property === "animation" &&
      /[a-z]/i.test(
        value
          .replace(
            /\b(\d*\.?\d+m?s|infinite|linear|ease(-in|-out|-in-out)?|forwards|backwards|both|alternate(-reverse)?|normal|reverse|running|paused|steps\([^)]*\)|cubic-bezier\([^)]*\)|var\([^)]*\)|\d+)\b/gi,
            ""
          )
          .replace(/[\s,]/g, "")
      )
    ) {
      names.push(value);
    }
  }
  return names;
}

describe("reduced-motion stylesheets", () => {
  it("never assign animation names to every element", () => {
    const offenders: string[] = [];
    for (const file of cssFiles(ROOT)) {
      const css = stripComments(readFileSync(file, "utf8"));
      for (const block of reducedMotionBlocks(css)) {
        for (const { selector, body } of rulesIn(block)) {
          if (selector.startsWith("@")) continue;
          if (!UNIVERSAL.test(selector)) continue;
          const names = assignedAnimationNames(body);
          if (names.length > 0) {
            offenders.push(
              `${relative(ROOT, file)}: ${selector.replace(/\s+/g, " ")} -> ${names.join("; ")}`
            );
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the app-wide rule that shortens running animations", () => {
    const appCss = stripComments(readFileSync(join(ROOT, "app.css"), "utf8"));
    const universalTiming = reducedMotionBlocks(appCss)
      .flatMap(rulesIn)
      .filter(
        ({ selector, body }) =>
          UNIVERSAL.test(selector) &&
          /animation-duration:\s*0\.01ms/.test(body) &&
          /animation-iteration-count:\s*1/.test(body)
      );
    expect(universalTiming.length).toBeGreaterThan(0);
  });

  it("flags the universal animation-name rule this test exists for", () => {
    const css = `@media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-name: spin, pulse !important; }
      .chip { animation: none !important; }
      * { animation-duration: 0.01ms !important; }
      @keyframes spin { from, to { transform: none; } }
    }`;
    const flagged = reducedMotionBlocks(css)
      .flatMap(rulesIn)
      .filter(
        ({ selector, body }) =>
          !selector.startsWith("@") &&
          UNIVERSAL.test(selector) &&
          assignedAnimationNames(body).length > 0
      )
      .map(({ selector }) => selector.replace(/\s+/g, " "));
    expect(flagged).toEqual(["*, *::before, *::after"]);
  });
});
