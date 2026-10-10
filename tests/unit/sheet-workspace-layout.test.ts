import { describe, expect, it } from "vitest";
import {
  shouldStackSheetWorkspace,
  shouldUseTwoUpSheetLayout,
} from "#lib/features/write/domain/sheet-workspace-layout.js";

const base = {
  zoom: 1,
  pageCount: 2,
  stageWidth: 2560,
  stageHeight: 1200,
  pageAspectRatio: 11 / 8.5,
  rootFontSize: 16,
};

describe("shouldUseTwoUpSheetLayout", () => {
  it("uses a readable two-page spread on a wide stage", () => {
    expect(shouldUseTwoUpSheetLayout(base)).toBe(true);
  });
  it("keeps narrow or zoomed stages single-page", () => {
    expect(shouldUseTwoUpSheetLayout({ ...base, stageWidth: 1200 })).toBe(
      false
    );
    expect(shouldUseTwoUpSheetLayout({ ...base, zoom: 1.25 })).toBe(false);
  });
  it("requires at least two pages", () => {
    expect(shouldUseTwoUpSheetLayout({ ...base, pageCount: 1 })).toBe(false);
  });
});

describe("shouldStackSheetWorkspace", () => {
  it("stacks a narrow portrait workspace", () => {
    expect(shouldStackSheetWorkspace(795, 1100)).toBe(true);
  });

  it("keeps a short landscape workspace side by side", () => {
    expect(shouldStackSheetWorkspace(880, 380)).toBe(false);
  });

  it("always stacks phone-width workspaces", () => {
    expect(shouldStackSheetWorkspace(376, 412)).toBe(true);
  });
});
