/**
 * Create method previews press inside boxes as small as 40px, so the ghost
 * has a compact size: a class the stylesheet sizes off the preview box. The
 * trail is unchanged; previews, like the Composer demos, pass no speed.
 */
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import GhostPointer from "#lib/shared/attract/components/GhostPointer.svelte";

// vitest-setup.ts swaps document.createElement for stubs that are not DOM
// nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;

let app: ReturnType<typeof mount> | null = null;
let stubbedCreateElement: typeof document.createElement;

beforeEach(() => {
  stubbedCreateElement = document.createElement;
  document.createElement = realCreateElement.bind(document);
});

afterEach(() => {
  if (app) unmount(app);
  app = null;
  document.body.innerHTML = "";
  document.createElement = stubbedCreateElement;
});

function render(props: Record<string, unknown>) {
  const target = document.createElement("div");
  document.body.append(target);
  app = mount(GhostPointer, {
    target,
    props: { x: 10, y: 10, visible: true, ...props },
  });
  flushSync();
  return target;
}

describe("GhostPointer compact size", () => {
  it("marks the ghost compact", () => {
    const target = render({ compact: true });
    expect(target.querySelector(".ghost")?.classList.contains("compact")).toBe(
      true
    );
  });

  it("keeps the default trail without compact", () => {
    const target = render({ speed: 1 });
    expect(target.querySelector(".ghost")?.classList.contains("compact")).toBe(
      false
    );
    expect(target.querySelector<HTMLElement>(".trail")?.style.width).toBe(
      "54px"
    );
  });
});
