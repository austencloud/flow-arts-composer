// The publish preflight: runs Web App CI's validate steps on d2 against the
// exact snapshot commit push-public.mjs is about to push, and says whether
// that commit is green. A red Web App CI run on main skips the production
// deploy without any alert (three publishes on 2026-10-22 never went live),
// so push-public.mjs refuses to publish what this calls red or incomplete.
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Trees that passed, one sha per line, in the shared .git folder so every
// worktree on this machine sees them. Keyed by tree, not commit: GitHub main
// moving gives the snapshot a new parent and sha but the same files.
function greenListPath() {
  const common = spawnSync("git", ["rev-parse", "--git-common-dir"], {
    encoding: "utf8",
  }).stdout.trim();
  return resolve(common, "publish-preflight-green.txt");
}

export function hasGreenPreflight(tree) {
  const path = greenListPath();
  return (
    existsSync(path) && readFileSync(path, "utf8").split(/\r?\n/).includes(tree)
  );
}

export function recordGreenPreflight(tree) {
  appendFileSync(greenListPath(), `${tree}\n`);
}

const SSH = [
  "-o",
  "BatchMode=yes",
  "-o",
  "ConnectTimeout=10",
  "-l",
  "austen",
  "d2",
];

// Windows keeps ssh in System32OpenSSH, which some shells lack on PATH
// (d2-run.ps1 falls back the same way).
const windowsSsh = join(
  process.env.SystemRoot ?? "C:/Windows",
  "System32/OpenSSH/ssh.exe"
);
const sshBin =
  process.platform === "win32" && existsSync(windowsSsh) ? windowsSsh : "ssh";

export function d2Reachable() {
  const probe = spawnSync(sshBin, [...SSH, "echo ok"], {
    encoding: "utf8",
    timeout: 30_000,
  });
  return probe.status === 0 && /ok/.test(probe.stdout ?? "");
}

/**
 * Reads ci-replica.mjs's closing lines out of a d2-run.ps1 transcript.
 * "incomplete" means the replica never printed its summary: d2-run failed to
 * push or install, the commit predates ci-replica.mjs, or the log was cut.
 *
 * @returns {{ verdict: "green" | "red" | "incomplete", failed: string[], steps: string[] }}
 */
export function readVerdict(output, exitCode) {
  const lines = output.split(/\r?\n/);
  const summary = lines
    .map((line) => /=== SUMMARY (green|red)\b/.exec(line))
    .findLast(Boolean);
  const failed = lines.flatMap(
    (line) => /^=== FAILED (.+)$/.exec(line.trim())?.[1] ?? []
  );
  const steps = lines.flatMap(
    (line) => /=== RESULT .+$/.exec(line.trimEnd())?.[0] ?? []
  );
  if (!summary) return { verdict: "incomplete", failed, steps };
  // An exit code that disagrees with the summary is not trusted as green.
  if (summary[1] === "green" && exitCode === 0)
    return { verdict: "green", failed, steps };
  return {
    verdict: summary[1] === "green" ? "incomplete" : "red",
    failed,
    steps,
  };
}

/** Runs the replica on d2 for `sha`, streaming d2-run's progress. */
export function runPreflight(sha) {
  return new Promise((resolve) => {
    const child = spawn(
      "pwsh",
      [
        "-NoProfile",
        "-File",
        "scripts/d2-run.ps1",
        "-Ref",
        sha,
        "-Name",
        "publish-preflight",
        "-TailLines",
        "150",
        "-Command",
        "node scripts/ci-replica.mjs",
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    let output = "";
    for (const stream of [child.stdout, child.stderr]) {
      stream.on("data", (chunk) => {
        output += chunk;
        process.stdout.write(chunk);
      });
    }
    child.on("error", (error) => resolve({ ...readVerdict(output, 1), error }));
    child.on("close", (code) => resolve(readVerdict(output, code ?? 1)));
  });
}
