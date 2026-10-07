import { describe, expect, it } from "vitest";
import {
  FEATURE_VIDEO_API,
  FEATURE_VIDEO_FILE_FORMAT,
  FeatureVideoFileSchema,
  featureVideoMediaUrl,
  isFeatureVideoMediaUrl,
  isFeatureVideoSlug,
  rehomeFeatureMediaUrls,
} from "$lib/shared/media-composition/domain/feature-video";
import {
  takeFileKey,
  type PostTake,
} from "$lib/shared/media-composition/domain/post-plan";
import {
  createEmptyPostProject,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";
import { createTakeTiming } from "$lib/shared/media-composition/domain/take-timing";

const NOW = 1_780_000_000_000;
const SEQUENCE = "DCK\u03a8-";

function featureTake(id: string, url: string): PostTake {
  const ref = { kind: "linked" as const, url };
  return {
    id,
    label: `Take ${id}`,
    ref,
    takeKey: takeFileKey(ref),
    durationSeconds: 10,
  };
}

function postWith(
  takes: PostTake[],
  extra: Partial<PostProject> = {}
): PostProject {
  return {
    ...createEmptyPostProject({ sequenceId: SEQUENCE, now: NOW }),
    takes,
    ...extra,
  };
}

describe("feature video names", () => {
  it.each(["promo-1-0", "a", "0", "promo-1-0-30s", "x".repeat(63)])(
    "accepts %s",
    (slug) => {
      expect(isFeatureVideoSlug(slug)).toBe(true);
    }
  );

  it.each([
    "",
    "-promo",
    "Promo",
    "promo_1",
    "promo 1",
    "../promo",
    "promo/1",
    "x".repeat(64),
    "\u00e9",
    5,
    null,
  ])("refuses %s", (slug) => {
    expect(isFeatureVideoSlug(slug)).toBe(false);
  });
});

describe("feature video media urls", () => {
  it("encodes each path segment", () => {
    expect(featureVideoMediaUrl("promo-1-0", "footage/take 03.mp4")).toBe(
      `${FEATURE_VIDEO_API}/promo-1-0/media/footage/take%2003.mp4`
    );
  });

  it("refuses a bad name or an empty path", () => {
    expect(() => featureVideoMediaUrl("Promo", "footage/a.mp4")).toThrow(
      '"Promo" is not a feature video name.'
    );
    expect(() => featureVideoMediaUrl("promo", "/")).toThrow(
      "A media path is required."
    );
  });

  it("recognizes only media urls of a well-named project", () => {
    expect(
      isFeatureVideoMediaUrl(
        "/api/dev/feature-videos/promo/media/footage/a.mp4"
      )
    ).toBe(true);
    expect(isFeatureVideoMediaUrl("/api/dev/feature-videos/promo/media/")).toBe(
      false
    );
    expect(
      isFeatureVideoMediaUrl("/api/dev/feature-videos/Promo/media/a.mp4")
    ).toBe(false);
    expect(
      isFeatureVideoMediaUrl(
        "https://example.test/api/dev/feature-videos/promo/media/a.mp4"
      )
    ).toBe(false);
    expect(isFeatureVideoMediaUrl("/api/dev/post-project")).toBe(false);
    expect(isFeatureVideoMediaUrl(42)).toBe(false);
  });
});

describe("moving media urls to a copied project", () => {
  const from = `${FEATURE_VIDEO_API}/promo-1-0/media/footage/a.mp4`;
  const to = `${FEATURE_VIDEO_API}/promo-1-0-30s/media/footage/a.mp4`;

  it("moves the project's own takes, their keys and their timing", () => {
    const own = featureTake("take-1", from);
    const project = postWith([own], {
      timings: {
        "take-1": createTakeTiming({
          sequenceId: SEQUENCE,
          takeKey: own.takeKey,
          durationSeconds: 10,
          now: NOW,
        }),
      },
    });
    const moved = rehomeFeatureMediaUrls(project, "promo-1-0", "promo-1-0-30s");
    expect(moved.takes[0]).toEqual({
      ...own,
      ref: { kind: "linked", url: to },
      takeKey: `linked:${to}`,
    });
    expect(moved.timings?.["take-1"]?.takeKey).toBe(`linked:${to}`);
  });

  it("keeps a take key that was chosen by hand", () => {
    const own = { ...featureTake("take-1", from), takeKey: "my-key" };
    const moved = rehomeFeatureMediaUrls(
      postWith([own]),
      "promo-1-0",
      "promo-1-0-30s"
    );
    expect(moved.takes[0]?.takeKey).toBe("my-key");
    expect(moved.takes[0]?.ref).toEqual({ kind: "linked", url: to });
  });

  it("leaves another project's media and outside links alone", () => {
    const longerName = featureTake("take-1", to);
    const outside = featureTake("take-2", "https://example.test/a.mp4");
    const project = postWith([longerName, outside]);
    expect(rehomeFeatureMediaUrls(project, "promo-1-0", "copy")).toEqual(
      project
    );
  });

  it("moves linked images too", () => {
    const image = {
      id: "image-1",
      label: "Logo",
      ref: {
        kind: "linked" as const,
        url: `${FEATURE_VIDEO_API}/promo-1-0/media/images/logo.png`,
      },
    };
    const moved = rehomeFeatureMediaUrls(
      postWith([], { images: [image] }),
      "promo-1-0",
      "copy"
    );
    expect(moved.images?.[0]?.ref).toEqual({
      kind: "linked",
      url: `${FEATURE_VIDEO_API}/copy/media/images/logo.png`,
    });
  });
});

describe("feature video file", () => {
  const file = {
    format: FEATURE_VIDEO_FILE_FORMAT,
    slug: "promo-1-0",
    title: "Promo 1.0",
    revision: 1,
    savedAt: NOW,
    project: postWith([]),
  };

  it("accepts a well-formed file", () => {
    expect(FeatureVideoFileSchema.safeParse(file).success).toBe(true);
  });

  it.each([
    ["an extra key", { ...file, extra: true }],
    ["revision 0", { ...file, revision: 0 }],
    ["a blank title", { ...file, title: "   " }],
    ["a bad name", { ...file, slug: "Promo" }],
    ["another format", { ...file, format: "feature-video-v2" }],
  ])("refuses %s", (_name, value) => {
    expect(FeatureVideoFileSchema.safeParse(value).success).toBe(false);
  });
});
