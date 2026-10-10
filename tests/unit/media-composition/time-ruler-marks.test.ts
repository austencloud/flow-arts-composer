import { mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import TimeRuler from "#lib/shared/timeline/TimeRuler.svelte";

// vitest-setup.ts swaps document.createElement for canvas stubs that are not
// DOM nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;
let stubbedCreateElement: typeof document.createElement;
let mounted: ReturnType<typeof mount> | null = null;

beforeEach(() => {
  stubbedCreateElement = document.createElement;
  document.createElement = realCreateElement.bind(document);
});

afterEach(() => {
  if (mounted) unmount(mounted);
  mounted = null;
  document.body.innerHTML = "";
  document.createElement = stubbedCreateElement;
});

function ruler(props: Record<string, unknown>): HTMLElement {
  const target = document.createElement("div");
  document.body.append(target);
  mounted = mount(TimeRuler, {
    target,
    props: { duration: 20, pixelsPerSecond: 50, ...props },
  });
  return target;
}

describe("TimeRuler marks", () => {
  it("labels the times it is given, laid out like its ticks", () => {
    const target = ruler({
      marks: [
        { seconds: 1.5, label: "1" },
        { seconds: 3.5, label: "2" },
      ],
    });
    const marks = [...target.querySelectorAll<HTMLElement>(".mark")];
    expect(marks.map((mark) => mark.textContent)).toEqual(["1", "2"]);
    expect(marks.map((mark) => mark.style.left)).toEqual(["75px", "175px"]);
  });

  it("shows none unless asked", () => {
    expect(ruler({}).querySelectorAll(".mark")).toHaveLength(0);
  });
});
