/**
 * Static contract test for the desktop sidebar host pattern.
 *
 * The desktop sidebar chrome (hover-expand overlay shell, morphing module/
 * section tree, brand slide-reveal + pin) lives in the shared package
 * `@austencloud/sidebar`. TKA's DesktopNavigationSidebar.svelte is a THIN
 * WRAPPER that supplies data + adapters and reparents its own domain chrome
 * (footer, settings, account popover, admin context menu) into the package's
 * slots. This test locks that at the source level so the shell chrome cannot
 * silently be rebuilt host-side again (the pre-package drift).
 *
 * If this test fails, fix the host — do not loosen the assertions.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const HOST_PATH =
  "src/lib/shared/navigation/components/DesktopNavigationSidebar.svelte";

/**
 * Shell chrome that now lives ONLY in @austencloud/sidebar. A host importing
 * one of these means the package shell is being rebuilt host-side — the exact
 * drift this guards. (Footer / CollapsedTabButton / SidebarContextMenu /
 * AccountPopover are host-owned domain components reparented into slots and are
 * intentionally NOT on this list.)
 */
const SHELL_INTERNALS = [
  "SidebarHeader.svelte",
  "ModuleGroup.svelte",
  "ModuleButton.svelte",
  "SectionsList.svelte",
  "SectionButton.svelte",
  "services/hover-intent",
];

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

function importSpecifierLines(source: string): string[] {
  return source
    .split("\n")
    .filter((line) => /^\s*import\b/.test(line) || line.includes('from "'));
}

const hostSource = read(HOST_PATH);

describe("Desktop sidebar host contract", () => {
  it("renders Sidebar from @austencloud/sidebar", () => {
    expect(hostSource).toContain('from "@austencloud/sidebar"');
    expect(hostSource).toMatch(/<Sidebar\b/);
  });

  it("supplies the seam through the package props/slots", () => {
    // The wrapper must go through the seam, not fork behaviour.
    for (const marker of [
      "filterSection",
      "translateLabel",
      "getBadgeCount",
      "{#snippet brand(",
      "{#snippet footer",
      "{#snippet beforeTree",
    ]) {
      expect(hostSource).toContain(marker);
    }
  });

  it("imports no package shell internals (shell lives in @austencloud/sidebar)", () => {
    const imports = importSpecifierLines(hostSource).join("\n");
    const violations = SHELL_INTERNALS.filter((marker) => imports.includes(marker));
    expect(violations).toEqual([]);
  });
});
