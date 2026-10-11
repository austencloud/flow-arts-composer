<!-- AccountRow: Clickable account identity row for sidebar footer and mobile drawer -->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { authState } from "../../../auth/state/auth-state.svelte";
  import type { HapticFeedback } from "../../../application/services/haptic-feedback";
  import RobustAvatar from "../../../components/avatar/RobustAvatar.svelte";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import { authDrawerState } from "../../../auth/state/auth-drawer-state.svelte";
  import { tryGetAccountSetupContext } from "#lib/shared/onboarding/context/account-setup-context.js";

  let {
    variant = "expanded",
    onclick,
    onSignIn,
  } = $props<{
    variant?: "expanded" | "collapsed" | "drawer";
    onclick?: () => void;
    onSignIn?: () => void;
  }>();

  const user = $derived(authState.user);
  const isFullAccount = $derived(authState.isFullAccount);
  const displayName = $derived(
    user?.displayName || user?.email || t("tab_settings_profile")
  );
  const photoURL = $derived(user?.photoURL ?? null);
  const accountSetupState = tryGetAccountSetupContext();
  const showSetupStatus = $derived(
    isFullAccount &&
      accountSetupState &&
      !accountSetupState.loading &&
      !accountSetupState.isComplete
  );

  // One avatar size in both rail and expanded states. A per-variant size
  // (32 collapsed vs 28 expanded) made the avatar visibly resize — and shift
  // its own edges — on the sidebar tree swap. 32px also lines up with the
  // 32px footer button icons stacked above it. No-layout-shift.
  const avatarSize = 32;

  function handleClick() {
    try {
      const hapticService = getHapticFeedback() as HapticFeedback;
      hapticService?.trigger("selection");
    } catch {
      // Ignore if not available
    }
    if (isFullAccount) {
      onclick?.();
    } else {
      // Guests get the sign-in window straight away, not the account menu
      // popover. The row says "Sign in", so it opens on signing in.
      if (onSignIn) onSignIn();
      else authDrawerState.show("signin");
    }
  }
</script>

{#if variant === "drawer"}
  <Crossfade key={`${isFullAccount}:${Boolean(onclick)}`} animateHeight>
    {#if isFullAccount && onclick}
      <button
        class="account-row drawer interactive"
        onclick={handleClick}
        aria-label={t("nav_ui_edit_profile")}
      >
        <RobustAvatar src={photoURL} name={displayName} customSize={32} />
        <span class="account-copy">
          <span class="account-label">{displayName}</span>
          {#if showSetupStatus && accountSetupState}
            <span class="setup-status" transition:growFade>
              {t("nav_setup_remaining", {
                count:
                  accountSetupState.totalCount -
                  accountSetupState.completedCount,
              })}
            </span>
          {/if}
        </span>
        <i class="fas fa-chevron-right drawer-chevron" aria-hidden="true"></i>
      </button>
    {:else if isFullAccount}
      <div class="account-row drawer">
        <RobustAvatar src={photoURL} name={displayName} customSize={32} />
        <span class="account-copy">
          <span class="account-label">{displayName}</span>
          {#if showSetupStatus && accountSetupState}
            <span class="setup-status" transition:growFade>
              {t("nav_setup_remaining", {
                count:
                  accountSetupState.totalCount -
                  accountSetupState.completedCount,
              })}
            </span>
          {/if}
        </span>
      </div>
    {:else}
      <button
        class="account-row drawer interactive"
        onclick={() => {
          try {
            (getHapticFeedback() as HapticFeedback)?.trigger("selection");
          } catch {}
          // A provided callback keeps auth in the containing drawer. Other
          // callers close it before opening the shared auth drawer.
          if (onSignIn) onSignIn();
          else {
            onclick?.();
            authDrawerState.show("signin");
          }
        }}
        aria-label={t("nav_ui_sign_in")}
      >
        <div class="avatar-guest drawer-size">
          <i class="fas fa-user-plus" aria-hidden="true"></i>
        </div>
        <span class="account-label sign-up-label">{t("nav_ui_sign_in")}</span>
      </button>
    {/if}
  </Crossfade>
{:else}
  <button
    class="account-row"
    class:collapsed={variant === "collapsed"}
    onclick={handleClick}
    aria-label={isFullAccount ? t("nav_ui_account_menu") : t("nav_ui_sign_in")}
    title={variant === "collapsed" && !isFullAccount
      ? t("nav_ui_sign_in")
      : undefined}
    aria-haspopup={isFullAccount ? "menu" : undefined}
  >
    <span class="avatar-col">
      {#if isFullAccount}
        <RobustAvatar
          src={photoURL}
          name={displayName}
          customSize={avatarSize}
        />
      {:else}
        <div class="avatar-guest" class:collapsed={variant === "collapsed"}>
          <i class="fas fa-user-plus" aria-hidden="true"></i>
        </div>
      {/if}
    </span>

    {#if variant !== "collapsed"}
      <span class="account-label"
        >{isFullAccount ? displayName : t("nav_ui_sign_in")}</span
      >
      {#if isFullAccount}
        <i class="fas fa-chevron-up chevron" aria-hidden="true"></i>
      {/if}
    {/if}
  </button>
{/if}

<style>
  /* ==========================================================================
     ACCOUNT ROW - Base (expanded)
     ========================================================================== */
  .account-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    color: var(--theme-text-dim);
    cursor: pointer;
    /* Visuals morph, layout geometry snaps. The rail→expanded swap flips this
       button between a 44px circle and a full-width row. Width/padding/height
       SNAP (the footer pins its end-state width and the nav's clip reveals it —
       animating them dragged the avatar left-then-right mid-flight). But
       border-radius is paint-only, so it IS morphed: the corner rounding eases
       22px↔12px so the circle↔rounded-rect change animates instead of snapping. */
    transition:
      background var(--duration-normal) ease,
      border-color var(--duration-normal) ease,
      color var(--duration-normal) ease,
      border-radius var(--duration-emphasis)
        var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
    font-size: var(--font-size-sm);
    font-weight: 500;
  }

  .account-row:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text);
  }

  .account-row:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--theme-accent) 70%, transparent);
    outline-offset: 2px;
  }

  /* Sidebar-expanded variant: same 44px row height as the rail's circle
     button so the footer's total height never changes across the sidebar
     tree swap (no vertical layout shift). The 44px avatar column centers
     the avatar on the rail's icon anchor. Drawer variant keeps its own
     metrics. */
  .account-row:not(.drawer):not(.collapsed) {
    height: var(--min-touch-target);
    gap: 0;
    padding: 0 12px 0 0;
  }

  /* 44px leading column in BOTH states pins the avatar's center on the rail's
     icon anchor. Collapsed used to collapse this to auto + center the row, which
     landed the avatar 1px off the expanded position — the on/off-hover jiggle. */
  .avatar-col {
    width: 44px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .account-row.collapsed {
    width: var(--min-touch-target, 50px);
    height: var(--min-touch-target, 50px);
    padding: 0;
    /* Half-height radius = a perfect circle at 44×44, but in px so it
       interpolates cleanly to the expanded 12px (a % start would blend as a
       stadium against the snapped 200px width). No justify-content:center — the
       44px avatar-col left-anchors the avatar at x=33 in BOTH states, matching
       the expanded row exactly. Centering pulled it 1px left: the hover jiggle. */
    border-radius: calc(var(--min-touch-target, 50px) / 2);
  }

  /* ==========================================================================
     DRAWER VARIANT - Static identity display, not interactive
     ========================================================================== */
  .account-row.drawer {
    border-radius: 14px;
    padding: 12px 16px;
    cursor: default;
    border-color: transparent;
    background: transparent;
    justify-content: center;
  }

  .account-row.drawer.interactive {
    cursor: pointer;
    border-color: var(--theme-stroke);
    background: var(--theme-card-bg);
  }

  .account-row.drawer.interactive:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
  }

  .account-row.drawer.interactive:active {
    transform: scale(0.98);
  }

  .account-row.drawer.interactive:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--theme-accent) 70%, transparent);
    outline-offset: 2px;
  }

  .drawer-chevron {
    font-size: var(--font-size-compact, 12px);
    opacity: 0.4;
    margin-left: auto;
  }

  @media (prefers-reduced-motion: reduce) {
    .account-row.drawer.interactive:active {
      transform: none;
    }
  }

  /* ==========================================================================
     AVATAR (guest fallback only - authenticated users use RobustAvatar)
     ========================================================================== */
  /* Same fixed 32px in both rail and expanded states (see avatarSize note):
     the guest fallback must not resize on the tree swap either. Drawer keeps
     its own size below. */
  .avatar-guest {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
    color: var(--theme-accent);
    font-size: var(--font-size-sm, 14px);
  }

  .avatar-guest.drawer-size {
    width: 32px;
    height: 32px;
    border: 1.5px solid var(--theme-accent, #3b82f6);
    font-size: var(--font-size-sm, 14px);
  }

  .sign-up-label {
    color: var(--theme-accent, #3b82f6);
    font-weight: 600;
  }

  .account-label {
    flex: 1;
    text-align: left;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    animation: label-fade-in var(--duration-normal) ease-out
      var(--duration-fast) both;
  }

  .drawer .account-label {
    flex: none;
    animation: none;
  }

  .account-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1px;
  }

  .drawer .account-copy {
    text-align: left;
  }

  .setup-status {
    color: var(--theme-accent, #3b82f6);
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
  }

  .chevron {
    font-size: var(--font-size-compact, 12px);
    opacity: 0.5;
    transition: opacity var(--duration-normal) ease;
  }

  .account-row:hover .chevron {
    opacity: 0.8;
  }

  @keyframes label-fade-in {
    from {
      opacity: 0;
      transform: translateX(-4px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .account-row,
    .chevron {
      transition: none !important;
    }

    .account-label {
      animation: none;
    }
  }

  @media (prefers-contrast: high) {
    .account-row {
      border: 2px solid white;
    }
  }
</style>
