<!--
  Copy As Image Button

  Captures an HTML element's FULL scrollable content as a PNG image
  and copies it to clipboard. Uses an off-screen clone technique
  so the capture is completely non-obtrusive (user sees nothing).
  Uses modern-screenshot for the actual rendering.
-->
<script lang="ts">
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import { domToBlob } from "modern-screenshot";

  interface Props {
    /** The HTML element to capture */
    targetElement: HTMLElement | null;
    /** Required for WCAG compliance */
    ariaLabel?: string;
    /** Size preset */
    size?: "sm" | "md" | "lg";
    /** Called immediately when clicked (for haptic feedback) */
    onActivate?: () => void;
    /** Called on successful copy */
    onSuccess?: () => void;
    /** Called on error */
    onError?: (error: Error) => void;
    /** Disabled state */
    disabled?: boolean;
    /** Additional CSS classes */
    class?: string;
  }

  let {
    targetElement,
    ariaLabel = "Copy conversation as image",
    size = "md",
    onActivate,
    onSuccess,
    onError,
    disabled = false,
    class: className = "",
  }: Props = $props();

  type CaptureState = "idle" | "capturing" | "success" | "error";
  let state = $state<CaptureState>("idle");
  let resetTimer: ReturnType<typeof setTimeout> | null = null;

  const isCapturing = $derived(state === "capturing");
  const isSuccess = $derived(state === "success");
  const isError = $derived(state === "error");

  const currentIcon = $derived(
    isCapturing
      ? "fa-spinner fa-spin"
      : isSuccess
        ? "fa-check"
        : isError
          ? "fa-exclamation-triangle"
          : "fa-camera"
  );

  const tooltipText = $derived(
    isCapturing
      ? "Capturing..."
      : isSuccess
        ? "Image copied!"
        : isError
          ? "Capture failed. Click to retry."
          : ariaLabel
  );

  const computedAriaLabel = $derived.by(() => {
    if (isSuccess) return `${ariaLabel} - copied`;
    if (isError) return `${ariaLabel} - failed, click to retry`;
    if (isCapturing) return `${ariaLabel} - capturing`;
    return ariaLabel;
  });

  /**
   * Capture the full scrollable content by cloning off-screen.
   * This approach is non-obtrusive - the user sees nothing.
   */
  async function captureFullScroll(element: HTMLElement): Promise<Blob> {
    // Create an off-screen clone
    const clone = element.cloneNode(true) as HTMLElement;

    // Style it to be invisible but fully expanded
    Object.assign(clone.style, {
      position: "fixed",
      left: "-99999px",
      top: "0",
      width: `${element.offsetWidth}px`,
      height: "auto",
      maxHeight: "none",
      overflow: "visible",
      // Ensure all content is visible
      visibility: "visible",
      opacity: "1",
    });

    // Add to DOM (required for rendering)
    document.body.appendChild(clone);

    // Wait for images to load in the clone
    const images = clone.querySelectorAll("img");
    await Promise.all(
      Array.from(images).map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) {
              resolve();
            } else {
              img.onload = () => resolve();
              img.onerror = () => resolve(); // Don't block on failed images
            }
          })
      )
    );

    // Small delay to ensure layout is complete
    await new Promise((resolve) => requestAnimationFrame(resolve));

    try {
      // Capture the fully expanded clone
      const blob = await domToBlob(clone, {
        backgroundColor: "#12121c",
        quality: 1.0,
      });
      return blob;
    } finally {
      // Always clean up the clone
      document.body.removeChild(clone);
    }
  }

  async function handleClick() {
    if (isCapturing || disabled || !targetElement) return;
    if (resetTimer) clearTimeout(resetTimer);

    onActivate?.();
    state = "capturing";

    try {
      // Capture the full scrollable content
      const blob = await captureFullScroll(targetElement);

      // Copy to clipboard using Clipboard API
      if (!navigator.clipboard?.write) {
        throw new Error("Clipboard API not supported");
      }

      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": blob,
        }),
      ]);

      // Create a temporary URL for the preview toast
      const previewUrl = URL.createObjectURL(blob);

      state = "success";
      toast.image("Image copied!", previewUrl, 4000);

      // Clean up the object URL after toast dismisses
      setTimeout(() => URL.revokeObjectURL(previewUrl), 5000);

      onSuccess?.();

      resetTimer = setTimeout(() => {
        state = "idle";
      }, 2000);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("[CopyAsImageButton] Capture failed:", error);
      state = "error";
      toast.error("Failed to capture image");
      onError?.(error);

      resetTimer = setTimeout(() => {
        state = "idle";
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
  class="capture-btn size-{size} {className}"
  class:success={isSuccess}
  class:error={isError}
  aria-label={computedAriaLabel}
  aria-busy={isCapturing}
  title={tooltipText}
  disabled={disabled || isCapturing || !targetElement}
  onclick={handleClick}
>
  <i class="fas {currentIcon}" aria-hidden="true"></i>
  <span class="sr-only" role="status" aria-live="polite">
    {isSuccess ? "Image copied to clipboard" : isError ? "Capture failed" : ""}
  </span>
</button>

<style>
  .capture-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 48px);
    height: var(--min-touch-target, 48px);
    padding: 0;
    border-radius: 50%;
    color: #ffffff;
    font-size: 16px;
    cursor: pointer;
    transition: all var(--duration-normal, 0.3s) ease;
    flex-shrink: 0;

    /* Amber/orange gradient for image/camera action */
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--semantic-warning, #f59e0b) 90%, transparent),
      color-mix(in srgb, var(--semantic-warning, #f59e0b) 70%, #000)
    );
    border: 1px solid color-mix(in srgb, var(--semantic-warning, #f59e0b) 30%, transparent);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--semantic-warning, #f59e0b) 25%, transparent);
  }

  .capture-btn:hover:not(:disabled) {
    background: linear-gradient(
      135deg,
      var(--semantic-warning, #f59e0b),
      color-mix(in srgb, var(--semantic-warning, #f59e0b) 80%, #000)
    );
    box-shadow: 0 4px 14px color-mix(in srgb, var(--semantic-warning, #f59e0b) 40%, transparent);
    transform: scale(1.05);
  }

  .capture-btn:active:not(:disabled) {
    transform: scale(0.95);
    transition: transform 0.1s ease;
  }

  .capture-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  /* Success state */
  .capture-btn.success {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--semantic-success, #22c55e) 90%, transparent),
      color-mix(in srgb, var(--semantic-success, #22c55e) 70%, #000)
    );
    border-color: color-mix(in srgb, var(--semantic-success, #22c55e) 30%, transparent);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--semantic-success, #22c55e) 25%, transparent);
    animation: success-pulse var(--duration-normal, 0.3s) ease-out;
  }

  @keyframes success-pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.1); }
    100% { transform: scale(1); }
  }

  /* Error state */
  .capture-btn.error {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--semantic-error, #ef4444) 90%, transparent),
      color-mix(in srgb, var(--semantic-error, #ef4444) 70%, #000)
    );
    border-color: color-mix(in srgb, var(--semantic-error, #ef4444) 30%, transparent);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--semantic-error, #ef4444) 25%, transparent);
  }

  .capture-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  /* Size variants */
  .size-sm {
    width: 36px;
    height: 36px;
    font-size: 14px;
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

  .size-lg {
    width: 56px;
    height: 56px;
    font-size: 18px;
  }

  /* Screen reader only */
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

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .capture-btn {
      transition: none;
    }

    .capture-btn.success {
      animation: none;
    }

    .capture-btn :global(.fa-spin) {
      animation: none;
    }
  }
</style>
