#!/usr/bin/env node
/**
 * Bulk Replace Guard for Claude Code
 *
 * Blocks commands that run sed/perl/awk replacements across broad directory
 * trees. These always cause collateral damage in a complex codebase.
 * Returns exit code 2 to deny the action.
 *
 * ALLOWED: sed on a single named file (e.g. sed -i 's/foo/bar/' path/to/file.ts)
 * BLOCKED: sed piped from find, or sed targeting directories via wildcards/globs
 */

import { readHookCommand } from './hook-command.js';

const rules = [
  // find ... -exec sed — the exact pattern that caused the 2026-05-07 incident
  {
    pattern: /find\s+.*-exec\s+sed\b/,
    msg: "find -exec sed runs blind replacements across entire directory trees. Fix files individually or use subagents."
  },
  // find ... | xargs sed
  {
    pattern: /find\s+.*\|\s*xargs\s+sed\b/,
    msg: "find | xargs sed runs blind replacements across entire directory trees. Fix files individually or use subagents."
  },
  // sed -i with a glob/wildcard target (not a single file)
  // Catches: sed -i 's/x/y/' src/lib/**/*.ts, sed -i 's/x/y/' *.svelte
  {
    // -i is required: `sed -n '1,5p' docs/*.md` only reads. The shell-snapshots
    // exemption keeps the onecmd recovery command in the global CLAUDE.md working.
    pattern: /sed\s+-i\S*\s+(-e\s+)?'[^']*'\s+(?!\S*shell-snapshots)\S*\*/,
    msg: "sed with glob/wildcard targets runs across many files blindly. Fix files individually or use subagents."
  },
  {
    pattern: /sed\s+-i\S*\s+(-e\s+)?"[^"]*"\s+(?!\S*shell-snapshots)\S*\*/,
    msg: "sed with glob/wildcard targets runs across many files blindly. Fix files individually or use subagents."
  },
  {
    // Unquoted expression: sed -i s/a/b/ src/*.ts
    pattern: /sed\s+-i\S*\s+(-e\s+)?[^'"\s-]\S*\s+(?!\S*shell-snapshots)\S*\*/,
    msg: "sed with glob/wildcard targets runs across many files blindly. Fix files individually or use subagents."
  },
  // find ... -exec sed with + terminator
  {
    pattern: /find\s+.*-exec\s+sed\b.*\+\s*$/,
    msg: "find -exec sed runs blind replacements across entire directory trees. Fix files individually or use subagents."
  },
  // grep -rl ... | xargs sed (common pattern for bulk replacement)
  {
    pattern: /grep\s+.*-[a-z]*l.*\|\s*xargs\s+sed\b/,
    msg: "grep -l | xargs sed runs blind replacements across many files. Fix files individually or use subagents."
  },
  // perl -pi -e across directories
  {
    pattern: /perl\s+-p?i\s+.*\s+\S*\*/,
    msg: "perl -pi with glob targets runs across many files blindly. Fix files individually or use subagents."
  },
  // for loop with sed -i on broad targets
  {
    pattern: /for\s+.*;\s*do.*sed\s+-i.*\{\}.*done/s,
    msg: "Loop with sed -i runs replacements across many files. Fix files individually or use subagents."
  },
];

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  const { command } = readHookCommand(input);
  if (!command) process.exit(0);

  for (const { pattern, msg } of rules) {
    if (pattern.test(command)) {
      console.error(`
BLOCKED: ${msg}

Command: ${command.slice(0, 200)}

Use the Edit tool for individual files.
`);
      process.exit(2);
    }
  }
  process.exit(0);
});
