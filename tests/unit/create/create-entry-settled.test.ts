// @vitest-environment jsdom

/**
 * A Create entry (front-door tap or boot) reveals the workspace only once the
 * method's panel and its beat grid are drawn. The beat grid's code loads
 * separately and shows nothing while it does, so it marks itself pending.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { isEntryLayerSettled } from "#lib/features/create/shared/services/create-entry-trace.js";

// jsdom has no CSS.escape; method ids are plain words.
beforeAll(() => {
  if (typeof CSS === "undefined" || !CSS.escape) {
    vi.stubGlobal("CSS", { escape: (value: string) => value });
  }
});

// vitest-setup.ts stubs document.createElement; the layer must be real nodes.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;

function layer(inner: string): HTMLElement {
  const element = realCreateElement.call(document, "div") as HTMLElement;
  element.innerHTML = inner;
  return element;
}

const panel = '<div class="sub-tab-content" data-tab="construct"><p></p></div>';

describe("isEntryLayerSettled", () => {
  it("is settled when the panel has content and nothing is still coming", () => {
    expect(
      isEntryLayerSettled(
        layer(`${panel}<div class="pictograph-container"></div>`),
        "construct"
      )
    ).toBe(true);
  });

  it("waits for a beat grid whose code is still loading", () => {
    expect(
      isEntryLayerSettled(
        layer(`${panel}<div class="workspace-area-pending"></div>`),
        "construct"
      )
    ).toBe(false);
  });

  it("waits for a pictograph that is still drawing", () => {
    expect(
      isEntryLayerSettled(
        layer(
          `${panel}<div class="pictograph-container" aria-busy="true"></div>`
        ),
        "construct"
      )
    ).toBe(false);
  });
});
