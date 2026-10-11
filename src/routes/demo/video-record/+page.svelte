<!--
  Video Record Demo Page

  Test page for VideoRecordDrawer component.
-->
<script lang="ts">
  import VideoRecordDrawer from "#lib/shared/video-record/components/VideoRecordDrawer.svelte";
  import type { RecordingResult } from "#lib/shared/video-record/services/types.js";
  let showDrawer = $state(false);
  let lastRecording = $state<RecordingResult | null>(null);

  function handleSave(recording: RecordingResult) {
    console.log("Recording saved:", recording);
    lastRecording = recording;
  }
</script>

<div class="demo-page">
  <h1>Video Record Demo</h1>

  <button class="open-button" onclick={() => (showDrawer = true)}>
    📹 Open Video Recorder
  </button>

  {#if lastRecording}
    <div class="last-recording">
      <h2>Last Recording</h2>
      <p>Duration: {lastRecording.duration?.toFixed(2)}s</p>
      <p>Size: {(lastRecording.videoBlob?.size ?? 0 / 1024).toFixed(1)}KB</p>
      {#if lastRecording.blobUrl}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video
          src={lastRecording.blobUrl}
          controls
          style="max-width: 100%; border-radius: 8px;"
          aria-label="Last recorded video"
        ></video>
      {/if}
    </div>
  {/if}

  <VideoRecordDrawer bind:show={showDrawer} onSave={handleSave} />
</div>

<style>
  .demo-page {
    padding: 40px;
    max-width: 800px;
    margin: 0 auto;
  }

  h1 {
    color: white;
    margin-bottom: 32px;
  }

  .open-button {
    min-height: var(--min-touch-target);
    padding: 16px 32px;
    font-size: 16px;
    font-weight: 600;
    background: linear-gradient(135deg, var(--semantic-info) 0%, #2563eb 100%);
    color: white;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .open-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }

  .last-recording {
    margin-top: 32px;
    padding: 24px;
    background: var(--theme-card-bg);
    border-radius: 12px;
    border: 1px solid var(--theme-stroke);
  }

  .last-recording h2 {
    color: white;
    margin-top: 0;
    margin-bottom: 16px;
  }

  .last-recording p {
    color: rgba(255, 255, 255, 0.8);
    margin: 8px 0;
  }
</style>
