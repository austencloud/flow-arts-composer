<!--
  RetroUpgrade - UPGRADE.EXE Shareware Nag Dialog

  Classic shareware registration nag screen. Warning icon + text block
  with serial number, feature list, and three action buttons.
  Styled as a system dialog: gray background, etched border, centered.

  Shows real premium status: unregistered nag for free users,
  registration confirmation for premium/admin/tester users.

  Domain: Retro UPGRADE App
-->
<script lang="ts">
  import RetroButton from "../../primitives/RetroButton.svelte";
  import RetroStatusBar from "../../primitives/RetroStatusBar.svelte";
  import { RETRO_ICONS } from "../../rendering/retro-icons";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { isPremiumOrAbove } from "#lib/shared/auth/domain/models/user-role.js";
  import { desktopState } from "../../../state/desktop-state.svelte";

  /* Props                                                               */

  let {
    onclose,
  }: {
    onclose?: () => void;
  } = $props();

  /* Premium status                                                      */

  // Derive premium status from live auth role - reactive to role changes.
  const isPremium = $derived(isPremiumOrAbove(authState.role));

  // Display name: prefer Firebase user displayName, fall back to desktop state,
  // then a generic placeholder if neither is available yet.
  const licensedTo = $derived(
    authState.user?.displayName ||
    desktopState.userDisplayName ||
    "Registered User"
  );

  // Format the first 16 chars of the user UID as a Win95-style reg key.
  // Pattern: XXXX-XXXX-XXXX-XXXX
  const registrationKey = $derived(() => {
    const uid = authState.user?.uid ?? "0000000000000000";
    const raw = uid.replace(/-/g, "").toUpperCase().slice(0, 16).padEnd(16, "0");
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
  });

  /* ------------------------------------------------------------------ */
  /* State                                                               */
  /* ------------------------------------------------------------------ */

  let statusText = $state<string | null>(null);
  let registering = $state(false);

  const defaultStatusText = $derived(
    isPremium ? "Registered copy - thank you!" : "Unregistered copy"
  );

  /* ------------------------------------------------------------------ */
  /* Feature list                                                        */
  /* ------------------------------------------------------------------ */

  const FEATURES = [
    "Unlimited sequence generation",
    'Export to 3\u00BD" floppy',
    "Advanced defragmentation",
    "Staff Clippy assistant",
    "Remove this dialog",
  ];

  /* ------------------------------------------------------------------ */
  /* Actions                                                             */
  /* ------------------------------------------------------------------ */

  function handleRegister() {
    registering = true;
    statusText = "Connecting to Bellweather registration server...";

    setTimeout(() => {
      statusText = "Connection timed out.";
    }, 2000);
  }

  function handleRemindLater() {
    onclose?.();
  }

  function handleContinue() {
    onclose?.();
  }

  /* ------------------------------------------------------------------ */
  /* Status bar                                                          */
  /* ------------------------------------------------------------------ */

  const statusPanels = $derived([{ text: statusText ?? defaultStatusText }]);
</script>

<div class="upgrade-shell">
  <div class="upgrade-content">
    <div class="upgrade-dialog">
      <!-- Icon: info for registered, warning for unregistered -->
      <div class="upgrade-icon" aria-hidden="true">
        {#if isPremium}
          {@html RETRO_ICONS.info}
        {:else}
          {@html RETRO_ICONS.warning}
        {/if}
      </div>

      <!-- Text block -->
      <div class="upgrade-text">
        {#if isPremium}
          <!-- Registered view                                      -->
          <div class="upgrade-heading upgrade-heading--registered">REGISTERED COPY</div>

          <p class="upgrade-para">
            Thank you for supporting TKA Notation System development.
          </p>

          <div class="upgrade-registration-info">
            <div class="upgrade-reg-row">
              <span class="upgrade-reg-label">Licensed to:</span>
              <span class="upgrade-reg-value">{licensedTo}</span>
            </div>
            <div class="upgrade-reg-row">
              <span class="upgrade-reg-label">Registration key:</span>
              <span class="upgrade-serial-value">{registrationKey()}</span>
            </div>
            <div class="upgrade-reg-row">
              <span class="upgrade-reg-label">Product:</span>
              <span class="upgrade-reg-value">TKA Notation System v4.0</span>
            </div>
          </div>

          <p class="upgrade-para upgrade-para--muted">
            All features unlocked. This dialog may now be safely ignored.
          </p>
        {:else}
          <!-- Unregistered view                                    -->
          <div class="upgrade-heading">UNREGISTERED COPY</div>

          <p class="upgrade-para">
            This is an UNREGISTERED copy of TKA Notation System.
            You have been using it without registration.
          </p>

          <p class="upgrade-para">
            To unlock all features, please register at:
          </p>

          <div class="upgrade-address">
            <div class="upgrade-url">tkacomposer.com</div>
            <div class="upgrade-redacted">[or mail $29.95 to Bellweather Technical Institute, address redacted by order of the Institute]</div>
          </div>

          <div class="upgrade-features">
            <div class="upgrade-features-label">
              Features unlocked with registration:
            </div>
            <ul class="upgrade-feature-list">
              {#each FEATURES as feature}
                <li class="upgrade-feature-item">
                  <span class="upgrade-check">\u2713</span> {feature}
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    </div>

    <!-- Buttons -->
    <div class="upgrade-buttons">
      {#if isPremium}
        <RetroButton
          label="OK"
          isDefault={true}
          onclick={handleContinue}
        />
      {:else}
        <RetroButton
          label="Register Now"
          isDefault={true}
          onclick={handleRegister}
          disabled={registering}
        />
        <RetroButton
          label="Remind Me Later"
          onclick={handleRemindLater}
        />
        <RetroButton
          label="Continue Unregistered"
          onclick={handleContinue}
        />
      {/if}
    </div>
  </div>

  <!-- Status bar -->
  <div class="upgrade-statusbar">
    <RetroStatusBar panels={statusPanels} />
  </div>
</div>

<style>
  /* Shell layout                                                        */
  .upgrade-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--retro-button-face, #c0c0c0);
  }

  .upgrade-content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 16px;
    gap: 16px;
    overflow: auto;
  }

  .upgrade-statusbar {
    flex-shrink: 0;
  }

  /* Dialog layout                                                       */
  .upgrade-dialog {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    border: 2px groove var(--retro-button-face, #c0c0c0);
    padding: 16px;
    background: var(--retro-button-face, #c0c0c0);
  }

  .upgrade-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    image-rendering: pixelated;
  }

  .upgrade-icon :global(svg) {
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
  }

  .upgrade-text {
    flex: 1;
    min-width: 0;
    font-family: var(--retro-font-family, "Microsoft Sans Serif", Arial, sans-serif);
    font-size: var(--retro-font-size, 11px);
    color: var(--retro-black, #000);
    line-height: 1.5;
  }

  /* Typography                                                          */
  .upgrade-heading {
    font-size: 14px;
    font-weight: bold;
    margin-bottom: 8px;
    color: var(--retro-black, #000);
  }

  .upgrade-para {
    margin: 0 0 8px;
  }

  .upgrade-address {
    margin: 4px 0 8px 16px;
    font-style: italic;
  }

  .upgrade-redacted {
    color: var(--retro-disabled-text, #808080);
    font-style: italic;
  }

  .upgrade-serial-value {
    font-family: "Courier New", monospace;
    font-weight: bold;
    font-size: 12px;
    color: var(--retro-navy, #000080);
    letter-spacing: 0.5px;
  }

  /* Feature list                                                        */
  .upgrade-features {
    margin-top: 12px;
  }

  .upgrade-features-label {
    font-weight: bold;
    margin-bottom: 4px;
  }

  .upgrade-feature-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .upgrade-feature-item {
    padding: 1px 0;
  }

  .upgrade-check {
    color: #008000;
    font-weight: bold;
    margin-right: 4px;
  }

  /* Registered view                                                     */
  .upgrade-heading--registered {
    color: var(--retro-navy, #000080);
  }

  .upgrade-registration-info {
    margin: 8px 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    border: 1px inset var(--retro-button-face, #c0c0c0);
    padding: 8px;
    background: var(--retro-window-bg, #ffffff);
  }

  .upgrade-reg-row {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .upgrade-reg-label {
    font-weight: bold;
    font-size: 10px;
    color: var(--retro-disabled-text, #808080);
    text-transform: uppercase;
  }

  .upgrade-reg-value {
    color: var(--retro-black, #000);
  }

  .upgrade-para--muted {
    color: var(--retro-disabled-text, #808080);
    font-style: italic;
  }

  /* Unregistered view extras                                            */
  .upgrade-url {
    font-family: "Courier New", monospace;
    font-weight: bold;
    color: var(--retro-navy, #000080);
    text-decoration: underline;
    font-size: 12px;
  }

  /* Buttons                                                             */
  .upgrade-buttons {
    display: flex;
    justify-content: center;
    gap: 4px;
    flex-wrap: wrap;
  }
</style>
