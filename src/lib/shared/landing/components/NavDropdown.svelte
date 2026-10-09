<script module lang="ts">
  export interface NavDropdownItem {
    label: string;
    href: string;
    icon?: string;
    desc?: string;
    /** Items sharing a group render under one small label, after the loose items. */
    group?: string;
  }

  export interface NavDropdownSection {
    /** null for the loose items that lead the menu. */
    label: string | null;
    items: NavDropdownItem[];
  }

  /**
   * Loose items first as one unlabeled section, then one section per group in
   * first-seen order. The desktop panel and SiteHeader's phone accordion both
   * render from this, so the two menus can never disagree on the grouping.
   */
  export function sectionNavItems(
    items: NavDropdownItem[]
  ): NavDropdownSection[] {
    const sections: NavDropdownSection[] = [];
    for (const item of items) {
      const label = item.group ?? null;
      let section = sections.find((s) => s.label === label);
      if (!section) {
        section = { label, items: [] };
        sections.push(section);
      }
      section.items.push(item);
    }
    return sections.sort(
      (a, b) => Number(a.label !== null) - Number(b.label !== null)
    );
  }
</script>

<script lang="ts">
  /**
   * NavDropdown — disclosure-pattern dropdown for the marketing SiteHeader
   * (WAI-ARIA "disclosure navigation menu": a real <button aria-expanded> over
   * a plain list of links — NOT role="menu", which is action-menu semantics
   * and wrong for navigation).
   *
   * Desktop interactions: click/tap or Enter/Space toggles the disclosure.
   * Hover only highlights the trigger, so it can never open a panel that the
   * user's next click immediately closes. ArrowDown opens and focuses the first
   * link, Arrow/Home/End move inside the panel, and Escape closes and returns
   * focus to the trigger. An outside pointer or focus leaving the group closes.
   * The header's account popover stays separate — it IS an action menu.
   */
  interface Props {
    label: string;
    items: NavDropdownItem[];
    /** Trigger shows the active underline (a child route is current). */
    active?: boolean;
    activeHref: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }

  const {
    label,
    items,
    active = false,
    activeHref,
    open,
    onOpenChange,
  }: Props = $props();

  const sections = $derived(sectionNavItems(items));
  const uid = $props.id();
  let rootEl: HTMLDivElement | undefined = $state();
  let triggerEl: HTMLButtonElement | undefined = $state();
  let panelEl: HTMLDivElement | undefined = $state();

  function isItemActive(href: string): boolean {
    return href === activeHref;
  }

  function toggle() {
    onOpenChange(!open);
  }

  function closeAndRefocus() {
    onOpenChange(false);
    triggerEl?.focus();
  }

  function panelLinks(): HTMLAnchorElement[] {
    return Array.from(panelEl?.querySelectorAll("a") ?? []);
  }

  function focusLink(index: number) {
    const links = panelLinks();
    if (links.length === 0) return;
    const clamped = ((index % links.length) + links.length) % links.length;
    links[clamped]?.focus();
  }

  function onTriggerKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      onOpenChange(true);
      // Panel mounts on the next tick; focus after the DOM settles.
      requestAnimationFrame(() => focusLink(0));
    }
  }

  function onPanelKeydown(e: KeyboardEvent) {
    const links = panelLinks();
    const current = links.indexOf(document.activeElement as HTMLAnchorElement);
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusLink(current + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusLink(current - 1);
        break;
      case "Home":
        e.preventDefault();
        focusLink(0);
        break;
      case "End":
        e.preventDefault();
        focusLink(links.length - 1);
        break;
    }
  }

  function onRootKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && open) {
      e.stopPropagation(); // don't also close the mobile overlay
      closeAndRefocus();
    }
  }

  // Once focus leaves the trigger and its links, the disclosure has finished
  // serving the keyboard user and should not linger over the page.
  function onFocusOut(e: FocusEvent) {
    if (rootEl && !rootEl.contains(e.relatedTarget as Node | null)) {
      onOpenChange(false);
    }
  }

  $effect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (rootEl && !rootEl.contains(e.target as Node)) onOpenChange(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  });
</script>

{#snippet link(item: NavDropdownItem)}
  <a
    href={item.href}
    class:active={isItemActive(item.href)}
    aria-current={isItemActive(item.href) ? "page" : undefined}
  >
    {#if item.icon}
      <i class="fas {item.icon} dd-icon" aria-hidden="true"></i>
    {/if}
    <span class="dd-text">
      <span class="dd-label">{item.label}</span>
      {#if item.desc}<span class="dd-desc">{item.desc}</span>{/if}
    </span>
  </a>
{/snippet}

<div
  class="nav-group"
  bind:this={rootEl}
  onfocusout={onFocusOut}
  onkeydown={onRootKeydown}
  role="none"
>
  <button
    bind:this={triggerEl}
    type="button"
    class="trigger"
    class:active
    class:open
    aria-expanded={open}
    aria-controls="{uid}-panel"
    onclick={toggle}
    onkeydown={onTriggerKeydown}
  >
    {label}
    <i class="fas fa-chevron-down chev" aria-hidden="true"></i>
    {#if active}<span class="ind" aria-hidden="true"></span>{/if}
  </button>

  {#if open}
    <div
      class="panel"
      id="{uid}-panel"
      bind:this={panelEl}
      onkeydown={onPanelKeydown}
      role="none"
    >
      <ul>
        {#each sections as section, s (section.label ?? "")}
          {#if section.label}
            <li class="dd-section">
              <span class="dd-group-label" id="{uid}-group-{s}">
                {section.label}
              </span>
              <ul aria-labelledby="{uid}-group-{s}">
                {#each section.items as item (item.href)}
                  <li>{@render link(item)}</li>
                {/each}
              </ul>
            </li>
          {:else}
            {#each section.items as item (item.href)}
              <li>{@render link(item)}</li>
            {/each}
          {/if}
        {/each}
      </ul>
    </div>
  {/if}
</div>

<style>
  .nav-group {
    position: relative;
    display: flex;
    align-items: center;
  }

  /* Trigger reads exactly like SiteHeader's sibling nav links. */
  .trigger {
    position: relative;
    display: inline-flex;
    min-height: var(--min-touch-target, 44px);
    align-items: center;
    gap: 6px;
    color: #c4c1d8;
    font-family: inherit;
    font-size: 0.92rem;
    font-weight: 500;
    padding: 0.4rem 0;
    box-sizing: border-box;
    background: none;
    border: none;
    cursor: pointer;
    transition: color 0.2s ease;
  }
  .trigger:hover,
  .trigger:focus-visible,
  .trigger.open,
  .trigger.active {
    color: #fff;
  }

  .chev {
    font-size: 0.6rem;
    color: #6f6b8e;
    transition:
      transform 0.2s ease,
      color 0.2s ease;
  }
  .trigger.open .chev {
    transform: rotate(180deg);
    color: #b8a6ff;
  }

  .ind {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 2px;
    border-radius: 1px;
    background: linear-gradient(90deg, #6f8cff, #c0a3ff);
  }

  .panel {
    position: absolute;
    top: calc(100% + 14px);
    left: 50%;
    transform: translateX(-50%);
    min-width: 240px;
    padding: 6px;
    background: rgb(20, 20, 38);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.5);
    z-index: 210;
    animation: panel-in 0.16s ease-out;
  }
  /* Invisible hover bridge so the mouse can travel trigger → panel without
     crossing a gap that fires pointerleave. */
  .panel::before {
    content: "";
    position: absolute;
    top: -14px;
    left: 0;
    right: 0;
    height: 14px;
  }

  @keyframes panel-in {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-4px) scale(0.98);
    }
  }

  .panel ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* A grouped run of links: a hairline above and a small caption, so the
     prop pages read as one answer rather than five more menu rows. */
  .dd-section {
    margin-top: 4px;
    padding-top: 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .dd-group-label {
    display: block;
    padding: 4px 12px 6px;
    color: #8f8bb0;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .panel a {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 9px;
    color: #c4c1d8;
    text-decoration: none;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }
  .panel a:hover,
  .panel a:focus-visible {
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
  }
  .panel a.active {
    color: #fff;
    background: rgba(139, 108, 255, 0.14);
  }

  .dd-icon {
    width: 20px;
    text-align: center;
    font-size: 0.9rem;
    color: #9b97bd;
    flex-shrink: 0;
  }
  .panel a.active .dd-icon,
  .panel a:hover .dd-icon {
    color: #b8a6ff;
  }

  .dd-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .dd-label {
    font-size: 0.92rem;
    font-weight: 500;
    white-space: nowrap;
  }
  .dd-desc {
    font-size: 0.78rem;
    color: #8f8bb0;
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .trigger,
    .chev,
    .panel,
    .panel a {
      transition: none;
      animation: none;
    }
  }
</style>
