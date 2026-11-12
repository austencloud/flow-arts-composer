#!/usr/bin/env node
/**
 * Dev Server Guard for Claude Code
 *
 * Blocks commands that would kill the user's dev server on port 5173.
 * A task server goes on a free port other than 5173.
 * Returns exit code 2 to deny the action.
 */

import { readHookCommand } from './hook-command.js';

const rules = [
  // A dev server is fine on another port; without --port it lands on 5173.
  { pattern: /(npm|pnpm)\s+(run\s+)?dev(?![\w:-])(?![^;&|\n]*--port[ =](?!5173\b)\d+)/, msg: "This would start a second server on 5173, which pm2 owns as tka-dev. Pass --port <free port>, or run 'pm2 restart tka-dev' if 5173 is down." },
  { pattern: /pm2\s+(stop|delete|kill)\b/, msg: "Do not stop the pm2 dev server. Use 'pm2 restart tka-dev'." },
  { pattern: /kill-port\s+5173\b/, msg: "Port 5173 belongs to the user. Never kill it." },
  { pattern: /npx\s+kill-port\s+5173\b/, msg: "Port 5173 belongs to the user. Never kill it." },
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
`);
      process.exit(2);
    }
  }
  process.exit(0);
});
