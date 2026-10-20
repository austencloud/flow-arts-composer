/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string;
  /** "1" puts the private prop bridges into a build (private-device-panels.ts). */
  readonly VITE_PRIVATE_BRIDGES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
