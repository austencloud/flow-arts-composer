<!--
  PropPairDialog.svelte

  PropPairPicker in a fit-sized dialog, wide enough that a laptop shows every
  prop with no scrollbar. Hosts: PropPairField's modal mode and the viewing
  props control.
-->
<script lang="ts">
  import type { ResolvedPropConfig } from "#lib/shared/foundation/services/recorded-prop-intent.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import PropPairPicker from "./PropPairPicker.svelte";

  let {
    open,
    title,
    value,
    hint,
    showColors = false,
    onclose,
    onclosed,
    onPick,
  }: {
    open: boolean;
    title: string;
    value: ResolvedPropConfig;
    hint?: string;
    showColors?: boolean;
    onclose: () => void;
    /** After the exit, once focus can move. */
    onclosed?: () => void;
    onPick: (next: ResolvedPropConfig) => void;
  } = $props();

  const titleId = $props.id();
</script>

<BaseModal
  {open}
  {onclose}
  {onclosed}
  size="fit"
  class="prop-pair-dialog"
  labelledBy={titleId}
>
  {#snippet header()}<h2 id={titleId}>{title}</h2>{/snippet}
  <div class="body">
    <PropPairPicker {value} {hint} {showColors} {onPick} />
  </div>
  {#snippet footer()}
    <div class="actions">
      <PanelButton variant="secondary" onclick={onclose}
        >{t("action_cancel")}</PanelButton
      >
    </div>
  {/snippet}
</BaseModal>

<style>
  .body {
    padding: 0 20px;
  }

  /* Wide enough for the prop grid's eight-column tier (850px of grid), so a
     laptop shows every prop in three rows with no scrollbar. Narrower
     screens take the full width less the gutters and the grid steps down. */
  :global(dialog.base-modal.prop-pair-dialog[data-size="fit"]) {
    width: min(calc(100vw - 32px), 920px);
  }

  /* Three short choices: the control sizes to them instead of spanning the
     wide dialog. */
  .body :global(.segmented-control) {
    max-width: 26rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    padding: 16px 20px 20px;
  }

  h2 {
    margin: 0;
    padding: 20px;
    font-size: var(--font-size-lg, 18px);
  }
</style>
