<!--
  ExportImagePanel.svelte

  The card's settings — what the card SHOWS, not how it leaves. Three layouts,
  one owner:
  - "sidebar": desktop panel beside the card preview, every setting visible.
  - "bottom": mobile ControlDock, the same settings in tabbed trays.
  - "inline": chrome-free body for a host that already has its own frame —
    the share sheet's Customize layer.

  It carries no download button. Delivery of any kind — download, Instagram,
  Facebook, the phone's own sheet — lives behind Share, so there is one door
  out of the viewer and one place to look for it. Austen (2026-08-11): "why do
  we have a download card honestly everything should just be consolidated to be
  behind the share button that way everyone knows what to expect."
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { fade } from "svelte/transition";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import {
    DURATION,
    SLIDE,
    STAGGER,
  } from "$lib/shared/transitions/transitions";
  import { flyFade, motionDuration } from "$lib/shared/transitions/motion";
  import type { ExportOptionsStateManager } from "$lib/shared/animation-panel/state/export-options-state.svelte";
  import { getImageCompositionManager } from "$lib/shared/share/state/image-composition-state.svelte";
  import { getVisibilityStateManager } from "$lib/shared/pictograph/shared/state/visibility-state.svelte";
  import "$lib/shared/animation-panel/bento/rail-tile.css";
  import { columnOptionsFor } from "./bento/columns-stepper";
  import ControlDock, { type ControlDockTab } from "./ControlDock.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import {
    getInfoCellCount,
    type InfoCellChoice,
  } from "../services/info-cell-display";
  import {
    getStepColumnsForLayout,
    type ResolvedAutoLayout,
  } from "$lib/shared/render/services/container-aware-layout";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import CardFooterEditor from "$lib/shared/share/components/CardFooterEditor.svelte";
  import {
    cardPresentationFromFooterSettings,
    resolveCardFooter,
    type CardPresentation,
  } from "$lib/shared/share/domain/models/card-presentation";

  type PanelLayout = "sidebar" | "bottom" | "inline";

  interface Props {
    exportOptions: ExportOptionsStateManager;
    layout?: PanelLayout;
    stepCount: number;
    /** Measured winner from the live card preview. */
    resolvedAutoLayout?: ResolvedAutoLayout | null;
    onClose?: () => void;
    onSettingChange?: (
      group: string,
      setting: string,
      previousValue: string | number | boolean | null,
      value: string | number | boolean | null,
      coalesce?: boolean
    ) => void;
    /** Current sequence/session footer. Omitted means account defaults. */
    cardPresentation?: CardPresentation;
    onCardPresentationChange?: (value: CardPresentation) => void;
    onSaveCardPresentation?: () => void | Promise<void>;
    cardPresentationDirty?: boolean;
    cardPresentationSaving?: boolean;
  }

  let {
    exportOptions,
    layout = "bottom",
    stepCount,
    resolvedAutoLayout = null,
    onClose,
    onSettingChange,
    cardPresentation,
    onCardPresentationChange,
    onSaveCardPresentation,
    cardPresentationDirty = false,
    cardPresentationSaving = false,
  }: Props = $props();

  type AnalyticsValue = string | number | boolean | null;
  function reportSetting(
    setting: string,
    previousValue: AnalyticsValue,
    value: AnalyticsValue
  ): void {
    if (previousValue === value) return;
    onSettingChange?.("card_export", setting, previousValue, value);
  }

  function toggleCompositionSetting(
    setting: string,
    current: boolean,
    setter: (value: boolean) => void
  ): void {
    const next = !current;
    setter(next);
    reportSetting(setting, current, next);
  }

  function togglePictographSetting(
    setting: string,
    current: boolean,
    setter: (value: boolean) => void
  ): void {
    const next = !current;
    setter(next);
    reportSetting(setting, current, next);
  }

  // Include chips read/write the global visibility settings so the Visibility tab,
  // the side-by-side preview, and the download view all stay in sync.
  const imageComposition = getImageCompositionManager();
  let compositionVersion = $state(0);
  function onCompositionChanged(): void {
    compositionVersion++;
  }
  imageComposition.registerObserver(onCompositionChanged);
  onDestroy(() => imageComposition.unregisterObserver(onCompositionChanged));

  const showWord = $derived.by(() => {
    void compositionVersion;
    return imageComposition.addWord;
  });
  const showDifficulty = $derived.by(() => {
    void compositionVersion;
    return imageComposition.addDifficultyLevel;
  });
  const effectiveCardPresentation = $derived.by(() => {
    void compositionVersion;
    return (
      cardPresentation ??
      cardPresentationFromFooterSettings(
        imageComposition.showNotes,
        imageComposition.customNotesText
      )
    );
  });

  function changeCardPresentation(next: CardPresentation): void {
    if (onCardPresentationChange) {
      onCardPresentationChange(next);
      return;
    }

    const previous = effectiveCardPresentation;
    const footer = resolveCardFooter(next);
    imageComposition.setShowNotes(footer.show);
    if (footer.show) imageComposition.setCustomNotesText(footer.text);
    reportSetting(
      "card_footer",
      JSON.stringify(previous),
      JSON.stringify(next)
    );
  }
  const showQRCode = $derived.by(() => {
    void compositionVersion;
    return imageComposition.showQRCode;
  });
  const showMandala = $derived.by(() => {
    void compositionVersion;
    return imageComposition.showMandala;
  });
  const showLoopGlyph = $derived.by(() => {
    void compositionVersion;
    return imageComposition.showLoopGlyph;
  });
  const showStartPos = $derived.by(() => {
    void compositionVersion;
    return imageComposition.includeStartPlacement;
  });

  // null = Auto. In Auto, columns and start placement are one layout decision;
  // numeric columns reveal the manual placement controls below.
  const currentColumnCount = $derived.by<number | null>(() => {
    void compositionVersion;
    return imageComposition.getColumnCountForStepCount(stepCount);
  });

  // Guests can't mint a scannable QR (it needs an account-owned short code), so
  // QR is hidden from this panel entirely for them rather than shown-then-blocked.
  const canQRCode = $derived(authState.isAuthenticated);
  const automaticLayout = $derived.by(() => {
    void compositionVersion;
    return currentColumnCount === null &&
      resolvedAutoLayout?.stepCount === stepCount
      ? resolvedAutoLayout
      : null;
  });
  const startPosLayout = $derived.by(() => {
    void compositionVersion;
    return automaticLayout && automaticLayout.startPlacement !== "none"
      ? automaticLayout.startPlacement
      : imageComposition.getStartPlacementLayoutForStepCount(stepCount);
  });

  // One-spot cards (a single empty info cell) route QR vs Mandala through one
  // explicit chooser; multi-cell cards keep the two independent chips.
  const infoCellCount = $derived.by(() => {
    void compositionVersion;
    return getInfoCellCount({
      stepCount,
      includeStartPlacement: imageComposition.includeStartPlacement,
      startPlacementLayout: startPosLayout,
      columnCount:
        currentColumnCount ??
        (automaticLayout ? getStepColumnsForLayout(automaticLayout) : null),
    });
  });
  const isOneSpot = $derived(infoCellCount === 1);
  // Zero info cells (start position hidden, or a 1-count) means a QR/mandala has
  // nowhere to render — hide the controls entirely rather than offer dead toggles.
  const hasInfoCell = $derived(infoCellCount >= 1);

  // Same auth gate the card renderer uses (ChoreoCard / card-render-options), so
  // the panel and the output agree; with QR gone the freed info cell flows into
  // the mandala fill (resolveInfoCellDisplay forces guest QR off downstream).

  // Text labels (not icons): they read at the same size as the sibling chips in
  // this panel (Word / Level / Grid …) and a tiny QR/asterisk glyph is cryptic.
  // The QR option drops out of the one-spot chooser for guests.
  const infoCellOptions = $derived<{ value: InfoCellChoice; label: string }[]>(
    canQRCode
      ? [
          { value: "qr", label: "QR" },
          { value: "mandala", label: "Mandala" },
          { value: "none", label: "None" },
        ]
      : [
          { value: "mandala", label: "Mandala" },
          { value: "none", label: "None" },
        ]
  );

  const infoCellChoice = $derived.by<InfoCellChoice>(() => {
    void compositionVersion;
    return imageComposition.getInfoCellChoiceForStepCount(stepCount);
  });

  // What the segmented indicator shows: a guest's leftover "qr" choice (QR isn't
  // in their option list) displays as mandala — its render-time degrade — so the
  // indicator lands on a real option instead of nowhere.
  const infoCellDisplayChoice = $derived<InfoCellChoice>(
    infoCellChoice === "qr" && !canQRCode ? "mandala" : infoCellChoice
  );

  // Pictograph visibility - sourced from VisibilityManager so this panel
  // stays in sync with the Visibility tab, context menus, and voice control.
  const vm = getVisibilityStateManager();
  let vmVersion = $state(0);
  function onVmChanged(): void {
    vmVersion++;
  }
  vm.registerObserver(onVmChanged, ["all"]);
  onDestroy(() => vm.unregisterObserver(onVmChanged));

  const showGrid = $derived.by(() => {
    void vmVersion;
    return vm.getGridVisibility();
  });
  const tkaGlyph = $derived.by(() => {
    void vmVersion;
    return vm.getRawGlyphVisibility("tkaGlyph");
  });
  const tndGlyph = $derived.by(() => {
    void vmVersion;
    return vm.getRawGlyphVisibility("tndGlyph");
  });
  const placementsGlyph = $derived.by(() => {
    void vmVersion;
    return vm.getRawGlyphVisibility("placementsGlyph");
  });
  const nonRadial = $derived.by(() => {
    void vmVersion;
    return vm.getNonRadialVisibility();
  });
  const handColorKey = $derived.by(() => {
    void vmVersion;
    return vm.getRawGlyphVisibility("handColorKey");
  });
  const propTndGlyph = $derived.by(() => {
    void vmVersion;
    return vm.getRawGlyphVisibility("propTndGlyph");
  });

  // Master toggles: clicking a section label flips all its children.
  // If any child is on, master is "on" and a click turns everything off;
  // if all are off, a click turns everything on.
  const headerAnyOn = $derived(showWord || showDifficulty || showLoopGlyph);
  const pictographAnyOn = $derived(
    showGrid ||
      tkaGlyph ||
      tndGlyph ||
      propTndGlyph ||
      placementsGlyph ||
      handColorKey ||
      nonRadial
  );

  function toggleHeader(): void {
    const target = !headerAnyOn;
    imageComposition.setAddWord(target);
    imageComposition.setAddDifficultyLevel(target);
    imageComposition.setShowLoopGlyph(target);
    reportSetting("header_all", headerAnyOn, target);
  }

  function togglePictograph(): void {
    const target = !pictographAnyOn;
    vm.setGridVisibility(target);
    vm.setGlyphVisibility("tkaGlyph", target);
    vm.setGlyphVisibility("tndGlyph", target);
    vm.setGlyphVisibility("elementalGlyph", target);
    vm.setGlyphVisibility("propTndGlyph", target);
    vm.setGlyphVisibility("placementsGlyph", target);
    vm.setGlyphVisibility("handColorKey", target);
    vm.setNonRadialVisibility(target);
    reportSetting("pictograph_all", pictographAnyOn, target);
  }

  // TnD and elemental glyphs move together.
  function toggleTnD(): void {
    const next = !tndGlyph;
    vm.setGlyphVisibility("tndGlyph", next);
    vm.setGlyphVisibility("elementalGlyph", next);
    reportSetting("tnd_glyph", tndGlyph, next);
  }

  // Columns options share one source with the mobile stepper (columnOptionsFor):
  // numeric counts capped at the step count, with awkward layouts hidden.
  const columnOptions = $derived<{ label: string; value: number | null }[]>([
    { label: "Auto", value: null },
    ...columnOptionsFor(stepCount).map((v) => ({ label: String(v), value: v })),
  ]);

  // The composition manager is the one owner for columns. It persists a choice
  // per sequence length; a missing choice remains Auto.
  function setColumns(value: number | null, track = true): void {
    const previous = currentColumnCount;
    imageComposition.setColumnCountForStepCount(stepCount, value);
    if (track) reportSetting("columns", previous, value);
  }

  function setInfoCellChoice(value: InfoCellChoice): void {
    const previous = infoCellDisplayChoice;
    imageComposition.setInfoCellChoiceForStepCount(stepCount, value);
    reportSetting("info_cell", previous, value);
  }

  function setStartPlacementLayout(value: "row" | "column"): void {
    const previous = startPosLayout;
    // Choosing a Start direction is an explicit layout decision. If Auto is
    // active, keep its measured step-column count and move only the Start lane.
    if (currentColumnCount === null) {
      const numericOptions = columnOptionsFor(stepCount);
      const squareTarget = Math.sqrt(stepCount);
      const closestCanonical = numericOptions.reduce<number | null>(
        (closest, option) =>
          closest === null ||
          Math.abs(option - squareTarget) < Math.abs(closest - squareTarget)
            ? option
            : closest,
        null
      );
      const manualColumns = automaticLayout
        ? getStepColumnsForLayout(automaticLayout)
        : closestCanonical;
      if (manualColumns !== null) setColumns(manualColumns);
    }
    imageComposition.setStartPlacementLayoutForStepCount(stepCount, value);
    reportSetting("start_position_layout", previous, value);
  }

  function setTheme(darkMode: boolean): void {
    const previous = exportOptions.imageDarkMode;
    exportOptions.setImageDarkMode(darkMode);
    reportSetting(
      "theme",
      previous ? "dark" : "light",
      darkMode ? "dark" : "light"
    );
  }

  // If the current selection exceeds the step count (e.g. user switched
  // to a shorter sequence), reset to Auto.
  $effect(() => {
    if (currentColumnCount !== null && currentColumnCount > stepCount) {
      setColumns(null, false);
    }
  });

  // Columns + Theme are two buttons each — a whole tab apiece wasted the tray.
  // Folded into one "Format" tab (two labeled rows), so every tab now holds a
  // meaningful group instead of a lone pair.
  const DISPLAY_TABS: ControlDockTab[] = [
    { id: "labels", label: "Labels", icon: "fa-font" },
    { id: "pictograph", label: "Pictograph", icon: "fa-shapes" },
    { id: "format", label: "Format", icon: "fa-sliders" },
  ];
  let activeTab = $state<string | null>(null);

  function selectDisplayTab(id: string): void {
    const previous = activeTab;
    activeTab = previous === id ? null : id;
    reportSetting(
      "mobile_section",
      previous ?? "closed",
      activeTab ?? "closed"
    );
  }
</script>

{#if layout === "bottom"}
  <!-- ============================================================
       MOBILE: ControlDock. Card preview stays the hero. Display
       controls collapse into Content / Columns / Theme tabs with a
       compact Share/Download trailing trigger.
       ============================================================ -->
  <ControlDock tabs={DISPLAY_TABS} {activeTab} onTabSelect={selectDisplayTab}>
    {#snippet tray()}
      <!-- Cross-dissolve the tab bodies (true 4-state swap in one box) so
           switching tabs doesn't hard-cut. Height between the differing bodies
           is tweened by ControlDock's .tray-anim wrapper; this handles the
           content. Chips are cheap, so the {#key} remount is fine. -->
      <Crossfade key={activeTab} duration={DURATION.normal}>
        <div class="dock-dense">
          {#if activeTab === "labels"}
            <div class="field">
              <span class="field-label">Header</span>
              <div class="rt-chip-row">
                <button
                  type="button"
                  class="rt-chip"
                  aria-pressed={showWord}
                  onclick={() =>
                    toggleCompositionSetting(
                      "word",
                      showWord,
                      imageComposition.setAddWord.bind(imageComposition)
                    )}>Word</button
                >
                <button
                  type="button"
                  class="rt-chip"
                  aria-pressed={showDifficulty}
                  onclick={() =>
                    toggleCompositionSetting(
                      "difficulty",
                      showDifficulty,
                      imageComposition.setAddDifficultyLevel.bind(
                        imageComposition
                      )
                    )}>Level</button
                >
                <button
                  type="button"
                  class="rt-chip"
                  aria-pressed={showLoopGlyph}
                  onclick={() =>
                    toggleCompositionSetting(
                      "loop_glyph",
                      showLoopGlyph,
                      imageComposition.setShowLoopGlyph.bind(imageComposition)
                    )}>LOOP</button
                >
              </div>
            </div>
            <div class="footer-editor-field">
              <CardFooterEditor
                value={effectiveCardPresentation}
                onchange={changeCardPresentation}
                description="Appears inside the card image."
                onSave={onSaveCardPresentation}
                dirty={cardPresentationDirty}
                saving={cardPresentationSaving}
                idBase="inline-card-footer"
              />
            </div>
          {:else if activeTab === "pictograph"}
            <div class="field">
              <span class="field-label">Glyphs</span>
              <div class="rt-chip-row">
                <button
                  type="button"
                  class="rt-chip"
                  aria-pressed={showGrid}
                  onclick={() =>
                    togglePictographSetting(
                      "grid",
                      showGrid,
                      vm.setGridVisibility.bind(vm)
                    )}>Grid</button
                >
                <button
                  type="button"
                  class="rt-chip"
                  aria-pressed={tkaGlyph}
                  onclick={() =>
                    togglePictographSetting("tka_glyph", tkaGlyph, (value) =>
                      vm.setGlyphVisibility("tkaGlyph", value)
                    )}>TKA</button
                >
                <button
                  type="button"
                  class="rt-chip"
                  aria-pressed={tndGlyph}
                  onclick={toggleTnD}>TnD</button
                >
                <button
                  type="button"
                  class="rt-chip"
                  aria-pressed={propTndGlyph}
                  onclick={() =>
                    togglePictographSetting(
                      "prop_tnd_glyph",
                      propTndGlyph,
                      (value) => vm.setGlyphVisibility("propTndGlyph", value)
                    )}>Prop TnD</button
                >
                <button
                  type="button"
                  class="rt-chip"
                  aria-pressed={placementsGlyph}
                  onclick={() =>
                    togglePictographSetting(
                      "positions_glyph",
                      placementsGlyph,
                      (value) => vm.setGlyphVisibility("placementsGlyph", value)
                    )}>Placements</button
                >
                <button
                  type="button"
                  class="rt-chip"
                  aria-pressed={handColorKey}
                  onclick={() =>
                    togglePictographSetting(
                      "hand_color_key",
                      handColorKey,
                      (value) => vm.setGlyphVisibility("handColorKey", value)
                    )}>Hand key</button
                >
                <button
                  type="button"
                  class="rt-chip"
                  aria-pressed={nonRadial}
                  onclick={() =>
                    togglePictographSetting(
                      "non_radial",
                      nonRadial,
                      vm.setNonRadialVisibility.bind(vm)
                    )}>Non-radial</button
                >
              </div>
            </div>
            {#if hasInfoCell}
              <div class="field">
                <span class="field-label">Info</span>
                <div class="rt-chip-row">
                  {#if isOneSpot}
                    <div class="seg-fill">
                      <SegmentedControl
                        options={infoCellOptions}
                        value={infoCellDisplayChoice}
                        onchange={setInfoCellChoice}
                        color="accent"
                        size="sm"
                      />
                    </div>
                  {:else}
                    {#if canQRCode}
                      <button
                        type="button"
                        class="rt-chip"
                        aria-pressed={showQRCode}
                        onclick={() =>
                          toggleCompositionSetting(
                            "qr_code",
                            showQRCode,
                            imageComposition.setShowQRCode.bind(
                              imageComposition
                            )
                          )}
                        ><i class="fas fa-qrcode" aria-hidden="true"></i> QR</button
                      >
                    {/if}
                    <button
                      type="button"
                      class="rt-chip"
                      aria-pressed={showMandala}
                      onclick={() =>
                        toggleCompositionSetting(
                          "mandala",
                          showMandala,
                          imageComposition.setShowMandala.bind(imageComposition)
                        )}
                      ><i class="fas fa-asterisk" aria-hidden="true"></i> Mandala</button
                    >
                  {/if}
                </div>
              </div>
            {/if}
            {#if hasInfoCell && canQRCode}
              <p class="qr-scope-note">QR codes appear on opened cards and exports. Gallery thumbnails stay QR-free.</p>
            {/if}
            <!-- Start position is its own group: the Show toggle plus (when on) the
               single-select layout. Kept apart from the Info-cell chooser so the
               segmented control never sits next to loose chips (label mirrors the
               desktop sidebar: "Start" label + "Show" chip). -->
            <div class="field">
              <span class="field-label">Start</span>
              <div class="rt-chip-row">
                <button
                  type="button"
                  class="rt-chip"
                  aria-pressed={showStartPos}
                  onclick={() =>
                    toggleCompositionSetting(
                      "start_position",
                      showStartPos,
                      imageComposition.setIncludeStartPlacement.bind(
                        imageComposition
                      )
                    )}>Show</button
                >
                {#if showStartPos}
                  <button
                    type="button"
                    class="rt-chip"
                    transition:fade={{ duration: 150 }}
                    aria-pressed={startPosLayout === "row"}
                    onclick={() => setStartPlacementLayout("row")}
                    >Top Row</button
                  >
                  <button
                    type="button"
                    class="rt-chip"
                    transition:fade={{ duration: 150 }}
                    aria-pressed={startPosLayout === "column"}
                    onclick={() => setStartPlacementLayout("column")}
                    >Left Column</button
                  >
                {/if}
              </div>
            </div>
          {:else if activeTab === "format"}
            <div class="field">
              <span class="field-label">Columns</span>
              <div class="rt-chip-row">
                {#each columnOptions as option}
                  <button
                    type="button"
                    class="rt-chip"
                    aria-pressed={currentColumnCount === option.value}
                    aria-label={option.value === null
                      ? "Auto columns and start placement"
                      : `${option.label} columns`}
                    title={option.value === null
                      ? "Chooses columns and start placement"
                      : undefined}
                    onclick={() => setColumns(option.value)}
                    >{option.label}</button
                  >
                {/each}
              </div>
            </div>
            <div class="field">
              <span class="field-label">Theme</span>
              <div class="rt-chip-row">
                <button
                  type="button"
                  class="rt-chip"
                  aria-pressed={!exportOptions.imageDarkMode}
                  onclick={() => setTheme(false)}
                  ><i class="fas fa-sun" aria-hidden="true"></i> Light</button
                >
                <button
                  type="button"
                  class="rt-chip"
                  aria-pressed={exportOptions.imageDarkMode}
                  onclick={() => setTheme(true)}
                  ><i class="fas fa-moon" aria-hidden="true"></i> Dark</button
                >
              </div>
            </div>
          {/if}
        </div>
      </Crossfade>
    {/snippet}
  </ControlDock>
{:else}
  <!-- ============================================================
       DESKTOP SIDEBAR: All settings visible.
       INLINE: the same rows with the panel chrome off, for a host that
       brings its own frame (the share sheet's Customize layer).
       ============================================================ -->
  <div
    class="export-panel"
    class:inline={layout === "inline"}
    in:flyFade={{
      duration: DURATION.normal,
      delay: motionDuration(STAGGER.relaxed),
      x: SLIDE.sm,
      y: 0,
    }}
    out:flyFade={{ duration: DURATION.fast, x: SLIDE.sm, y: 0 }}
    role="region"
    aria-label="Card settings"
  >
    <div class="panel-center-inner">
      {#if onClose}
        <div class="panel-header">
          <span class="panel-title">Card settings</span>
          <button
            type="button"
            class="close-btn"
            onclick={onClose}
            aria-label="Close card settings"
          >
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </div>
      {/if}

      <div class="panel-body">
        <!-- Header section -->
        <div class="setting-row">
          <button
            type="button"
            class="setting-label section-toggle"
            class:on={headerAnyOn}
            onclick={toggleHeader}
            aria-pressed={headerAnyOn}
            aria-label={headerAnyOn
              ? "Hide all header elements"
              : "Show all header elements"}>Header</button
          >
          <div class="chip-group">
            <button
              type="button"
              class="chip"
              class:active={showWord}
              onclick={() =>
                toggleCompositionSetting(
                  "word",
                  showWord,
                  imageComposition.setAddWord.bind(imageComposition)
                )}
              aria-pressed={showWord}>Word</button
            >
            <button
              type="button"
              class="chip"
              class:active={showDifficulty}
              onclick={() =>
                toggleCompositionSetting(
                  "difficulty",
                  showDifficulty,
                  imageComposition.setAddDifficultyLevel.bind(imageComposition)
                )}
              aria-pressed={showDifficulty}>Level</button
            >
            <button
              type="button"
              class="chip"
              class:active={showLoopGlyph}
              onclick={() =>
                toggleCompositionSetting(
                  "loop_glyph",
                  showLoopGlyph,
                  imageComposition.setShowLoopGlyph.bind(imageComposition)
                )}
              aria-pressed={showLoopGlyph}>LOOP</button
            >
          </div>
        </div>

        <div class="footer-editor-field">
          <CardFooterEditor
            value={effectiveCardPresentation}
            onchange={changeCardPresentation}
            description="Appears inside the card image."
            onSave={onSaveCardPresentation}
            dirty={cardPresentationDirty}
            saving={cardPresentationSaving}
            idBase="card-footer"
          />
        </div>

        <!-- Pictograph section -->
        <div class="setting-row">
          <button
            type="button"
            class="setting-label section-toggle"
            class:on={pictographAnyOn}
            onclick={togglePictograph}
            aria-pressed={pictographAnyOn}
            aria-label={pictographAnyOn
              ? "Hide all pictograph elements"
              : "Show all pictograph elements"}>Pictograph</button
          >
          <div class="chip-group">
            <button
              type="button"
              class="chip"
              class:active={showGrid}
              onclick={() =>
                togglePictographSetting(
                  "grid",
                  showGrid,
                  vm.setGridVisibility.bind(vm)
                )}
              aria-pressed={showGrid}>Grid</button
            >
            <button
              type="button"
              class="chip"
              class:active={tkaGlyph}
              onclick={() =>
                togglePictographSetting("tka_glyph", tkaGlyph, (value) =>
                  vm.setGlyphVisibility("tkaGlyph", value)
                )}
              aria-pressed={tkaGlyph}>TKA</button
            >
            <button
              type="button"
              class="chip"
              class:active={tndGlyph}
              onclick={toggleTnD}
              aria-pressed={tndGlyph}>TnD</button
            >
            <button
              type="button"
              class="chip"
              class:active={propTndGlyph}
              onclick={() =>
                togglePictographSetting(
                  "prop_tnd_glyph",
                  propTndGlyph,
                  (value) => vm.setGlyphVisibility("propTndGlyph", value)
                )}
              aria-pressed={propTndGlyph}>Prop TnD</button
            >
            <button
              type="button"
              class="chip"
              class:active={placementsGlyph}
              onclick={() =>
                togglePictographSetting(
                  "positions_glyph",
                  placementsGlyph,
                  (value) => vm.setGlyphVisibility("placementsGlyph", value)
                )}
              aria-pressed={placementsGlyph}>Placements</button
            >
            <button
              type="button"
              class="chip"
              class:active={handColorKey}
              onclick={() =>
                togglePictographSetting(
                  "hand_color_key",
                  handColorKey,
                  (value) => vm.setGlyphVisibility("handColorKey", value)
                )}
              aria-pressed={handColorKey}>Hand key</button
            >
            <button
              type="button"
              class="chip"
              class:active={nonRadial}
              onclick={() =>
                togglePictographSetting(
                  "non_radial",
                  nonRadial,
                  vm.setNonRadialVisibility.bind(vm)
                )}
              aria-pressed={nonRadial}>Non-radial</button
            >
          </div>
        </div>

        {#if hasInfoCell}
          {#if isOneSpot}
            <!-- One info cell: QR and Mandala compete for it -> single chooser. -->
            <div class="setting-row">
              <span class="setting-label">Info Cell</span>
              <div class="chip-group seg-fill">
                <SegmentedControl
                  options={infoCellOptions}
                  value={infoCellDisplayChoice}
                  onchange={setInfoCellChoice}
                  color="accent"
                  size="sm"
                />
              </div>
            </div>
          {:else}
            <!-- QR code (standalone - it's a grid cell, not a banner). Signed-in
             only: guests can't mint a scannable QR, so the row is hidden. -->
            {#if canQRCode}
              <div class="setting-row">
                <span class="setting-label">QR</span>
                <div class="chip-group">
                  <button
                    type="button"
                    class="chip"
                    class:active={showQRCode}
                    onclick={() =>
                      toggleCompositionSetting(
                        "qr_code",
                        showQRCode,
                        imageComposition.setShowQRCode.bind(imageComposition)
                      )}
                    aria-pressed={showQRCode}>QR Code</button
                  >
                </div>
              </div>
            {/if}

            <!-- Mandala fill (blue/red path visualization in empty col-0 cells) -->
            <div class="setting-row">
              <span class="setting-label">Mandala</span>
              <div class="chip-group">
                <button
                  type="button"
                  class="chip"
                  class:active={showMandala}
                  onclick={() =>
                    toggleCompositionSetting(
                      "mandala",
                      showMandala,
                      imageComposition.setShowMandala.bind(imageComposition)
                    )}
                  aria-pressed={showMandala}>Mandala</button
                >
              </div>
            </div>
          {/if}
        {/if}

        {#if hasInfoCell && canQRCode}
          <p class="qr-scope-note">QR codes appear on opened cards and exports. Gallery thumbnails stay QR-free.</p>
        {/if}

        <div class="setting-row">
          <span class="setting-label">Start</span>
          <div class="chip-group">
            <button
              type="button"
              class="chip"
              class:active={showStartPos}
              onclick={() =>
                toggleCompositionSetting(
                  "start_position",
                  showStartPos,
                  imageComposition.setIncludeStartPlacement.bind(
                    imageComposition
                  )
                )}
              aria-pressed={showStartPos}>Show</button
            >
            {#if showStartPos}
              <button
                type="button"
                class="chip"
                class:active={startPosLayout === "row"}
                onclick={() => setStartPlacementLayout("row")}
                aria-pressed={startPosLayout === "row"}>Top Row</button
              >
              <button
                type="button"
                class="chip"
                class:active={startPosLayout === "column"}
                onclick={() => setStartPlacementLayout("column")}
                aria-pressed={startPosLayout === "column"}>Left Column</button
              >
            {/if}
          </div>
        </div>

        <div class="setting-row">
          <span class="setting-label">Columns</span>
          <div class="chip-group">
            {#each columnOptions as option}
              <button
                type="button"
                class="chip"
                class:active={currentColumnCount === option.value}
                onclick={() => setColumns(option.value)}
                aria-pressed={currentColumnCount === option.value}
                aria-label={option.value === null
                  ? "Auto columns and start placement"
                  : `${option.label} columns`}
                title={option.value === null
                  ? "Chooses columns and start placement"
                  : undefined}>{option.label}</button
              >
            {/each}
          </div>
        </div>

        <div class="setting-row">
          <span class="setting-label">Theme</span>
          <div class="chip-group">
            <button
              type="button"
              class="chip"
              class:active={!exportOptions.imageDarkMode}
              onclick={() => setTheme(false)}
              aria-pressed={!exportOptions.imageDarkMode}
            >
              <i class="fas fa-sun" aria-hidden="true"></i> Light
            </button>
            <button
              type="button"
              class="chip"
              class:active={exportOptions.imageDarkMode}
              onclick={() => setTheme(true)}
              aria-pressed={exportOptions.imageDarkMode}
            >
              <i class="fas fa-moon" aria-hidden="true"></i> Dark
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Mobile dock tray density (mirrors AnimationPanel .dock-dense).
     Tight vertical rhythm on purpose — every px the tray gives up goes to the
     card/media hero above it. Touch targets stay at 44px (the chips); only
     gaps, the segmented frame, and the handle shrink. */
  .dock-dense {
    display: flex;
    flex-direction: column;
    gap: 6px;
    container-type: inline-size;
    /* One accent for the whole tray: retint the Info SegmentedControl's
       indicator (it reads var(--theme-accent), the dynamic cyan) to the same
       fixed blue the rt-chips use for their active state (--rail-accent in
       rail-tile.css). Chips read --rail-accent directly, so this override only
       touches the segmented — no other tray control uses --theme-accent. */
    --theme-accent: #4a9eff;
  }
  /* Info segmented sits flush like a chip: drop the inset track frame so its
     height matches the 44px chips instead of towering ~7px over them (44px
     touch target + 3px track pad + 1px border was ~51px). */
  /* Info segmented matches the compact-pill chips: a 34px visible track +
     indicator (drawn inset 5px, same frame as .rt-chip::before) over 44px-tap
     segments, so it sits at the chips' visual height on the Pictograph tab
     instead of towering over them. */
  .dock-dense :global(.segmented-control.sm) {
    padding: 0;
    background: transparent;
    border: none;
    position: relative;
  }
  .dock-dense :global(.segmented-control.sm)::before {
    content: "";
    position: absolute;
    inset: 5px 0;
    border-radius: 9px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    z-index: 0;
    pointer-events: none;
  }
  .dock-dense :global(.segmented-control.sm .indicator) {
    top: 5px;
    bottom: 5px;
    border-radius: 9px;
    z-index: 1;
  }
  .dock-dense :global(.segmented-control.sm .segment) {
    z-index: 2;
  }
  /* Inline label-left rows: each section is one row, not a label line + chips line. */
  .dock-dense .field {
    display: grid;
    grid-template-columns: 58px 1fr;
    /* start (not center): when chips wrap to a 2nd row the label stays with row 1
       instead of floating in the block's vertical middle. */
    align-items: start;
    gap: 10px;
  }
  .dock-dense .field-label {
    /* Own a 44px box (chip row height) and center the text in it, so the label
       sits on the same optical line as the first chip row — no magic offset. */
    display: flex;
    align-items: center;
    min-height: 44px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
  }
  .dock-dense :global(.rt-chip-row) {
    gap: 6px;
    flex-wrap: wrap;
    justify-content: center;
    container-type: inline-size;
  }
  /* Rows hold anywhere from one to eight choices. Crowded rows grow to use the
     tray; sparse rows stop at a readable width and stay centered instead of
     turning into full-width slabs. Whole controls wrap when labels need room. */
  /* Compact-pill: the <button> keeps a full 44px tap box (the mandatory touch
     floor), but its visible pill is a ::before inset 5px top/bottom — 34px tall.
     So the chips READ smaller without shrinking the tap target or the row
     height. The base rt-chip's own bg/border is moved off the button onto the
     pseudo pill; hover/active/focus are re-mapped to it. */
  .dock-dense :global(.rt-chip) {
    position: relative;
    flex: 1 1 clamp(80px, 16cqw, 104px);
    min-width: max-content;
    max-width: clamp(112px, 24cqw, 168px);
    min-height: 44px;
    padding: 0 12px;
    background: transparent;
    border-color: transparent;
    white-space: nowrap;
    z-index: 0;
  }
  /* On the narrowest drawers, reclaim the label column. This keeps the
     three-choice rows on one line and limits five-choice rows to two lines. */
  @container (max-width: 340px) {
    .dock-dense .field {
      grid-template-columns: 1fr;
      gap: 0;
    }
    .dock-dense .field-label {
      min-height: 24px;
    }
  }
  .dock-dense :global(.rt-chip:hover) {
    background: transparent;
    border-color: transparent;
  }
  .dock-dense :global(.rt-chip)::before {
    content: "";
    position: absolute;
    inset: 5px 0;
    border-radius: 9px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    z-index: -1;
    transition:
      background 150ms ease,
      border-color 150ms ease,
      box-shadow 150ms ease;
  }
  .dock-dense :global(.rt-chip[aria-pressed="true"])::before {
    background: color-mix(
      in srgb,
      var(--rail-accent, #4a9eff) 22%,
      rgba(20, 22, 32, 0.6)
    );
    border-color: color-mix(
      in srgb,
      var(--rail-accent, #4a9eff) 55%,
      transparent
    );
  }
  @media (hover: hover) {
    .dock-dense :global(.rt-chip:hover:not([aria-pressed="true"]))::before {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
      border-color: var(--theme-stroke, rgba(255, 255, 255, 0.18));
    }
  }
  /* Focus ring hugs the visible pill (via box-shadow on ::before), not the
     invisible 44px button box. */
  .dock-dense :global(.rt-chip:focus-visible) {
    outline: none;
  }
  .dock-dense :global(.rt-chip:focus-visible)::before {
    box-shadow: 0 0 0 2px var(--rail-accent, #4a9eff);
  }
  @media (prefers-reduced-motion: reduce) {
    .dock-dense :global(.rt-chip)::before {
      transition: none;
    }
  }

  /* ============================================================
   * DESKTOP SIDEBAR (unchanged)
   * ============================================================ */

  .export-panel {
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    display: flex;
    flex-direction: column;
    z-index: 10;
    flex-shrink: 0;
    height: 100%;
    min-height: 0;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    overflow-y: auto;
  }

  /* Inline: same rows, no panel. The host frame (the share sheet) owns the
     surface, the scrolling and the padding, so the panel drops its background,
     its full-height stretch and its own gutters rather than nesting a second
     card inside one. */
  .export-panel.inline {
    background: none;
    border-top: none;
    height: auto;
    overflow: visible;
  }
  .export-panel.inline .panel-body {
    padding: 0;
  }

  /* Vertically center the settings group within the tall panel.
     auto block margins collapse to 0 when content overflows, so it
     still scrolls from the top — no clipping on long content. */
  .panel-center-inner {
    margin: auto 0;
    width: 100%;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px 0;
    flex-shrink: 0;
  }

  .panel-title {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, white);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: 14px;
    cursor: pointer;
    transition: all 0.15s ease;
    -webkit-tap-highlight-color: transparent;
  }

  .close-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    color: var(--theme-text, white);
  }

  .close-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  /* ============================================================
   * SHARED: Settings rows and chips
   * ============================================================ */

  .panel-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 12px 16px;
    overflow-y: auto;
  }

  .setting-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .footer-editor-field {
    width: 100%;
    box-sizing: border-box;
    padding: 12px;
    border: 1px solid var(--theme-stroke);
    border-radius: 10px;
    background: var(--theme-card-bg);
  }

  .qr-scope-note {
    margin: 0;
    color: var(--theme-text-secondary);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.5;
  }

  .setting-label {
    min-width: 72px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.05em;
    flex-shrink: 0;
  }

  /* A setting-label that doubles as a master toggle for its section.
   * Dim when the section is all-off; accent tint when any child is on. */
  button.setting-label.section-toggle {
    appearance: none;
    background: transparent;
    border: none;
    padding: 4px 0;
    text-align: left;
    font-family: inherit;
    cursor: pointer;
    transition: color 0.15s ease;
    -webkit-tap-highlight-color: transparent;
  }

  button.setting-label.section-toggle:hover {
    color: var(--theme-text, rgba(255, 255, 255, 0.9));
  }

  button.setting-label.section-toggle.on {
    color: var(--theme-accent, #6366f1);
  }

  button.setting-label.section-toggle:focus-visible {
    outline: 2px solid
      color-mix(in srgb, var(--theme-accent, #6366f1) 50%, transparent);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .chip-group {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  /* SegmentedControl is width:100%; give it room to fill next to the label. */
  .seg-fill {
    flex: 1 1 auto;
    min-width: 0;
  }
  .dock-dense .seg-fill {
    flex: 1 1 160px;
  }

  .chip {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 40px;
    min-width: 40px;
    padding: 6px 14px;
    background: color-mix(in srgb, var(--theme-card-bg) 70%, transparent);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    -webkit-tap-highlight-color: transparent;
  }

  .chip:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    color: var(--theme-text, white);
  }

  .chip:active {
    transform: scale(0.92);
    transition-duration: 50ms;
  }

  .chip.active {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 35%,
      var(--theme-card-bg, rgba(0, 0, 0, 0.4))
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 60%,
      transparent
    );
    color: white;
    box-shadow: 0 2px 8px
      color-mix(in srgb, var(--theme-accent, #6366f1) 25%, transparent);
  }

  .chip:focus-visible {
    outline: 2px solid
      color-mix(in srgb, var(--theme-accent, #6366f1) 50%, transparent);
    outline-offset: 2px;
  }

  .chip i {
    font-size: 12px;
  }

  @media (prefers-reduced-motion: reduce) {
    .chip {
      transition: none !important;
      animation: none !important;
    }

    .chip:active {
      transform: none !important;
    }
  }
</style>
