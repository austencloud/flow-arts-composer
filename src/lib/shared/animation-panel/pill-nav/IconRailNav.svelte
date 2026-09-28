<!--
  IconRailNav.svelte

  Generic vertical icon-bar tablist. The pill id type `T` is a free string
  union supplied by the consumer (AnimationPanel passes PillId; the Art panel
  passes its own tunnel/mandala id unions), so this rail is reusable beyond the
  Download-Animation panel. Each pill renders live prop artwork, a FontAwesome
  `icon`, or an accent dot (used by Effort).
-->
<script lang="ts" generics="T extends string">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import RailPropGlyph from "$lib/shared/components/RailPropGlyph.svelte";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { FanAppearance } from "$lib/shared/pictograph/prop/domain/fan-appearance";

  interface RailPill {
    id: T;
    /** FontAwesome class, e.g. "fa-wand-magic-sparkles". Omit for an accent dot. */
    icon?: string;
    /** The current prop itself is more informative than a generic Props glyph. */
    propType?: PropType;
    fanAppearance?: FanAppearance;
    label: string;
    /** Optional one-line summary surfaced in the button title tooltip. */
    summary?: string;
    /** Optional accent color override (Effort sets this so the active glow matches). */
    accentColor?: string;
  }

  let {
    pills,
    activeId,
    onSelect,
    onNavMount,
    alignment = "center",
    reservedSlots = 0,
  }: {
    pills: RailPill[];
    activeId: T | null;
    onSelect: (id: T) => void;
    onNavMount?: (el: HTMLElement | null) => void;
    alignment?: "start" | "center";
    /** Reserve mode-specific slots without moving the common section buttons. */
    reservedSlots?: number;
  } = $props();

  let navEl: HTMLElement | undefined = $state();

  $effect(() => {
    onNavMount?.(navEl ?? null);
    return () => onNavMount?.(null);
  });

  function focusPillAt(index: number) {
    const wrapped = ((index % pills.length) + pills.length) % pills.length;
    const pill = pills[wrapped];
    if (!pill) return;
    const target = navEl?.querySelector<HTMLButtonElement>(
      `[data-pill-id="${pill.id}"]`
    );
    target?.focus();
  }

  function handleKeydown(e: KeyboardEvent) {
    const target = e.currentTarget as HTMLButtonElement;
    const currentIndex = pills.findIndex((p) => p.id === target.dataset.pillId);
    if (currentIndex === -1) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusPillAt(currentIndex + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusPillAt(currentIndex - 1);
        break;
      case "Home":
        e.preventDefault();
        focusPillAt(0);
        break;
      case "End":
        e.preventDefault();
        focusPillAt(pills.length - 1);
        break;
      case " ":
      case "Enter": {
        e.preventDefault();
        const pill = pills[currentIndex];
        if (pill) onSelect(pill.id);
        break;
      }
    }
  }
</script>

<div
  class="icon-rail"
  class:align-start={alignment === "start"}
  class:reserved-slots={reservedSlots > 0}
  style:--rail-slots={Math.max(reservedSlots, pills.length)}
  role="tablist"
  aria-orientation="vertical"
  aria-label={t("viewer_ui_editor_sections")}
  bind:this={navEl}
>
  {#each pills as pill (pill.id)}
    <button
      type="button"
      role="tab"
      class="rail-btn"
      data-pill-id={pill.id}
      aria-selected={activeId === pill.id}
      aria-label={pill.label}
      title="{pill.label}{pill.summary ? `: ${pill.summary}` : ''}"
      data-ghost={activeId === pill.id ? undefined : "safe"}
      data-ghost-kind={activeId === pill.id ? undefined : "curio"}
      data-ghost-label={pill.label}
      style:--pill-accent={pill.accentColor ?? null}
      onclick={() => onSelect(pill.id)}
      onkeydown={handleKeydown}
    >
      <span class="rail-glyph">
        {#if pill.propType}
          <RailPropGlyph
            propType={pill.propType}
            fanAppearance={pill.fanAppearance}
            size={26}
          />
        {:else if pill.icon}
          <i class="fas {pill.icon}" aria-hidden="true"></i>
        {:else}
          <span
            class="effort-dot"
            style:background={pill.accentColor ?? "#94a3b8"}
          ></span>
        {/if}
      </span>
      <span class="rail-copy">
        <span class="rail-label">{pill.label}</span>
        {#if pill.summary}<span class="rail-summary">{pill.summary}</span>{/if}
      </span>
    </button>
  {/each}
</div>

<style>
  .icon-rail {
    width: 64px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 10px 4px;
    gap: 8px;
  }

  .icon-rail.align-start {
    justify-content: flex-start;
  }

  .icon-rail.reserved-slots {
    display: grid;
    grid-template-rows: repeat(var(--rail-slots), 56px);
    align-content: safe center;
    justify-items: center;
    overflow-y: auto;
  }

  /* Mirrors the 3D viewer rail-chip visual language (ViewerPopover.svelte .rail-chip):
     glassmorphic chips, blur, drop shadow, scale-on-hover — clearly clickable. */
  .rail-btn {
    box-sizing: border-box;
    width: 56px;
    height: 56px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    color: color-mix(
      in srgb,
      var(--pill-accent, var(--theme-text-dim, rgba(255, 255, 255, 0.62))) 42%,
      var(--theme-text-dim, rgba(255, 255, 255, 0.62))
    );
    background: rgba(20, 22, 32, 0.78);
    backdrop-filter: blur(20px) saturate(140%);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    cursor: pointer;
    transition: all 180ms cubic-bezier(0.2, 0, 0.13, 1.5);
    -webkit-tap-highlight-color: transparent;
  }

  .rail-btn:hover:not([aria-selected="true"]) {
    transform: scale(1.08);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.22));
    color: color-mix(
      in srgb,
      var(--pill-accent, var(--theme-text, rgba(255, 255, 255, 0.85))) 68%,
      var(--theme-text, rgba(255, 255, 255, 0.85))
    );
  }

  .rail-btn:focus-visible {
    outline: 2px solid var(--pill-focus, #4a9eff);
    outline-offset: 2px;
  }

  .rail-btn[aria-selected="true"] {
    background: color-mix(
      in srgb,
      var(--pill-accent, #8b5cf6) 18%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--pill-accent, #a855f7) 50%,
      transparent
    );
    color: color-mix(in srgb, var(--pill-accent, #d4b4ff) 100%, white);
    box-shadow: 0 4px 20px
      color-mix(in srgb, var(--pill-accent, #8b5cf6) 25%, transparent);
  }

  .effort-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
  }

  .rail-glyph {
    display: grid;
    width: 26px;
    height: 26px;
    flex: 0 0 auto;
    place-items: center;
  }

  .rail-copy {
    display: none;
    min-width: 0;
  }

  .rail-label,
  .rail-summary {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rail-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 650;
  }

  .rail-summary {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
  }

  /* The wide effects sidebar has room to name its sections. Keeping the
     compact rail icon-only preserves canvas width on small workspaces. */
  @container animation-sidebar (min-width: 40rem) {
    .icon-rail {
      width: 8.5rem;
      align-items: stretch;
      padding-inline: 6px;
    }

    .rail-btn {
      width: 100%;
      justify-content: flex-start;
      gap: 9px;
      padding: 0 12px;
      font-size: 18px;
    }

    .rail-glyph {
      flex: 0 0 auto;
    }

    .rail-copy {
      display: grid;
      min-width: 0;
      gap: 1px;
      text-align: left;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .rail-btn {
      transition: none;
    }
    .rail-btn:hover:not([aria-selected="true"]) {
      transform: none;
    }
  }

  @media (prefers-contrast: more) {
    .rail-btn {
      border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
    }
    .rail-btn[aria-selected="true"] {
      background: #1a1a2e;
      border-color: white;
      color: white;
    }
  }
</style>
