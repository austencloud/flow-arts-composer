/**
 * Feedback Submit State
 *
 * State management for the feedback submission form.
 * Provides both a factory function and a shared singleton for use across
 * the submit tab and quick feedback panel.
 *
 * Images are pre-uploaded to a staging area as soon as they're attached,
 * so submit is instant. The stagedImages map tracks per-file upload state.
 *
 * Note: Draft persistence is handled by FormDraftPersister service in FeedbackForm,
 * not here. This keeps state management separate from persistence concerns.
 */

import type { FeedbackFormData, FeedbackFormErrors, FeedbackSubmitStatus, FeedbackType, FeedbackUploadProgress, StagedImageState, } from "#lib/shared/feedback/domain/models/feedback-models.js";
import { feedbackService } from "#lib/shared/feedback/services/feedback-repository.js";
import * as imageStager from "../services/image-stager";
import type { StagedUploadHandle } from "#lib/shared/feedback/domain/feedback-contract-types.js";
import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
import {
  getCapturedModule,
  getCapturedTab,
} from "./feedback-context-tracker.svelte";

/**
 * Creates feedback submit form state
 */
export function createFeedbackSubmitState() {
  // Form data (simplified - just type, title, description)
  // Draft restoration is handled by FeedbackForm via FormDraftPersister
  let formData = $state<FeedbackFormData>({
    type: "general",
    title: "",
    description: "",
  });

  // Attached images
  let images = $state<File[]>([]);

  // Form errors
  let formErrors = $state<FeedbackFormErrors>({});

  // Submission status
  let submitStatus = $state<FeedbackSubmitStatus>("idle");

  // Upload progress - non-null while submitting with images (fallback path)
  let uploadProgress = $state<FeedbackUploadProgress | null>(null);

  // Per-image staging state - tracks upload progress for each attached image
  let stagedImages = $state<Map<File, StagedImageState>>(new Map());

  // Active upload handles for cancellation on removal (not reactive - internal bookkeeping)
  const uploadHandles = new Map<File, StagedUploadHandle>();

  // Derived state
  const isSubmitting = $derived(submitStatus === "submitting");

  function startStagingUpload(file: File) {
    const userId = authState.user?.uid;
    if (!userId) return;

    const handle = imageStager.stageImage(file, userId, (state) => {
      // Create a new Map to trigger Svelte reactivity
      const next = new Map(stagedImages);
      next.set(file, state);
      stagedImages = next;
    });

    uploadHandles.set(file, handle);

    // Initialize state immediately
    const next = new Map(stagedImages);
    next.set(file, {
      status: "uploading",
      fraction: 0,
      storagePath: handle.storagePath,
    });
    stagedImages = next;

    // Handle completion/failure (fire and forget - state is updated via callback)
    handle.promise.catch(() => {
      // Error state already set via the onProgress callback
    });
  }

  function cancelAndCleanup(file: File) {
    const handle = uploadHandles.get(file);
    if (handle) {
      handle.cancel();
      uploadHandles.delete(file);
    }

    const state = stagedImages.get(file);
    if (state?.status === "uploaded" && state.storagePath) {
      // Already uploaded - delete from staging
      imageStager.deleteStaged(state.storagePath);
    }

    const next = new Map(stagedImages);
    next.delete(file);
    stagedImages = next;
  }

  // Image staging - imperative triggers, not reactive effects.
  // Effects would die when the component that created the singleton unmounts.
  function addImage(file: File) {
    images.push(file);
    startStagingUpload(file);
  }

  function addImages(files: File[]) {
    for (const file of files) {
      addImage(file);
    }
  }

  function removeImage(index: number) {
    const file = images[index];
    if (file) {
      cancelAndCleanup(file);
    }
    images.splice(index, 1);
  }

  // Actions
  function updateField<K extends keyof FeedbackFormData>(
    field: K,
    value: FeedbackFormData[K]
  ) {
    formData = { ...formData, [field]: value };

    // Clear error when field is updated
    if (formErrors[field as keyof FeedbackFormErrors]) {
      formErrors = { ...formErrors, [field]: undefined };
    }
  }

  function setType(type: FeedbackType) {
    updateField("type", type);
  }

  function validate(): boolean {
    const errors: FeedbackFormErrors = {};

    // Only description is required - title is optional (AI will generate if needed)

    if (!formData.description.trim()) {
      errors.description = "Description is required";
    } else if (formData.description.trim().length < 10) {
      errors.description =
        "Please provide a bit more detail (at least 10 characters)";
    }

    formErrors = errors;
    return Object.keys(errors).length === 0;
  }

  async function submit(): Promise<boolean> {
    if (!validate()) {
      return false;
    }

    submitStatus = "submitting";
    uploadProgress = null;

    // If images are still uploading, wait for them to finish
    if (images.length > 0) {
      const pendingHandles = images
        .map((f) => uploadHandles.get(f))
        .filter((h): h is StagedUploadHandle => h != null);

      const hasPending = pendingHandles.some((h) => {
        const state = stagedImages.get(
          [...uploadHandles.entries()].find(([, v]) => v === h)?.[0] as File
        );
        return state?.status === "uploading";
      });

      if (hasPending) {
        // Wait silently - thumbnail progress already shows per-image state
        try {
          await Promise.all(pendingHandles.map((h) => h.promise));
        } catch {
          const hasFailed = images.some(
            (f) => stagedImages.get(f)?.status === "failed"
          );
          if (hasFailed) {
            submitStatus = "error";
            return false;
          }
        }
      }
    }

    try {
      const capturedModule = getCapturedModule();
      const capturedTab = getCapturedTab();

      // Collect staging paths in image order. When every attached image finished
      // staging, hand the paths to the doc — the promoteFeedbackImages onCreate
      // trigger copies them from feedback-staging/ to the permanent feedback/
      // path and writes imageUrls, so submit is just the doc write (instant) and
      // the images survive the 30-minute staging cleanup.
      const collectedPaths = images
        .map((f) => stagedImages.get(f)?.storagePath)
        .filter((p): p is string => p != null);
      const allStaged =
        images.length > 0 && collectedPaths.length === images.length;

      await feedbackService.submitFeedback(
        formData,
        capturedModule,
        capturedTab,
        // Only pass raw files for the upload-on-submit fallback used when staging
        // didn't fully complete; otherwise the trigger handles the staged paths.
        allStaged ? undefined : images.length > 0 ? images : undefined,
        (progress) => {
          uploadProgress = progress;
        },
        allStaged ? collectedPaths : undefined,
      );

      // The promote trigger (or the fallback upload) now owns these files. Drop
      // our handles/state so reset() doesn't race the trigger and delete a
      // staged file before it's copied to the permanent path.
      uploadHandles.clear();
      stagedImages = new Map();

      uploadProgress = null;
      submitStatus = "success";
      // Draft clearing is handled by FeedbackForm via FormDraftPersister
      return true;
    } catch (error) {
      console.error("Failed to submit feedback:", error);
      uploadProgress = null;
      submitStatus = "error";
      return false;
    }
  }

  function reset() {
    // Cancel any in-flight uploads and delete staged files
    for (const file of [...uploadHandles.keys()]) {
      cancelAndCleanup(file);
    }

    formData = {
      type: "general",
      title: "",
      description: "",
    };
    images = [];
    formErrors = {};
    submitStatus = "idle";
    uploadProgress = null;
    stagedImages = new Map();
    // Draft clearing is handled by FeedbackForm via FormDraftPersister
  }

  return {
    // State
    get formData() {
      return formData;
    },
    get images() {
      return images;
    },
    set images(value: File[]) {
      images = value;
    },
    get formErrors() {
      return formErrors;
    },
    get submitStatus() {
      return submitStatus;
    },
    get isSubmitting() {
      return isSubmitting;
    },
    get uploadProgress() {
      return uploadProgress;
    },
    get stagedImages() {
      return stagedImages;
    },
    get isFormValid() {
      // Compute directly to survive HMR - don't use $derived
      return formData.description.trim().length >= 10;
    },
    // Captured context (evaluated dynamically when accessed)
    get capturedModule() {
      return getCapturedModule();
    },
    get capturedTab() {
      return getCapturedTab();
    },

    // Actions
    updateField,
    setType,
    addImage,
    addImages,
    removeImage,
    validate,
    submit,
    reset,
  };
}

export type FeedbackSubmitState = ReturnType<typeof createFeedbackSubmitState>;

/**
 * Shared singleton state for feedback submission.
 * Used by both FeedbackSubmitTab and QuickFeedbackPanel to share draft state.
 */
let sharedSubmitState: FeedbackSubmitState | null = null;

/**
 * Get or create the shared feedback submit state.
 * This ensures both the submit tab and quick panel use the same state,
 * so draft persistence works across both.
 */
export function getSharedFeedbackSubmitState(): FeedbackSubmitState {
  if (!sharedSubmitState) {
    sharedSubmitState = createFeedbackSubmitState();
  }
  return sharedSubmitState;
}

/**
 * Reset the shared state (e.g., after successful submission).
 * This should be called after a successful submission to clear the form.
 */
export function resetSharedFeedbackSubmitState(): void {
  if (sharedSubmitState) {
    sharedSubmitState.reset();
  }
}
