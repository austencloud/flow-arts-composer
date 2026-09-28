import { render } from "vitest-browser-svelte";
import { createRawSnippet } from "svelte";
import { describe, expect, it } from "vitest";
import LinkChip from "./LinkChip.svelte";

const label = (text: string) =>
  createRawSnippet(() => ({ render: () => `<span>${text}</span>` }));

describe("LinkChip", () => {
  it("opens another site in a new tab and says so to screen readers", async () => {
    const screen = render(LinkChip, {
      href: "https://example.com/matrix",
      children: label("Shape Matrix"),
      newTabLabel: "(neuer Tab)",
    });

    const link = screen.getByRole("link").element() as HTMLAnchorElement;
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
    expect(link.textContent).toContain("(neuer Tab)");
  });

  it("stays in the tab for a page on this site", async () => {
    const screen = render(LinkChip, {
      href: "/guide/ratios",
      children: label("Spin ratios"),
    });

    const link = screen.getByRole("link").element() as HTMLAnchorElement;
    expect(link.target).toBe("");
    expect(link.rel).toBe("");
    expect(link.textContent?.trim()).toBe("Spin ratios");
  });
});
