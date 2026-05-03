import { useEffect, useState } from "react";
import { useConvex } from "convex/react";

/**
 * Returns true when the device is offline OR the Convex client is disconnected.
 * Used to disable write actions when the backend is unreachable, since the
 * app's offline mode is read-only.
 */
export function useIsOffline(): boolean {
  const convex = useConvex();
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    function check() {
      setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    }
    window.addEventListener("online", check);
    window.addEventListener("offline", check);
    check();
    return () => {
      window.removeEventListener("online", check);
      window.removeEventListener("offline", check);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    function poll() {
      try {
        const state = (
          convex as unknown as {
            connectionState?: () => { isConnected: boolean };
          }
        ).connectionState?.();
        if (state && !cancelled) setConnected(state.isConnected);
      } catch {
        /* ignore */
      }
    }
    poll();
    const interval = window.setInterval(poll, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [convex]);

  return !online || !connected;
}
