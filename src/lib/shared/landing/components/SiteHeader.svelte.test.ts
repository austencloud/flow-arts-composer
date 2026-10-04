import { render } from "vitest-browser-svelte";
import { page as appPage } from "$app/state";
import { beforeEach, describe, expect, it } from "vitest";
import { tick } from "svelte";

import SiteHeader from "./SiteHeader.svelte";

function setPath(pathname: string) {
  (appPage as unknown as { url: URL }).url = new URL(
    pathname,
    "https://tkaflowarts.test"
  );
}

function desktopTrigger(label: string) {
  const trigger = Array.from(
    document.querySelectorAll<HTMLButtonElement>(".desktop-nav .trigger")
  ).find((candidate) => candidate.textContent?.trim().startsWith(label));

  expect(trigger, `Missing desktop trigger: ${label}`).toBeDefined();
  return trigger!;
}

async function click(trigger: HTMLButtonElement) {
  trigger.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" })
  );
  trigger.click();
  await tick();
}

beforeEach(() => setPath("/"));

describe("SiteHeader desktop disclosures", () => {
  it("keeps History as a direct destination outside the Notation disclosure", async () => {
    setPath("/history");
    render(SiteHeader);
    const desktopNav = document.querySelector<HTMLElement>(".desktop-nav");
    expect(desktopNav).not.toBeNull();
    desktopNav!.style.display = "flex";

    const history = document.querySelector<HTMLAnchorElement>(
      '.desktop-nav > a[href="/history"]'
    );
    expect(history).not.toBeNull();
    expect(history).toHaveClass("active");
    expect(history).toHaveAttribute("aria-current", "page");
    expect(history!.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);

    const notation = desktopTrigger("Notation");
    expect(notation).toHaveAttribute("aria-expanded", "false");
    expect(notation.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await click(notation);

    const notationHrefs = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(".desktop-nav .panel a")
    ).map((link) => link.getAttribute("href"));
    expect(notationHrefs).toEqual(["/shape-engine"]);
  });

  it("keeps hover visual-only and opens on click", async () => {
    render(SiteHeader);
    const notation = desktopTrigger("Notation");

    notation.dispatchEvent(
      new PointerEvent("pointerenter", { pointerType: "mouse" })
    );
    await new Promise((resolve) => setTimeout(resolve, 550));
    expect(notation.getAttribute("aria-expanded")).toBe("false");

    await click(notation);
    expect(notation.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelectorAll(".desktop-nav .panel")).toHaveLength(1);
  });

  it("keeps exactly one group open and lets the active trigger close it", async () => {
    render(SiteHeader);
    const notation = desktopTrigger("Notation");
    const learn = desktopTrigger("Learn");

    await click(notation);
    await click(learn);

    expect(notation.getAttribute("aria-expanded")).toBe("false");
    expect(learn.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelectorAll(".desktop-nav .panel")).toHaveLength(1);
    expect(
      document.querySelector(".desktop-nav .panel")?.textContent
    ).toContain("Guide");
    expect(
      document.querySelector<HTMLAnchorElement>(
        '.desktop-nav .panel a[href="/timing-and-direction"]'
      )
    ).not.toBeNull();

    await click(learn);
    expect(learn.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelectorAll(".desktop-nav .panel")).toHaveLength(0);
  });

  it("closes with Escape and restores focus to its trigger", async () => {
    render(SiteHeader);
    const notation = desktopTrigger("Notation");
    const desktopNav = document.querySelector<HTMLElement>(".desktop-nav");
    expect(desktopNav).not.toBeNull();
    desktopNav!.style.display = "flex";

    await click(notation);
    notation.focus();
    notation.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    await tick();

    expect(notation.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(notation);
  });

  // Shop is the group whose destinations nest: /shop/loop-deck sits under
  // /shop, and both match the path. (Notation lost its own nested pair when
  // the archive moved from /notation to /history on 2026-09-03.)
  it("marks only the most specific matching destination active", async () => {
    setPath("/shop/loop-deck");
    render(SiteHeader);
    await click(desktopTrigger("Shop"));

    const desktopLinks = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(".desktop-nav .panel a")
    );
    const desktopActiveHrefs = desktopLinks
      .filter((link) => link.classList.contains("active"))
      .map((link) => link.getAttribute("href"));

    expect(desktopActiveHrefs).toEqual(["/shop/loop-deck"]);
    expect(
      desktopLinks.find((link) => link.getAttribute("href") === "/shop")
    ).not.toHaveAttribute("aria-current");
    expect(
      desktopLinks.find(
        (link) => link.getAttribute("href") === "/shop/loop-deck"
      )
    ).toHaveAttribute("aria-current", "page");

    const mobileActiveHrefs = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        ".mobile-nav .m-sub-inner a.active"
      )
    ).map((link) => link.getAttribute("href"));
    expect(mobileActiveHrefs).toEqual(["/shop/loop-deck"]);
  });
});
