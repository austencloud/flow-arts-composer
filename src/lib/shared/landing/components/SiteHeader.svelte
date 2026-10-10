<script lang="ts">
  /**
   * Marketing top bar for the public/landing pages (landing, /about, /roots,
   * /support). Modeled on the Cirque Aflame site header pattern — fixed
   * translucent bar that shrinks on scroll, desktop link row with an
   * active-underline, mobile hamburger → right slide-in drawer + backdrop —
   * re-themed to TKA's navy/indigo. Fixes the "links only in the footer"
   * problem: these standalone pages had no nav at all.
   *
   * `/create` + sign-in force a full reload (data-sveltekit-reload) because they
   * cross from the chrome-less public pages into the app shell.
   */
  import { page } from "$app/state";
  import { afterNavigate, preloadData } from "$app/navigation";
  import { isShallowGoto } from "#lib/shared/navigation/services/url-state.js";
  import { LAUNCHPAD_TILES } from "./launchpad/launchpad-tiles";
  import { onMount, type Component } from "svelte";
  import RobustAvatar from "../../components/avatar/RobustAvatar.svelte";
  import NavDropdown, {
    sectionNavItems,
    type NavDropdownItem,
  } from "./NavDropdown.svelte";
  import {
    hasSavedFirebaseUser,
    signInWhenIdle,
    startAuthState,
    type AuthStateApi,
  } from "../../auth/services/deferred-sign-in";
  import { trackCtaClick } from "#lib/shared/analytics/landing-events.js";
  import { analyticsRoute } from "#lib/shared/analytics/analytics-context.js";
  import type { AuthCta } from "#lib/shared/analytics/auth-events.js";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import { siteCopy } from "../site-copy";

  let scrolled = $state(false);
  let mobileOpen = $state(false);
  let accountOpen = $state(false);
  let accountEl: HTMLDivElement | undefined = $state();
  let toggleEl: HTMLButtonElement | undefined = $state();

  // Auth-aware header WITHOUT breaking landing-lite. The landing page boots in
  // firebase-free "landing mode" (see detectSiteMode + +layout.svelte), so we
  // must NOT statically import authState — that drags the whole Firebase stack
  // (auth/firestore/db/functions) into the landing bundle via auth-state →
  // firebase top-level side effects.
  //
  // Instead: on mount, run a cheap SDK-free check for a user Firebase saved in
  // this browser: in localStorage on Safari and iOS, in its IndexedDB database
  // elsewhere. None → first-time or signed-out visitor → show "Sign in", never
  // load Firebase. Found → returning visitor → lazily load the real authState
  // at idle and populate the avatar. Asking only whether that database exists
  // missed every Safari and iOS visitor, and loaded Firebase for signed-out
  // ones. The check and the idle start live in deferred-sign-in.ts, shared
  // with Shape Engine.
  let authApi = $state<AuthStateApi | null>(null);
  let probeDone = $state(false);
  let hasPersistedAuth = $state(false);

  // Until the slot is resolved (probe pending, or signed-in but auth still
  // loading) a reserved-width placeholder holds the space so the CTA never
  // shifts and "Sign in" never flashes before the avatar (no-layout-shift rule).
  const authReady = $derived(
    probeDone && (!hasPersistedAuth || (authApi?.initialized ?? false))
  );
  const isFullAccount = $derived(authApi?.isFullAccount ?? false);
  const user = $derived(authApi?.user ?? null);
  const displayName = $derived(
    user?.displayName || user?.email || siteCopy("You")
  );
  const email = $derived(user?.email ?? null);
  const photoURL = $derived(user?.photoURL ?? null);

  // Back-to-launchpad affordance: shown only on pages you "dove into" from the
  // landing launchpad (a tile carrying a morphName). Clicking it navigates to
  // "/", which fires the reverse shared-element route morph — the page contracts
  // back into its tile, so the dive reads as reversible. GuideShell mounts this
  // same SiteHeader, so /guide gets the control too. Derived from the tile list.
  const MORPH_DEST_PATHS = new Set(
    LAUNCHPAD_TILES.filter((t) => t.morphName).map((t) => t.href)
  );
  const currentPath = $derived(page.url?.pathname ?? "");
  const showBack = $derived(MORPH_DEST_PATHS.has(currentPath));

  // Load the real authState once (idempotent). Pulls Firebase — only ever
  // called when there's a reason to (persisted session found, or the user
  // explicitly clicks Sign in). Assigning authApi first lets the derived
  // getters track the auth rune as initialize() resolves.
  let authLoadPromise: Promise<void> | null = null;
  function ensureAuthLoaded(): Promise<void> {
    authLoadPromise ??= startAuthState((authState) => {
      authApi = authState;
    });
    return authLoadPromise;
  }

  onMount(() =>
    signInWhenIdle({
      hasSession: hasSavedFirebaseUser,
      onProbed: (persisted) => {
        hasPersistedAuth = persisted;
        probeDone = true;
      },
      signIn: ensureAuthLoaded,
      label: "SiteHeader",
    })
  );

  // In-place sign in: open the centered AuthModal over the landing page rather
  // than navigating to /create?sheet=auth (which bumped the user into the app
  // shell and showed the mobile bottom sheet on desktop). Lazy-loads Firebase
  // auth + the modal on demand — explicit user intent, so the cost is earned.
  let authModalOpen = $state(false);
  let AuthModalComp = $state<Component<{
    open: boolean;
    initialMode?: "signin" | "signup";
    onClose: () => void;
  }> | null>(null);

  async function openSignIn(cta: AuthCta) {
    const { trackAuthModalOpened } =
      await import("#lib/shared/analytics/auth-events.js");
    trackAuthModalOpened(analyticsRoute(), cta);
    accountOpen = false;
    mobileOpen = false;
    await ensureAuthLoaded();
    if (!AuthModalComp) {
      AuthModalComp = (await import("../../auth/components/AuthModal.svelte"))
        .default;
    }
    authModalOpen = true;
  }

  // Close the modal as soon as sign-in succeeds; the header then swaps to the
  // avatar via the same reactive auth state. Gate on isFullAccount, NOT
  // isAuthenticated: anonymous guests are already "authenticated" (they hold a
  // Firebase uid for their cloud library), so isAuthenticated is true the moment
  // the modal opens for a guest — which slammed the modal shut on the same frame
  // it appeared ("pops forward then disappears backward"). isFullAccount only
  // flips true on a real, non-anonymous sign-in, which is the actual success.
  // Also drops the auth-submission bridge (auth-analytics-bridge.ts): by the
  // time isFullAccount flips true, user_signed_up has already fired from
  // auth-state.svelte.ts and picked up the registered method/auth_mode, so
  // it's safe - and necessary - to clear them here before anything else in
  // this session could pick them up by accident.
  $effect(() => {
    if (authModalOpen && authApi?.isFullAccount) {
      authModalOpen = false;
      void import("#lib/shared/auth/services/auth-analytics-bridge.js")
        .then(({ clearAuthSubmissionBridge }) => clearAuthSubmissionBridge())
        .catch((error) =>
          console.warn("[SiteHeader] Auth analytics cleanup failed:", error)
        );
    }
  });

  // Two shapes: a plain link, or a labeled group that renders as a disclosure
  // dropdown on desktop and an accordion section in the mobile overlay. Support
  // moved to the footer (donation link — footer real estate) to keep the row
  // comfortable at laptop widths.
  interface NavLink {
    label: string;
    href: string;
    icon: string;
  }
  interface NavGroup {
    label: string;
    icon: string;
    items: (NavDropdownItem & { icon: string })[];
  }
  type NavEntry = NavLink | NavGroup;

  const NAV: NavEntry[] = [
    // History is a site-level destination, not a child of notation. The
    // Notation group holds the live reference system and one page per prop.
    { label: "History", href: "/history", icon: "fa-clock-rotate-left" },
    {
      label: "Notation",
      icon: "fa-language",
      items: [
        {
          label: "Shape Engine",
          href: "/shape-engine",
          icon: "fa-diagram-project",
          desc: "Generate exact flowers from level and ratio matrices",
        },
        // The same five props the home launchpad lists, so "does it work with
        // my prop" has an answer from any page, not only the front door.
        {
          label: "Staves",
          href: "/notation/staves",
          icon: "fa-grip-lines-vertical",
          group: "By prop",
        },
        {
          label: "Poi",
          href: "/notation/poi",
          icon: "fa-circle-dot",
          group: "By prop",
        },
        { label: "Fans", href: "/notation/fans", icon: "fa-fan", group: "By prop" },
        {
          label: "Clubs",
          href: "/notation/clubs",
          icon: "fa-wine-bottle",
          group: "By prop",
        },
        {
          label: "Buugeng",
          href: "/notation/buugeng",
          icon: "fa-yin-yang",
          group: "By prop",
        },
      ],
    },
    { label: "Composer", href: "/composer", icon: "fa-wand-magic-sparkles" },
    {
      label: "Learn",
      icon: "fa-book-open",
      items: [
        {
          label: "Interactive lessons",
          href: "/learn/concepts",
          icon: "fa-graduation-cap",
          desc: "Learn TKA one concept at a time",
        },
        {
          label: "Timing & Direction",
          href: "/timing-and-direction",
          icon: "fa-arrows-rotate",
          desc: "The six ways two props share phase and direction",
        },
        {
          label: "Read the Guide",
          href: "/guide",
          icon: "fa-book-open",
          desc: "Written reference, Codex, and PDFs",
        },
        {
          label: "Kinetic Atlas",
          href: "/atlas",
          icon: "fa-compass",
          desc: "Letters, motion, notation, and technique",
        },
        {
          label: "FAQ",
          href: "/faq",
          icon: "fa-circle-question",
          desc: "Common questions, answered",
        },
      ],
    },
    {
      label: "Shop",
      icon: "fa-bag-shopping",
      items: [
        // Products first, catalog last. The explainer page retired into the
        // product pages, so the dropdown leads with things to buy.
        { label: "LOOP Deck", href: "/shop/loop-deck", icon: "fa-layer-group" },
        { label: "T&D Trilogy", href: "/shop/tnd-trilogy", icon: "fa-clone" },
        {
          label: "Starter Pack",
          href: "/shop/starter-pack",
          icon: "fa-box-open",
        },
        { label: "Browse the Shop", href: "/shop", icon: "fa-bag-shopping" },
      ],
    },
    { label: "About", href: "/about", icon: "fa-circle-info" },
  ];

  function isGroup(entry: NavEntry): entry is NavGroup {
    return "items" in entry;
  }

  const ALL_HREFS = NAV.flatMap((e) =>
    isGroup(e) ? e.items.map((i) => i.href) : [e.href]
  );

  function isActive(href: string): boolean {
    return currentPath === href || currentPath.startsWith(href + "/");
  }

  // Some dropdown destinations live under another destination. On
  // /shop/loop-deck, both /shop and /shop/loop-deck match the current path, but
  // the visitor is only on the latter. Choosing the longest match keeps one
  // clear location.
  function getActiveItemHref(
    items: readonly { href: string }[]
  ): string | null {
    let activeHref: string | null = null;
    for (const item of items) {
      if (
        isActive(item.href) &&
        (activeHref === null || item.href.length > activeHref.length)
      ) {
        activeHref = item.href;
      }
    }
    return activeHref;
  }

  function groupActive(group: NavGroup): boolean {
    return getActiveItemHref(group.items) !== null;
  }

  // Desktop disclosures share one owner so opening Learn closes Notation in
  // the same state change. A late close from the previous group
  // cannot accidentally close the group the user just opened.
  let desktopOpenGroup = $state<string | null>(null);

  function setDesktopGroup(label: string, shouldOpen: boolean) {
    if (shouldOpen) {
      desktopOpenGroup = label;
    } else if (desktopOpenGroup === label) {
      desktopOpenGroup = null;
    }
  }

  // Mobile accordion: one group expanded at a time. Opening the overlay
  // auto-expands the group holding the current page so "where am I" is
  // answered without a tap.
  let expandedGroup = $state<string | null>(null);
  $effect(() => {
    if (!mobileOpen) return;
    const current = NAV.find((e) => isGroup(e) && groupActive(e));
    expandedGroup = current?.label ?? null;
  });

  function handleScroll() {
    scrolled = window.scrollY > 40;
  }

  // Close the mobile menu only AFTER navigation lands — not on tap. Closing on
  // tap snapped the overlay shut to reveal the OLD page, then the keyed
  // content crossfade (MarketingChrome) played old→new behind it, so you saw
  // the page you left flash back before the transition. Holding the overlay up
  // through navigation lets it stay covering the old page and fade away onto
  // the NEW one — straight from the menu into the destination.
  afterNavigate((navigation) => {
    if (isShallowGoto(navigation)) return;
    mobileOpen = false;
    accountOpen = false;
    desktopOpenGroup = null;
  });

  // The moment the menu opens, warm every destination (code + data) so the tap
  // navigates instantly — the page is already in memory, no load wait before
  // the curtain reveals it. preloadData is idempotent/cached, so re-opening is
  // free. Lightweight marketing routes, so eagerly warming all of them is cheap.
  $effect(() => {
    if (!mobileOpen) return;
    for (const href of ALL_HREFS) void preloadData(href).catch(() => {});
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (accountOpen) accountOpen = false;
      else if (mobileOpen) {
        // Focus was inside the overlay. Hand it back to the control that
        // opened it instead of dropping it on the page body.
        mobileOpen = false;
        toggleEl?.focus();
      }
    }
  }

  // Close the desktop account menu on any outside pointer.
  $effect(() => {
    if (!accountOpen) return;
    function onPointer(e: PointerEvent) {
      if (accountEl && !accountEl.contains(e.target as Node))
        accountOpen = false;
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  });

  async function handleSignOut() {
    accountOpen = false;
    mobileOpen = false;
    try {
      await authApi?.signOut();
    } catch (error) {
      console.error("[SiteHeader] Sign out failed:", error);
      toast.error("Sign out failed. Please try again.");
    }
  }
</script>

<svelte:window onscroll={handleScroll} onkeydown={handleKeydown} />

<header class:scrolled>
  <div class="inner">
    <div class="left-group">
      {#if showBack}
        <a
          href="/"
          class="surface-back"
          aria-label={siteCopy("Back to the launchpad")}
        >
          <i class="fas fa-chevron-left" aria-hidden="true"></i>
          <span>{siteCopy("Back")}</span>
        </a>
      {/if}
      <a
        href="/"
        class="logo"
        aria-label={siteCopy("TKA, The Kinetic Alphabet, Home")}
      >
        <span class="logo-text">TKA</span>
      </a>
    </div>

    <nav class="desktop-nav" aria-label={siteCopy("Main navigation")}>
      {#each NAV as entry}
        {#if isGroup(entry)}
          <NavDropdown
            label={siteCopy(entry.label)}
            items={entry.items.map((item) => ({
              ...item,
              label: siteCopy(item.label),
              desc: item.desc ? siteCopy(item.desc) : undefined,
              group: item.group ? siteCopy(item.group) : undefined,
            }))}
            active={groupActive(entry)}
            activeHref={getActiveItemHref(entry.items)}
            open={desktopOpenGroup === entry.label}
            onOpenChange={(open) => setDesktopGroup(entry.label, open)}
          />
        {:else}
          <a
            href={entry.href}
            class:active={isActive(entry.href)}
            aria-current={isActive(entry.href) ? "page" : undefined}
          >
            {siteCopy(entry.label)}
            {#if isActive(entry.href)}<span class="ind" aria-hidden="true"
              ></span>{/if}
          </a>
        {/if}
      {/each}
      {#if !authReady}
        <span class="auth-slot" aria-hidden="true"></span>
      {:else if isFullAccount}
        <div class="account" bind:this={accountEl}>
          <button
            class="avatar-btn"
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            aria-label={siteCopy("Account menu")}
            onclick={() => (accountOpen = !accountOpen)}
          >
            <RobustAvatar src={photoURL} name={displayName} customSize={32} />
          </button>
          {#if accountOpen}
            <div class="account-menu" role="menu">
              <div class="acct-identity">
                <span class="acct-name">{displayName}</span>
                {#if email}<span class="acct-email">{email}</span>{/if}
              </div>
              <button
                class="acct-signout"
                role="menuitem"
                onclick={handleSignOut}
              >
                <i class="fas fa-sign-out-alt" aria-hidden="true"></i>
                {siteCopy("Sign out")}
              </button>
            </div>
          {/if}
        </div>
      {:else}
        <button
          type="button"
          class="signin auth-slot"
          onclick={() => openSignIn("header_desktop_signin")}
          >{siteCopy("Sign in")}</button
        >
      {/if}
      <a
        class="cta"
        href="/create"
        data-sveltekit-reload
        onclick={() =>
          trackCtaClick("header_desktop", {
            cta_type: "open_composer",
            destination: "/create",
          })}>{siteCopy("Open Flow Arts Composer")}</a
      >
    </nav>

    <!-- Phones and tablets keep the way into the app in the bar, beside the
         menu, so it shows on every page without opening anything. The label
         shortens as the bar narrows; each variant is the button's full
         accessible name while it shows. -->
    <div class="compact-actions">
      <a
        class="compact-cta"
        href="/create"
        data-sveltekit-reload
        onclick={() =>
          trackCtaClick("header_mobile", {
            cta_type: "open_composer",
            destination: "/create",
          })}
      >
        <span class="label-full">{siteCopy("Open Flow Arts Composer")}</span>
        <span class="label-short">{siteCopy("Open Composer")}</span>
        <span class="label-tiny">{siteCopy("Composer")}</span>
      </a>
      <button
        bind:this={toggleEl}
        class="toggle"
        aria-label={siteCopy(mobileOpen ? "Close menu" : "Open menu")}
        aria-expanded={mobileOpen}
        aria-controls="site-mobile-nav"
        onclick={() => (mobileOpen = !mobileOpen)}
      >
        <span class="bar" class:open={mobileOpen}></span>
        <span class="bar" class:open={mobileOpen}></span>
        <span class="bar" class:open={mobileOpen}></span>
      </button>
    </div>
  </div>
</header>

<!-- Full-screen mobile menu. MUST be a sibling of <header> (not a child): the
     header's backdrop-filter would otherwise contain this fixed overlay, sizing
     it to the 64px bar instead of the viewport. -->
<nav
  id="site-mobile-nav"
  class="mobile-nav"
  class:open={mobileOpen}
  aria-label={siteCopy("Mobile navigation")}
  aria-hidden={!mobileOpen}
>
  <ul class="m-list">
    {#each NAV as entry, i}
      <li style="--i:{i}">
        {#if isGroup(entry)}
          {@const expanded = expandedGroup === entry.label}
          {@const activeItemHref = getActiveItemHref(entry.items)}
          <button
            class="m-group-btn"
            class:active={groupActive(entry)}
            aria-expanded={expanded}
            onclick={() => (expandedGroup = expanded ? null : entry.label)}
          >
            <i class="fas {entry.icon} m-icon" aria-hidden="true"></i>
            <span class="m-label">{siteCopy(entry.label)}</span>
            <i
              class="fas fa-chevron-down m-chev"
              class:m-chev-up={expanded}
              aria-hidden="true"
            ></i>
          </button>
          <!-- A folded group is 0px tall but still in the DOM, so without
               inert its links sit in the Tab order with nothing on screen. -->
          <div class="m-sub" class:expanded inert={!expanded}>
            <div class="m-sub-inner">
              {#each sectionNavItems(entry.items) as section}
                {#if section.label}
                  <span class="m-sub-group">{siteCopy(section.label)}</span>
                {/if}
                <ul
                  class="m-sub-list"
                  aria-label={section.label ? siteCopy(section.label) : undefined}
                >
                  {#each section.items as item}
                    <li>
                      <a
                        href={item.href}
                        class:active={item.href === activeItemHref}
                      >
                        <i
                          class="fas {item.icon} m-icon m-sub-icon"
                          aria-hidden="true"
                        ></i>
                        <span class="m-label">{siteCopy(item.label)}</span>
                        <i class="fas fa-chevron-right m-chev" aria-hidden="true"
                        ></i>
                      </a>
                    </li>
                  {/each}
                </ul>
              {/each}
            </div>
          </div>
        {:else}
          <a
            href={entry.href}
            class:active={isActive(entry.href)}
            aria-current={isActive(entry.href) ? "page" : undefined}
          >
            <i class="fas {entry.icon} m-icon" aria-hidden="true"></i>
            <span class="m-label">{siteCopy(entry.label)}</span>
            <i class="fas fa-chevron-right m-chev" aria-hidden="true"></i>
          </a>
        {/if}
      </li>
    {/each}
  </ul>

  <!-- The Composer button stays in the bar above this overlay, so the menu
       does not repeat it. -->
  <div class="m-actions" style="--i:{NAV.length}">
    {#if authReady && isFullAccount}
      <div class="m-identity">
        <RobustAvatar src={photoURL} name={displayName} customSize={32} />
        <div class="m-id-info">
          <span class="m-id-name">{displayName}</span>
          {#if email}<span class="m-id-email">{email}</span>{/if}
        </div>
      </div>
      <button class="m-signin m-signout" onclick={handleSignOut}>
        <i class="fas fa-sign-out-alt" aria-hidden="true"></i>
        {siteCopy("Sign out")}
      </button>
    {:else if authReady}
      <button
        type="button"
        class="m-signin"
        onclick={() => openSignIn("header_mobile_signin")}
        >{siteCopy("Sign in")}</button
      >
    {/if}
  </div>
</nav>

<!-- In-place sign-in modal (centered BaseModal). Lazy-loaded on first Sign in
     click so the landing page stays Firebase-free until the user opts in. -->
{#if AuthModalComp}
  <AuthModalComp
    open={authModalOpen}
    initialMode="signin"
    onClose={() => (authModalOpen = false)}
  />
{/if}

<style>
  header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 200;
    background: rgba(15, 15, 34, 0.72);
    backdrop-filter: blur(16px) saturate(160%);
    -webkit-backdrop-filter: blur(16px) saturate(160%);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    transition:
      background 0.3s ease,
      border-color 0.3s ease,
      height 0.3s ease;
  }
  header.scrolled {
    background: rgba(13, 13, 28, 0.92);
    border-bottom-color: rgba(255, 255, 255, 0.1);
  }

  .inner {
    /* One width treatment across the site: the header band matches the widest
       content band, so the logo lines up with page content instead of floating
       in from a narrower column. Fluid above 1720 on big screens — see
       --shell-w in src/app.css and .claude/rules/4k-native-layout.md. */
    max-width: var(--shell-w, min(1720px, 92vw));
    margin: 0 auto;
    padding: 0 1.4rem;
    height: var(--marketing-header-h, 64px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    transition: height 0.3s ease;
  }
  header.scrolled .inner {
    height: 56px;
  }

  .logo {
    text-decoration: none;
    display: flex;
    align-items: center;
    min-height: var(--min-touch-target, 44px);
  }
  .logo-text {
    font-family: "Fraunces", Georgia, serif;
    font-style: italic;
    font-weight: 700;
    font-size: 1.5rem;
    letter-spacing: 0.04em;
    background: linear-gradient(135deg, #6f8cff, #c0a3ff);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .left-group {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    min-width: 0;
  }

  /* Back-to-launchpad affordance — the visible "way out" of a dive. A real pill
     (not a bare text link, per clickables-look-like-buttons), it navigates to
     "/" which fires the reverse shared-element morph. The -2px hover nudge reads
     as backing out of the space. */
  .surface-back {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.45rem 0.85rem;
    min-height: 44px;
    box-sizing: border-box;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #c4c1d8;
    text-decoration: none;
    font-size: 0.9rem;
    font-weight: 600;
    transition:
      background 0.2s ease,
      border-color 0.2s ease,
      color 0.2s ease,
      transform 0.2s ease;
  }
  .surface-back:hover,
  .surface-back:focus-visible {
    background: rgba(139, 108, 255, 0.16);
    border-color: rgba(139, 108, 255, 0.4);
    color: #fff;
    transform: translateX(-2px);
  }
  .surface-back i {
    font-size: 0.8rem;
  }
  @media (prefers-reduced-motion: reduce) {
    .surface-back {
      transition: none;
    }
    .surface-back:hover,
    .surface-back:focus-visible {
      transform: none;
    }
  }

  .desktop-nav {
    display: flex;
    gap: 1.1rem;
    align-items: center;
  }
  .desktop-nav a {
    position: relative;
    color: #c4c1d8;
    text-decoration: none;
    font-size: 0.92rem;
    font-weight: 500;
    display: inline-flex;
    min-height: var(--min-touch-target, 44px);
    align-items: center;
    padding: 0.4rem 0;
    box-sizing: border-box;
    transition: color 0.2s ease;
  }
  .desktop-nav a:hover,
  .desktop-nav a:focus-visible {
    color: #fff;
  }
  .desktop-nav a.active {
    color: #fff;
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

  /* Sign in is a <button> (opens the modal in place), styled to read as the
     muted secondary link it replaced. */
  .signin {
    font-family: inherit;
    font-size: 0.92rem;
    font-weight: 500;
    color: #9b97bd;
    background: none;
    border: none;
    min-height: var(--min-touch-target, 44px);
    padding: 0.4rem 0;
    cursor: pointer;
    transition: color 0.2s ease;
  }
  .signin:hover,
  .signin:focus-visible {
    color: #fff;
  }
  /* Reserve the auth slot at the avatar's footprint so swapping
     placeholder → Sign in / avatar never nudges the CTA. */
  .auth-slot {
    display: inline-flex;
    align-items: center;
    min-width: 36px;
    min-height: var(--min-touch-target, 44px);
  }

  .account {
    position: relative;
    display: flex;
    align-items: center;
  }
  .avatar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 999px;
    background: none;
    cursor: pointer;
    line-height: 0;
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }
  .avatar-btn:hover,
  .avatar-btn:focus-visible {
    border-color: rgba(176, 163, 255, 0.7);
    box-shadow: 0 0 0 3px rgba(139, 108, 255, 0.18);
  }
  .account-menu {
    position: absolute;
    top: calc(100% + 10px);
    right: 0;
    min-width: 200px;
    padding: 6px;
    background: rgb(20, 20, 38);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.5);
    z-index: 210;
    animation: acct-in 0.16s ease-out;
  }
  @keyframes acct-in {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.98);
    }
  }
  .acct-identity {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .acct-name {
    font-size: 0.9rem;
    font-weight: 600;
    color: #fff;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .acct-email {
    font-size: 0.78rem;
    color: #9b97bd;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .acct-signout {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    margin-top: 4px;
    padding: 10px 12px;
    border: none;
    border-radius: 8px;
    background: none;
    color: #c4c1d8;
    font-size: 0.88rem;
    font-weight: 500;
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }
  .acct-signout:hover,
  .acct-signout:focus-visible {
    background: rgba(255, 255, 255, 0.06);
    color: #ff8a8a;
  }
  /* One look for the Composer button in the desktop row and in the compact
     bar. The desktop copy needs !important to beat `.desktop-nav a`. */
  .cta,
  .compact-cta {
    border-radius: 999px;
    background: linear-gradient(135deg, #6f8cff, #8b6cff);
  }
  .cta {
    padding: 0.5rem 1.1rem !important;
    color: #fff !important;
    font-weight: 600 !important;
  }
  .cta:hover,
  .compact-cta:hover {
    filter: brightness(1.08);
  }

  .compact-actions {
    display: none;
    align-items: center;
    gap: 0.5rem;
  }
  .compact-cta {
    display: inline-flex;
    align-items: center;
    min-height: var(--min-touch-target, 44px);
    padding: 0.5rem 1.1rem;
    box-sizing: border-box;
    color: #fff;
    font-size: 0.92rem;
    font-weight: 600;
    text-decoration: none;
    white-space: nowrap;
  }
  .label-short,
  .label-tiny {
    display: none;
  }

  /* Mobile toggle */
  .toggle {
    display: none;
    flex-direction: column;
    gap: 5px;
    background: none;
    border: none;
    cursor: pointer;
    min-width: 48px;
    min-height: 48px;
    align-items: center;
    justify-content: center;
    z-index: 201;
  }
  .bar {
    width: 24px;
    height: 2px;
    background: #fff;
    border-radius: 1px;
    transition: all 0.3s ease;
    transform-origin: center;
  }
  .bar.open:nth-child(1) {
    transform: rotate(45deg) translate(5px, 5px);
  }
  .bar.open:nth-child(2) {
    opacity: 0;
    transform: scaleX(0);
  }
  .bar.open:nth-child(3) {
    transform: rotate(-45deg) translate(5px, -5px);
  }

  /* Mobile menu — full-screen navy overlay. Content centers when it fits
     (auto margins on the first/last child) but the overlay scrolls instead of
     clipping when an expanded accordion outgrows a short viewport. */
  .mobile-nav {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 195; /* below the header bar (200) so the logo + X stay on top */
    flex-direction: column;
    overflow-y: auto;
    padding: calc(64px + env(safe-area-inset-top)) 24px
      calc(28px + env(safe-area-inset-bottom));
    background: radial-gradient(
      120% 90% at 50% 0%,
      #1d1d3a 0%,
      #14142b 55%,
      #0f0f22 100%
    );
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
    opacity: 0;
    visibility: hidden;
    transition:
      opacity 0.3s ease,
      visibility 0s linear 0.3s;
  }
  .mobile-nav.open {
    opacity: 1;
    visibility: visible;
    transition:
      opacity 0.32s ease,
      visibility 0s;
  }

  .m-list {
    list-style: none;
    margin: auto auto 0; /* top auto centers when content fits (see .m-actions) */
    padding: 0;
    width: 100%;
    max-width: 420px;
  }
  .m-list li {
    opacity: 0;
    transform: translateY(14px);
  }
  .mobile-nav.open .m-list li {
    animation: m-item-in 0.42s cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: calc(0.06s + var(--i) * 0.06s);
  }
  .m-list a {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 18px 18px;
    border-radius: 16px;
    color: #e8e6f4;
    text-decoration: none;
    font-size: 1.4rem;
    font-weight: 600;
    border: 1px solid transparent;
    transition:
      background 0.18s ease,
      border-color 0.18s ease,
      transform 0.18s ease;
  }
  .m-list a:hover,
  .m-list a:focus-visible {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.12);
  }
  .m-list a:active {
    transform: scale(0.98);
  }
  .m-list a.active {
    background: rgba(139, 108, 255, 0.14);
    border-color: rgba(139, 108, 255, 0.4);
    color: #fff;
  }

  /* Accordion group header — a button wearing the exact row look of .m-list a. */
  .m-group-btn {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    padding: 18px 18px;
    border-radius: 16px;
    color: #e8e6f4;
    background: none;
    font-family: inherit;
    text-align: left;
    font-size: 1.4rem;
    font-weight: 600;
    border: 1px solid transparent;
    cursor: pointer;
    transition:
      background 0.18s ease,
      border-color 0.18s ease;
  }
  .m-group-btn:hover,
  .m-group-btn:focus-visible {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.12);
  }
  .m-group-btn.active {
    color: #fff;
  }
  .m-group-btn.active .m-icon {
    color: #b8a6ff;
  }
  .m-chev-up {
    transform: rotate(180deg);
  }
  .m-group-btn .m-chev {
    transition: transform 0.25s ease;
  }

  /* Collapsible sub-list: the 0fr→1fr grid-row trick animates height without
     measuring content. */
  .m-sub {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .m-sub.expanded {
    grid-template-rows: 1fr;
  }
  .m-sub-inner {
    overflow: hidden;
    min-height: 0;
    padding: 0 0 0 22px;
  }
  .m-sub-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  /* The caption over a grouped run of links, mirroring the desktop panel. */
  .m-sub-group {
    display: block;
    padding: 12px 16px 4px;
    color: #8f8bb0;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .m-sub-inner a {
    font-size: 1.08rem;
    padding: 13px 16px;
    border-radius: 13px;
  }
  .m-sub-icon {
    font-size: 0.95rem;
  }
  .m-icon {
    width: 28px;
    text-align: center;
    font-size: 1.15rem;
    color: #9b97bd;
  }
  .m-list a.active .m-icon {
    color: #b8a6ff;
  }
  .m-label {
    flex: 1;
  }
  .m-chev {
    font-size: 0.85rem;
    color: #6f6b8e;
  }

  .m-actions {
    margin: 26px auto auto; /* bottom auto pairs with .m-list's top auto */
    width: 100%;
    max-width: 420px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    opacity: 0;
    transform: translateY(14px);
  }
  .mobile-nav.open .m-actions {
    animation: m-item-in 0.42s cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: calc(0.06s + var(--i) * 0.06s);
  }
  .m-signin {
    color: #9b97bd;
    text-decoration: none;
    font-size: 0.95rem;
    font-weight: 500;
    padding: 6px;
    background: none;
    border: none;
    font-family: inherit;
    cursor: pointer;
  }
  .m-signin:hover {
    color: #d7d4ea;
  }
  .m-identity {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 16px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  .m-id-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    text-align: left;
  }
  .m-id-name {
    font-size: 0.98rem;
    font-weight: 600;
    color: #fff;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .m-id-email {
    font-size: 0.82rem;
    color: #9b97bd;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .m-signout {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: none;
    cursor: pointer;
  }
  .m-signout:hover {
    color: #ff8a8a;
  }

  @keyframes m-item-in {
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Six top-level entries + auth + CTA still crowd mid-size tablets; drop to
     the mobile drawer earlier so the desktop row never crowds. */
  @media (max-width: 1024px) {
    .desktop-nav {
      display: none;
    }
    .compact-actions,
    .toggle {
      display: flex;
    }
    .mobile-nav {
      display: flex;
    }
  }

  /* Phones: the bar holds Back, the logo, the Composer button and the menu.
     Measured with the Back pill showing, which /composer and the other
     launchpad pages do: "Open Composer" (and German "Composer öffnen") keeps
     at least 11px clear of the logo from 375px wide; narrower bars say
     "Composer". Back keeps its accessible name as an arrow-only circle. */
  @media (max-width: 544px) {
    .inner {
      padding: 0 1rem;
    }
    .left-group {
      gap: 0.5rem;
    }
    .surface-back {
      justify-content: center;
      width: var(--min-touch-target, 44px);
      padding: 0;
    }
    .surface-back span {
      display: none;
    }
    .toggle {
      min-width: var(--min-touch-target, 44px);
    }
    .compact-cta {
      padding-inline: 0.9rem;
    }
    .label-full {
      display: none;
    }
    .label-short {
      display: inline;
    }
  }
  @media (max-width: 374px) {
    .label-short {
      display: none;
    }
    .label-tiny {
      display: inline;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    header,
    .inner,
    .bar,
    .mobile-nav {
      transition: none;
    }
    .mobile-nav.open .m-list li,
    .mobile-nav.open .m-actions {
      animation: none;
      opacity: 1;
      transform: none;
    }
    .m-sub,
    .m-group-btn .m-chev {
      transition: none;
    }
  }
</style>
