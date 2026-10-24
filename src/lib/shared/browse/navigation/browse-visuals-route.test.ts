import { afterEach, describe, expect, it, vi } from "vitest";
import {
  browseDestinationForLocation,
  resolveBrowsePathname,
} from "./browse-route-resolver.js";

describe("Explore visuals route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("opens the Community Visuals door in a production build", () => {
    vi.stubEnv("DEV", false);
    const resolved = resolveBrowsePathname("/browse/explore/visuals");
    expect(resolved?.location).toMatchObject({
      primary: "explore",
      section: "visuals",
    });
    expect(browseDestinationForLocation(resolved!.location)).toBe("visuals");
  });
});
