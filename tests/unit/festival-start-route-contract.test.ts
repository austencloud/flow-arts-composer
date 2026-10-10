import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isStandaloneAppSurface } from "#lib/shared/navigation/services/app-shell-route.js";

const readSource = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf-8");

describe("festival /start route contract", () => {
  it("uses app auth bootstrap without becoming an app navigation module", () => {
    expect(isStandaloneAppSurface("/start")).toBe(true);
    expect(isStandaloneAppSurface("/start/")).toBe(true);
    expect(isStandaloneAppSurface("/create/construct")).toBe(false);
  });

  it("treats /tools/* operator pages as standalone surfaces", () => {
    expect(isStandaloneAppSurface("/tools")).toBe(true);
    expect(isStandaloneAppSurface("/tools/warm-thumbnails")).toBe(true);
    expect(isStandaloneAppSurface("/tools/warm-thumbnails/")).toBe(true);
    expect(isStandaloneAppSurface("/toolsmith")).toBe(false);
  });

  it("guards module restore before it interprets the first URL segment", () => {
    const moduleState = readSource(
      "src/lib/shared/application/state/ui/module-state.ts"
    );

    expect(moduleState).toContain(
      "if (isStandaloneAppSurface(pathname)) return;"
    );
  });

  it("guards navigation history before it seeds an app-module URL", () => {
    const coordinator = readSource(
      "src/lib/shared/navigation-coordinator/navigation-coordinator.svelte.ts"
    );

    const standaloneGuard = coordinator.indexOf(
      "if (isStandaloneAppSurface(window.location.pathname)) return;"
    );
    const historySeed = coordinator.indexOf(
      "replaceHistoryState(\n    navigationState.currentModule,\n    historySectionFor(navigationState.currentModule)"
    );

    expect(standaloneGuard).toBeGreaterThan(-1);
    expect(historySeed).toBeGreaterThan(standaloneGuard);
  });
});
