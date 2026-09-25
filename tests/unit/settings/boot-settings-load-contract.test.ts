/**
 * Static contract test for how the app shell loads settings at boot.
 *
 * MainApplication used to reload the stored settings and hand the whole object
 * straight back to updateSettings. updateSettings treats every key it receives
 * as the user's edit, so once sign-in had restored, the account's copy was
 * ignored and this device's saved copy was uploaded over it with nobody
 * touching anything. Every other open tab then followed the old values.
 *
 * Boot reads stored settings; it does not edit them. If this test fails, fix
 * the boot block rather than loosening the assertion.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

const MAIN_APPLICATION =
  "src/lib/shared/application/components/MainApplication.svelte";

describe("app boot settings load", () => {
  it("loads stored settings without passing them back through an edit", () => {
    const source = readFileSync(path.join(repoRoot, MAIN_APPLICATION), "utf8");
    const start = source.indexOf(
      'bootProfiler.mark("app:load-settings+theme")'
    );
    const end = source.indexOf('bootProfiler.end("app:load-settings+theme")');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const boot = source.slice(start, end);
    expect(boot).toContain("settingsService.loadSettings()");
    expect(boot).not.toMatch(/\bupdateSettings?\(/);
  });
});
