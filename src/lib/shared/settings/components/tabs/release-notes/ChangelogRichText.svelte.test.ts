import { render } from "vitest-browser-svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChangelogRichText from "./ChangelogRichText.svelte";

const navigation = vi.hoisted(() => ({
  goto: vi.fn<(_href: string) => Promise<void>>(),
  handleModuleChange:
    vi.fn<(_moduleId: string, _tabId?: string) => Promise<void>>(),
  openSheet: vi.fn(),
}));

vi.mock("$app/navigation", () => ({
  goto: navigation.goto,
}));

vi.mock("#lib/shared/navigation/services/sheet-router.js", () => ({
  openSheet: navigation.openSheet,
}));

vi.mock(
  "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js",
  () => ({
    handleModuleChange: navigation.handleModuleChange,
  })
);

describe("ChangelogRichText navigation", () => {
  beforeEach(() => {
    navigation.goto.mockReset();
    navigation.goto.mockResolvedValue();
    navigation.handleModuleChange.mockReset();
    navigation.handleModuleChange.mockResolvedValue();
    navigation.openSheet.mockReset();
  });

  it.each([
    {
      label: "Winter background",
      href: "/settings/theme",
      moduleId: "settings",
      tabId: "theme",
    },
    {
      label: "Construct",
      href: "/create/construct",
      moduleId: "create",
      tabId: "construct",
    },
    {
      label: "Gallery",
      href: "/browse/gallery",
      moduleId: "browse",
      tabId: "gallery",
    },
    {
      label: "Creators",
      href: "/creators",
      moduleId: "creators",
      tabId: undefined,
    },
  ])(
    "routes $label through the app navigation coordinator",
    ({ label, href, moduleId, tabId }) => {
      const onNavigate = vi.fn();
      render(ChangelogRichText, {
        text: `Open [${label}](${href}).`,
        onNavigate,
      });

      const link = document.querySelector<HTMLAnchorElement>("a.entry-link");
      expect(link).toBeInstanceOf(HTMLAnchorElement);
      expect(link!.getAttribute("href")).toBe(href);

      const click = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
      });
      link!.dispatchEvent(click);

      expect(click.defaultPrevented).toBe(true);
      expect(navigation.handleModuleChange).toHaveBeenCalledOnce();
      expect(navigation.handleModuleChange).toHaveBeenCalledWith(
        moduleId,
        tabId
      );
      expect(navigation.goto).not.toHaveBeenCalled();
      expect(onNavigate).toHaveBeenCalledOnce();
    }
  );

  it("leaves modified internal clicks to the browser and keeps the host open", () => {
    const onNavigate = vi.fn();
    render(ChangelogRichText, {
      text: "Browse the new [Gallery](/browse/gallery).",
      onNavigate,
    });

    const link = document.querySelector<HTMLAnchorElement>("a.entry-link");
    expect(link).toBeInstanceOf(HTMLAnchorElement);

    const click = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true,
    });
    link!.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(false);
    expect(navigation.goto).not.toHaveBeenCalled();
    expect(navigation.handleModuleChange).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("keeps public internal pages on the SvelteKit router", () => {
    const onNavigate = vi.fn();
    render(ChangelogRichText, {
      text: "Browse the [Shop](/shop).",
      onNavigate,
    });

    const link = document.querySelector<HTMLAnchorElement>("a.entry-link");
    link?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
      })
    );

    expect(navigation.goto).toHaveBeenCalledOnce();
    expect(navigation.goto).toHaveBeenCalledWith("/shop");
    expect(navigation.handleModuleChange).not.toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it("keeps external actions as protected new-tab links", () => {
    render(ChangelogRichText, {
      text: "Read the [documentation](https://example.com/docs).",
    });

    const link = document.querySelector<HTMLAnchorElement>("a.entry-link");
    expect(link).toBeInstanceOf(HTMLAnchorElement);
    expect(link!.getAttribute("href")).toBe("https://example.com/docs");
    expect(link!.getAttribute("target")).toBe("_blank");
    expect(link!.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("opens an Inbox sheet link without navigating away", () => {
    const onNavigate = vi.fn();
    render(ChangelogRichText, {
      text: "Edit sent messages from the [Inbox](/browse/library?sheet=inbox).",
      onNavigate,
    });

    const link = document.querySelector<HTMLAnchorElement>("a.entry-link");
    expect(link?.getAttribute("href")).toBe("/browse/library?sheet=inbox");

    link?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
      })
    );

    expect(navigation.openSheet).toHaveBeenCalledWith("inbox");
    expect(navigation.goto).not.toHaveBeenCalled();
    expect(navigation.handleModuleChange).not.toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalledOnce();
  });
});
