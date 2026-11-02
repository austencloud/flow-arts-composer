import { GUEST_SAVE_CAP } from "./guest-access-config";

export type AuthNudgeTrigger =
  | "save"
  | "save-limit"
  | "patterns-guest"
  | "extend-sequence"
  | "turn-pattern"
  | "rotation-direction"
  | "duration-pattern"
  | "choose-start"
  | "rewind-sequence"
  | "sync-library"
  | "community-map"
  | "export"
  | "module:learn"
  | "module:library"
  | "module:settings"
  | "module:stage"
  | "module:other"
  | "edit-community"
  | "loop-locked-guest"
  | "community-setups"
  | "saved-setups"
  | "save-setup"
  | "share-sequence"
  | "share-collection"
  | "viewer-signin-publish"
  | "viewer-signin-download"
  | "viewer-signin-account"
  | "guest-first-save"
  | "prop-collection"
  | "share-image-signin";

export type AuthMode = "signin" | "signup";

export interface AuthPromptContent {
  key: string;
  title: string;
  body: string;
}

// Each line leads with what the person gets, then "Free, about ten
// seconds." (Austen, 2026-10-31: an account is asked for only for what it
// gives, never as a toll). The button that pairs with this copy reads "Create
// account". The same line is the toast a gate shows while a guest's "not now"
// cooldown runs (auth-drawer-state). No "Sign up free" / "Create Account -
// free" variants; those drifted into four incompatible phrasings (2026-06-18
// finding, closed 2026-07-18).
export const AUTH_NUDGE_TEXTS: Record<AuthNudgeTrigger, string> = {
  "save-limit": `Guests keep ${GUEST_SAVE_CAP} sequences on this device. An account keeps every sequence on every device. Free, about ten seconds.`,
  save: "Keep this sequence in your library on every phone and laptop. Free, about ten seconds.",
  "patterns-guest":
    "Reshape a whole sequence with Turn Pattern, Direction, and Duration. Free, about ten seconds.",
  "extend-sequence":
    "Extend this sequence with a LOOP once you have an account. Free, about ten seconds.",
  "turn-pattern":
    "Apply turn patterns across this whole sequence with an account. Free, about ten seconds.",
  "rotation-direction":
    "Set a rotation direction pattern for this sequence with an account. Free, about ten seconds.",
  "duration-pattern":
    "Set a duration pattern for this sequence with an account. Free, about ten seconds.",
  "choose-start":
    "Pick a new start pose for this sequence with an account. Free, about ten seconds.",
  "rewind-sequence":
    "Rewind this sequence from its ending pose with an account. Free, about ten seconds.",
  "sync-library":
    "Keep your saved sequences and collections on every phone and laptop. Free, about ten seconds.",
  "community-map":
    "Add your city to the community map with an account. Free, about ten seconds.",
  export:
    "Download your sequences as animations and Choreo Cards with an account. Free, about ten seconds.",
  "module:learn":
    "Start learning TKA notation with an account. Free, about ten seconds.",
  "module:library":
    "Your saved sequences live on this device. An account carries them everywhere. Free, about ten seconds.",
  "module:settings":
    "Choose which notifications reach you, with an account. Free, about ten seconds.",
  "module:stage":
    "Choreograph sequences in 3D Studio with an account. Free, about ten seconds.",
  "module:other":
    "An account opens this part of the app and keeps your work on every device. Free, about ten seconds.",
  "edit-community":
    "Edit and remix community sequences with an account. Free, about ten seconds.",
  // Lead with what the account gives, never with a definition. A guest hits
  // this after tapping Mirrored/Inverted/etc., so opening with "Rotated LOOPs
  // are sequences that..." reads as a non sequitur (Austen, 2026-08-10). What
  // rotated means is the guide's job; this nudge only names what an account
  // adds and what keeps working without one.
  "loop-locked-guest":
    "Use every LOOP type with an account. Free, about ten seconds. Rotated LOOPs work without one.",
  "community-setups":
    "Start from setups the community shared, with an account. Free, about ten seconds.",
  "saved-setups":
    "Keep your setups between visits with an account. Free, about ten seconds.",
  // Every saved setup is public and shows the creator's name and avatar, so
  // saving needs a full account. Firestore rules block the write as a second
  // gate.
  "save-setup":
    "Save setups with an account. Saved setups are shared with the community. Free, about ten seconds.",
  "share-sequence":
    "Send sequences, make links, and share Choreo Cards with an account. Free, about ten seconds.",
  // Guests can build collections, but sending one through the inbox names the
  // sender, so it needs a full account just like saving a setup does.
  "share-collection":
    "Share your collections with an account. Free, about ten seconds.",
  // Sequence viewer / /q scan funnel - the three reasons that actually reach
  // the shared AuthModal (publish/download require a full account per
  // gated-action-policy.ts; account is the /q header chip's plain sign-in).
  // save/favorite/remix/sendTo provision a guest silently and never prompt, so
  // they need no key here. The viewer maps reason -> trigger in
  // auth-action-queue.svelte.ts (`signInTriggerFor`); it holds no auth copy of
  // its own, so this stays the single source of truth for the ask.
  "viewer-signin-publish":
    "Publish this sequence with an account. Free, about ten seconds.",
  "viewer-signin-download":
    "Download this sequence with an account. Free, about ten seconds.",
  "viewer-signin-account":
    "Keep your scans in a library on every device. Free, about ten seconds.",
  // SP3 first-session activation (Part B): fires once, after a guest's first
  // save persists - see docs/superpowers/specs/active/2026-07-22-first-session-activation-design.md.
  "guest-first-save":
    "Keep your sequences on every phone and laptop. Free, about ten seconds.",
  "prop-collection":
    "Keep the props you earned on every device. Free, about ten seconds.",
  // Share intake, trace 3: the user shared an image while signed out.
  // services/implementations/MessageImageSender.ts:32-34 rejects anonymous/guest
  // uploads outright, so this is a hard requirement, not a nudge. Phrased as
  // the ask rather than the refusal - the bytes are already safe in IndexedDB
  // and the send resumes by itself once they are in.
  "share-image-signin":
    "Send the image you shared once you have an account. It stays saved until then. Free, about ten seconds.",
};

// The nudge card and the auth modal meet the user at different moments. The
// nudge explains the gate; after they choose an account action, the modal names
// the exact thing they were trying to do and gets out of the way.
const AUTH_PROMPT_CONTENTS: Record<AuthNudgeTrigger, AuthPromptContent> = {
  "save-limit": {
    key: "save-limit",
    title: "Keep saving sequences",
    body: AUTH_NUDGE_TEXTS["save-limit"],
  },
  save: {
    key: "save",
    title: "Save this sequence",
    body: AUTH_NUDGE_TEXTS["save"],
  },
  "patterns-guest": {
    key: "patterns-guest",
    title: "Use pattern tools",
    body: "Reshape whole sequences with Turn Pattern, Direction, Duration, Choose Start, and Rewind. Free, about ten seconds.",
  },
  "extend-sequence": {
    key: "extend-sequence",
    title: "Extend this sequence",
    body: AUTH_NUDGE_TEXTS["extend-sequence"],
  },
  "turn-pattern": {
    key: "turn-pattern",
    title: "Apply a turn pattern",
    body: AUTH_NUDGE_TEXTS["turn-pattern"],
  },
  "rotation-direction": {
    key: "rotation-direction",
    title: "Set rotation directions",
    body: AUTH_NUDGE_TEXTS["rotation-direction"],
  },
  "duration-pattern": {
    key: "duration-pattern",
    title: "Set step durations",
    body: AUTH_NUDGE_TEXTS["duration-pattern"],
  },
  "choose-start": {
    key: "choose-start",
    title: "Choose a new start",
    body: AUTH_NUDGE_TEXTS["choose-start"],
  },
  "rewind-sequence": {
    key: "rewind-sequence",
    title: "Rewind this sequence",
    body: AUTH_NUDGE_TEXTS["rewind-sequence"],
  },
  "sync-library": {
    key: "sync-library",
    title: "Open your library on any device",
    body: "Your saved sequences and collections, on every phone and laptop. Free, about ten seconds.",
  },
  "community-map": {
    key: "community-map",
    title: "Add your city to the map",
    body: AUTH_NUDGE_TEXTS["community-map"],
  },
  export: {
    key: "export",
    title: "Export this sequence",
    body: AUTH_NUDGE_TEXTS["export"],
  },
  "module:learn": {
    key: "module:learn",
    title: "Start learning",
    body: "Start learning TKA notation with an account. Free, about ten seconds.",
  },
  "module:library": {
    key: "module:library",
    title: "Open your library",
    body: "Your saved sequences live on this device. An account carries them everywhere. Free, about ten seconds.",
  },
  "module:settings": {
    key: "module:settings",
    title: "Notification settings",
    body: "Choose which notifications reach you, with an account. Free, about ten seconds.",
  },
  "module:stage": {
    key: "module:stage",
    title: "Open 3D Studio",
    body: "Build and choreograph sequences in 3D Studio with an account. Free, about ten seconds.",
  },
  "module:other": {
    key: "module:other",
    title: "Open this part of the app",
    body: "An account opens this part of the app and keeps your work on every device. Free, about ten seconds.",
  },
  "edit-community": {
    key: "edit-community",
    title: "Edit this sequence",
    body: AUTH_NUDGE_TEXTS["edit-community"],
  },
  "loop-locked-guest": {
    key: "loop-locked-guest",
    title: "Try every LOOP type",
    body: "Use every LOOP type, not only rotated ones. Free, about ten seconds.",
  },
  "community-setups": {
    key: "community-setups",
    title: "Use this setup",
    body: "Start from setups the community shared. Free, about ten seconds.",
  },
  "saved-setups": {
    key: "saved-setups",
    title: "Keep your setups",
    body: AUTH_NUDGE_TEXTS["saved-setups"],
  },
  "save-setup": {
    key: "save-setup",
    title: "Save this setup",
    body: AUTH_NUDGE_TEXTS["save-setup"],
  },
  "share-sequence": {
    key: "share-sequence",
    title: "Share this sequence",
    body: AUTH_NUDGE_TEXTS["share-sequence"],
  },
  "share-collection": {
    key: "share-collection",
    title: "Share this collection",
    body: AUTH_NUDGE_TEXTS["share-collection"],
  },
  "viewer-signin-publish": {
    key: "viewer-signin-publish",
    title: "Publish this sequence",
    body: AUTH_NUDGE_TEXTS["viewer-signin-publish"],
  },
  "viewer-signin-download": {
    key: "viewer-signin-download",
    title: "Download this sequence",
    body: AUTH_NUDGE_TEXTS["viewer-signin-download"],
  },
  "viewer-signin-account": {
    key: "viewer-signin-account",
    title: "Keep your scans",
    body: "Keep your scans in your library on every device. Free, about ten seconds.",
  },
  "guest-first-save": {
    key: "guest-first-save",
    title: "Open this sequence anywhere",
    body: "Keep this sequence in your library and open it on any device. Free, about ten seconds.",
  },
  "prop-collection": {
    key: "prop-collection",
    title: "Keep your prop collection",
    body: "Keep the props you earn, on every device. Free, about ten seconds.",
  },
  "share-image-signin": {
    key: "share-image-signin",
    title: "Send this image",
    body: AUTH_NUDGE_TEXTS["share-image-signin"],
  },
};

// The prompt a guest sees on a module outside their allowlist. The Library
// module was folded into Browse, so a module without its own entry gets the
// neutral ask, never the Library's "your saved sequences live here".
const MODULE_NUDGE_TRIGGERS: Partial<Record<string, AuthNudgeTrigger>> = {
  learn: "module:learn",
  settings: "module:settings",
  stage: "module:stage",
};

export function moduleNudgeTrigger(moduleId: string): AuthNudgeTrigger {
  return MODULE_NUDGE_TRIGGERS[moduleId] ?? "module:other";
}

// One key for both modes: the key marks a new encounter, and switching between
// signing in and creating an account is the same encounter. A per-mode key
// reset the open email form every time someone pressed the switch.
const GENERIC_AUTH_PROMPTS: Record<AuthMode, AuthPromptContent> = {
  signup: {
    key: "generic",
    title: "Create your account",
    body: "Save your sequences and open them on any device.",
  },
  signin: {
    key: "generic",
    title: "Welcome back",
    body: "Sign in to open your saved work.",
  },
};

export function getAuthPromptContent(
  trigger: AuthNudgeTrigger | null | undefined,
  mode: AuthMode
): AuthPromptContent {
  return trigger ? AUTH_PROMPT_CONTENTS[trigger] : GENERIC_AUTH_PROMPTS[mode];
}
