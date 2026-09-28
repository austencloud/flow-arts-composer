import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const DEPLOY = path.join(process.cwd(), "mcp-server", "deploy");
const PRUNE = path.join(DEPLOY, "prune-logs.mjs");

// NSSM's rotated name: the live log plus the UTC rotation time.
function rotated(stream: "stdout" | "stderr", minute: number) {
  const stamp = new Date(Date.UTC(2026, 8, 27, 0, minute))
    .toISOString()
    .replace(/[-:Z]/g, "");
  return `mcp-${stream}-${stamp}.log`;
}

describe("prune-logs.mjs", () => {
  let folder = "";
  afterEach(() => {
    if (folder) rmSync(folder, { recursive: true, force: true });
    folder = "";
  });

  it("keeps the newest 200 rotated logs and leaves everything else alone", () => {
    folder = mkdtempSync(path.join(tmpdir(), "mcp-prune-logs-"));
    const attempts = Array.from({ length: 103 }, (_, minute) => minute);
    const bystanders = [
      "mcp-stdout.log",
      "mcp-stderr.log",
      "notes.txt",
      `${rotated("stderr", 0)}.bak`,
    ];
    for (const minute of attempts) {
      writeFileSync(path.join(folder, rotated("stdout", minute)), "");
      writeFileSync(path.join(folder, rotated("stderr", minute)), "");
    }
    for (const name of bystanders) writeFileSync(path.join(folder, name), "");
    const archive = path.join(folder, "archive-2026-09-28");
    mkdirSync(archive);
    writeFileSync(path.join(archive, rotated("stderr", 0)), "");

    const run = spawnSync(process.execPath, [PRUNE, folder], {
      encoding: "utf8",
    });

    expect(run.status).toBe(0);
    expect(run.stdout).toContain(
      "Removed 6 rotated logs beyond the newest 200"
    );
    const left = readdirSync(folder);
    for (const minute of [0, 1, 2]) {
      expect(left).not.toContain(rotated("stdout", minute));
      expect(left).not.toContain(rotated("stderr", minute));
    }
    expect(left).toContain(rotated("stderr", 3));
    expect(left).toEqual(
      expect.arrayContaining([...bystanders, "archive-2026-09-28"])
    );
    expect(left).toHaveLength(200 + bystanders.length + 1);
    expect(readdirSync(archive)).toHaveLength(1);
  });

  it("never fails the service start", () => {
    folder = mkdtempSync(path.join(tmpdir(), "mcp-prune-logs-"));
    const run = spawnSync(
      process.execPath,
      [PRUNE, path.join(folder, "missing")],
      { encoding: "utf8" }
    );
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("[prune-logs] Skipped");
    expect(run.stderr).toBe("");
  });
});

// Both files name a script by path; a rename would silently stop the pruning
// or leave the scheduled task running a file that is not there.
describe("service wiring", () => {
  it("the service launcher calls scripts that exist", () => {
    const launcher = readFileSync(
      path.join(DEPLOY, "run-mcp-http.cmd"),
      "utf8"
    );
    const scripts = [...launcher.matchAll(/%~dp0([\w.-]+\.mjs)/g)].map(
      (match) => match[1]
    );
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      expect(existsSync(path.join(DEPLOY, script))).toBe(true);
    }
  });

  it("the watch task runs a watcher that exists", () => {
    const installer = readFileSync(
      path.join(DEPLOY, "install-watch-task.ps1"),
      "utf8"
    );
    const watcher = /Join-Path \$mainCheckout '([^']+\.mjs)'/.exec(
      installer
    )?.[1];
    expect(watcher).toBeDefined();
    expect(
      existsSync(path.join(process.cwd(), ...(watcher ?? "").split("\\")))
    ).toBe(true);
  });
});
