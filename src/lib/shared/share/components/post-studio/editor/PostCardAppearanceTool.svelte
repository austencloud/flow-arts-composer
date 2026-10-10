<script lang="ts">
  import type { PostCardItem } from "#lib/shared/media-composition/domain/post-project.js";
  import type { SequenceExportOptions } from "#lib/shared/render/domain/models/sequence-export-options.js";
  import type { ExportOptionsStateManager } from "#lib/shared/animation-panel/state/export-options-state.svelte.js";
  import { getImageCompositionManager } from "#lib/shared/share/state/image-composition-state.svelte.js";
  import { getVisibilityStateManager } from "#lib/shared/pictograph/shared/state/visibility-state.svelte.js";
  import ExportImagePanel from "#lib/shared/sequence-viewer/components/ExportImagePanel.svelte";
  import { cardOptionsForItem } from "../post-item-render-options";
  import {
    cardPresentationFromFooterSettings,
    resolveCardFooter,
    type CardPresentation,
  } from "#lib/shared/share/domain/models/card-presentation.js";
  import type { InfoCellChoice } from "#lib/shared/sequence-viewer/services/info-cell-display.js";

  type Appearance = NonNullable<PostCardItem["cardAppearance"]>;
  let {
    item,
    options,
    stepCount,
    locked,
    onchange,
  }: {
    item: PostCardItem;
    options: Partial<SequenceExportOptions> | null;
    stepCount: number;
    locked: boolean;
    onchange: (value: Appearance) => void;
  } = $props();

  const imageDefaults = getImageCompositionManager();
  const visibilityDefaults = getVisibilityStateManager();
  const effective = $derived(cardOptionsForItem(options, item));
  const visible = $derived(effective?.visibilityOverrides);

  function change(patch: Partial<Appearance>): void {
    if (locked) return;
    onchange({ ...item.cardAppearance, ...patch });
  }

  // ExportImagePanel owns the controls. This adapter supplies the same manager
  // methods, but writes to the selected draft card rather than account settings.
  const composition = {
    get addWord() { return effective?.addWord ?? imageDefaults.addWord; },
    get addStepNumbers() { return effective?.addStepNumbers ?? imageDefaults.addStepNumbers; },
    get addDifficultyLevel() { return effective?.addDifficultyLevel ?? imageDefaults.addDifficultyLevel; },
    get includeStartPlacement() { return effective?.includeStartPlacement ?? imageDefaults.includeStartPlacement; },
    get showLoopGlyph() { return effective?.showLoopGlyph ?? imageDefaults.showLoopGlyph; },
    get showNotes() { return effective?.showNotes ?? imageDefaults.showNotes; },
    get customNotesText() { return effective?.customNotesText ?? imageDefaults.customNotesText; },
    get showQRCode() { return visible?.showQRCode ?? imageDefaults.showQRCode; },
    get showMandala() { return visible?.showMandala ?? imageDefaults.showMandala; },
    registerObserver() {},
    unregisterObserver() {},
    setAddWord(value: boolean) { change({ addWord: value }); },
    setAddBeatNumbers(value: boolean) { change({ addStepNumbers: value }); },
    setAddDifficultyLevel(value: boolean) { change({ addDifficultyLevel: value }); },
    setIncludeStartPlacement(value: boolean) { change({ includeStartPlacement: value }); },
    setShowLoopGlyph(value: boolean) { change({ showLoopGlyph: value }); },
    setShowNotes(value: boolean) { change({ showNotes: value }); },
    setCustomNotesText(value: string) { change({ customNotesText: value }); },
    setShowQRCode(value: boolean) { change({ showQRCode: value, infoCellChoice: undefined }); },
    setShowMandala(value: boolean) { change({ showMandala: value, infoCellChoice: undefined }); },
    getColumnCountForStepCount() { return effective?.columnCount ?? null; },
    setColumnCountForStepCount(_count: number, value: number | null) { change({ columnCount: value }); },
    getStartPlacementLayoutForStepCount() { return effective?.startPlacementLayout ?? imageDefaults.getStartPlacementLayoutForStepCount(stepCount); },
    setStartPlacementLayoutForStepCount(_count: number, value: "row" | "column") { change({ startPlacementLayout: value }); },
    getInfoCellChoiceForStepCount(): InfoCellChoice {
      if (item.cardAppearance?.infoCellChoice) return item.cardAppearance.infoCellChoice;
      return (visible?.showQRCode ?? imageDefaults.showQRCode) ? "qr" :
        (visible?.showMandala ?? imageDefaults.showMandala) ? "mandala" : "none";
    },
    setInfoCellChoiceForStepCount(_count: number, value: InfoCellChoice) { change({ infoCellChoice: value }); },
  } as unknown as ReturnType<typeof getImageCompositionManager>;

  const visibility = {
    registerObserver() {},
    unregisterObserver() {},
    getGridVisibility() { return visible?.showGrid ?? visibilityDefaults.getGridVisibility(); },
    getNonRadialVisibility() { return visible?.showNonRadialPoints ?? visibilityDefaults.getNonRadialVisibility(); },
    getRawGlyphVisibility(glyph: string) {
      const key = ({
        tkaGlyph: "showTKA",
        tndGlyph: "showTnD",
        elementalGlyph: "showTnD",
        propTndGlyph: "showPropTnD",
        placementsGlyph: "showPlacements",
        handColorKey: "showHandColorKey",
        reversalIndicators: "showReversals",
      } as const)[glyph as "tkaGlyph"] as keyof NonNullable<SequenceExportOptions["visibilityOverrides"]> | undefined;
      const value = key ? visible?.[key] : undefined;
      return typeof value === "boolean" ? value : visibilityDefaults.getRawGlyphVisibility(glyph);
    },
    setGridVisibility(value: boolean) { change({ showGrid: value }); },
    setNonRadialVisibility(value: boolean) { change({ showNonRadialPoints: value }); },
    setGlyphVisibility(glyph: string, value: boolean) {
      // The viewer changes both TnD glyph channels together. One card setting
      // represents the pair, so the second setter must not create another edit.
      if (glyph === "elementalGlyph") return;
      const key = ({
        tkaGlyph: "showTKA",
        tndGlyph: "showTnD",
        elementalGlyph: "showTnD",
        propTndGlyph: "showPropTnD",
        placementsGlyph: "showPlacements",
        handColorKey: "showHandColorKey",
        reversalIndicators: "showReversals",
      } as const)[glyph as "tkaGlyph"] as keyof Appearance | undefined;
      if (key) change({ [key]: value });
    },
  } as unknown as ReturnType<typeof getVisibilityStateManager>;

  const theme = {
    get imageDarkMode() { return visible?.darkMode ?? imageDefaults.darkMode; },
    setImageDarkMode(value: boolean) { change({ darkMode: value }); },
  } as unknown as ExportOptionsStateManager;

  const footer = $derived<CardPresentation>(cardPresentationFromFooterSettings(
    composition.showNotes,
    composition.customNotesText
  ));
  function changeFooter(value: CardPresentation): void {
    const next = resolveCardFooter(value);
    change({ showNotes: next.show, customNotesText: next.text });
  }
  function changeHeader(value: boolean): void {
    change({ addWord: value, addDifficultyLevel: value, showLoopGlyph: value });
  }
  function changePictograph(value: boolean): void {
    change({ showGrid: value, showTKA: value, showTnD: value,
      showPropTnD: value, showPlacements: value, showHandColorKey: value,
      showNonRadialPoints: value });
  }
</script>

<div class="card-appearance" inert={locked}>
  <ExportImagePanel
    exportOptions={theme}
    imageCompositionOverride={composition}
    visibilityManagerOverride={visibility}
    layout="inline"
    {stepCount}
    cardPresentation={footer}
    onCardPresentationChange={changeFooter}
    onHeaderAllChange={changeHeader}
    onPictographAllChange={changePictograph}
  />
</div>

<style>
  .card-appearance { min-width: 0; }
  .card-appearance :global(.export-panel.inline) { width: 100%; }
</style>
