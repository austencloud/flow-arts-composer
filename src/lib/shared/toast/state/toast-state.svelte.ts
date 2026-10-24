/**
 * Toast State - Simple toast notification system
 *
 * Provides a lightweight way to show temporary messages to users.
 */

export type ToastType = "info" | "success" | "warning" | "error";
export type ToastAnnouncement = "assertive" | "polite";
export type ToastRemovalReason = "dismissed" | "action" | "programmatic";

export interface ToastAction {
  /** Button label, e.g. "Reload". */
  label: string;
  /** Runs when the action button is clicked. The toast is dismissed after. */
  onClick: () => void;
}

export interface Toast {
  id: string;
  message: string;
  /** Optional line of secondary text beneath the message. */
  detail?: string;
  type: ToastType;
  duration: number;
  timestamp: number;
  /** Optional image URL (data URL or http) for thumbnail preview */
  imageUrl?: string;
  /** Optional action button (e.g. a Reload prompt). */
  action?: ToastAction;
  /** Polite announcements are for low-priority, non-blocking information. */
  announcement?: ToastAnnouncement;
  /** Runs only when the person closes the toast or it expires. */
  onDismiss?: () => void;
}

// Reactive toast queue
export const toastQueue = $state<Toast[]>([]);

let toastIdCounter = 0;

// Auto-dismiss timers, keyed by toast id, so dismissal/clearing can cancel them
const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();

export interface ShowToastOptions {
  message: string;
  detail?: string;
  type?: ToastType;
  duration?: number;
  imageUrl?: string;
  action?: ToastAction;
  announcement?: ToastAnnouncement;
  onDismiss?: () => void;
}

/**
 * Show a toast notification
 */
export function showToast(
  messageOrOptions: string | ShowToastOptions,
  type: ToastType = "info",
  duration: number = 3000
): string {
  const id = `toast_${++toastIdCounter}_${Date.now()}`;

  // Handle both string and options object
  const options: ShowToastOptions =
    typeof messageOrOptions === "string"
      ? { message: messageOrOptions, type, duration }
      : messageOrOptions;

  const toast: Toast = {
    id,
    message: options.message,
    detail: options.detail,
    type: options.type ?? "info",
    duration: options.duration ?? 3000,
    timestamp: Date.now(),
    imageUrl: options.imageUrl,
    action: options.action,
    announcement: options.announcement,
    onDismiss: options.onDismiss,
  };

  toastQueue.push(toast);

  // Auto-remove after duration
  if (toast.duration > 0) {
    dismissTimers.set(
      id,
      setTimeout(() => {
        removeToast(id, "dismissed");
      }, toast.duration)
    );
  }

  return id;
}

/**
 * Remove a specific toast by ID
 */
export function removeToast(
  id: string,
  reason: ToastRemovalReason = "dismissed"
): void {
  const timer = dismissTimers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    dismissTimers.delete(id);
  }
  const index = toastQueue.findIndex((t) => t.id === id);
  if (index !== -1) {
    const [removed] = toastQueue.splice(index, 1);
    if (reason === "dismissed") {
      removed?.onDismiss?.();
    }
  }
}

/**
 * Clear all toasts
 */
export function clearToasts(): void {
  for (const timer of dismissTimers.values()) {
    clearTimeout(timer);
  }
  dismissTimers.clear();
  toastQueue.length = 0;
}

// Convenience methods
export const toast = {
  info: (message: string, duration?: number) =>
    showToast(message, "info", duration),
  success: (message: string, duration?: number) =>
    showToast(message, "success", duration),
  warning: (message: string, duration?: number) =>
    showToast(message, "warning", duration),
  error: (message: string, duration?: number) =>
    showToast(message, "error", duration),
  /** Show a success toast with an image thumbnail */
  image: (message: string, imageUrl: string, duration: number = 4000) =>
    showToast({ message, type: "success", imageUrl, duration }),
};
