import { existsSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  fanBuildPreviewOptions,
  fanCoverPreviewOptions,
  fanFramePreviewOptions,
  finishPreviewOptions,
  propBuildPreviewImage,
  type PropBuildPreviewOption,
} from "./scene-prop-catalog";

function expectAssets(
  options: readonly PropBuildPreviewOption<string>[]
): void {
  for (const option of options) {
    const assetPath = option.image.split("?", 1)[0] ?? option.image;
    const file = resolve(process.cwd(), "static", assetPath.slice(1));
    expect(existsSync(file), option.image).toBe(true);
  }
}

describe("prop studio build previews", () => {
  it("keeps every family variant attached to a real rendered asset", () => {
    const props = [
      PropType.STAFF,
      PropType.CAPSULE_BATON,
      PropType.FIRE_DOUBLE_STAFF,
      PropType.CHICKEN,
      PropType.BIGCHICKEN,
      PropType.CLUB,
      PropType.TORCH,
      PropType.GUITAR,
      PropType.UKULELE,
      PropType.TRIQUETRA,
      PropType.TRIQUETRA2,
      PropType.TRIAD,
      PropType.TRIGENG,
      PropType.SWORD,
    ];

    expectAssets(
      props.map((prop) => ({
        id: prop,
        label: prop,
        image: propBuildPreviewImage(prop),
      }))
    );
  });

  it("uses the real weapon renders instead of an unrelated fallback", () => {
    expect(propBuildPreviewImage(PropType.SWORD)).toBe(
      "/images/props/build-previews/sword.webp"
    );
  });

  it("shows the exact current fan configuration in every dependent picker", () => {
    const appearance = {
      build: "day" as const,
      frameColor: "white" as const,
      cover: "covered" as const,
    };
    const builds = fanBuildPreviewOptions(appearance);
    expect(builds.find((option) => option.id === "day")?.image).toContain(
      "fan-day-white-covered"
    );
    expect(builds.find((option) => option.id === "fire")?.image).toContain(
      "fan-fire-covered"
    );
    expect(builds.find((option) => option.id === "fire")?.designCredit).toEqual(
      {
        originator: "Doodle",
        sourceUrl: "https://forgedfans.com/products/doodlegrip-fire-fans",
      }
    );
    expect(builds.find((option) => option.id === "lotus")?.image).toBe(
      "/images/props/build-previews/fan-lotus-bare-complete.webp?v=6"
    );
    expect(
      builds.find((option) => option.id === "lotus")?.designCredit
    ).toEqual({
      originator: "Home of Poi",
      sourceUrl:
        "https://www.homeofpoi.com/en/shop/listItems/Medium-Lotus-Fire-Fans",
    });
    expect(builds.find((option) => option.id === "day")?.designCredit).toEqual({
      originator: "Doodle",
      sourceUrl: "https://flowtoys.com/products/doodlegrip-practice-fans",
    });

    const frames = fanFramePreviewOptions({ ...appearance, cover: "bare" });
    expect(frames.map((option) => option.image)).toEqual([
      "/images/props/build-previews/fan-day-black-bare-complete.webp",
      "/images/props/build-previews/fan-day-white-bare-complete.webp",
    ]);

    const covers = fanCoverPreviewOptions(appearance);
    expect(covers.map((option) => option.image)).toEqual([
      "/images/props/build-previews/fan-day-white-bare-complete.webp",
      "/images/props/build-previews/fan-day-white-covered-complete.webp",
    ]);

    expectAssets([...builds, ...frames, ...covers]);
  });

  it("keeps every fan render on one clean, wide card canvas", async () => {
    const fanFiles = [
      "fan-pictograph-front.webp",
      "fan-fire-bare-complete.webp",
      "fan-fire-covered-complete.webp",
      "fan-lotus-bare-complete.webp",
      "fan-day-black-bare-complete.webp",
      "fan-day-black-covered-complete.webp",
      "fan-day-white-bare-complete.webp",
      "fan-day-white-covered-complete.webp",
    ];

    for (const file of fanFiles) {
      const metadata = await sharp(
        resolve(
          process.cwd(),
          "static",
          "images",
          "props",
          "build-previews",
          file
        )
      ).metadata();
      expect([metadata.width, metadata.height], file).toEqual([640, 240]);
    }
  });

  it("faces the fan pictograph upright like the rendered builds", async () => {
    const pictograph = resolve(
      process.cwd(),
      "static",
      "images",
      "props",
      "build-previews",
      "fan-pictograph-front.webp"
    );
    const { info } = await sharp(pictograph)
      .trim({ background: "#000000", threshold: 8 })
      .toBuffer({ resolveWithObject: true });

    expect(info.width).toBeGreaterThan(info.height);
  });

  it("keeps fire and day finishes distinct for both supported prop forms", () => {
    const options = [
      ...finishPreviewOptions(PropType.TRIAD),
      ...finishPreviewOptions(PropType.QUIAD),
    ];

    expect(options.map((option) => option.image)).toEqual([
      "/images/props/build-previews/triad-fire.webp",
      "/images/props/build-previews/triad-day.webp",
      "/images/props/build-previews/quiad-fire.webp",
      "/images/props/build-previews/quiad-day.webp",
    ]);
    expectAssets(options);
  });
});
