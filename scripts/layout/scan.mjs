#!/usr/bin/env node
/**
 * layout scan: counts breaks of the layout law in source, and judges a branch
 * on what the branch changed.
 *
 * Reads `.svelte` `<style>` blocks, `.svelte` markup and `.css` files under
 * `src/` and counts breaks of six rules on docs/architecture/layout-law.md.
 *
 *   npm run layout:scan                      compare this branch with main
 *   npm run layout:scan -- --totals          every break in src/, by rule
 *   npm run layout:scan -- --list <rule-id>  every break of one rule
 *   npm run layout:scan -- --list marked     every marked scrolling area
 *
 * The default run takes the files under src/ that differ from
 * `git merge-base HEAD main` (uncommitted edits and new files included, a
 * rename counted as a delete and an add), counts each rule in those files
 * before and after, and fails when a rule's total went up. A break that moves
 * with its code costs nothing; a new one fails whatever else is on main.
 *
 * A scrolling area that holds long content is marked on its line, or on the
 * line above: `/* scrolls: what it holds *\/`, at least 10 characters.
 *
 * src/lib/private/ is never listed, read or counted.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PRIVATE = "src/lib/private/";

/** Rule ids, the bold rule name on the law page, and what to do instead. */
export const RULES = {
  "one-type-size": {
    name: "One type size",
    fix: "Do not tie a font size to the window or set one in a wide-screen query; use a `--font-size-*` role, which is the same on every screen.",
  },
  "type-roles": {
    name: "Type roles",
    fix: "Use a `--font-size-*` role from src/app.css instead of a literal size, and define roles only in src/app.css.",
  },
  "seven-window-widths": {
    name: "Seven window widths",
    fix: "Use 480, 600, 768, 1024, 1440, 1680 or 2600px, or measure the component's own box with a container query.",
  },
  "page-never-scrolls": {
    name: "The page never scrolls",
    fix: "Make the screen fit instead of scrolling. If this is long content that scrolls in its own area (a library, a log, release notes), say what it holds on that line: `/* scrolls: ... */`.",
  },
  "text-fills": {
    name: "Text fills, then the screen rearranges",
    fix: "Do not cap text width in `ch`; let the text fill its box and give the screen a second column or a figure when lines get long.",
  },
  "shared-owners": {
    name: "Shared owners",
    fix: "Use `BaseModal` or `Drawer` instead of a hand-made dialog.",
  },
};
export const RULE_IDS = Object.keys(RULES);

/** Files that own dialogs and may write `role="dialog"` or `<dialog>`. */
const DIALOG_OWNERS = [
  "src/lib/shared/foundation/ui/modal/",
  "src/lib/shared/foundation/ui/drawer/",
  "src/lib/shared/foundation/ui/Drawer.svelte",
  "src/lib/shared/foundation/ui/DrawerHeader.svelte",
  "src/lib/shared/panels/",
];

const ALLOWED_WIDTHS = new Set(
  [480, 600, 768, 1024, 1440, 1680, 2600].flatMap((w) => [w, w - 1])
);
const WIDE_QUERY_MIN = 1600;
const WINDOW_UNIT =
  /(?:^|[^\w.-])-?(?:\d*\.)?\d+[dsl]?(?:vw|vh|vmin|vmax|vi|vb)\b/i;
const LITERAL_LENGTH = /(?:^|[^\w.-])-?(?:\d*\.)?\d+(?:px|rem|em)\b/i;

/** Replace every character except newlines with a space, keeping line numbers. */
function blank(text) {
  return text.replace(/[^\n]/g, " ");
}

/** Remove comments (and `//` comments for SCSS-like languages) but keep line numbers. */
export function stripCssComments(css, { lineComments = false } = {}) {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    const next = css[i + 1];
    if (ch === "/" && next === "*") {
      const end = css.indexOf("*/", i + 2);
      const stop = end === -1 ? css.length : end + 2;
      out += blank(css.slice(i, stop));
      i = stop;
    } else if (
      lineComments &&
      ch === "/" &&
      next === "/" &&
      css[i - 1] !== ":"
    ) {
      const end = css.indexOf("\n", i);
      const stop = end === -1 ? css.length : end;
      out += blank(css.slice(i, stop));
      i = stop;
    } else if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== ch && css[j] !== "\n")
        j += css[j] === "\\" ? 2 : 1;
      out += css.slice(i, j + 1);
      i = j + 1;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

/** Pixel widths named by a `@media` prelude, as { op, px } where op is min, max or any. */
export function mediaWidths(prelude) {
  const found = [];
  const toPx = (n, unit) => (unit === "px" ? n : n * 16);
  for (const m of prelude.matchAll(
    /(?<![\w-])(min|max)-width\s*:\s*((?:\d*\.)?\d+)(px|r?em)\b/gi
  )) {
    found.push({
      op: m[1].toLowerCase(),
      px: toPx(Number(m[2]), m[3].toLowerCase()),
    });
  }
  // Range syntax: `width >= 600px`, `600px <= width`, `400px < width < 700px`.
  for (const m of prelude.matchAll(
    /(?<![\w-])width\s*(<=|>=|<|>)\s*((?:\d*\.)?\d+)(px|r?em)\b/gi
  )) {
    found.push({
      op: m[1].startsWith(">") ? "min" : "max",
      px: toPx(Number(m[2]), m[3].toLowerCase()),
    });
  }
  for (const m of prelude.matchAll(
    /((?:\d*\.)?\d+)(px|r?em)\s*(<=|>=|<|>)\s*width(?![\w-])/gi
  )) {
    found.push({
      op: m[3].startsWith("<") ? "min" : "max",
      px: toPx(Number(m[1]), m[2].toLowerCase()),
    });
  }
  return found;
}

function isWideQuery(prelude) {
  return mediaWidths(prelude).some(
    (w) => w.op === "min" && w.px >= WIDE_QUERY_MIN
  );
}

/**
 * Count rule breaks in one CSS text. `lineOffset` is the 1-based line the text
 * starts on in its file. Returns [{ rule, line, text }].
 */
export function scanCss(
  css,
  { file = "", lineOffset = 1, lineComments = false, marks = null } = {}
) {
  const clean = stripCssComments(css, { lineComments });
  const rawLines = css.split("\n");
  const findings = [];
  const isAppCss = file === "src/app.css";
  const stack = []; // { prelude, wide }
  let buffer = "";
  let bufferStart = 0;
  let line = lineOffset;

  const add = (rule, at, text) =>
    findings.push({ rule, line: at, text: text.replace(/\s+/g, " ").trim() });

  const lineOfBufferStart = () => {
    // Line of the first non-space character in the buffer.
    const lead = buffer.match(/^\s*/)[0];
    return bufferStart + (lead.match(/\n/g) ?? []).length;
  };

  const declaration = () => {
    const text = buffer.trim();
    const at = lineOfBufferStart();
    buffer = "";
    if (!text || text.startsWith("@")) return;
    const colon = text.indexOf(":");
    if (colon <= 0) return;
    const prop = text.slice(0, colon).trim().toLowerCase();
    const value = text
      .slice(colon + 1)
      .replace(/!important/i, "")
      .trim();
    if (!/^(--)?[a-z-]+$/.test(prop)) return;
    const inWide = stack.some((s) => s.wide);
    const isFontSize = prop === "font-size";
    const definesRole = prop.startsWith("--font-size-");

    if (isFontSize || definesRole) {
      if (WINDOW_UNIT.test(value)) add("one-type-size", at, text);
      else if (inWide) add("one-type-size", at, text);
      else if (isFontSize && fontSizeIsLiteral(value))
        add("type-roles", at, text);
      if (definesRole && !isAppCss) add("type-roles", at, text);
    }
    if (
      /^overflow(-x|-y|-block|-inline)?$/.test(prop) &&
      /\b(auto|scroll)\b/i.test(value)
    ) {
      const reason = scrollMarker(rawLines, at - lineOffset);
      if (reason === null) add("page-never-scrolls", at, text);
      else
        marks?.push({
          line: at,
          text: text.replace(/\s+/g, " ").trim(),
          reason,
        });
    }
    if (
      (prop === "max-width" || prop === "max-inline-size") &&
      /(?:\d*\.)?\d+ch\b/i.test(value)
    ) {
      add("text-fills", at, text);
    }
  };

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (buffer === "") bufferStart = line;
    if (ch === "{") {
      const prelude = buffer.trim();
      const at = lineOfBufferStart();
      buffer = "";
      const isMedia = /^@media\b/i.test(prelude);
      if (isMedia) {
        for (const w of mediaWidths(prelude)) {
          if (!Number.isInteger(w.px) || !ALLOWED_WIDTHS.has(w.px)) {
            add("seven-window-widths", at, prelude);
            break;
          }
        }
      }
      stack.push({ prelude, wide: isMedia && isWideQuery(prelude) });
    } else if (ch === "}") {
      declaration();
      stack.pop();
    } else if (ch === ";") {
      declaration();
    } else {
      buffer += ch;
    }
    if (ch === "\n") line += 1;
  }
  declaration();
  return findings;
}

/**
 * A marked scrolling area: `/* scrolls: <what it holds> *\/` on the
 * declaration's line or the line directly above it, read from the raw text.
 * Returns the reason, or null when there is no marker of 10 characters or more.
 */
const SCROLL_MARKER = /\/\*\s*scrolls:\s*([\s\S]*?)\s*\*\//i;
export function scrollMarker(rawLines, index) {
  for (const i of [index, index - 1]) {
    const reason = SCROLL_MARKER.exec(rawLines[i] ?? "")?.[1]?.trim();
    if (reason && reason.length >= 10) return reason;
  }
  return null;
}

/** A font-size value that is a literal px, rem or em length. */
export function fontSizeIsLiteral(value) {
  const v = value.trim().toLowerCase();
  if (v === "1em" || v === "100%" || v === "inherit") return false;
  // A variable is not a literal, fallback included.
  let stripped = v;
  for (let guard = 0; guard < 10 && /var\(/.test(stripped); guard++) {
    stripped = stripped.replace(/var\([^()]*\)/g, "0");
  }
  return LITERAL_LENGTH.test(stripped);
}

/** Split a .svelte file into its style blocks and its markup. */
export function splitSvelte(source) {
  const styles = [];
  const lineAt = (index) =>
    (source.slice(0, index).match(/\n/g) ?? []).length + 1;
  let markup = source;
  for (const m of source.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi)) {
    const attrs = m[1];
    const lang =
      /\blang\s*=\s*["']?(\w+)/i.exec(attrs)?.[1]?.toLowerCase() ?? "css";
    const bodyStart = m.index + m[0].indexOf(">") + 1;
    styles.push({ css: m[2], lineOffset: lineAt(bodyStart), lang });
  }
  markup = markup.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, blank);
  markup = markup.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, blank);
  markup = markup.replace(/<!--[\s\S]*?-->/g, blank);
  return { styles, markup };
}

function isDialogOwner(file) {
  return DIALOG_OWNERS.some((owner) =>
    owner.endsWith("/") ? file.startsWith(owner) : file === owner
  );
}

/**
 * Count rule breaks in one file's text. Marked scrolling areas, which are not
 * breaks, are pushed onto `marks` when it is given.
 */
export function scanFile(file, source, marks = null) {
  if (file.startsWith(PRIVATE)) return [];
  const fileMarks = [];
  const tag = (list) => list.map((f) => ({ file, ...f }));
  const done = (findings) => {
    marks?.push(...tag(fileMarks));
    return tag(findings);
  };
  if (file.endsWith(".css"))
    return done(scanCss(source, { file, marks: fileMarks }));
  if (!file.endsWith(".svelte")) return [];
  const { styles, markup } = splitSvelte(source);
  const findings = [];
  for (const block of styles) {
    findings.push(
      ...scanCss(block.css, {
        file,
        lineOffset: block.lineOffset,
        lineComments: ["scss", "sass", "less", "postcss"].includes(block.lang),
        marks: fileMarks,
      })
    );
  }
  if (!isDialogOwner(file)) {
    const lines = markup.split("\n");
    lines.forEach((text, index) => {
      const hits =
        text.match(/\brole\s*=\s*["']?(?:alert)?dialog\b|<dialog\b/gi) ?? [];
      for (const _ of hits)
        findings.push({
          rule: "shared-owners",
          line: index + 1,
          text: text.trim(),
        });
    });
  }
  return done(findings);
}

// ---------- the tree ----------

function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** A file the scan reads: .svelte or .css under src/, never a private one. */
export function keepFile(file) {
  const f = file.replaceAll("\\", "/");
  return (
    f.startsWith("src/") &&
    !f.startsWith(PRIVATE) &&
    (f.endsWith(".svelte") || f.endsWith(".css"))
  );
}

const splitNul = (raw) =>
  raw
    .split("\0")
    .filter(Boolean)
    .map((f) => f.replaceAll("\\", "/"));

/** Tracked files plus new files git does not ignore; never private ones. */
export function listFiles(root) {
  const raw = git(root, [
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    "src",
  ]);
  return [...new Set(splitNul(raw))]
    .filter(keepFile)
    .filter((f) => existsSync(path.join(root, f)))
    .sort();
}

export function scanTree(root, marks = null) {
  const findings = [];
  for (const file of listFiles(root)) {
    findings.push(
      ...scanFile(file, readFileSync(path.join(root, file), "utf8"), marks)
    );
  }
  return findings;
}

/** Where this branch left main, or null with no main or no merge base. */
export function mergeBase(root) {
  try {
    return git(root, ["merge-base", "HEAD", "main"]).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Files under src/ that differ between `base` and the working tree, plus new
 * files git does not ignore. A rename counts as a delete and an add.
 */
export function changedFiles(root, base) {
  const diff = git(root, [
    "diff",
    "--name-only",
    "--no-renames",
    "-z",
    base,
    "--",
    "src",
  ]);
  const fresh = git(root, [
    "ls-files",
    "-z",
    "--others",
    "--exclude-standard",
    "--",
    "src",
  ]);
  return [...new Set([...splitNul(diff), ...splitNul(fresh)])]
    .filter(keepFile)
    .sort();
}

/** Findings in each changed file at `base` (missing = none) and now (deleted = none). */
export function beforeAndAfter(root, base, files) {
  const before = [];
  const after = [];
  for (const file of files) {
    let old = null;
    try {
      old = git(root, ["show", `${base}:${file}`]);
    } catch {
      old = null; // the file did not exist at base
    }
    if (old !== null) before.push(...scanFile(file, old));
    const now = path.join(root, file);
    if (existsSync(now))
      after.push(...scanFile(file, readFileSync(now, "utf8")));
  }
  return { before, after };
}

// ---------- the verdict ----------

function countBy(findings, key) {
  const counts = new Map();
  for (const f of findings) counts.set(key(f), (counts.get(key(f)) ?? 0) + 1);
  return counts;
}

/** The findings in `now` that were not in `old`, matched by text. */
function newLines(old, now) {
  const pool = old.map((f) => f.text);
  return now.filter((f) => {
    const i = pool.indexOf(f.text);
    if (i === -1) return true;
    pool.splice(i, 1);
    return false;
  });
}

/**
 * Judge a branch from the findings in its changed files before and after.
 * A rule fails when its total across those files went up. Pure: no git.
 */
export function judge(before, after) {
  const totalBefore = countBy(before, (f) => f.rule);
  const totalAfter = countBy(after, (f) => f.rule);
  const perBefore = countBy(before, (f) => `${f.file}|${f.rule}`);
  const perAfter = countBy(after, (f) => `${f.file}|${f.rule}`);
  const files = [...new Set([...before, ...after].map((f) => f.file))].sort();
  const rules = RULE_IDS.map((rule) => {
    const rose = [];
    const fell = [];
    for (const file of files) {
      const fb = perBefore.get(`${file}|${rule}`) ?? 0;
      const fa = perAfter.get(`${file}|${rule}`) ?? 0;
      const pick = (list) =>
        list.filter((f) => f.file === file && f.rule === rule);
      if (fa > fb)
        rose.push({
          file,
          before: fb,
          after: fa,
          lines: newLines(pick(before), pick(after)),
        });
      else if (fa < fb) fell.push({ file, before: fb, after: fa });
    }
    return {
      rule,
      before: totalBefore.get(rule) ?? 0,
      after: totalAfter.get(rule) ?? 0,
      rose,
      fell,
    };
  });
  return { failed: rules.some((r) => r.after > r.before), rules };
}

/** The scan's output for a verdict. */
export function formatVerdict(verdict, { changed, seconds }) {
  const files = `${changed} changed file${changed === 1 ? "" : "s"}`;
  if (!verdict.failed) {
    const fewer = verdict.rules
      .filter((r) => r.after < r.before)
      .map((r) => `${RULES[r.rule].name}: ${r.before - r.after} fewer`);
    return `layout scan: passed, ${files}, ${seconds} s${fewer.length ? `; ${fewer.join(", ")}` : ""}`;
  }
  const up = verdict.rules.filter((r) => r.after > r.before);
  const out = [
    `layout scan: FAILED, ${up.length} rule${up.length === 1 ? "" : "s"} went up across ${files} (${seconds} s)`,
    "",
  ];
  for (const r of up) {
    out.push(`${RULES[r.rule].name}: ${r.before} before, ${r.after} now`);
    for (const f of r.rose) {
      out.push(`  ${f.file}: ${f.before} -> ${f.after}`);
      for (const l of f.lines) out.push(`    line ${l.line}: ${l.text}`);
    }
    for (const f of r.fell)
      out.push(`  ${f.file}: ${f.before} -> ${f.after} (fewer)`);
    out.push(`  Instead: ${RULES[r.rule].fix}`, "");
  }
  return out.join("\n");
}

// ---------- command line ----------

function printTotals(findings, marks) {
  const counts = countBy(findings, (f) => f.rule);
  console.log("Layout breaks in src/, by rule:");
  for (const id of RULE_IDS)
    console.log(`  ${RULES[id].name}: ${counts.get(id) ?? 0}`);
  console.log(`  Marked scrolling areas: ${marks.length}`);
}

export function main(argv, root = process.cwd()) {
  const started = Date.now();
  const listAt = argv.indexOf("--list");

  if (listAt !== -1) {
    const what = argv[listAt + 1];
    if (what !== "marked" && !RULE_IDS.includes(what)) {
      console.error(
        `layout scan: --list needs one of ${[...RULE_IDS, "marked"].join(", ")}`
      );
      return 2;
    }
    const marks = [];
    const findings = scanTree(root, marks);
    if (what === "marked")
      for (const m of marks)
        console.log(`${m.file}:${m.line}: ${m.text}  (scrolls: ${m.reason})`);
    else
      for (const f of findings.filter((x) => x.rule === what))
        console.log(`${f.file}:${f.line}: ${f.text}`);
    return 0;
  }

  if (argv.includes("--totals")) {
    const marks = [];
    printTotals(scanTree(root, marks), marks);
    return 0;
  }

  const base = mergeBase(root);
  if (!base) {
    const marks = [];
    printTotals(scanTree(root, marks), marks);
    console.log(
      "layout scan: no main branch, or no merge base with it, so there is nothing to compare."
    );
    return 0;
  }
  const files = changedFiles(root, base);
  const { before, after } = beforeAndAfter(root, base, files);
  const verdict = judge(before, after);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(formatVerdict(verdict, { changed: files.length, seconds }));
  return verdict.failed ? 1 : 0;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main(process.argv.slice(2));
}
