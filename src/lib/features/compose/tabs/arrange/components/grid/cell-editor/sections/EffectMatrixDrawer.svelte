<!--
  EffectMatrixDrawer.svelte

  Matrix UI for assigning visual effects to individual prop tip points.
  Three scope levels: Cell (1 row), Per Hand (2 rows), Per Tip (N rows).
  Opens as an overlay from the Effects section in CellEditorPanel.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type {
    TipEffectMap,
    EffectType,
  } from "$lib/shared/animation-engine/domain/types/tip-effect-types";
  import { getTipPoints } from "$lib/shared/animation-engine/domain/types/prop-tip-points";

  type Scope = "cell" | "hand" | "tip";

  const allProps: {
    currentMap: TipEffectMap;
    leftPropType: string;
    rightPropType: string;
    onUpdateMap: (map: TipEffectMap) => void;
    onClose: () => void;
  } = $props();

  // Initialize from currentMap via $effect.pre - access through allProps to track reactively.
  // The drawer mounts fresh each time, so this runs once per lifecycle.
  let scope: Scope = $state<Scope>("cell");
  let localMap: TipEffectMap = $state<TipEffectMap>({});
  $effect.pre(() => {
    scope = inferScope(allProps.currentMap);
    localMap = { ...allProps.currentMap };
  });

  const scopes: { value: Scope; label: string; icon: string }[] = [
    { value: "cell", label: "Cell", icon: "fa-border-all" },
    { value: "hand", label: "Per Hand", icon: "fa-hand" },
    { value: "tip", label: "Per Tip", icon: "fa-crosshairs" },
  ];

  const effectDefs: {
    value: EffectType;
    label: string;
    icon: string;
    cssClass: string;
  }[] = [
    { value: "none", label: "None", icon: "fa-ban", cssClass: "eff-none" },
    { value: "fire", label: "Fire", icon: "fa-fire", cssClass: "eff-fire" },
    {
      value: "charcoal",
      label: "Charcoal",
      icon: "fa-fire",
      cssClass: "eff-charcoal",
    },
    { value: "led", label: "LED", icon: "fa-lightbulb", cssClass: "eff-led" },
    {
      value: "trails",
      label: "Trails",
      icon: "fa-wind",
      cssClass: "eff-trails",
    },
  ];

  // Build channel rows based on current scope
  interface ChannelRow {
    key: string;
    color: string;
    label: string;
  }

  const leftTipCount = $derived(
    getTipPoints(allProps.leftPropType).points.length
  );
  const rightTipCount = $derived(
    getTipPoints(allProps.rightPropType).points.length
  );

  const channels: ChannelRow[] = $derived.by(() => {
    if (scope === "cell") {
      return [
        {
          key: "*",
          color: "linear-gradient(135deg, #3b82f6, #ef4444)",
          label: "Both",
        },
      ];
    }

    if (scope === "hand") {
      return [
        { key: "0", color: "#3b82f6", label: "Left" },
        { key: "1", color: "#ef4444", label: "Right" },
      ];
    }

    // Per-tip scope
    const rows: ChannelRow[] = [];
    for (let t = 0; t < leftTipCount; t++) {
      rows.push({
        key: `0-${t}`,
        color: "#3b82f6",
        label: `Left ${getTipLabel(allProps.leftPropType, t, leftTipCount)}`,
      });
    }
    for (let t = 0; t < rightTipCount; t++) {
      rows.push({
        key: `1-${t}`,
        color: "#ef4444",
        label: `Right ${getTipLabel(allProps.rightPropType, t, rightTipCount)}`,
      });
    }
    return rows;
  });

  function getTipLabel(
    propType: string,
    tipIndex: number,
    tipCount: number
  ): string {
    if (tipCount === 1) return "tip";
    if (tipCount === 2) return tipIndex === 0 ? "thumb" : "pinky";
    return `tip ${tipIndex + 1}`;
  }

  function getEffectForKey(key: string): EffectType {
    return localMap[key]?.effect ?? "none";
  }

  function setEffect(key: string, effect: EffectType) {
    localMap = { ...localMap, [key]: { effect } };
    allProps.onUpdateMap(localMap);
  }

  function applyToAll(effect: EffectType) {
    const newMap: TipEffectMap = {};
    for (const ch of channels) {
      newMap[ch.key] = { effect };
    }
    localMap = newMap;
    allProps.onUpdateMap(localMap);
  }

  function switchScope(newScope: Scope) {
    if (newScope === scope) return;

    const oldScope = scope;
    const newMap: TipEffectMap = {};

    if (newScope === "cell") {
      // Collapse to single key: use most common effect
      const most = mostCommonEffect(Object.keys(localMap));
      newMap["*"] = { effect: most };
    } else if (newScope === "hand") {
      if (oldScope === "tip") {
        // Collapse per-tip to per-hand: most common per prop
        const leftKeys = Object.keys(localMap).filter((k) =>
          k.startsWith("0-")
        );
        const rightKeys = Object.keys(localMap).filter((k) =>
          k.startsWith("1-")
        );
        newMap["0"] = { effect: mostCommonEffect(leftKeys) };
        newMap["1"] = { effect: mostCommonEffect(rightKeys) };
      } else {
        // Expand cell to per-hand
        const base = localMap["*"]?.effect ?? "none";
        newMap["0"] = { effect: base };
        newMap["1"] = { effect: base };
      }
    } else {
      // Per-tip: expand from parent
      if (oldScope === "cell") {
        const base = localMap["*"]?.effect ?? "none";
        for (let t = 0; t < leftTipCount; t++)
          newMap[`0-${t}`] = { effect: base };
        for (let t = 0; t < rightTipCount; t++)
          newMap[`1-${t}`] = { effect: base };
      } else {
        // From per-hand
        const leftEffect = localMap["0"]?.effect ?? "none";
        const rightEffect = localMap["1"]?.effect ?? "none";
        for (let t = 0; t < leftTipCount; t++)
          newMap[`0-${t}`] = { effect: leftEffect };
        for (let t = 0; t < rightTipCount; t++)
          newMap[`1-${t}`] = { effect: rightEffect };
      }
    }

    scope = newScope;
    localMap = newMap;
    allProps.onUpdateMap(localMap);
  }

  function mostCommonEffect(keys: string[]): EffectType {
    const counts: Record<string, number> = {};
    for (const k of keys) {
      const e = localMap[k]?.effect ?? "none";
      counts[e] = (counts[e] ?? 0) + 1;
    }
    // If no keys at all, fall back to cell-wide or "none"
    if (Object.keys(counts).length === 0) {
      return localMap["*"]?.effect ?? "none";
    }
    let best: EffectType = "none";
    let bestCount = 0;
    for (const [e, c] of Object.entries(counts)) {
      if (c > bestCount) {
        best = e as EffectType;
        bestCount = c;
      }
    }
    return best;
  }

  function inferScope(map: TipEffectMap): Scope {
    const keys = Object.keys(map);
    if (keys.length === 0 || (keys.length === 1 && keys[0] === "*"))
      return "cell";
    if (keys.some((k) => k.includes("-"))) return "tip";
    if (keys.includes("0") || keys.includes("1")) return "hand";
    return "cell";
  }
</script>

<div class="matrix-overlay">
  <div class="matrix-panel">
    <!-- Header -->
    <header class="panel-header">
      <h3 class="panel-title">
        <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
        Effect Matrix
      </h3>
      <button class="done-btn" onclick={allProps.onClose}
        >{t("train_filter_done")}</button
      >
    </header>

    <!-- Scope selector -->
    <div class="scope-section">
      <span class="scope-label" id="effect-scope-label"
        >{t("compose_ui_scope")}</span
      >
      <div
        class="scope-strip"
        role="radiogroup"
        aria-labelledby="effect-scope-label"
      >
        {#each scopes as s}
          <button
            class="scope-seg"
            class:active={scope === s.value}
            role="radio"
            aria-checked={scope === s.value}
            onclick={() => switchScope(s.value)}
          >
            <i class="fas {s.icon}" aria-hidden="true"></i>
            {s.label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Channel rows -->
    <div class="matrix-section">
      {#each channels as ch (ch.key)}
        <div class="channel">
          <div class="channel-id">
            <span class="channel-dot" style:background={ch.color}></span>
            <span class="channel-label">{ch.label}</span>
          </div>
          <div class="channel-effects">
            {#each effectDefs as eff}
              <button
                class="effect-btn {eff.cssClass}"
                class:active={getEffectForKey(ch.key) === eff.value}
                title={eff.label}
                aria-label="Apply {eff.label} effect to {ch.label}"
                onclick={() => setEffect(ch.key, eff.value)}
              >
                <i class="fas {eff.icon}" aria-hidden="true"></i>
              </button>
            {/each}
          </div>
        </div>
      {/each}

      <!-- Quick-apply bar -->
      <div class="quick-apply">
        <span class="quick-apply-label">Apply to all:</span>
        <div class="quick-apply-btns">
          {#each effectDefs as eff}
            <button class="quick-btn" onclick={() => applyToAll(eff.value)}>
              <i class="fas {eff.icon}" aria-hidden="true"></i>
              {eff.label}
            </button>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .matrix-overlay {
    /* Effect-identity palette - deliberately component-scoped, not global
       tokens. Each effect keeps its own recognizable hue (fire orange,
       charcoal violet, LED green, trails blue); mapping these to semantic
       status tokens would conflate effect identity with status meaning. */
    --effect-fire: #f97316;
    --effect-fire-bright: #fb923c;
    --effect-charcoal: #a855f7;
    --effect-charcoal-bright: #a78bfa;
    --effect-led: #22c55e;
    --effect-led-bright: #4ade80;
    --effect-trails: #60a5fa;

    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: slideDown 180ms ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .matrix-panel {
    display: flex;
    flex-direction: column;
  }

  /* Header */
  .panel-header {
    padding: 16px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .panel-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--theme-text, white);
  }

  .panel-title i {
    opacity: 0.5;
    font-size: 13px;
  }

  .done-btn {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.35);
    cursor: pointer;
    background: none;
    border: none;
    padding: 6px 10px;
    border-radius: 6px;
    min-height: 44px;
    min-width: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 150ms ease;
  }

  .done-btn:hover {
    color: rgba(255, 255, 255, 0.7);
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
  }

  /* Scope selector */
  .scope-section {
    padding: 14px 20px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .scope-label {
    font-size: var(--font-size-compact, 12px);
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.2));
    font-weight: 600;
    margin-bottom: 8px;
    display: block;
  }

  .scope-strip {
    display: flex;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    border-radius: 10px;
    overflow: hidden;
  }

  .scope-seg {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 8px;
    min-height: 44px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.45);
    background: transparent;
    border: none;
    border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    transition: all 150ms ease;
  }

  .scope-seg:last-child {
    border-right: none;
  }

  .scope-seg:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.05));
    color: rgba(255, 255, 255, 0.7);
  }

  .scope-seg.active {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 15%,
      transparent
    );
    color: var(--theme-accent-light, #c084fc);
    box-shadow: inset 0 -2px 0 var(--theme-accent-strong, #a855f7);
  }

  .scope-seg i {
    font-size: 14px;
  }

  /* Matrix section */
  .matrix-section {
    padding: 16px 20px;
    flex: 1;
    overflow-y: auto;
  }

  /* Channel row */
  .channel {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    border-radius: 10px;
    margin-bottom: 8px;
    min-height: 56px;
    transition: border-color 150ms ease;
  }

  .channel:hover {
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }

  .channel-id {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 48px;
  }

  .channel-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
  }

  .channel-label {
    font-size: var(--font-size-compact, 12px);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: rgba(255, 255, 255, 0.3);
    font-weight: 600;
    text-align: center;
  }

  /* Effect buttons in channel */
  .channel-effects {
    display: flex;
    gap: 4px;
    flex: 1;
    flex-wrap: wrap;
  }

  .effect-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    cursor: pointer;
    transition: all 120ms ease;
  }

  .effect-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.15));
  }

  .effect-btn i {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.4);
  }

  /* Active states with colored tints */
  .effect-btn.active {
    border-width: 1.5px;
  }

  .effect-btn.active.eff-none {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }
  .effect-btn.active.eff-none i {
    color: rgba(255, 255, 255, 0.7);
  }

  .effect-btn.active.eff-fire {
    background: color-mix(in srgb, var(--effect-fire) 15%, transparent);
    border-color: color-mix(in srgb, var(--effect-fire) 40%, transparent);
  }
  .effect-btn.active.eff-fire i {
    color: var(--effect-fire-bright);
  }

  .effect-btn.active.eff-charcoal {
    background: color-mix(in srgb, var(--effect-charcoal) 15%, transparent);
    border-color: color-mix(in srgb, var(--effect-charcoal) 40%, transparent);
  }
  .effect-btn.active.eff-charcoal i {
    color: var(--effect-charcoal-bright);
  }

  .effect-btn.active.eff-led {
    background: color-mix(in srgb, var(--effect-led) 15%, transparent);
    border-color: color-mix(in srgb, var(--effect-led) 40%, transparent);
  }
  .effect-btn.active.eff-led i {
    color: var(--effect-led-bright);
  }

  .effect-btn.active.eff-trails {
    background: color-mix(in srgb, var(--effect-trails) 15%, transparent);
    border-color: color-mix(in srgb, var(--effect-trails) 40%, transparent);
  }
  .effect-btn.active.eff-trails i {
    color: var(--effect-trails);
  }

  /* Quick-apply bar */
  .quick-apply {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    padding: 10px 14px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.02));
    border: 1px dashed var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
  }

  .quick-apply-label {
    font-size: var(--font-size-compact, 12px);
    color: rgba(255, 255, 255, 0.3);
    flex-shrink: 0;
  }

  .quick-apply-btns {
    display: flex;
    gap: 4px;
    flex: 1;
    flex-wrap: wrap;
  }

  .quick-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 10px;
    min-height: 44px;
    border-radius: 6px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    transition: all 120ms ease;
  }

  .quick-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    color: rgba(255, 255, 255, 0.8);
  }

  .quick-btn i {
    font-size: 11px;
  }

  @media (prefers-reduced-motion: reduce) {
    .matrix-overlay {
      animation: none;
    }

    .scope-seg,
    .effect-btn,
    .quick-btn,
    .done-btn,
    .channel {
      transition: none;
    }
  }
</style>
