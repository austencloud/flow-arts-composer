import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  inspectLockfileInstall,
  inspectWorkspaceInstall,
} from "../../../scripts/lib/workspace-install-health.mjs";
import {
  isSvelteKitGeneratedStateIntact,
  REQUIRED_SVELTE_KIT_OUTPUTS,
} from "../../../scripts/lib/svelte-kit-generated-state.mjs";

const temporaryRoots: string[] = [];

function createProject(
  dependencies: Record<string, string>,
  packages: Record<string, { manifest?: object; source?: string }>
): string {
  const projectRoot = mkdtempSync(
    path.join(tmpdir(), "tka-workspace-install-health-")
  );
  temporaryRoots.push(projectRoot);
  writeFileSync(
    path.join(projectRoot, "package.json"),
    JSON.stringify({ name: "fixture", type: "module", dependencies }),
    "utf8"
  );

  for (const [packageName, fixture] of Object.entries(packages)) {
    const packageRoot = path.join(
      projectRoot,
      "node_modules",
      ...packageName.split("/")
    );
    mkdirSync(packageRoot, { recursive: true });
    if (fixture.manifest) {
      writeFileSync(
        path.join(packageRoot, "package.json"),
        JSON.stringify(fixture.manifest),
        "utf8"
      );
    }
    if (fixture.source !== undefined) {
      writeFileSync(path.join(packageRoot, "index.js"), fixture.source, "utf8");
    }
  }

  return projectRoot;
}

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "tka-lockfile-install-"));
  temporaryRoots.push(directory);
  return directory;
}

type LockfileEntries = Record<string, Record<string, unknown>>;

// An npm project as an install leaves it: package-lock.json, plus a
// package.json for each installed lockfile location.
function createLockfileProject(
  parent: string,
  directory: string,
  entries: LockfileEntries,
  installed: Record<string, string>
): string {
  const projectRoot = path.join(parent, directory);
  mkdirSync(path.join(projectRoot, "node_modules"), { recursive: true });
  writeFileSync(
    path.join(projectRoot, "package-lock.json"),
    JSON.stringify({ lockfileVersion: 3, requires: true, packages: entries }),
    "utf8"
  );

  for (const [location, version] of Object.entries(installed)) {
    const packageRoot = path.join(projectRoot, ...location.split("/"));
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(
      path.join(packageRoot, "package.json"),
      JSON.stringify({ name: location.split("node_modules/").at(-1), version }),
      "utf8"
    );
  }

  return projectRoot;
}

afterEach(() => {
  for (const projectRoot of temporaryRoots.splice(0)) {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

describe("workspace install health", () => {
  it("accepts installed dependency roots whose critical entrypoints import", async () => {
    const projectRoot = createProject(
      { healthy: "1.0.0" },
      {
        healthy: {
          manifest: {
            name: "healthy",
            version: "1.0.0",
            type: "module",
            exports: "./index.js",
          },
          source: "export const ready = true;\n",
        },
      }
    );

    await expect(
      inspectWorkspaceInstall({
        projectRoot,
        criticalImports: ["healthy"],
      })
    ).resolves.toMatchObject({
      healthy: true,
      dependencyCount: 1,
      criticalImportCount: 1,
      issues: [],
    });
  });

  it("rejects the hollow package directory that pnpm can otherwise overlook", async () => {
    const projectRoot = createProject({ hollow: "1.0.0" }, { hollow: {} });

    const report = await inspectWorkspaceInstall({
      projectRoot,
      criticalImports: [],
    });

    expect(report.healthy).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        kind: "missing-package-manifest",
        packageName: "hollow",
      })
    );
  });

  it("rejects an entrypoint whose transitive import is missing", async () => {
    const projectRoot = createProject(
      { broken: "1.0.0" },
      {
        broken: {
          manifest: {
            name: "broken",
            version: "1.0.0",
            type: "module",
            exports: "./index.js",
          },
          source: 'import "missing-transitive-package";\n',
        },
      }
    );

    const report = await inspectWorkspaceInstall({
      projectRoot,
      criticalImports: ["broken"],
    });

    expect(report.healthy).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        kind: "unimportable-critical-module",
        packageName: "broken",
      })
    );
  });
});

// The shape of the 2026-09-14 change to mcp-server: canvas became
// @napi-rs/canvas, whose native binary is one optional package per platform.
const napiCanvasLockfile: LockfileEntries = {
  "": { name: "mcp-server", dependencies: { "@napi-rs/canvas": "^1.0.9" } },
  "node_modules/@napi-rs/canvas": {
    version: "1.0.9",
    optionalDependencies: {
      "@napi-rs/canvas-linux-x64-gnu": "1.0.9",
      "@napi-rs/canvas-win32-x64-msvc": "1.0.9",
    },
  },
  "node_modules/@napi-rs/canvas-linux-x64-gnu": {
    version: "1.0.9",
    optional: true,
    os: ["linux"],
    cpu: ["x64"],
    libc: ["glibc"],
  },
  "node_modules/@napi-rs/canvas-win32-x64-msvc": {
    version: "1.0.9",
    optional: true,
    os: ["win32"],
    cpu: ["x64"],
  },
};
const windowsX64 = { platform: "win32", arch: "x64" };

describe("standalone npm lockfile install health", () => {
  it("reports the packages a merged lockfile added that were never installed", () => {
    const projectRoot = createLockfileProject(
      createTemporaryDirectory(),
      "mcp-server",
      napiCanvasLockfile,
      { "node_modules/canvas": "3.2.1" }
    );

    const report = inspectLockfileInstall({ projectRoot, ...windowsX64 });

    expect(report.healthy).toBe(false);
    expect(
      report.issues.map(({ kind, packageName }) => [kind, packageName])
    ).toEqual([
      ["missing-installed-package", "@napi-rs/canvas"],
      ["missing-installed-package", "@napi-rs/canvas-win32-x64-msvc"],
    ]);
  });

  it("accepts this platform's install and rejects a version the lockfile moved past", () => {
    const parent = createTemporaryDirectory();
    const installed = {
      "node_modules/@napi-rs/canvas": "1.0.9",
      "node_modules/@napi-rs/canvas-win32-x64-msvc": "1.0.9",
    };
    const current = createLockfileProject(
      parent,
      "current",
      napiCanvasLockfile,
      installed
    );
    const stale = createLockfileProject(parent, "stale", napiCanvasLockfile, {
      ...installed,
      "node_modules/@napi-rs/canvas": "1.0.8",
    });

    expect(
      inspectLockfileInstall({ projectRoot: current, ...windowsX64 })
    ).toEqual({ healthy: true, packageCount: 2, issues: [] });
    expect(
      inspectLockfileInstall({ projectRoot: stale, ...windowsX64 }).issues
    ).toEqual([
      expect.objectContaining({
        kind: "mismatched-installed-version",
        packageName: "@napi-rs/canvas",
        message: "installed 1.0.8, lockfile has 1.0.9",
      }),
    ]);
  });

  // npm skips an optional package built for another platform together with the
  // packages only it uses. mcp-server's rolldown WebAssembly binding and its
  // runtime are absent on Windows for that reason, which is not drift.
  it("skips a WebAssembly fallback with the runtime only it uses", () => {
    const parent = createTemporaryDirectory();
    const entries: LockfileEntries = {
      "": { name: "mcp-server", devDependencies: { rolldown: "^1.0.0" } },
      "node_modules/rolldown": {
        version: "1.0.0",
        dev: true,
        optionalDependencies: {
          "@rolldown/binding-wasm32-wasi": "1.0.0",
          "@rolldown/binding-win32-x64-msvc": "1.0.0",
        },
      },
      "node_modules/@rolldown/binding-wasm32-wasi": {
        version: "1.0.0",
        dev: true,
        optional: true,
        cpu: ["wasm32"],
        dependencies: {
          "@emnapi/core": "1.11.1",
          "@napi-rs/wasm-runtime": "^1.1.6",
        },
      },
      "node_modules/@rolldown/binding-win32-x64-msvc": {
        version: "1.0.0",
        dev: true,
        optional: true,
        os: ["win32"],
        cpu: ["x64"],
      },
      "node_modules/@napi-rs/wasm-runtime": {
        version: "1.1.6",
        dev: true,
        optional: true,
        dependencies: { tslib: "^2.4.0" },
        peerDependencies: { "@emnapi/core": "^1.7.1" },
      },
      "node_modules/@emnapi/core": {
        version: "1.11.1",
        dev: true,
        optional: true,
        dependencies: { tslib: "^2.4.0" },
      },
      "node_modules/tslib": { version: "2.8.1", dev: true, optional: true },
    };
    const installed = {
      "node_modules/rolldown": "1.0.0",
      "node_modules/@rolldown/binding-win32-x64-msvc": "1.0.0",
    };
    const fallbackOnly = createLockfileProject(
      parent,
      "fallback-only",
      entries,
      installed
    );
    // An installed package depends on tslib too, if only optionally, so npm
    // installs it after all.
    const shared = createLockfileProject(
      parent,
      "shared",
      {
        ...entries,
        "": {
          name: "shared",
          dependencies: { "some-lib": "^1.0.0" },
          devDependencies: { rolldown: "^1.0.0" },
        },
        "node_modules/some-lib": {
          version: "1.0.0",
          optionalDependencies: { tslib: "^2.8.0" },
        },
        "node_modules/tslib": { version: "2.8.1", optional: true },
      },
      { ...installed, "node_modules/some-lib": "1.0.0" }
    );

    expect(
      inspectLockfileInstall({ projectRoot: fallbackOnly, ...windowsX64 })
    ).toEqual({ healthy: true, packageCount: 2, issues: [] });
    expect(
      inspectLockfileInstall({ projectRoot: shared, ...windowsX64 }).issues
    ).toEqual([
      expect.objectContaining({
        kind: "missing-installed-package",
        packageName: "tslib",
      }),
    ]);
  });

  it("requires a file: dependency to be linked to its lockfile target", () => {
    const parent = createTemporaryDirectory();
    const target = path.join(parent, "packages", "domain");
    mkdirSync(target, { recursive: true });
    const projectRoot = createLockfileProject(
      parent,
      "mcp-server",
      {
        "": {
          name: "mcp-server",
          dependencies: { "@tka/domain": "file:../packages/domain" },
        },
        "../packages/domain": { name: "@tka/domain", version: "0.1.0" },
        "node_modules/@tka/domain": {
          resolved: "../packages/domain",
          link: true,
        },
      },
      {}
    );

    expect(
      inspectLockfileInstall({ projectRoot, ...windowsX64 }).issues
    ).toEqual([
      expect.objectContaining({
        kind: "missing-link",
        packageName: "@tka/domain",
      }),
    ]);

    mkdirSync(path.join(projectRoot, "node_modules", "@tka"));
    symlinkSync(
      target,
      path.join(projectRoot, "node_modules", "@tka", "domain"),
      "junction"
    );

    expect(inspectLockfileInstall({ projectRoot, ...windowsX64 })).toEqual({
      healthy: true,
      packageCount: 1,
      issues: [],
    });
  });
});

describe("standalone npm install guard", () => {
  const guardScript = path.resolve("scripts/verify-standalone-installs.mjs");
  // No platform-specific entries, so the fixture reads the same on every OS.
  const portableLockfile: LockfileEntries = {
    "": { name: "fixture", dependencies: { "@napi-rs/canvas": "^1.0.9" } },
    "node_modules/@napi-rs/canvas": { version: "1.0.9" },
  };
  const runGuard = (repoRoot: string) =>
    spawnSync(process.execPath, [guardScript, repoRoot], { encoding: "utf8" });

  it("fails with the scoped install for each folder that drifted", () => {
    const repoRoot = createTemporaryDirectory();
    const drifted = createLockfileProject(
      repoRoot,
      "mcp-server",
      portableLockfile,
      {}
    );
    const current = createLockfileProject(
      repoRoot,
      "mcp-server-pkg",
      portableLockfile,
      { "node_modules/@napi-rs/canvas": "1.0.9" }
    );

    const result = runGuard(repoRoot);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `npm install --no-save --ignore-scripts --prefix "${drifted}"`
    );
    expect(result.stderr).not.toContain(`--prefix "${current}"`);
  });

  it("passes once both folders match their lockfiles", () => {
    const repoRoot = createTemporaryDirectory();
    for (const directory of ["mcp-server", "mcp-server-pkg"]) {
      createLockfileProject(repoRoot, directory, portableLockfile, {
        "node_modules/@napi-rs/canvas": "1.0.9",
      });
    }

    const result = runGuard(repoRoot);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("match their lockfiles");
  });

  it("runs after every successful wt:finish", () => {
    const manifest = JSON.parse(
      readFileSync(path.resolve("package.json"), "utf8")
    );

    // npm runs post<name> only after <name> itself exists and succeeds.
    expect(manifest.scripts["wt:finish"]).toBeDefined();
    expect(manifest.scripts["postwt:finish"]).toBe(
      "node scripts/verify-standalone-installs.mjs"
    );
  });
});

describe("SvelteKit generated state health", () => {
  it("rejects an output tree whose shared root layout proxy disappeared", () => {
    const projectRoot = mkdtempSync(
      path.join(tmpdir(), "tka-svelte-kit-generated-state-")
    );
    temporaryRoots.push(projectRoot);

    for (const relativePath of REQUIRED_SVELTE_KIT_OUTPUTS) {
      const outputPath = path.join(projectRoot, relativePath);
      mkdirSync(path.dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, "generated", "utf8");
    }

    expect(isSvelteKitGeneratedStateIntact(projectRoot)).toBe(true);

    rmSync(
      path.join(projectRoot, "types", "src", "routes", "proxy+layout.server.ts")
    );

    expect(isSvelteKitGeneratedStateIntact(projectRoot)).toBe(false);
  });
});

describe("dev launcher install guard", () => {
  const launcher = readFileSync(path.resolve("scripts/start-dev.ps1"), "utf8");
  const syncGuard = readFileSync(
    path.resolve("scripts/svelte-kit-sync-if-needed.mjs"),
    "utf8"
  );

  it("restores the HTTPS certificate before Vite is allowed to start", () => {
    const certificateGuardIndex = launcher.indexOf(
      "Ensure-DevHttpsCertificate $repoRoot"
    );
    const viteStartIndex = launcher.indexOf(
      'Write-Status "Starting Vite dev server..."'
    );

    expect(launcher).toContain('Join-Path $RepoRoot ".tools\\mkcert.exe"');
    expect(launcher).toContain(
      "Vite was not started because the Cloudflare tunnel requires HTTPS."
    );
    expect(certificateGuardIndex).toBeGreaterThan(-1);
    expect(viteStartIndex).toBeGreaterThan(certificateGuardIndex);
  });

  it("runs the install preflight before Vite is allowed to start", () => {
    const preflightIndex = launcher.lastIndexOf(
      "Test-WorkspaceInstall $repoRoot"
    );
    const viteStartIndex = launcher.indexOf(
      'Write-Status "Starting Vite dev server..."'
    );

    expect(preflightIndex).toBeGreaterThan(-1);
    expect(viteStartIndex).toBeGreaterThan(preflightIndex);
  });

  it("repairs generated SvelteKit route state before Vite starts", () => {
    const repairIndex = launcher.lastIndexOf(
      "Repair-SvelteKitGeneratedState $repoRoot"
    );
    const viteStartIndex = launcher.indexOf(
      'Write-Status "Starting Vite dev server..."'
    );

    expect(syncGuard).toContain("isSvelteKitGeneratedStateIntact");
    expect(repairIndex).toBeGreaterThan(-1);
    expect(viteStartIndex).toBeGreaterThan(repairIndex);
  });

  it("keeps package installation behind the same guarded generator", () => {
    const manifest = JSON.parse(
      readFileSync(path.resolve("package.json"), "utf8")
    );

    expect(manifest.scripts.postinstall).toBe(
      "node scripts/svelte-kit-sync-if-needed.mjs"
    );
  });

  it("immediately recycles a sticky generated-route 500", () => {
    expect(launcher).toContain("Test-SvelteKitGeneratedStateError");
    expect(launcher).toContain("ENOENT: no such file or directory");
    expect(launcher).toContain(
      "pm2 can repair the generated state and restart the dev stack"
    );
  });

  it("repairs from the frozen lockfile and fails closed", () => {
    expect(launcher).toContain(
      "pnpm install --force --offline --frozen-lockfile"
    );
    expect(launcher).toContain("pnpm install --force --frozen-lockfile");
    expect(launcher).toContain("pnpm run build:packages");
    expect(launcher).toContain(
      "Vite was not started with an unhealthy install."
    );
  });

  it("requests one clean Vite optimizer pass after a repair", () => {
    expect(launcher).toContain('$env:TKA_FORCE_VITE_DEPS = "1"');
  });

  it("places local-ingress flags before the tunnel run subcommand", () => {
    expect(launcher).toMatch(
      /"tunnel",\s*"--protocol",\s*"http2",\s*"--url",\s*"https:\/\/localhost:5173",\s*"--no-tls-verify",\s*`?\s*\n?\s*"run",\s*"--token"/
    );
  });

  it("pins both tunnel credential modes to the verified HTTP/2 transport", () => {
    const protocolSelections = launcher.match(/"--protocol",\s*"http2"/g);

    expect(protocolSelections).toHaveLength(2);
  });

  it("refuses to launch only when the Windows tunnel service runs tka-dev", () => {
    const guard =
      launcher.match(
        /function Test-CompetingCloudflaredService \{[\s\S]*?\n\}/
      )?.[0] ?? "";

    // That service carries mcp.tkaflowarts.com for the MCP server, so running
    // alone must not block the launcher. Only the tka-dev identity check can.
    expect(guard).toContain("Get-CimInstance Win32_Service");
    expect(guard).toContain("Test-TkaDevTunnelCommand $service.PathName");
    expect(guard).not.toContain("Get-Service");
    expect(launcher).toContain("(Test-CompetingCloudflaredService $tokenFile)");
    expect(launcher).toContain("would create a second tka-dev connector");
  });

  it("removes stale connectors for this tunnel before Vite starts", () => {
    const cleanupIndex = launcher.indexOf(
      "Clear-StaleTkaTunnelProcesses $tokenFile"
    );
    const viteStartIndex = launcher.indexOf(
      'Write-Status "Starting Vite dev server..."'
    );

    expect(launcher).toContain("Get-StaleTkaTunnelProcesses");
    expect(launcher).toContain("Get-CimInstance Win32_Process");
    expect(launcher).toContain("run\\s+tka-dev");
    expect(cleanupIndex).toBeGreaterThan(-1);
    expect(viteStartIndex).toBeGreaterThan(cleanupIndex);
  });

  it("lets pm2 rebuild a false-healthy wrapper when the origin stays dead", () => {
    expect(launcher).toContain('$originUrl = "https://[::1]:5173/"');
    expect(launcher).toContain("$originFailureCount -ge 3");
    expect(launcher).toContain(
      "Exiting so pm2 can restart the complete dev stack."
    );
    expect(launcher).toContain("elseif ((Get-Date) -ge $nextHealthProbeAt)");
    expect(launcher).not.toContain(
      "elseif ($tunnelProc -and (Get-Date) -ge $nextPublicProbeAt)"
    );
  });

  it("waits out a slow render while Vite still answers its ping", () => {
    // After a restart the first render can outlast the 8 s probe for minutes.
    // Vite answers its ping header itself, so a timed-out page plus a ping
    // answer means busy, not dead. Busy is capped rather than trusted forever.
    expect(launcher).toContain(
      'Get-HttpStatus $Url $true 5 "text/x-vite-ping"'
    );
    expect(launcher).toContain(
      '$originStatus -eq "000" -and (Test-VitePing $originUrl)'
    );
    expect(launcher).toContain("$originBusySeconds -ge 300");
  });

  it("supervises public tunnel health without restarting Vite", () => {
    expect(launcher).toContain('Test-Http200 "https://dev.tkaflowarts.com/"');
    expect(launcher).toContain("$publicFailureCount -ge 3");
    expect(launcher).toContain("recycling cloudflared without stopping Vite");
    expect(launcher).toContain("$tunnelProc.HasExited");
    expect(launcher).toContain("Start-TkaTunnel");
    expect(launcher).toContain("$manageTunnel -and ((-not $tunnelProc)");
    expect(launcher).toContain("while Vite stays online");
  });

  it("tears its own tree down once the pm2 shim is gone", () => {
    // pm2 on Windows kills only the shim; the launcher must notice and stop
    // its Vite instead of orphaning it against the next boot.
    const shim = readFileSync(path.resolve("scripts/start-dev-pm2.cjs"), "utf8");
    expect(shim).toContain("TKA_PM2_PARENT_PID: String(process.pid)");
    expect(launcher).toContain("$env:TKA_PM2_PARENT_PID");
    expect(launcher).toContain("function Test-SupervisorAlive");
    expect(launcher).toContain("if (-not (Test-SupervisorAlive)) { break }");
    expect(launcher).toContain("if (-not (Test-SupervisorAlive)) { return $false }");
  });
});
