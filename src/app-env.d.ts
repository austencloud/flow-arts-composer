/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string;
  /** "1" puts the private prop bridges into a build (private-device-panels.ts). */
  readonly VITE_PRIVATE_BRIDGES?: string;
  /** "1" offers every fan look, for recording a maker clip (fan-appearance.ts). */
  readonly VITE_MAKER_PREVIEW?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
