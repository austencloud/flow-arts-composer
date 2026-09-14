<!--
  ChoreoCardExport.svelte - Export controls for Choreo Cards

  Single export button with progress feedback.
  Renders sequences as print-ready PNGs in a zip file.
-->
<script lang="ts">
  import { COMPOSER_CARD_EXPORT_PROFILE_V1 } from "@tka/render-composition";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import type { PublicSequencesLoader } from "$lib/shared/browse/services/public-sequences-loader";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import { getBrowseLoader } from "$lib/shared/browse/get-browse-loader";
  import { getSequenceRenderer } from "$lib/shared/render/get-sequence-renderer";
  import { onMount } from "svelte";
  import { detectPlatform } from "$lib/shared/mobile/services/platform-detector";
  import { ensureFullAccountForExport } from "$lib/shared/auth/domain/export-gate";
  import ExportTakeover from "$lib/shared/video-export/components/ExportTakeover.svelte";

  interface Props {
    sequences: SequenceData[];
    showGrid: boolean;
    showTKA: boolean;
    showWord: boolean;
    includeStartPosition: boolean;
  }

  let { sequences, showGrid, showTKA, showWord, includeStartPosition }: Props =
    $props();

  let hapticService: HapticFeedback;
  let browseLoader: PublicSequencesLoader;
  let isExporting = $state(false);
  // Set by the takeover's Cancel. Checked between awaited units of work so the
  // export stops before anything is written or handed to the browser — a
  // cancelled run leaves no half-built PNG or zip behind.
  let exportCancelled = $state(false);
  let exportCurrent = $state(0);
  let exportTotal = $state(0);
  let exportStage = $state<"loading" | "rendering" | "zipping">("loading");

  const progressPercent = $derived(
    exportTotal > 0 ? Math.round((exportCurrent / exportTotal) * 100) : 0
  );

  const progressLabel = $derived.by(() => {
    if (exportStage === "loading")
      return `Loading ${exportCurrent} of ${exportTotal}...`;
    if (exportStage === "zipping") return "Packaging zip file...";
    return `Rendering ${exportCurrent} of ${exportTotal}`;
  });

  onMount(() => {
    hapticService = getHapticFeedback();
    browseLoader = getBrowseLoader();
  });

  /** Ensure sequence has full step data for rendering */
  async function ensureFullData(seq: SequenceData): Promise<SequenceData> {
    if (seq.steps.length > 0) return seq;
    const full = await browseLoader.loadFullSequenceData(seq.name || seq.word);
    if (!full || full.steps.length === 0) {
      throw new Error(`Could not load step data for "${seq.word}"`);
    }
    return full;
  }

  async function handleExport() {
    if (sequences.length === 0 || isExporting) return;

    // Take-it-home gate: a free account is required to download cards.
    if (!(await ensureFullAccountForExport())) return;

    isExporting = true;
    exportCancelled = false;
    exportCurrent = 0;
    exportTotal = sequences.length;
    exportStage = "loading";
    hapticService?.trigger("selection");

    try {
      const renderer = getSequenceRenderer();

      const renderOptions = {
        stepSize: COMPOSER_CARD_EXPORT_PROFILE_V1.cellSize,
        format: "PNG" as const,
        quality: 1.0,
        includeStartPosition,
        startPositionLayout:
          COMPOSER_CARD_EXPORT_PROFILE_V1.startPositionLayout,
        addStepNumbers: COMPOSER_CARD_EXPORT_PROFILE_V1.showStepNumbers,
        addWord: showWord && COMPOSER_CARD_EXPORT_PROFILE_V1.showWord,
        addDifficultyLevel: COMPOSER_CARD_EXPORT_PROFILE_V1.showDifficulty,
        addUserInfo: COMPOSER_CARD_EXPORT_PROFILE_V1.showFooter,
        addReversalSymbols: COMPOSER_CARD_EXPORT_PROFILE_V1.showReversals,
        // Pass the full visibility set explicitly so the exported PNG matches
        // the on-screen choreo card. Omitting these let image-composer's
        // fallback inherit them from the global VisibilityStateManager (e.g.
        // a stray non-radial / elemental toggle leaked onto clean cards).
        visibilityOverrides: {
          darkMode: COMPOSER_CARD_EXPORT_PROFILE_V1.darkMode,
          printMode: true,
          showGrid,
          showTKA,
          showReversals: true,
          showNonRadialPoints: false,
          showTnD: false,
          showElemental: false,
          showPositions: false,
          showHandColorKey: true,
          showMandala: COMPOSER_CARD_EXPORT_PROFILE_V1.showMandala,
        },
      };

      // Single sequence - download PNG directly
      if (sequences.length === 1 && sequences[0]) {
        exportStage = "loading";
        exportCurrent = 1;
        const fullSeq = await ensureFullData(sequences[0]);
        if (exportCancelled) return;
        exportStage = "rendering";
        const blob = await renderer.renderSequenceToBlob(
          fullSeq,
          renderOptions
        );
        if (exportCancelled) return;
        await downloadBlob(
          blob,
          `${sequences[0].word || sequences[0].name || "choreo-card"}.png`
        );
        hapticService?.trigger("success");
        return;
      }

      // Multiple sequences - load all data first, then render into zip
      exportStage = "loading";
      const fullSequences: SequenceData[] = [];
      for (let i = 0; i < sequences.length; i++) {
        const seq = sequences[i];
        if (!seq) continue;
        if (exportCancelled) return;
        exportCurrent = i + 1;
        fullSequences.push(await ensureFullData(seq));
      }
      if (exportCancelled) return;

      exportStage = "rendering";
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      for (let i = 0; i < fullSequences.length; i++) {
        const seq = fullSequences[i]!;
        if (exportCancelled) return;
        exportCurrent = i + 1;
        const blob = await renderer.renderSequenceToBlob(seq, renderOptions);
        const name = seq.word || seq.name || `card-${i + 1}`;
        zip.file(`${name}.png`, blob);
      }

      if (exportCancelled) return;
      exportStage = "zipping";
      const zipBlob = await zip.generateAsync({ type: "blob" });
      if (exportCancelled) return;
      await downloadBlob(zipBlob, "choreo-cards.zip");
      hapticService?.trigger("success");
    } catch (error) {
      if (exportCancelled) return;
      console.warn("[ChoreoCardExport] Export failed:", error);
      hapticService?.trigger("error");
      toast.error("Export failed. Try again.");
    } finally {
      isExporting = false;
      exportCancelled = false;
      exportCurrent = 0;
      exportTotal = 0;
    }
  }

  function cancelExport() {
    exportCancelled = true;
  }

  async function downloadBlob(blob: Blob, filename: string) {
    const platform = detectPlatform();
    if (platform !== "desktop" && navigator.share) {
      const file = new File([blob], filename, { type: blob.type });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: filename });
          return;
        } catch (e: unknown) {
          if (e instanceof Error && e.name === "AbortError") return;
        }
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
</script>

<div class="export-section">
  <h3 class="section-title">
    <i class="fas fa-download" aria-hidden="true"></i>
    <span>Export</span>
  </h3>

  <button
    class="export-btn"
    onclick={handleExport}
    disabled={sequences.length === 0 || isExporting}
    aria-label="Export {sequences.length} sequences as print-ready images"
    type="button"
  >
    <i class="fas fa-file-archive" aria-hidden="true"></i>
    <span>Export {sequences.length} cards</span>
  </button>
</div>

<ExportTakeover
  phase={isExporting
    ? exportStage === "zipping"
      ? "encoding"
      : "capturing"
    : "idle"}
  progress={progressPercent / 100}
  phaseLabel={progressLabel}
  onCancel={cancelExport}
  label="Exporting choreo cards"
/>

<style>
  .export-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .section-title i {
    font-size: 12px;
    opacity: 0.7;
  }

  .export-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-xs);
    width: 100%;
    min-height: var(--min-touch-target);
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--theme-accent-bg, rgba(99, 102, 241, 0.15));
    border: 1px solid var(--theme-accent, #6366f1);
    border-radius: var(--border-radius-md, 8px);
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-sm, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .export-btn:hover:not(:disabled) {
    background: var(--theme-accent-glow, rgba(99, 102, 241, 0.25));
  }

  .export-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .export-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .export-btn i {
    font-size: 14px;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .export-section {
      flex-direction: row;
      align-items: center;
    }

    .export-btn {
      padding: var(--spacing-xs) var(--spacing-sm);
      font-size: var(--font-size-compact, 12px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .export-btn {
      transition: none;
    }
  }
</style>
