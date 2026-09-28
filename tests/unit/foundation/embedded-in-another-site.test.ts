/**
 * isEmbeddedInAnotherSite decides whether a page hides its library save and
 * sign-up window. A wrong yes hides them on our own pages; a wrong no offers
 * a save inside someone else's site that lands where the person can never
 * reach it, while the toast says it saved.
 */
import { describe, expect, it } from "vitest";
import { isEmbeddedInAnotherSite } from "$lib/shared/foundation/utils/embedded-in-another-site";

function frameUnder(top: unknown): Window {
  const win = {} as { self: unknown; top: unknown };
  win.self = win;
  win.top = top;
  return win as unknown as Window;
}

describe("isEmbeddedInAnotherSite", () => {
  it("says no for a page opened directly", () => {
    const win = {} as { self: unknown; top: unknown };
    win.self = win;
    win.top = win;
    expect(isEmbeddedInAnotherSite(win as unknown as Window)).toBe(false);
  });

  it("says no inside a frame on our own site, whose address it can read", () => {
    const top = { location: { href: "https://tkaflowarts.com/" } };
    expect(isEmbeddedInAnotherSite(frameUnder(top))).toBe(false);
  });

  it("says yes inside another site's frame, which refuses the read", () => {
    const top = {
      get location(): never {
        throw new DOMException("Blocked a frame", "SecurityError");
      },
    };
    expect(isEmbeddedInAnotherSite(frameUnder(top))).toBe(true);
  });

  it("says no when the browser reports no top page", () => {
    expect(isEmbeddedInAnotherSite(frameUnder(null))).toBe(false);
  });

  it("says no in this test page itself, which is not framed", () => {
    expect(isEmbeddedInAnotherSite()).toBe(false);
  });
});
