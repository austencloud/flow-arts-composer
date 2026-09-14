<!--
  PropButtonLab.svelte - Visual tuning lab for paired prop compositions

  Shows all base prop families. Click to expand with large preview + compact controls.
  Number inputs for direct value entry, sliders for scrubbing, group rotation.
-->
<script lang="ts">
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { getPropTypeDisplayInfo } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
  import PropCompositionPreview from "$lib/shared/pictograph/prop/components/PropCompositionPreview.svelte";
  import {
    getCompositionRecipe,
    getRecipeFamilies,
    type CompositionRecipe,
    type PropTransform,
  } from "$lib/shared/pictograph/prop/domain/prop-composition-recipes";
  import { getSettings, updateSetting } from "$lib/shared/application/state/app-state.svelte";
  import {
    HandSide,
    type HandSide as HandSideValue,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

  const families = getRecipeFamilies();
  const MAX_HISTORY = 100;
  const HAND_TRANSFORMS = [
    { hand: HandSide.LEFT, accent: "#4f46e5", label: "Left" },
    { hand: HandSide.RIGHT, accent: "#dc2626", label: "Right" },
  ] as const;

  let expandedFamily = $state<PropType | null>(null);

  interface Preset {
    label: string;
    recipe: CompositionRecipe;
  }

  const FAMILY_PRESETS: Partial<Record<PropType, Preset[]>> = {
    [PropType.CLUB]: [
      { label: "V-Open", recipe: { left: { x: 35, y: 50, rotation: -20, scale: 0.5 }, right: { x: 65, y: 50, rotation: 20, scale: 0.5 }, pairScale: 1 } },
      { label: "Crossed", recipe: { left: { x: 50, y: 50, rotation: -40, scale: 0.5 }, right: { x: 50, y: 50, rotation: 40, scale: 0.5 }, pairScale: 1 } },
      { label: "Parallel", recipe: { left: { x: 40, y: 38, rotation: -25, scale: 0.48 }, right: { x: 60, y: 62, rotation: -25, scale: 0.48 }, pairScale: 1 } },
      { label: "Stacked", recipe: { left: { x: 50, y: 35, rotation: 0, scale: 0.48 }, right: { x: 50, y: 65, rotation: 180, scale: 0.48 }, pairScale: 1 } },
      { label: "Wide V", recipe: { left: { x: 28, y: 50, rotation: -35, scale: 0.48 }, right: { x: 72, y: 50, rotation: 35, scale: 0.48 }, pairScale: 1 } },
      { label: "Nested", recipe: { left: { x: 45, y: 45, rotation: -30, scale: 0.55 }, right: { x: 55, y: 55, rotation: -30, scale: 0.4 }, pairScale: 1 } },
    ],
    [PropType.STAFF]: [
      { label: "X-Cross", recipe: { left: { x: 50, y: 50, rotation: -45, scale: 0.55 }, right: { x: 50, y: 50, rotation: 45, scale: 0.55 }, pairScale: 1 } },
      { label: "Parallel", recipe: { left: { x: 38, y: 50, rotation: -30, scale: 0.55 }, right: { x: 62, y: 50, rotation: -30, scale: 0.55 }, pairScale: 1 } },
      { label: "Wide X", recipe: { left: { x: 50, y: 50, rotation: -60, scale: 0.55 }, right: { x: 50, y: 50, rotation: 60, scale: 0.55 }, pairScale: 1 } },
      { label: "Tight X", recipe: { left: { x: 50, y: 50, rotation: -25, scale: 0.55 }, right: { x: 50, y: 50, rotation: 25, scale: 0.55 }, pairScale: 1 } },
      { label: "V-Down", recipe: { left: { x: 35, y: 40, rotation: -50, scale: 0.5 }, right: { x: 65, y: 40, rotation: 50, scale: 0.5 }, pairScale: 1 } },
      { label: "Horizontal", recipe: { left: { x: 50, y: 40, rotation: 0, scale: 0.5 }, right: { x: 50, y: 60, rotation: 0, scale: 0.5 }, pairScale: 1 } },
    ],
    [PropType.FAN]: [
      { label: "Facing", recipe: { left: { x: 35, y: 50, rotation: 0, scale: 0.45 }, right: { x: 65, y: 50, rotation: 180, scale: 0.45 }, pairScale: 1 } },
      { label: "Butterfly", recipe: { left: { x: 38, y: 50, rotation: 30, scale: 0.45 }, right: { x: 62, y: 50, rotation: -30, scale: 0.45 }, pairScale: 1 } },
      { label: "Stacked", recipe: { left: { x: 50, y: 35, rotation: 0, scale: 0.45 }, right: { x: 50, y: 65, rotation: 0, scale: 0.45 }, pairScale: 1 } },
      { label: "Fanned", recipe: { left: { x: 45, y: 45, rotation: -20, scale: 0.45 }, right: { x: 55, y: 55, rotation: 20, scale: 0.45 }, pairScale: 1 } },
    ],
    [PropType.BUUGENG]: [
      { label: "Facing", recipe: { left: { x: 35, y: 50, rotation: 0, scale: 0.45 }, right: { x: 65, y: 50, rotation: 180, scale: 0.45 }, pairScale: 1 } },
      { label: "Interlocked", recipe: { left: { x: 42, y: 50, rotation: 0, scale: 0.48 }, right: { x: 58, y: 50, rotation: 180, scale: 0.48 }, pairScale: 1 } },
      { label: "Yin-Yang", recipe: { left: { x: 42, y: 42, rotation: 45, scale: 0.45 }, right: { x: 58, y: 58, rotation: -135, scale: 0.45 }, pairScale: 1 } },
      { label: "Parallel", recipe: { left: { x: 38, y: 50, rotation: 0, scale: 0.45 }, right: { x: 62, y: 50, rotation: 0, scale: 0.45 }, pairScale: 1 } },
    ],
    [PropType.MINIHOOP]: [
      { label: "Venn", recipe: { left: { x: 38, y: 50, rotation: 0, scale: 0.5 }, right: { x: 62, y: 50, rotation: 0, scale: 0.5 }, pairScale: 1 } },
      { label: "Stacked", recipe: { left: { x: 50, y: 38, rotation: 0, scale: 0.48 }, right: { x: 50, y: 62, rotation: 0, scale: 0.48 }, pairScale: 1 } },
      { label: "Nested", recipe: { left: { x: 50, y: 50, rotation: 0, scale: 0.55 }, right: { x: 50, y: 50, rotation: 0, scale: 0.38 }, pairScale: 1 } },
      { label: "Olympic", recipe: { left: { x: 35, y: 45, rotation: 0, scale: 0.42 }, right: { x: 58, y: 55, rotation: 0, scale: 0.42 }, pairScale: 1 } },
    ],
    [PropType.TRIAD]: [
      { label: "Offset", recipe: { left: { x: 38, y: 50, rotation: 0, scale: 0.45 }, right: { x: 62, y: 50, rotation: 60, scale: 0.45 }, pairScale: 1 } },
      { label: "Mirrored", recipe: { left: { x: 38, y: 50, rotation: 0, scale: 0.45 }, right: { x: 62, y: 50, rotation: 0, scale: 0.45 }, pairScale: 1 } },
      { label: "Nested", recipe: { left: { x: 50, y: 50, rotation: 0, scale: 0.55 }, right: { x: 50, y: 50, rotation: 30, scale: 0.38 }, pairScale: 1 } },
      { label: "Star", recipe: { left: { x: 50, y: 50, rotation: 0, scale: 0.5 }, right: { x: 50, y: 50, rotation: 180, scale: 0.5 }, pairScale: 1 } },
    ],
    [PropType.TORCH]: [
      { label: "Crossed", recipe: { left: { x: 50, y: 50, rotation: -30, scale: 0.5 }, right: { x: 50, y: 50, rotation: 30, scale: 0.5 }, pairScale: 1 } },
      { label: "V-Up", recipe: { left: { x: 35, y: 55, rotation: -25, scale: 0.48 }, right: { x: 65, y: 55, rotation: 25, scale: 0.48 }, pairScale: 1 } },
      { label: "Parallel", recipe: { left: { x: 38, y: 50, rotation: -15, scale: 0.48 }, right: { x: 62, y: 50, rotation: -15, scale: 0.48 }, pairScale: 1 } },
      { label: "Wide", recipe: { left: { x: 30, y: 50, rotation: -40, scale: 0.48 }, right: { x: 70, y: 50, rotation: 40, scale: 0.48 }, pairScale: 1 } },
    ],
    [PropType.SWORD]: [
      { label: "Crossed", recipe: { left: { x: 50, y: 50, rotation: -40, scale: 0.55 }, right: { x: 50, y: 50, rotation: 40, scale: 0.55 }, pairScale: 1 } },
      { label: "Parallel", recipe: { left: { x: 38, y: 50, rotation: -20, scale: 0.5 }, right: { x: 62, y: 50, rotation: -20, scale: 0.5 }, pairScale: 1 } },
      { label: "Tight X", recipe: { left: { x: 50, y: 50, rotation: -25, scale: 0.55 }, right: { x: 50, y: 50, rotation: 25, scale: 0.55 }, pairScale: 1 } },
      { label: "V-Down", recipe: { left: { x: 35, y: 40, rotation: -50, scale: 0.5 }, right: { x: 65, y: 40, rotation: 50, scale: 0.5 }, pairScale: 1 } },
    ],
    [PropType.CHICKEN]: [
      { label: "Mirrored", recipe: { left: { x: 35, y: 50, rotation: 10, scale: 0.45 }, right: { x: 65, y: 50, rotation: -10, scale: 0.45 }, pairScale: 1 } },
      { label: "Facing", recipe: { left: { x: 35, y: 50, rotation: 0, scale: 0.45 }, right: { x: 65, y: 50, rotation: 180, scale: 0.45 }, pairScale: 1 } },
      { label: "Stacked", recipe: { left: { x: 50, y: 35, rotation: 0, scale: 0.45 }, right: { x: 50, y: 65, rotation: 0, scale: 0.45 }, pairScale: 1 } },
      { label: "Crossed", recipe: { left: { x: 50, y: 50, rotation: -30, scale: 0.48 }, right: { x: 50, y: 50, rotation: 30, scale: 0.48 }, pairScale: 1 } },
    ],
    [PropType.DOUBLESTAR]: [
      { label: "Offset", recipe: { left: { x: 38, y: 50, rotation: 0, scale: 0.45 }, right: { x: 62, y: 50, rotation: 30, scale: 0.45 }, pairScale: 1 } },
      { label: "Mirrored", recipe: { left: { x: 38, y: 50, rotation: 0, scale: 0.45 }, right: { x: 62, y: 50, rotation: 0, scale: 0.45 }, pairScale: 1 } },
      { label: "Nested", recipe: { left: { x: 50, y: 50, rotation: 0, scale: 0.55 }, right: { x: 50, y: 50, rotation: 45, scale: 0.38 }, pairScale: 1 } },
      { label: "Crossed", recipe: { left: { x: 50, y: 50, rotation: -20, scale: 0.48 }, right: { x: 50, y: 50, rotation: 20, scale: 0.48 }, pairScale: 1 } },
    ],
    [PropType.TRIQUETRA]: [
      { label: "Offset", recipe: { left: { x: 38, y: 50, rotation: 0, scale: 0.45 }, right: { x: 62, y: 50, rotation: 60, scale: 0.45 }, pairScale: 1 } },
      { label: "Mirrored", recipe: { left: { x: 38, y: 50, rotation: 0, scale: 0.45 }, right: { x: 62, y: 50, rotation: 0, scale: 0.45 }, pairScale: 1 } },
      { label: "Star", recipe: { left: { x: 50, y: 50, rotation: 0, scale: 0.5 }, right: { x: 50, y: 50, rotation: 180, scale: 0.5 }, pairScale: 1 } },
      { label: "Stacked", recipe: { left: { x: 50, y: 35, rotation: 0, scale: 0.42 }, right: { x: 50, y: 65, rotation: 60, scale: 0.42 }, pairScale: 1 } },
    ],
    [PropType.EIGHTRINGS]: [
      { label: "Side", recipe: { left: { x: 38, y: 50, rotation: 0, scale: 0.45 }, right: { x: 62, y: 50, rotation: 0, scale: 0.45 }, pairScale: 1 } },
      { label: "Rotated", recipe: { left: { x: 38, y: 50, rotation: 0, scale: 0.45 }, right: { x: 62, y: 50, rotation: 45, scale: 0.45 }, pairScale: 1 } },
      { label: "Stacked", recipe: { left: { x: 50, y: 38, rotation: 0, scale: 0.42 }, right: { x: 50, y: 62, rotation: 0, scale: 0.42 }, pairScale: 1 } },
      { label: "Overlap", recipe: { left: { x: 44, y: 50, rotation: -10, scale: 0.48 }, right: { x: 56, y: 50, rotation: 10, scale: 0.48 }, pairScale: 1 } },
    ],
  };

  function getPresets(propType: PropType): Preset[] {
    return FAMILY_PRESETS[propType] ?? [];
  }

  function applyPreset(propType: PropType, preset: Preset) {
    pushUndo();
    overrides[propType] = structuredClone(preset.recipe);
    overrides = { ...overrides };
    persistOverrides();
  }

  // Load persisted overrides from settings
  const settings = $derived(getSettings());
  let overrides = $state<Record<string, CompositionRecipe>>(
    $state.snapshot(getSettings().compositionRecipeOverrides ?? {})
  );

  type Snapshot = Record<string, CompositionRecipe>;
  let undoStack = $state<Snapshot[]>([]);
  let redoStack = $state<Snapshot[]>([]);
  let canUndo = $derived(undoStack.length > 0);
  let canRedo = $derived(redoStack.length > 0);

  /** Capture current overrides before a mutation */
  function pushUndo() {
    undoStack = [...undoStack, $state.snapshot(overrides)].slice(-MAX_HISTORY);
    redoStack = [];
  }

  function undo() {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1]!;
    redoStack = [...redoStack, $state.snapshot(overrides)];
    undoStack = undoStack.slice(0, -1);
    overrides = $state.snapshot(previous);
    persistOverrides();
  }

  function redo() {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1]!;
    undoStack = [...undoStack, $state.snapshot(overrides)];
    redoStack = redoStack.slice(0, -1);
    overrides = $state.snapshot(next);
    persistOverrides();
  }

  /** Persist overrides to settings (auto-saves to localStorage + Firebase) */
  function persistOverrides() {
    const toSave = Object.keys(overrides).length > 0 ? { ...overrides } : undefined;
    updateSetting("compositionRecipeOverrides", toSave);
  }

  function getRecipe(propType: PropType): CompositionRecipe {
    return overrides[propType] ?? getCompositionRecipe(propType, true);
  }

  function ensureOverride(propType: PropType) {
    if (!overrides[propType]) {
      overrides[propType] = $state.snapshot(getCompositionRecipe(propType, true));
    }
  }

  function toggleFamily(propType: PropType) {
    if (expandedFamily === propType) {
      expandedFamily = null;
    } else {
      expandedFamily = propType;
      ensureOverride(propType);
    }
  }

  function updateTransform(
    propType: PropType,
    color: HandSideValue,
    field: keyof PropTransform,
    value: number
  ) {
    pushUndo();
    ensureOverride(propType);
    (overrides[propType]![color] as PropTransform)[field] = value;
    overrides = { ...overrides };
    persistOverrides();
  }

  function updatePairScale(propType: PropType, value: number) {
    pushUndo();
    ensureOverride(propType);
    overrides[propType]!.pairScale = value;
    overrides = { ...overrides };
    persistOverrides();
  }

  /** Rotate both props as a group by adding degrees to both rotations */
  function rotateGroup(propType: PropType, degrees: number) {
    pushUndo();
    ensureOverride(propType);
    const recipe = overrides[propType]!;
    recipe.left.rotation = ((recipe.left.rotation + degrees + 180) % 360) - 180;
    recipe.right.rotation = ((recipe.right.rotation + degrees + 180) % 360) - 180;
    overrides = { ...overrides };
    persistOverrides();
  }

  function resetFamily(propType: PropType) {
    pushUndo();
    delete overrides[propType];
    overrides = { ...overrides };
    persistOverrides();
  }

  function copyRecipe(propType: PropType) {
    const recipe = getRecipe(propType);
    navigator.clipboard.writeText(JSON.stringify(recipe, null, 2));
  }

  function copyAllRecipes() {
    const all: Record<string, CompositionRecipe> = {};
    for (const family of families) {
      all[family.propType] = getRecipe(family.propType);
    }
    navigator.clipboard.writeText(JSON.stringify(all, null, 2));
  }

  /** Clamp a value and handle NaN from empty inputs */
  function clamp(val: number, min: number, max: number): number {
    if (Number.isNaN(val)) return min;
    return Math.min(max, Math.max(min, val));
  }
</script>

<div class="prop-button-lab" data-edit-history-shortcut-scope>
  <header class="lab-header">
    <h1>Prop Button Lab</h1>
    <p class="subtitle">Tune paired prop compositions for buttons and drawers</p>
    <div class="header-buttons">
      <button
        data-undo-shortcut
        data-undo-shortcut-label="Prop composition change"
        class="header-btn"
        onclick={undo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
      >
        <i class="fas fa-undo"></i>
      </button>
      <button
        data-redo-shortcut
        data-redo-shortcut-label="Prop composition change"
        class="header-btn"
        onclick={redo}
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
      >
        <i class="fas fa-redo"></i>
      </button>
      <button class="copy-all-btn" onclick={copyAllRecipes}>
        <i class="fas fa-copy"></i> Copy All
      </button>
    </div>
  </header>

  <div class="families-grid">
    {#each families as { propType }}
      {@const info = getPropTypeDisplayInfo(propType)}
      {@const recipe = getRecipe(propType)}
      {@const isExpanded = expandedFamily === propType}

      <div class="family-card" class:expanded={isExpanded}>
        <button class="family-header" onclick={() => toggleFamily(propType)}>
          <div class="preview-container" class:preview-large={isExpanded}>
            <PropCompositionPreview pairedGlyph colors={getSettings().primaryPropColors} appearanceOverride={{ fanAppearance: getSettings().fanAppearance, propLook: getSettings().propArtwork }}
              {propType}
              size={isExpanded ? 280 : 100}
              recipeOverride={overrides[propType]}
            />
          </div>
          {#if !isExpanded}
            <span class="family-label">{info.label}</span>
          {/if}
        </button>

        {#if isExpanded}
          <div class="expanded-layout">
            <!-- Presets gallery -->
            {#if getPresets(propType).length > 0}
              <div class="presets-section">
                <span class="section-label">Presets</span>
                <div class="presets-gallery">
                  {#each getPresets(propType) as preset}
                    <button
                      class="preset-card"
                      onclick={() => applyPreset(propType, preset)}
                      title={preset.label}
                    >
                      <div class="preset-preview">
                        <PropCompositionPreview pairedGlyph colors={getSettings().primaryPropColors} appearanceOverride={{ fanAppearance: getSettings().fanAppearance, propLook: getSettings().propArtwork }}
                          {propType}
                          size={80}
                          recipeOverride={preset.recipe}
                        />
                      </div>
                      <span class="preset-label">{preset.label}</span>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Sliders & fine-tune controls -->
            <div class="controls-panel">
              <div class="controls-header">
                <span class="family-name">{info.label}</span>
                <div class="header-actions">
                  <button class="action-btn" onclick={() => copyRecipe(propType)} title="Copy recipe">
                    <i class="fas fa-copy"></i> Copy
                  </button>
                  <button class="action-btn danger" onclick={() => resetFamily(propType)} title="Reset to defaults">
                    <i class="fas fa-undo"></i> Reset
                  </button>
                </div>
              </div>

              <!-- Group rotation -->
              <div class="group-rotation">
                <span class="section-label">Group Rotate</span>
                <div class="rotation-buttons">
                  <button class="rot-btn" onclick={() => rotateGroup(propType, -45)}>-45</button>
                  <button class="rot-btn" onclick={() => rotateGroup(propType, -15)}>-15</button>
                  <button class="rot-btn" onclick={() => rotateGroup(propType, -5)}>-5</button>
                  <button class="rot-btn" onclick={() => rotateGroup(propType, 5)}>+5</button>
                  <button class="rot-btn" onclick={() => rotateGroup(propType, 15)}>+15</button>
                  <button class="rot-btn" onclick={() => rotateGroup(propType, 45)}>+45</button>
                </div>
              </div>

              <!-- Blue / Red columns -->
              <div class="color-columns">
                {#each HAND_TRANSFORMS as { hand, accent, label } (hand)}
                  {@const t = recipe[hand]}
                  <div class="color-col">
                    <span class="color-dot" style="background: {accent}"></span>
                    <span class="color-label">{label}</span>

                    <div class="field-row">
                      <span class="field-name">X</span>
                      <input
                        type="range" min="0" max="100" step="1" value={t.x}
                        oninput={(e) => updateTransform(propType, hand, "x", +e.currentTarget.value)}
                      />
                      <input
                        type="number" min="0" max="100" step="1" value={t.x}
                        onchange={(e) => updateTransform(propType, hand, "x", clamp(+e.currentTarget.value, 0, 100))}
                      />
                    </div>

                    <div class="field-row">
                      <span class="field-name">Y</span>
                      <input
                        type="range" min="0" max="100" step="1" value={t.y}
                        oninput={(e) => updateTransform(propType, hand, "y", +e.currentTarget.value)}
                      />
                      <input
                        type="number" min="0" max="100" step="1" value={t.y}
                        onchange={(e) => updateTransform(propType, hand, "y", clamp(+e.currentTarget.value, 0, 100))}
                      />
                    </div>

                    <div class="field-row">
                      <span class="field-name">Rot</span>
                      <input
                        type="range" min="-180" max="180" step="5" value={t.rotation}
                        oninput={(e) => updateTransform(propType, hand, "rotation", +e.currentTarget.value)}
                      />
                      <input
                        type="number" min="-180" max="180" step="1" value={t.rotation}
                        onchange={(e) => updateTransform(propType, hand, "rotation", clamp(+e.currentTarget.value, -180, 180))}
                      />
                    </div>

                    <div class="field-row">
                      <span class="field-name">Scale</span>
                      <input
                        type="range" min="0.1" max="1" step="0.05" value={t.scale}
                        oninput={(e) => updateTransform(propType, hand, "scale", +e.currentTarget.value)}
                      />
                      <input
                        type="number" min="0.1" max="1" step="0.01" value={t.scale}
                        onchange={(e) => updateTransform(propType, hand, "scale", clamp(+e.currentTarget.value, 0.1, 1))}
                      />
                    </div>
                  </div>
                {/each}
              </div>

              <!-- Pair scale -->
              <div class="field-row pair-scale-row">
                <span class="field-name">Pair Scale</span>
                <input
                  type="range" min="0.5" max="1.5" step="0.05" value={recipe.pairScale}
                  oninput={(e) => updatePairScale(propType, +e.currentTarget.value)}
                />
                <input
                  type="number" min="0.5" max="1.5" step="0.01" value={recipe.pairScale}
                  onchange={(e) => updatePairScale(propType, clamp(+e.currentTarget.value, 0.5, 1.5))}
                />
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .prop-button-lab {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 24px;
    overflow-y: auto;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
  }

  .lab-header {
    margin-bottom: 16px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }

  .lab-header h1 {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--theme-text, white);
    margin: 0;
  }

  .subtitle {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-min, 14px);
    margin: 0;
    flex: 1;
  }

  .header-buttons {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .header-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 48px);
    height: var(--min-touch-target, 48px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    color: var(--theme-text, white);
    font-size: 16px;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) ease;
    -webkit-tap-highlight-color: transparent;
  }

  .header-btn:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    transform: translateY(-1px);
  }

  .header-btn:active:not(:disabled) {
    transform: translateY(0) scale(0.95);
  }

  .header-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .header-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #f97316);
    outline-offset: 2px;
  }

  .copy-all-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 20px;
    min-height: var(--min-touch-target, 48px);
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--theme-accent) 30%, transparent);
    border-radius: 12px;
    color: var(--theme-accent, #f97316);
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) ease;
    -webkit-tap-highlight-color: transparent;
  }

  .copy-all-btn:hover {
    background: color-mix(in srgb, var(--theme-accent) 25%, transparent);
    transform: translateY(-1px);
  }

  .copy-all-btn:active {
    transform: translateY(0) scale(0.97);
  }

  .copy-all-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #f97316);
    outline-offset: 2px;
  }

  /* ================================================================
     FAMILY GRID (collapsed cards)
     ================================================================ */
  .families-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 12px;
  }

  .family-card {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 16px;
    overflow: hidden;
    transition: all var(--duration-fast, 150ms) ease;
  }

  .family-card:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
    transform: translateY(-1px);
  }

  .family-card.expanded {
    grid-column: 1 / -1;
    border-color: color-mix(in srgb, var(--theme-accent) 45%, transparent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--theme-accent) 15%, transparent),
                0 8px 24px color-mix(in srgb, var(--theme-accent) 15%, transparent);
  }

  .family-card.expanded:hover {
    transform: none;
  }

  .family-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 12px;
    width: 100%;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--theme-text, white);
    min-height: var(--min-touch-target, 48px);
    -webkit-tap-highlight-color: transparent;
  }

  .family-header:focus-visible {
    outline: 2px solid var(--theme-accent, #f97316);
    outline-offset: -2px;
    border-radius: 14px;
  }

  .preview-container {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 12px;
    padding: 8px;
  }

  .preview-large {
    padding: 16px;
    border-radius: 16px;
  }

  .family-label {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  /* ================================================================
     EXPANDED CARD: CONTROLS PANEL
     ================================================================ */
  .expanded .family-header {
    padding: 12px 20px;
  }

  .expanded-layout {
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .controls-panel {
    padding: 16px 20px 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow: hidden;
  }

  .controls-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .family-name {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--theme-text, white);
  }

  .header-actions {
    display: flex;
    gap: 8px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 14px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text, white);
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) ease;
    -webkit-tap-highlight-color: transparent;
  }

  .action-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    transform: translateY(-1px);
  }

  .action-btn:active {
    transform: translateY(0) scale(0.97);
  }

  .action-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #f97316);
    outline-offset: 2px;
  }

  .action-btn.danger {
    color: var(--semantic-error, #ef4444);
    border-color: color-mix(in srgb, var(--semantic-error, #ef4444) 20%, transparent);
  }

  .action-btn.danger:hover {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 12%, transparent);
    border-color: color-mix(in srgb, var(--semantic-error, #ef4444) 35%, transparent);
  }

  .presets-section {
    padding: 16px 20px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .presets-gallery {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .preset-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) ease;
    min-width: 90px;
    -webkit-tap-highlight-color: transparent;
  }

  .preset-card:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: color-mix(in srgb, var(--theme-accent) 50%, transparent);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .preset-card:active {
    transform: scale(0.96);
    transition-duration: 60ms;
  }

  .preset-card:focus-visible {
    outline: 2px solid var(--theme-accent, #f97316);
    outline-offset: 2px;
  }

  .preset-preview {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    pointer-events: none;
  }

  .preset-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .group-rotation {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .section-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    white-space: nowrap;
  }

  .rotation-buttons {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .rot-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 40px;
    padding: 6px 10px;
    background: color-mix(in srgb, var(--theme-card-bg) 70%, transparent);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) ease;
    -webkit-tap-highlight-color: transparent;
  }

  .rot-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text, white);
    transform: translateY(-1px);
  }

  .rot-btn:active {
    transform: translateY(0) scale(0.95);
    transition-duration: 50ms;
  }

  .rot-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #f97316);
    outline-offset: 2px;
  }

  .color-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }

  .color-col {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  .color-col .color-label {
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    margin: 0;
    display: inline;
  }

  .color-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin-right: 6px;
    vertical-align: middle;
  }

  /* ================================================================
     FIELD ROW: label + slider + number input
     ================================================================ */
  .field-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 36px;
  }

  .field-name {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    min-width: 40px;
    font-variant-numeric: tabular-nums;
  }

  .field-row input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    flex: 1;
    min-width: 0;
    height: 6px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 3px;
    outline: none;
    cursor: pointer;
  }

  .field-row input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 20px;
    height: 20px;
    background: var(--theme-accent, #f97316);
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    transition: transform var(--duration-fast, 150ms) ease;
  }

  .field-row input[type="range"]::-webkit-slider-thumb:hover {
    transform: scale(1.15);
  }

  .field-row input[type="range"]::-moz-range-thumb {
    width: 20px;
    height: 20px;
    background: var(--theme-accent, #f97316);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  }

  .field-row input[type="range"]:focus-visible {
    outline: 2px solid var(--theme-accent, #f97316);
    outline-offset: 4px;
    border-radius: 3px;
  }

  .field-row input[type="number"] {
    width: 60px;
    min-width: 48px;
    flex-shrink: 0;
    padding: 6px 8px;
    min-height: 36px;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 8px;
    color: var(--theme-text, white);
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: center;
    transition: all var(--duration-fast, 150ms) ease;
  }

  .field-row input[type="number"]:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
  }

  .field-row input[type="number"]:focus {
    outline: none;
    border-color: var(--theme-accent, #f97316);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-accent) 20%, transparent);
  }

  /* Hide spinner arrows */
  .field-row input[type="number"]::-webkit-inner-spin-button,
  .field-row input[type="number"]::-webkit-outer-spin-button {
    -webkit-appearance: none;
    appearance: none;
    margin: 0;
  }

  .field-row input[type="number"] {
    appearance: textfield;
    -moz-appearance: textfield;
  }

  .pair-scale-row {
    margin-top: 4px;
    padding-top: 12px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .pair-scale-row .field-name {
    min-width: 72px;
  }

  @media (max-width: 600px) {
    .prop-button-lab {
      padding: 16px;
    }

    .families-grid {
      grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
      gap: 8px;
    }

    .color-columns {
      grid-template-columns: 1fr;
    }

    .rotation-buttons {
      gap: 4px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .family-card,
    .rot-btn,
    .action-btn,
    .copy-all-btn,
    .header-btn {
      transition: none;
    }

    .family-card:hover,
    .rot-btn:hover,
    .action-btn:hover,
    .copy-all-btn:hover,
    .header-btn:hover {
      transform: none;
    }

    .field-row input[type="range"]::-webkit-slider-thumb:hover {
      transform: none;
    }
  }

  @media (prefers-contrast: high) {
    .family-card {
      border-width: 2px;
    }

    .action-btn {
      border-width: 2px;
    }

    .rot-btn {
      border-width: 2px;
    }
  }
</style>
