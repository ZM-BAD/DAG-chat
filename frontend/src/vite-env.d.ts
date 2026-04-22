/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_DEFAULT_USER_ID: string;
  readonly VITE_APP_TITLE: string;
  readonly VITE_APP_VERSION: string;
  // More environment variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
