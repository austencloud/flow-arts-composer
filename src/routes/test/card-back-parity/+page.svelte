<script lang="ts">
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PrintRenderOptions } from "$lib/features/choreo-card/services/types";
  import { renderCardBack } from "$lib/features/choreo-card/services/card-back-dom-renderer";
  import { buildBackJob } from "$lib/features/choreo-card/services/card-back/card-back-job-builder";
  import { paintBackJob } from "$lib/features/choreo-card/services/card-back/card-back-raster";
  import { buildFrontComposeOptions } from "$lib/features/choreo-card/services/build-front-compose-options";
  import { wrapContentInCardFrame } from "$lib/features/choreo-card/services/card-front-frame";
  import { loadParityDeck, listParityDecks, type ParityDeck, type ParityDeckSummary } from "$lib/features/choreo-card/services/parity-deck-source";
  import { getImageComposer } from "$lib/shared/render/get-image-composer";
  import { getCompositionDispatcher } from "$lib/shared/render/get-composition-dispatcher";
  import { CompositionDispatcher } from "$lib/shared/render/services/composition-dispatcher";
  import { getCardAssetBundle } from "$lib/shared/render/services/get-card-asset-bundle";
  import { buildOverridePlacementBundle } from "$lib/shared/render/services/override-placement-bundle";
  import { onMount } from "svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import CardParityViewer from "$lib/shared/parity/CardParityViewer.svelte";
  import { diff, normalizeToCanvas, AA_TOLERANCE } from "$lib/shared/parity/image-diff";
  import type { ParityRun, ParityRow, ParityVerdict } from "$lib/shared/parity/parity-types";

  // Logical MPC dimensions; both render paths end at scale-2 (1644x2244).
  const LOGICAL_W = 822;
  const LOGICAL_H = 1122;
  const LOGICAL_BLEED = 36;
  const SCALE = 2;
  const OUT_W = LOGICAL_W * SCALE; // 1644
  const OUT_H = LOGICAL_H * SCALE; // 2244

  // One fixed timestamp shared by the main + worker front renders so the
  // The shared footer and QR inputs stay byte-identical for pixel parity.

  let mode = $state<"front" | "back">("front");
  let decks = $state<ParityDeckSummary[]>([]);
  let selectedDeck = $state<number | null>(null);
  let loadError = $state<string | null>(null);

  onMount(async () => {
    try {
      decks = await listParityDecks();
      selectedDeck = decks[0]?.deckNumber ?? null;
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    }
  });

  function htmlCanvas(w: number, h: number): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  function printOptionsFor(deck: ParityDeck, card: ParityDeck["cards"][number]): PrintRenderOptions {
    return {
      canvasWidth: OUT_W,
      canvasHeight: OUT_H,
      bleedPx: LOGICAL_BLEED * SCALE,
      includeStartPlacement: true,
      startPlacementLayout: "row",
      tndElement: card.tndElement,
      leftLabel: card.footer.left,
      rightLabel: card.footer.right,
      notes: card.footer.center,
      iconPath: card.footer.iconPath,
      leftPropType: deck.leftPropType,
      rightPropType: deck.rightPropType,
      deckName: deck.name,
    } as PrintRenderOptions;
  }

  type Composed = ReturnType<typeof buildFrontComposeOptions>;

  // The QR is generated on the main thread (the QR generator uses new Image() and
  // Firebase, neither available in the worker) and the SAME bitmap is fed to both
  // renders — main via options.qrImageBitmap, worker via the transfer param — so
  // the QR cell is byte-identical instead of present-on-one-side-only.
  async function generateQr(deck: ParityDeck, card: ParityDeck["cards"][number], composed: Composed): Promise<HTMLImageElement | null> {
    const qrGen = getImageComposer().qrGenerator;
    if (!qrGen || !composed.composeOptions.visibilityOverrides?.showQRCode) return null;
    return qrGen.generateAsImage(card.sequence, 600, {
      style: "modern",
      margin: 1,
      darkMode: false,
      leftPropType: deck.leftPropType,
      rightPropType: deck.rightPropType,
      deckName: deck.name,
    });
  }

  // MAIN-THREAD real card front (the reference): production renderFront path with
  // the shared QR so it matches the worker byte-for-byte.
  async function renderFrontMain(card: ParityDeck["cards"][number], composed: Composed, qr: HTMLImageElement | null): Promise<HTMLCanvasElement> {
    const opts = qr
      ? ({ ...composed.composeOptions, qrImageBitmap: qr } as typeof composed.composeOptions)
      : composed.composeOptions;
    const inner = await getImageComposer().composeSequenceImage(card.sequence, opts);
    const framed = wrapContentInCardFrame(inner, composed.frame, htmlCanvas) as HTMLCanvasElement;
    return normalizeToCanvas(framed as CanvasImageSource, OUT_W, OUT_H);
  }

  // WORKER real card front (the candidate): same composeOptions + frame, applied
  // off-thread (frontCardFrame triggers the in-worker frame wrap). The QR clone is
  // transferred via composeFrontBitmap's qrBitmap param.
  async function renderFrontWorker(card: ParityDeck["cards"][number], composed: Composed, qr: HTMLImageElement | null): Promise<HTMLCanvasElement> {
    const qrBitmap = qr ? await createImageBitmap(qr) : null;
    const bmp = await getCompositionDispatcher().composeFrontBitmap(
      card.sequence,
      { ...composed.composeOptions, frontCardFrame: composed.frame },
      qrBitmap,
    );
    return normalizeToCanvas(bmp as CanvasImageSource, OUT_W, OUT_H);
  }

  async function renderBackNew(seq: SequenceData, theme: string): Promise<HTMLCanvasElement> {
    const job = await buildBackJob(seq, {
      width: OUT_W,
      height: OUT_H,
      bleedPx: LOGICAL_BLEED * SCALE,
      theme,
    });
    return normalizeToCanvas(paintBackJob(job) as CanvasImageSource, OUT_W, OUT_H);
  }

  async function renderBackOld(seq: SequenceData, theme: string): Promise<HTMLCanvasElement> {
    const c = await renderCardBack(seq, {
      width: LOGICAL_W,
      height: LOGICAL_H,
      bleedPx: LOGICAL_BLEED,
      theme,
    });
    return normalizeToCanvas(c as CanvasImageSource, OUT_W, OUT_H);
  }

  function makeRun(): ParityRun {
    const runMode = mode;
    const deckNumber = selectedDeck;
    return {
      async run(ctx) {
        if (deckNumber == null) {
          return { verdict: "FAIL", summary: "no released decks", gates: [], result: { error: "no released decks" } };
        }
        ctx.onProgress({ phase: "loading deck" });
        const deck = await loadParityDeck(deckNumber, 8);
        if (!deck || deck.cards.length === 0) {
          return { verdict: "FAIL", summary: "deck has no renderable cards", gates: [], result: { error: "empty deck" } };
        }

        if (runMode === "front") {
          ctx.onProgress({ phase: "probing worker support" });
          const ok = await CompositionDispatcher.probeWorkerSupport();
          if (!ok) {
            return { verdict: "FAIL", summary: "worker probe failed", gates: [], result: { error: "worker probe failed" } };
          }
          ctx.onProgress({ phase: "building asset bundle" });
          const bundle = await getCardAssetBundle(
            deck.cards.map((c) => c.sequence),
            {
              leftPropType: deck.leftPropType,
              rightPropType: deck.rightPropType,
              theme: deck.theme,
              iconPaths: deck.cards.map((c) => c.footer.iconPath).filter(Boolean) as string[],
            },
          );
          getCompositionDispatcher().setAssetBundle(bundle);
          getCompositionDispatcher().setOverrideBundle(buildOverridePlacementBundle());
        }

        const total = deck.cards.length;
        let done = 0;
        let worst = 0;
        let worstMaxDelta = 0;
        const summaryRows: Record<string, unknown>[] = [];

        for (const [idx, card] of deck.cards.entries()) {
          if (ctx.signal.aborted) break;
          // TnD decks repeat a base sequence id across variations, so the row key
          // must include the position to stay unique.
          const rowId = `${card.sequence.id}:${idx}:${runMode}`;
          const label = card.word || card.sequence.word || card.sequence.id;
          ctx.onProgress({ phase: "rendering", current: ++done, total, detail: `${label} (${deck.name})` });
          try {
            let oldCanvas: HTMLCanvasElement;
            let newCanvas: HTMLCanvasElement;
            if (runMode === "front") {
              const composed = buildFrontComposeOptions(card.sequence, printOptionsFor(deck, card));
              const qr = await generateQr(deck, card, composed);
              oldCanvas = await renderFrontMain(card, composed, qr);
              newCanvas = await renderFrontWorker(card, composed, qr);
            } else {
              oldCanvas = await renderBackOld(card.sequence, deck.theme);
              newCanvas = await renderBackNew(card.sequence, deck.theme);
            }
            const d = diff(oldCanvas, newCanvas, OUT_W, OUT_H);
            worst = Math.max(worst, d.diffPct);
            worstMaxDelta = Math.max(worstMaxDelta, d.maxDelta);
            const row: ParityRow = {
              id: rowId,
              title: `${label}${card.tndElement ? ` — ${card.tndElement.name}` : ""}`,
              metrics: { "% diff": d.diffPct, "max Δ": d.maxDelta },
              bad: d.diffPct > 1,
              cells: [
                { label: runMode === "front" ? "MAIN (main thread)" : "OLD (DOM)", canvas: oldCanvas },
                { label: runMode === "front" ? "WORKER (pool)" : "NEW (BackJob)", canvas: newCanvas },
                { label: "DIFF", canvas: d.heat },
              ],
            };
            ctx.addRow(row);
            summaryRows.push({ label, element: card.tndElement?.name, seqId: card.sequence.id, diffPct: Number(d.diffPct.toFixed(4)), maxDelta: d.maxDelta });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const blank = document.createElement("canvas");
            blank.width = OUT_W;
            blank.height = OUT_H;
            ctx.addRow({ id: rowId, title: label, metrics: {}, error: msg, cells: [{ label: "ERROR", canvas: blank }] });
            summaryRows.push({ label, seqId: card.sequence.id, error: msg });
          }
        }

        const verdict: ParityVerdict["verdict"] = worst <= 1 ? "PASS" : "FAIL";
        return {
          verdict,
          summary: `worst diff ${worst.toFixed(3)}% across ${summaryRows.length} cards`,
          gates: [{ label: "diff ≤ 1%", pass: worst <= 1, detail: `${worst.toFixed(3)}% · Δ${worstMaxDelta}` }],
          result: {
            mode: runMode,
            deck: deck.name,
            theme: deck.theme,
            aaTolerance: AA_TOLERANCE,
            outputSize: { width: OUT_W, height: OUT_H },
            worstDiffPct: Number(worst.toFixed(4)),
            worstMaxDelta,
            rows: summaryRows,
          },
        };
      },
    };
  }
</script>

<svelte:head>
  <title>Card Parity — {mode === "front" ? "Front Worker vs Main" : "Back Old vs New"}</title>
</svelte:head>

<CardParityViewer
  title="Card Parity"
  description={`Renders real released-deck cards two ways and pixel-diffs them. AA tolerance ${AA_TOLERANCE}/channel. Output ${OUT_W}×${OUT_H}. Front: worker pool vs main thread (full framed card). Back: old DOM vs new BackJob.`}
  resultKey="cardParityResult"
  run={makeRun}
>
  {#snippet controls()}
    <SegmentedControl
      options={[
        { value: "front", label: "Front (worker vs main)" },
        { value: "back", label: "Back (old vs new)" },
      ]}
      value={mode}
      onchange={(v) => (mode = v as "front" | "back")}
      size="sm"
    />
    {#if decks.length > 0 && selectedDeck != null}
      <SegmentedControl
        options={decks.map((d) => ({ value: String(d.deckNumber), label: d.name }))}
        value={String(selectedDeck)}
        onchange={(v) => (selectedDeck = Number(v))}
        color="accent"
        size="sm"
      />
    {:else if loadError}
      <span class="load-err">load error: {loadError}</span>
    {:else}
      <span class="load-err">no released decks</span>
    {/if}
  {/snippet}
</CardParityViewer>

<style>
  .load-err {
    color: #ff6b6b;
    font-size: 13px;
  }
</style>
