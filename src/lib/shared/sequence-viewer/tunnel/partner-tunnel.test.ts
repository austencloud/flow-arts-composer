import { describe, expect, it } from "vitest";
import {
  FRONT,
  PARTNER,
  rowsOf,
  sequenceOf,
} from "#lib/shared/post-studio-plugin/djii-partners.fixture.js";
import {
  describePartnerTransform,
  findPartnerTunnelUrl,
  parsePartnerTunnelAddress,
  partnerTransform,
  partnerTunnelComposition,
} from "./partner-tunnel";
import { buildTunnelCompositionLayers } from "./tunnel-layer-builder";

const address = { front: "4UMY", back: "B7Y4" };

describe("partner tunnel", () => {
  it("reads the two codes from the address, front first", () => {
    expect(parsePartnerTunnelAddress("4umy-B7Y4")).toEqual(address);
    expect(parsePartnerTunnelAddress("4UMY")).toBeNull();
    expect(parsePartnerTunnelAddress("4UMY-B7Y4-XXXX")).toBeNull();
    expect(parsePartnerTunnelAddress("4UMY-B7")).toBeNull();
  });

  it("draws each performer doing their own sequence", async () => {
    const composition = await partnerTunnelComposition(
      address,
      sequenceOf(FRONT),
      sequenceOf(PARTNER)
    );
    const layers = await buildTunnelCompositionLayers(
      composition,
      composition.formation
    );
    expect(layers.map((layer) => layer.performerLabel)).toEqual([
      "Front",
      "Back",
    ]);
    expect(rowsOf(layers[0]!.sequence)).toEqual(FRONT);
    expect(rowsOf(layers[1]!.sequence)).toEqual(PARTNER);
  });

  it("names how the back sequence comes from the front one", async () => {
    const transform = await partnerTransform(
      sequenceOf(FRONT),
      sequenceOf(PARTNER)
    );
    expect(transform).not.toBeNull();
    expect(describePartnerTransform(transform!)).toBe(
      "mirrored, flipped, hands swapped"
    );
    expect(
      await partnerTransform(sequenceOf(FRONT), sequenceOf(FRONT.slice(0, 4)))
    ).toBeNull();
  });

  it("links the tunnel only when both sequences already have codes", async () => {
    const front = sequenceOf(FRONT);
    const back = sequenceOf(PARTNER);
    const codes = new Map([
      [front, "4UMY"],
      [back, "B7Y4"],
    ]);
    expect(
      await findPartnerTunnelUrl(
        front,
        back,
        async (it) => codes.get(it) ?? null
      )
    ).toBe("https://tkaflowarts.com/tunnel/4UMY-B7Y4");
    codes.delete(back);
    expect(
      await findPartnerTunnelUrl(
        front,
        back,
        async (it) => codes.get(it) ?? null
      )
    ).toBeNull();
  });
});
