<!-- Sidebar Footer Component -->
<!-- Footer with settings, network status, prop switcher, account, and voice mic -->
<script lang="ts">
  import { localizedPropName } from "#lib/shared/settings/components/tabs/prop-type/localized-prop-name.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import NetworkStatusIndicator from "../../../offline/components/NetworkStatusIndicator.svelte";
  import { voiceControlState } from "../../../voice-control/state/voice-control-state.svelte";
  import { getSettings } from "../../../application/state/app-state.svelte";
  import { propDrawerState } from "../../../settings/state/prop-drawer-state.svelte";
  import { PropType } from "../../../pictograph/prop/domain/enums/prop-type";
  import AccountRow from "../account/AccountRow.svelte";
  import SelectedPropPreview from "../buttons/SelectedPropPreview.svelte";
  import { inboxState } from "../../../inbox/state/inbox-state.svelte";
  import { authState } from "../../../auth/state/auth-state.svelte";
  import { commandPaletteState } from "../../../keyboard/state/command-palette-state.svelte";
  import { keyboardShortcutState } from "../../../keyboard/state/keyboard-shortcut-state.svelte";

  // Inbox is a member-only surface (unfinished, and not relevant to guests).
  // Anonymous guests are authenticated but not full accounts — gate on this.
  const isFullAccount = $derived(authState.isFullAccount);

  let {
    isCollapsed,
    onSettingsClick,
    isInSettings = false,
    onAccountClick,
    accountSectionElement = $bindable(null),
  } = $props<{
    isCollapsed: boolean;
    onSettingsClick?: () => void;
    isInSettings?: boolean;
    onAccountClick?: () => void;
    accountSectionElement?: HTMLElement | null;
  }>();

  // Prop type display info for the prop button
  const leftPropType = $derived(getSettings()?.leftPropType ?? PropType.STAFF);
  const rightPropType = $derived(
    getSettings()?.catDogMode
      ? (getSettings().rightPropType ?? leftPropType)
      : leftPropType
  );
  const propLabel = $derived(
    rightPropType === leftPropType
      ? localizedPropName(leftPropType)
      : `${localizedPropName(leftPropType)} + ${localizedPropName(rightPropType)}`
  );

  // Inbox unread state
  const hasUnread = $derived(inboxState.totalUnreadCount > 0);
  const badgeCount = $derived(
    inboxState.totalUnreadCount > 99
      ? "99+"
      : String(inboxState.totalUnreadCount)
  );

  // Voice control is opt-in via Settings > Preferences
  const voiceControlOptIn = $derived(
    getSettings()?.voiceControlEnabled === true
  );
  const voiceSupported = $derived(
    voiceControlOptIn && voiceControlState.supported
  );
  const voiceEnabled = $derived(voiceControlState.enabled);
  const inCommandMode = $derived(voiceControlState.commandMode);
  const hasVoiceError = $derived(voiceControlState.detectorState === "error");
  const commandPaletteKey = $derived(
    keyboardShortcutState.isMac ? "Meta+K" : "Ctrl+K"
  );
  const commandPaletteAriaKey = $derived(
    keyboardShortcutState.isMac ? "Meta+K" : "Control+K"
  );

  function handleMicClick() {
    try {
      const hapticService = getHapticFeedback();
      hapticService?.trigger("selection");
    } catch {
      // Ignore if not available
    }

    if (!voiceEnabled) {
      // First activation: start detector, then enter command mode.
      // This is when the browser microphone permission prompt appears.
      voiceControlState.startListening();
      voiceControlState.enterCommandMode();
      return;
    }

    if (inCommandMode) {
      voiceControlState.exitCommandMode();
    } else {
      voiceControlState.enterCommandMode();
    }
  }

  function handlePropClick() {
    try {
      const hapticService = getHapticFeedback();
      hapticService?.trigger("selection");
    } catch {
      // Ignore if not available
    }
    propDrawerState.toggle();
  }

  function handleInboxClick() {
    try {
      const hapticService = getHapticFeedback();
      hapticService?.trigger("selection");
    } catch {
      // Ignore if not available
    }
    inboxState.open();
  }

  function handleSettingsClick() {
    try {
      const hapticService = getHapticFeedback();
      hapticService?.trigger("selection");
    } catch {
      // Ignore if not available
    }

    onSettingsClick?.();
  }

  function handleOpenCommandPalette() {
    try {
      const hapticService = getHapticFeedback();
      hapticService?.trigger("selection");
    } catch {
      // Ignore if not available
    }

    keyboardShortcutState.openCommandPalette();
    commandPaletteState.open();
  }
</script>

<!-- Footer with settings, account (hidden when in settings mode) -->
<div
  class="sidebar-footer"
  class:collapsed={isCollapsed}
  style="--button-accent-color: #64748b;"
>
  {#if !isInSettings}
    <!-- Settings Button -->
    <button
      type="button"
      class="footer-button settings-button"
      class:collapsed={isCollapsed}
      onclick={handleSettingsClick}
      aria-label={t("nav_ui_open_settings")}
    >
      <div class="button-icon">
        <i class="fas fa-cog" aria-hidden="true"></i>
      </div>
      <span class="button-label">{t("module_settings")}</span>
    </button>

    <!-- Jump to is a quiet footer utility, not a selected navigation row. -->
    <button
      type="button"
      class="footer-button command-button"
      class:collapsed={isCollapsed}
      onclick={handleOpenCommandPalette}
      aria-label={t("nav_ui_open_jump_to")}
      aria-keyshortcuts={commandPaletteAriaKey}
      title={t("nav_jump_shortcut", { shortcut: commandPaletteKey })}
    >
      <div class="button-icon">
        <i class="fas fa-search" aria-hidden="true"></i>
      </div>
      <span class="button-label">{t("nav_ui_jump_to")}</span>
    </button>

    <!-- Inbox Button (members only) -->
    {#if isFullAccount}
      <button
        class="footer-button inbox-button"
        class:collapsed={isCollapsed}
        class:has-unread={hasUnread}
        onclick={handleInboxClick}
        aria-label={hasUnread
          ? t("nav_inbox_unread", { count: inboxState.totalUnreadCount })
          : t("nav_inbox_open")}
      >
        <div class="button-icon inbox-icon-wrapper">
          <i class="fas fa-inbox" aria-hidden="true"></i>
          {#if hasUnread}
            <span class="unread-badge" aria-hidden="true">
              {badgeCount}
            </span>
          {/if}
        </div>
        <span class="button-label">{t("module_inbox")}</span>
        {#if hasUnread}
          <span class="unread-label-badge">
            {badgeCount}
          </span>
        {/if}
      </button>
    {/if}

    <!-- Network Status Indicator -->
    <NetworkStatusIndicator variant="desktop" />

    <!-- Prop Switcher Button -->
    <button
      class="footer-button prop-button"
      class:collapsed={isCollapsed}
      onclick={handlePropClick}
      aria-label={t("nav_change_props_current", { prop: propLabel })}
    >
      <div class="button-icon">
        <SelectedPropPreview />
      </div>
      <span class="button-label">{propLabel}</span>
    </button>

    <!-- Account Row (popover rendered outside nav to avoid overflow clipping) -->
    <div class="account-section" bind:this={accountSectionElement}>
      <AccountRow
        variant={isCollapsed ? "collapsed" : "expanded"}
        onclick={() => onAccountClick?.()}
      />
    </div>
  {/if}

  <!-- Voice mic -->
  {#if voiceSupported}
    <button
      class="mic-button"
      class:inactive={!voiceEnabled}
      class:command-mode={inCommandMode}
      class:error={hasVoiceError}
      onclick={handleMicClick}
      aria-label={!voiceEnabled
        ? "Enable voice control"
        : inCommandMode
          ? "Stop voice command mode"
          : "Start voice command mode"}
    >
      <i class="fas fa-microphone" aria-hidden="true"></i>
      {#if inCommandMode}
        <div class="mic-glow-ring"></div>
      {/if}
    </button>
  {/if}
</div>

<style>
  /* Both modes share identical vertical metrics (padding, gap, row heights)
     so the footer's total height — and therefore every row's y-position —
     is the same in rail and expanded states. The tree swap must not shift
     content vertically (no-layout-shift). */
  .sidebar-footer {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 10px;
    border-top: 1px solid var(--theme-stroke);
    /* Pin footer content to the expanded width (like .navigation-content) in
       BOTH states. The nav's overflow:hidden clips it while the width animates,
       so the icons stay left-anchored and the top divider ends at the nav's
       edge, never snapping to the rail's width while the nav is still wide. */
    width: 220px;
  }

  .sidebar-footer.collapsed {
    align-items: flex-start;
  }

  /* Full width in both states: the rail's align-items:flex-start would otherwise
     shrink it to the row, and the row's width could not ease against it. */
  .account-section {
    position: relative;
    width: 100%;
  }

  /* ============================================================================
     FOOTER BUTTONS (shared styles)
     ============================================================================ */
  .footer-button {
    width: 100%;
    height: var(--min-touch-target);
    display: flex;
    align-items: center;
    gap: 0;
    padding: 0 12px 0 0;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    cursor: pointer;
    /* The width moves 156px (44↔200), as the nav's does (64↔220), on the nav's
       token and curve, so the button's right edge keeps its distance from the
       nav's. The icon column is pinned by flex-shrink:0, so it never squeezes.
       Revised 2026-11-06: the width used to snap, which cut the label off on
       the first frame of a collapse. */
    transition:
      width var(--duration-emphasis) var(--ease-out),
      background var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard);
    font-size: var(--font-size-sm);
    font-weight: 500;
  }

  .footer-button:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text);
  }

  .command-button:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent) 7%,
      var(--theme-card-hover-bg)
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent) 32%,
      var(--theme-stroke-strong)
    );
  }

  .command-button:hover .button-icon i {
    color: var(--theme-accent-strong, var(--theme-accent));
  }

  .footer-button.collapsed {
    width: var(--min-touch-target);
    padding: 0;
    border-radius: 12px;
    /* No justify-content:center. The 44px icon column is wider than this
       button's 42px content box (44 border-box − 2px borders), so centering
       pulled the column 1px LEFT (icon center x=32) while the expanded button
       left-anchors it at x=33 — a 1px rightward jump on expand. Left-anchoring
       both (flex-start) lands the icon at x=33 in both states: no shift. The
       footer's 8px collapsed pad + 2px centering already equals the expanded
       10px pad, so the button's left edge matches too. */
  }

  .footer-button:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--theme-accent) 70%, transparent);
    outline-offset: 2px;
  }

  /* Fixed 32px glyph + 6px side margins = a rock-solid 44px icon column,
     pinned by flex-shrink:0 so the button's width flip can't squeeze it.
     Identical in both states → icon center stays at x=32 through the swap,
     no left/right jump. Only the background tile fades. */
  .button-icon {
    position: relative;
    width: 32px;
    height: 32px;
    margin: 0 6px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-base);
    border-radius: 8px;
    background: var(--theme-card-bg, var(--theme-card-bg));
    transition: background var(--duration-normal) var(--ease-standard);
  }

  .footer-button.collapsed .button-icon {
    background: transparent;
  }

  .footer-button:hover .button-icon {
    background: var(--theme-card-hover-bg);
  }

  /* Always mounted, so a label moves with the width in both directions. It
     opens on the width's curve with no delay. It closes on the shorter token,
     so it has faded before the narrowing button reaches its letters. */
  .button-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-align: left;
    font-weight: 500;
    white-space: nowrap;
    transition: opacity var(--duration-normal) var(--ease-out);
  }

  .footer-button.collapsed .button-label,
  .footer-button.collapsed .unread-label-badge {
    opacity: 0;
    transition: opacity var(--duration-instant) var(--ease-out);
  }

  .unread-label-badge {
    transition: opacity var(--duration-normal) var(--ease-out);
  }

  .footer-button.collapsed .unread-label-badge {
    min-width: 0;
    width: 0;
    padding: 0;
    overflow: hidden;
  }

  .prop-button {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #818cf8) 25%,
      transparent
    );
  }

  .prop-button:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent, #818cf8) 10%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #818cf8) 40%,
      transparent
    );
  }

  .prop-button .button-icon {
    background: transparent;
  }

  .inbox-icon-wrapper {
    position: relative;
  }

  .inbox-button.has-unread {
    border-color: color-mix(
      in srgb,
      var(--semantic-info, #3b82f6) 30%,
      var(--theme-stroke)
    );
  }

  .inbox-button.has-unread:hover {
    border-color: color-mix(
      in srgb,
      var(--semantic-info, #3b82f6) 50%,
      var(--theme-stroke)
    );
  }

  .unread-badge {
    position: absolute;
    top: -6px;
    right: -6px;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    background: var(--semantic-error, #ef4444);
    border-radius: 9px;
    color: white;
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    line-height: 18px;
    text-align: center;
    pointer-events: none;
    animation: badgePop var(--duration-emphasis) var(--ease-spring);
  }

  .unread-label-badge {
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    background: var(--semantic-error, #ef4444);
    border-radius: 10px;
    color: white;
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    line-height: 20px;
    text-align: center;
    flex-shrink: 0;
  }

  @keyframes badgePop {
    0% {
      transform: scale(0);
    }
    50% {
      transform: scale(1.2);
    }
    100% {
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sidebar-footer,
    .footer-button,
    .button-icon,
    .button-label,
    .unread-label-badge {
      transition: none !important;
    }

    .unread-badge {
      animation: none;
    }
  }

  .mic-button {
    position: relative;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    align-self: center; /* same x in rail and expanded modes */
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    /* Theme text tokens, so the glyph reads in light mode too. Ratios in the
       accessibility-fixes spec: 65% clears 4.5:1 in both themes. */
    color: color-mix(in srgb, var(--theme-text, #fff) 65%, transparent);
    font-size: 13px;
    cursor: pointer;
    transition:
      background-color var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard),
      box-shadow var(--duration-normal) var(--ease-standard);
  }

  .mic-button:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
  }

  .mic-button:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--theme-accent) 70%, transparent);
    outline-offset: 2px;
  }

  /* Inactive: dimmer, indicates voice is available but not yet activated.
     50% keeps it a step below the enabled glyph and still clears the 3:1
     non-text floor in both themes. */
  .mic-button.inactive {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.02));
    color: color-mix(in srgb, var(--theme-text, #fff) 50%, transparent);
  }

  .mic-button.inactive:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
    color: color-mix(in srgb, var(--theme-text, #fff) 65%, transparent);
  }

  /* Command mode: glowing green */
  .mic-button.command-mode {
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 15%,
      transparent
    );
    color: var(--semantic-success, #22c55e);
    box-shadow: 0 0 12px
      color-mix(in srgb, var(--semantic-success, #22c55e) 30%, transparent);
  }

  .mic-button.command-mode:hover {
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 25%,
      transparent
    );
    box-shadow: 0 0 16px
      color-mix(in srgb, var(--semantic-success, #22c55e) 40%, transparent);
  }

  .mic-glow-ring {
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    border: 2px solid
      color-mix(in srgb, var(--semantic-success, #22c55e) 40%, transparent);
    animation: mic-glow-pulse 2s ease-out infinite;
  }

  @keyframes mic-glow-pulse {
    0% {
      transform: scale(1);
      opacity: 0.6;
    }
    100% {
      transform: scale(1.5);
      opacity: 0;
    }
  }

  /* Error state */
  .mic-button.error {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 10%,
      transparent
    );
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 60%, transparent);
  }

  @media (prefers-reduced-motion: reduce) {
    .mic-glow-ring {
      animation: none;
      opacity: 0.3;
    }

    .mic-button {
      transition: none;
    }
  }
</style>
