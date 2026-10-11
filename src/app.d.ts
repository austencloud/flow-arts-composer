// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces

/// <reference types="@sveltejs/kit" />
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../.svelte-kit/ambient.d.ts" />

declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    interface PageState {
      moduleId?: string;
      sectionId?: string;
      sequenceOverlay?: boolean;
      /** Marks history entries created for a dismissible URL overlay. */
      urlOverlay?: "sheet" | "spotlight";
      // SheetRouter route state
      sheet?: string | null;
      spotlight?: string;
      animationPanel?: {
        sequenceId?: string;
        speed?: number;
        isPlaying?: boolean;
        currentStep?: number;
        gridVisible?: boolean;
      };
      // Loop labeler navigation
      sequenceId?: string | null;
      filterMode?: string;
      // WordInputOverlay back-button support
      wordInputOverlay?: boolean;
      // Catalog navigation (ChoreoCardTab)
      catalogNavId?: string | null;
      catalogNavTnDFamily?: string | null;
    }
  }

  // The Worker's bindings and variables, read through `workerEnv()` in
  // src/lib/server/cloudflare/worker-env.ts. Named `Cloudflare.Env`, the
  // interface `cloudflare:workers` and `wrangler types` use.
  namespace Cloudflare {
    interface Env {
      FIREBASE_SERVICE_ACCOUNT_JSON?: string;
      /** "1" or "true" turns phone sign-in off without a deploy. */
      PHONE_SIGN_IN_DISABLED?: string;
      QR_VIDEOS: R2Bucket;
      TKA_ASSETS: R2Bucket;
      R2_PUBLIC_URL: string;
      // Native Cloudflare ratelimit bindings (see wrangler.toml [[ratelimits]]).
      // Optional: absent under `vite dev`, where withRateLimit falls back to
      // the in-memory window. Shape matches CfRateLimiter in rate-limiter.ts.
      RL_GENERAL?: {
        limit(o: { key: string }): Promise<{ success: boolean }>;
      };
      RL_AI_CHAT?: {
        limit(o: { key: string }): Promise<{ success: boolean }>;
      };
      RL_AI_RENDER?: {
        limit(o: { key: string }): Promise<{ success: boolean }>;
      };
      RL_ADMIN?: { limit(o: { key: string }): Promise<{ success: boolean }> };
      RL_CARD_ISSUE?: {
        limit(o: { key: string }): Promise<{ success: boolean }>;
      };
      RL_CARD_SCAN?: {
        limit(o: { key: string }): Promise<{ success: boolean }>;
      };
    }
  }

  /** App version injected from package.json at build time */
  const __APP_VERSION__: string;

  /** Compile-time feature flags injected by getEnabledFeaturesDefineMap() */
  const __FEATURE_SOCIAL__: boolean;
  const __FEATURE_LEARN__: boolean;
  const __FEATURE_PREMIUM__: boolean;
  const __FEATURE_COMPOSE__: boolean;
  const __FEATURE_TRAIN__: boolean;
  const __FEATURE_CHOREO_CARD__: boolean;
  const __FEATURE_WRITE__: boolean;
  const __FEATURE_ADMIN__: boolean;
  const __FEATURE_ARENA__: boolean;
  const __FEATURE_RETRO__: boolean;
  const __FEATURE_COVEN__: boolean;
  const __FEATURE_MUSEUM__: boolean;
  const __FEATURE_ARCHIVE__: boolean;
  const __FEATURE_MODERATION__: boolean;
  const __FEATURE_FESTIVALS__: boolean;
  const __FEATURE_LEVELS__: boolean;
  const __FEATURE_HAND_PATHS__: boolean;
  const __FEATURE_VIDEO__: boolean;
  const __FEATURE_LAB__: boolean;
  const __FEATURE_STAGE__: boolean;
  const __FEATURE_MANDALA__: boolean;
  const __FEATURE_TIKA__: boolean;
  const __FEATURE_SETTINGS__: boolean;
  const __FEATURE_CONNECT__: boolean;
  const __FEATURE_FUSE__: boolean;
  const __FEATURE_ASSEMBLE_LAB__: boolean;
  const __FEATURE_LOOP_LABELER__: boolean;
  const __FEATURE_PROMO_GENERATOR__: boolean;
  const __FEATURE_GALLERY_GENERATOR__: boolean;
  const __FEATURE_HALL_OF_SHAME__: boolean;
  const __FEATURE_LANDING__: boolean;

  /** Google Identity Services types */
  interface GoogleOneTapConfig {
    client_id: string;
    callback?: (response: { credential: string }) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    context?: "signin" | "signup" | "use";
    itp_support?: boolean;
    use_fedcm_for_prompt?: boolean;
    prompt_parent_id?: string;
  }

  interface GooglePromptNotification {
    isDisplayed: () => boolean;
    isNotDisplayed: () => boolean;
    isSkippedMoment: () => boolean;
    isDismissedMoment: () => boolean;
    getMomentType: () => string;
    getDismissedReason: () => string;
    getNotDisplayedReason: () => string;
    getSkippedReason: () => string;
  }

  interface GoogleButtonConfig {
    type: "standard" | "icon";
    theme?: "outline" | "filled_blue" | "filled_black";
    size?: "large" | "medium" | "small";
    text?: "signin_with" | "signup_with" | "continue_with" | "signin";
    shape?: "rectangular" | "pill" | "circle" | "square";
    logo_alignment?: "left" | "center";
    width?: number;
    locale?: string;
  }

  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GoogleOneTapConfig) => void;
          prompt: (
            callback?: (notification: GooglePromptNotification) => void
          ) => void;
          renderButton: (
            element: HTMLElement,
            config: GoogleButtonConfig
          ) => void;
          cancel: () => void;
          disableAutoSelect: () => void;
        };
      };
    };
    tikaPictographCache?: { clear: () => Promise<void> };
    clearTikaCache?: () => Promise<string>;
  }
}

export {};
