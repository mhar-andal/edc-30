import { registerSW } from "virtual:pwa-register";

export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, _registration) {},
    onOfflineReady() {},
    onNeedRefresh() {},
  });
}
