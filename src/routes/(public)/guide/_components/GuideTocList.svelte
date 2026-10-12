<script lang="ts">
  /**
   * The guide contents as a plain label list, for the phone/tablet drawer.
   * Same rows as the desktop rail (guide-toc.ts), rendered as text links with
   * no icon rail: the app splits its navigation the same way, a package rail
   * on desktop and a primary list on phones, both from one module list.
   *
   * The level the reader is in opens, the others fold, and the reader's own
   * toggle wins until the route changes. The prerendered HTML carries every
   * row unfolded (folds apply after hydration), so each topic stays a
   * crawlable link on every guide page.
   */
  import { onMount, tick } from "svelte";
  import { page } from "$app/state";
  import type { ModuleDefinition, Section } from "@austencloud/sidebar";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import {
    buildGuideToc,
    guideTocModuleFor,
    guideTocSectionFor,
  } from "../_data/guide-toc";

  let {
    activeSectionId = "",
    revealKey = 0,
    onLinkClick,
  }: {
    activeSectionId?: string;
    /** Bumped by the host when the drawer opens, to bring the current row
     *  into view. */
    revealKey?: number;
    /** Called after any link is activated; the host closes the drawer. */
    onLinkClick?: () => void;
  } = $props();

  const pathname = $derived(page.url.pathname);
  const modules = $derived(buildGuideToc());
  const currentModule = $derived(guideTocModuleFor(pathname));
  const currentSection = $derived(
    guideTocSectionFor(pathname, activeSectionId)
  );
  const onHub = $derived(pathname === "/guide" || pathname === "/guide/");

  let hydrated = $state(false);
  onMount(() => {
    hydrated = true;
  });

  // Auto: the current level open (both on the hub), the rest folded.
  let choices = $state<Record<string, boolean>>({});
  $effect(() => {
    void pathname;
    choices = {};
  });
  function isOpen(m: ModuleDefinition): boolean {
    if (!hydrated) return true;
    return choices[m.id] ?? (onHub || m.id === currentModule);
  }

  function rowsByGroup(m: ModuleDefinition) {
    if (!m.groups?.length) return [{ id: "", label: "", rows: m.sections }];
    return m.groups.map((g) => ({
      id: g.id,
      label: g.label,
      rows: m.sections.filter((s: Section) => s.groupId === g.id),
    }));
  }

  const isCurrent = (m: ModuleDefinition, s: Section) =>
    m.id === currentModule && s.id === currentSection;

  // ── Keep the current row in view ─────────────────────────────────────────
  let navEl: HTMLElement | undefined = $state();

  function scrollerOf(el: HTMLElement): HTMLElement {
    let node: HTMLElement | null = el;
    while (node) {
      const overflow = getComputedStyle(node).overflowY;
      if (overflow === "auto" || overflow === "scroll") return node;
      node = node.parentElement;
    }
    return el;
  }

  function revealCurrent(el: HTMLElement) {
    const current = el.querySelector<HTMLElement>('[aria-current="page"]');
    if (!current) return;
    const scroller = scrollerOf(el);
    const box = scroller.getBoundingClientRect();
    const link = current.getBoundingClientRect();
    if (link.top >= box.top && link.bottom <= box.bottom) return;
    scroller.scrollTop +=
      link.top - box.top - (scroller.clientHeight - link.height) / 2;
  }

  $effect(() => {
    const el = navEl;
    void pathname;
    void revealKey;
    if (!el) return;
    void tick().then(() => revealCurrent(el));
  });
</script>

<nav
  class="guide-toc"
  aria-label={tDynamic("guide_nav_aria")}
  bind:this={navEl}
>
  {#each modules as m (m.id)}
    {@const hasRows = m.sections.length > 0}
    {@const open = isOpen(m)}
    <div class="toc-module">
      <div class="module-row">
        {#if m.href}
          <a
            class="module-link"
            class:active={m.id === currentModule}
            aria-current={m.id === currentModule && !hasRows
              ? "page"
              : undefined}
            href={m.href}
            onclick={() => onLinkClick?.()}
          >
            {m.label}
          </a>
        {:else}
          <span class="module-link heading">{m.label}</span>
        {/if}
        {#if hasRows}
          <button
            type="button"
            class="module-toggle"
            aria-expanded={open}
            aria-label={m.label}
            onclick={() => (choices = { ...choices, [m.id]: !open })}
          >
            <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
          </button>
        {/if}
      </div>

      {#if hasRows && open}
        <div class="module-body" transition:growFade>
          {#each rowsByGroup(m) as g (g.id)}
            {#if g.label}
              <div class="group-heading">{g.label}</div>
            {/if}
            <ul class="row-list">
              {#each g.rows as s (s.id)}
                <li class:sub={s.depth === 1}>
                  <a
                    class="row-link"
                    class:active={isCurrent(m, s)}
                    aria-current={isCurrent(m, s) ? "page" : undefined}
                    href={s.href}
                    download={s.download ? "" : undefined}
                    onclick={() => onLinkClick?.()}
                  >
                    {s.label}
                  </a>
                </li>
              {/each}
            </ul>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</nav>

<style>
  .guide-toc {
    padding: 0 0.75rem;
    font-family: "Inter", system-ui, sans-serif;
  }

  .toc-module {
    margin-bottom: 0.5rem;
  }

  .module-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .module-link {
    flex: 1;
    display: flex;
    align-items: center;
    min-height: 44px;
    padding: 0.5rem 0.75rem;
    border-radius: 10px;
    font-weight: 700;
    font-size: 0.95rem;
    color: oklch(0.7 0.1 270);
    text-decoration: none;
    transition:
      background var(--transition-fast),
      color var(--transition-fast);
  }
  a.module-link:hover {
    background: oklch(0.2 0.02 270 / 0.4);
    color: oklch(0.85 0.06 270);
  }
  .module-link.active {
    color: oklch(0.85 0.06 270);
  }
  .module-link.heading {
    color: oklch(0.6 0.03 270);
  }

  .module-toggle {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    border-radius: 8px;
    color: oklch(0.55 0.02 270);
    cursor: pointer;
    transition:
      background var(--transition-fast),
      color var(--transition-fast);
  }
  .module-toggle:hover {
    background: oklch(0.2 0.02 270 / 0.4);
    color: oklch(0.75 0.04 270);
  }
  .module-toggle:focus-visible,
  .module-link:focus-visible,
  .row-link:focus-visible {
    outline: 2px solid oklch(0.74 0.11 265);
    outline-offset: 2px;
  }
  .module-toggle i {
    transition: transform var(--transition-fast);
  }
  .module-toggle[aria-expanded="false"] i {
    transform: rotate(-90deg);
  }

  .group-heading {
    font-weight: 500;
    font-size: 0.85rem;
    padding: 0.55rem 0.75rem;
    color: oklch(0.6 0.03 270);
  }

  .row-list {
    list-style: none;
    padding: 0;
    margin: 0.25rem 0 0.5rem;
  }

  .row-link {
    display: flex;
    align-items: center;
    min-height: 44px;
    padding: 0.35rem 0.75rem 0.35rem 2.25rem;
    border-radius: 8px;
    font-size: 0.85rem;
    color: oklch(0.62 0.03 270);
    text-decoration: none;
    position: relative;
    transition:
      background var(--transition-micro),
      color var(--transition-micro);
  }
  li.sub .row-link {
    padding-left: 3.25rem;
  }
  .row-link:hover {
    color: oklch(0.8 0.04 270);
    background: oklch(0.2 0.02 270 / 0.3);
  }
  .row-link.active {
    color: oklch(0.85 0.1 270);
    font-weight: 550;
    background: oklch(0.25 0.04 270 / 0.3);
  }
  .row-link.active::before {
    content: "";
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 14px;
    background: oklch(0.65 0.18 270);
    border-radius: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .module-link,
    .module-toggle,
    .module-toggle i,
    .row-link {
      transition: none;
    }
  }
</style>
