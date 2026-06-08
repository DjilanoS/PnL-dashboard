/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the backend API (e.g. https://pnl-api.vercel.app). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
