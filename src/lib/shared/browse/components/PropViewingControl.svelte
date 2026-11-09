<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { Popover } from "bits-ui";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    getSettings,
    updateSettings,
  } from "#lib/shared/application/state/app-state.svelte.js";
  import { resolveViewingProps } from "#lib/shared/foundation/services/prop-viewing.js";
  import { localizedPropName } from "#lib/shared/settings/components/tabs/prop-type/localized-prop-name.js";
  import {
    captureActivePropConfig,
    type ResolvedPropConfig,
  } from "#lib/shared/foundation/services/recorded-prop-intent.js";
  import PropPairDialog from "#lib/shared/pictograph/prop/components/PropPairDialog.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import PropViewingPanel from "./PropViewingPanel.svelte";

  let {
    sequence = null,
    collectionPropType = null,
    preferences,
    presentation = "default",
    onUpdate = updateSettings,
  }: {
    presentation?: "default" | "toolbar";
    preferences?: import("#lib/shared/settings/domain/app-settings.js").AppSettings;
    onUpdate?: (
      patch: Partial<
        import("#lib/shared/settings/domain/app-settings.js").AppSettings
      >
    ) => void | Promise<void>;
    sequence?: SequenceData | null;
    collectionPropType?: PropType | null;
  } = $props();
  let open = $state(false);
  let choosing = $state(false);
  let anchor = $state<HTMLElement | null>(null);
  let triggerButton = $state<HTMLButtonElement | null>(null);
  const settings = $derived(preferences ?? getSettings());
  const resolved = $derived(
    resolveViewingProps(settings, sequence, collectionPropType)
  );
  const label = $derived.by(() => {
    const { leftPropType, rightPropType } = resolved.config;
    const left = localizedPropName(leftPropType);
    return leftPropType === rightPropType
      ? left
      : `${left} / ${localizedPropName(rightPropType)}`;
  });
  const sourceLabel = $derived(
    resolved.source === "Collection"
      ? t("browse_audit_collection")
      : resolved.source === "Saved with sequence"
        ? t("browse_audit_saved_with_sequence")
        : t("browse_audit_my_props")
  );
  const mixedGallery = $derived(
    settings.propViewingMode === "as-saved" && !sequence && !collectionPropType
  );
  // This sets which props sequences are drawn with; it never filters the
  // list, so the words say "shown with". The viewer header mounts it for one
  // sequence, where "thumbnails" would be wrong.
  const inGallery = $derived(!sequence);
  // The toolbar's eye icon stands in for the "Shown with" prefix.
  const buttonText = $derived(
    presentation === "toolbar"
      ? mixedGallery
        ? t("browse_audit_as_saved")
        : label
      : mixedGallery
        ? t("browse_audit_shown_with_saved_props")
        : `${t("browse_audit_viewing_prefix")}${label}`
  );
  const title = $derived(
    inGallery
      ? t("browse_audit_viewing_props")
      : t("browse_audit_show_sequences_with")
  );
  const ownProps = $derived(captureActivePropConfig(settings));
  const titleId = $props.id();
  // Off the panel, because a gallery's measured, clipped panes would misplace
  // and cut off a popover inside them. A viewer drawer owns the top layer, so
  // there it stays inside the drawer instead of going behind it on the body.
  const portalTarget = $derived<HTMLElement | string>(
    anchor?.closest<HTMLElement>('dialog, [role="dialog"]') ?? "body"
  );

  // The prop grid needs far more room than this popover, so the popover steps
  // aside for it rather than stacking on top.
  function changeProps(): void {
    open = false;
    choosing = true;
  }

  // A pick is the answer: it applies at once and shows those props, even if
  // the viewer was on saved props.
  function pickProps(next: ResolvedPropConfig): void {
    void onUpdate({ ...next, propViewingMode: "my-props" });
    choosing = false;
  }

  // The trigger toggles. Without this, its own press would count as an outside
  // press that closes the popover, and the click would open it straight back.
  function ignoreTriggerPress(event: Event): void {
    if (event.target instanceof Node && anchor?.contains(event.target)) {
      event.preventDefault();
    }
  }
</script>

<div
  class="viewing-control"
  class:toolbar={presentation === "toolbar"}
  bind:this={anchor}
>
  <PanelButton
    variant="secondary"
    bind:ref={triggerButton}
    onclick={() => (open = !open)}
    ariaLabel={t(
      inGallery
        ? "browse_audit_viewing_props_value"
        : "browse_audit_sequence_shown_with_value",
      {
        props: mixedGallery
          ? t("browse_audit_as_saved")
          : `${label}, ${sourceLabel}`,
      }
    )}
    ariaExpanded={open}
  >
    {#if presentation === "toolbar"}<i
        class="fas fa-eye viewing-icon"
        aria-hidden="true"
      ></i>{/if}
    <span class="prop-label">{buttonText}</span>
    {#if !mixedGallery}<span class="source">· {sourceLabel}</span>{/if}
    <i class="fas fa-chevron-down" aria-hidden="true"></i>
  </PanelButton>
</div>
<Popover.Root bind:open>
  <Popover.Portal to={portalTarget}>
    <Popover.Content
      customAnchor={anchor}
      preventScroll={false}
      side="bottom"
      align={presentation === "toolbar" ? "end" : "start"}
      sideOffset={8}
      collisionPadding={12}
      class="prop-viewing-popover"
      aria-labelledby={titleId}
      onInteractOutside={ignoreTriggerPress}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (!choosing) triggerButton?.focus();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      <PropViewingPanel
        {settings}
        {sequence}
        {collectionPropType}
        {title}
        {onUpdate}
        onChangeProps={changeProps}
      />
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
<PropPairDialog
  open={choosing}
  title={t("browse_audit_my_props")}
  value={ownProps}
  showColors
  onclose={() => (choosing = false)}
  onclosed={() => triggerButton?.focus()}
  onPick={pickProps}
/>

<style>
  .viewing-control {
    padding: 6px 12px;
    flex: 0 0 auto;
  }
  /* In a toolbar the control sizes to its words like the pills beside it,
     capped so a long prop pair cannot push the row's right-hand group out. */
  .viewing-control.toolbar {
    padding: 0;
    min-width: 0;
    max-width: 260px;
  }
  .toolbar :global(.panel-btn) {
    box-sizing: border-box;
    max-width: 100%;
    height: var(--min-touch-target, 48px);
    padding: 0 12px;
    gap: 6px;
  }
  .toolbar .viewing-icon {
    font-size: 11px;
    color: var(--theme-text-dim);
    flex-shrink: 0;
  }
  .toolbar .prop-label,
  .toolbar .source {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toolbar .source {
    flex-shrink: 1;
  }
  .source {
    color: var(--theme-text-dim);
  }
  :global(.prop-viewing-popover) {
    box-sizing: border-box;
    z-index: var(--z-dropdown, 1000);
    width: min(20rem, calc(100vw - 24px));
    max-height: var(--bits-popover-content-available-height, 85dvh);
    overflow-y: auto;
    padding: 8px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-md, 12px);
    background: var(--surface-panel-opaque);
    outline: none;
    transform-origin: var(--bits-popover-content-transform-origin);
  }
  :global(.prop-viewing-popover[data-state="open"]) {
    animation: prop-viewing-enter var(--duration-fast) var(--ease-out) both;
  }
  h2 {
    margin: 0;
    padding: 6px 4px 10px;
    color: var(--theme-text);
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    text-align: center;
  }
  @keyframes prop-viewing-enter {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.prop-viewing-popover[data-state="open"]) {
      animation: none;
    }
  }
</style>
