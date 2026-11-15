import { describe, expect, it } from "vitest";
import { buildStagePlaylist } from "./visuals-playlist.js";

const tunnels = ["t1", "t2", "t3"];
const mandalas = ["m1", "m2", "m3", "m4", "m5", "m6"];

describe("buildStagePlaylist", () => {
  it("plays at most two tunnels first, then mandalas in list order, five in all", () => {
    expect(buildStagePlaylist(tunnels, mandalas)).toEqual([
      "t1",
      "t2",
      "m1",
      "m2",
      "m3",
    ]);
  });

  it("is shorter when fewer pieces exist", () => {
    expect(buildStagePlaylist(["t1"], ["m1"])).toEqual(["t1", "m1"]);
    expect(buildStagePlaylist([], ["m1", "m2"])).toEqual(["m1", "m2"]);
    expect(buildStagePlaylist(["t1", "t2"], [])).toEqual(["t1", "t2"]);
    expect(buildStagePlaylist([], [])).toEqual([]);
  });

  it("fills the rest with mandalas when there is only one tunnel", () => {
    expect(buildStagePlaylist(["t1"], mandalas)).toEqual([
      "t1",
      "m1",
      "m2",
      "m3",
      "m4",
    ]);
  });
});
