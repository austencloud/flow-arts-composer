import { describe, expect, it } from "vitest";
import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import { hydrate } from "$lib/shared/foundation/services/sequence-hydrator";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

const BASE = {
  id: "seq-null-presentation",
  name: "AB",
  word: "AB",
  steps: [],
  thumbnails: [],
  isFavorite: false,
  isCircular: false,
  tags: [],
  metadata: {},
} as unknown as SequenceData;

describe("creatorIntent.presentation null preservation", () => {
  it("createSequenceData keeps an explicit null presentation", () => {
    const out = createSequenceData({
      ...BASE,
      creatorIntent: { presentation: null },
    });
    expect(out.creatorIntent).toEqual({ presentation: null });
    expect(out.creatorIntent).toHaveProperty("presentation");
  });

  it("hydrate keeps an explicit null presentation", () => {
    const out = hydrate({
      ...BASE,
      intendedProp: {
        leftPropType: PropType.STAFF,
        rightPropType: PropType.STAFF,
        catDogMode: false,
      },
      creatorIntent: { presentation: null },
    } as unknown as SequenceData);
    expect(out.creatorIntent?.presentation).toBeNull();
    expect(out.creatorIntent).toHaveProperty("presentation");
  });

  it("hydrate does not invent a presentation for a legacy intent", () => {
    const out = hydrate({
      ...BASE,
      intendedProp: {
        leftPropType: PropType.STAFF,
        rightPropType: PropType.STAFF,
        catDogMode: false,
      },
    });
    expect(out.creatorIntent?.propConfig).toEqual({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.STAFF,
      catDogMode: false,
    });
    expect(out.creatorIntent).not.toHaveProperty("presentation");
  });
});
