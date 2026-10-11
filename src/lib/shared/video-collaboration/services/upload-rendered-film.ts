/**
 * Put a film that was just rendered in the app onto the sequence it performs.
 *
 * The upload sheet already does this for a file someone picked off their
 * device; a rendered film differs only in where the bytes came from, so this
 * runs the same three steps — storage upload, collaborative record, shared
 * store — minus the file picker.
 */
import { getVideoUploader } from "#lib/shared/share/get-video-uploader.js";
import { getAuthSync } from "#lib/shared/auth/firebase.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { getCurrentSequenceRevisionRef } from "#lib/shared/library/services/sequence-revision-reader.js";
import {
  createVideoFromUpload,
  getVideoFileMetadata,
} from "../helpers/create-video-from-upload";
import { saveSequenceVideo } from "../state/sequence-videos-store.svelte";
import { DEFAULT_VIDEO_VISIBILITY } from "../domain/video-visibility";
import type { VideoVisibility } from "../domain/collaborative-video";

export interface UploadRenderedFilmInput {
  sequence: SequenceData;
  blob: Blob;
  /** Seconds of footage. Omit it and the file is measured instead. */
  durationSeconds?: number;
  visibility?: VideoVisibility;
  description?: string;
  onProgress?: (progress: number) => void;
}

export async function uploadRenderedFilm(
  input: UploadRenderedFilmInput
): Promise<void> {
  const user = getAuthSync()?.currentUser;
  if (!user) throw new Error("Sign in to save a film to this sequence.");

  const mimeType = input.blob.type || "video/mp4";
  const extension = mimeType.includes("webm") ? "webm" : "mp4";
  const file = new File([input.blob], `film-${Date.now()}.${extension}`, {
    type: mimeType,
  });

  const durationSeconds =
    input.durationSeconds ??
    (await getVideoFileMetadata(file).then(
      (meta) => meta.duration,
      () => 0
    ));

  const uploadResult = await getVideoUploader().uploadAssociatedVideo(
    input.sequence.id,
    file,
    {
      ...(input.onProgress ? { onProgress: input.onProgress } : {}),
    }
  );

  // Pin the exact retained revision when the sequence has one, so the film
  // stays attached to the version it actually performs. A sequence that was
  // never published simply has none, and the film stays private.
  const visibility = input.visibility ?? DEFAULT_VIDEO_VISIBILITY;
  let revision = null;
  try {
    revision = await getCurrentSequenceRevisionRef(input.sequence.id);
  } catch (error) {
    console.warn("[RenderedFilm] Could not resolve the sequence revision:", error);
  }
  if (visibility === "public" && !revision) {
    throw new Error(
      "Publish this sequence before sharing a public performance of it."
    );
  }

  const video = createVideoFromUpload({
    uploadResult,
    sequence: input.sequence,
    duration: durationSeconds,
    fileSize: input.blob.size,
    mimeType,
    creatorId: user.uid,
    ...(user.displayName ? { creatorDisplayName: user.displayName } : {}),
    ...(user.photoURL ? { creatorAvatarUrl: user.photoURL } : {}),
    visibility,
    ...(input.description ? { description: input.description } : {}),
    ...(revision ? { revision } : {}),
  });

  await saveSequenceVideo(video);
}
