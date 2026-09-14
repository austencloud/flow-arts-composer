<script lang="ts">
  import { withSavedProps } from "$lib/shared/foundation/services/prop-viewing";
  import { getVideoUploader } from "$lib/shared/share/get-video-uploader";
  /**
   * Video Record Coordinator Component
   *
   * Manages video record panel state and camera recording.
   * Extracts video record panel logic from CreateModule.svelte for better separation of concerns.
   *
   * Domain: Create module - Video Record Panel Coordination
   */

  import { createComponentLogger } from "$lib/shared/utils/debug-logger";
  import { getErrorHandler } from "$lib/shared/application/get-error-handler";
  import type { ErrorHandler } from "$lib/shared/application/services/error-handler";
  import VideoRecordDrawer from "$lib/shared/video-record/components/VideoRecordDrawer.svelte";
  import SavePromptDialog from "../dialogs/SavePromptDialog.svelte";
  import SaveToLibraryDialog, {
    type SaveMetadata,
  } from "../SaveToLibraryDialog.svelte";
  import { getCreateModuleContext } from "../../context/create-module-context";
  import { getLibrarySaveService } from "$lib/features/library/get-library-save-service";
  import type { SaveToLibraryOptions } from "$lib/shared/library/domain/library-contract-types";
  import type { RecordingResult } from "$lib/shared/video-record/services/types";
  import type { R2VideoUploader } from "$lib/shared/share/services/r2-video-uploader";
  import { saveRecording } from "$lib/shared/video-record/services/recording-persister";
  import {
    createRecordingMetadata,
    detectDeviceType,
  } from "$lib/shared/video-record/domain/recording-metadata";
  import { postSaveActivation } from "$lib/shared/onboarding/state/post-save-activation-state.svelte";

  const logger = createComponentLogger("VideoRecordCoordinator");

  const ctx = getCreateModuleContext();
  const { CreateModuleState, panelState } = ctx;

  // Services
  const uploadService = getVideoUploader() as R2VideoUploader;

  // UI State
  let showSavePrompt = $state(false);
  let showSaveDialog = $state(false);
  let pendingRecording: RecordingResult | null = $state(null);

  // Event handlers
  function handleClose() {
    panelState.closeVideoRecordPanel();
  }

  async function handleSave(recording: RecordingResult) {
    const currentSequence = CreateModuleState.sequenceState.currentSequence;

    if (!recording.success || !recording.videoBlob || !currentSequence) {
      logger.error("Invalid recording or no current sequence");
      return;
    }

    // Check if session is saved
    const session = ctx.sessionManager?.getCurrentSession();
    if (!session?.isSaved) {
      // Show save prompt first
      pendingRecording = recording;
      showSavePrompt = true;
      return;
    }

    // Proceed with upload
    await uploadRecording(recording, currentSequence.id);
  }

  async function handleSavePromptConfirm() {
    showSavePrompt = false;
    showSaveDialog = true;
  }

  function handleSavePromptCancel() {
    showSavePrompt = false;
    pendingRecording = null;
  }

  async function handleLibrarySave(metadata: SaveMetadata) {
    logger.info("handleLibrarySave called with metadata:", metadata);
    const currentSequence = CreateModuleState.sequenceState.currentSequence;

    if (!currentSequence) {
      logger.error("No current sequence found");
      return;
    }
    if (!ctx.sessionManager) {
      logger.error("sessionManager not available");
      return;
    }

    try {
      logger.info("Saving sequence to library...", {
        stepCount: currentSequence.steps.length,
        sequenceName: metadata.name,
      });

      // Save sequence to library via the durable-save entry point — this is the
      // ONLY path that writes Dexie (guests read library from Dexie only).
      // ctx.libraryRepository.saveSequenceWithMetadata() is Firestore-only and
      // silently drops guest saves. See SP1 — Durable-Save Unification.
      const saveOptions: SaveToLibraryOptions = {
        name: metadata.name,
        visibility: metadata.visibility ?? "public",
        tags: metadata.tags ?? [],
        notes: metadata.notes ?? "",
        analyticsSource: "video_record",
      };
      const saved = await getLibrarySaveService().saveSequence(
        withSavedProps(currentSequence, metadata.propConfig),
        saveOptions
      );
      const sequenceId = saved.sequenceId;

      logger.success("Sequence saved to library with ID:", sequenceId);

      // SP3 Part B: fired at root, after the save resolves — this coordinator
      // has no dedicated "keep" panel to close first (SaveToLibraryDialog
      // closes itself below, but the video record flow keeps going into the
      // upload step), so the nudge queues immediately.
      if (saved.persisted) {
        postSaveActivation.onGuestSaveSucceeded(sequenceId);
      }

      // File the freshly-saved sequence into any collections chosen in the
      // save dialog. The sequence id only exists now, so this can't happen at
      // dialog time — the picker collected the ids and we apply them here.
      if (metadata.collectionIds?.length) {
        try {
          const { addSequenceToCollection } =
            await import("$lib/shared/library/services/collection-manager");
          for (const collectionId of metadata.collectionIds) {
            await addSequenceToCollection(collectionId, sequenceId);
          }
        } catch (err) {
          logger.warn("Could not add sequence to selected collections:", err);
        }
      }

      const sessionId =
        ctx.sessionManager.getSessionId() ?? ctx.autosaver?.getSessionId();
      try {
        await ctx.autosaver?.deleteLocalDraft(sessionId);
      } catch (draftError) {
        logger.warn("Could not remove the completed local draft:", draftError);
      }

      void ctx.sessionManager.markAsSaved(sequenceId).catch((sessionError) => {
        logger.warn(
          "Could not complete the cloud session lifecycle:",
          sessionError
        );
      });

      // Refresh library state if available
      try {
        const { libraryState } =
          await import("$lib/features/library/state/library-state.svelte");
        if (libraryState) {
          logger.info("Refreshing library sequences...");
          await libraryState.loadSequences();
          logger.success("Library refreshed");
        }
      } catch (err) {
        logger.warn("Could not refresh library state:", err);
      }

      showSaveDialog = false;

      // Now upload the pending recording
      if (pendingRecording) {
        logger.info("Uploading pending recording...");
        await uploadRecording(pendingRecording, sequenceId);
        pendingRecording = null;
        logger.success("Recording uploaded successfully");
      }
    } catch (error) {
      logger.error("Failed to save sequence:", error);
    }
  }

  function handleLibraryCancel() {
    showSaveDialog = false;
    pendingRecording = null;
  }

  async function uploadRecording(
    recording: RecordingResult,
    sequenceId: string
  ) {
    try {
      logger.log("📤 Uploading recording to Firebase...");

      // Upload video to Firebase Storage
      const uploadResult = await uploadService.uploadPerformanceVideo(
        sequenceId,
        recording.videoBlob!,
        {
          onProgress: (progress) => logger.log(`Upload progress: ${progress}%`),
        }
      );

      // Create metadata using upload result
      const metadata = createRecordingMetadata({
        userId: "", // Will be populated by service
        sequenceId,
        videoUrl: uploadResult.url,
        storagePath: uploadResult.key,
        duration: recording.duration ?? 0,
        fileSize: recording.videoBlob!.size,
        mimeType: recording.videoBlob!.type,
        deviceType: detectDeviceType(),
        metadata: {
          sequenceName:
            CreateModuleState.sequenceState.currentSequence?.name || "",
          stepCount:
            CreateModuleState.sequenceState.currentSequence?.steps.length || 0,
        },
      });

      // Save metadata to Firestore
      await saveRecording(metadata);

      logger.log("✅ Recording saved successfully:", metadata.id);
      panelState.closeVideoRecordPanel();
    } catch (error) {
      logger.error("❌ Failed to save recording:", error);
      const errorHandler = getErrorHandler() as ErrorHandler;
      errorHandler.showUserError({
        message: "Couldn't save your recording",
        technicalDetails:
          error instanceof Error ? error.message : String(error),
        error: error instanceof Error ? error : new Error(String(error)),
        severity: "error",
        context: {
          module: "create",
          action: "save-recording",
        },
      });
    }
  }
</script>

<VideoRecordDrawer
  bind:show={panelState.isVideoRecordPanelOpen}
  sequence={CreateModuleState.sequenceState.currentSequence}
  onClose={handleClose}
  onSave={handleSave}
/>

<SavePromptDialog
  bind:show={showSavePrompt}
  onSave={handleSavePromptConfirm}
  onCancel={handleSavePromptCancel}
/>

<SaveToLibraryDialog
  isOpen={showSaveDialog}
  sequence={CreateModuleState.sequenceState.currentSequence}
  onSave={handleLibrarySave}
  onCancel={handleLibraryCancel}
/>
