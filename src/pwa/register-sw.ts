import { useSyncExternalStore } from "react";
import { registerSW } from "virtual:pwa-register";

/**
 * Service-worker update plumbing.
 *
 * We use `registerType: "prompt"` (see vite.config.ts) so a newly
 * deployed build doesn't silently take over a long-running tab and
 * break lazy chunks. Instead we hold the new SW in `waiting`, surface
 * an "Update available" banner via {@link useNeedRefresh}, and only
 * flip the new SW into `active` when the user taps **Refresh** —
 * which calls {@link applyUpdate} → `updateSW(true)` → `skipWaiting`
 * + page reload in lockstep.
 *
 * Long-running tabs (festival weekend) won't see new builds without a
 * nudge. We periodically call `registration.update()` and also re-check
 * whenever the tab regains focus or the network comes back online,
 * so a sleepy phone discovering a deploy after waking up surfaces the
 * banner within a few seconds.
 */

let updateSWFn: ((reloadPage?: boolean) => Promise<void>) | null = null;
let needRefresh = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/**
 * Register the service worker and start watching for new builds.
 * Idempotent: safe to call once at app boot.
 */
export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (updateSWFn) return; // Already registered.

  updateSWFn = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      // Re-check whenever the user re-engages with the app — the
      // typical pattern is "phone in pocket all day, then opens it
      // 20 minutes after we deploy". `update()` is a cheap HEAD on
      // the SW script.
      const recheck = () => {
        registration.update().catch(() => {
          /* ignore — best effort */
        });
      };
      window.addEventListener("focus", recheck);
      window.addEventListener("online", recheck);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") recheck();
      });

      // Also poll on a slow timer so a tab that never loses focus
      // still notices a deploy within ~30 min.
      setInterval(recheck, 30 * 60 * 1000);
    },
    onNeedRefresh() {
      needRefresh = true;
      emit();
    },
    onOfflineReady() {
      /* no-op — the install prompt handles first-install messaging */
    },
  });
}

/**
 * Apply a pending update: tells the waiting SW to `skipWaiting` and
 * reloads the page so the new build takes over cleanly. No-op if no
 * update is pending.
 */
export async function applyUpdate(): Promise<void> {
  if (!updateSWFn) return;
  if (!needRefresh) return;
  await updateSWFn(true);
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getSnapshot(): boolean {
  return needRefresh;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * Subscribe a component to the "update available" flag. Re-renders
 * exactly once when the flag flips from false → true.
 */
export function useNeedRefresh(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
