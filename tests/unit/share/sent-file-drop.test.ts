/**
 * The window drop is the last handler. If it ever claimed a drop a screen's
 * own drop zone already took, a video upload would also open the viewer, and
 * nobody would see why. It must also leave a native file input alone.
 */
import { describe, expect, it } from "vitest";
import {
  fileForWindowDrop,
  windowShouldClaim,
} from "#lib/shared/share/domain/sent-file-drop.js";

const file = new File([new Uint8Array([1])], "card.png", { type: "image/png" });

function drag(overrides: {
  defaultPrevented?: boolean;
  types?: string[];
  files?: File[];
  target?: EventTarget | null;
}) {
  return {
    defaultPrevented: overrides.defaultPrevented ?? false,
    target: overrides.target ?? null,
    dataTransfer: {
      types: overrides.types ?? ["Files"],
      files: overrides.files ?? [file],
    } as unknown as DataTransfer,
  };
}

describe("window drop", () => {
  it("takes a file nobody else took", () => {
    expect(fileForWindowDrop(drag({}))).toBe(file);
  });

  it("ignores a drop another handler already took", () => {
    const taken = drag({ defaultPrevented: true });
    expect(windowShouldClaim(taken)).toBe(false);
    expect(fileForWindowDrop(taken)).toBeNull();
  });

  it("ignores a drag that carries no files", () => {
    expect(windowShouldClaim(drag({ types: ["text/plain"], files: [] }))).toBe(
      false
    );
  });

  it("leaves a drop on a native file input to the input", () => {
    const input = { nodeName: "INPUT", type: "file" } as unknown as EventTarget;
    expect(windowShouldClaim(drag({ target: input }))).toBe(false);

    const text = { nodeName: "INPUT", type: "text" } as unknown as EventTarget;
    expect(windowShouldClaim(drag({ target: text }))).toBe(true);
  });
});
