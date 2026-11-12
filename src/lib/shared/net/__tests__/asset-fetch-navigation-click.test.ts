import { describe, expect, it } from "vitest";
import { isDocumentNavigationClick } from "../asset-fetch";

const here = { href: "https://example.test/composer" };

function link(href: string, attrs: Record<string, string> = {}) {
  const anchor = {
    href: new URL(href, here.href).href,
    hasAttribute: (name: string) => name in attrs,
    getAttribute: (name: string) => attrs[name] ?? null,
  };
  return { closest: () => anchor } as unknown as Element;
}

function click(target: Element | null, extra: Partial<MouseEvent> = {}) {
  return {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target,
    ...extra,
  } as MouseEvent;
}

describe("isDocumentNavigationClick", () => {
  it("counts a plain link the browser follows, like Open the app", () => {
    expect(isDocumentNavigationClick(click(link("/create")), here)).toBe(true);
  });

  it("ignores a link the router handled in place", () => {
    expect(
      isDocumentNavigationClick(
        click(link("/create"), { defaultPrevented: true }),
        here
      )
    ).toBe(false);
  });

  it("ignores new tabs, downloads and modifier clicks", () => {
    expect(
      isDocumentNavigationClick(
        click(link("/create", { target: "_blank" })),
        here
      )
    ).toBe(false);
    expect(
      isDocumentNavigationClick(
        click(link("/file.svg", { download: "" })),
        here
      )
    ).toBe(false);
    expect(
      isDocumentNavigationClick(click(link("/create"), { metaKey: true }), here)
    ).toBe(false);
  });

  it("ignores an in-page anchor and non-web links", () => {
    expect(
      isDocumentNavigationClick(click(link("/composer#story")), here)
    ).toBe(false);
    expect(
      isDocumentNavigationClick(click(link("mailto:someone@example.test")), here)
    ).toBe(false);
  });

  it("ignores a click outside any link", () => {
    const plain = { closest: () => null } as unknown as Element;
    expect(isDocumentNavigationClick(click(plain), here)).toBe(false);
  });
});
