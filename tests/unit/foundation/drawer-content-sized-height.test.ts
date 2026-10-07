import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * iPhone regression lock: content-sized bottom sheets opened as a bare grab
 * handle (2026-10-06, installed PWA and Safari tab alike).
 *
 * The drawer is a native <dialog>, whose UA height is fit-content. A bottom
 * sheet with no set height is therefore as tall as its column-flex content.
 * WebKit (Safari, and every browser on iOS) computes that height from each
 * child's FLEX BASIS. `flex: 1` means a 0% basis, and with `min-height: 0`
 * the child contributes 0px, so the sheet shrank to its min-height floor. The
 * phone navigation menu sets that floor to 0, so it rendered as the 23px
 * handle strip at the bottom of the screen (reproduced in WebKitGTK; Blink
 * sizes from content, so desktop Chrome never showed it).
 *
 * The fix keeps every growing region in a content-sized sheet's chain on
 * `flex-basis: auto`. jsdom does no layout, so this locks the CSS contract.
 */

const root = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

/** Declarations of the first rule whose selector text equals `selector`. */
function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Whole selector on its own line, so `.x > .drawer-inner` never matches.
  const match = new RegExp(`^[ \\t]*${escaped}\\s*\\{([^}]*)\\}`, "m").exec(css);
  if (!match) throw new Error(`rule not found: ${selector}`);
  return match[1]!.replace(/\/\*[\s\S]*?\*\//g, "");
}

function flexValue(body: string): string | undefined {
  return /(?:^|;|\s)flex\s*:\s*([^;]+);/.exec(body)?.[1]?.trim();
}

/** True when a `flex` shorthand leaves the basis at 0 / 0%. */
function hasZeroBasis(value: string): boolean {
  const parts = value.split(/\s+/);
  if (parts.length === 1) return /^\d+(\.\d+)?$/.test(parts[0]!);
  if (parts.length === 2) return /^\d/.test(parts[1]!) && /^0(%|px)?$/.test(parts[1]!);
  return /^0(%|px)?$/.test(parts[2]!);
}

describe("content-sized drawer sheets keep a non-zero flex basis (iOS WebKit)", () => {
  it("helper recognizes zero-basis shorthands", () => {
    expect(hasZeroBasis("1")).toBe(true);
    expect(hasZeroBasis("1 1 0%")).toBe(true);
    expect(hasZeroBasis("1 1 auto")).toBe(false);
    expect(hasZeroBasis("0 1 auto")).toBe(false);
  });

  it("the shared Drawer .drawer-inner uses flex-basis auto", () => {
    const body = ruleBody(
      read("src/lib/shared/foundation/ui/drawer/Drawer.css"),
      ".drawer-inner"
    );
    const flex = flexValue(body);
    expect(flex).toBeDefined();
    expect(hasZeroBasis(flex!)).toBe(false);
    expect(body).toMatch(/min-height:\s*0/);
  });

  it("the navigation menu's flex chain stays on basis auto", () => {
    const svelte = read(
      "src/lib/shared/navigation/components/ModuleSwitcher.svelte"
    );
    // The menu is the content-sized sheet that collapsed to the handle.
    expect(ruleBody(svelte, ':global(.module-switcher-drawer[data-placement="bottom"])')).toMatch(
      /--sheet-min-height:\s*0/
    );
    for (const selector of [
      ":global(.drawer-content.module-switcher-drawer .drawer-inner)",
      ".module-switcher-container",
      ".module-switcher-content",
    ]) {
      const flex = flexValue(ruleBody(svelte, selector));
      expect(flex, selector).toBeDefined();
      expect(hasZeroBasis(flex!), `${selector} flex: ${flex}`).toBe(false);
    }
  });

  it("the inbox message action sheet's scroller stays on basis auto", () => {
    const svelte = read(
      "src/lib/shared/inbox/components/messages/MessageActionSheet.svelte"
    );
    const flex = flexValue(ruleBody(svelte, ".sheet-content"));
    expect(flex).toBeDefined();
    expect(hasZeroBasis(flex!)).toBe(false);
  });
});
