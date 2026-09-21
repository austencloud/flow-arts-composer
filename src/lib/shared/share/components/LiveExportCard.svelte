<!--
  The Download sheet's card is the real viewer card. Keeping this small adapter
  means the visible artifact and its eventual PNG consume one option snapshot.
-->
<script lang="ts">
  import ChoreoCard from "$lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";
  import type { ResolvedAutoLayout } from "$lib/shared/render/services/container-aware-layout";

  interface Props {
    sequence: SequenceData;
    options: Partial<SequenceExportOptions>;
    onAutoLayoutResolved?: (
      layout: ResolvedAutoLayout | null,
      width: number,
      height: number
    ) => void;
    /** Fires after the visible card has one settled paint. QR preparation is separate. */
    onReady?: () => void;
    /** A prepared QR may be supplied by a deterministic preview/test host. */
    qrUrl?: string;
    /** The host distinguishes a measured Auto winner from a user-pinned layout. */
    automaticLayout?: boolean;
    /** Test and export hosts can hold a measured Auto winner while sizing. */
    autoLayoutOverride?: ResolvedAutoLayout | null;
    /** Current export snapshot identity; retries can reuse decoded cells. */
    revision?: string;
  }

  let {
    sequence,
    options,
    onAutoLayoutResolved,
    onReady,
    qrUrl,
    automaticLayout = false,
    autoLayoutOverride = null,
    revision = "",
  }: Props = $props();

  const visibility = $derived(options.visibilityOverrides);
  const handPathMode = $derived(
    visibility?.handPathMode ?? !!sequence.metadata?.isHandPathVisualization
  );
  // The canvas exporter accepts an explicit loop type even for a sequence that
  // has not persisted its derived LOOP metadata yet. Give the viewer that same
  // resolved identity so its header does not quietly omit the icon strip.
  const presentedSequence = $derived(
    options.loopType && options.loopType !== sequence.loopType
      ? { ...sequence, loopType: options.loopType, isCircular: true }
      : sequence
  );
  // The PNG receives the measured winner as a concrete column count. The live
  // surface must still remain Auto so a resized sheet can measure its own next
  // winner instead of treating that exported total as a user pin.
  const liveColumnCount = $derived(
    automaticLayout || options.columnCount == null
      ? null
      : options.includeStartPlacement !== false &&
          options.startPlacementLayout === "column"
        ? Math.max(1, options.columnCount - 1)
        : options.columnCount
  );
  const layoutKey = $derived(
    `${options.columnCount ?? "auto"}:${options.startPlacementLayout ?? "auto"}`
  );
  let cardIntrinsicWidth = $state(1);
  let cardIntrinsicHeight = $state(1);
  let host = $state<HTMLDivElement>();
  let layoutAvailableWidth = $state(0);
  let layoutAvailableHeight = $state(0);
  let cardMaximumHeight = $state(99999);
  let contentSettled = $state(false);
  let settledLayoutKey = $state("");
  let settledRevision = $state("");

  function announceSettledContent(): void {
    contentSettled = true;
    settledLayoutKey = layoutKey;
    settledRevision = revision;
    onReady?.();
  }

  // A column/start-layout choice can reuse all already-decoded pictographs.
  // Reannounce that settled content after its layout commit so the PNG gate
  // does not wait forever for a cell load that correctly never happens.
  $effect(() => {
    if (
      !contentSettled ||
      (layoutKey === settledLayoutKey && revision === settledRevision)
    )
      return;
    const nextKey = layoutKey;
    const nextRevision = revision;
    let cancelled = false;
    void (async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
      if (!cancelled && layoutKey === nextKey && revision === nextRevision) {
        settledLayoutKey = nextKey;
        settledRevision = nextRevision;
        onReady?.();
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    if (!host) return;
    const stage = host.parentElement;
    if (!stage) return;
    const measure = (): void => {
      const style = getComputedStyle(stage);
      const horizontalInsets =
        Number.parseFloat(style.paddingLeft) +
        Number.parseFloat(style.paddingRight);
      const verticalInsets =
        Number.parseFloat(style.paddingTop) +
        Number.parseFloat(style.paddingBottom) +
        Number.parseFloat(style.borderTopWidth) +
        Number.parseFloat(style.borderBottomWidth);
      const maxHeight = Number.parseFloat(style.maxHeight);
      const cappedContentHeight =
        Number.isFinite(maxHeight) && maxHeight > 0
          ? Math.max(1, maxHeight - verticalInsets)
          : null;
      // Mobile stages have a concrete rendered height rather than a CSS
      // max-height. Feed that exact content cap to the intrinsic wrapper so a
      // tall card scales down as one complete card instead of being cropped.
      cardMaximumHeight = Math.max(
        1,
        Math.round(
          cappedContentHeight ??
            Math.max(1, stage.clientHeight - verticalInsets)
        )
      );
      // The preview's contained card is not an input to Auto. The sheet's
      // resolved max-height is stable; an uncapped sheet uses the viewport
      // until its scroll region supplies a cap.
      layoutAvailableWidth = Math.max(
        1,
        Math.round(stage.clientWidth - horizontalInsets)
      );
      if (automaticLayout) {
        layoutAvailableHeight = Math.max(
          1,
          Math.round(cappedContentHeight ?? window.innerHeight)
        );
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  });

  function handleLayout(
    layout: ResolvedAutoLayout | null,
    width: number,
    height: number
  ): void {
    const nextWidth = Math.round(width);
    const nextHeight = Math.round(height);
    // Contained dimensions scale with the host. Reapplying an equivalent ratio
    // changes that host again, which feeds Auto's ResizeObserver indefinitely.
    if (
      nextWidth > 0 &&
      nextHeight > 0 &&
      Math.abs(
        nextWidth / nextHeight - cardIntrinsicWidth / cardIntrinsicHeight
      ) > 0.0001
    ) {
      cardIntrinsicWidth = nextWidth;
      cardIntrinsicHeight = nextHeight;
    }
    onAutoLayoutResolved?.(layout, width, height);
  }
</script>

<div
  class="live-export-card"
  data-testid="live-export-card"
  style:--live-card-aspect={`${cardIntrinsicWidth} / ${cardIntrinsicHeight}`}
  style:--live-card-aspect-decimal={cardIntrinsicWidth / cardIntrinsicHeight}
  style:--live-export-card-max-height={`${cardMaximumHeight}px`}
  bind:this={host}
>
  <ChoreoCard
    sequence={presentedSequence}
    showWord={options.addWord ?? true}
    showStepNumbers={options.addStepNumbers ?? true}
    showDifficultyLevel={options.addDifficultyLevel ?? true}
    includeStartPlacement={options.includeStartPlacement ?? true}
    showNotes={options.showNotes ?? options.addUserInfo ?? true}
    showLoopGlyph={options.showLoopGlyph ?? true}
    showQRCode={visibility?.showQRCode ?? false}
    {qrUrl}
    showMandala={visibility?.showMandala ?? false}
    {handPathMode}
    darkMode={visibility?.darkMode ?? false}
    customTitleText={options.customName}
    customNotesText={options.customNotesText ?? options.notes}
    leftPropType={options.leftPropTypeOverride ?? visibility?.leftPropType}
    rightPropType={options.rightPropTypeOverride ?? visibility?.rightPropType}
    primaryPropColors={visibility?.primaryPropColors}
    columnCount={liveColumnCount}
    startPlacementLayoutOverride={automaticLayout
      ? null
      : (options.startPlacementLayout ?? null)}
    {autoLayoutOverride}
    {revision}
    layoutAvailableWidth={layoutAvailableWidth || undefined}
    layoutAvailableHeight={automaticLayout ? layoutAvailableHeight : undefined}
    forceContain
    fitWidth
    visibilityOverrides={visibility}
    mandalaPathShape={options.mandalaPathShape}
    exportPresentation
    onAutoLayoutResolved={handleLayout}
    onContentReady={announceSettledContent}
  />
</div>

<style>
  .live-export-card {
    width: min(
      100%,
      calc(
        var(--live-export-card-max-height, 99999px) *
          var(--live-card-aspect-decimal)
      )
    );
    height: auto;
    aspect-ratio: var(--live-card-aspect);
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
</style>
