import { describe, expect, it } from "vitest";
import {
  FRONT,
  PARTNER,
  sequenceOf,
} from "#lib/shared/post-studio-plugin/djii-partners.fixture.js";
import { partnerTunnelComposition } from "../tunnel/partner-tunnel";
import {
  createDerivedTunnelPerformer,
  createIndependentTunnelPerformer,
  createTunnelComposition,
} from "../tunnel/tunnel-composition";
import { DEFAULT_CONFIG } from "../tunnel/tunnel-config";
import {
  deriveViewerCastLinks,
  isCastComposition,
  isEnsembleView,
} from "./viewer-cast";

describe("viewer cast links", () => {
  it("has none without a composition", () => {
    expect(deriveViewerCastLinks(null)).toEqual([]);
  });

  it("has none for a generated tunnel of copies", () => {
    const sequence = { ...sequenceOf(FRONT), id: "lead-id", word: "DJII" };
    const lead = createIndependentTunnelPerformer(sequence, 0, "Lead", {
      sourceSequenceId: sequence.id,
    });
    const copy = createDerivedTunnelPerformer(lead.id, 1, [{ kind: "mirror" }]);
    const composition = createTunnelComposition([lead, copy], {
      formation: { ...DEFAULT_CONFIG, fold: 2 },
    });
    expect(deriveViewerCastLinks(composition)).toEqual([]);
  });

  it("names each partner by position and word, linking their own code", async () => {
    // Two published partners can carry the same sequence id; the codes in
    // the tunnel's address are what tell them apart. A walked word
    // ("DJIIDJII") reads as the word people say ("DJII"), like every label.
    const front = { ...sequenceOf(FRONT), id: "shared-id", word: "DJIIDJII" };
    const back = { ...sequenceOf(PARTNER), id: "shared-id", word: "KLMN" };
    const composition = await partnerTunnelComposition(
      { front: "4UMY", back: "B7Y4" },
      front,
      back
    );
    const links = deriveViewerCastLinks(composition);
    expect(
      links.map(({ label, word, href }) => ({ label, word, href }))
    ).toEqual([
      { label: "Front", word: "DJII", href: "/sequence/4UMY" },
      { label: "Back", word: "KLMN", href: "/sequence/B7Y4" },
    ]);
  });

  it("links any other composition by each performer's source sequence", () => {
    const one = { ...sequenceOf(FRONT), id: "one id", word: "DJII" };
    const two = { ...sequenceOf(PARTNER), id: "two", word: "" };
    const composition = createTunnelComposition(
      [
        createIndependentTunnelPerformer(one, 0, "Lead", {
          sourceSequenceId: one.id,
        }),
        createIndependentTunnelPerformer(two, 1, "Partner", {
          sourceSequenceId: two.id,
        }),
      ],
      { formation: { ...DEFAULT_CONFIG, fold: 2 } }
    );
    expect(
      deriveViewerCastLinks(composition).map(({ word, href }) => ({
        word,
        href,
      }))
    ).toEqual([
      { word: "DJII", href: "/sequence/one%20id" },
      { word: "", href: "/sequence/two" },
    ]);
  });

  it("calls a tunnel a cast only when two performers dance their own sequences", async () => {
    expect(isCastComposition(null)).toBe(false);
    const sequence = { ...sequenceOf(FRONT), id: "lead-id", word: "DJII" };
    const lead = createIndependentTunnelPerformer(sequence, 0, "Lead", {
      sourceSequenceId: sequence.id,
    });
    const copy = createDerivedTunnelPerformer(lead.id, 1, [{ kind: "mirror" }]);
    const generated = createTunnelComposition([lead, copy], {
      formation: { ...DEFAULT_CONFIG, fold: 2 },
    });
    expect(isCastComposition(generated)).toBe(false);

    const partners = await partnerTunnelComposition(
      { front: "4UMY", back: "B7Y4" },
      { ...sequenceOf(FRONT), id: "front-id", word: "DJII" },
      { ...sequenceOf(PARTNER), id: "back-id", word: "KLMN" }
    );
    expect(isCastComposition(partners)).toBe(true);
  });

  it("separates ensemble views from performer views", () => {
    const left = (leftPane: "animation" | "tunnel") => ({ leftPane });
    expect(isEnsembleView("tunnel", left("tunnel"))).toBe(true);
    expect(isEnsembleView("videos", left("animation"))).toBe(true);
    expect(isEnsembleView("post-studio", left("animation"))).toBe(true);
    expect(isEnsembleView("split", left("tunnel"))).toBe(true);
    expect(isEnsembleView("split", left("animation"))).toBe(false);
    expect(isEnsembleView("animation", left("animation"))).toBe(false);
    expect(isEnsembleView("animation-3d", left("animation"))).toBe(false);
    expect(isEnsembleView("card", left("tunnel"))).toBe(false);
  });

  it("treats a cast's 3D stage as an ensemble view", () => {
    const left = { leftPane: "animation" as const };
    expect(isEnsembleView("animation-3d", left, "cast")).toBe(true);
    expect(isEnsembleView("animation-3d", left, "sequence")).toBe(false);
    expect(isEnsembleView("animation", left, "cast")).toBe(false);
  });
});
