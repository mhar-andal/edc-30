/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Build identifier injected by Vite's `define` (see vite.config.ts).
 * Bumps on every Vercel deploy via `VERCEL_GIT_COMMIT_SHA`. Used by
 * the offline cache to invalidate stale entries after deploys.
 */
declare const __BUILD_ID__: string;
