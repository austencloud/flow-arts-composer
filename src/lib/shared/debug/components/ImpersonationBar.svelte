<!--
  ImpersonationBar - Compact bottom bar shown during user impersonation

  Sits at the bottom of .content-wrapper (below mobile nav or desktop content).
  Position: relative (flows in flex layout, not fixed).
  Height: 36px. Shows avatar + "Previewing: [Name]" + Exit button.
  Used on both desktop and mobile platforms.
-->
<script lang="ts">
  import RobustAvatar from "#lib/shared/components/avatar/RobustAvatar.svelte";
  import type { PreviewUserProfile } from "../state/user-preview-state.svelte";

  interface Props {
    previewProfile: PreviewUserProfile;
    onExitPreview: () => void;
  }

  let { previewProfile, onExitPreview }: Props = $props();

  const displayName = $derived(
    previewProfile.displayName || previewProfile.email || "Unknown"
  );
</script>

<div class="impersonation-bar" role="status" aria-live="polite">
  <div class="bar-left">
    <RobustAvatar
      src={previewProfile.photoURL}
      name={displayName}
      customSize={24}
      alt=""
    />
    <span class="bar-text">
      <span class="bar-label">Previewing:</span>
      <span class="bar-name">{displayName}</span>
    </span>
  </div>

  <button
    type="button"
    class="exit-btn"
    onclick={onExitPreview}
    aria-label="Exit user preview"
  >
    <i class="fas fa-sign-out-alt" aria-hidden="true"></i>
    <span>Exit</span>
  </button>
</div>

<style>
  .impersonation-bar {
    position: relative;
    flex-shrink: 0;
    min-height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px 0 12px;
    background: rgba(30, 58, 138, 0.9);
    border-bottom: 1px solid rgba(59, 130, 246, 0.4);
  }

  .bar-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }

  .bar-text {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
  }

  .bar-label {
    font-size: var(--font-size-compact, 12px);
    color: rgba(147, 197, 253, 0.8);
    flex-shrink: 0;
  }

  .bar-name {
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    color: #93c5fd;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .exit-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: var(--min-touch-target);
    min-width: var(--min-touch-target);
    padding: 0 14px;
    background: rgba(239, 68, 68, 0.25);
    border: 1px solid rgba(239, 68, 68, 0.5);
    border-radius: 8px;
    color: #fca5a5;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    transition: background var(--duration-fast, 150ms);
    flex-shrink: 0;
  }

  .exit-btn:active {
    background: rgba(239, 68, 68, 0.4);
  }

  .exit-btn i {
    font-size: var(--font-size-sm, 14px);
  }

  @media (prefers-reduced-motion: reduce) {
    .exit-btn {
      transition: none;
    }
  }
</style>
