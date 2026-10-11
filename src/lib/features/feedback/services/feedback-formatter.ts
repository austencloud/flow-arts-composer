/**
 * FeedbackFormatter
 *
 * Formatting utilities for feedback display data.
 * Handles date/time formatting, module/tab label resolution.
 */

import { MODULE_DEFINITIONS } from "#lib/shared/navigation/state/navigation-state.svelte.js";

/**
 * Format date as "Jan 15, 2024 at 3:45 PM"
 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/**
 * Format relative time ("Just now", "5 minutes ago", "Yesterday", etc.)
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours === 0) {
      const minutes = Math.floor(diff / (1000 * 60));
      return minutes <= 1 ? "Just now" : `${minutes} minutes ago`;
    }
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return formatDate(date);
}

/**
 * Get module label from module ID
 */
export function getModuleLabel(moduleId: string): string {
  const module = MODULE_DEFINITIONS.find((m) => m.id === moduleId);
  return module?.label || moduleId;
}

/**
 * Get tab label from module ID and tab ID
 */
export function getTabLabel(moduleId: string, tabId: string): string {
  const module = MODULE_DEFINITIONS.find((m) => m.id === moduleId);
  const tab = module?.sections.find((s) => s.id === tabId);
  return tab?.label || tabId;
}
