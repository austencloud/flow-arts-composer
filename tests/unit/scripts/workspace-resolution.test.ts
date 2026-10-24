/**
 * A task worktree links its node_modules into the primary checkout, so pnpm's
 * workspace links land in the primary's packages/. These checks build that
 * layout in a temp dir and pin the two behaviors nobody would see break:
 * a worktree is moved onto its own packages, and a checkout that owns its
 * node_modules (the primary, CI) is left exactly as it was.
 */
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  findForeignWorkspaceLinks,
  hasSharedNodeModules,
  rebaseWorkspaceFile,
  workspaceResolvePlugins,
  workspaceTsPaths,
} from "../../../scripts/lib/workspace-resolution.mjs";

const posix = (path: string) => path.replace(/\\/g, "/");

function writeCheckout(root: string) {
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, "pnpm-workspace.yaml"),
    "packages:\n  - packages/*\n"
  );
  const engine = join(root, "packages", "engine");
  mkdirSync(join(engine, "src", "loop"), { recursive: true });
  writeFileSync(
    join(engine, "package.json"),
    JSON.stringify({
      name: "@fixture/engine",
      exports: {
        ".": { types: "./src/index.ts", import: "./dist/index.js" },
        "./loop": {
          types: "./src/loop/index.ts",
          import: "./dist/loop/index.js",
        },
      },
    })
  );
  writeFileSync(join(engine, "src", "index.ts"), "export {};\n");
  writeFileSync(join(engine, "src", "loop", "index.ts"), "export {};\n");
  const domain = join(root, "packages", "domain");
  mkdirSync(join(domain, "src"), { recursive: true });
  writeFileSync(
    join(domain, "package.json"),
    JSON.stringify({
      name: "@fixture/domain",
      exports: {
        ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
      },
    })
  );
  writeFileSync(join(domain, "src", "index.ts"), "export {};\n");
}

let base: string;
let primary: string;
let worktree: string;

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), "workspace-resolution-"));
  primary = join(base, "primary");
  worktree = join(base, "worktree");
  writeCheckout(primary);
  writeCheckout(worktree);
  // The primary has built its dist; the worktree has not.
  mkdirSync(join(primary, "packages", "engine", "dist", "loop"), {
    recursive: true,
  });
  writeFileSync(
    join(primary, "packages", "engine", "dist", "loop", "index.js"),
    ""
  );
  // pnpm's workspace links, in the primary's own node_modules.
  mkdirSync(join(primary, "node_modules", "@fixture"), { recursive: true });
  for (const name of ["engine", "domain"]) {
    symlinkSync(
      join(primary, "packages", name),
      join(primary, "node_modules", "@fixture", name),
      "junction"
    );
  }
  // The worktree's node_modules is a junction into the primary's.
  symlinkSync(
    join(primary, "node_modules"),
    join(worktree, "node_modules"),
    "junction"
  );
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("workspace resolution in a linked worktree", () => {
  it("finds every package whose link lands in the primary", () => {
    const links = findForeignWorkspaceLinks(worktree);
    expect(links.map((pkg) => pkg.name).sort()).toEqual([
      "@fixture/domain",
      "@fixture/engine",
    ]);
    expect(hasSharedNodeModules(worktree)).toBe(true);
  });

  it("moves a resolved primary file onto the worktree's copy, src standing in for an unbuilt dist", () => {
    const links = findForeignWorkspaceLinks(worktree);
    const primaryDist = `${posix(primary)}/packages/engine/dist/loop/index.js?v=1`;
    expect(rebaseWorkspaceFile(primaryDist, links)).toBe(
      `${posix(worktree)}/packages/engine/src/loop/index.ts?v=1`
    );
    expect(
      rebaseWorkspaceFile(`${posix(primary)}/src/app.ts`, links)
    ).toBeNull();
  });

  it("gives tsc paths for each export, dist first only as a fallback list", () => {
    const paths = workspaceTsPaths(worktree);
    expect(paths["@fixture/engine/loop"]).toEqual([
      `${posix(worktree)}/packages/engine/src/loop/index.ts`,
    ]);
    expect(paths["@fixture/domain"]?.slice(0, 2)).toEqual([
      `${posix(worktree)}/packages/domain/dist/index.d.ts`,
      `${posix(worktree)}/packages/domain/src/index.ts`,
    ]);
  });
});

describe("workspace resolution in a checkout that owns node_modules", () => {
  it("changes nothing", () => {
    expect(findForeignWorkspaceLinks(primary)).toEqual([]);
    expect(workspaceResolvePlugins(primary)).toEqual([]);
    expect(workspaceTsPaths(primary)).toEqual({});
    expect(hasSharedNodeModules(primary)).toBe(false);
  });
});
