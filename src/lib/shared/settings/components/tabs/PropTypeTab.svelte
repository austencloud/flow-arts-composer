<!--
  PropTypeTab.svelte - Prop Type Selection

  Clean rewrite with:
  - 10 preset slots in 5x2 grid
  - Simple media query for desktop side-by-side layout
  - Inline prop grid on desktop (700px+)
  - Keyboard shortcuts (1-9, 0) for presets
-->
<script lang="ts">
  import { getDeviceDetector } from "$lib/shared/device/get-device-detector";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { AppSettings, PropPreset } from "../../domain/app-settings";
  import { PropType } from "../../../pictograph/prop/domain/enums/prop-type";
  import { toggleBigVariant } from "../../../pictograph/prop/domain/prop-type-display-registry";
  import type { HapticFeedback } from "../../../application/services/haptic-feedback";
  import type { DeviceDetector } from '$lib/shared/device/services/device-detector'
  import { onMount, onDestroy } from "svelte";
  // PropTypeRegistry imports removed - variations now visible in Bento grid
  import CatDogToggle from "./prop-type/CatDogToggle.svelte";
  import PresetChipBar from "./prop-type/PresetChipBar.svelte";
  import CompactPropDisplay from "./prop-type/CompactPropDisplay.svelte";
  import PrimaryPropColorSettings from "./prop-type/PrimaryPropColorSettings.svelte";
  import type {
    ChiralityHand,
    PropChiralityHandState,
    PropChiralitySeam,
  } from "./prop-type/prop-chirality-seam";
  import BentoPropGrid from "./prop-type/BentoPropGrid.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";

  const PRESET_COUNT = 10;

  // Default presets for reset functionality
  const DEFAULT_PRESETS: PropPreset[] = [
    { leftPropType: PropType.STAFF, rightPropType: PropType.STAFF, catDogMode: false },
    { leftPropType: PropType.CLUB, rightPropType: PropType.CLUB, catDogMode: false },
    { leftPropType: PropType.FAN, rightPropType: PropType.FAN, catDogMode: false },
    { leftPropType: PropType.BUUGENG, rightPropType: PropType.BUUGENG, catDogMode: false },
    { leftPropType: PropType.TRIAD, rightPropType: PropType.TRIAD, catDogMode: false },
    { leftPropType: PropType.MINIHOOP, rightPropType: PropType.MINIHOOP, catDogMode: false },
    { leftPropType: PropType.EIGHTRINGS, rightPropType: PropType.EIGHTRINGS, catDogMode: false },
    { leftPropType: PropType.DOUBLESTAR, rightPropType: PropType.DOUBLESTAR, catDogMode: false },
    { leftPropType: PropType.SWORD, rightPropType: PropType.SWORD, catDogMode: false },
    { leftPropType: PropType.QUIAD, rightPropType: PropType.QUIAD, catDogMode: false },
  ];

  let { settings, onUpdate } = $props<{
    settings: AppSettings;
    onUpdate?: (event: { key: string; value: unknown }) => void;
  }>();



  // Services
  let hapticService: HapticFeedback;
  let deviceDetector: DeviceDetector | null = null;

  // Device detection
  let hasKeyboard = $state(false);

  // Current selections
  let selectedLeftPropType = $state(PropType.STAFF);
  let selectedRightPropType = $state(PropType.STAFF);

  // CatDog Mode
  let catDogMode = $state(false);
  let rememberedRightProp = $state<PropType | null>(null);

  // Which hand the inline grid edits in cat/dog mode on narrow screens
  // (desktop shows both grids side-by-side, so no tab needed there).
  let mobileHand = $state<ChiralityHand>("left");

  // Narrow viewport → stack a single tabbed grid instead of dual side-by-side.
  // Matches the 900px breakpoint the layout switches at.
  let isNarrow = $state(false);

  // Preset state
  let propPresets = $state<(PropPreset | null)[]>([]);
  let selectedPresetIndex = $state(-1);

  // Buugeng flip state
  let leftBuugengFlipped = $state(false);
  let rightBuugengFlipped = $state(false);

  onMount(() => {
    hapticService = getHapticFeedback();
    deviceDetector = getDeviceDetector();

    updateDeviceCapabilities();
    const cleanup = deviceDetector?.onCapabilitiesChanged(() => {
      updateDeviceCapabilities();
    });

    window.addEventListener("keydown", handleKeydown);

    const narrowQuery = window.matchMedia("(max-width: 899px)");
    isNarrow = narrowQuery.matches;
    const onNarrowChange = (e: MediaQueryListEvent) => (isNarrow = e.matches);
    narrowQuery.addEventListener("change", onNarrowChange);

    return () => {
      cleanup?.();
      window.removeEventListener("keydown", handleKeydown);
      narrowQuery.removeEventListener("change", onNarrowChange);
    };
  });

  onDestroy(() => {
    window.removeEventListener("keydown", handleKeydown);
  });

  function updateDeviceCapabilities() {
    if (!deviceDetector) return;
    const caps = deviceDetector.getCapabilities();
    hasKeyboard = caps.hasKeyboard ?? false;
  }

  // Sync from settings
  $effect(() => {
    selectedLeftPropType =
      settings.leftPropType || settings.propType || PropType.STAFF;
    selectedRightPropType =
      settings.rightPropType || settings.propType || PropType.STAFF;
    catDogMode = settings.catDogMode ?? false;
    leftBuugengFlipped = settings.leftBuugengFlipped ?? false;
    rightBuugengFlipped = settings.rightBuugengFlipped ?? false;

    const existingPresets = settings.propPresets || [];
    propPresets = Array.from(
      { length: PRESET_COUNT },
      (_, i) => existingPresets[i] || null
    );
    selectedPresetIndex = settings.selectedPresetIndex ?? -1;
  });

  // Keyboard shortcuts
  function handleKeydown(e: KeyboardEvent) {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    const key = e.key;
    let presetIndex = -1;

    if (key >= "1" && key <= "9") {
      presetIndex = parseInt(key, 10) - 1;
    } else if (key === "0") {
      presetIndex = 9;
    }

    if (presetIndex >= 0 && presetIndex < PRESET_COUNT) {
      e.preventDefault();
      const preset = propPresets[presetIndex];
      if (preset) {
        handleSelectPreset(presetIndex);
      } else {
        handleSaveToSlot(presetIndex);
      }
    }
  }

  // Preset management
  function handleSelectPreset(index: number) {
    hapticService?.trigger("selection");

    const preset = propPresets[index];
    if (!preset) return;

    selectedPresetIndex = index;
    selectedLeftPropType = preset.leftPropType;
    selectedRightPropType = preset.rightPropType;
    catDogMode = preset.catDogMode;
    leftBuugengFlipped = preset.leftBuugengFlipped ?? false;
    rightBuugengFlipped = preset.rightBuugengFlipped ?? false;

    onUpdate?.({ key: "selectedPresetIndex", value: index });
    onUpdate?.({ key: "leftPropType", value: preset.leftPropType });
    onUpdate?.({ key: "rightPropType", value: preset.rightPropType });
    onUpdate?.({ key: "catDogMode", value: preset.catDogMode });
    onUpdate?.({ key: "leftBuugengFlipped", value: leftBuugengFlipped });
    onUpdate?.({ key: "rightBuugengFlipped", value: rightBuugengFlipped });
  }

  function handleSaveToSlot(index: number) {
    hapticService?.trigger("selection");

    const newPreset: PropPreset = {
      leftPropType: selectedLeftPropType,
      rightPropType: selectedRightPropType,
      catDogMode,
      leftBuugengFlipped,
      rightBuugengFlipped,
    };

    const newPresets = [...propPresets];
    newPresets[index] = newPreset;
    propPresets = newPresets;
    selectedPresetIndex = index;

    // Store full array with nulls to preserve slot indices
    onUpdate?.({ key: "propPresets", value: newPresets });
    onUpdate?.({ key: "selectedPresetIndex", value: index });
  }

  function handleClearSlot(index: number) {
    hapticService?.trigger("selection");

    const newPresets = [...propPresets];
    newPresets[index] = null;
    propPresets = newPresets;

    if (selectedPresetIndex === index) {
      selectedPresetIndex = -1;
      onUpdate?.({ key: "selectedPresetIndex", value: -1 });
    }

    // Store full array with nulls to preserve slot indices
    onUpdate?.({ key: "propPresets", value: newPresets });
  }

  function handleResetToDefaults() {
    hapticService?.trigger("selection");

    // Copy default presets to avoid mutation
    propPresets = [...DEFAULT_PRESETS];
    selectedPresetIndex = 0; // Select first preset (Staff)

    // Apply the first preset's props
    const firstPreset = DEFAULT_PRESETS[0];
    if (firstPreset) {
      selectedLeftPropType = firstPreset.leftPropType;
      selectedRightPropType = firstPreset.rightPropType;
      catDogMode = firstPreset.catDogMode;
      leftBuugengFlipped = false;
      rightBuugengFlipped = false;

      // Persist all changes
      onUpdate?.({ key: "propPresets", value: [...DEFAULT_PRESETS] });
      onUpdate?.({ key: "selectedPresetIndex", value: 0 });
      onUpdate?.({ key: "leftPropType", value: firstPreset.leftPropType });
      onUpdate?.({ key: "rightPropType", value: firstPreset.rightPropType });
      onUpdate?.({ key: "catDogMode", value: false });
      onUpdate?.({ key: "leftBuugengFlipped", value: false });
      onUpdate?.({ key: "rightBuugengFlipped", value: false });
    }
  }

  function updateCurrentPreset() {
    if (selectedPresetIndex < 0 || !propPresets[selectedPresetIndex]) return;

    const updatedPreset: PropPreset = {
      leftPropType: selectedLeftPropType,
      rightPropType: selectedRightPropType,
      catDogMode,
      leftBuugengFlipped,
      rightBuugengFlipped,
    };

    const newPresets = [...propPresets];
    newPresets[selectedPresetIndex] = updatedPreset;
    propPresets = newPresets;

    // Store full array with nulls to preserve slot indices
    onUpdate?.({ key: "propPresets", value: newPresets });
  }

  // CatDog mode
  function toggleCatDogMode() {
    hapticService?.trigger("selection");
    const newCatDogMode = !catDogMode;

    if (newCatDogMode) {
      if (rememberedRightProp !== null) {
        selectedRightPropType = rememberedRightProp;
        onUpdate?.({ key: "rightPropType", value: rememberedRightProp });
        rememberedRightProp = null;
      }
    } else {
      if (selectedRightPropType !== selectedLeftPropType) {
        rememberedRightProp = selectedRightPropType;
      }
      selectedRightPropType = selectedLeftPropType;
      onUpdate?.({ key: "rightPropType", value: selectedLeftPropType });
    }

    catDogMode = newCatDogMode;
    onUpdate?.({ key: "catDogMode", value: catDogMode });
    updateCurrentPreset();
  }

  // Inline selection (blue / shared-when-not-cat-dog)
  function handleInlineSelect(propType: PropType) {
    hapticService?.trigger("selection");
    selectedLeftPropType = propType;
    onUpdate?.({ key: "leftPropType", value: propType });
    if (!catDogMode) {
      selectedRightPropType = propType;
      onUpdate?.({ key: "rightPropType", value: propType });
    }
    updateCurrentPreset();
  }

  function handleInlineSelectRed(propType: PropType) {
    hapticService?.trigger("selection");
    selectedRightPropType = propType;
    onUpdate?.({ key: "rightPropType", value: propType });
    updateCurrentPreset();
  }

  // Size modifier — swap the hand's prop between standard and big.
  function handleToggleBig(hand: ChiralityHand) {
    hapticService?.trigger("selection");

    if (hand === "left") {
      const next = toggleBigVariant(selectedLeftPropType);
      selectedLeftPropType = next;
      onUpdate?.({ key: "leftPropType", value: next });
      if (!catDogMode) {
        selectedRightPropType = next;
        onUpdate?.({ key: "rightPropType", value: next });
      }
    } else {
      const next = toggleBigVariant(selectedRightPropType);
      selectedRightPropType = next;
      onUpdate?.({ key: "rightPropType", value: next });
    }
    updateCurrentPreset();
  }

  // Buugeng chirality. Written through the tab's own local mirrors rather than
  // the global seam, because this tab keeps $state copies of every setting and
  // publishes them through onUpdate — a direct settings write would leave the
  // mirrors (and the preset row that reads them) stale.
  // Each hand keeps its own handedness even when both hands share a prop
  // type. Two buugeng of the same chirality stay apart; two of opposite
  // chirality nest into one shape, so mirroring left onto right would erase the
  // distinction the setting exists to make.
  function setChirality(hand: ChiralityHand, flipped: boolean) {
    hapticService?.trigger("selection");

    if (hand === "left") {
      leftBuugengFlipped = flipped;
      onUpdate?.({ key: "leftBuugengFlipped", value: leftBuugengFlipped });
    } else {
      rightBuugengFlipped = flipped;
      onUpdate?.({ key: "rightBuugengFlipped", value: rightBuugengFlipped });
    }
    updateCurrentPreset();
  }

  function chiralityHand(hand: ChiralityHand): PropChiralityHandState {
    return {
      hand,
      get flipped() {
        return hand === "left" ? leftBuugengFlipped : rightBuugengFlipped;
      },
    };
  }

  function chiralitySeam(...hands: ChiralityHand[]): PropChiralitySeam {
    return { hands: hands.map(chiralityHand), onChange: setChirality };
  }
</script>

<div class="prop-type-tab">
  <!-- Left: Controls -->
  <section class="controls-panel">
    <header class="panel-header">
      <span class="panel-icon">
        <i class="fas fa-wand-sparkles" aria-hidden="true"></i>
      </span>
      <div class="panel-header-text">
        <h3 class="panel-title">{t("settings_prop_type")}</h3>
        <p class="panel-subtitle">{t("settings_prop_subtitle")}</p>
      </div>
    </header>

    <!-- Current Selection (front and center) -->
    <div class="prop-display">
      <CompactPropDisplay
        leftPropType={selectedLeftPropType}
        rightPropType={selectedRightPropType}
        {catDogMode}
        {leftBuugengFlipped}
        {rightBuugengFlipped}
        onToggleBig={handleToggleBig}
      />
    </div>

    <PrimaryPropColorSettings
      colors={settings.primaryPropColors}
      darkMode={settings.darkMode}
      onchange={(value) => onUpdate?.({ key: "primaryPropColors", value })}
    />

    <!-- CatDog Toggle -->
    <div class="mode-row">
      <CatDogToggle {catDogMode} onToggle={toggleCatDogMode} />
      <span class="mode-hint">
        {catDogMode ? t("settings_different_props") : t("settings_same_props")}
      </span>
    </div>

    <!-- Presets (fills remaining space) -->
    <div class="section presets-section">
      <h4 class="section-label">{t("settings_quick_presets")}</h4>
      <PresetChipBar
        presets={propPresets}
        selectedIndex={selectedPresetIndex}
        showKeyboardBadges={hasKeyboard}
        onSelectPreset={handleSelectPreset}
        onSaveToSlot={handleSaveToSlot}
        onClearSlot={handleClearSlot}
      />
      <button
        type="button"
        class="reset-defaults-btn"
        onclick={handleResetToDefaults}
        aria-label="Reset presets to defaults"
      >
        <i class="fas fa-undo" aria-hidden="true"></i>
        <span>Reset to defaults</span>
      </button>
    </div>
  </section>

  <!-- Right (desktop) / below controls (mobile): inline Bento Prop Grid -->
  <section class="selection-panel">
    {#if catDogMode && isNarrow}
      <!-- Narrow: one grid, Blue/Red tab picks the hand it edits -->
      <SegmentedControl
        options={[
          {
            value: "left",
            label: t("settings_select_left_prop"),
            tone: "blue",
          },
          {
            value: "right",
            label: t("settings_select_right_prop"),
            tone: "red",
          },
        ]}
        value={mobileHand}
        onchange={(hand) => {
          hapticService?.trigger("selection");
          mobileHand = hand;
        }}
        color="accent"
        size="sm"
      />
      {#if mobileHand === "left"}
        <BentoPropGrid
          selectedPropType={selectedLeftPropType}
          color="blue"
          title={t("settings_select_left_prop")}
          onSelect={handleInlineSelect}
          chirality={chiralitySeam("left")}
        />
      {:else}
        <BentoPropGrid
          selectedPropType={selectedRightPropType}
          color="red"
          title={t("settings_select_right_prop")}
          onSelect={handleInlineSelectRed}
          chirality={chiralitySeam("right")}
        />
      {/if}
    {:else if catDogMode}
      <!-- Desktop cat/dog: both grids side by side -->
      <div class="dual-grids">
        <BentoPropGrid
          selectedPropType={selectedLeftPropType}
          color="blue"
          title={t("settings_select_left_prop")}
          onSelect={handleInlineSelect}
          chirality={chiralitySeam("left")}
        />
        <BentoPropGrid
          selectedPropType={selectedRightPropType}
          color="red"
          title={t("settings_select_right_prop")}
          onSelect={handleInlineSelectRed}
          chirality={chiralitySeam("right")}
        />
      </div>
    {:else}
      <BentoPropGrid
        selectedPropType={selectedLeftPropType}
        color="blue"
        title="Select Prop"
        onSelect={handleInlineSelect}
        chirality={chiralitySeam("left", "right")}
      />
    {/if}
  </section>
</div>

<style>
  .prop-type-tab {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    width: 100%;
    max-width: 1600px;
    margin: 0 auto;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    box-sizing: border-box;
  }

  /* Tablet: More breathing room */
  @media (min-width: 500px) {
    .prop-type-tab {
      gap: 16px;
      padding: 16px;
    }
  }

  /* Desktop: side by side, stretch to fill height */
  @media (min-width: 900px) {
    .prop-type-tab {
      flex-direction: row;
      align-items: flex-start;
      gap: 20px;
    }
  }

  /* Controls Panel - fills available height */
  .controls-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 14px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    container-type: inline-size;
    container-name: controls-panel;
    flex: 0 0 auto;
  }

  /* Tablet: Slightly larger */
  @media (min-width: 500px) {
    .controls-panel {
      gap: 16px;
      padding: 16px;
      border-radius: 14px;
    }
  }

  /* Desktop: Fixed width, full styling */
  @media (min-width: 900px) {
    .controls-panel {
      flex: 0 0 clamp(380px, 28vw, 520px);
      padding: clamp(20px, 5cqi, 32px);
      gap: clamp(16px, 4cqi, 28px);
      border-radius: 16px;
    }
  }

  /* Selection Panel - inline at all breakpoints (stacks below controls on
     mobile, sits side-by-side on desktop) */
  .selection-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 0 0 auto;
    min-width: 0;
  }

  @media (min-width: 900px) {
    .selection-panel {
      flex: 1;
    }
  }

  .dual-grids {
    display: flex;
    flex-direction: row;
    gap: 12px;
    width: 100%;
    height: 100%;
  }

  .dual-grids > :global(*) {
    flex: 1;
    min-width: 0;
  }

  @media (min-width: 1200px) {
    .dual-grids {
      gap: 16px;
    }
  }

  /* Header - compact on mobile, never shrinks */
  .panel-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--theme-stroke);
    flex-shrink: 0;
  }

  .panel-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    font-size: 15px;
    background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
    border: 1px solid color-mix(in srgb, var(--theme-accent) 35%, transparent);
    color: var(--theme-accent);
  }

  @media (min-width: 500px) {
    .panel-header {
      gap: 12px;
      padding-bottom: 14px;
    }

    .panel-icon {
      width: 40px;
      height: 40px;
      font-size: 16px;
    }
  }

  @media (min-width: 900px) {
    .panel-header {
      gap: 14px;
      padding-bottom: 16px;
    }

    .panel-icon {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      font-size: 18px;
    }
  }

  .panel-header-text {
    flex: 1;
  }

  .panel-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--theme-text);
    margin: 0;
  }

  .panel-subtitle {
    font-size: 12px;
    color: var(--theme-text-dim);
    margin: 2px 0 0 0;
  }

  @media (min-width: 500px) {
    .panel-title {
      font-size: 16px;
    }

    .panel-subtitle {
      font-size: 13px;
      margin-top: 3px;
    }
  }

  /* Section - tighter on mobile */
  .section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .section-label {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-dim);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    flex-shrink: 0;
  }

  @media (min-width: 500px) {
    .section {
      gap: 12px;
    }

    .section-label {
      font-size: 12px;
    }
  }

  @media (min-width: 900px) {
    .section {
      gap: 16px;
    }
  }

  /* Mode Row - never shrinks */
  .mode-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .mode-hint {
    font-size: 12px;
    color: var(--theme-text-dim);
    font-style: italic;
  }

  @media (min-width: 500px) {
    .mode-row {
      gap: 12px;
    }

    .mode-hint {
      font-size: 13px;
    }
  }

  /* Prop Display - front and center, right after header */
  .prop-display {
    flex-shrink: 0;
  }

  /* Presets section absorbs remaining space, grid sizes naturally within */
  .presets-section {
    flex: 1;
    min-height: 0;
  }

  /* Reset to Defaults Button */
  .reset-defaults-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    min-height: var(--min-touch-target);
    background: transparent;
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    -webkit-tap-highlight-color: transparent;
    align-self: flex-start;
    flex-shrink: 0;
  }

  .reset-defaults-btn:hover {
    background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
    border-color: var(--theme-accent);
    color: var(--theme-accent);
  }

  .reset-defaults-btn:active {
    transform: scale(0.97);
  }

  .reset-defaults-btn i {
    font-size: 12px;
  }

  .reset-defaults-btn:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

</style>
