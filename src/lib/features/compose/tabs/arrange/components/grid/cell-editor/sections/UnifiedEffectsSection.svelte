<!--
  UnifiedEffectsSection.svelte

  Cell scope offers the effects supported by the cell-level setting.
  Hand and tip scopes offer the full renderer registry.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type {
    TipEffectMap,
    EffectType,
  } from "$lib/shared/animation-engine/domain/types/tip-effect-types";
  import { getTipPoints } from "$lib/shared/animation-engine/domain/types/prop-tip-points";
  import { getTipLabel } from "$lib/shared/animation-engine/domain/tip-label";
  import type { CellEffect } from "$lib/shared/animation-engine/domain/compose-types";
  import { EFFECTS } from "$lib/shared/animation-engine/components/effects-panel/effect-registry";

  const SHIPPED_CELL_EFFECTS = new Set<string>([
    "none",
    "fire",
    "charcoal",
    "led",
    "trails",
  ]);
  import { TrailMode } from "$lib/shared/animation-engine/domain/types/trail-types";

  type Scope = "cell" | "hand" | "tip";

  let {
    currentEffect,
    currentTrailMode,
    currentMap,
    leftPropType,
    rightPropType,
    onSetEffect,
    onSetTrailMode,
    onUpdateMap,
  }: {
    currentEffect: CellEffect;
    currentTrailMode: TrailMode | undefined;
    currentMap: TipEffectMap;
    leftPropType: string;
    rightPropType: string;
    onSetEffect: (effect: CellEffect) => void;
    onSetTrailMode: (mode: TrailMode) => void;
    onUpdateMap: (map: TipEffectMap) => void;
  } = $props();

  // Single source of truth for effect color/icon/label - the canonical
  // effect-registry, same as the 2D animation panel and the 3D effects panel.
  // (Was 16 hardcoded hexes here, 11 of which had drifted out of sync.)
  const effectGrid: {
    value: EffectType;
    icon: string;
    color: string;
    label: string;
  }[] = EFFECTS.map((e) => ({
    value: e.id as EffectType,
    icon: e.icon,
    color: e.color,
    label: e.label,
  }));
  const cellEffectGrid = effectGrid.filter((effect) => SHIPPED_CELL_EFFECTS.has(effect.value));

  const trailModes: { value: TrailMode; label: string }[] = [
    { value: TrailMode.FADE, label: "Fade" },
    { value: TrailMode.PERSISTENT, label: "Persistent" },
    { value: TrailMode.LOOP_CLEAR, label: "Loop Clear" },
  ];

  const scopes: { value: Scope; label: string; icon: string }[] = [
    { value: "cell", label: "Cell", icon: "fa-border-all" },
    { value: "hand", label: "Hand", icon: "fa-hand" },
    { value: "tip", label: "Tip", icon: "fa-crosshairs" },
  ];

  let scope: Scope = $state<Scope>("cell");
  let localMap: TipEffectMap = $state<TipEffectMap>({});
  let targetKey: string = $state("*");

  $effect.pre(() => {
    scope = inferScope(currentMap);
    localMap = { ...currentMap };
  });

  const leftTipCount = $derived(getTipPoints(leftPropType).points.length);
  const rightTipCount = $derived(getTipPoints(rightPropType).points.length);

  interface ChannelRow {
    key: string;
    color: string;
    label: string;
  }

  const channels: ChannelRow[] = $derived.by(() => {
    if (scope === "hand") {
      return [
        { key: "0", color: "#3b82f6", label: "Left" },
        { key: "1", color: "#ef4444", label: "Right" },
      ];
    }
    if (scope === "tip") {
      const rows: ChannelRow[] = [];
      for (let t = 0; t < leftTipCount; t++) {
        rows.push({
          key: `0-${t}`,
          color: "#3b82f6",
          label: `Left ${getTipLabel(leftPropType, t)}`,
        });
      }
      for (let t = 0; t < rightTipCount; t++) {
        rows.push({
          key: `1-${t}`,
          color: "#ef4444",
          label: `Right ${getTipLabel(rightPropType, t)}`,
        });
      }
      return rows;
    }
    return [];
  });

  const gridTargetEffect = $derived.by<EffectType>(() => {
    if (scope === "cell") return localMap["*"]?.effect ?? currentEffect as EffectType;
    return localMap[targetKey]?.effect ?? "none";
  });
  const visibleEffectGrid = $derived(scope === "cell" ? cellEffectGrid : effectGrid);

  const gridTargetLabel = $derived.by(() => {
    if (scope === "cell") return "SELECT EFFECT";
    const ch = channels.find((c) => c.key === targetKey);
    return ch ? `EFFECT FOR ${ch.label.toUpperCase()}` : "SELECT EFFECT";
  });

  function getEffectMeta(effect: EffectType) {
    if (effect === "none")
      return { icon: "fa-ban", color: "#9ca3af", label: "None" };
    return (
      effectGrid.find((e) => e.value === effect) ?? {
        icon: "fa-ban",
        color: "#9ca3af",
        label: "None",
      }
    );
  }

  function handleGridTap(effect: EffectType) {
    if (scope === "cell") {
      if (!SHIPPED_CELL_EFFECTS.has(effect)) return;
      const next: CellEffect = gridTargetEffect === effect ? "none" : effect as CellEffect;
      localMap = { "*": { effect: next } };
      onSetEffect(next);
      onUpdateMap(localMap);
      return;
    }
    const current = localMap[targetKey]?.effect ?? "none";
    const next = current === effect ? "none" : effect;
    localMap = { ...localMap, [targetKey]: { effect: next } };
    onUpdateMap(localMap);
  }

  function switchScope(newScope: Scope) {
    if (newScope === scope) return;
    const oldScope = scope;
    const newMap: TipEffectMap = {};

    if (newScope === "cell") {
      const most = mostCommonEffect(Object.keys(localMap));
      const cellEffect = SHIPPED_CELL_EFFECTS.has(most) ? most as CellEffect : "none";
      newMap["*"] = { effect: cellEffect };
      onSetEffect(cellEffect);
      targetKey = "*";
    } else if (newScope === "hand") {
      if (oldScope === "tip") {
        const leftKeys = Object.keys(localMap).filter((k) =>
          k.startsWith("0-")
        );
        const rightKeys = Object.keys(localMap).filter((k) =>
          k.startsWith("1-")
        );
        newMap["0"] = { effect: mostCommonEffect(leftKeys) };
        newMap["1"] = { effect: mostCommonEffect(rightKeys) };
      } else {
        const base = currentEffect as EffectType;
        newMap["0"] = { effect: base };
        newMap["1"] = { effect: base };
      }
      targetKey = "0";
    } else {
      const base =
        oldScope === "cell"
          ? (currentEffect as EffectType)
          : (localMap["0"]?.effect ?? "none");
      const redBase =
        oldScope === "hand" ? (localMap["1"]?.effect ?? "none") : base;
      for (let t = 0; t < leftTipCount; t++)
        newMap[`0-${t}`] = { effect: base };
      for (let t = 0; t < rightTipCount; t++)
        newMap[`1-${t}`] = { effect: redBase };
      targetKey = "0-0";
    }

    scope = newScope;
    localMap = newMap;
    onUpdateMap(localMap);
  }

  function mostCommonEffect(keys: string[]): EffectType {
    const counts: Record<string, number> = {};
    for (const k of keys) {
      const e = localMap[k]?.effect ?? "none";
      counts[e] = (counts[e] ?? 0) + 1;
    }
    if (Object.keys(counts).length === 0) return currentEffect as EffectType;
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

<div class="unified-effects">
  <!-- Scope selector -->
  <div class="scope-row">
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

  <!-- Channel rows (hand/tip only) -->
  {#if scope !== "cell"}
    <span class="assign-label"
      >ASSIGN PER {scope === "hand" ? "HAND" : "TIP"}</span
    >
    <div class="channels">
      {#each channels as ch (ch.key)}
        {@const chEffect = localMap[ch.key]?.effect ?? "none"}
        {@const meta = getEffectMeta(chEffect)}
        {@const isTarget = targetKey === ch.key}
        <button
          class="ch-row"
          class:target={isTarget}
          onclick={() => {
            targetKey = ch.key;
          }}
        >
          <span class="ch-dot" style:background={ch.color}></span>
          <span class="ch-label">{ch.label}</span>
          <span
            class="ch-badge"
            class:none={chEffect === "none"}
            style:--c={meta.color}
          >
            <i class="fas {meta.icon}" aria-hidden="true"></i>
            {meta.label}
          </span>
        </button>
      {/each}
    </div>
    <span class="grid-hint">
      <i class="fas fa-arrow-down" aria-hidden="true"></i>
      Grid targets: {channels.find((c) => c.key === targetKey)?.label ?? ""}
    </span>
  {/if}

  <!-- Header -->
  <span class="section-header">{gridTargetLabel}</span>

  <!-- Available effects for the chosen scope -->
  <div
    class="effect-grid"
    role="radiogroup"
    aria-label={t("compose_ui_visual_effect")}
  >
    {#each visibleEffectGrid as eff}
      {@const isActive = gridTargetEffect === eff.value}
      <button
        class="grid-cell"
        class:active={isActive}
        role="radio"
        aria-checked={isActive}
        aria-label="{eff.label}{isActive ? ' (active, tap to remove)' : ''}"
        title={eff.label}
        onclick={() => handleGridTap(eff.value)}
        style:--c={eff.color}
      >
        <i class="fas {eff.icon}" aria-hidden="true"></i>
      </button>
    {/each}
  </div>

  <!-- Trail mode sub-group -->
  {#if gridTargetEffect === "trails"}
    <div class="sub-group">
      <span class="sub-label" id="trail-mode-label">TRAIL MODE</span>
      <div
        class="trail-chips"
        role="radiogroup"
        aria-labelledby="trail-mode-label"
      >
        {#each trailModes as mode}
          <button
            class="trail-chip"
            class:active={currentTrailMode === mode.value}
            role="radio"
            aria-checked={currentTrailMode === mode.value}
            onclick={() => onSetTrailMode(mode.value)}
          >
            {mode.label}
          </button>
        {/each}
      </div>
    </div>
  {/if}

</div>

<style>
  .unified-effects {
    display: flex;
    flex-direction: column;
    gap: 8px;
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

  .section-header {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: rgba(255, 255, 255, 0.7);
  }

  .scope-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .scope-label {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: rgba(255, 255, 255, 0.7);
    font-weight: 600;
    flex-shrink: 0;
  }

  .scope-strip {
    display: flex;
    flex: 1;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    border-radius: 8px;
    overflow: hidden;
  }

  .scope-seg {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 6px 4px;
    min-height: 44px;
    cursor: pointer;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
    background: transparent;
    border: none;
    border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    transition:
      background 150ms ease,
      color 150ms ease;
  }

  .scope-seg:last-child {
    border-right: none;
  }

  .scope-seg:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.05));
  }

  .scope-seg.active {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 15%,
      transparent
    );
    color: var(--theme-accent-light, #d4b4ff);
    box-shadow: inset 0 -2px 0 var(--theme-accent-strong, #a855f7);
  }

  .scope-seg i {
    font-size: 11px;
  }

  .assign-label {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: rgba(255, 255, 255, 0.7);
  }

  .channels {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .ch-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    min-height: 44px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    border-radius: 8px;
    cursor: pointer;
    transition:
      border-color 150ms ease,
      background 150ms ease;
  }

  .ch-row:hover {
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }

  .ch-row.target {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 40%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 6%,
      transparent
    );
    box-shadow: 0 0 0 1px
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 15%, transparent);
  }

  .ch-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .ch-label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.72);
    font-weight: 500;
    min-width: 60px;
  }

  .ch-row.target .ch-label {
    color: rgba(255, 255, 255, 0.85);
  }

  .ch-badge {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-left: auto;
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
    background: color-mix(in srgb, var(--c) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--c) 30%, transparent);
    color: var(--c);
  }

  .ch-badge i {
    font-size: 12px;
  }

  .ch-badge.none {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.08));
    color: rgba(255, 255, 255, 0.7);
  }

  .grid-hint {
    font-size: 12px;
    color: color-mix(
      in srgb,
      var(--theme-accent-light, #a78bfa) 90%,
      transparent
    );
    text-align: center;
    padding: 2px 0;
    font-weight: 500;
    letter-spacing: 0.3px;
  }

  .grid-hint i {
    font-size: 10px;
  }

  /* ── Effect icon grid ───────────────────────────────────── */
  .effect-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
  }

  .grid-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    color: rgba(255, 255, 255, 0.55);
    cursor: pointer;
    transition:
      background 150ms ease,
      border-color 150ms ease,
      color 150ms ease;
  }

  .grid-cell i {
    font-size: 18px;
    pointer-events: none;
  }

  .grid-cell:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    color: rgba(255, 255, 255, 0.8);
  }

  .grid-cell.active {
    border: 1.5px solid var(--c);
    background: color-mix(in srgb, var(--c) 14%, transparent);
    color: var(--c);
  }

  .sub-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .sub-label {
    font-size: var(--font-size-compact, 12px);
    text-transform: uppercase;
    letter-spacing: 1px;
    color: rgba(255, 255, 255, 0.4);
    font-weight: 600;
  }

  .trail-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .trail-chip {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 14px;
    min-height: 44px;
    border-radius: 22px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    color: rgba(255, 255, 255, 0.6);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition:
      background 150ms ease,
      color 150ms ease;
  }

  .trail-chip:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    color: rgba(255, 255, 255, 0.9);
  }

  .trail-chip.active {
    background: color-mix(
      in srgb,
      var(--theme-accent, #60a5fa) 14%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #60a5fa) 35%,
      transparent
    );
    color: var(--theme-accent, #60a5fa);
  }

  @media (prefers-reduced-motion: reduce) {
    .unified-effects {
      animation: none;
    }
    .grid-cell,
    .trail-chip,
    .scope-seg,
    .ch-row {
      transition: none;
    }
  }
</style>
