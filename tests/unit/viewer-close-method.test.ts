import { describe, expect, it } from "vitest";
import {
  closeMethodFromDrawer,
  createViewerCloseRecorder,
  type ViewerCloseMethod,
} from "../../src/lib/shared/sequence-viewer/analytics/viewer-close-method";

describe("closeMethodFromDrawer", () => {
  it("names each way the drawer itself closes", () => {
    expect(closeMethodFromDrawer("swipe")).toBe("swipe_down");
    expect(closeMethodFromDrawer("snap")).toBe("swipe_down");
    expect(closeMethodFromDrawer("backdrop")).toBe("tap_outside");
    expect(closeMethodFromDrawer("escape")).toBe("escape");
  });

  it("tells Android's Back apart from the Escape key", () => {
    expect(closeMethodFromDrawer("escape", true)).toBe("back");
  });

  it("leaves a programmatic close to the path that caused it", () => {
    expect(closeMethodFromDrawer("programmatic")).toBeNull();
    expect(closeMethodFromDrawer(undefined)).toBeNull();
  });
});

describe("createViewerCloseRecorder", () => {
  function setup() {
    let clock = 0;
    const sent: Array<[string, ViewerCloseMethod, number]> = [];
    const recorder = createViewerCloseRecorder<string>({
      now: () => clock,
      send: (context, method, openMs) => sent.push([context, method, openMs]),
    });
    return { recorder, sent, advance: (ms: number) => (clock += ms) };
  }

  it("sends one event per open, with the first method recorded", () => {
    const { recorder, sent, advance } = setup();
    recorder.opened("seq-a");
    advance(4200);
    // The close button shuts the drawer, which then reports its own close.
    recorder.closed("close_button");
    recorder.closed(null);
    recorder.closed("swipe_down");
    expect(sent).toEqual([["seq-a", "close_button", 4200]]);
  });

  it("ignores a programmatic close and waits for the real cause", () => {
    const { recorder, sent } = setup();
    recorder.opened("seq-b");
    recorder.closed(null);
    recorder.closed("back");
    expect(sent).toEqual([["seq-b", "back", 0]]);
  });

  it("sends nothing for a close with no open waiting", () => {
    const { recorder, sent } = setup();
    recorder.closed("tap_outside");
    recorder.opened("seq-c");
    recorder.closed("tap_outside");
    recorder.closed("tap_outside");
    expect(sent).toEqual([["seq-c", "tap_outside", 0]]);
  });
});
