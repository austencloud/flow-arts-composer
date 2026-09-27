// @vitest-environment jsdom

import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatTime } from "$lib/shared/sequence-viewer/utils/format-time";

const { default: StepMapEditor } =
  await import("$lib/shared/sequence-viewer/components/step-mapping/StepMapEditor.svelte");

// vitest-setup.ts swaps document.createElement for canvas stubs that are not
// DOM nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;

// The editor read an `initialTime` prop it never took out of $props(), so
// opening it with no unfinished draft and no saved map threw "initialTime is
// not defined" before anything rendered: the first run on every new clip.
describe("StepMapEditor on a blank slate", () => {
  let host: HTMLElement;
  let component: ReturnType<typeof mount> | null = null;
  let stubbedCreateElement: typeof document.createElement;

  beforeEach(() => {
    stubbedCreateElement = document.createElement;
    document.createElement = realCreateElement.bind(document);
    // The timeline measures its width with bind:clientWidth; jsdom has no
    // ResizeObserver for Svelte to do that with.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
    );
    host = document.createElement("div");
    document.body.append(host);
  });

  afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
    document.createElement = stubbedCreateElement;
    vi.unstubAllGlobals();
  });

  function open(initialTime?: number): string {
    component = mount(StepMapEditor, {
      target: host,
      props: {
        videoUrl: "",
        videoDuration: 90,
        steps: [],
        bpm: 120,
        initialTime,
        onSave: async () => {},
        onClose: () => {},
      },
    });
    flushSync();
    const time = host.querySelector(".stage-time");
    if (!time) throw new Error("The editor rendered no playhead time");
    return time.textContent?.trim() ?? "";
  }

  it("opens at the top of the clip without a hint", () => {
    expect(open()).toBe(`${formatTime(0)} / ${formatTime(90)}`);
  });

  it("opens where the caller's hint says the footage starts", () => {
    expect(open(42)).toBe(`${formatTime(42)} / ${formatTime(90)}`);
  });
});
