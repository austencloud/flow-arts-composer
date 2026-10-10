/**
 * Helper to create a CollaborativeVideo from an upload result
 *
 * Bridges the gap between R2VideoUploader (raw upload)
 * and CollaborativeVideoManager (collaborative metadata).
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  createCollaborativeVideo,
  createSequencePerformanceAssociation,
  createTunnelRealizationAssociation,
  type CollaborativeVideo,
  type VideoVisibility,
} from "../domain/collaborative-video";
import type { VideoUploadResult } from "../../share/services/types";
import { DEFAULT_VIDEO_VISIBILITY } from "../domain/video-visibility";
import type { ArtifactRevisionRef } from "#lib/shared/artifact-revisions/domain/artifact-revision.js";

export interface CreateVideoFromUploadOptions {
  /** The upload result from R2VideoUploader */
  uploadResult: VideoUploadResult;
  /** The sequence this video performs */
  sequence: SequenceData;
  /** Video duration in seconds */
  duration: number;
  /** Video file size in bytes */
  fileSize: number;
  /** Video MIME type */
  mimeType: string;
  /** Creator's user ID */
  creatorId: string;
  /** Creator's display name (for quick display) */
  creatorDisplayName?: string;
  /** Creator's avatar URL */
  creatorAvatarUrl?: string;
  /** Initial visibility */
  visibility?: VideoVisibility;
  /** Optional description */
  description?: string;
  /** Optional thumbnail URL */
  thumbnailUrl?: string;
  /** Exact retained public-sequence subject when one exists. */
  revision?: ArtifactRevisionRef;
}

/**
 * Create a CollaborativeVideo from upload results
 *
 * Use this after uploading a video with R2VideoUploader
 * to create the collaborative metadata structure.
 *
 * @example
 * ```ts
 * // 1. Upload the video file
 * const uploadResult = await videoUploadService.uploadPerformanceVideo(
 *   sequence.id,
 *   videoFile
 * );
 *
 * // 2. Create collaborative video metadata
 * const video = createVideoFromUpload({
 *   uploadResult,
 *   sequence,
 *   duration: 30,
 *   fileSize: videoFile.size,
 *   mimeType: videoFile.type,
 *   creatorId: currentUser.uid,
 *   creatorDisplayName: currentUser.displayName,
 * });
 *
 * // 3. Save to Firestore
 * await collaborativeVideoService.saveVideo(video);
 * ```
 */
export function createVideoFromUpload(
  options: CreateVideoFromUploadOptions
): CollaborativeVideo {
  const {
    uploadResult,
    sequence,
    duration,
    fileSize,
    mimeType,
    creatorId,
    creatorDisplayName,
    creatorAvatarUrl,
    visibility = DEFAULT_VIDEO_VISIBILITY,
    description,
    thumbnailUrl,
    revision,
  } = options;

  return createCollaborativeVideo(
    {
      videoUrl: uploadResult.url,
      storagePath: uploadResult.key,
      thumbnailUrl,
      duration,
      fileSize,
      mimeType,
      sequenceId: sequence.id,
      sequenceName: sequence.name || sequence.word,
      sequenceOwnerId: sequence.ownerId,
      associations: [
        createSequencePerformanceAssociation(
          sequence.id,
          sequence.name || sequence.word,
          revision
        ),
      ],
      creatorId,
      visibility,
      description,
    },
    creatorDisplayName,
    creatorAvatarUrl
  );
}

export interface CreateTunnelRealizationFromUploadOptions {
  uploadResult: VideoUploadResult;
  tunnel: {
    id: string;
    name: string;
    sourceSequenceId?: string;
    revision?: ArtifactRevisionRef;
  };
  duration: number;
  fileSize: number;
  mimeType: string;
  creatorId: string;
  creatorDisplayName?: string;
  creatorAvatarUrl?: string;
  visibility?: VideoVisibility;
  description?: string;
  thumbnailUrl?: string;
}

/** A real-world tunnel video describes the saved artwork, not merely the
 * notation that generated its motion. Its optional source sequence stays on
 * the association as lineage and never becomes the compatibility sequenceId. */
export function createTunnelRealizationFromUpload(
  options: CreateTunnelRealizationFromUploadOptions
): CollaborativeVideo {
  const {
    uploadResult,
    tunnel,
    duration,
    fileSize,
    mimeType,
    creatorId,
    creatorDisplayName,
    creatorAvatarUrl,
    visibility = DEFAULT_VIDEO_VISIBILITY,
    description,
    thumbnailUrl,
  } = options;

  return createCollaborativeVideo(
    {
      videoUrl: uploadResult.url,
      storagePath: uploadResult.key,
      thumbnailUrl,
      duration,
      fileSize,
      mimeType,
      associations: [
        createTunnelRealizationAssociation(
          tunnel.id,
          tunnel.name,
          tunnel.sourceSequenceId,
          tunnel.revision
        ),
      ],
      creatorId,
      visibility,
      description,
    },
    creatorDisplayName,
    creatorAvatarUrl
  );
}

/**
 * Get video metadata from a File object
 *
 * Extracts duration using video element.
 * Useful before calling createVideoFromUpload.
 */
export async function getVideoFileMetadata(
  file: File
): Promise<{ duration: number; fileSize: number; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve({
        duration: video.duration,
        fileSize: file.size,
        mimeType: file.type || "video/mp4",
      });
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error("Failed to load video metadata"));
    };

    video.src = URL.createObjectURL(file);
  });
}
