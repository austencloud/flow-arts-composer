import { describe, expect, it } from "vitest";
import {
  canEditVideo,
  canViewVideo,
  createCollaborativeVideo,
  getCreatorDisplayName,
  type CollaborativeVideo,
} from "#lib/shared/video-collaboration/domain/collaborative-video.js";

const CREATOR = "creator-uid";
const STRANGER = "stranger-uid";

function makeVideo(
  overrides: Partial<CollaborativeVideo> = {}
): CollaborativeVideo {
  const video = createCollaborativeVideo({
    videoUrl: "https://example.test/clip.mp4",
    storagePath: "videos/clip.mp4",
    duration: 43.6,
    fileSize: 1024,
    mimeType: "video/mp4",
    sequenceId: "X-BΦ-θ-",
    creatorId: CREATOR,
  });
  return { ...video, ...overrides };
}

describe("canEditVideo", () => {
  it("accepts the creator seeded into the roster", () => {
    expect(canEditVideo(makeVideo(), CREATOR)).toBe(true);
  });

  it("accepts the creator of a video whose roster is empty", () => {
    // The shape of production `videos/X-BΦ-θ-_1768875548469`: an upload path in
    // use before 2026-01-20 stored `collaborators: []` and `collaboratorIds:
    // []` beside a correct `creatorId`, so its owner could never save a step
    // map onto his own footage. That document's updateTime still equals its
    // createTime - every attempt threw before it reached Firestore.
    const legacy = makeVideo({ collaborators: [] });
    expect(canEditVideo(legacy, CREATOR)).toBe(true);
  });

  it("accepts an invited collaborator", () => {
    const shared = makeVideo({
      collaborators: [
        ...makeVideo().collaborators,
        {
          userId: STRANGER,
          joinedAt: new Date(),
          role: "collaborator",
        },
      ],
    });
    expect(canEditVideo(shared, STRANGER)).toBe(true);
  });

  it("refuses anyone else", () => {
    expect(canEditVideo(makeVideo(), STRANGER)).toBe(false);
  });
});

describe("getCreatorDisplayName", () => {
  it("reads the creator's roster entry when there is one", () => {
    const video = makeVideo({
      collaborators: [
        {
          userId: CREATOR,
          displayName: "Austen Cloud",
          joinedAt: new Date(),
          role: "creator",
        },
      ],
    });
    expect(getCreatorDisplayName(video)).toBe("Austen Cloud");
  });

  it("falls back to the name denormalized at upload", () => {
    // `videos/X-BΦ-θ-_1768875548469` again: an empty roster beside
    // `creatorDisplayName: "Austen Cloud"`. Reading only the roster is what
    // signed the performer's own footage "Anonymous".
    const legacy = makeVideo({
      collaborators: [],
      creatorDisplayName: "Austen Cloud",
    });
    expect(getCreatorDisplayName(legacy)).toBe("Austen Cloud");
  });

  it("admits when the document carries no name at all", () => {
    expect(
      getCreatorDisplayName(makeVideo({ collaborators: [] }))
    ).toBeUndefined();
  });
});

describe("canViewVideo", () => {
  it("creates new videos as private unless the uploader opts in to publishing", () => {
    const video = makeVideo();

    expect(video.visibility).toBe("private");
    expect(canViewVideo(video, CREATOR)).toBe(true);
    expect(canViewVideo(video, STRANGER)).toBe(false);
  });

  it("lets everyone view a video explicitly published as public", () => {
    expect(canViewVideo(makeVideo({ visibility: "public" }))).toBe(true);
  });

  it("lets the creator see a collaborators-only video with an empty roster", () => {
    const legacy = makeVideo({
      collaborators: [],
      visibility: "collaborators-only",
    });
    expect(canViewVideo(legacy, CREATOR)).toBe(true);
    expect(canViewVideo(legacy, STRANGER)).toBe(false);
  });
});
