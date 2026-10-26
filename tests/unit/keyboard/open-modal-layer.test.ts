import { afterEach, describe, expect, it } from "vitest";
import { hasOpenModalLayer } from "#lib/shared/keyboard/domain/shortcut-target-resolution.js";

afterEach(() => {
  document.body.replaceChildren();
});

function mount(html: string) {
  document.body.innerHTML = html;
}

describe("hasOpenModalLayer", () => {
  it("ignores a closed dialog kept mounted with a modal role", () => {
    mount(
      '<dialog class="sequence-viewer-drawer" role="dialog" aria-modal="true" data-state="closed"></dialog>'
    );
    expect(hasOpenModalLayer()).toBe(false);
  });

  it("counts a dialog with the open attribute", () => {
    mount("<dialog open></dialog>");
    expect(hasOpenModalLayer()).toBe(true);
  });

  it("counts a visible element with a dialog role", () => {
    mount('<div role="dialog"></div>');
    expect(hasOpenModalLayer()).toBe(true);
  });

  it("ignores a dialog-role element hidden with display none", () => {
    mount('<div role="dialog" style="display: none"></div>');
    expect(hasOpenModalLayer()).toBe(false);
  });

  it("finds nothing in an empty document", () => {
    expect(hasOpenModalLayer()).toBe(false);
    expect(
      hasOpenModalLayer(document.implementation.createHTMLDocument())
    ).toBe(false);
  });
});
