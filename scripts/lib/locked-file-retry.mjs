// d2 is a Windows box shared by several jobs, and a fresh scratch install is
// read by antivirus and its neighbours while vitest's workers start. A worker
// that opens a module at that moment dies with EBUSY: its suite reports FAIL
// with no test run, or never starts at all. Both publish preflights on
// 2026-10-27 went red that way with every test that ran passing.
//
// lockedFileRetry reads a failed vitest step's output and, when every failure
// is a locked file, returns the command that reruns just those suites. Any
// real test failure returns null, so nothing that failed an assertion is ever
// retried.

const ANSI = /\x1b\[[0-9;]*m/g;

/**
 * @param {string} output the step's full output
 * @param {string} run the step's command, e.g. "pnpm run test -- --run"
 * @param {string} root the checkout the paths are relative to
 * @returns {{ files: string[], command: string } | null}
 */
export function lockedFileRetry(output, run, root) {
  // Only a vitest run that takes file filters after `--run`.
  if (!/(?:^|\s)--run$/.test(run)) return null;
  const text = output.replace(ANSI, "");
  if (!/\bEBUSY\b/.test(text)) return null;

  const files = new Set();
  for (const line of text.split(/\r?\n/)) {
    const fail = /^\s*FAIL\s+(\S+)(.*)$/.exec(line);
    if (fail) {
      // `FAIL  file > suite > test` is an assertion failure; `FAIL  file [ file ]`
      // is a suite that never loaded.
      if (fail[2].includes(" > ")) return null;
      files.add(fail[1]);
    }
    const worker =
      /Failed to start \w+ worker for test files (.+?)\.?\s*$/.exec(line);
    if (worker) for (const file of worker[1].split(/,\s*/)) files.add(file);
  }
  if (files.size === 0) return null;

  const prefix = root.replace(/\\/g, "/").replace(/\/?$/, "/").toLowerCase();
  const relative = [...files].map((file) => {
    const path = file.replace(/\\/g, "/");
    return path.toLowerCase().startsWith(prefix)
      ? path.slice(prefix.length)
      : path;
  });
  // pnpm hands a literal `--` on to vitest, which then drops every file
  // filter after it and reruns the whole suite; pnpm passes options after the
  // script name straight through, so the retry leaves the separator out.
  const base = run.replace(/\s+--\s+--run$/, " --run");
  return { files: relative, command: `${base} ${relative.join(" ")}` };
}
