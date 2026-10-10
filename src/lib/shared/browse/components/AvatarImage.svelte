<script lang="ts">
  /**
   * AvatarImage
   * Thin wrapper around RobustAvatar for backwards compatibility.
   * Provides robust avatar rendering with automatic retry and fallback.
   */

  import RobustAvatar from "#lib/shared/components/avatar/RobustAvatar.svelte";

  let {
    src,
    alt = "User avatar",
    size = 64,
    rounded = true,
    className = "",
    name,
    googleId,
  }: {
    src?: string | null;
    alt?: string;
    size?: number;
    rounded?: boolean;
    className?: string;
    /** User's display name for fallback initials */
    name?: string | null;
    /** Google user ID for fallback URL construction */
    googleId?: string | null;
  } = $props();
</script>

<div
  class="avatar-wrapper {className}"
  class:rounded
  style="--avatar-size: {size}px;"
>
  <RobustAvatar {src} {alt} {name} {googleId} customSize={size} />
</div>

<style>
  .avatar-wrapper {
    display: block;
    width: var(--avatar-size, 64px);
    height: var(--avatar-size, 64px);
    background: var(--theme-card-bg);
    border: 2px solid var(--theme-stroke);
    overflow: hidden;
  }

  .rounded {
    border-radius: 50%;
  }
</style>
