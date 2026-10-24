<script lang="ts">
  import { onDestroy } from "svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { encodePerformanceTransfer } from "../services/performance-transfer.js";
  import { copyTextToClipboard } from "#lib/shared/share/services/link-share.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import RuntimeMotionCapture from "./RuntimeMotionCapture.svelte";
  import { RuntimeMotionRequest } from "../services/runtime-motion-request.js";

  interface MotionBundle {
    sequenceSHA256: string;
    effectivePropLengthCm?: number;
  }

  let { sequence }: { sequence: SequenceData } = $props();
  let status = $state("");
  let capture = $state<RuntimeMotionRequest | null>(null);

  onDestroy(() => capture?.cancel());

  $effect(() => {
    if (capture && !capture.matches(sequence)) {
      capture.cancel();
      capture = null;
      status = "The score changed. Start a new game motion download for the current score.";
    }
  });

  function startGameMotion() {
    if (capture) return;
    try {
      capture = new RuntimeMotionRequest(sequence);
      status = "Capturing X-Bot with Fire Staff…";
    } catch {
      status = "Could not snapshot the current score.";
    }
  }

  function finishGameMotion(bundle: MotionBundle, request: RuntimeMotionRequest) {
    if (capture !== request || !request.matches(sequence)) return;
    const fileName = `x-bot_${bundle.sequenceSHA256.slice(0, 16)}.motion.json`;
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    request.cancel();
    capture = null;
    status = `Downloaded ${fileName} for X-Bot and Fire Staff${bundle.effectivePropLengthCm === undefined ? "" : ` (${bundle.effectivePropLengthCm.toFixed(1)} cm)`}.`;
  }

  async function copyTransfer() {
    let contents: string;
    try {
      contents = await encodePerformanceTransfer(sequence);
    } catch (error) {
      status =
        error instanceof Error
          ? error.message
          : "Could not prepare performance.";
      return;
    }
    try {
      await copyTextToClipboard(contents);
      status =
        "Performance copied. In Museum or Flow Fest, press F6 and paste it.";
    } catch {
      status = "Clipboard is unavailable. Download a backup file instead.";
    }
  }

  async function downloadTransfer() {
    try {
      const contents = await encodePerformanceTransfer(sequence);
      const url = URL.createObjectURL(
        new Blob([contents], { type: "application/json" })
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${sequence.id.replace(/[^a-z0-9_-]/gi, "-") || "performance"}.tka-performance.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status =
        "Backup file downloaded. Reopen it at /performance to use it in Composer.";
    } catch (error) {
      status =
        error instanceof Error ? error.message : "Could not prepare transfer.";
    }
  }
</script>

<div class="performance-transfer">
  <h3>Use in Museum or Flow Fest</h3>
  <p>
    Download the current score as game motion. Open Museum's Composer preview, or
    equip X-Bot and Fire Staff in Flow Fest. Press F6 and paste the full path of
    the downloaded .motion.json file. Download it again after editing the score.
  </p>
  <div class="actions">
    <PanelButton onclick={startGameMotion} disabled={capture !== null}>Download game motion</PanelButton>
    <PanelButton onclick={copyTransfer}>Copy performance</PanelButton>
    <PanelButton onclick={downloadTransfer}>Download backup file</PanelButton>
  </div>
  {#if capture}
    {@const request = capture}
    <RuntimeMotionCapture sequence={capture.sequence}
      onComplete={(bundle) => finishGameMotion(bundle, request)}
      onError={(message) => { if (capture === request) { request.cancel(); capture = null; status = message; } }}
      onProgress={(phase, frame, total) => { if (capture === request && request.matches(sequence)) status = `${phase === "warming" ? "Preparing" : "Capturing"} X-Bot with Fire Staff: ${frame}/${total} frames`; }} />
  {/if}
  <p class="instruction">
    Game motion loops with the captured Fire Staff length. Copy performance
    transfers the score for pasting through F6; the native character and prop
    still need to match. The backup file reopens in Composer at
    <LinkChip href="/performance">Performance transfer</LinkChip>.
  </p>
  {#if status}<p class="status" role="status">{status}</p>{/if}
</div>

<style>
  .performance-transfer {
    border-top: 1px solid var(--theme-stroke);
    margin-top: 1rem;
    padding: 1rem;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  h3 {
    font-size: 1rem;
    margin: 0 0 0.4rem;
  }
  p {
    margin: 0.35rem 0 0.65rem;
    line-height: 1.45;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .instruction {
    font-size: 0.875rem;
    opacity: 0.85;
  }
  .status {
    font-weight: 600;
  }
</style>
