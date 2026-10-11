import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SCRIPT = join(process.cwd(), "scripts", "worktree-automerge.mjs");
const BRANCH = "codex/test-finish";

// Each test's beforeEach builds a repository with a worktree through nine git
// processes, and most tests then run the finish script, which spawns several
// more: 0.6 to 4.5 s per test and 22 s for the file with the cores free
// (ten-file runs, 2026-10-08 and 2026-10-09). Under the full suite's 31 forks
// each process start waits on every other worker: the file took 120 to 133 s
// in both full runs on 2026-10-08, and one of them timed its hooks out at the
// 10 s default. Tests get the 120 s tests/unit/3d-animation gives a loaded
// machine; the repository hooks get 60 s.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

describe("worktree finish lifecycle", () => {
  let root: string;
  let repo: string;
  let task: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "tka-worktree-finish-"));
    repo = join(root, "repo");
    task = join(root, "task");
    mkdirSync(repo);

    git(repo, "init", "-b", "main");
    git(repo, "config", "user.email", "worktree-test@example.com");
    git(repo, "config", "user.name", "Worktree Test");
    git(repo, "config", "core.autocrlf", "false");
    // Directory-only patterns do not ignore a symlink on Linux.
    writeFileSync(join(repo, ".gitignore"), "node_modules\n");
    writeFileSync(join(repo, "shared.txt"), "base\n");
    git(repo, "add", ".gitignore", "shared.txt");
    git(repo, "commit", "-m", "base");
    git(repo, "branch", BRANCH);
    git(repo, "worktree", "add", task, BRANCH);
  });

  afterEach(() => {
    rmSync(root, {
      force: true,
      maxRetries: 3,
      recursive: true,
      retryDelay: 100,
    });
  });

  function commitTaskFile(path: string, contents: string) {
    mkdirSync(dirname(join(task, path)), { recursive: true });
    writeFileSync(join(task, path), contents);
    git(task, "add", path);
    git(task, "commit", "-m", `change ${path}`);
  }

  function finish(cwd = repo, ...extraArgs: string[]) {
    return spawnSync(
      process.execPath,
      [
        SCRIPT,
        "--finish",
        BRANCH,
        "--nonvisual",
        "--skip-checks",
        ...extraArgs,
      ],
      { cwd, encoding: "utf8" }
    );
  }

  it("merges to local main, preserves unrelated dirt, and removes the task worktree and branch", () => {
    commitTaskFile("feature.txt", "finished\n");
    writeFileSync(join(repo, "local-note.txt"), "keep me\n");
    mkdirSync(join(task, "node_modules", "cache"), { recursive: true });
    writeFileSync(join(task, "node_modules", "cache", "artifact"), "ignored\n");

    const result = finish();

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(readFileSync(join(repo, "feature.txt"), "utf8")).toBe("finished\n");
    expect(readFileSync(join(repo, "local-note.txt"), "utf8")).toBe(
      "keep me\n"
    );
    expect(existsSync(task)).toBe(false);
    expect(
      spawnSync("git", ["show-ref", "--verify", `refs/heads/${BRANCH}`], {
        cwd: repo,
      }).status
    ).not.toBe(0);
    expect(git(repo, "log", "-1", "--format=%P").split(" ")).toHaveLength(2);
  });

  function linkPrimaryNodeModules(relativeLinkPath: string) {
    const target = join(repo, "node_modules", "pkg");
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "index.js"), "module.exports = 1;\n");
    const link = join(task, relativeLinkPath);
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(join(repo, "node_modules"), link, "junction");
    return join(target, "index.js");
  }

  it("unlinks a root node_modules junction and leaves the primary packages intact", () => {
    commitTaskFile("feature.txt", "linked\n");
    const primaryFile = linkPrimaryNodeModules("node_modules");

    const result = finish();

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("unlinked node_modules junction");
    expect(existsSync(task)).toBe(false);
    expect(readFileSync(primaryFile, "utf8")).toBe("module.exports = 1;\n");
  });

  it("refuses to remove a worktree that still contains a nested junction", () => {
    commitTaskFile("feature.txt", "nested link\n");
    const primaryFile = linkPrimaryNodeModules(
      join("packages", "app", "node_modules")
    );
    const mainBefore = git(repo, "rev-parse", "HEAD");

    const result = finish();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "refusing to remove worktree while links remain"
    );
    expect(git(repo, "rev-parse", "HEAD")).toBe(mainBefore);
    expect(existsSync(task)).toBe(true);
    expect(readFileSync(primaryFile, "utf8")).toBe("module.exports = 1;\n");
  });

  it("blocks overlapping primary-checkout edits without removing anything", () => {
    commitTaskFile("shared.txt", "task version\n");
    writeFileSync(join(repo, "shared.txt"), "primary version\n");
    const mainBefore = git(repo, "rev-parse", "HEAD");

    const result = finish();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "overlapping uncommitted paths: shared.txt"
    );
    expect(git(repo, "rev-parse", "HEAD")).toBe(mainBefore);
    expect(readFileSync(join(repo, "shared.txt"), "utf8")).toBe(
      "primary version\n"
    );
    expect(existsSync(task)).toBe(true);
    expect(git(repo, "show-ref", "--verify", `refs/heads/${BRANCH}`)).toContain(
      BRANCH
    );
  });

  it("blocks a branch that does not contain current local main", () => {
    commitTaskFile("feature.txt", "task version\n");
    writeFileSync(join(repo, "main-only.txt"), "main moved\n");
    git(repo, "add", "main-only.txt");
    git(repo, "commit", "-m", "advance main");
    const mainBefore = git(repo, "rev-parse", "HEAD");

    const result = finish();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("does not contain current local main");
    expect(git(repo, "rev-parse", "HEAD")).toBe(mainBefore);
    expect(existsSync(task)).toBe(true);
    expect(git(repo, "show-ref", "--verify", `refs/heads/${BRANCH}`)).toContain(
      BRANCH
    );
  });

  it("blocks any uncommitted task deletion and preserves the worktree", () => {
    commitTaskFile("feature.txt", "committed\n");
    rmSync(join(task, "feature.txt"));
    const mainBefore = git(repo, "rev-parse", "HEAD");

    const result = finish();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("task worktree is dirty");
    expect(git(repo, "rev-parse", "HEAD")).toBe(mainBefore);
    expect(existsSync(task)).toBe(true);
    expect(git(repo, "show-ref", "--verify", `refs/heads/${BRANCH}`)).toContain(
      BRANCH
    );
  });

  it("requires a real :5173 route unless the task is explicitly nonvisual", () => {
    const result = spawnSync(
      process.execPath,
      [SCRIPT, "--finish", BRANCH, "--skip-checks"],
      { cwd: repo, encoding: "utf8" }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("visual work requires --route /real-route");
    expect(existsSync(task)).toBe(true);
  });

  it("refuses before merging when invoked from inside the task worktree", () => {
    commitTaskFile("feature.txt", "finished from task\n");
    const mainBefore = git(repo, "rev-parse", "HEAD");

    const result = finish(task);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Windows cannot remove the calling terminal's current worktree"
    );
    expect(git(repo, "rev-parse", "HEAD")).toBe(mainBefore);
    expect(existsSync(task)).toBe(true);
  });

  it("runs the check command through the platform launcher before merging", () => {
    commitTaskFile("feature.txt", "checked\n");
    const bin = join(root, "bin");
    const marker = join(root, "npm-check-ran.txt");
    mkdirSync(bin);
    const npmStub = join(bin, process.platform === "win32" ? "npm.cmd" : "npm");
    writeFileSync(
      npmStub,
      process.platform === "win32"
        ? `@echo off\r\n> "${marker}" echo checked\r\nexit /b 0\r\n`
        : `#!/bin/sh\nprintf checked > '${marker}'\n`
    );
    if (process.platform !== "win32") chmodSync(npmStub, 0o755);

    const result = spawnSync(
      process.execPath,
      [SCRIPT, "--finish", BRANCH, "--nonvisual"],
      {
        cwd: repo,
        encoding: "utf8",
        env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` },
      }
    );

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(readFileSync(marker, "utf8").trim()).toBe("checked");
    expect(readFileSync(join(repo, "feature.txt"), "utf8")).toBe("checked\n");
    expect(existsSync(task)).toBe(false);
  });

  it("skips the Svelte check for documentation-only branches", () => {
    commitTaskFile("docs/agent-contract.md", "documented\n");
    const bin = join(root, "bin");
    mkdirSync(bin);
    const npmStub = join(bin, process.platform === "win32" ? "npm.cmd" : "npm");
    writeFileSync(
      npmStub,
      process.platform === "win32"
        ? "@echo off\r\nexit /b 23\r\n"
        : "#!/bin/sh\nexit 23\n"
    );
    if (process.platform !== "win32") chmodSync(npmStub, 0o755);

    const result = spawnSync(
      process.execPath,
      [SCRIPT, "--finish", BRANCH, "--nonvisual"],
      {
        cwd: repo,
        encoding: "utf8",
        env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` },
      }
    );

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain(
      "skipping `npm run check` for documentation-only changes"
    );
    expect(readFileSync(join(repo, "docs/agent-contract.md"), "utf8")).toBe(
      "documented\n"
    );
  });

  it("fails closed when the retired server-side batch apply flag is used", () => {
    const result = spawnSync(
      process.execPath,
      [SCRIPT, "--apply", "--skip-checks"],
      { cwd: repo, encoding: "utf8" }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("server-side batch apply is retired");
    expect(existsSync(task)).toBe(true);
  });
});
