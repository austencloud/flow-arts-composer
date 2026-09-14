import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { inspectWorkspaceInstall } from "../../../scripts/lib/workspace-install-health.mjs";
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

  it("refuses to launch a competing Windows tunnel service", () => {
    expect(launcher).toContain("Test-CompetingCloudflaredService");
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
