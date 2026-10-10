import {
  getCreatorDisplayName,
  type CollaborativeVideo,
} from "#lib/shared/video-collaboration/domain/collaborative-video.js";

export function performanceCreatorName(video: CollaborativeVideo): string {
  return getCreatorDisplayName(video) ?? "Anonymous";
}

export function formatPerformanceDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function formatPerformanceDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function performanceTimingLabel(video: CollaborativeVideo): string {
  if (!video.beatMap) return "Timing not mapped";
  return video.beatMap.source === "manual"
    ? "Timing mapped manually"
    : "Timing map saved";
}
