<!--
  DownloadPillNav.svelte

  Horizontal row of 5 pills (Effects / Effort / Playback / Display / Export)
  shown above the download button on mobile and at the top of the sidebar
  on desktop. Pure presentational - all state is owned by the parent.

  ARIA semantics: button + aria-pressed (NOT tab + aria-selected). The
  ARIA tabs pattern requires the panel to be a permanent DOM sibling
  linked via aria-controls. Pill bodies are conditionally mounted (one at
  a time on desktop) and on mobile they live inside a portal'd
  role="dialog" - neither is a tabpanel. On mobile the pill button also
  carries aria-haspopup="dialog" so screen readers announce the popup
  intent.

  Focus management: the parent gets the `navEl` reference via the
  `onNavMount` callback on mount, and explicitly gets `null` on unmount so
  it can clear any cached reference. Parent calls
  `el.querySelector('[data-pill-id="<id>"]')` to locate a specific pill
  button (e.g. for focus restoration after a mobile sheet closes).
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { PillId, PillSpec } from "./pill-types";

  interface Props {
    pills: PillSpec[];
    activeId: PillId | null;
    onSelect: (id: PillId) => void;
    variant: "mobile" | "desktop";
    onNavMount?: (el: HTMLDivElement | null) => void;
  }

  const { pills, activeId, onSelect, variant, onNavMount }: Props = $props();

  let navEl: HTMLDivElement | undefined = $state();
  $effect(() => {
    if (!navEl) return;
    onNavMount?.(navEl);
    return () => onNavMount?.(null);
  });

  function focusPillAt(idx: number) {
    if (!navEl || pills.length === 0) return;
    const wrapped = ((idx % pills.length) + pills.length) % pills.length;
    const target = navEl.querySelector<HTMLButtonElement>(
      `[data-pill-id="${pills[wrapped]!.id}"]`,
    );
    if (target) {
      target.focus();
      return;
    }
    console.warn("[DownloadPillNav] pill not found:", pills[wrapped]?.id);
    navEl.focus();
  }

  function handleKeydown(e: KeyboardEvent, id: PillId) {
    if (e.key === " ") {
      e.preventDefault();
      onSelect(id);
      return;
    }
    if (e.key === "Enter") {
      onSelect(id);
      return;
    }

    const idx = pills.findIndex((p) => p.id === id);
    if (idx < 0) return;

    if (e.key === "ArrowRight") {
      e.preventDefault();
      focusPillAt(idx + 1);
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusPillAt(idx - 1);
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      focusPillAt(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      focusPillAt(pills.length - 1);
      return;
    }
  }
</script>

<div
  bind:this={navEl}
  class="pill-nav variant-{variant}"
  role="group"
  aria-label={t("viewer_ui_download_settings")}
  tabindex="-1"
>
  {#each pills as pill (pill.id)}
    <button
      type="button"
      class="pill"
      data-pill-id={pill.id}
      aria-label={pill.label}
      aria-pressed={activeId === pill.id}
      aria-haspopup={variant === "mobile" ? "dialog" : undefined}
      data-ghost={activeId === pill.id ? undefined : "safe"}
      data-ghost-kind={activeId === pill.id ? undefined : "curio"}
      data-ghost-label={pill.label}
      style:--pill-accent={pill.accentColor ?? null}
      onclick={() => onSelect(pill.id)}
      onkeydown={(e) => handleKeydown(e, pill.id)}
    >
      <span class="pill-icon-row">
        {#if pill.icon}
          <i class="fas {pill.icon}" aria-hidden="true"></i>
        {:else if pill.accentColor}
          <span class="effort-dot" aria-hidden="true"></span>
        {/if}
        <span class="pill-label">{pill.label}</span>
      </span>
      <span class="pill-summary" class:empty={!pill.summary || pill.summary === "-"}>
        {pill.summary || "-"}
      </span>
    </button>
  {/each}
</div>
