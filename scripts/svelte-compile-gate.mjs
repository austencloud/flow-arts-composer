/**
 * Compile the .svelte files a branch changed, the way the build does.
 *
 * Run the project's preprocessors and compiler explicitly so template and
 * preprocessing errors cannot pass integration when the type-checker's
 * project coverage is limited. A compile or preprocess error fails this
 * gate; warnings are printed but do not.
 *
 * Positions are mapped back to the file on disk. Stripping TypeScript from a
 * <script> block shortens it, so the compiler's line numbers for everything
 * below it are off by that many lines until mapped.
 *
 * Usage:  node scripts/svelte-compile-gate.mjs [base]   (default base: main)
 * Run it from the repository root after `.svelte-kit` exists; TypeScript
 * preprocessing reads tsconfig.json, which extends $app/tsconfig.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { SourceMap } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { compile, preprocess } from "svelte/compiler";

/** Repo-relative .svelte paths added or modified on HEAD since it left base. */
export function changedSvelteFiles(base, cwd = process.cwd()) {
  const output = execFileSync(
    "git",
    ["diff", "--name-only", "-z", "--diff-filter=d", `${base}...HEAD`],
    { cwd, encoding: "utf8" }
  );
  return output.split("\0").filter((path) => path.endsWith(".svelte"));
}

async function loadSvelteConfig(cwd) {
  const path = join(cwd, "src", "config", "svelte-options.js");
  if (!existsSync(path)) return {};
  return (await import(pathToFileURL(path).href)).svelteOptions ?? {};
}

/**
 * Preprocess and compile each file with the project's Svelte options
 * (src/config/svelte-options.js, shared with vite.config.ts) found in cwd.
 * Returns one { file, errors, warnings } entry per file; each diagnostic is
 * { code, message, line?, column? } with 1-based positions in the original.
 */
export async function compileSvelteFiles(files, { cwd = process.cwd() } = {}) {
  const config = await loadSvelteConfig(cwd);
  const preprocessors = config.preprocess
    ? [config.preprocess].flat().map(recordBlockStart)
    : [];
  const results = [];
  for (const file of files) {
    const filename = resolve(cwd, file);
    const source = readFileSync(filename, "utf8");
    results.push({
      file,
      ...(await compileOne(source, filename, preprocessors, config)),
    });
  }
  return results;
}

async function compileOne(source, filename, preprocessors, config) {
  let code = source;
  let map = null;
  if (preprocessors.length) {
    try {
      const processed = await preprocess(source, preprocessors, { filename });
      code = processed.code;
      if (processed.map) map = new SourceMap(processed.map);
    } catch (error) {
      return { errors: [preprocessFailure(error)], warnings: [] };
    }
  }
  try {
    const { warnings } = compile(code, {
      ...config.compilerOptions,
      filename,
      generate: "client",
      dev: true,
    });
    return {
      errors: [],
      warnings: warnings.map((warning) => diagnostic(warning, map)),
    };
  } catch (error) {
    return { errors: [diagnostic(error, map)], warnings: [] };
  }
}

function diagnostic({ code, message, start }, map) {
  return {
    code: code ?? "compile_failed",
    message: String(message).split("\n")[0],
    ...originalPosition(start, map),
  };
}

// Svelte positions are a 1-based line and 0-based column in the preprocessed
// code. A line with no mapping of its own (a <style> body PostCSS returned
// without a map) takes the nearest mapped line above it and keeps its offset.
function originalPosition(start, map) {
  if (!start) return {};
  let { line, column } = start;
  const entry = map?.findEntry(line - 1, column);
  if (entry?.originalLine !== undefined) {
    const lineOffset = line - 1 - entry.generatedLine;
    line = entry.originalLine + 1 + lineOffset;
    if (lineOffset === 0)
      column = entry.originalColumn + (column - entry.generatedColumn);
  }
  return { line, column: column + 1 };
}

// The script transform and PostCSS report errors against the block's content, so
// "Foo.svelte:4:10" in their message means line 4 of the <script>, not of the
// file. Record where the block starts so the report can point into the file.
function recordBlockStart(group) {
  const wrapped = { ...group };
  for (const kind of ["script", "style"]) {
    if (!group[kind]) continue;
    wrapped[kind] = async (options) => {
      try {
        return await group[kind](options);
      } catch (error) {
        const offset = options.markup.indexOf(options.content);
        if (offset !== -1 && error && typeof error === "object") {
          const before = options.markup.slice(0, offset).split("\n");
          error.blockStart = {
            line: before.length,
            column: before.at(-1).length,
          };
        }
        throw error;
      }
    };
  }
  return wrapped;
}

function preprocessFailure(error) {
  const { blockStart } = error ?? {};
  // Rolldown (vite-plugin-svelte 7) reports the position and an ANSI-colored
  // message on each entry of `errors`, also relative to the block.
  const first = error?.errors?.[0];
  const loc = error?.loc ?? first?.loc;
  const text =
    first?.text ??
    (first?.message && stripVTControlCharacters(first.message)) ??
    error?.reason ??
    String(error?.message ?? error);
  const failure = { code: "preprocess_failed", message: text.split("\n")[0] };
  if (!loc || !blockStart) return failure;
  return {
    ...failure,
    line: blockStart.line + loc.line - 1,
    column: (loc.line === 1 ? blockStart.column : 0) + loc.column + 1,
  };
}

function formatDiagnostic(severity, file, { code, message, line, column }) {
  const where = line ? `${file}:${line}:${column}` : file;
  return `    ${severity.padEnd(7)} ${where}  ${code}  ${message}`;
}

async function main() {
  const base = process.argv[2] ?? "main";
  const files = changedSvelteFiles(base);
  if (!files.length) {
    console.log(`    compile gate: no .svelte files changed since ${base}`);
    return;
  }
  console.log(
    `    compile gate: compiling ${files.length} changed .svelte file(s) …`
  );
  const results = await compileSvelteFiles(files);
  let errorCount = 0;
  let warningCount = 0;
  for (const { file, errors, warnings } of results) {
    for (const error of errors)
      console.error(formatDiagnostic("error", file, error));
    for (const warning of warnings)
      console.log(formatDiagnostic("warning", file, warning));
    errorCount += errors.length;
    warningCount += warnings.length;
  }
  console.log(
    `    compile gate: ${errorCount} error(s), ${warningCount} warning(s) in ${files.length} file(s)`
  );
  if (errorCount) process.exitCode = 1;
}

const isMainModule =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMainModule) {
  main().catch((error) => {
    console.error(`svelte-compile-gate failed: ${error.message}`);
    process.exitCode = 1;
  });
}
