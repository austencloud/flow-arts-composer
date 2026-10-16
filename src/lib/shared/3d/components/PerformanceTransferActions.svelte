<script lang="ts">
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { encodePerformanceTransfer } from "../services/performance-transfer.js";
  import { copyTextToClipboard } from "#lib/shared/share/services/link-share.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";

  let { sequence }: { sequence: SequenceData } = $props();
  let status = $state("");

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
    Copy this complete sequence, then press F6 in Museum or Flow Fest and paste.
    Playback there needs a prepared character and prop match.
  </p>
  <div class="actions">
    <PanelButton onclick={copyTransfer}>Copy performance</PanelButton>
    <PanelButton onclick={downloadTransfer}>Download backup file</PanelButton>
  </div>
  <p class="instruction">
    A downloaded file can be reopened in Composer at
    <LinkChip href="/performance">Performance transfer</LinkChip>. Museum and
    Flow Fest accept a pasted performance through F6.
  </p>
  {#if status}<p class="status" role="status">{status}</p>{/if}
</div>

<style>
  .performance-transfer {
    border-top: 1px solid var(--border-color, #7776);
    padding: 1rem 0;
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
