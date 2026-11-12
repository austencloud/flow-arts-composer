#!/usr/bin/env node
// Pre-warms the ship preflight. The d2 CI replica takes about 22 minutes and
// used to start only when Austen said ship. This watches local main and, once
// main has sat still on a tree for ten minutes, runs
// `push-public.mjs --check` for it, so the verdict is usually already cached
// (by tree, in the shared .git folder) when `--push` runs. It never pushes.
//
// One run at a time. A tree that is already green or red on this machine, or
// already on GitHub main, is skipped. While another publish on this machine
// holds a preflight lock, it waits. If main moves during a run, the run
// finishes and the new tree gets its own quiet period. A run that ends with no
// verdict (d2 down, setup failure) is retried for that tree after 30 minutes.
//
// Every decision goes to publish-preflight-watch.log beside
// publish-preflight-green.txt; the d2 output goes to pm2's log.
//
//   node scripts/preflight-watch.mjs                     watch (pm2: tka-preflight-watch)
//   node scripts/preflight-watch.mjs --once --dry-run    print the decision for main now
//   ... [--repo <checkout>] [--quiet-minutes 10] [--poll-seconds 60]
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, readdirSync, renameSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  hasGreenPreflight,
  preflightLockHeld,
  redPreflight,
} from "./lib/publish-preflight.mjs";

export const DEFAULTS = {
  pollMs: 60_000,
  quietMs: 10 * 60_000,
  retryMs: 30 * 60_000,
};

const minutes = (ms) => `${Math.ceil(ms / 60_000)} min`;

/**
 * What to do about main right now. Pure: tick() gathers the facts.
 *
 * @param {{
 *   tree: string, now: number, quietSince: number,
 *   ownRun: string | null, published: boolean,
 *   cached: "green" | "red" | null, otherGate: boolean,
 *   lastFailure: { tree: string, at: number } | null,
 * }} facts
 * @returns {{ action: "running" | "published" | "cached-green" | "cached-red"
 *   | "waiting" | "busy" | "backoff" | "start", leftMs?: number }}
 */
export function decide(facts, config = DEFAULTS) {
  if (facts.ownRun) return { action: "running" };
  if (facts.published) return { action: "published" };
  if (facts.cached === "green") return { action: "cached-green" };
  if (facts.cached === "red") return { action: "cached-red" };
  const quietFor = facts.now - facts.quietSince;
  if (quietFor < config.quietMs)
    return { action: "waiting", leftMs: config.quietMs - quietFor };
  if (facts.otherGate) return { action: "busy" };
  const failure = facts.lastFailure;
  if (failure?.tree === facts.tree && facts.now - failure.at < config.retryMs)
    return {
      action: "backoff",
      leftMs: config.retryMs - (facts.now - failure.at),
    };
  return { action: "start" };
}

function describe(decision, tree, run) {
  const short = tree.slice(0, 10);
  switch (decision.action) {
    case "running":
      return `running: preflight for tree ${run.slice(0, 10)} in progress`;
    case "published":
      return `skipped-published: tree ${short} is already GitHub main's`;
    case "cached-green":
      return `skipped-cached: tree ${short} already green`;
    case "cached-red":
      return `skipped-cached: tree ${short} already red`;
    case "waiting":
      return `waiting: tree ${short}, ${minutes(decision.leftMs)} of quiet left`;
    case "busy":
      return `waiting: another publish on this machine holds a preflight lock`;
    case "backoff":
      return `waiting: tree ${short}'s last run had no verdict; retry in ${minutes(decision.leftMs)}`;
    case "start":
      return `start: tree ${short} quiet, not cached`;
  }
}

/**
 * The watcher's state and poll step, with git, the cache and the d2 run
 * injected (tests pass fakes; main() passes realDeps()).
 */
export function createWatcher(deps, config = DEFAULTS) {
  const state = {
    sha: null,
    tree: null,
    quietSince: 0,
    run: null, // tree of the preflight this watcher has in flight
    lastFailure: null,
    lastLine: null,
  };

  const log = (line, always = false) => {
    if (!always && line === state.lastLine) return;
    state.lastLine = line;
    deps.log(line);
  };

  async function finish(tree, promise) {
    let outcome;
    try {
      outcome = await promise;
    } catch (error) {
      outcome = { code: 1, job: null, error };
    }
    const cached = deps.cached(tree);
    log(
      `verdict: tree ${tree.slice(0, 10)} ${cached ?? "none"} (exit ${outcome.code}${outcome.job ? `, job ${outcome.job}` : ""}${outcome.error ? `, ${outcome.error.message}` : ""})`,
      true
    );
    if (!cached) state.lastFailure = { tree, at: deps.now() };
    state.run = null;
  }

  /** One poll. Returns the decision (and, when it started a run, its promise). */
  function tick({ dryRun = false } = {}) {
    const main = deps.readMain();
    if (!main) {
      log("error: could not read main");
      return { action: "error" };
    }
    const now = deps.now();
    if (main.sha !== state.sha) {
      // The reflog says when main really moved, so a restart of the watcher
      // does not reset the quiet period.
      const moved = deps.mainMovedAt();
      state.sha = main.sha;
      state.tree = main.tree;
      state.quietSince = moved != null && moved <= now ? moved : now;
      log(
        `tree seen: ${main.tree.slice(0, 10)} (main ${main.sha.slice(0, 10)}, moved ${new Date(state.quietSince).toISOString()})`
      );
    }
    const decision = decide(
      {
        tree: main.tree,
        now,
        quietSince: state.quietSince,
        ownRun: state.run,
        published: deps.publishedTree() === main.tree,
        cached: deps.cached(main.tree),
        otherGate: deps.otherGateLive(),
        lastFailure: state.lastFailure,
      },
      config
    );
    if (decision.action !== "start") {
      log(describe(decision, main.tree, state.run));
      return decision;
    }
    if (dryRun) {
      log(
        `would start: preflight for tree ${main.tree.slice(0, 10)} (main ${main.sha.slice(0, 10)})`,
        true
      );
      return decision;
    }
    state.run = main.tree;
    log(
      `started: preflight for tree ${main.tree.slice(0, 10)} (main ${main.sha.slice(0, 10)})`,
      true
    );
    const done = finish(
      main.tree,
      deps.runPreflight(main.sha, (job) =>
        log(`started job ${job} for tree ${main.tree.slice(0, 10)}`, true)
      )
    );
    return { ...decision, done };
  }

  return { tick, state };
}

// ---- the real git, cache and d2 calls ----------------------------------

const LOG_CAP_BYTES = 256 * 1024;

function realDeps(repo) {
  const git = (...argv) => {
    // pm2 runs this with no console, so a child spawned without windowsHide
    // gets its own Windows Terminal window and steals focus every minute.
    const result = spawnSync("git", ["-C", repo, ...argv], {
      encoding: "utf8",
      windowsHide: true,
    });
    return result.status === 0 ? result.stdout.trim() : null;
  };
  const commonDir = resolve(
    repo,
    git("rev-parse", "--git-common-dir") ?? ".git"
  );
  const logPath = join(commonDir, "publish-preflight-watch.log");

  return {
    commonDir,
    logPath,
    now: () => Date.now(),
    readMain() {
      const out = git("rev-parse", "refs/heads/main", "refs/heads/main^{tree}");
      if (!out) return null;
      const [sha, tree] = out.split(/\r?\n/);
      return { sha, tree };
    },
    mainMovedAt() {
      const seconds = Number(
        git("log", "-g", "-1", "--format=%ct", "refs/heads/main")
      );
      return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
    },
    // The remote-tracking ref push-public.mjs last fetched; no fetch here.
    publishedTree: () => git("rev-parse", "refs/remotes/origin/main^{tree}"),
    cached: (tree) =>
      hasGreenPreflight(tree) ? "green" : redPreflight(tree) ? "red" : null,
    // A live publish-preflight-<snapshot>.lock means a publish on this machine
    // is running its gate (gatePreflight holds the lock for the whole run).
    otherGateLive() {
      return readdirSync(commonDir).some((name) => {
        const key = /^publish-preflight-(.+)\.lock$/.exec(name)?.[1];
        return key != null && preflightLockHeld(key, commonDir);
      });
    },
    runPreflight(sha, onJob) {
      return new Promise((done) => {
        const child = spawn(
          process.execPath,
          ["scripts/push-public.mjs", "--ref", sha, "--check"],
          { cwd: repo, stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
        );
        let job = null;
        for (const stream of [child.stdout, child.stderr]) {
          stream.on("data", (chunk) => {
            process.stdout.write(chunk);
            const seen = /\bpublish-preflight-[0-9a-f]{10}-\d{6}\b/.exec(
              String(chunk)
            )?.[0];
            if (seen && !job) onJob((job = seen));
          });
        }
        child.on("error", (error) => done({ code: 1, job, error }));
        child.on("close", (code) => done({ code: code ?? 1, job }));
      });
    },
    log(line) {
      const stamped = `${new Date().toISOString()} ${line}`;
      console.log(stamped);
      try {
        if (statSync(logPath).size > LOG_CAP_BYTES)
          renameSync(logPath, `${logPath}.1`);
      } catch {
        // No log yet.
      }
      appendFileSync(logPath, `${stamped}\n`);
    },
  };
}

function argumentAfter(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? null : (argv[index + 1] ?? null);
}

async function main(argv) {
  const repo = resolve(
    argumentAfter(argv, "--repo") ??
      join(dirname(fileURLToPath(import.meta.url)), "..")
  );
  // publish-preflight.mjs finds the cache through the current directory.
  process.chdir(repo);
  const config = { ...DEFAULTS };
  const quiet = argumentAfter(argv, "--quiet-minutes");
  if (quiet) config.quietMs = Number(quiet) * 60_000;
  const poll = argumentAfter(argv, "--poll-seconds");
  if (poll) config.pollMs = Number(poll) * 1000;
  const once = argv.includes("--once");
  const dryRun = argv.includes("--dry-run");

  const deps = realDeps(repo);
  if (dryRun) {
    // A dry run prints, but leaves the watcher's log alone.
    deps.log = (line) => console.log(line);
    console.log(`repo ${repo}, log ${deps.logPath}`);
  }
  const watcher = createWatcher(deps, config);

  if (once) {
    const decision = watcher.tick({ dryRun });
    await decision.done;
    return;
  }
  deps.log(
    `watching ${repo}: poll ${config.pollMs / 1000}s, quiet ${config.quietMs / 60_000} min${dryRun ? ", dry run" : ""}`
  );
  for (;;) {
    const decision = watcher.tick({ dryRun });
    // Look again as soon as a run ends, so a main that moved mid-run gets
    // its quiet period counted from when it moved, not from the next poll.
    decision.done?.then(() => watcher.tick({ dryRun }));
    await new Promise((wake) => setTimeout(wake, config.pollMs));
  }
}

// pm2 loads the script with import() from its own container, so argv[1] is
// pm2's file there; pm_exec_path names this one.
const entry = process.env.pm_exec_path ?? process.argv[1];
if (
  entry &&
  resolve(fileURLToPath(import.meta.url)).toLowerCase() ===
    resolve(entry).toLowerCase()
) {
  await main(process.argv.slice(2));
}
