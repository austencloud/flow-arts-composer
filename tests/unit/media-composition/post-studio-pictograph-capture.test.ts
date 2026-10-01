import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostStudioPictographCapture } from "$lib/shared/media-composition/services/post-studio-pictograph-capture";

const { createContext, destroyContext, domToCanvas } = vi.hoisted(() => ({
  createContext: vi.fn(),
  destroyContext: vi.fn(),
  domToCanvas: vi.fn(),
}));

vi.mock("modern-screenshot", () => ({
  createContext,
  destroyContext,
  domToCanvas,
}));

function createMotion(): HTMLElement {
  return document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div"
  ) as HTMLElement;
}

beforeEach(() => {
  createContext
    .mockReset()
    .mockImplementation((node, options) =>
      Promise.resolve({ node, ...options })
    );
  destroyContext.mockReset();
  domToCanvas
    .mockReset()
    .mockImplementation(() =>
      Promise.resolve(document.createElement("canvas"))
    );
});

describe("Post Studio pictograph capture", () => {
  it("includes computed paint properties without inherited custom tokens", async () => {
    const capture = new PostStudioPictographCapture();
    const motion = createMotion();
    motion.style.setProperty("--motion-accent", "#f00");
    motion.style.setProperty("color", "rgb(255, 0, 0)");
    motion.style.setProperty("fill", "rgb(0, 0, 255)");

    await capture.capture(motion, 200, 100, 2);

    const options = createContext.mock.calls[0]![1];
    const computed = getComputedStyle(motion);
    const standardProperties = Array.from(
      { length: computed.length },
      (_, index) => computed.item(index)
    ).filter((name) => !name.startsWith("--"));
    expect(options.includeStyleProperties).toEqual(standardProperties);
    expect(options.includeStyleProperties).toContain("color");
    expect(options.includeStyleProperties).toContain("fill");
    expect(options.includeStyleProperties).not.toContain("--motion-accent");
    capture.dispose();
  });

  it("reuses one context but captures the live motion element each frame", async () => {
    const capture = new PostStudioPictographCapture();
    const motion = createMotion();
    motion.textContent = "first frame";
    const capturedText: string[] = [];
    domToCanvas.mockImplementation((context) => {
      capturedText.push(context.node.textContent ?? "");
      return Promise.resolve(document.createElement("canvas"));
    });

    await capture.capture(motion, 200, 100, 2);
    motion.textContent = "next frame";
    await capture.capture(motion, 200, 100, 2);

    expect(createContext).toHaveBeenCalledTimes(1);
    expect(domToCanvas).toHaveBeenCalledTimes(2);
    expect(domToCanvas.mock.calls[0]![0]).toBe(domToCanvas.mock.calls[1]![0]);
    expect(capturedText).toEqual(["first frame", "next frame"]);
    capture.dispose();
    expect(destroyContext).toHaveBeenCalledTimes(1);
  });

  it("recreates context when the element, dimensions, or scale changes", async () => {
    const capture = new PostStudioPictographCapture();
    const first = createMotion();
    const remount = createMotion();

    await capture.capture(first, 200, 100, 2);
    await capture.capture(remount, 200, 100, 2);
    await capture.capture(remount, 201, 100, 2);
    await capture.capture(remount, 201, 101, 2);
    await capture.capture(remount, 201, 101, 3);

    expect(createContext).toHaveBeenCalledTimes(5);
    expect(destroyContext).toHaveBeenCalledTimes(4);
    capture.dispose();
    expect(destroyContext).toHaveBeenCalledTimes(5);
  });

  it("disposes a failed capture before rethrowing", async () => {
    const capture = new PostStudioPictographCapture();
    domToCanvas.mockRejectedValueOnce(new Error("capture failed"));
    const motion = createMotion();

    await expect(capture.capture(motion, 200, 100, 2)).rejects.toThrow(
      "capture failed"
    );
    expect(destroyContext).toHaveBeenCalledTimes(1);
    capture.dispose();
    expect(destroyContext).toHaveBeenCalledTimes(1);
  });
});
