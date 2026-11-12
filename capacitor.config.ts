import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tkaflowarts.composer',
  appName: 'Flow Arts Composer',
  // SvelteKit's adapter-cloudflare emits the built client + app shell here
  // (there is no top-level build/ dir). Capacitor bundles this as the native
  // web assets. The 25 +server API routes can't run in the native shell (no
  // worker); the app's core is client-side Firebase, which works offline-first.
  webDir: '.svelte-kit/cloudflare',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      // Native QR launches keep this surface up until the requested viewer's
      // first card frame is ready, so the previous app screen never flashes.
      launchAutoHide: false,
      launchShowDuration: 3000,
      launchFadeOutDuration: 0,
      backgroundColor: '#06070f',
      androidScaleType: 'CENTER_CROP',
      layoutName: 'launch_screen'
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0b1d2a'
    },
    // Android 15+ (targetSdk 36) enforces edge-to-edge: the WebView renders
    // behind the status bar + camera cutout, and the pre-15 opt-out is gone on
    // Android 16. The System Bars core plugin (Capacitor 8.3.2+) reads the real
    // insets from WindowInsetsCompat and injects --safe-area-inset-* CSS vars
    // (Android WebView <140 returns wrong values for env(safe-area-inset-*), so
    // the var is the reliable source). The app consumes them via CSS to reserve
    // the cutout strip. Supersedes StatusBar overlays for edge-to-edge.
    SystemBars: {
      style: 'DARK',
      insetsHandling: 'css'
    },
    // Native Google (and future social) sign-in. In the WebView, Firebase's
    // signInWithPopup falls back to a redirect through the auth handler domain
    // and loses sessionStorage ("auth/missing-initial-state"), hanging on
    // "Signing in…". This plugin uses the native Google SDK to return an ID
    // token; skipNativeAuth keeps the JS Firebase SDK authoritative (the rest of
    // the app relies on it) — we sign it in with signInWithCredential.
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com']
    },
    Keyboard: {
      resize: 'none',
      style: 'dark'
    },
    PushNotifications: {
      presentationOptions: [
        'badge',
        'sound',
        'alert'
      ]
    },
    CapacitorUpdater: {
      // The phone build the pre-push step installs keeps the web layer it
      // was built with. Pulling the update channel's bundle would put an
      // older site over a fresh install whenever over-the-air uploads lag.
      autoUpdate: process.env.TKA_NATIVE_PUSH_BUILD !== '1',
      appId: 'com.tkaflowarts.composer'
    }
  }
};

export default config;
