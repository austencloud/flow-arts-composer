#!/usr/bin/env node
/**
 * Git Safety Hook for Claude Code
 *
 * Blocks git commands that destroy uncommitted work, rewrite history, or
 * force push. Exit code 2 denies the tool call and shows stderr to Claude.
 *
 * Worktrees and branches inside them are the normal way to work here, so
 * `git worktree add`, `git branch` and `git switch -c` are allowed. Switching
 * or creating a branch in the PRIMARY checkout is still blocked: its `.git`
 * is a directory, while a worktree's `.git` is a file.
 */

import fs from 'node:fs';
import path from 'node:path';
import { readHookCommand } from './hook-command.js';

const rules = [
  // Discard uncommitted changes
  { pattern: /git\s+(-C\s+\S+\s+)?checkout\s+--\s*\./, msg: "This discards all uncommitted changes." },
  { pattern: /git\s+(-C\s+\S+\s+)?checkout\s+--\s+\S/, msg: "This discards uncommitted changes to a file." },
  { pattern: /git\s+(-C\s+\S+\s+)?reset\s+--hard/, msg: "This discards all uncommitted changes." },
  { pattern: /git\s+(-C\s+\S+\s+)?reset\s+(--soft\s+|--mixed\s+)?HEAD~/, msg: "This undoes commits and may lose work." },
  { pattern: /git\s+(-C\s+\S+\s+)?clean\s+-\w*f/, msg: "This permanently deletes untracked files." },
  { pattern: /git\s+(-C\s+\S+\s+)?restore\s+--staged\s+\.\s*($|[;&|])/, msg: "This unstages all staged changes." },

  // Broad staging that sweeps in other sessions' work
  { pattern: /git\s+(-C\s+\S+\s+)?add\s+(-A|--all|-u)\b/, msg: "Broad staging picks up other sessions' work. Add files by name." },
  { pattern: /git\s+(-C\s+\S+\s+)?add\s+\.\s*($|[;&|])/, msg: "git add . stages everything, including other sessions' work. Add files by name." },
  { pattern: /git\s+(-C\s+\S+\s+)?commit\s+(-\w*a\w*|--all)\b/, msg: "git commit -a commits every tracked change. Name the paths: git commit -m \"...\" -- <paths>." },

  // Stash is shared by every worktree and session
  { pattern: /git\s+(-C\s+\S+\s+)?stash\b(?!\s+list\b)/, msg: "git stash is shared across all sessions and worktrees. It needs Austen's explicit yes in this conversation." },

  // History rewriting
  { pattern: /git\s+(-C\s+\S+\s+)?lfs\s+migrate\b/, msg: "git lfs migrate rewrites history. It needs every other session stopped and Austen's yes." },
  { pattern: /git\s+(-C\s+\S+\s+)?filter-repo\b/, msg: "filter-repo rewrites every commit." },
  { pattern: /git\s+(-C\s+\S+\s+)?filter-branch\b/, msg: "filter-branch rewrites history." },

  // Force push
  { pattern: /git\s+(-C\s+\S+\s+)?push\s+.*(--force|-f\b|\s\+\S+)/, msg: "Force push can overwrite remote history." },

  // Guard bypass
  { pattern: /git\s+.*--no-verify\b/, msg: "--no-verify skips the repository's checks." },
];

// Only in the primary checkout: the branch stays on main.
const primaryOnlyRules = [
  { pattern: /git\s+(checkout\s+-b|switch\s+-c|switch\s+--create)\s/, msg: "Do not create a branch in the primary checkout. Use a worktree: git worktree add E:/worktrees/tka-platform/<name> -b codex/<name>." },
  { pattern: /git\s+(switch|checkout)\s+(?!-)(?!main\b)\S+\s*($|[;&|])/, msg: "The primary checkout stays on main. Work on other branches in a worktree." },
];

function isPrimaryCheckout(cwd) {
  if (!cwd) return false;
  try {
    return fs.statSync(path.join(cwd, '.git')).isDirectory();
  } catch {
    return false;
  }
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  const { command, cwd } = readHookCommand(input);
  if (!command) process.exit(0);

  const active = isPrimaryCheckout(cwd) ? [...rules, ...primaryOnlyRules] : rules;
  for (const { pattern, msg } of active) {
    if (pattern.test(command)) {
      console.error(`\nBLOCKED: ${msg}\n\nCommand: ${command.slice(0, 300)}\n\nAsk Austen for an explicit yes before running this. Every modified file is hours of his work.\n`);
      process.exit(2);
    }
  }
  process.exit(0);
});
