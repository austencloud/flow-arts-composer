import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.tkaflowarts.shapeengine",
  appName: "Shape Engine",
  webDir: "dist",
  includePlugins: [
    "@capacitor/app",
    "@capacitor/haptics",
    "@capacitor/keyboard",
    "@capacitor/splash-screen",
    "@capacitor/status-bar",
  ],
  server: { androidScheme: "https" },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1000,
      launchFadeOutDuration: 250,
      backgroundColor: "#030719",
      androidSplashResourceName: "shape_engine_mark",
      androidScaleType: "CENTER_INSIDE",
      showSpinner: false,
    },
    SystemBars: { style: "DARK", insetsHandling: "css" },
    StatusBar: { style: "DARK", backgroundColor: "#030719" },
    Keyboard: { resize: "none", style: "dark" },
  },
};

export default config;
