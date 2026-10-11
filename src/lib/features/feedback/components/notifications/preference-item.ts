import type { NotificationPreferences } from "#lib/shared/feedback/domain/models/notification-models.js";

export type PreferenceItem = {
  key: keyof NotificationPreferences;
  label: string;
  description: string;
};
