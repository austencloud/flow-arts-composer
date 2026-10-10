import { describe, expect, it } from "vitest";
import {
  canInlineTunnelInspector,
  resolveTunnelWorkspaceMode,
} from "#lib/features/create/tunnel/domain/tunnel-workspace-layout.js";

describe("Tunnel workspace layout", () => {
  it.each([
    [{ width: 303, height: 614 }, "stack"],
    [{ width: 755, height: 1127 }, "portrait"],
    [{ width: 895, height: 359 }, "short-landscape"],
    [{ width: 1389, height: 847 }, "split"],
    [{ width: 3765, height: 2107 }, "split"],
  ] as const)("maps the measured %j slot to %s", (size, expected) => {
    expect(resolveTunnelWorkspaceMode(size)).toBe(expected);
  });

  it("does not crush a short portrait tablet into two columns", () => {
    expect(resolveTunnelWorkspaceMode({ width: 820, height: 680 })).toBe(
      "stack"
    );
  });

  it("stacks a narrow landscape slot at the 200% zoom reflow size", () => {
    expect(resolveTunnelWorkspaceMode({ width: 708, height: 404 })).toBe(
      "stack"
    );
  });

  it("uses the drawer until a split workspace has enough height", () => {
    expect(canInlineTunnelInspector({ width: 1400, height: 650 })).toBe(false);
    expect(canInlineTunnelInspector({ width: 1400, height: 700 })).toBe(true);
    expect(canInlineTunnelInspector({ width: 900, height: 1200 })).toBe(false);
  });
});
