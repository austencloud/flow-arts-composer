/**
 * PWA Install Instructions Configuration
 *
 * Centralized configuration for platform-specific PWA installation instructions.
 * This eliminates duplication and makes it easy to update instructions across the app.
 */

export interface InstructionStep {
  text: string;
  icon: string;
  image: string | null;
  /** Accessible alt text for `image`. Falls back to a generic "Step N" label. */
  alt?: string;
}

export interface InstallInstructions {
  title: string;
  icon: string;
  steps: InstructionStep[];
  benefits: string[];
}

export type Platform = "ios" | "android" | "desktop";
export type Browser =
  | "chrome"
  | "safari"
  | "edge"
  | "firefox"
  | "samsung"
  | "other";

/**
 * Get installation instructions for a specific platform and browser combination
 */
export function getInstallInstructions(
  platform: Platform,
  browser: Browser
): InstallInstructions {
  const key = `${platform}-${browser}`;

  const directMatch = INSTRUCTIONS_MAP[key];
  if (directMatch) {
    return directMatch;
  }

  // Fallback for specific platform patterns
  if (platform === "ios" && browser !== "safari") {
    return INSTRUCTIONS_MAP["ios-other"]!;
  }

  if (platform === "android" && (browser === "chrome" || browser === "edge")) {
    return INSTRUCTIONS_MAP["android-chrome"]!;
  }

  if (platform === "android" && browser === "samsung") {
    return INSTRUCTIONS_MAP["android-samsung"]!;
  }

  if (platform === "desktop" && (browser === "chrome" || browser === "edge")) {
    return INSTRUCTIONS_MAP["desktop-chrome"]!;
  }

  // Fallback for unsupported combinations
  return FALLBACK_INSTRUCTIONS[platform] ?? FALLBACK_INSTRUCTIONS["default"]!;
}

/**
 * Instructions map for specific platform-browser combinations
 */
const INSTRUCTIONS_MAP: Record<string, InstallInstructions> = {
  "ios-safari": {
    title: "Install Flow Arts Composer on iPhone/iPad",
    icon: "fab fa-apple",
    steps: [
      {
        text: "Tap the <strong>Share</strong> button. On iOS 26 and later, tap <strong>⋯</strong> next to the address bar first, then <strong>Share</strong>.",
        icon: "fas fa-share",
        image: null,
        alt: "The Share button in Safari",
      },
      {
        text: "Scroll down and tap <strong>Add to Home Screen</strong>. If it's missing, scroll to the bottom, tap <strong>Edit Actions</strong>, and add it.",
        icon: "fas fa-plus-square",
        image: null,
        alt: "The Add to Home Screen action in the Safari share sheet",
      },
      {
        text: "Make sure <strong>Open as Web App</strong> is on.",
        icon: "fas fa-toggle-on",
        image: null,
        alt: "The Open as Web App switch turned on",
      },
      {
        text: "Tap <strong>Add</strong>. FA Composer shows up on your home screen.",
        icon: "fas fa-check-circle",
        image: null,
        alt: "The Add confirmation button",
      },
    ],
    benefits: [
      "Distraction-free, fullscreen-like experience",
      "Faster loading with offline support",
      "Quick access from home screen",
    ],
  },

  "ios-other": {
    title: "Install Flow Arts Composer on iPhone/iPad",
    icon: "fab fa-apple",
    steps: [
      {
        text: "Open this page in <strong>Safari</strong>",
        icon: "fab fa-safari",
        image: null,
        alt: "Open this page in Safari",
      },
      {
        text: "Tap the <strong>Share</strong> button. On iOS 26 and later, tap <strong>⋯</strong> next to the address bar first, then <strong>Share</strong>.",
        icon: "fas fa-share",
        image: null,
        alt: "The Share button in Safari",
      },
      {
        text: "Scroll down and tap <strong>Add to Home Screen</strong>. If it's missing, scroll to the bottom, tap <strong>Edit Actions</strong>, and add it.",
        icon: "fas fa-plus-square",
        image: null,
        alt: "The Add to Home Screen action in the Safari share sheet",
      },
      {
        text: "Make sure <strong>Open as Web App</strong> is on.",
        icon: "fas fa-toggle-on",
        image: null,
        alt: "The Open as Web App switch turned on",
      },
      {
        text: "Tap <strong>Add</strong>. FA Composer shows up on your home screen.",
        icon: "fas fa-check-circle",
        image: null,
        alt: "The Add confirmation button",
      },
    ],
    benefits: [
      "Distraction-free, fullscreen-like experience",
      "Works offline",
      "Quick access from home screen",
    ],
  },

  "android-chrome": {
    title: "Install Flow Arts Composer on Android",
    icon: "fab fa-android",
    steps: [
      {
        text: "Tap the <strong>⋮</strong> menu next to the address bar.",
        icon: "fas fa-ellipsis-v",
        image: "/images/install-guides/android-chrome-step1.webp",
        alt: "The Chrome menu open near the address bar",
      },
      {
        text: "Tap <strong>Install and create shortcut</strong>.",
        icon: "fas fa-download",
        image: "/images/install-guides/android-chrome-step2.webp",
        alt: "The Install and create shortcut menu item",
      },
      {
        text: "Pick <strong>Install</strong>, not Create shortcut. A shortcut only opens a Chrome tab.",
        icon: "fas fa-check-circle",
        image: "/images/install-guides/android-chrome-step3.webp",
        alt: "The Install and Create shortcut sheet, with Install as the first option",
      },
      {
        text: "Tap <strong>Install</strong> to confirm. Chrome finishes in the background.",
        icon: "fas fa-check-circle",
        image: "/images/install-guides/android-chrome-step4.webp",
        alt: "The Install app confirmation dialog",
      },
      {
        text: "Open <strong>FA Composer</strong> from your home screen.",
        icon: "fas fa-rocket",
        image: null,
      },
    ],
    benefits: [
      "Distraction-free, fullscreen-like experience",
      "Automatic offline support",
    ],
  },

  "android-samsung": {
    title: "Install Flow Arts Composer on Android (Samsung Internet)",
    icon: "fab fa-android",
    steps: [
      {
        text: "Tap the <strong>menu (☰)</strong> at the bottom",
        icon: "fas fa-bars",
        image: null, // TODO: Add screenshot to /static/images/install-guides/android-samsung-step1.png
      },
      {
        text: 'Select <strong>"Add page to"</strong> → <strong>"Home screen"</strong>',
        icon: "fas fa-plus-circle",
        image: null, // TODO: Add screenshot to /static/images/install-guides/android-samsung-step2.png
      },
      {
        text: 'Tap <strong>"Add"</strong> to confirm',
        icon: "fas fa-check",
        image: null,
      },
      {
        text: "Launch Flow Arts Composer from your home screen",
        icon: "fas fa-mobile-alt",
        image: null,
      },
    ],
    benefits: [
      "Distraction-free, fullscreen-like experience",
      "Quick home screen access",
      "Offline support",
    ],
  },

  "desktop-chrome": {
    title: "Install Flow Arts Composer on Desktop",
    icon: "fas fa-desktop",
    steps: [
      {
        text: "Look for the <strong>install icon (⊕)</strong> in the address bar",
        icon: "fas fa-plus-circle",
        image: null, // TODO: Add screenshot to /static/images/install-guides/desktop-chrome-step1.png
      },
      {
        text: 'Click the icon and select <strong>"Install"</strong>',
        icon: "fas fa-download",
        image: null, // TODO: Add screenshot to /static/images/install-guides/desktop-chrome-step2.png
      },
      {
        text: 'Or open the menu (⋮) and select <strong>"Install Flow Arts Composer"</strong>',
        icon: "fas fa-ellipsis-v",
        image: null,
      },
      {
        text: "Launch Flow Arts Composer from your desktop, taskbar, or start menu",
        icon: "fas fa-window-maximize",
        image: null,
      },
    ],
    benefits: [
      "Distraction-free, fullscreen-like experience",
      "Pin to taskbar or dock",
      "Faster startup and offline support",
    ],
  },
};

/**
 * Fallback instructions for unsupported browsers
 */
const FALLBACK_INSTRUCTIONS: Record<string, InstallInstructions> = {
  ios: {
    title: "Installation Not Available",
    icon: "fas fa-info-circle",
    steps: [
      {
        text: "Your current browser doesn't fully support PWA installation",
        icon: "fas fa-exclamation-triangle",
        image: null,
      },
      {
        text: "On iOS, please use Safari for installation",
        icon: "fas fa-browser",
        image: null,
      },
    ],
    benefits: [
      "Better user experience",
      "Offline support",
      "App-like interface",
    ],
  },

  android: {
    title: "Installation Not Available",
    icon: "fas fa-info-circle",
    steps: [
      {
        text: "Your current browser doesn't fully support PWA installation",
        icon: "fas fa-exclamation-triangle",
        image: null,
      },
      {
        text: "Try using Chrome, Edge, or Samsung Internet",
        icon: "fas fa-browser",
        image: null,
      },
    ],
    benefits: [
      "Better user experience",
      "Offline support",
      "App-like interface",
    ],
  },

  desktop: {
    title: "Installation Not Available",
    icon: "fas fa-info-circle",
    steps: [
      {
        text: "Your current browser doesn't fully support PWA installation",
        icon: "fas fa-exclamation-triangle",
        image: null,
      },
      {
        text: "Try using Chrome or Edge for the best experience",
        icon: "fas fa-browser",
        image: null,
      },
    ],
    benefits: [
      "Better user experience",
      "Offline support",
      "App-like interface",
    ],
  },

  default: {
    title: "Installation Not Available",
    icon: "fas fa-info-circle",
    steps: [
      {
        text: "Your current browser doesn't fully support PWA installation",
        icon: "fas fa-exclamation-triangle",
        image: null,
      },
      {
        text: "Try using a modern browser like Chrome, Edge, or Safari",
        icon: "fas fa-browser",
        image: null,
      },
    ],
    benefits: [
      "Better user experience",
      "Offline support",
      "App-like interface",
    ],
  },
};

/**
 * Maps a platform pill tap (iPhone/Android/Computer) plus the detected
 * platform/browser to the instruction variant to show. Pure and
 * unit-testable: the sheet component only wires the result into
 * getInstallInstructions().
 *
 * - iPhone: ios-safari when the detected browser is Safari, or when the
 *   visitor isn't on iOS at all (there's no real device signal to defer to).
 *   Otherwise ios-other, because the detected browser can't do the
 *   installation itself.
 * - Android: android-samsung when the detected browser is Samsung Internet.
 *   Otherwise android-chrome.
 * - Computer: on a computer, passes the detected browser through to the
 *   existing desktop-chrome / fallback behavior. On a phone, desktop-chrome.
 */
export function resolveInstallVariant(
  selected: Platform,
  detected: { platform: Platform; browser: Browser }
): { platform: Platform; browser: Browser } {
  if (selected === "ios") {
    if (detected.platform !== "ios" || detected.browser === "safari") {
      return { platform: "ios", browser: "safari" };
    }
    return { platform: "ios", browser: detected.browser };
  }

  if (selected === "android") {
    if (detected.browser === "samsung") {
      return { platform: "android", browser: "samsung" };
    }
    return { platform: "android", browser: "chrome" };
  }

  // A phone reading the Computer steps gets the Chrome steps, not the
  // "your browser can't install" fallback meant for the phone's own browser.
  if (detected.platform !== "desktop") {
    return { platform: "desktop", browser: "chrome" };
  }
  return { platform: "desktop", browser: detected.browser };
}
