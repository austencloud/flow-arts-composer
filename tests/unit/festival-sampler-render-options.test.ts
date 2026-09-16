import { describe, expect, it } from "vitest";
import manifests from "$lib/features/choreo-card/data/festival-sampler-manifests.json";
import { buildFestivalSamplerRenderOptions } from "$lib/features/choreo-card/services/festival-sampler-render-options";
import {
  festivalSamplerCardKey,
  type FestivalSamplerCardManifest,
} from "$lib/features/choreo-card/services/festival-sampler-manifest";
import { resolveFestivalSamplerCardSequence } from "$lib/features/choreo-card/services/festival-sampler-turns";

const allCards = manifests.candidates.flatMap(
  (pack) => pack.cards as FestivalSamplerCardManifest[]
);

describe("festival sampler render options", () => {
  it("uses the canonical portrait 3x4 layout for every eight-step LOOP slot", async () => {
    for (const slot of [
      "mirrored8",
      "rotated8",
      "mirroredSwapped8",
      "mirroredInverted8",
    ]) {
      const card = allCards.find((candidate) => candidate.slot === slot)!;
      const sequence = await resolveFestivalSamplerCardSequence(card);
      const options = buildFestivalSamplerRenderOptions(card, sequence);

      expect(options.startPlacementLayout).toBe("column");
      expect(options.totalGridColumns).toBe(3);
      expect(options.showMandala).toBe(true);
      expect(options.showQRCode).toBe(true);
    }
  });

  it("enables a sequence QR code on every choreo card", async () => {
    for (const card of allCards) {
      const sequence = await resolveFestivalSamplerCardSequence(card);
      const options = buildFestivalSamplerRenderOptions(card, sequence);

      expect(options.showQRCode, `${card.slot}: ${card.name}`).toBe(true);
    }
  });

  it("derives every LOOP frame from classifiable elemental geometry", async () => {
    const uniqueLoops = new Map<string, FestivalSamplerCardManifest>();
    for (const card of allCards) {
      if (card.source !== "catalog") {
        uniqueLoops.set(festivalSamplerCardKey(card), card);
      }
    }

    for (const card of uniqueLoops.values()) {
      const sequence = await resolveFestivalSamplerCardSequence(card);
      const palette = buildFestivalSamplerRenderOptions(card, sequence)
        .frontFrameColors?.palette;
      expect(palette?.length, card.name).toBeGreaterThanOrEqual(2);
      expect(palette, card.name).not.toContain("#999999");
      expect(palette, card.name).not.toContain("#444444");
    }
  });

  it("colors BΣTX with Water and Sun instead of arbitrary LOOP colors", async () => {
    const card = allCards.find((candidate) => candidate.name === "BΣTX")!;
    const sequence = await resolveFestivalSamplerCardSequence(card);
    const palette = buildFestivalSamplerRenderOptions(card, sequence)
      .frontFrameColors?.palette;

    expect(new Set(palette)).toEqual(new Set(["#3568a0", "#ffde17"]));
  });
});
