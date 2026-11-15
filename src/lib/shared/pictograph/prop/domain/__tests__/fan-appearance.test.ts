import { describe, expect, it } from "vitest";

import fs from "node:fs";
import path from "node:path";

import { PropType } from "../enums/prop-type";
import {
  APPROVED_FAN_BUILDS,
  DEFAULT_FAN_APPEARANCE,
  FAN_BUILDS,
  FAN_PAPER_CONTRAST,
  defaultFanBuild,
  applyFanFrameColor,
  applyFanPaperContrast,
  fanAppearanceArtwork,
  chooseCompactFanLook,
  chooseFanBuild,
  fanBuildPreviewOptions,
  compactFanLookPreviewOptions,
  normalizeFanAppearance,
  parseFanRenderKey,
  resolveFanRenderKey,
} from "../fan-appearance";

describe("fan appearance", () => {
  it("defaults to Pictograph until DoodleGrip Fire is offered", () => {
    expect(normalizeFanAppearance(undefined, APPROVED_FAN_BUILDS)).toEqual({
      build: "pictograph",
      frameColor: "black",
      cover: "bare",
    });
    expect(
      resolveFanRenderKey(
        "fan",
        normalizeFanAppearance(null, APPROVED_FAN_BUILDS)
      )
    ).toBe("fan");
  });

  it("defaults to the bare DoodleGrip Fire build when every look is offered", () => {
    expect(normalizeFanAppearance(undefined, FAN_BUILDS)).toEqual({
      build: "fire",
      frameColor: "black",
      cover: "bare",
    });
    expect(
      resolveFanRenderKey("fan", normalizeFanAppearance(null, FAN_BUILDS))
    ).toBe("fan__fire_bare");
    expect(defaultFanBuild(APPROVED_FAN_BUILDS)).toBe("pictograph");
    expect(defaultFanBuild(FAN_BUILDS)).toBe("fire");
  });

  describe("maker approval", () => {
    it("approves exactly Pictograph and Sense until the other makers approve", () => {
      expect([...APPROVED_FAN_BUILDS]).toEqual(["pictograph", "sense"]);
    });

    it("lists every look, the approved first and the six others waiting", () => {
      const appearance = normalizeFanAppearance(null, APPROVED_FAN_BUILDS);
      const builds = fanBuildPreviewOptions(appearance, APPROVED_FAN_BUILDS);
      expect(builds.map(({ id }) => id)).toEqual([
        "pictograph",
        "sense",
        "fire",
        "lotus",
        "flat-grip",
        "day",
        "moon",
        "star",
      ]);
      expect(builds.filter((o) => o.waitingOnMaker).map((o) => o.id)).toEqual([
        "fire",
        "lotus",
        "flat-grip",
        "day",
        "moon",
        "star",
      ]);
      const compact = compactFanLookPreviewOptions(
        appearance,
        APPROVED_FAN_BUILDS
      );
      expect(compact).toHaveLength(9);
      expect(compact.slice(0, 2).map((o) => o.waitingOnMaker)).toEqual([
        false,
        false,
      ]);
      expect(compact.slice(2).every((o) => o.waitingOnMaker)).toBe(true);
      expect(compact.map(({ id }) => id)).toContain("covered-fire");
    });

    it("marks nothing waiting in preview mode", () => {
      const appearance = normalizeFanAppearance(null, FAN_BUILDS);
      for (const options of [
        fanBuildPreviewOptions(appearance, FAN_BUILDS),
        compactFanLookPreviewOptions(appearance, FAN_BUILDS),
      ]) {
        expect(options.some((o) => o.waitingOnMaker)).toBe(false);
      }
    });

    it("never writes a waiting look, from the full or the compact list", () => {
      const current = normalizeFanAppearance(
        { build: "sense" },
        APPROVED_FAN_BUILDS
      );
      for (const build of ["fire", "lotus", "flat-grip", "day", "moon", "star"] as const) {
        expect(chooseFanBuild(current, build, APPROVED_FAN_BUILDS)).toBeNull();
      }
      for (const look of ["fire", "covered-fire", "day"] as const) {
        expect(
          chooseCompactFanLook(current, look, APPROVED_FAN_BUILDS)
        ).toBeNull();
      }
      expect(
        chooseFanBuild(current, "pictograph", APPROVED_FAN_BUILDS)
      ).toEqual({ ...current, build: "pictograph" });
      expect(
        chooseCompactFanLook(current, "covered-fire", FAN_BUILDS)
      ).toEqual({ ...current, build: "fire", cover: "covered" });
    });

    it("offers all eight builds and the covered fan in preview mode", () => {
      const appearance = normalizeFanAppearance(null, FAN_BUILDS);
      expect(
        fanBuildPreviewOptions(appearance, FAN_BUILDS).map(({ id }) => id)
      ).toHaveLength(8);
      expect(
        new Set(
          fanBuildPreviewOptions(appearance, FAN_BUILDS).map(({ id }) => id)
        )
      ).toEqual(new Set(FAN_BUILDS));
      const compact = compactFanLookPreviewOptions(appearance, FAN_BUILDS).map(
        ({ id }) => id
      );
      expect(compact).toHaveLength(9);
      expect(compact).toContain("covered-fire");
    });

    it("reads a stored unapproved build as the default, without erasing it", () => {
      const stored = { build: "fire" as const, cover: "covered" as const };
      expect(normalizeFanAppearance(stored, APPROVED_FAN_BUILDS).build).toBe(
        "pictograph"
      );
      expect(normalizeFanAppearance(stored, FAN_BUILDS).build).toBe("fire");
      expect(stored.build).toBe("fire");
      expect(
        normalizeFanAppearance({ build: "sense" }, APPROVED_FAN_BUILDS).build
      ).toBe("sense");
    });
  });

  it("normalizes stale persisted values without changing the default", () => {
    expect(
      normalizeFanAppearance({
        build: "unknown" as never,
        frameColor: "white",
        cover: "covered",
      })
    ).toEqual({
      build: DEFAULT_FAN_APPEARANCE.build,
      frameColor: "white",
      cover: "covered",
    });
  });

  it("keeps appearance out of choreography prop identity", () => {
    const appearance = {
      build: "lotus" as const,
      frameColor: "black" as const,
      cover: "bare" as const,
    };

    expect(resolveFanRenderKey(PropType.FAN, appearance)).toBe("fan__lotus");
    expect(resolveFanRenderKey(PropType.BIGFAN, appearance)).toBe(
      "bigfan__lotus"
    );
    expect(resolveFanRenderKey(PropType.CLUB, appearance)).toBe("club");
    expect(parseFanRenderKey("fan__lotus")).toEqual({
      propType: "fan",
      build: "lotus",
      frameColor: "black",
      cover: "bare",
    });
  });

  it("keys every visible fan modifier into the texture cache", () => {
    expect(
      resolveFanRenderKey(PropType.FAN, {
        build: "fire",
        frameColor: "black",
        cover: "covered",
      })
    ).toBe("fan__fire_covered");
    expect(
      resolveFanRenderKey(PropType.FAN, {
        build: "day",
        frameColor: "white",
        cover: "covered",
      })
    ).toBe("fan__day_white_covered");
  });

  it("maps each physical build to the shared artwork owner", () => {
    expect(fanAppearanceArtwork("pictograph")).toBeNull();
    expect(fanAppearanceArtwork("fire")).toBe(
      "/images/props/appearances/fan-fire.svg?v=2"
    );
    expect(fanAppearanceArtwork("fire", "covered")).toBe(
      "/images/props/appearances/fan-fire-covered.svg?v=2"
    );
    expect(fanAppearanceArtwork("lotus")).toBe(
      "/images/props/appearances/fan-lotus.svg?v=7"
    );
    expect(fanAppearanceArtwork("day")).toBe(
      "/images/props/appearances/fan-day.svg?v=3"
    );
    expect(fanAppearanceArtwork("day", "covered")).toBe(
      "/images/props/appearances/fan-day-covered.svg?v=3"
    );
    expect(
      fanBuildPreviewOptions(DEFAULT_FAN_APPEARANCE, FAN_BUILDS).find(
        ({ id }) => id === "lotus"
      )?.image
    ).toBe("/images/props/build-previews/fan-lotus-bare-complete.webp?v=6");
  });

  it("keeps the compact 2D covered fan as one direct, honest choice", () => {
    const options = compactFanLookPreviewOptions(
      DEFAULT_FAN_APPEARANCE,
      FAN_BUILDS
    );
    const covered = options.find(({ id }) => id === "covered-fire");
    const fire = options.find(({ id }) => id === "fire");

    expect(covered).toMatchObject({
      label: "Covered Fan",
      image: "/images/props/build-previews/fan-fire-covered-complete.webp?v=2",
    });
    expect(fire?.image).toBe(
      "/images/props/build-previews/fan-fire-bare-complete.webp?v=2"
    );
    expect(options.map(({ id }) => id)).not.toContain("bare");
    expect(fire?.imageScale).toBe(1.92);
    expect(options.find(({ id }) => id === "lotus")?.imageScale).toBe(1.81);
  });

  describe("paper contrast", () => {
    const artwork = (file: string) =>
      fs.readFileSync(
        path.join(process.cwd(), "static/images/props/appearances", file),
        "utf8"
      );

    it("leaves the dark pictograph artwork exactly as authored", () => {
      for (const file of [
        "fan-fire.svg",
        "fan-flat-grip.svg",
        "fan-lotus.svg",
      ]) {
        const svg = applyFanFrameColor(artwork(file), "#3575E2");
        expect(applyFanPaperContrast(svg, "dark")).toBe(svg);
      }
    });

    it("gives the fire fan printable wicks and a frame that survives paper", () => {
      const svg = applyFanPaperContrast(
        applyFanFrameColor(artwork("fan-fire.svg"), "#DC2626"),
        "light"
      );
      // Every wick trades pale kevlar for the paper palette.
      expect(svg).not.toContain("#f5e6b8");
      expect(svg).not.toContain("#6d4b2a");
      expect(svg.match(/data-fire-wick="\d"[^>]*fill="#d9b25a"/g)).toHaveLength(
        5
      );
      expect(
        svg.match(/data-fire-wick="\d"[^>]*stroke="#4a2f14"/g)
      ).toHaveLength(5);
      expect(
        svg.match(/data-fire-wick="\d"[^>]*stroke-width="2.2"/g)
      ).toHaveLength(5);
      // The frame keeps the hand color; its hairlines get a real width and its
      // authored widths scale up together.
      expect(svg).toMatch(
        /data-fan-frame="" fill="none" stroke="#DC2626"[^>]*stroke-width="2.4"/
      );
      expect(svg).toMatch(/data-fire-grip-ring=""[^>]*stroke-width="4.8"/);
      expect(svg).toMatch(/data-fire-rail="left"[^>]*stroke-width="4.16"/);
      // Wick wraps stay at the wick width, not the frame scale.
      expect(svg).not.toMatch(/data-fire-wick-wrap="[^"]*"[^>]*stroke-width=/);
    });

    it("treats the flat-grip and lotus wicks the same way", () => {
      for (const file of ["fan-flat-grip.svg", "fan-lotus.svg"]) {
        const svg = applyFanPaperContrast(
          applyFanFrameColor(artwork(file), "#3D44B8"),
          "light"
        );
        expect(svg).not.toContain("#f5e6b8");
        expect(svg).toMatch(
          /data-fan-wicks=""[^>]*fill="#d9b25a"[^>]*stroke="#4a2f14"[^>]*stroke-width="2.2"/
        );
      }
    });

    it("scales the lotus frame's authored width instead of overriding it", () => {
      const svg = applyFanPaperContrast(
        applyFanFrameColor(artwork("fan-lotus.svg"), "#3D44B8"),
        "light"
      );
      expect(svg).toMatch(/data-fan-frame=""[^>]*stroke-width="6.4"/);
      expect(svg).toMatch(/data-lotus-grip-ring=""[^>]*stroke-width="11.2"/);
    });

    it("does not widen the solid Day plate or touch a cover", () => {
      const day = applyFanFrameColor(artwork("fan-day.svg"), "#DC2626");
      expect(applyFanPaperContrast(day, "light")).toBe(day);
      const covered = applyFanPaperContrast(
        applyFanFrameColor(artwork("fan-fire-covered.svg"), "#DC2626"),
        "light"
      );
      expect(covered).toContain(
        'data-fan-cover="" fill="#df255f" stroke="#760f30"'
      );
      expect(covered).toMatch(
        /data-fan-cover-outer-seam=""[^>]*stroke-width="2"/
      );
    });

    it("publishes the palette the contrast harness renders against", () => {
      expect(FAN_PAPER_CONTRAST.wickFill).toBe("#d9b25a");
      expect(FAN_PAPER_CONTRAST.frameStrokeScale).toBe(1.6);
    });
  });
});
