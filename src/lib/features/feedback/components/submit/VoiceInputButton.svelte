<!-- VoiceInputButton - MediaRecorder-based voice capture for feedback -->
<script lang="ts">
  import { onMount } from "svelte";
  import type { VoiceRecordingResult } from "#lib/shared/feedback/domain/feedback-contract-types.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type { VoiceRecorder } from "../../services/voice-recorder";

  const {
    voiceRecorder,
    onRecordingStart,
    onRecordingEnd,
    disabled = false,
  } = $props<{
    voiceRecorder: VoiceRecorder;
    onRecordingStart: (stream: MediaStream) => void;
    onRecordingEnd: (result: VoiceRecordingResult) => void;
    disabled?: boolean;
  }>();

  let isRecording = $state(false);

  // Stop recording when tab becomes hidden
  function handleVisibilityChange() {
    if (document.hidden && isRecording) {
      stopRecording();
    }
  }

  onMount(() => {
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (isRecording) {
        voiceRecorder.cancel();
      }
    };
  });

  async function startRecording() {
    try {
      const stream = await voiceRecorder.start();
      isRecording = true;
      onRecordingStart(stream);
    } catch (err) {
      console.error("Failed to start recording:", err);
      isRecording = false;
    }
  }

  async function stopRecording() {
    if (!voiceRecorder.isRecording) return;
    try {
      const result = await voiceRecorder.stop();
      isRecording = false;
      onRecordingEnd(result);
    } catch (err) {
      console.error("Failed to stop recording:", err);
      isRecording = false;
    }
  }

  function toggleRecording() {
    if (disabled) return;
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }
</script>

<button
  type="button"
  class="voice-btn"
  class:recording={isRecording}
  onclick={toggleRecording}
  {disabled}
  aria-label={isRecording ? t("feedback_stop_recording") : t("feedback_start_voice_input")}
  aria-pressed={isRecording}
  title={isRecording ? t("feedback_stop_recording") : t("feedback_speak_to_dictate")}
>
  {#if isRecording}
    <span class="pulse-ring"></span>
    <i class="fas fa-stop" aria-hidden="true"></i>
  {:else}
    <i class="fas fa-microphone" aria-hidden="true"></i>
  {/if}
</button>

<style>
  .voice-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    background: color-mix(
      in srgb,
      var(--theme-accent-strong, var(--theme-accent)) 15%,
      transparent
    );
    border: 1.5px solid
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent)) 30%,
        transparent
      );
    border-radius: 50%;
    color: var(--theme-accent-strong);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    flex-shrink: 0;
  }

  .voice-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-accent-strong) 25%, transparent);
    border-color: color-mix(
      in srgb,
      var(--theme-accent-strong, var(--theme-accent)) 50%,
      transparent
    );
    transform: scale(1.05);
  }

  .voice-btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  .voice-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .voice-btn i {
    font-size: 1rem;
    position: relative;
    z-index: 2;
  }

  /* Recording state */
  .voice-btn.recording {
    background: color-mix(
      in srgb,
      var(--semantic-error, var(--semantic-error)) 20%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-error, var(--semantic-error)) 40%,
      transparent
    );
    color: var(--semantic-error, var(--semantic-error));
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      box-shadow: 0 0 0 0
        color-mix(
          in srgb,
          var(--semantic-error, var(--semantic-error)) 40%,
          transparent
        );
    }
    50% {
      box-shadow: 0 0 0 8px transparent;
    }
  }

  /* Pulse ring animation */
  .pulse-ring {
    position: absolute;
    inset: -4px;
    border: 2px solid
      color-mix(
        in srgb,
        var(--semantic-error, var(--semantic-error)) 60%,
        transparent
      );
    border-radius: 50%;
    animation: ringPulse 1.5s ease-out infinite;
  }

  @keyframes ringPulse {
    0% {
      transform: scale(1);
      opacity: 1;
    }
    100% {
      transform: scale(1.3);
      opacity: 0;
    }
  }

  .voice-btn:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .voice-btn.recording {
      animation: none;
    }
    .pulse-ring {
      animation: none;
      display: none;
    }
  }
</style>
