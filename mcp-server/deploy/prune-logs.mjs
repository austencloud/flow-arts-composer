/**
 * prune-logs: keep the newest 200 rotated service logs and delete the rest.
 *
 * NSSM rotates mcp-stdout.log and mcp-stderr.log before every start and never
 * deletes the old copies, so a crash loop leaves two files per attempt (about
 * 20,000 by 2026-09-27). run-mcp-http.cmd calls this just before it starts the
 * server. It touches only rotated names directly in the given folder, never the
 * live logs NSSM holds open or anything in a subfolder, and it never fails the
 * start: problems go to stdout and the exit code stays 0.
 *
 *   node prune-logs.mjs <logs folder>
 */
import { readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const KEEP = 200;
// NSSM names a rotated copy after the live file plus its UTC rotation time.
const ROTATED_LOG = /^mcp-std(?:out|err)-(\d{8}T\d{6}\.\d{3})\.log$/;

try {
  const folder = process.argv[2];
  if (!folder) throw new Error("no logs folder given");
  const rotated = readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => ({
      name: entry.name,
      stamp: ROTATED_LOG.exec(entry.name)?.[1],
    }))
    .filter((log) => log.stamp)
    .sort(
      (a, b) => b.stamp.localeCompare(a.stamp) || b.name.localeCompare(a.name)
    );
  let removed = 0;
  let kept = 0;
  for (const { name } of rotated.slice(KEEP)) {
    try {
      unlinkSync(join(folder, name));
      removed += 1;
    } catch {
      kept += 1;
    }
  }
  if (removed || kept) {
    process.stdout.write(
      `[prune-logs] Removed ${removed} rotated logs beyond the newest ${KEEP}` +
        `${kept ? `; ${kept} could not be removed` : ""}.\n`
    );
  }
} catch (problem) {
  process.stdout.write(`[prune-logs] Skipped: ${problem.message}\n`);
}
