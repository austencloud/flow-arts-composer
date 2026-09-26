import { getLocale, t } from "$lib/shared/i18n/i18n.svelte";
import { formatRelativeTime as formatLocalizedRelativeTime } from "$lib/shared/i18n/i18n-formatters";

/**
 * Inbox Formatting Utilities
 *
 * Shared formatting functions for the inbox system.
 */

/**
 * Format a date as relative time (e.g., "2m", "3h", "5d")
 * Compact format for space-constrained UI
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return t("inbox_time_now");
  if (minutes < 60) return t("inbox_time_minutes", { count: minutes });
  if (hours < 24) return t("inbox_time_hours", { count: hours });
  if (days < 7) return t("inbox_time_days", { count: days });
  return date.toLocaleDateString(getLocale(), { month: "short", day: "numeric" });
}

/**
 * Format a date as relative time with "ago" suffix
 * More readable format for notifications
 */
export function formatRelativeTimeVerbose(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return t("inbox_time_just_now");
  if (minutes < 60) return formatLocalizedRelativeTime(-minutes, "minute");
  if (hours < 24) return formatLocalizedRelativeTime(-hours, "hour");
  if (days < 7) return formatLocalizedRelativeTime(-days, "day");
  return date.toLocaleDateString(getLocale(), { month: "short", day: "numeric" });
}

/**
 * Format a date as time only (e.g., "2:30 PM")
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString(getLocale(), { hour: "numeric", minute: "2-digit" });
}

/**
 * Get initials from a display name (e.g., "John Doe" -> "JD")
 * Returns up to 2 characters
 */
export function getInitials(name: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .filter((n) => n.length > 0)
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}

/**
 * Generate a deterministic color from a user ID
 * Used for avatar background when no photo is available
 */
export function getAvatarColor(userId: string): string {
  const colors = [
    "#3b82f6", // blue
    "#8b5cf6", // purple
    "#ec4899", // pink
    "#ef4444", // red
    "#f97316", // orange
    "#eab308", // yellow
    "#22c55e", // green
    "#14b8a6", // teal
    "#06b6d4", // cyan
  ];

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  const index = Math.abs(hash) % colors.length;
  // Type assertion - array is non-empty and index is always valid
  return colors[index] as string;
}
