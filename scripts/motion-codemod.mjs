#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const durationTokens = new Map([
  ["100ms", "var(--duration-instant)"],
  ["0.1s", "var(--duration-instant)"],
  ["120ms", "var(--duration-instant)"],
  ["0.12s", "var(--duration-instant)"],
  ["140ms", "var(--duration-fast)"],
  ["150ms", "var(--duration-fast)"],
  ["0.15s", "var(--duration-fast)"],
  ["160ms", "var(--duration-fast)"],
  ["0.16s", "var(--duration-fast)"],
  ["180ms", "var(--duration-fast)"],
  ["0.18s", "var(--duration-fast)"],
  ["200ms", "var(--duration-normal)"],
  ["0.2s", "var(--duration-normal)"],
  ["250ms", "var(--duration-normal)"],
  ["0.25s", "var(--duration-normal)"],
  ["280ms", "var(--duration-emphasis)"],
  ["300ms", "var(--duration-emphasis)"],
  ["0.3s", "var(--duration-emphasis)"],
  ["320ms", "var(--duration-emphasis)"],
  ["0.32s", "var(--duration-emphasis)"],
  ["350ms", "var(--duration-dramatic)"],
  ["0.35s", "var(--duration-dramatic)"],
  ["400ms", "var(--duration-dramatic)"],
  ["0.4s", "var(--duration-dramatic)"],
  ["420ms", "var(--duration-dramatic)"],
  ["0.42s", "var(--duration-dramatic)"],
  ["500ms", "var(--duration-dramatic)"],
  ["0.5s", "var(--duration-dramatic)"],
]);

const durationPattern = [...durationTokens.keys()]
  .sort((left, right) => right.length - left.length)
  .map(escapeRegExp)
  .join("|");
const mappedDurationRegex = new RegExp(
  `(?<![\\w.+-])(?:${durationPattern})(?![\\w.])`,
  "gi"
);
const anyDurationRegex =
  /(?<![\w.])[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:ms|s)(?![\w.])/gi;
const fallbackRegex = new RegExp(
  `var\\(\\s*(--duration-[\\w-]+)\\s*,\\s*(?:${durationPattern})\\s*\\)`,
  "gi"
);
const declarationRegex =
  /(^|[;{\n])([\t\r ]*)((?:transition|animation)(?:-duration|-delay)?)(\s*:\s*)([^;]*)(;)/gim;

const easingRules = [
  [
    /cubic-bezier\(\s*0\.4\s*,\s*0\s*,\s*0\.2\s*,\s*1\s*\)/gi,
    "var(--ease-standard)",
  ],
  [
    /cubic-bezier\(\s*0\.16\s*,\s*1\s*,\s*0\.3\s*,\s*1\s*\)/gi,
    "var(--ease-out)",
  ],
  [
    /cubic-bezier\(\s*0\.34\s*,\s*1\.56\s*,\s*0\.64\s*,\s*1\s*\)/gi,
    "var(--ease-spring)",
  ],
  [
    /cubic-bezier\(\s*0\.25\s*,\s*0\.1\s*,\s*0\.25\s*,\s*1\s*\)/gi,
    "var(--ease-smooth)",
  ],
  [/(?<![-\w])ease-in-out(?![-\w])/gi, "var(--ease-standard)"],
  [/(?<![-\w])ease-out(?![-\w])/gi, "var(--ease-standard-out)"],
  [/(?<![-\w])ease-in(?![-\w])/gi, "var(--ease-standard-in)"],
  [/(?<![-\w])ease(?![-\w])/gi, "var(--ease-standard)"],
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function maskComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\r\n]/g, " ")
  );
}

function replaceAndCount(text, regex, replacement) {
  let count = 0;
  const rewritten = text.replace(regex, (...args) => {
    count += 1;
    return typeof replacement === "function"
      ? replacement(...args)
      : replacement;
  });
  return { text: rewritten, replacements: count };
}

function rewriteValue(value, rewriteDurations) {
  let replacements = 0;
  const pieces = value.split(/(\/\*[\s\S]*?\*\/)/g);

  for (let index = 0; index < pieces.length; index += 2) {
    let piece = pieces[index];

    if (rewriteDurations) {
      let result = replaceAndCount(
        piece,
        fallbackRegex,
        (_match, tokenName) => `var(${tokenName})`
      );
      piece = result.text;
      replacements += result.replacements;

      result = replaceAndCount(piece, mappedDurationRegex, (raw) =>
        durationTokens.get(raw.toLowerCase())
      );
      piece = result.text;
      replacements += result.replacements;
    }

    for (const [regex, token] of easingRules) {
      const result = replaceAndCount(piece, regex, token);
      piece = result.text;
      replacements += result.replacements;
    }

    pieces[index] = piece;
  }

  return { text: pieces.join(""), replacements };
}

export function rewriteCss(cssText) {
  const maskedCss = maskComments(cssText);
  const matches = [...maskedCss.matchAll(declarationRegex)];
  let text = "";
  let cursor = 0;
  let replacements = 0;
  const humanLines = [];

  for (const match of matches) {
    const declarationStart = match.index;
    const valueOffset = match[0].length - match[5].length - match[6].length;
    const valueStart = declarationStart + valueOffset;
    const valueEnd = valueStart + match[5].length;
    const maskedValue = maskedCss.slice(valueStart, valueEnd);
    const trimmedValue = maskedValue.trim();

    text += cssText.slice(cursor, valueStart);
    cursor = valueEnd;

    if (/\binfinite\b/i.test(maskedValue)) {
      text += cssText.slice(valueStart, valueEnd);
      continue;
    }

    const startsWithAll = /^all(?:\s|,|$)/i.test(trimmedValue);
    const durations = [...maskedValue.matchAll(anyDurationRegex)].map(
      (duration) => duration[0].toLowerCase()
    );
    const hasUnknownDuration = durations.some(
      (duration) =>
        duration !== "0s" && duration !== "0ms" && !durationTokens.has(duration)
    );

    if (startsWithAll || hasUnknownDuration) {
      const propertyStart =
        declarationStart + match[1].length + match[2].length;
      const lineStart = cssText.lastIndexOf("\n", propertyStart - 1) + 1;
      const lineEndIndex = cssText.indexOf("\n", propertyStart);
      const lineEnd = lineEndIndex === -1 ? cssText.length : lineEndIndex;
      humanLines.push(cssText.slice(lineStart, lineEnd).trim());
    }

    if (startsWithAll) {
      text += cssText.slice(valueStart, valueEnd);
      continue;
    }

    const result = rewriteValue(
      cssText.slice(valueStart, valueEnd),
      !hasUnknownDuration
    );
    text += result.text;
    replacements += result.replacements;
  }

  text += cssText.slice(cursor);
  return { text, replacements, humanLines };
}

function rewriteSvelte(source) {
  let replacements = 0;
  const humanLines = [];
  const text = source.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi,
    (_match, open, css, close) => {
      const result = rewriteCss(css);
      replacements += result.replacements;
      humanLines.push(...result.humanLines);
      return `${open}${result.text}${close}`;
    }
  );
  return { text, replacements, humanLines };
}

function walkFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(absolutePath));
    else if (
      entry.isFile() &&
      (entry.name.endsWith(".svelte") || entry.name.endsWith(".css"))
    ) {
      files.push(absolutePath);
    }
  }
  return files;
}

function printDiff(relativePath, before, after) {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  console.log(`--- a/${relativePath}`);
  console.log(`+++ b/${relativePath}`);

  let index = 0;
  while (index < beforeLines.length) {
    if (beforeLines[index] === afterLines[index]) {
      index += 1;
      continue;
    }

    const start = index;
    while (
      index < beforeLines.length &&
      beforeLines[index] !== afterLines[index]
    )
      index += 1;
    console.log(
      `@@ -${start + 1},${index - start} +${start + 1},${index - start} @@`
    );
    for (let line = start; line < index; line += 1)
      console.log(`-${beforeLines[line]}`);
    for (let line = start; line < index; line += 1)
      console.log(`+${afterLines[line]}`);
  }
}

function parseArguments(args) {
  let write = false;
  const only = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--write") write = true;
    else if (args[index] === "--only" && args[index + 1])
      only.push(args[++index]);
    else throw new Error(`Unknown or incomplete argument: ${args[index]}`);
  }
  return { write, only };
}

function main() {
  const { write, only } = parseArguments(process.argv.slice(2));
  const repositoryRoot = process.cwd();
  const sourceRoot = path.join(repositoryRoot, "src");
  const roots = only.length
    ? only.map((prefix) => {
        const root = path.resolve(sourceRoot, prefix);
        const relativeRoot = path.relative(sourceRoot, root);
        if (path.isAbsolute(relativeRoot) || relativeRoot.startsWith("..")) {
          throw new Error(`--only must stay under src/: ${prefix}`);
        }
        return root;
      })
    : [sourceRoot];
  const excludedTransitions =
    path.join(sourceRoot, "lib", "shared", "transitions") + path.sep;
  const excludedAppCss = path.join(sourceRoot, "app.css");
  const files = [
    ...new Set(
      roots.flatMap((root) => {
        if (!fs.existsSync(root))
          throw new Error(
            `Path does not exist: ${path.relative(repositoryRoot, root)}`
          );
        return fs.statSync(root).isDirectory() ? walkFiles(root) : [root];
      })
    ),
  ].filter(
    (file) => file !== excludedAppCss && !file.startsWith(excludedTransitions)
  );

  let changedFiles = 0;
  let totalReplacements = 0;
  const humanLines = [];

  for (const file of files.sort()) {
    const before = fs.readFileSync(file, "utf8");
    const result = file.endsWith(".svelte")
      ? rewriteSvelte(before)
      : rewriteCss(before);
    const relativePath = path
      .relative(repositoryRoot, file)
      .replaceAll(path.sep, "/");
    humanLines.push(
      ...result.humanLines.map((line) => `${relativePath}: ${line}`)
    );
    if (result.text === before) continue;

    changedFiles += 1;
    totalReplacements += result.replacements;
    if (write) fs.writeFileSync(file, result.text);
    else printDiff(relativePath, before, result.text);
  }

  if (humanLines.length > 0) {
    console.log("Left for a human:");
    for (const line of humanLines) console.log(`  ${line}`);
  }
  console.log(`${changedFiles} files, ${totalReplacements} replacements`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
