<script lang="ts">
  import { copyTextToClipboard } from "$lib/shared/share/services/link-share";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";

  interface Props {
    /** Function that returns the text to copy (can be async) */
    getData: () => string | Promise<string>;
    /** Required for icon-only variant (WCAG compliance) */
    ariaLabel?: string;
    /** Visual variant */
    variant?: "icon-only" | "icon-text" | "text-only";
    /** Size preset */
    size?: "sm" | "md" | "lg";
    /** Full width button */
    fullWidth?: boolean;
    /** Icon shown in idle state */
    idleIcon?: string;
    /** Custom labels for each state */
    labels?: {
      idle?: string;
      loading?: string;
      success?: string;
      error?: string;
    };
    /** How long to show success state (ms) */
    successDuration?: number;
    /** Called immediately when clicked (before async work) - use for haptic feedback */
    onActivate?: () => void;
    /** Called on successful copy */
    onSuccess?: () => void;
    /** Called on error */
    onError?: (error: Error) => void;
    /** Show toast notifications instead of inline feedback */
    useToast?: boolean;
    /** Disabled state */
    disabled?: boolean;
    /** Additional CSS classes */
    class?: string;
  }

  let {
    getData,
    ariaLabel,
    variant = "icon-text",
    size = "md",
    fullWidth = false,
    idleIcon = "fa-terminal",
    labels = {},
    successDuration = 2000,
    onActivate,
    onSuccess,
    onError,
    useToast = false,
    disabled = false,
    class: className = "",
  }: Props = $props();

  type CopyState = "idle" | "loading" | "success" | "error";
  let copyState = $state<CopyState>("idle");
  let errorMessage = $state<string | null>(null);
  let resetTimer: ReturnType<typeof setTimeout> | null = null;

  const isLoading = $derived(copyState === "loading");
  const isSuccess = $derived(copyState === "success");
  const isError = $derived(copyState === "error");

  const defaultLabels = {
    idle: "Copy for AI",
    loading: "Preparing...",
    success: "Copied!",
    error: "Failed",
  } as const;

  const currentLabel = $derived(labels[copyState] ?? defaultLabels[copyState]);

  const currentIcon = $derived(
    isLoading
      ? "fa-spinner fa-spin"
      : isSuccess
        ? "fa-check"
        : isError
          ? "fa-exclamation-triangle"
          : idleIcon
  );

  const computedAriaLabel = $derived.by(() => {
    if (variant === "icon-only" && !ariaLabel) {
      console.warn(
        "[CopyForAIButton] ariaLabel is required for icon-only variant for accessibility"
      );
    }
    const base = ariaLabel ?? defaultLabels.idle;
    if (isSuccess) return `${base} - copied`;
    if (isError) return `${base} - failed, click to retry`;
    if (isLoading) return `${base} - loading`;
    return base;
  });

  // Tooltip text - shows error message on error state
  const tooltipText = $derived(
    isError && errorMessage
      ? `Error: ${errorMessage}. Click to retry.`
      : isSuccess
        ? "Copied!"
        : ariaLabel ?? defaultLabels.idle
  );

  // Screen reader announcement text
  const announcement = $derived(
    isSuccess ? "Copied to clipboard" : isError ? "Copy failed" : ""
  );

  async function handleClick() {
    if (isLoading || disabled) return;
    if (resetTimer) clearTimeout(resetTimer);

    // Fire activation callback immediately (for haptic feedback)
    onActivate?.();

    copyState = "loading";
    errorMessage = null;

    try {
      const text = await Promise.resolve(getData());
      await copyTextToClipboard(text);

      copyState = "success";
      onSuccess?.();
      if (useToast) toast.success(labels.success ?? defaultLabels.success);

      resetTimer = setTimeout(() => {
        copyState = "idle";
      }, successDuration);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      errorMessage = error.message || "Copy failed";
      copyState = "error";
      console.error("[CopyForAIButton]", error);
      onError?.(error);
      if (useToast) toast.error(labels.error ?? defaultLabels.error);

      resetTimer = setTimeout(() => {
        copyState = "idle";
        errorMessage = null;
      }, 3000);
    }
  }

  $effect(() => {
    return () => {
      if (resetTimer) clearTimeout(resetTimer);
    };
  });
</script>

<button
  type="button"
  class="copy-btn {variant} size-{size} {className}"
  class:full-width={fullWidth}
  class:success={isSuccess}
  class:error={isError}
  aria-label={computedAriaLabel}
  aria-busy={isLoading}
  title={tooltipText}
  disabled={disabled || isLoading}
  onclick={handleClick}
>
  {#if variant !== "text-only"}
    <i class="fas {currentIcon}" aria-hidden="true"></i>
  {/if}
  {#if variant !== "icon-only"}
    <span class="label">{currentLabel}</span>
  {/if}
  <!-- Screen reader live region for state announcements -->
  <span class="sr-only" role="status" aria-live="polite">
    {announcement}
  </span>
</button>

<style>
  .copy-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-sm, 14px);
    font-weight: 500;
    cursor: pointer;
    transition:
      background var(--duration-fast, 0.15s),
      border-color var(--duration-fast, 0.15s),
      color var(--duration-fast, 0.15s),
      transform var(--duration-micro, 0.1s);
  }

  /* Size variants */
  .size-sm {
    min-height: 36px;
    padding: 8px 12px;
    font-size: var(--font-size-compact, 12px);
    /* Expand hit area to 44px minimum without growing the visual */
    position: relative;
  }

  .size-sm::before {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    min-width: 44px;
    min-height: 44px;
    width: max(100%, 44px);
    height: max(100%, 44px);
  }

  .size-md {
    min-height: 44px;
    padding: 10px 16px;
  }

  .size-lg {
    min-height: var(--min-touch-target, 48px);
    padding: 12px 20px;
    font-size: var(--font-size-min, 14px);
  }

  /* Icon-only variant - always 48px for WCAG AAA touch targets */
  .icon-only {
    width: var(--min-touch-target, 48px);
    height: var(--min-touch-target, 48px);
    padding: 0;
    border-radius: 50%;
  }

  /* Full width */
  .full-width {
    width: 100%;
  }

  /* Success state with pulse animation */
  .success {
    background: color-mix(in srgb, var(--semantic-success, #22c55e) 15%, transparent);
    border-color: var(--semantic-success, #22c55e);
    color: var(--semantic-success, #22c55e);
    animation: success-pulse var(--duration-normal, 0.3s) ease-out;
  }

  @keyframes success-pulse {
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.05);
    }
    100% {
      transform: scale(1);
    }
  }

  /* Error state */
  .error {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 15%, transparent);
    border-color: var(--semantic-error, #ef4444);
    color: var(--semantic-error, #ef4444);
  }

  /* Hover states */
  @media (hover: hover) {
    .copy-btn:hover:not(:disabled):not(.success):not(.error) {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    }

    /* Subtle hover on error to indicate retry is possible */
    .copy-btn.error:hover:not(:disabled) {
      background: color-mix(in srgb, var(--semantic-error, #ef4444) 25%, transparent);
    }
  }

  /* Active state */
  .copy-btn:active:not(:disabled) {
    transform: scale(0.97);
  }

  /* Focus state - WCAG AAA compliant */
  .copy-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  /* Disabled state */
  .copy-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .copy-btn {
      transition: none;
    }

    .copy-btn.success {
      animation: none;
    }

    .copy-btn :global(.fa-spin) {
      animation: none;
    }
  }

  /* Screen reader only - visually hidden but accessible */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* Label styling */
  .label {
    white-space: nowrap;
  }

  /* Icon transition for smooth state changes */
  .copy-btn i {
    transition: transform var(--duration-fast, 0.15s) ease;
  }

  .success i {
    transform: scale(1.1);
  }
</style>
