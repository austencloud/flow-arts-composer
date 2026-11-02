/**
 * A saved copy of another creator's sequence is the saver's own record: private
 * by default, marked as a copy, credited to the creator, and never carrying the
 * creator's owner display fields or gallery stamps (2026-10-31 decision).
 */
import { describe, expect, it } from "vitest";
import {
  copyOriginOf,
  createLibrarySequence,
} from "#lib/shared/library/domain/models/library-sequence.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

const viewedPost = {
  id: "seq-1",
  name: "ABCD",
  word: "ABCD",
  steps: [],
  thumbnails: [],
  isFavorite: false,
  isCircular: false,
  tags: [],
  metadata: {},
  ownerId: "creator-9",
  ownerDisplayName: "Creator Nine",
  ownerAvatarUrl: "https://assets.example.com/creator.png",
  isForked: false,
  publishedAt: new Date("2026-10-01"),
  publicProjectionDigest: "digest",
} as unknown as SequenceData;

describe("createLibrarySequence for a copy", () => {
  it("makes a private, credited copy owned and named by the saver", () => {
    const origin = copyOriginOf(viewedPost)!;
    const copy = createLibrarySequence(viewedPost, "saver-1", {
      copyOf: origin,
      ownerProfile: { displayName: "Saver One" },
    });

    expect(copy).toMatchObject({
      id: "seq-1",
      ownerId: "saver-1",
      ownerDisplayName: "Saver One",
      visibility: "private",
      source: "copied",
      forkAttribution: {
        originalSequenceId: "seq-1",
        originalCreatorId: "creator-9",
        originalCreatorName: "Creator Nine",
        originalCreatorPhotoUrl: "https://assets.example.com/creator.png",
      },
    });
    expect(copy).not.toHaveProperty("ownerAvatarUrl");
    expect(copy).not.toHaveProperty("isForked");
    expect(copy).not.toHaveProperty("publishedAt");
    expect(copy).not.toHaveProperty("publicProjectionDigest");
  });

  it("honours an explicit visibility for a copy", () => {
    const copy = createLibrarySequence(viewedPost, "saver-1", {
      copyOf: copyOriginOf(viewedPost)!,
      visibility: "unlisted",
    });
    expect(copy.visibility).toBe("unlisted");
  });

  it("leaves a plain save a public creation with its fields intact", () => {
    const own = createLibrarySequence(viewedPost, "creator-9");
    expect(own).toMatchObject({
      visibility: "public",
      source: "created",
      ownerDisplayName: "Creator Nine",
    });
    expect(own.forkAttribution).toBeUndefined();
  });

  it("names no origin for a sequence that names no owner", () => {
    expect(
      copyOriginOf({ ...viewedPost, ownerId: undefined } as SequenceData)
    ).toBeUndefined();
  });
});
