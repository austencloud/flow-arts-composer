import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The boot splash in src/app.html decides, before SvelteKit loads, whether a
// path is a public page. Landing mode never reports load progress, so a public
// route missing from that inline list sits behind the #app-loading bar until
// the 15 s safety net. The list is hand-maintained; this keeps it covering the
// two registries the router itself uses (/shape-engine, /faq and
// /learn/concepts were all missing at once before this existed).

const readSource = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf-8");

const appHtml = readSource("src/app.html");
const domains = readSource("src/config/domains.ts");

function stripLineComments(source: string): string {
  return source
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

function extractArrayLiteral(source: string, arrayName: string): string[] {
  const cleaned = stripLineComments(source);
  const re = new RegExp(
    `${arrayName}\\s*(?::[^=]+)?=\\s*(?:new Set\\()?\\[([\\s\\S]*?)\\]`
  );
  const match = cleaned.match(re);
  if (!match) {
    throw new Error(`Could not find array literal for ${arrayName} in source`);
  }
  const strings: string[] = [];
  const strRe = /"([^"]*)"|'([^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = strRe.exec(match[1])) !== null) strings.push(m[1] ?? m[2]);
  return strings;
}

interface BootRules {
  exact: string[];
  prefixes: string[];
}

function extractBootRules(source: string): BootRules {
  const match = source.match(/var isLanding =([\s\S]*?);/);
  if (!match) throw new Error("Could not find the isLanding chain in app.html");
  const body = match[1];
  return {
    exact: [...body.matchAll(/p === "([^"]+)"/g)].map((m) => m[1]),
    prefixes: [...body.matchAll(/p\.startsWith\("([^"]+)"\)/g)].map(
      (m) => m[1]
    ),
  };
}

const bootRules = extractBootRules(appHtml);
const publicPathPrefixes = extractArrayLiteral(domains, "PUBLIC_PATH_PREFIXES");
const landingPaths = extractArrayLiteral(domains, "LANDING_PATHS");

function bootsAsLanding(path: string): boolean {
  return (
    bootRules.exact.includes(path) ||
    bootRules.prefixes.some((prefix) => path.startsWith(prefix))
  );
}

describe("landing boot paths contract", () => {
  it("extracted the boot list and both router registries", () => {
    expect(bootRules.exact.length).toBeGreaterThan(0);
    expect(bootRules.prefixes.length).toBeGreaterThan(0);
    expect(publicPathPrefixes.length).toBeGreaterThan(0);
    expect(landingPaths.length).toBeGreaterThan(0);
  });

  it("every LANDING_PATHS entry skips the boot splash", () => {
    for (const path of landingPaths) {
      expect(
        bootsAsLanding(path),
        `"${path}" is in LANDING_PATHS but the isLanding list in src/app.html does not match it`
      ).toBe(true);
    }
  });

  it("every PUBLIC_PATH_PREFIXES entry skips the boot splash", () => {
    for (const prefix of publicPathPrefixes) {
      expect(
        bootsAsLanding(prefix),
        `"${prefix}" is in PUBLIC_PATH_PREFIXES but the isLanding list in src/app.html does not match it`
      ).toBe(true);
    }
  });
});
