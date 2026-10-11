import { captureEvent } from "#lib/shared/analytics/services/posthog.js";
import type {
  KeyModifier,
  ShortcutContext,
} from "#lib/shared/keyboard/domain/types/keyboard-types.js";

export interface KeyboardShortcutExecutionProperties {
  shortcutId: string;
  context: ShortcutContext;
  scope: string;
  key: string;
  modifiers: KeyModifier[];
  isSingleKey: boolean;
}

function eventProperties(props: KeyboardShortcutExecutionProperties) {
  return {
    shortcut_id: props.shortcutId,
    context: props.context,
    scope: props.scope,
    key: props.key,
    modifiers: props.modifiers,
    is_single_key: props.isSingleKey,
  };
}

export function logKeyboardShortcutExecuted(
  props: KeyboardShortcutExecutionProperties
): void {
  captureEvent("keyboard_shortcut_executed", eventProperties(props));
}

export function logKeyboardShortcutFailed(
  props: KeyboardShortcutExecutionProperties,
  error: unknown
): void {
  captureEvent("keyboard_shortcut_failed", {
    ...eventProperties(props),
    error_name: error instanceof Error ? error.name : "UnknownError",
  });
}

export function logKeyboardShortcutHintsShown(
  context: ShortcutContext,
  surface: string
): void {
  captureEvent("keyboard_shortcut_hints_shown", { context, surface });
}

export function logKeyboardShortcutSettingsOpened(
  context: ShortcutContext,
  source: string
): void {
  captureEvent("keyboard_shortcut_settings_opened", { context, source });
}
