import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, it, expect, vi } from "vitest";
import Harness from "./SelectionHit.test-harness.svelte";
import { expectNoA11yViolations } from "#test-helpers/component-a11y.js";

describe("SelectionHit", () => {
  it("renders a labelled, tab-focusable button for a group-start unit", async () => {
    render(Harness, {
      withScope: true,
      groupId: "seq-1",
      isGroupStart: true,
      label: "Select the CAKE sequence",
    });
    const btn = page.getByRole("button", { name: "Select the CAKE sequence" });
    await expect.element(btn).toBeVisible();
    await expect.element(btn).toHaveAttribute("aria-pressed", "false");
    await expect.element(btn).not.toHaveAttribute("tabindex", "-1");
  });

  it("fires onselect with the groupId when clicked", async () => {
    const onselect = vi.fn();
    render(Harness, {
      withScope: true,
      groupId: "seq-1",
      isGroupStart: true,
      label: "Select the CAKE sequence",
      onselect,
    });
    await page
      .getByRole("button", { name: "Select the CAKE sequence" })
      .click();
    expect(onselect).toHaveBeenCalledWith("seq-1");
  });

  it("renders navigation destinations as links", async () => {
    render(Harness, {
      withScope: true,
      groupId: "G-0",
      isGroupStart: true,
      label: "Explore G variations",
      href: "/atlas?board=atlas&letter=G#cat-letter",
    });
    const link = page.getByRole("link", { name: "Explore G variations" });
    await expect
      .element(link)
      .toHaveAttribute("href", "/atlas?board=atlas&letter=G#cat-letter");
    await expect.element(link).not.toHaveAttribute("aria-pressed");
  });

  it("marks non-start units pointer-only (not a tab stop, aria-hidden)", async () => {
    const { container } = render(Harness, {
      withScope: true,
      groupId: "seq-1",
      isGroupStart: false,
      label: "",
    });
    const hit = container.querySelector(".tka-seq-hit") as HTMLButtonElement;
    expect(hit).not.toBeNull();
    expect(hit.getAttribute("tabindex")).toBe("-1");
    expect(hit.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders nothing when no scope is provided", async () => {
    const { container } = render(Harness, {
      withScope: false,
      groupId: "seq-1",
      isGroupStart: true,
      label: "x",
    });
    expect(container.querySelector(".tka-seq-hit")).toBeNull();
  });

  it("has no AAA a11y violations", async () => {
    render(Harness, {
      withScope: true,
      groupId: "seq-1",
      isGroupStart: true,
      label: "Select the CAKE sequence",
    });
    await expectNoA11yViolations();
  });
});
