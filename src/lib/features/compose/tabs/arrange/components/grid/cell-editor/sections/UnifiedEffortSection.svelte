<!--
  UnifiedEffortSection.svelte

  v4 mockup: accordion row showing current effort dot + label + chevron.
  Expands to reveal quick-apply preset grid + scope selector + channel matrix.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { TipEffortMap } from "$lib/shared/animation-engine/domain/types/tip-effect-types";
  import type { EffortId } from "$lib/shared/effort/domain/effort-types";
  import { EFFORTS } from "$lib/shared/effort/domain/effort-types";
  import { getTipPoints } from "$lib/shared/animation-engine/domain/types/prop-tip-points";
  import { getTipLabel } from "$lib/shared/animation-engine/domain/tip-label";

  type Scope = "cell" | "hand" | "tip";

  let {
    currentEffort,
    currentMap,
    leftPropType,
    rightPropType,
    onSetEffort,
    onUpdateMap,
  }: {
    currentEffort: string | undefined;
    currentMap: TipEffortMap;
    leftPropType: string;
    rightPropType: string;
    onSetEffort: (effort: string) => void;
    onUpdateMap: (map: TipEffortMap) => void;
  } = $props();

  const scopes: { value: Scope; label: string; icon: string }[] = [
    { value: "cell", label: "Cell", icon: "fa-border-all" },
    { value: "hand", label: "Per Hand", icon: "fa-hand" },
    { value: "tip", label: "Per Tip", icon: "fa-crosshairs" },
  ];

  let expanded: boolean = $state(false);
  let scope: Scope = $state<Scope>("cell");
  let localMap: TipEffortMap = $state<TipEffortMap>({});

  $effect.pre(() => {
    scope = inferScope(currentMap);
    localMap = { ...currentMap };
  });

  const leftTipCount = $derived(getTipPoints(leftPropType).points.length);
  const rightTipCount = $derived(getTipPoints(rightPropType).points.length);

  const activeEffortMeta = $derived(
    EFFORTS.find((e) => e.id === currentEffort) ??
      EFFORTS.find(() => true) ?? {
        id: "linear",
        label: "Linear",
        color: "#a855f7",
      }
  );

  interface ChannelRow {
    key: string;
    color: string;
    label: string;
  }

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
    const rows: ChannelRow[] = [];
    for (let t = 0; t < leftTipCount; t++) {
      rows.push({
        key: `0-${t}`,
        color: "#3b82f6",
        label: `Left ${getTipLabel(leftPropType, t).toLowerCase()}`,
      });
    }
    for (let t = 0; t < rightTipCount; t++) {
      rows.push({
        key: `1-${t}`,
        color: "#ef4444",
        label: `Right ${getTipLabel(rightPropType, t).toLowerCase()}`,
      });
    }
    return rows;
  });

  function getEffortForKey(key: string): EffortId {
    return localMap[key]?.effort ?? "linear";
  }

  function setEffort(key: string, effort: EffortId) {
    localMap = { ...localMap, [key]: { effort } };
    onUpdateMap(localMap);
  }

  function applyToAll(effortId: string) {
    onSetEffort(effortId);
    const newMap: TipEffortMap = {};
    for (const ch of channels) {
      newMap[ch.key] = { effort: effortId as EffortId };
    }
    localMap = newMap;
    onUpdateMap(localMap);
  }

  function switchScope(newScope: Scope) {
    if (newScope === scope) return;
    const oldScope = scope;
    const newMap: TipEffortMap = {};

    if (newScope === "cell") {
      const most = mostCommonEffort(Object.keys(localMap));
      newMap["*"] = { effort: most };
    } else if (newScope === "hand") {
      if (oldScope === "tip") {
        const leftKeys = Object.keys(localMap).filter((k) =>
          k.startsWith("0-")
        );
        const rightKeys = Object.keys(localMap).filter((k) =>
          k.startsWith("1-")
        );
        newMap["0"] = { effort: mostCommonEffort(leftKeys) };
        newMap["1"] = { effort: mostCommonEffort(rightKeys) };
      } else {
        const base = localMap["*"]?.effort ?? "linear";
        newMap["0"] = { effort: base };
        newMap["1"] = { effort: base };
      }
    } else {
      if (oldScope === "cell") {
        const base = localMap["*"]?.effort ?? "linear";
        for (let t = 0; t < leftTipCount; t++)
          newMap[`0-${t}`] = { effort: base };
        for (let t = 0; t < rightTipCount; t++)
          newMap[`1-${t}`] = { effort: base };
      } else {
        const leftEffort = localMap["0"]?.effort ?? "linear";
        const rightEffort = localMap["1"]?.effort ?? "linear";
        for (let t = 0; t < leftTipCount; t++)
          newMap[`0-${t}`] = { effort: leftEffort };
        for (let t = 0; t < rightTipCount; t++)
          newMap[`1-${t}`] = { effort: rightEffort };
      }
    }

    scope = newScope;
    localMap = newMap;
    onUpdateMap(localMap);
  }

  function mostCommonEffort(keys: string[]): EffortId {
    const counts: Record<string, number> = {};
    for (const k of keys) {
      const e = localMap[k]?.effort ?? "linear";
      counts[e] = (counts[e] ?? 0) + 1;
    }
    if (Object.keys(counts).length === 0) {
      return localMap["*"]?.effort ?? "linear";
    }
    let best: EffortId = "linear";
    let bestCount = 0;
    for (const [e, c] of Object.entries(counts)) {
      if (c > bestCount) {
        best = e as EffortId;
        bestCount = c;
      }
    }
    return best;
  }

  function inferScope(map: TipEffortMap): Scope {
    const keys = Object.keys(map);
    if (keys.length === 0 || (keys.length === 1 && keys[0] === "*"))
      return "cell";
    if (keys.some((k) => k.includes("-"))) return "tip";
    if (keys.includes("0") || keys.includes("1")) return "hand";
    return "cell";
  }
</script>

<div class="effort-section">
  <!-- Section header -->
  <span class="section-heading">EFFORT</span>

  <!-- Accordion trigger row -->
  <button
    class="accordion-row"
    class:expanded
    aria-expanded={expanded}
    onclick={() => (expanded = !expanded)}
  >
    <span class="current-dot" style:background={activeEffortMeta.color}></span>
    <span class="current-label">{activeEffortMeta.label}</span>
    <i class="fas fa-chevron-right chevron" aria-hidden="true"></i>
  </button>

  <!-- Collapsible body -->
  {#if expanded}
    <div class="accordion-body">
      <!-- Quick-apply preset grid -->
      <div
        class="chip-grid"
        role="radiogroup"
        aria-label={t("compose_ui_effort_quality")}
      >
        {#each EFFORTS as effort}
          <button
            class="chip"
            class:active={currentEffort === effort.id}
            role="radio"
            aria-checked={currentEffort === effort.id}
            onclick={() => applyToAll(effort.id)}
            style:--chip-color={effort.color}
          >
            <span class="color-dot" style:background={effort.color}></span>
            {effort.label}
          </button>
        {/each}
      </div>

      <!-- Scope selector -->
      <div class="scope-section">
        <span class="scope-label" id="effort-scope-label"
          >{t("compose_ui_scope")}</span
        >
        <div
          class="scope-strip"
          role="radiogroup"
          aria-labelledby="effort-scope-label"
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

      <!-- Channel rows with per-channel effort grids -->
      <div class="matrix-rows">
        {#each channels as ch (ch.key)}
          <div class="channel">
            <div class="channel-id">
              <span class="channel-dot" style:background={ch.color}></span>
              <span class="channel-name">{ch.label}</span>
            </div>
            <div class="effort-grid">
              {#each EFFORTS as effort}
                <button
                  class="effort-btn"
                  class:active={getEffortForKey(ch.key) === effort.id}
                  title={effort.label}
                  onclick={() => setEffort(ch.key, effort.id)}
                  style:--effort-color={effort.color}
                >
                  <span class="effort-dot" style:background={effort.color}
                  ></span>
                  <span class="effort-label">{effort.label}</span>
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .effort-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .section-heading {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: rgba(255, 255, 255, 0.7);
  }

  .accordion-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    min-height: 44px;
    width: 100%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    border-radius: 8px;
    cursor: pointer;
    transition:
      background 150ms ease,
      border-color 150ms ease;
    text-align: left;
  }

  .accordion-row:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }

  .accordion-row.expanded {
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }

  .current-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .current-label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.75);
    font-weight: 500;
    flex: 1;
  }

  .chevron {
    margin-left: auto;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.6);
    transition: transform 180ms ease;
    flex-shrink: 0;
  }

  .accordion-row.expanded .chevron {
    transform: rotate(90deg);
  }

  .accordion-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.02));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    border-top: none;
    border-radius: 0 0 8px 8px;
    animation: slideDown 180ms ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .chip-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--chip-gap, 6px);
  }

  .chip {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px clamp(12px, 3cqi, 14px);
    min-height: 44px;
    border-radius: 8px;
    background: var(--surface-idle, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--stroke-idle, rgba(255, 255, 255, 0.08));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .chip:hover {
    background: var(--surface-hover, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, rgba(255, 255, 255, 0.9));
  }

  .chip.active {
    background: color-mix(
      in srgb,
      var(--chip-color, #a855f7) var(--surface-active-pct, 12%),
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--chip-color, #a855f7) var(--stroke-active-pct, 35%),
      transparent
    );
    color: var(--chip-color, #a855f7);
  }

  .color-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .scope-section {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .scope-label {
    font-size: var(--font-size-compact, 12px);
    text-transform: uppercase;
    letter-spacing: 1px;
    color: rgba(255, 255, 255, 0.2);
    font-weight: 600;
    flex-shrink: 0;
  }

  .scope-strip {
    display: flex;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    border-radius: 10px;
    overflow: hidden;
    flex: 1;
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

  .matrix-rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .channel {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 9px 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    border-radius: 10px;
    min-height: 48px;
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
    /* Wide enough for the 12px channel name to wrap cleanly ("Right thumb") */
    min-width: 48px;
    padding-top: 8px;
  }

  .channel-dot {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
  }

  .channel-name {
    font-size: var(--font-size-compact, 12px);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: rgba(255, 255, 255, 0.25);
    font-weight: 600;
    text-align: center;
  }

  .effort-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    flex: 1;
  }

  .effort-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: 44px;
    padding: 6px 4px;
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    cursor: pointer;
    transition: all 120ms ease;
  }

  .effort-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.15));
  }

  .effort-btn.active {
    background: color-mix(in srgb, var(--effort-color) 15%, transparent);
    border: 1.5px solid color-mix(in srgb, var(--effort-color) 40%, transparent);
  }

  .effort-btn .effort-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .effort-btn .effort-label {
    font-size: var(--font-size-compact, 12px);
    color: rgba(255, 255, 255, 0.4);
    font-weight: 500;
    /* Long names ("Anticipation") truncate instead of overflowing the dense
       4-column grid; the button's title attribute carries the full label */
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .effort-btn.active .effort-label {
    color: var(--effort-color);
  }

  @media (prefers-reduced-motion: reduce) {
    .accordion-body {
      animation: none;
    }
    .chevron {
      transition: none;
    }
    .accordion-row,
    .chip,
    .scope-seg,
    .effort-btn,
    .channel {
      transition: none;
    }
  }
</style>
