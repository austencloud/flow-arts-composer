import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { compile } from "svelte/compiler";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CHECKOUT = process.cwd();
const SCRIPT = join(CHECKOUT, "scripts", "svelte-compile-gate.mjs");

// Git hands its hooks a GIT_DIR, and from a linked worktree that path is
// absolute. The pre-push gate runs this suite, so inside a hook every git
// process below would address the real repository instead of the fixture: on
// 2026-10-13 the `git config user.name` call rewrote the shared .git/config
// that way. Every fixture git process therefore starts from an environment
// without GIT_* variables, so discovery begins at the fixture directory.
function gitFreeEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^git_/i.test(key))
  );
}

// The identity the checkout running this suite has in its own .git/config.
// Status 1 means the key is unset, which is a valid state to preserve.
function checkoutIdentity(key: string) {
  const result = spawnSync(
    "git",
    ["-C", CHECKOUT, "config", "--local", "--get", key],
    { encoding: "utf8", env: gitFreeEnv() }
  );
  if (result.status !== 0 && result.status !== 1)
    throw new Error(`git config --get ${key} failed: ${result.stderr}`);
  return result.status === 0 ? result.stdout.trim() : null;
}

// The TypeScript-only lines above the comment disappear in preprocessing, so
// an unmapped report would land about seven lines too high.
const EARLY_CLOSED_COMMENT = [
  '<script lang="ts">',
  "  interface Keyframe {",
  "    at: number;",
  "    value: number;",
  "  }",
  "",
  '  type Channel = "framing" | "box" | "opacity";',
  "",
  "  let { channel }: { channel: Channel } = $props();",
  "  const frames: Keyframe[] = [];",
  "</script>",
  "",
  "<!--",
  "  The <-- <> --> navigator steps between keyframes; <- and -> seek.",
  "-->",
  "<p>{channel} {frames.length}</p>",
  "",
].join("\n");

const CLICKABLE_DIV = [
  '<script lang="ts">',
  "  let count: number = $state(0);",
  "</script>",
  "",
  "<div onclick={() => count++}>{count}</div>",
  "",
].join("\n");

const ENUM_SCRIPT = [
  '<script lang="ts">',
  "  enum Mode {",
  "    Idle,",
  "    Busy,",
  "  }",
  "  let mode = $state(Mode.Idle);",
  "</script>",
  "",
  "<p>{mode}</p>",
  "",
].join("\n");

const SCRIPT_SYNTAX_ERROR = [
  "<!--",
  "  A header comment pushes the script block down the file.",
  "-->",
  '<script lang="ts">',
  "  let ready: boolean = true;",
  "",
  "  let broken = ;",
  "</script>",
  "",
  "<p>{ready}</p>",
  "",
].join("\n");

type Diagnostic = {
  code: string;
  message: string;
  line?: number;
  column?: number;
};
type Result = { file: string; errors: Diagnostic[]; warnings: Diagnostic[] };

function lineOf(source: string, text: string) {
  return source.split("\n").findIndex((line) => line.includes(text)) + 1;
}

// wt:finish runs the gate as a plain Node process, and so does this suite:
// under its jsdom environment esbuild, which svelte.config.js loads, refuses
// to start.
function compileWithProjectConfig(files: string[], output: string) {
  const program = [
    'import { writeFileSync } from "node:fs";',
    `import { compileSvelteFiles } from ${JSON.stringify(pathToFileURL(SCRIPT).href)};`,
    `const results = await compileSvelteFiles(${JSON.stringify(files)});`,
    `writeFileSync(${JSON.stringify(output)}, JSON.stringify(results));`,
  ].join("\n");
  execFileSync(process.execPath, ["--input-type=module", "--eval", program], {
    cwd: CHECKOUT,
    stdio: "pipe",
  });
  return JSON.parse(readFileSync(output, "utf8")) as Result[];
}

describe("svelte compile gate", () => {
  let root: string;
  const results = new Map<string, Result>();

  function resultFor(name: string) {
    const result = results.get(name);
    if (!result) throw new Error(`no compile result for ${name}`);
    return result;
  }

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "tka-svelte-compile-gate-"));
    const fixtures = {
      "Keyframes.svelte": EARLY_CLOSED_COMMENT,
      "Clickable.svelte": CLICKABLE_DIV,
      "Enum.svelte": ENUM_SCRIPT,
      "Broken.svelte": SCRIPT_SYNTAX_ERROR,
    };
    const files = Object.entries(fixtures).map(([name, source]) => {
      const file = join(root, name);
      writeFileSync(file, source);
      return file;
    });
    for (const result of compileWithProjectConfig(
      files,
      join(root, "results.json")
    ))
      results.set(basename(result.file), result);
  }, 30_000);

  afterAll(() => {
    rmSync(root, {
      force: true,
      maxRetries: 3,
      recursive: true,
      retryDelay: 100,
    });
  });

  it("fails on a comment closed early and reports the line in the file", () => {
    const result = resultFor("Keyframes.svelte");

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      code: "tag_invalid_name",
      line: lineOf(EARLY_CLOSED_COMMENT, "<- and ->"),
    });
  });

  it("reports accessibility warnings without failing", () => {
    const result = resultFor("Clickable.svelte");

    expect(result.errors).toEqual([]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "a11y_click_events_have_key_events",
        line: lineOf(CLICKABLE_DIV, "onclick"),
      })
    );
  });

  it("runs the project's preprocessors before compiling", () => {
    // Svelte strips TypeScript types itself but rejects enums; only the
    // project's vitePreprocess step makes this component compile.
    expect(() =>
      compile(ENUM_SCRIPT, { filename: "Enum.svelte", generate: "client" })
    ).toThrow(/typescript_invalid_feature/);

    expect(resultFor("Enum.svelte").errors).toEqual([]);
  });

  it("places a TypeScript syntax error at its line in the file", () => {
    expect(resultFor("Broken.svelte").errors).toEqual([
      expect.objectContaining({
        code: "preprocess_failed",
        line: lineOf(SCRIPT_SYNTAX_ERROR, "let broken = ;"),
        column: "  let broken = ;".indexOf(";") + 1,
      }),
    ]);
  });

  it("compiles only the components the branch added or changed", () => {
    const nameBefore = checkoutIdentity("user.name");
    const emailBefore = checkoutIdentity("user.email");

    const repo = join(root, "repo");
    // A second repository stands in for the real checkout: GIT_DIR points at
    // it for the whole flow, the way a hook points at a worktree's gitdir,
    // and it must come out untouched.
    const decoy = join(root, "decoy");
    const git = (...args: string[]) =>
      execFileSync("git", ["-C", repo, ...args], {
        encoding: "utf8",
        env: gitFreeEnv(),
      }).trim();
    const gate = (base: string) =>
      spawnSync(process.execPath, [SCRIPT, base], {
        cwd: repo,
        encoding: "utf8",
        env: gitFreeEnv(),
      });

    execFileSync("git", ["init", "--quiet", "-b", "main", decoy], {
      env: gitFreeEnv(),
    });
    const inheritedGitDir = process.env.GIT_DIR;
    process.env.GIT_DIR = join(decoy, ".git");
    try {
      execFileSync("git", ["init", "--quiet", "-b", "main", repo], {
        env: gitFreeEnv(),
      });
      git("config", "--local", "user.email", "compile-gate-test@example.com");
      git("config", "--local", "user.name", "Compile Gate Test");
      git("config", "--local", "core.autocrlf", "false");
      writeFileSync(join(repo, "Kept.svelte"), "<p>kept</p>\n");
      writeFileSync(join(repo, "Removed.svelte"), "<p>removed</p>\n");
      git("add", "Kept.svelte", "Removed.svelte");
      git("commit", "--quiet", "-m", "base");
      const base = git("rev-parse", "HEAD");

      writeFileSync(join(repo, "Kept.svelte"), "<p>kept, edited</p>\n");
      writeFileSync(
        join(repo, "Broken.svelte"),
        "<p>navigator</p>\n<!-- <-- <> --> steps; <- seeks -->\n"
      );
      writeFileSync(join(repo, "notes.ts"), "export const notes = 1;\n");
      git("rm", "--quiet", "Removed.svelte");
      git("add", "Kept.svelte", "Broken.svelte", "notes.ts");
      git("commit", "--quiet", "-m", "branch work");

      const failed = gate(base);
      expect(failed.status).toBe(1);
      expect(failed.stdout).toContain("compiling 2 changed .svelte file(s)");
      expect(failed.stderr).toMatch(/Broken\.svelte:2:\d+ {2}tag_invalid_name/);

      writeFileSync(join(repo, "Broken.svelte"), "<p>fixed</p>\n");
      git("commit", "--quiet", "-m", "fix", "--", "Broken.svelte");

      const passed = gate(base);
      expect(passed.stderr).toBe("");
      expect(passed.status).toBe(0);
      expect(passed.stdout).toContain("0 error(s), 0 warning(s) in 2 file(s)");
    } finally {
      if (inheritedGitDir === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = inheritedGitDir;
    }

    const configOf = (dir: string) =>
      readFileSync(join(dir, ".git", "config"), "utf8");
    expect(configOf(repo)).toContain("Compile Gate Test");
    expect(configOf(decoy)).not.toContain("Compile Gate Test");
    expect(checkoutIdentity("user.name")).toBe(nameBefore);
    expect(checkoutIdentity("user.email")).toBe(emailBefore);
  });
});
