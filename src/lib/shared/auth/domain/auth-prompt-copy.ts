import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
import { AUTH_NUDGE_TEXTS, type AuthNudgeTrigger } from "./auth-nudge-trigger";

// Prompt content is shared as English domain data. Resolve its visible copy
// here so an open prompt responds to a locale change.
const keys: Partial<Record<string, TranslationKey>> = {
  "Keep saving sequences": "auth_prompt_keep_saving",
  "Save this sequence": "auth_prompt_save_sequence",
  "Use pattern tools": "auth_prompt_use_patterns",
  "Reshape whole sequences with Turn Pattern, Direction, Duration, Choose Start, and Rewind. Free, about ten seconds.":
    "auth_prompt_pattern_tools_body",
  "Extend this sequence": "auth_prompt_extend_sequence",
  "Apply a turn pattern": "auth_prompt_apply_turn_pattern",
  "Set rotation directions": "auth_prompt_rotation_directions",
  "Set step durations": "auth_prompt_step_durations",
  "Choose a new start": "auth_prompt_choose_start",
  "Rewind this sequence": "auth_prompt_rewind_sequence",
  "Use this setup": "auth_prompt_use_setup",
  "Open your library on any device": "auth_prompt_library_any_device",
  "Your saved sequences and collections, on every phone and laptop. Free, about ten seconds.":
    "auth_prompt_saved_across_devices",
  "Export this sequence": "auth_prompt_export_sequence",
  "Start learning": "auth_prompt_start_learning",
  "Start learning TKA notation with an account. Free, about ten seconds.":
    "auth_prompt_start_learning_body",
  "Open your library": "auth_prompt_open_library",
  "Your saved sequences live on this device. An account carries them everywhere. Free, about ten seconds.":
    "auth_prompt_open_library_body",
  "Notification settings": "auth_prompt_save_settings",
  "Choose which notifications reach you, with an account. Free, about ten seconds.":
    "auth_prompt_save_settings_body",
  "Open 3D Studio": "auth_prompt_open_stage",
  "Build and choreograph sequences in 3D Studio with an account. Free, about ten seconds.":
    "auth_prompt_open_stage_body",
  "Open this part of the app": "auth_prompt_open_module",
  "An account opens this part of the app and keeps your work on every device. Free, about ten seconds.":
    "auth_prompt_open_module_body",
  "Edit this sequence": "auth_prompt_edit_sequence",
  "Try every LOOP type": "auth_prompt_try_every_loop",
  "Use every LOOP type, not only rotated ones. Free, about ten seconds.":
    "auth_prompt_every_loop_body",
  "Start from setups the community shared. Free, about ten seconds.":
    "auth_prompt_community_setups_body",
  "Keep your setups": "auth_prompt_keep_setups",
  "Save this setup": "auth_prompt_save_setup",
  "Share this sequence": "auth_prompt_share_sequence",
  "Share this collection": "auth_prompt_share_collection",
  "Publish this sequence": "auth_prompt_publish_sequence",
  "Download this sequence": "auth_prompt_download_sequence",
  "Keep your scans": "auth_prompt_keep_scans",
  "Keep your scans in your library on every device. Free, about ten seconds.":
    "auth_prompt_keep_scans_body",
  "Open this sequence anywhere": "auth_prompt_open_sequence_anywhere",
  "Keep this sequence in your library and open it on any device. Free, about ten seconds.":
    "auth_prompt_open_sequence_anywhere_body",
  "Add your city to the map": "auth_prompt_add_city",
  "Keep your prop collection": "auth_prompt_keep_props",
  "Keep the props you earn, on every device. Free, about ten seconds.":
    "auth_prompt_earned_props",
  "Send this image": "auth_prompt_send_image",
  "Create your account": "auth_prompt_create_account",
  "Save your sequences and open them on any device.":
    "auth_prompt_save_any_device",
  "Welcome back": "auth_prompt_welcome_back",
  "Sign in to open your saved work.": "auth_prompt_open_saved_work",
};

// Every guest gate needs a real message. Constructing a key from the trigger
// hid missing translations until visitors saw the key itself on screen.
const nudgeKeys = {
  save: "auth_nudge_save",
  "save-limit": "auth_nudge_save_limit",
  "patterns-guest": "auth_nudge_patterns_guest",
  "extend-sequence": "auth_nudge_extend_sequence",
  "turn-pattern": "auth_nudge_turn_pattern",
  "rotation-direction": "auth_nudge_rotation_direction",
  "duration-pattern": "auth_nudge_duration_pattern",
  "choose-start": "auth_nudge_choose_start",
  "rewind-sequence": "auth_nudge_rewind_sequence",
  "sync-library": "auth_nudge_sync_library",
  "community-map": "auth_nudge_community_map",
  export: "auth_nudge_export",
  "module:learn": "auth_nudge_module_learn",
  "module:library": "auth_nudge_module_library",
  "module:settings": "auth_nudge_module_settings",
  "module:stage": "auth_nudge_module_stage",
  "module:other": "auth_nudge_module_other",
  "edit-community": "auth_nudge_edit_community",
  "loop-locked-guest": "auth_nudge_loop_locked_guest",
  "community-setups": "auth_nudge_community_setups",
  "saved-setups": "auth_nudge_saved_setups",
  "save-setup": "auth_nudge_save_setup",
  "share-sequence": "auth_nudge_share_sequence",
  "share-collection": "auth_nudge_share_collection",
  "viewer-signin-publish": "auth_nudge_viewer_signin_publish",
  "viewer-signin-download": "auth_nudge_viewer_signin_download",
  "viewer-signin-account": "auth_nudge_viewer_signin_account",
  "guest-first-save": "auth_nudge_guest_first_save",
  "prop-collection": "auth_nudge_prop_collection",
  "share-image-signin": "auth_nudge_share_image_signin",
} satisfies Record<AuthNudgeTrigger, TranslationKey>;

export function authPromptCopy(source: string): string {
  const key = keys[source];
  if (key) return t(key);
  const nudge = Object.entries(AUTH_NUDGE_TEXTS).find(
    ([, text]) => text === source
  );
  return nudge ? authNudgeCopy(nudge[0] as AuthNudgeTrigger) : source;
}

export function authNudgeCopy(trigger: AuthNudgeTrigger): string {
  return t(nudgeKeys[trigger]);
}
