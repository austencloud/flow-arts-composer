<!--
  AccountSettingsSection Component

  Orchestrator for editable personal details.
  Each editor is a separate component with its own state and styles.
-->
<script lang="ts">
  import type { HapticFeedback } from "../../../application/services/haptic-feedback";
  import type { User } from "firebase/auth";
  import DisplayNameEditor from "./DisplayNameEditor.svelte";
  import UsernameEditor from "./UsernameEditor.svelte";
  import InstagramUsernameEditor from "./InstagramUsernameEditor.svelte";
  import PronounsEditor from "./PronounsEditor.svelte";

  interface Props {
    user: User;
    hapticService: HapticFeedback | null;
    onPronounsChanged?: (pronouns: string) => void;
    onUsernameChanged?: (username: string) => void;
    displayNameEditRequest?: number;
  }

  let {
    user,
    hapticService,
    onPronounsChanged,
    onUsernameChanged,
    displayNameEditRequest = 0,
  }: Props = $props();
</script>

<div class="account-settings">
  <div class="field-cell">
    <DisplayNameEditor
      {user}
      {hapticService}
      editRequest={displayNameEditRequest}
    />
  </div>

  <div class="field-cell">
    <UsernameEditor {user} {hapticService} {onUsernameChanged} />
  </div>

  <div class="field-cell">
    <InstagramUsernameEditor {user} {hapticService} />
  </div>

  <div class="field-cell">
    <PronounsEditor {user} {hapticService} {onPronounsChanged} />
  </div>
</div>

<style>
  .account-settings {
    display: grid;
    grid-template-rows: repeat(4, minmax(5em, 1fr));
    width: 100%;
    min-height: 0;
  }

  .field-cell {
    display: flex;
    min-width: 0;
  }

  .field-cell :global(.section) {
    width: 100%;
    min-width: 0;
  }

  .account-settings :global(.input-row) {
    width: min(100%, 34rem);
  }

  @container profile-tab (min-width: 105rem) {
    .account-settings {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: repeat(2, minmax(8.5em, auto));
      align-content: center;
      gap: 0.75em;
      padding-block: 0.4em;
    }

    .field-cell {
      min-height: 8.5em;
      align-items: center;
      padding: 1.1em 1.2em;
      border: 1px solid var(--theme-stroke);
      border-radius: 0.85em;
      background: color-mix(
        in srgb,
        var(--theme-card-bg) 92%,
        var(--theme-text) 8%
      );
      transition:
        background var(--duration-fast) ease,
        border-color var(--duration-fast) ease,
        box-shadow var(--duration-fast) ease;
    }

    .field-cell:hover {
      border-color: var(--theme-stroke-strong);
      background: color-mix(
        in srgb,
        var(--theme-card-bg) 88%,
        var(--theme-text) 12%
      );
    }

    .field-cell:focus-within {
      border-color: color-mix(in srgb, var(--theme-accent) 55%, transparent);
      box-shadow: 0 0 0 3px
        color-mix(in srgb, var(--theme-accent) 12%, transparent);
    }

    .field-cell :global(.account-value-row) {
      min-height: 0;
      padding: 0;
      border-bottom: 0;
    }

    .field-cell :global(.row-copy) {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.25em;
    }

    .field-cell :global(.edit-action .panel-btn) {
      min-width: 5.25em;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .field-cell {
      transition: none;
    }
  }
</style>
