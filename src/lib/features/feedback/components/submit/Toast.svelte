<script lang="ts">
  const { type, title, message, icon } = $props<{
    type: "error" | "info";
    title: string;
    message: string;
    icon: string;
  }>();
</script>

<div class="toast {type}" role={type === "error" ? "alert" : "status"}>
  <div class="toast-icon">
    <i class="fas {icon}" aria-hidden="true"></i>
  </div>
  <div class="toast-content">
    <p class="toast-title">{title}</p>
    <p class="toast-message">{message}</p>
  </div>
</div>

<style>
  .toast {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px;
    border-radius: 10px;
    animation: toastIn var(--duration-emphasis) var(--ease-standard);
  }

  @keyframes toastIn {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .toast.error {
    background: linear-gradient(
      135deg,
      color-mix(
          in srgb,
          var(--semantic-error, var(--semantic-error)) 15%,
          transparent
        )
        0%,
      color-mix(
          in srgb,
          var(--semantic-error, var(--semantic-error)) 8%,
          transparent
        )
        100%
    );
    border: 1px solid
      color-mix(
        in srgb,
        var(--semantic-error, var(--semantic-error)) 25%,
        transparent
      );
  }

  .toast.info {
    background: linear-gradient(
      135deg,
      color-mix(
          in srgb,
          var(--theme-accent-strong, var(--theme-accent)) 15%,
          transparent
        )
        0%,
      color-mix(
          in srgb,
          var(--theme-accent-strong, var(--theme-accent)) 8%,
          transparent
        )
        100%
    );
    border: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent)) 25%,
        transparent
      );
  }

  .toast.info .toast-icon {
    background: var(--theme-accent-strong, var(--theme-accent));
    color: white;
  }

  .toast-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .toast.error .toast-icon {
    background: var(--semantic-error, var(--semantic-error));
    color: white;
  }

  .toast-content {
    flex: 1;
    min-width: 0;
  }

  .toast-title {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--theme-text);
  }

  .toast-message {
    margin: 4px 0 0 0;
    font-size: 0.875rem;
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .toast {
      animation-duration: 0s !important;
    }
  }
</style>
