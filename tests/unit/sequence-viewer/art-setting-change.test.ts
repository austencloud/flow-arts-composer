import { describe, expect, it, vi } from "vitest";
import {
  changeArtSetting,
  reportArtSetting,
} from "#lib/shared/sequence-viewer/components/art-settings/art-setting-change.js";

describe("art setting change helpers", () => {
  it("suppresses reports when the value did not change", () => {
    const handler = vi.fn();

    reportArtSetting(handler, "art_tunnel", "copies", 4, 4, true);

    expect(handler).not.toHaveBeenCalled();
  });

  it("forwards the analytics contract without reshaping it", () => {
    const handler = vi.fn();

    reportArtSetting(
      handler,
      "art_navigation",
      "mobile_tunnel_section",
      "closed",
      "effects",
      true,
      "dock"
    );

    expect(handler).toHaveBeenCalledWith(
      "art_navigation",
      "mobile_tunnel_section",
      "closed",
      "effects",
      true,
      "dock"
    );
  });

  it("mutates before notifying the host", () => {
    const order: string[] = [];
    const handler = vi.fn(() => order.push("report"));

    changeArtSetting(
      handler,
      "art_tunnel",
      "stagger",
      0,
      0.1,
      () => order.push("mutate"),
      true
    );

    expect(order).toEqual(["mutate", "report"]);
    expect(handler).toHaveBeenCalledWith(
      "art_tunnel",
      "stagger",
      0,
      0.1,
      true,
      undefined
    );
  });

  it("still performs the mutation when reporting is suppressed", () => {
    const mutate = vi.fn();
    const handler = vi.fn();

    changeArtSetting(handler, "art_tunnel", "grid", true, true, mutate);

    expect(mutate).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
  });
});
