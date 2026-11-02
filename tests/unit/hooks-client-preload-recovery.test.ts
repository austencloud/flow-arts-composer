import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const hooksSource = readFileSync(
  resolve(process.cwd(), "src/hooks.client.ts"),
  "utf8"
);

function between(start: string, end: string): string {
  const startIndex = hooksSource.indexOf(start);
  const endIndex = hooksSource.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return hooksSource.slice(startIndex, endIndex);
}

describe("production dynamic-import recovery", () => {
  it("lets Vite reject a failed import while starting the recovery reload", () => {
    const preloadHandler = between(
      'window.addEventListener("vite:preloadError"',
      "// Report unhandled promise rejections"
    );

    expect(preloadHandler).toContain("window.location.replace");
    // The recovery must leave a breadcrumb: the root layout strips ?fresh=
    // during boot, so this marker is the only trace of the reload.
    expect(preloadHandler).toContain("markChunkRecoveryReload(step)");
    expect(preloadHandler).not.toContain("event.preventDefault()");
  });

  it("escalates a repeat failure instead of leaving a dead page", () => {
    const preloadHandler = between(
      'window.addEventListener("vite:preloadError"',
      "// Report unhandled promise rejections"
    );

    // One soft and one hard reload per minute, then the notice; the counting
    // itself is covered in chunk-recovery-marker.test.ts.
    expect(preloadHandler).toContain("claimChunkRecoveryStep()");
    expect(preloadHandler).toContain("forceFreshReload()");
    expect(preloadHandler).toContain("showChunkLoadFailureNotice()");
    // The hard path must not need a lazy chunk: the chunk graph is what broke.
    expect(hooksSource).toContain(
      'import { forceFreshReload } from "#lib/shared/foundation/services/force-fresh.js";'
    );
    const notice = between(
      "function showChunkLoadFailureNotice",
      "// Production: auto-recover from stale chunks"
    );
    expect(notice).not.toContain("import(");
  });

  it("keeps the expected rejected import quiet while the page exits", () => {
    const rejectionHandler = between(
      'window.addEventListener("unhandledrejection"',
      "// SvelteKit routes unexpected load/navigation errors here"
    );

    expect(rejectionHandler).toContain("isModuleLoadFailure");
    expect(rejectionHandler).toContain("event.preventDefault()");
    expect(rejectionHandler).toContain(
      "Failed to fetch dynamically imported module"
    );
    expect(rejectionHandler).toContain("Importing a module script failed");
    expect(rejectionHandler).toContain(
      "error loading dynamically imported module"
    );
  });
});
