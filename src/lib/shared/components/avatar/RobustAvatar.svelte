<script lang="ts">
  /**
   * RobustAvatar - Centralized avatar component with retry logic and fallback
   *
   * Features:
   * - Automatic retry on failure with fallback URLs
   * - Falls back to Google ID-based URL if original fails
   * - Falls back to generated initials avatar if all else fails
   * - Proper referrerpolicy for Google CDN compatibility
   * - Consistent styling across the app
   */

  import { generateAvatarUrl } from "#lib/shared/foundation/utils/avatar-generator.js";
  import {
    constructGoogleAvatarUrl,
    isGoogleAvatarUrl,
    isValidImageUrl,
  } from "#lib/shared/foundation/utils/google-avatar.js";

  type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

  interface Props {
    /** Primary image URL (from photoURL, avatar, etc.) */
    src?: string | null;
    /** User's display name (for fallback initials) */
    name?: string | null;
    /** Google user ID for fallback URL construction */
    googleId?: string | null;
    /** Alt text for the image */
    alt?: string;
    /** Avatar size preset */
    size?: AvatarSize;
    /** Custom size in pixels (overrides size preset) */
    customSize?: number;
    /** Show border ring */
    ring?: boolean;
    /** Ring color (CSS color value) */
    ringColor?: string;
    /** Additional CSS class */
    class?: string;
    /** Native <img> loading strategy. Default "eager" preserves the
        long-standing behavior (the <img> previously had no `loading`
        attribute at all, so the browser default of "eager" applied). Pass
        "lazy" for avatars that render far off-screen. */
    loading?: "lazy" | "eager";
    /** Called when image successfully loads */
    onload?: (img: HTMLImageElement) => void;
    /** Called when all fallbacks exhausted */
    onerror?: () => void;
  }

  let {
    src,
    name,
    googleId,
    alt = "User avatar",
    size = "md",
    customSize,
    ring = false,
    ringColor,
    class: className = "",
    loading = "eager",
    onload,
    onerror,
  }: Props = $props();

  // Size presets in pixels
  const sizeMap: Record<AvatarSize, number> = {
    xs: 24,
    sm: 32,
    md: 48,
    lg: 64,
    xl: 96,
  };

  const dimension = $derived(customSize ?? sizeMap[size]);

  // Track load state
  let imageLoaded = $state(false);
  let primaryFailed = $state(false);
  let fallbackFailed = $state(false);

  // The primary URL to try
  const primaryUrl = $derived(src && isValidImageUrl(src) ? src : null);

  // Fallback Google URL if we have a googleId
  const googleFallbackUrl = $derived(
    googleId ? constructGoogleAvatarUrl(googleId, dimension) : null
  );

  // Generated initials avatar as final fallback
  const initialsAvatar = $derived(generateAvatarUrl(name, dimension));

  // Try primary first, then Google fallback if primary fails
  const displayUrl = $derived.by(() => {
    if (primaryUrl && !primaryFailed) return primaryUrl;
    if (googleFallbackUrl && !fallbackFailed) return googleFallbackUrl;
    return null;
  });

  // Get initials for the placeholder
  const initials = $derived.by(() => {
    if (!name) return "?";
    return name
      .split(" ")
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() || "")
      .join("");
  });

  // Reset state when src changes
  $effect(() => {
    // When src changes, reset the load state
    const _src = src;
    imageLoaded = false;
    primaryFailed = false;
    fallbackFailed = false;
  });

  function handleLoad(event: Event) {
    imageLoaded = true;
    const img = event.currentTarget as HTMLImageElement;
    onload?.(img);
  }

  function handleError() {
    // If primary just failed, try the fallback
    if (primaryUrl && !primaryFailed) {
      primaryFailed = true;
      return;
    }
    // Fallback also failed - show initials
    fallbackFailed = true;
    imageLoaded = false;
    onerror?.();
  }

  // Determine what to show
  const showImage = $derived(!!displayUrl);
  const showInitials = $derived(!displayUrl);
</script>

<div
  class="robust-avatar {className}"
  class:ring
  style:--avatar-size="{dimension}px"
  style:--ring-color={ringColor ?? "rgba(139, 92, 246, 0.6)"}
>
  {#if showImage}
    <img
      src={displayUrl}
      {alt}
      class="avatar-image"
      class:loaded={imageLoaded}
      width={dimension}
      height={dimension}
      crossorigin={displayUrl && !isGoogleAvatarUrl(displayUrl) && !displayUrl.startsWith("data:") ? "anonymous" : undefined}
      referrerpolicy="no-referrer"
      {loading}
      onload={handleLoad}
      onerror={handleError}
    />
  {/if}

  {#if showInitials}
    <div class="avatar-initials" aria-hidden="true">
      {initials}
    </div>
  {/if}
</div>

<style>
  .robust-avatar {
    position: relative;
    width: var(--avatar-size);
    height: var(--avatar-size);
    border-radius: 50%;
    overflow: hidden;
    flex-shrink: 0;
    background: linear-gradient(135deg, var(--semantic-info) 0%, #764ba2 100%);
  }

  .robust-avatar.ring {
    box-shadow: 0 0 0 3px var(--ring-color);
  }

  .avatar-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
  }

  .avatar-initials {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    color: var(--theme-text, white);
    font-size: calc(var(--avatar-size) * 0.4);
    text-transform: uppercase;
    user-select: none;
  }
</style>
