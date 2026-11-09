import { describe, it, expect } from "vitest";
import {
  resolveArrival,
  resolveShowMeTarget,
  type SurfaceChecks,
} from "#lib/shared/versioning/domain/utils/release-surface.js";

// "Show me" must never render a button that leads nowhere: an old note can
// name a module or tab that was renamed, removed, or is closed to this reader.
const checks: SurfaceChecks = {
  canOpenModule: (m) => m === "create" || m === "browse",
  canOpenTab: (m, t) =>
    (m === "create" && t === "construct") || (m === "browse" && t === "sequences"),
};

describe("resolveShowMeTarget", () => {
  it("opens a known, open module and tab", () => {
    expect(
      resolveShowMeTarget(
        { surface: { module: "create", tab: "construct" } },
        checks
      )
    ).toEqual({ module: "create", tab: "construct" });
  });

  it("renders no button for global, absent, unknown or closed surfaces", () => {
    for (const surface of [
      undefined,
      "global" as const,
      { module: "museum" },
      { module: "create", tab: "removed-tab" },
      { module: "browse", tab: "construct" },
      { module: "" },
    ]) {
      expect(resolveShowMeTarget({ surface }, checks)).toBeNull();
    }
  });

  it("carries anchor and callout only for a highlight", () => {
    const surface = { module: "create", tab: "construct" };
    expect(
      resolveShowMeTarget(
        { surface, highlight: true, anchor: "a", callout: "Hi." },
        checks
      )
    ).toEqual({ ...surface, anchor: "a", callout: "Hi." });
    expect(
      resolveShowMeTarget({ surface, anchor: "a", callout: "Hi." }, checks)
    ).toEqual(surface);
  });
});

describe("resolveArrival", () => {
  const element = { id: "el" };

  it("pulses the anchor when it is on the page", () => {
    expect(
      resolveArrival({ anchor: "a", callout: "Hi." }, () => element)
    ).toEqual({ kind: "pulse", element });
  });

  it("falls back to the callout when the anchor rotted", () => {
    expect(resolveArrival({ anchor: "a", callout: "Hi." }, () => null)).toEqual(
      { kind: "callout", text: "Hi." }
    );
  });

  it("does nothing more than arrive with neither", () => {
    expect(resolveArrival({ anchor: "a" }, () => null)).toEqual({
      kind: "none",
    });
    expect(resolveArrival({}, () => element)).toEqual({ kind: "none" });
  });
});
