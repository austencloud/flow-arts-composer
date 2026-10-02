import { t } from "$lib/shared/i18n/i18n.svelte";
import type { TranslationKey } from "$lib/shared/i18n/i18n-types";
import { AUTH_NUDGE_TEXTS, type AuthNudgeTrigger } from "./auth-nudge-trigger";

// Prompt content is shared as English domain data. Resolve its visible copy
// here so an open prompt responds to a locale change.
const keys: Partial<Record<string, TranslationKey>> = {
  "Keep saving sequences": "auth_prompt_keep_saving",
  "Save this sequence": "auth_prompt_save_sequence",
  "Eight is the guest limit.": "auth_prompt_eight_limit",
  "A free account gets you up to 64 steps.": "auth_prompt_64_steps",
  "Use pattern tools": "auth_prompt_use_patterns",
  "A free account adds Turn Pattern, Direction, Duration, Choose Start, and Rewind.":
    "auth_prompt_pattern_tools_body",
  "Extend this sequence": "auth_prompt_extend_sequence",
  "Apply a turn pattern": "auth_prompt_apply_turn_pattern",
  "Set rotation directions": "auth_prompt_rotation_directions",
  "Set step durations": "auth_prompt_step_durations",
  "Choose a new start": "auth_prompt_choose_start",
  "Rewind this sequence": "auth_prompt_rewind_sequence",
  "Generate this LOOP": "auth_prompt_generate_loop",
  "Use this setup": "auth_prompt_use_setup",
  "Open your library on any device": "auth_prompt_library_any_device",
  "A free account keeps saved sequences and collections across devices.":
    "auth_prompt_saved_across_devices",
  "Export this sequence": "auth_prompt_export_sequence",
  "Sign in or create an account to download animations and Choreo Cards.":
    "auth_prompt_export_body",
  "Start learning": "auth_prompt_start_learning",
  "Sign in or create an account to start learning TKA notation.":
    "auth_prompt_start_learning_body",
  "Open your library": "auth_prompt_open_library",
  "Sign in or create an account to open your saved sequences.":
    "auth_prompt_open_library_body",
  "Notification settings": "auth_prompt_save_settings",
  "Sign in or create an account to manage notifications.":
    "auth_prompt_save_settings_body",
  "Open 3D Studio": "auth_prompt_open_stage",
  "Sign in or create an account to build and choreograph sequences in 3D.":
    "auth_prompt_open_stage_body",
  "Open this part of the app": "auth_prompt_open_module",
  "Sign in or create an account to continue.": "auth_prompt_open_module_body",
  "Use Fuse": "auth_prompt_use_fuse",
  "A free account lets you combine two sequences into one.":
    "auth_prompt_use_fuse_body",
  "Use Tunnel": "auth_prompt_use_tunnel",
  "A free account lets you arrange sequences for several performers.":
    "auth_prompt_use_tunnel_body",
  "Use Assemble": "auth_prompt_use_assemble",
  "A free account lets you build a sequence by choosing grid points.":
    "auth_prompt_use_assemble_body",
  "Edit this sequence": "auth_prompt_edit_sequence",
  "Sign in or create an account to edit and remix this sequence.":
    "auth_prompt_edit_sequence_body",
  "Try every LOOP type": "auth_prompt_try_every_loop",
  "A free account lets you use every LOOP type.": "auth_prompt_every_loop_body",
  "A free account lets you use community setups and build sequences up to 64 steps.":
    "auth_prompt_community_setups_body",
  "Keep your setups": "auth_prompt_keep_setups",
  "Sign in or create an account to keep setups across sessions.":
    "auth_prompt_keep_setups_body",
  "Save this setup": "auth_prompt_save_setup",
  "Sign in or create an account to save it. Saved setups are shared with the community.":
    "auth_prompt_save_setup_body",
  "Share this sequence": "auth_prompt_share_sequence",
  "Sign in or create an account to send it, make a link, or download a Choreo Card.":
    "auth_prompt_share_sequence_body",
  "Share this collection": "auth_prompt_share_collection",
  "Sign in or create an account to send this collection.":
    "auth_prompt_share_collection_body",
  "Publish this sequence": "auth_prompt_publish_sequence",
  "Sign in or create an account to publish this sequence.":
    "auth_prompt_publish_sequence_body",
  "Download this sequence": "auth_prompt_download_sequence",
  "Sign in or create an account to download this sequence.":
    "auth_prompt_download_sequence_body",
  "Keep your scans": "auth_prompt_keep_scans",
  "A free account keeps your scans in your library.":
    "auth_prompt_keep_scans_body",
  "Open this sequence anywhere": "auth_prompt_open_sequence_anywhere",
  "A free account keeps it in your library and opens it on any device.":
    "auth_prompt_open_sequence_anywhere_body",
  "Add your city to the map": "auth_prompt_add_city",
  "Keep your prop collection": "auth_prompt_keep_props",
  "A free account keeps the props you earn in your collection.":
    "auth_prompt_earned_props",
  "Send this image": "auth_prompt_send_image",
  "Sign in to send this image. It is saved and will send when you return.":
    "auth_prompt_send_image_body",
  "Create your account": "auth_prompt_create_account",
  "Save your sequences and open them on any device.":
    "auth_prompt_save_any_device",
  "Welcome back": "auth_prompt_welcome_back",
  "Sign in to open your saved work.": "auth_prompt_open_saved_work",
  "Fine. Sixteen.": "auth_prompt_fine_sixteen",
  "This sequence only.": "auth_prompt_this_sequence_only",
  "Sixteen was the exception. A free account gets you up to 64 steps.":
    "auth_prompt_sixteen_exception_body",
  "Still eight.": "auth_prompt_still_eight",
  "Nice try.": "auth_prompt_nice_try",
  "That did not change the limit.": "auth_prompt_limit_unchanged",
  "You seem committed to this.": "auth_prompt_committed",
  "All right.": "auth_prompt_all_right",
  "That was the exception.": "auth_prompt_that_exception",
  "Seventeen is not sixteen.": "auth_prompt_seventeen",
};

// Every guest gate needs a real message. Constructing a key from the trigger
// hid missing translations until visitors saw the key itself on screen.
const nudgeKeys = {
  save: "auth_nudge_save",
  "save-limit": "auth_nudge_save_limit",
  "step-cap-guest": "auth_nudge_step_cap_guest",
  "patterns-guest": "auth_nudge_patterns_guest",
  "extend-sequence": "auth_nudge_extend_sequence",
  "turn-pattern": "auth_nudge_turn_pattern",
  "rotation-direction": "auth_nudge_rotation_direction",
  "duration-pattern": "auth_nudge_duration_pattern",
  "choose-start": "auth_nudge_choose_start",
  "rewind-sequence": "auth_nudge_rewind_sequence",
  "loop-step-cap-guest": "auth_nudge_loop_step_cap_guest",
  "setup-step-cap-guest": "auth_nudge_setup_step_cap_guest",
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
  "method:fuse": "auth_nudge_method_fuse",
  "method:tunnel": "auth_nudge_method_tunnel",
  "method:assemble": "auth_nudge_method_assemble",
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
