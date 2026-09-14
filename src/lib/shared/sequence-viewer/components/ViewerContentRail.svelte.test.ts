import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { beforeEach, expect, it, vi } from "vitest";
import ViewerContentRail from "./ViewerContentRail.svelte";

vi.mock("../services/post-studio-access", () => ({
  canAccessPostStudio: () => false,
}));
vi.mock("$lib/shared/3d/capabilities/viewport-3d-gate.svelte", () => ({
  viewportFits3D: () => false,
}));
vi.mock("../services/viewer-modes", () => ({
  viewerModeOptions: () => [
    { id: "animation", icon: "fa-play", label: "Animation" },
  ],
  PRACTICE_OPTION: { label: "Practice", icon: "fa-camera" },
}));

beforeEach(() => localStorage.removeItem("tka-viewer-rail-width"));

it("resizes and persists with the keyboard, respects bounds, and retains collapse/restore", async () => {
  render(ViewerContentRail, {
    activeMode: "animation",
    onSelectMode: vi.fn(),
    onSelectSplit: vi.fn(),
  });
  const handle = document.querySelector(
    '[aria-label="Resize sidebar"]'
  ) as HTMLElement;
  handle.focus();
  await userEvent.keyboard("{ArrowRight}");
  expect(localStorage.getItem("tka-viewer-rail-width")).toBe("196");
  await userEvent.keyboard("{End}{ArrowRight}");
  expect(localStorage.getItem("tka-viewer-rail-width")).toBe("300");
  await userEvent.keyboard("{Home}{ArrowLeft}");
  expect(localStorage.getItem("tka-viewer-rail-width")).toBe("72");
  await userEvent.keyboard("{Enter}");
  expect(localStorage.getItem("tka-viewer-rail-width")).toBe("180");
  expect(handle.getAttribute("role")).toBe("separator");
  expect(handle.getAttribute("aria-orientation")).toBe("vertical");
  expect(document.activeElement).toBe(handle);
  handle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  expect(localStorage.getItem("tka-viewer-rail-width")).toBe("72");
});
