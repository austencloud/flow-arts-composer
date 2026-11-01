<!--
  ShowMeButton - takes the reader from a release note to the change itself.

  Renders only when the note's surface resolves to a tab this reader can
  open (resolveShowMeTarget); otherwise nothing, so old notes rot silently
  and no dead button ever shows. Navigation is the app's own
  handleModuleChange, the same path the What's New footer uses. A highlight
  also promises an arrival (anchor pulse or callout) through releaseTourState,
  which ReleaseTourArrival finishes once the target has mounted.

  Shared by WhatsNewModal and the Release Notes entries.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { ChangelogEntry } from "#lib/shared/versioning/domain/models/version-models.js";
  import { resolveShowMeTarget } from "#lib/shared/versioning/domain/utils/release-surface.js";
  import { changelogPlainText } from "#lib/shared/versioning/domain/utils/changelog-rich-text.js";
  import { handleModuleChange } from "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { resolveAccessTier } from "#lib/shared/auth/domain/access-tier.js";
  import { isPremiumOrAbove } from "#lib/shared/auth/domain/models/user-role.js";
  import { releaseTourState } from "../../../state/release-tour-state.svelte";

  let {
    entry,
    onNavigate,
    size = "md",
  }: {
    entry: ChangelogEntry;
    /** Runs before navigation so the host can close its modal or sheet. */
    onNavigate?: () => void;
    /** "sm" sits on one line beside list text; "md" stands under a featured note. */
    size?: "sm" | "md";
  } = $props();

  const tier = $derived(
    resolveAccessTier(
      authState.isAuthenticated,
      authState.isAnonymous,
      isPremiumOrAbove(authState.role)
    )
  );
  const target = $derived(resolveShowMeTarget(entry.surface, tier));

  async function show(event: MouseEvent) {
    event.stopPropagation();
    if (!target) return;
    if (entry.highlight) {
      releaseTourState.setPending({
        moduleId: target.moduleId,
        tabId: target.tabId,
        anchor: entry.anchor,
        callout: entry.callout,
      });
    } else {
      // A plain note's "Show me" cancels any arrival an earlier highlight left.
      releaseTourState.clear();
    }
    onNavigate?.();
    await handleModuleChange(target.moduleId, target.tabId);
  }
</script>

{#if target}
  <button
    type="button"
    class="show-me size-{size}"
    data-show-me
    aria-label={t("settings_show_me_entry", {
      text: changelogPlainText(entry.text),
    })}
    onclick={show}
  >
    <i class="fas fa-arrow-right" aria-hidden="true"></i>
    <span>{t("settings_show_me")}</span>
  </button>
{/if}

<style>
  /* The same glass pill the release-notes editor buttons wear, sized to sit
     beside a line of note text without pushing it. */
  .show-me {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: none;
    height: 34px;
    padding: 0 12px;
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--theme-accent) 30%, transparent);
    border-radius: 8px;
    color: var(--theme-accent);
    font: inherit;
    font-size: var(--font-size-compact);
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard);
  }

  .show-me:hover {
    background: color-mix(in srgb, var(--theme-accent) 25%, transparent);
  }

  .show-me:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .show-me.size-sm {
    height: 28px;
    padding: 0 10px;
  }

  .show-me i {
    font-size: 0.85em;
  }

  @media (prefers-reduced-motion: reduce) {
    .show-me {
      transition: none;
    }
  }
</style>
