import { describe, expect, it } from "vitest";
import { MediaCompositionProjectSchema } from "#lib/shared/media-composition/domain/media-composition-schema.js";
import { MediaCompositionPresetSchema } from "#lib/shared/media-composition/domain/media-composition-preset-schema.js";

const sequenceRef = {
  sequenceId: "sequence-a",
  contentHash: "sha256:sequence-a-v1",
};

const identityTransform = {
  scale: 1,
  rotationDegrees: 0,
  translateX: 0,
  translateY: 0,
};

function referenceProject() {
  return {
    schemaVersion: 1 as const,
    id: "post-a",
    ownerId: "owner-a",
    name: "Performance breakdown",
    createdAt: 1,
    updatedAt: 1,
    output: {
      width: 1080,
      height: 1920,
      frameRate: 30,
      backgroundColor: "#09090b",
    },
    duration: { mode: "source" as const, sourceId: "performance-video" },
    sources: [
      {
        id: "performance-video",
        role: "performance-video",
        kind: "video" as const,
        origin: { type: "collaborative-video" as const, videoId: "video-a" },
        durationSeconds: 10,
        mimeType: "video/mp4",
        hasAudio: true,
        sequenceRef,
        timeMapId: "performance-map",
      },
      {
        id: "animation",
        role: "animation",
        kind: "sequence-animation" as const,
        sequenceRef,
      },
      {
        id: "card",
        role: "card",
        kind: "choreo-card" as const,
        sequenceRef,
        cardSettingsSnapshot: {},
      },
      {
        id: "original-audio",
        role: "original-audio",
        kind: "audio" as const,
        origin: {
          type: "original-video-audio" as const,
          videoSourceId: "performance-video",
        },
        durationSeconds: 10,
        mimeType: "audio/mp4",
      },
    ],
    regions: [
      {
        id: "top",
        x: 0,
        y: 0,
        width: 1,
        height: 0.5,
        zIndex: 1,
        fit: "cover" as const,
        clipContent: true,
        respectSafeArea: true,
      },
      {
        id: "bottom",
        x: 0,
        y: 0.5,
        width: 1,
        height: 0.5,
        zIndex: 1,
        fit: "contain" as const,
        clipContent: true,
        respectSafeArea: true,
      },
    ],
    clips: [
      {
        id: "video-clip",
        kind: "visual" as const,
        sourceId: "performance-video",
        regionId: "top",
        startSeconds: 0,
        endSeconds: 5.5,
        sourceInSeconds: 0,
        sourceOutSeconds: 5.5,
        playbackRate: 1,
        loop: false,
        opacity: 1,
        transform: identityTransform,
        timeMapId: "performance-map",
        syncGroupId: "performance-sync",
      },
      {
        id: "animation-clip",
        kind: "visual" as const,
        sourceId: "animation",
        regionId: "top",
        startSeconds: 4.5,
        endSeconds: 10,
        sourceInSeconds: 4.5,
        sourceOutSeconds: 10,
        playbackRate: 1,
        loop: false,
        opacity: 1,
        transform: identityTransform,
        timeMapId: "performance-map",
        syncGroupId: "performance-sync",
      },
      {
        id: "card-clip",
        kind: "visual" as const,
        sourceId: "card",
        regionId: "bottom",
        startSeconds: 0,
        endSeconds: 10,
        sourceInSeconds: 0,
        sourceOutSeconds: 10,
        playbackRate: 1,
        loop: false,
        opacity: 1,
        transform: identityTransform,
        timeMapId: "performance-map",
        syncGroupId: "performance-sync",
      },
      {
        id: "audio-clip",
        kind: "audio" as const,
        sourceId: "original-audio",
        startSeconds: 0,
        endSeconds: 10,
        sourceInSeconds: 0,
        sourceOutSeconds: 10,
        playbackRate: 1,
        loop: false,
      },
    ],
    transitions: [
      {
        id: "top-crossfade",
        kind: "crossfade" as const,
        outgoingClipId: "video-clip",
        incomingClipId: "animation-clip",
        startSeconds: 4.5,
        endSeconds: 5.5,
        curve: "ease-in-out" as const,
      },
    ],
    timeMaps: [
      {
        schemaVersion: 1 as const,
        id: "performance-map",
        sequenceRef,
        mediaSourceId: "performance-video",
        anchors: [
          { mediaTimeSeconds: 0, sequencePosition: 1 },
          { mediaTimeSeconds: 2, sequencePosition: 2 },
          { mediaTimeSeconds: 4, sequencePosition: 3 },
          { mediaTimeSeconds: 6, sequencePosition: 4 },
          { mediaTimeSeconds: 8, sequencePosition: 5 },
        ],
        source: "manual" as const,
        boundaryPolicy: "clamp" as const,
        updatedAt: 1,
      },
    ],
    audioMix: {
      masterGain: 1,
      tracks: [
        {
          clipId: "audio-clip",
          gain: 1,
          muted: false,
          fadeInSeconds: 0,
          fadeOutSeconds: 0,
        },
      ],
    },
    targetOverrides: {
      instagram: {
        delivery: "handoff" as const,
        caption: "Practice breakdown",
        coverFrameSeconds: 5,
      },
    },
  };
}

function fraction(value: number) {
  return { unit: "duration-fraction" as const, value };
}

function referencePreset() {
  return {
    schemaVersion: 1 as const,
    id: "performance-breakdown",
    ownerId: "owner-a",
    name: "Performance breakdown",
    createdAt: 1,
    updatedAt: 1,
    output: {
      width: 1080,
      height: 1920,
      frameRate: 30,
      backgroundColor: "#09090b",
    },
    duration: {
      mode: "follow-source-role" as const,
      sourceRole: "performance-video",
    },
    sourceRoles: [
      {
        key: "performance-video",
        label: "Performance video",
        acceptedKinds: ["video" as const],
        required: true,
        resolution: "selected-video" as const,
      },
      {
        key: "animation",
        label: "Animation",
        acceptedKinds: ["sequence-animation" as const],
        required: true,
        resolution: "linked-sequence-animation" as const,
      },
      {
        key: "card",
        label: "Choreo card",
        acceptedKinds: ["choreo-card" as const],
        required: true,
        resolution: "linked-choreo-card" as const,
      },
      {
        key: "original-audio",
        label: "Original sound",
        acceptedKinds: ["audio" as const],
        required: false,
        resolution: "original-video-audio" as const,
      },
    ],
    regions: referenceProject().regions,
    clips: [
      {
        id: "video-clip",
        kind: "visual" as const,
        sourceRole: "performance-video",
        regionId: "top",
        start: fraction(0),
        end: fraction(0.55),
        sourceIn: fraction(0),
        sourceOut: fraction(0.55),
        playbackRate: 1,
        loop: false,
        opacity: 1,
        transform: identityTransform,
        useResolvedTimeMap: true,
        syncGroupId: "performance-sync",
      },
      {
        id: "animation-clip",
        kind: "visual" as const,
        sourceRole: "animation",
        regionId: "top",
        start: fraction(0.45),
        end: fraction(1),
        sourceIn: fraction(0.45),
        sourceOut: fraction(1),
        playbackRate: 1,
        loop: false,
        opacity: 1,
        transform: identityTransform,
        useResolvedTimeMap: true,
        syncGroupId: "performance-sync",
      },
      {
        id: "card-clip",
        kind: "visual" as const,
        sourceRole: "card",
        regionId: "bottom",
        start: fraction(0),
        end: fraction(1),
        sourceIn: fraction(0),
        sourceOut: fraction(1),
        playbackRate: 1,
        loop: false,
        opacity: 1,
        transform: identityTransform,
        useResolvedTimeMap: true,
        syncGroupId: "performance-sync",
      },
      {
        id: "audio-clip",
        kind: "audio" as const,
        sourceRole: "original-audio",
        start: fraction(0),
        end: fraction(1),
        sourceIn: fraction(0),
        sourceOut: fraction(1),
        playbackRate: 1,
        loop: false,
      },
    ],
    transitions: [
      {
        id: "top-crossfade",
        kind: "crossfade" as const,
        outgoingClipId: "video-clip",
        incomingClipId: "animation-clip",
        start: fraction(0.45),
        end: fraction(0.55),
        curve: "ease-in-out" as const,
      },
    ],
    audioMix: {
      masterGain: 1,
      tracks: [
        {
          clipId: "audio-clip",
          gain: 1,
          muted: false,
          fadeInSeconds: 0,
          fadeOutSeconds: 0,
        },
      ],
    },
    targetDefaults: {
      instagram: { delivery: "handoff" as const },
    },
  };
}

describe("MediaCompositionProjectSchema", () => {
  it("accepts the performance-breakdown reference composition", () => {
    const parsed = MediaCompositionProjectSchema.parse(referenceProject());

    expect(parsed.sources).toHaveLength(4);
    expect(parsed.clips).toHaveLength(4);
    expect(parsed.transitions[0]?.startSeconds).toBe(4.5);
  });

  it("rejects duplicate durable identities", () => {
    const project = referenceProject();
    project.sources[1]!.id = "performance-video";

    expect(MediaCompositionProjectSchema.safeParse(project).success).toBe(
      false
    );
  });

  it("rejects a region that leaks beyond the normalized frame", () => {
    const project = referenceProject();
    project.regions[0]!.x = 0.2;

    expect(MediaCompositionProjectSchema.safeParse(project).success).toBe(
      false
    );
  });

  it("rejects a time map attached to a different sequence revision", () => {
    const project = referenceProject();
    project.timeMaps[0]!.sequenceRef = {
      sequenceId: "sequence-b",
      contentHash: "sha256:sequence-b-v1",
    };

    expect(MediaCompositionProjectSchema.safeParse(project).success).toBe(
      false
    );
  });

  it("accepts a sequence time map driven by rights-cleared music", () => {
    const project = referenceProject();
    delete project.sources[0]!.timeMapId;
    project.sources.push({
      id: "music",
      role: "music",
      kind: "audio",
      origin: {
        type: "uploaded-audio",
        url: "https://media.example/music.m4a",
        rightsConfirmedAt: 1,
      },
      durationSeconds: 10,
      mimeType: "audio/mp4",
      timeMapId: "performance-map",
    });
    project.timeMaps[0]!.mediaSourceId = "music";

    expect(MediaCompositionProjectSchema.safeParse(project).success).toBe(true);
  });

  it("rejects audio tracks that point at visual clips", () => {
    const project = referenceProject();
    project.audioMix.tracks[0]!.clipId = "card-clip";

    expect(MediaCompositionProjectSchema.safeParse(project).success).toBe(
      false
    );
  });

  it("rejects unknown fields instead of silently persisting drift", () => {
    const project = { ...referenceProject(), surprise: true };

    expect(MediaCompositionProjectSchema.safeParse(project).success).toBe(
      false
    );
  });
});

describe("MediaCompositionPresetSchema", () => {
  it("accepts role-based bindings for the reference composition", () => {
    const parsed = MediaCompositionPresetSchema.parse(referencePreset());

    expect(parsed.duration).toEqual({
      mode: "follow-source-role",
      sourceRole: "performance-video",
    });
    expect(parsed.transitions).toHaveLength(1);
  });

  it("accepts sequence tempo duration and rejects unreachable BPM values", () => {
    const preset = referencePreset();
    preset.duration = { mode: "sequence-tempo", bpm: 90 };

    expect(MediaCompositionPresetSchema.parse(preset).duration).toEqual({
      mode: "sequence-tempo",
      bpm: 90,
    });

    preset.duration = { mode: "sequence-tempo", bpm: 240 };
    expect(MediaCompositionPresetSchema.safeParse(preset).success).toBe(false);
  });

  it("rejects clips whose source role cannot resolve", () => {
    const preset = referencePreset();
    preset.clips[0]!.sourceRole = "missing-role";

    expect(MediaCompositionPresetSchema.safeParse(preset).success).toBe(false);
  });

  it("rejects an audio binding that resolves to visual media", () => {
    const preset = referencePreset();
    preset.sourceRoles[3]!.acceptedKinds = ["video"];

    expect(MediaCompositionPresetSchema.safeParse(preset).success).toBe(false);
  });

  // A compiled post gives every item its own region and crossfades one main
  // clip into the next, so a crossfade always spans two regions there.
  it("accepts crossfades between clips in different regions", () => {
    const preset = referencePreset();
    const incoming = preset.clips[1]!;
    if (incoming.kind === "visual") incoming.regionId = "bottom";

    expect(MediaCompositionPresetSchema.safeParse(preset).success).toBe(true);
  });
});
