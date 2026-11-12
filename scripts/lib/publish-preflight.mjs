// The publish preflight: runs Web App CI's validate steps on d2 against the
// exact snapshot commit push-public.mjs is about to push, and says whether
// that commit is green. A red Web App CI run on main skips the production
// deploy without any alert (three publishes on 2026-10-22 never went live),
// so push-public.mjs refuses to publish what this calls red or incomplete.
import { spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

// Trees that passed, one sha per line, in the shared .git folder so every
// worktree on this machine sees them. Keyed by tree, not commit: GitHub main
// moving gives the snapshot a new parent and sha but the same files.
function greenListPath() {
  // Every spawn in this file sets windowsHide. Under pm2 (preflight-watch.mjs)
  // there is no console to inherit, so an unhidden child opens its own
  // focus-stealing window.
  const common = spawnSync("git", ["rev-parse", "--git-common-dir"], {
    encoding: "utf8",
    windowsHide: true,
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

// Trees that came back red, `<tree>\t<when>\t<failing steps>` per line, so a
// --push after a red pre-warm (scripts/preflight-watch.mjs) refuses at once
// instead of rerunning the 22-minute replica. A later green for the tree wins.
function redListPath() {
  return join(dirname(greenListPath()), "publish-preflight-red.txt");
}

/** @returns {{ at: string, failed: string[] } | null} the tree's last red record */
export function redPreflight(tree) {
  const path = redListPath();
  if (!existsSync(path)) return null;
  const line = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .findLast((entry) => entry.startsWith(`${tree}\t`));
  if (!line) return null;
  const [, at, failed = ""] = line.split("\t");
  return { at, failed: failed ? failed.split(", ") : [] };
}

export function recordRedPreflight(tree, failed) {
  const steps = failed.map((step) => step.replace(/[\t\r\n]+/g, " "));
  appendFileSync(
    redListPath(),
    `${tree}\t${new Date().toISOString()}\t${steps.join(", ")}\n`
  );
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
    windowsHide: true,
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

// Streams a d2-run.ps1 call and reads the verdict from what it printed.
function streamD2Run(argv) {
  return new Promise((resolve) => {
    const child = spawn(
      "pwsh",
      ["-NoProfile", "-File", "scripts/d2-run.ps1", ...argv],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
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

/** Runs the replica on d2 for `sha`, streaming d2-run's progress. */
export function runPreflight(sha) {
  return streamD2Run([
    "-Ref",
    sha,
    "-Name",
    JOB_NAME,
    "-TailLines",
    "150",
    "-Command",
    "node scripts/ci-replica.mjs",
  ]);
}

/** Waits for an existing d2 job (or reads a finished one) and returns its verdict. */
export function attachPreflight(id) {
  return streamD2Run(["-Job", id, "-TailLines", "150"]);
}

// One gate per snapshot. The snapshot commit is deterministic, so two sessions
// publishing the same main build the same sha; on 2026-10-27 the second d2-run
// either lost the race for refs/heads/d2-run/<sha> or shared the scratch
// worktree with the first and both suites died (EBUSY, timeouts). A second
// caller now waits for the first job and takes its verdict.
//
// The ref refs/heads/d2-run/<sha> is not a sign of a running job: d2-run never
// deletes it, so it outlives every finished run. The job folder is the record.
const JOB_NAME = "publish-preflight";
const JOBS_ROOT = "C:/Users/Austen/d2-jobs";
// d2-run creates the job folder before pushing setup files and writing
// meta.txt (worktree add, a low-disk prune). Older than this without meta.txt
// means the setup died.
const STARTING_MINUTES = 15;

/**
 * Parses the listing jobListing() prints on d2, one job per line:
 * `<id> exit|alive|gone|nometa <minutes since the folder was made>`.
 *
 * @returns {{ id: string, state: "done" | "running" | "starting" | "dead" }[]}
 */
export function parseJobList(stdout) {
  return stdout.split(/\r?\n/).flatMap((line) => {
    const [id, mark, minutes] = line.trim().split(/\s+/);
    if (!id?.startsWith(`${JOB_NAME}-`) || !mark) return [];
    const state =
      mark === "exit"
        ? "done"
        : mark === "alive"
          ? "running"
          : mark === "nometa" && Number(minutes) < STARTING_MINUTES
            ? "starting"
            : "dead";
    return [{ id, state }];
  });
}

// PowerShell for d2, single quotes only, so it survives ssh's quoting. A job is
// finished once exit.txt exists (d2-run-remote.ps1 writes it right after the
// log's "== exit N" line); before that, meta.txt's pid (the cmd.exe wrapping
// run.ps1) says whether it is still alive.
function jobListing(key) {
  return [
    `Get-ChildItem '${JOBS_ROOT}' -Directory -Filter '${JOB_NAME}-${key}-*' -ErrorAction SilentlyContinue |`,
    "Sort-Object CreationTime | ForEach-Object {",
    "$d = $_.FullName; $meta = Join-Path $d 'meta.txt';",
    "$mark = if (Test-Path (Join-Path $d 'exit.txt')) { 'exit' }",
    "elseif (-not (Test-Path $meta)) { 'nometa' }",
    "elseif ((Get-Content $meta -Raw) -match 'pid=(\\d+)' -and (Get-Process -Id ([int]$Matches[1]) -ErrorAction SilentlyContinue)) { 'alive' }",
    "else { 'gone' };",
    "$_.Name + ' ' + $mark + ' ' + [int]((Get-Date) - $_.CreationTime).TotalMinutes }",
  ].join(" ");
}

/** The publish-preflight jobs on d2 for a snapshot, oldest first; null if d2 could not say. */
export function listPreflightJobs(key) {
  const probe = spawnSync(sshBin, [...SSH, jobListing(key)], {
    encoding: "utf8",
    timeout: 60_000,
    windowsHide: true,
  });
  return probe.status === 0 ? parseJobList(probe.stdout ?? "") : null;
}

// Closes the gap between "no job on d2 yet" and d2-run creating the job folder
// (the git push alone can take a minute) for sessions on this machine. A file
// in the shared .git folder, created exclusively, holding the owner's pid.
function lockPath(key, dir) {
  return join(dir ?? dirname(greenListPath()), `publish-preflight-${key}.lock`);
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function lockOwner(path) {
  try {
    return Number.parseInt(readFileSync(path, "utf8"), 10);
  } catch {
    return null;
  }
}

/** Takes the local lock for a snapshot; false while a live process holds it. */
export function acquirePreflightLock(key, dir) {
  const path = lockPath(key, dir);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(path, String(process.pid), { flag: "wx" });
      return true;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const owner = lockOwner(path);
      // An unreadable file is mid-write by its owner, not stale.
      if (owner === null || pidAlive(owner)) return false;
      rmSync(path, { force: true });
    }
  }
  return false;
}

export function preflightLockHeld(key, dir) {
  const path = lockPath(key, dir);
  if (!existsSync(path)) return false;
  const owner = lockOwner(path);
  return owner === null || pidAlive(owner);
}

export function releasePreflightLock(key, dir) {
  const path = lockPath(key, dir);
  if (lockOwner(path) === process.pid) rmSync(path, { force: true });
}

const realDeps = {
  listJobs: listPreflightJobs,
  start: runPreflight,
  attach: attachPreflight,
  acquireLock: acquirePreflightLock,
  lockHeld: preflightLockHeld,
  releaseLock: releasePreflightLock,
  sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
  log: (line) => console.log(line),
  pollMs: 20_000,
};

const live = (job) => job.state === "running" || job.state === "starting";

/**
 * The preflight for `sha` with at most one d2 job per snapshot. A job already
 * running on d2, or one another publish on this machine is starting, is waited
 * for and its verdict reused; otherwise this starts one. It never starts a
 * second job for the same snapshot, so a red or unfinished job it waited for
 * is returned as is.
 */
export async function gatePreflight(sha, overrides = {}) {
  const deps = { ...realDeps, ...overrides };
  const key = sha.slice(0, 10);
  const waitFor = (job) => {
    deps.log(
      `Another publish gate is already running for this snapshot (job ${job.id}); waiting for it.`
    );
    return deps.attach(job.id);
  };

  // A listing d2 could not give (null) counts as no job: start as before.
  const running = () => (deps.listJobs(key) ?? []).find(live);
  let job = running();
  if (job) return waitFor(job);

  if (deps.acquireLock(key)) {
    try {
      // Another machine may have started one since the first look.
      job = running();
      if (!job) return await deps.start(sha);
    } finally {
      deps.releaseLock(key);
    }
    return waitFor(job);
  }

  // Another publish on this machine holds the lock and is starting the job.
  deps.log(
    "Another publish on this machine is starting the gate for this snapshot; waiting for its d2 job."
  );
  const before = new Set((deps.listJobs(key) ?? []).map((seen) => seen.id));
  for (;;) {
    const jobs = deps.listJobs(key) ?? [];
    job = jobs.find(live);
    if (job) return waitFor(job);
    if (!deps.lockHeld(key)) {
      // It finished before this saw it run: read the job it made, if any.
      job = jobs.findLast((seen) => !before.has(seen.id));
      if (job) return waitFor(job);
      return {
        verdict: "incomplete",
        failed: [],
        steps: [],
        error: new Error(
          "the other publish gate stopped without leaving a d2 job"
        ),
      };
    }
    await deps.sleep(deps.pollMs);
  }
}
