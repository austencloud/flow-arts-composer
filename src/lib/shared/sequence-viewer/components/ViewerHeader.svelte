<!--
  The one sequence-viewer header. SequenceViewerShell owns where it appears;
  this component owns the header's identity, responsive action hierarchy, and
  visual language. Hosts provide callbacks instead of rebuilding the chrome.
-->
<script lang="ts">
  import type { OrchestratorContext } from "../domain/viewer-orchestrator-context";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { ShareActionMenuItem } from "$lib/shared/share/domain/models/share-action-menu";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import RobustAvatar from "$lib/shared/components/avatar/RobustAvatar.svelte";
  import WordHeader from "$lib/shared/animation-engine/components/layers/WordHeader.svelte";
  import WordActionMenu from "$lib/shared/choreo-card/components/WordActionMenu.svelte";
  import ShareActionMenu from "$lib/shared/share/components/ShareActionMenu.svelte";
  import MotionVisibilityToggle from "./MotionVisibilityToggle.svelte";
  import ViewerOverflowMenu from "./ViewerOverflowMenu.svelte";
  import PropViewingControl from "$lib/shared/browse/components/PropViewingControl.svelte";
  import {
    resolveViewingProps,
    viewingPropLabel,
  } from "$lib/shared/foundation/services/prop-viewing";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import { getMotionColor } from "$lib/shared/utils/svg-color-utils";
  import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

  const handColors = $derived(
    getSettings().primaryPropColors ?? {
      left: getMotionColor(
        HandSide.LEFT,
        getSettings().darkMode ? "dark" : "light"
      ),
      right: getMotionColor(
        HandSide.RIGHT,
        getSettings().darkMode ? "dark" : "light"
      ),
    }
  );

  interface HeaderNavigation {
    label: string;
  }

  interface GuideAction {
    label: string;
    onSelect: () => void;
  }

  interface ExportSettingsAction {
    expanded: boolean;
    onToggle: () => void;
  }

  type OverflowOpenReason = "trigger" | "item" | "backdrop" | "escape" | "tab";

  interface Props {
    ctx: OrchestratorContext;
    sequence: SequenceData;
    isMobile: boolean;
    viewerWidth: number;
    onClose: () => void;
    hidden?: boolean;
    embedded?: boolean;
    navigation?: HeaderNavigation;
    /** A non-word title that outranks `sequence.word` — e.g. a tunnel's own
     *  name, which is a composition (cast, formation, props) rather than a
     *  single alphabet word. When set, the header shows this text instead of
     *  the glyph-rendered word, and word-specific actions (copy, read aloud)
     *  are disabled: they operate on a TKA word, and this title is not one. */
    titleOverride?: string | null;
    openAppHref?: string;
    onAccountSignIn?: () => void;
    onAccountOpenApp?: () => void;
    guideAction?: GuideAction | null;
    isFavorite: boolean;
    onFavoriteToggle?: () => void;
    isSaved: boolean;
    isSaving: boolean;
    onSave?: () => void;
    onRemix?: () => void;
    onPracticeToggle?: () => void;
    canToggleMotionVisibility?: boolean;
    onMotionToggleLeft?: () => void;
    onMotionToggleRight?: () => void;
    onVideoUpload?: () => void;
    isPublished: boolean;
    onPublish?: () => void;
    onUnpublish?: () => void;
    onDeleteRequest?: () => void;
    onOpenApp?: () => void;
    onOverflowOpenChange?: (open: boolean, reason: OverflowOpenReason) => void;
    exportSettings?: ExportSettingsAction | null;
    shareActions: readonly ShareActionMenuItem[];
    shareStatusMessage?: string;
    onShareActionSelect: (actionId: string) => void;
  }

  let {
    ctx,
    sequence,
    isMobile,
    viewerWidth,
    onClose,
    hidden = false,
    embedded = false,
    navigation,
    titleOverride = null,
    openAppHref,
    onAccountSignIn,
    onAccountOpenApp,
    guideAction = null,
    isFavorite,
    onFavoriteToggle,
    isSaved,
    isSaving,
    onSave,
    onRemix,
    onPracticeToggle,
    canToggleMotionVisibility = false,
    onMotionToggleLeft,
    onMotionToggleRight,
    onVideoUpload,
    isPublished,
    onPublish,
    onUnpublish,
    onDeleteRequest,
    onOpenApp,
    onOverflowOpenChange,
    exportSettings = null,
    shareActions,
    shareStatusMessage = "",
    onShareActionSelect,
  }: Props = $props();

  const FULL_CHROME_MIN_WIDTH = 1080;
  const LABELLED_CHROME_MIN_WIDTH = 1840;
  const GENEROUS_CHROME_MIN_WIDTH = 2200;

  const compactChrome = $derived(
    isMobile || viewerWidth < FULL_CHROME_MIN_WIDTH
  );
  const labelledChrome = $derived(
    !compactChrome &&
      viewerWidth >=
        (navigation ? GENEROUS_CHROME_MIN_WIDTH : LABELLED_CHROME_MIN_WIDTH)
  );
  const hasAccountEntry = $derived(
    !!openAppHref && !!onAccountSignIn && !embedded
  );
  const showOpenAppAction = $derived(
    !!onOpenApp && !(hasAccountEntry && authState.isFullAccount)
  );
  const identityWord = $derived(
    sequence.word || sequence.displayName || sequence.name || "Sequence"
  );
  const trimmedTitleOverride = $derived(titleOverride?.trim() || "");
  /** Plain-text title actually shown in the slot: the override when present,
   *  else the word identity. */
  const displayTitle = $derived(trimmedTitleOverride || identityWord);
  /** True only when the slot is showing `sequence.word` itself — gates the
   *  glyph renderer and the word-specific actions in the menu below. */
  const isWordTitle = $derived(!trimmedTitleOverride && !!sequence.word);
  const activeWordStepNumber = $derived(
    ctx.editingPane !== "image" &&
      ctx.highlightedStepIndex !== null &&
      ctx.highlightedStepIndex >= 0
      ? ctx.highlightedStepIndex + 1
      : null
  );
  const hasDirectVisibilityAction = $derived(!!onPublish || !!onUnpublish);
  const hasContextActions = $derived(
    canToggleMotionVisibility ||
      hasDirectVisibilityAction ||
      !!onVideoUpload ||
      showOpenAppAction ||
      !!onDeleteRequest
  );
  const hasRightActions = $derived(
    (hasAccountEntry && !!openAppHref) || !!exportSettings || !embedded
  );

  let shareMenuOpen = $state(false);
  let viewingControl = $state<{ show: () => void }>();
  const showViewingProps = $derived(
    !hidden && (ctx.leftPropType !== "hand" || ctx.rightPropType !== "hand")
  );
  const viewingLabel = $derived(
    viewingPropLabel(
      resolveViewingProps(getSettings(), sequence, ctx.collectionPropType)
        .config
    )
  );

  function handleVisibilityAction(): void {
    if (isPublished) onUnpublish?.();
    else onPublish?.();
  }
</script>

<header
  style:--motion-left-color={handColors.left}
  style:--motion-right-color={handColors.right}
  class="viewer-header"
  class:compact={compactChrome}
  class:labelled={labelledChrome}
  class:with-navigation={!!navigation}
  class:word-roomy={!hasRightActions}
  data-hidden={hidden}
>
  <div class="header-side header-left">
    {#if ctx.practiceActive}
      {#if onPracticeToggle}
        <button
          type="button"
          class="viewer-action practice-exit"
          onclick={onPracticeToggle}
          aria-label="Exit practice mode"
          title="Exit practice mode"
        >
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
          <span class="action-label">Exit Practice</span>
        </button>
      {/if}
      {#if compactChrome && showViewingProps}
        <ViewerOverflowMenu
          variant="header"
          dropDown
          align="left"
          onPropsOpen={() => viewingControl?.show()}
          propsLabel={`Viewing props · ${viewingLabel}`}
          onOpenChange={onOverflowOpenChange}
        />
      {/if}
    {:else}
      {#if navigation}
        <button
          type="button"
          class="viewer-action navigation-action"
          data-escape-shortcut
          data-escape-shortcut-label="Viewer"
          onclick={onClose}
          aria-label={navigation.label}
          title={navigation.label}
        >
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
        </button>
      {/if}

      {#if !compactChrome}
        {#if onFavoriteToggle}
          <button
            type="button"
            class="viewer-action core-action favorite-action"
            class:favorite-active={isFavorite}
            onclick={onFavoriteToggle}
            aria-label={isFavorite
              ? "Remove from favorites"
              : "Add to favorites"}
            aria-pressed={isFavorite}
            title={isFavorite ? "Favorited" : "Favorite"}
          >
            <i class="{isFavorite ? 'fas' : 'far'} fa-heart" aria-hidden="true"
            ></i>
            <span class="action-label">Favorite</span>
          </button>
        {/if}

        {#if onSave}
          <button
            type="button"
            class="viewer-action core-action save-action"
            class:saved={isSaved}
            class:saving={isSaving}
            data-save-shortcut={!isSaved ? "" : undefined}
            onclick={onSave}
            disabled={isSaved || isSaving}
            aria-label={isSaving
              ? "Saving to library"
              : isSaved
                ? "Saved to library"
                : "Save to library"}
            title={isSaving
              ? "Saving to library"
              : isSaved
                ? "Saved to library"
                : "Save to library"}
          >
            <i
              class="fas {isSaving
                ? 'fa-spinner fa-spin'
                : isSaved
                  ? 'fa-check'
                  : 'fa-bookmark'}"
              aria-hidden="true"
            ></i>
            <span class="action-label stable-label" aria-live="polite">
              <span class="label-sizer" aria-hidden="true">Saving…</span>
              <span class="label-live">
                {isSaving ? "Saving…" : isSaved ? "Saved" : "Save"}
              </span>
            </span>
          </button>
        {/if}

        {#if onRemix}
          <button
            type="button"
            class="viewer-action core-action remix-action"
            onclick={onRemix}
            aria-label="Remix sequence"
            title="Remix"
          >
            <i class="fas fa-pen-to-square" aria-hidden="true"></i>
            <span class="action-label">Remix</span>
          </button>
        {/if}
      {/if}

      {#if onPracticeToggle}
        <button
          type="button"
          class="viewer-action core-action practice-action"
          onclick={onPracticeToggle}
          aria-label="Practice"
          title="Practice"
        >
          <i class="fas fa-dumbbell" aria-hidden="true"></i>
          <span class="action-label">Practice</span>
        </button>
      {/if}

      {#if !compactChrome && hasContextActions}
        <span class="action-divider" aria-hidden="true"></span>
        <div class="context-actions">
          {#if canToggleMotionVisibility}
            <MotionVisibilityToggle
              onToggleLeft={onMotionToggleLeft}
              onToggleRight={onMotionToggleRight}
            />
          {/if}

          {#if hasDirectVisibilityAction}
            <button
              type="button"
              class="viewer-action context-action visibility-action"
              class:published={isPublished}
              onclick={handleVisibilityAction}
              aria-label={isPublished ? "Make Private" : "Make Public"}
              title={isPublished ? "Make Private" : "Make Public"}
            >
              <i
                class="fas {isPublished ? 'fa-eye-slash' : 'fa-eye'}"
                aria-hidden="true"
              ></i>
            </button>
          {/if}

          {#if onVideoUpload}
            <button
              type="button"
              class="viewer-action context-action"
              onclick={onVideoUpload}
              aria-label="Upload video"
              title="Upload Video"
            >
              <i class="fas fa-video" aria-hidden="true"></i>
            </button>
          {/if}

          {#if showOpenAppAction && onOpenApp}
            <button
              type="button"
              class="viewer-action context-action open-app-action"
              onclick={onOpenApp}
              aria-label="Open Flow Arts Composer"
              title="Open Flow Arts Composer"
            >
              <i class="fas fa-compass" aria-hidden="true"></i>
            </button>
          {/if}

          {#if onDeleteRequest}
            <button
              type="button"
              class="viewer-action context-action delete-action"
              onclick={onDeleteRequest}
              aria-label="Delete sequence"
              title="Delete"
            >
              <i class="fas fa-trash" aria-hidden="true"></i>
            </button>
          {/if}
        </div>
      {/if}

      {#if compactChrome}
        <ViewerOverflowMenu
          variant="header"
          onPropsOpen={showViewingProps
            ? () => viewingControl?.show()
            : undefined}
          propsLabel={`Viewing props · ${viewingLabel}`}
          dropDown
          align="left"
          {isFavorite}
          {onFavoriteToggle}
          {isSaved}
          {isSaving}
          {onSave}
          {onRemix}
          {onVideoUpload}
          {isPublished}
          {onPublish}
          {onUnpublish}
          {onDeleteRequest}
          onOpenApp={showOpenAppAction ? onOpenApp : undefined}
          onGuideAction={guideAction?.onSelect}
          guideActionLabel={guideAction?.label}
          motionVisibility={canToggleMotionVisibility
            ? {
                showLeft: ctx.viewerVisibility.leftMotion,
                showRight: ctx.viewerVisibility.rightMotion,
                onToggleLeft: onMotionToggleLeft ?? (() => {}),
                onToggleRight: onMotionToggleRight ?? (() => {}),
              }
            : undefined}
          onOpenChange={onOverflowOpenChange}
        />
      {/if}
    {/if}
  </div>

  <div class="header-word-slot">
    {#snippet wordTrigger(actions)}
      <button
        type="button"
        class="header-word-action"
        class:open={actions.isOpen}
        onclick={actions.onclick}
        oncontextmenu={actions.oncontextmenu}
        onpointerdown={actions.onpointerdown}
        onpointermove={actions.onpointermove}
        onpointerup={actions.onpointerup}
        onpointercancel={actions.onpointercancel}
        onpointerleave={actions.onpointerleave}
        aria-haspopup={isWordTitle ? "menu" : undefined}
        aria-expanded={isWordTitle ? actions.isOpen : undefined}
        aria-label={isWordTitle
          ? `Current word: ${actions.copyableWord}. Open word actions.`
          : displayTitle}
        title={isWordTitle
          ? `Word actions for ${actions.copyableWord}`
          : displayTitle}
      >
        <span class="word-display">
          {#if isWordTitle}
            <WordHeader
              word={sequence.word}
              visible
              darkMode
              presentation="chrome"
              activeStepNumber={activeWordStepNumber}
            />
          {:else}
            <span class="word-text">{displayTitle}</span>
          {/if}
        </span>
        {#if isWordTitle}
          <i
            class="fas fa-chevron-down word-disclosure"
            class:open={actions.isOpen}
            aria-hidden="true"
          ></i>
        {/if}
      </button>

      {#if actions.copied}
        <div class="word-status" role="status" aria-live="polite">
          Copied “{actions.copyableWord}”
        </div>
      {/if}
    {/snippet}

    <WordActionMenu
      word={isWordTitle ? identityWord : ""}
      enabled={isWordTitle}
      errorContext={{ module: "sequence-viewer" }}
      trigger={wordTrigger}
    />
  </div>

  <div class="header-side header-right">
    {#if hasAccountEntry && openAppHref}
      <div class="account-entry-slot">
        {#if authState.isFullAccount}
          <a
            class="account-entry-control avatar"
            href={openAppHref}
            aria-label="Open Flow Arts Composer"
            title="Open Flow Arts Composer"
            onclick={onAccountOpenApp
              ? (event) => {
                  event.preventDefault();
                  onAccountOpenApp();
                }
              : undefined}
          >
            <RobustAvatar
              src={authState.user?.photoURL}
              name={authState.user?.displayName ||
                authState.user?.email ||
                "Account"}
              alt=""
              size="sm"
            />
          </a>
        {:else}
          <button
            type="button"
            class="account-entry-control sign-in"
            onclick={onAccountSignIn}
            aria-label="Sign in"
          >
            <i class="fas fa-user" aria-hidden="true"></i>
            <span>Sign in</span>
          </button>
        {/if}
      </div>
    {/if}

    {#if showViewingProps}
      <PropViewingControl
        bind:this={viewingControl}
        {sequence}
        collectionPropType={ctx.collectionPropType}
        presentation={compactChrome ? "none" : "toolbar"}
      />
    {/if}

    {#if exportSettings}
      <button
        type="button"
        class="viewer-action"
        class:accent-active={exportSettings.expanded}
        onclick={exportSettings.onToggle}
        aria-label={exportSettings.expanded
          ? "Hide export settings"
          : "Show export settings"}
        title={exportSettings.expanded ? "Hide settings" : "Show settings"}
      >
        <i class="fas fa-sliders" aria-hidden="true"></i>
      </button>
    {/if}

    {#if !embedded}
      <!-- Share sits here on every pane, always. It is the one door out of the
           viewer: card, video, link, download, Instagram, Facebook all live
           behind it. Austen (2026-08-11): "Let's keep Share in one consistent
           place in the header always, we don't need it in two places." -->
      <div class="share-slot">
        <ShareActionMenu
          bind:open={shareMenuOpen}
          actions={shareActions}
          triggerLabel={labelledChrome ? "Share" : undefined}
          useMobileSheet={isMobile}
          disabled={!ctx.hasSequence}
          ariaLabel="Share sequence"
          sheetTitle="Share sequence"
          tooltip="Share sequence"
          testId="viewer-share-button"
          idBase="viewer-share"
          menuSide="bottom"
          containDesktopMenu={true}
          statusMessage={shareStatusMessage}
          onDirectOpen={() => onShareActionSelect("share-sequence")}
          onActionSelect={onShareActionSelect}
        />
      </div>

      {#if !navigation}
        <button
          type="button"
          class="viewer-action close-action"
          data-escape-shortcut
          data-escape-shortcut-label="Viewer"
          data-ghost="safe"
          data-ghost-kind="close-overlay"
          data-ghost-label="Close viewer"
          onclick={onClose}
          aria-label="Close viewer"
          title="Close viewer"
        >
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      {/if}
    {/if}
  </div>
</header>

<style>
  .viewer-header {
    position: relative;
    z-index: 20;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
    padding: calc(env(safe-area-inset-top, 0px) + 4px) 12px 4px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-panel-bg, rgba(8, 10, 16, 0.96));
    flex: 0 0 auto;
  }

  .viewer-header[data-hidden="true"] {
    display: none;
  }

  .header-side {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .header-left {
    justify-self: start;
  }

  .header-right {
    justify-self: end;
  }

  .viewer-action,
  .account-entry-control {
    box-sizing: border-box;
    display: inline-flex;
    width: var(--min-touch-target, 44px);
    min-width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    align-items: center;
    justify-content: center;
    gap: 0;
    padding: 0;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 10px;
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--theme-text, #ffffff) 5%, transparent),
        transparent 72%
      ),
      var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    box-shadow:
      inset 0 1px 0
        color-mix(in srgb, var(--theme-text, #ffffff) 8%, transparent),
      0 2px 6px
        color-mix(in srgb, var(--theme-shadow, #000000) 32%, transparent);
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.72));
    cursor: pointer;
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    text-decoration: none;
    transition:
      background 150ms ease,
      border-color 150ms ease,
      color 150ms ease,
      box-shadow 150ms ease,
      transform 150ms ease;
  }

  .viewer-header.labelled
    .viewer-action:not(.close-action):not(.navigation-action):not(
      .context-action
    ) {
    width: auto;
    padding-inline: 12px;
    gap: 8px;
  }

  .viewer-action:hover:not(:disabled),
  .account-entry-control:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.24));
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    color: var(--theme-text, #ffffff);
    box-shadow:
      inset 0 1px 0
        color-mix(in srgb, var(--theme-text, #ffffff) 13%, transparent),
      0 5px 14px
        color-mix(in srgb, var(--theme-shadow, #000000) 38%, transparent);
    transform: translateY(-1px);
  }

  .viewer-action:active:not(:disabled),
  .account-entry-control:active {
    transform: translateY(0) scale(0.96);
  }

  .viewer-action:focus-visible,
  .account-entry-control:focus-visible,
  .header-word-action:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .viewer-action:disabled {
    cursor: default;
    opacity: 0.72;
  }

  .action-label {
    display: none;
  }

  .viewer-header.labelled .action-label {
    display: inline-grid;
  }

  .stable-label,
  .label-sizer,
  .label-live {
    grid-area: 1 / 1;
  }

  .label-sizer {
    visibility: hidden;
  }

  .context-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .favorite-active {
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 45%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 14%,
      transparent
    );
    color: var(--semantic-error, #ef4444);
  }

  .saved,
  .published {
    border-color: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 44%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 13%,
      transparent
    );
    color: var(--semantic-success, #22c55e);
  }

  .saving {
    border-color: color-mix(
      in srgb,
      var(--semantic-info, #38bdf8) 52%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--semantic-info, #38bdf8) 12%,
      transparent
    );
    color: var(--semantic-info, #38bdf8);
  }

  .accent-active {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 48%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 16%,
      transparent
    );
    color: var(--theme-accent, #a78bfa);
  }

  .practice-exit {
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 65%,
      transparent
    );
    background: var(--semantic-error, #ef4444);
    color: #ffffff;
  }

  .close-action:hover {
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 55%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 16%,
      transparent
    );
    color: var(--semantic-error, #f87171);
  }

  .delete-action:hover {
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 55%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 16%,
      transparent
    );
    color: var(--semantic-error, #f87171);
  }

  .action-divider {
    width: 1px;
    height: 24px;
    margin-inline: 2px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.12));
    flex: 0 0 auto;
  }

  .header-word-slot {
    position: relative;
    min-width: 0;
    width: clamp(80px, 19vw, 260px);
    justify-self: center;
  }

  .header-word-action {
    display: flex;
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 3px 10px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: transparent;
    color: var(--theme-text, #ffffff);
    cursor: pointer;
    transition:
      background 150ms ease,
      border-color 150ms ease;
  }

  .header-word-action:hover,
  .header-word-action.open {
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
  }

  .word-display {
    display: block;
    width: calc(100% - 18px);
    min-width: 0;
    height: 28px;
    overflow: hidden;
    flex: 1 1 auto;
  }

  .word-text {
    display: block;
    overflow: hidden;
    font-family: Georgia, serif;
    font-size: var(--font-size-lg, 18px);
    font-weight: 650;
    line-height: 28px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .word-disclosure {
    flex: 0 0 auto;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
    font-size: 10px;
    transition: transform 160ms ease;
  }

  .word-disclosure.open {
    transform: rotate(180deg);
  }

  .word-status {
    position: absolute;
    top: calc(100% + 7px);
    left: 50%;
    z-index: var(--z-dropdown, 1000);
    transform: translateX(-50%);
    padding: 7px 11px;
    border-radius: 8px;
    background: var(--semantic-success, #22c55e);
    box-shadow: 0 8px 24px var(--theme-shadow, rgba(0, 0, 0, 0.35));
    color: #06140b;
    font-size: var(--font-size-compact, 12px);
    font-weight: 800;
    white-space: nowrap;
  }

  .account-entry-slot {
    display: flex;
    width: 5.5rem;
    height: var(--min-touch-target, 44px);
    align-items: center;
    justify-content: flex-end;
    flex: 0 0 5.5rem;
  }

  .account-entry-control.sign-in {
    width: 100%;
    gap: 7px;
    padding-inline: 10px;
  }

  .account-entry-control.avatar {
    width: var(--min-touch-target, 44px);
    border-color: transparent;
    border-radius: 50%;
    background: transparent;
  }

  .share-slot {
    display: flex;
    --share-trigger-size: var(--min-touch-target, 44px);
    --share-trigger-width: var(--min-touch-target, 44px);
    --share-trigger-radius: 10px;
    --share-trigger-gap: 0;
    --share-trigger-padding-inline: 0;
    --share-trigger-label-display: none;
  }

  .viewer-header.labelled .share-slot {
    --share-trigger-width: auto;
    --share-trigger-gap: 8px;
    --share-trigger-padding-inline: 14px;
    --share-trigger-label-display: inline;
  }

  @media (max-width: 599px) {
    .viewer-header {
      gap: 4px;
      padding-inline: 8px;
    }

    .account-entry-slot {
      width: var(--min-touch-target, 44px);
      flex-basis: var(--min-touch-target, 44px);
    }

    .account-entry-control.sign-in {
      width: var(--min-touch-target, 44px);
      padding: 0;
    }

    .account-entry-control.sign-in span {
      display: none;
    }

    .header-word-slot {
      width: clamp(72px, 22vw, 112px);
    }

    .viewer-header:not(.with-navigation) .header-word-slot {
      width: clamp(72px, calc(100vw - 292px), 132px);
    }

    /* Embedded viewers do not render account/share/close actions on the right.
       Spend that genuinely free space on the sequence identity instead of
       applying the full-header reservation and shrinking a normal word to a
       five-pixel glyph size. */
    .viewer-header.word-roomy .header-word-slot {
      width: clamp(136px, 40vw, 156px);
    }
  }

  @media (max-width: 420px) {
    .header-word-slot {
      width: 72px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .viewer-action,
    .account-entry-control,
    .header-word-action,
    .word-disclosure {
      transition: none;
    }
  }

  @media (forced-colors: active) {
    .viewer-action,
    .account-entry-control,
    .header-word-action {
      border: 2px solid ButtonText;
      background: Canvas;
      color: ButtonText;
    }
  }
</style>
