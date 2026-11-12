#!/usr/bin/env node
// The feedback triager reads text written by strangers. It may run exactly
// one script, the way the /fb skill calls it: no argument, "list", "login",
// "claim <id>" or a bare id. Anything else is refused.
import { readHookCommand } from "./hook-command.js";

const ALLOWED =
  /^node scripts\/fetch-feedback\.js(?: (?:list|login|(?:claim )?[A-Za-z0-9_-]{6,40}))?$/;

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const { command } = readHookCommand(input);
  if (ALLOWED.test(command.trim())) process.exit(0);
  console.error(
    'BLOCKED: the feedback triager may only run "node scripts/fetch-feedback.js", with "list" or an item id.'
  );
  process.exit(2);
});
