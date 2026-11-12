import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  formatVerdict,
  judge,
  keepFile,
  main,
  scanCss,
  scanFile,
  scanTree,
} from "../../../scripts/layout/scan.mjs";

// The scanner behind `npm run layout:scan` (scripts/layout/scan.mjs). A wrong
// count is silent: a missed break lets the law slip, and a false one blocks
// every merge that touches the file.
const rules = (css: string, file = "src/x.css") =>
  scanCss(css, { file }).map((f: { rule: string }) => f.rule);

describe("layout scan: One type size", () => {
  it("catches window units, inside clamp() and calc() too", () => {
    expect(rules(".a { font-size: 2vw; }")).toEqual(["one-type-size"]);
    expect(rules(".a { font-size: clamp(14px, 1.2dvh, 20px); }")).toEqual([
      "one-type-size",
    ]);
    expect(rules(".a { font-size: calc(1rem + .5vmin); }")).toEqual([
      "one-type-size",
    ]);
    expect(rules(".a { font-size: 3svw; }")).toEqual(["one-type-size"]);
  });
  it("counts a window-unit size once, not also as a literal", () => {
    expect(rules(".a { font-size: clamp(14px, 2vw, 20px); }")).toEqual([
      "one-type-size",
    ]);
  });
  it("catches any font size in a wide query, even a role, and role redefinitions there", () => {
    const css = `@media (min-width: 1680px) {
      .a { font-size: var(--font-size-lg); }
      :root { --font-size-sm: 1rem; }
    }`;
    expect(rules(css, "src/app.css")).toEqual([
      "one-type-size",
      "one-type-size",
    ]);
  });
  it("finds the wide query through a nested rule and range syntax", () => {
    expect(
      rules(
        ".a { @media (width >= 2600px) { .b { font-size: var(--font-size-sm); } } }"
      )
    ).toEqual(["one-type-size"]);
  });
  it("leaves narrow queries and container units alone", () => {
    expect(
      rules(
        "@media (min-width: 1440px) { .a { font-size: var(--font-size-sm); } }"
      )
    ).toEqual([]);
    expect(
      rules(
        ".a { font-size: 4cqi; } .b { font-size: clamp(0.5cqw, 3cqh, 9cqmin); }"
      )
    ).toEqual([]);
  });
});

describe("layout scan: Type roles", () => {
  it("catches literal px, rem and em sizes", () => {
    expect(
      rules(
        ".a { font-size: 13px } .b { font-size: .8rem; } .c { font-size: 1.2em; }"
      )
    ).toEqual(["type-roles", "type-roles", "type-roles"]);
  });
  it("allows roles, inherit, 1em, 100% and other variables with fallbacks", () => {
    expect(
      rules(
        ".a { font-size: var(--font-size-sm); } .b { font-size: inherit; } .c { font-size: 1em; } .d { font-size: 100%; } .e { font-size: var(--label, 12px) !important; }"
      )
    ).toEqual([]);
  });
  it("catches a role defined outside src/app.css and allows it there", () => {
    expect(
      rules(":root { --font-size-sm: 0.875rem; }", "src/lib/a.css")
    ).toEqual(["type-roles"]);
    expect(rules(":root { --font-size-sm: 0.875rem; }", "src/app.css")).toEqual(
      []
    );
  });
  it("ignores font-size inside comments", () => {
    expect(
      rules("/* font-size: 12px; overflow: auto; */ .a { color: red; }")
    ).toEqual([]);
    expect(rules(".a { /* was font-size: 3vw */ color: red; }")).toEqual([]);
  });
});

describe("layout scan: Seven window widths", () => {
  it("accepts the seven and one below each", () => {
    expect(rules("@media (max-width: 767px) { .a { color: red } }")).toEqual(
      []
    );
    expect(
      rules(
        "@media (min-width: 600px) and (max-width: 1023px) { .a { color: red } }"
      )
    ).toEqual([]);
    expect(rules("@media (48em <= width) { .a { color: red } }")).toEqual([]);
  });
  it("catches other widths, once per query, in px, em and range syntax", () => {
    expect(
      rules(
        "@media (max-width: 640px) and (min-width: 300px) { .a { color: red } }"
      )
    ).toEqual(["seven-window-widths"]);
    expect(
      rules("@media (400px < width < 1024px) { .a { color: red } }")
    ).toEqual(["seven-window-widths"]);
    expect(rules("@media (max-width: 40rem) { .a { color: red } }")).toEqual([
      "seven-window-widths",
    ]);
  });
  it("catches a query nested inside a rule", () => {
    expect(rules(".a { @media (max-width: 900px) { color: red; } }")).toEqual([
      "seven-window-widths",
    ]);
  });
  it("skips height queries and container queries", () => {
    expect(rules("@media (max-height: 500px) { .a { color: red } }")).toEqual(
      []
    );
    expect(
      rules("@container (max-width: 333px) { .a { color: red } }")
    ).toEqual([]);
  });
});

describe("layout scan: The page never scrolls, and Text fills", () => {
  it("counts each overflow set to auto or scroll", () => {
    expect(
      rules(
        ".a { overflow: auto; overflow-x: hidden; overflow-y: scroll; overflow: hidden auto }"
      )
    ).toEqual([
      "page-never-scrolls",
      "page-never-scrolls",
      "page-never-scrolls",
    ]);
  });
  it("counts max-width in ch, not in a query", () => {
    expect(
      rules(
        ".a { max-width: 60ch; } .b { max-width: min(42ch, 100%); } .c { max-width: 40rem; }"
      )
    ).toEqual(["text-fills", "text-fills"]);
  });
});

describe("layout scan: .svelte files", () => {
  const svelte = [
    '<script lang="ts">',
    "  const markup = '<div role=\"dialog\">';",
    "</script>",
    "<!-- <dialog> in a comment -->",
    '<div role="dialog" aria-modal="true"></div>',
    '<style lang="scss">',
    "  // font-size: 3vw in a line comment",
    "  .a { font-size: 13px; }",
    "</style>",
  ].join("\n");

  it("scans <style lang> blocks with their real line numbers and SCSS comments", () => {
    const found = scanFile("src/lib/A.svelte", svelte);
    expect(found).toEqual([
      {
        file: "src/lib/A.svelte",
        rule: "type-roles",
        line: 8,
        text: "font-size: 13px",
      },
      {
        file: "src/lib/A.svelte",
        rule: "shared-owners",
        line: 5,
        text: '<div role="dialog" aria-modal="true"></div>',
      },
    ]);
  });
  it("lets the dialog owners write dialogs", () => {
    expect(
      scanFile(
        "src/lib/shared/foundation/ui/modal/BaseModal.svelte",
        "<dialog open></dialog>"
      ).map((f: { rule: string }) => f.rule)
    ).toEqual([]);
  });
  it("never reads a private file", () => {
    expect(
      scanFile(
        "src/lib/private/X.svelte",
        "<style>.a { font-size: 2vw }</style>"
      )
    ).toEqual([]);
  });
});

type Finding = { file: string; rule: string; line: number; text: string };
const at = (
  file: string,
  rule: string,
  line: number,
  text: string
): Finding => ({
  file,
  rule,
  line,
  text,
});

describe("layout scan: the marked scrolling area", () => {
  it("is not counted with the marker on the same line or the line above", () => {
    expect(
      rules(".a { overflow-y: auto; /* scrolls: the release notes list */ }")
    ).toEqual([]);
    expect(
      rules(
        ".a {\n  /* scrolls: every saved sequence */\n  overflow-y: auto;\n}"
      )
    ).toEqual([]);
  });
  it("needs 10 characters and must sit directly above", () => {
    expect(rules(".a { overflow-y: auto; /* scrolls: list */ }")).toEqual([
      "page-never-scrolls",
    ]);
    expect(
      rules(
        ".a {\n  /* scrolls: every saved sequence */\n\n  overflow-y: auto;\n}"
      )
    ).toEqual(["page-never-scrolls"]);
  });
  it("does nothing for any other rule", () => {
    expect(
      rules(".a { font-size: 13px; /* scrolls: the release notes list */ }")
    ).toEqual(["type-roles"]);
    expect(
      rules(
        ".a {\n  /* scrolls: the release notes list */\n  max-width: 60ch;\n}"
      )
    ).toEqual(["text-fills"]);
  });
  it("is reported with its reason in .svelte style blocks", () => {
    const marks: Array<{ file: string; line: number; reason: string }> = [];
    const found = scanFile(
      "src/lib/List.svelte",
      "<div></div>\n<style>\n  .list {\n    overflow-y: auto; /* scrolls: the long library list */\n  }\n</style>",
      marks
    );
    expect(found).toEqual([]);
    expect(marks).toEqual([
      expect.objectContaining({
        file: "src/lib/List.svelte",
        line: 4,
        reason: "the long library list",
      }),
    ]);
  });
});

describe("layout scan: judging a branch on what it changed", () => {
  const verdictText = (before: Finding[], after: Finding[]) =>
    formatVerdict(judge(before, after), { changed: 2, seconds: "0.1" });

  it("fails a new break and names the file and line", () => {
    const before = [at("src/a.css", "type-roles", 3, "font-size: 12px")];
    const after = [
      ...before,
      at("src/a.css", "type-roles", 9, "font-size: 13px"),
    ];
    const verdict = judge(before, after);
    expect(verdict.failed).toBe(true);
    const text = verdictText(before, after);
    expect(text).toContain("Type roles: 1 before, 2 now");
    expect(text).toContain("src/a.css: 1 -> 2");
    expect(text).toContain("line 9: font-size: 13px");
    expect(text).not.toContain("line 3:");
    expect(text).toContain("Instead: Use a `--font-size-*` role");
  });

  it("passes a break that moves with its code: a rename and a split", () => {
    const old = [
      at("src/Big.svelte", "type-roles", 10, "font-size: 12px"),
      at("src/Big.svelte", "page-never-scrolls", 20, "overflow: auto"),
    ];
    const renamed = old.map((f) => ({ ...f, file: "src/Bigger.svelte" }));
    expect(judge(old, renamed).failed).toBe(false);
    const split = [
      at("src/Big.svelte", "type-roles", 10, "font-size: 12px"),
      at("src/Part.svelte", "page-never-scrolls", 4, "overflow: auto"),
    ];
    expect(judge(old, split).failed).toBe(false);
  });

  it("passes two removed and one added under one rule", () => {
    const before = [
      at("src/a.css", "text-fills", 1, "max-width: 40ch"),
      at("src/a.css", "text-fills", 2, "max-width: 50ch"),
    ];
    const after = [at("src/b.css", "text-fills", 5, "max-width: 60ch")];
    const verdict = judge(before, after);
    expect(verdict.failed).toBe(false);
    expect(formatVerdict(verdict, { changed: 2, seconds: "0.1" })).toContain(
      "Text fills, then the screen rearranges: 1 fewer"
    );
  });

  it("fails one added under one rule and one removed under another, and shows both sides", () => {
    const before = [at("src/a.css", "page-never-scrolls", 1, "overflow: auto")];
    const after = [at("src/b.css", "type-roles", 2, "font-size: 11px")];
    const verdict = judge(before, after);
    expect(verdict.failed).toBe(true);
    const text = verdictText(before, after);
    expect(text).toContain("Type roles: 0 before, 1 now");
    expect(text).not.toContain("The page never scrolls: 1 before");
  });

  it("lists the files where a failing rule fell, so the sum is visible", () => {
    const before = [at("src/a.css", "type-roles", 1, "font-size: 12px")];
    const after = [
      at("src/b.css", "type-roles", 1, "font-size: 12px"),
      at("src/b.css", "type-roles", 2, "font-size: 13px"),
    ];
    const text = verdictText(before, after);
    expect(text).toContain("src/a.css: 1 -> 0 (fewer)");
    expect(text).toContain("src/b.css: 0 -> 2");
  });
});

describe("layout scan: files it reads", () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), "layout-scan-test-"));
  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  // A repo with no main branch and no commits: one public and one private
  // style file, both breaking Type roles.
  execFileSync("git", ["init", "-q", "-b", "trunk"], { cwd: repo });
  const privateDir = path.join(repo, "src", "lib", "private");
  mkdirSync(privateDir, { recursive: true });
  writeFileSync(path.join(repo, "src", "a.css"), ".a { font-size: 13px; }\n");
  writeFileSync(path.join(privateDir, "p.css"), ".p { font-size: 11px; }\n");

  const run = (argv: string[]) => {
    const lines: string[] = [];
    const log = vi
      .spyOn(console, "log")
      .mockImplementation((...a: unknown[]) => {
        lines.push(a.join(" "));
      });
    try {
      return { code: main(argv, repo), out: lines.join("\n") };
    } finally {
      log.mockRestore();
    }
  };

  it("keeps .svelte and .css under src/ and never a private path", () => {
    expect(keepFile("src/lib/A.svelte")).toBe(true);
    expect(keepFile("src/app.css")).toBe(true);
    expect(keepFile("src/lib/a.ts")).toBe(false);
    expect(keepFile("static/a.css")).toBe(false);
    expect(keepFile(path.posix.join("src", "lib", "private", "A.svelte"))).toBe(
      false
    );
  });

  it("never reads or lists a private file", () => {
    const { code, out } = run(["--list", "type-roles"]);
    expect(code).toBe(0);
    expect(out).toContain("src/a.css:1: font-size: 13px");
    expect(out).not.toContain("private");
    expect(out).not.toContain("11px");
  });

  it("exits 0 with nothing to compare when there is no main", () => {
    const { code, out } = run([]);
    expect(code).toBe(0);
    expect(out).toContain("nothing to compare");
    expect(out).toContain("Type roles: 1");
  });
});

describe("layout scan: the whole tree", () => {
  // A smoke test: every tracked file reads and scans without throwing. It
  // asserts no counts; the branch comparison is what gates a merge.
  it("scans every tracked style file", () => {
    const findings = scanTree(process.cwd());
    expect(Array.isArray(findings)).toBe(true);
    expect(findings.some((f: { file: string }) => !keepFile(f.file))).toBe(
      false
    );
  }, 60_000);
});
