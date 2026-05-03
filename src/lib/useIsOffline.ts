import { useEffect, useState } from "react";
import { useConvexConnectionState } from "convex/react";

/**
 * Returns true when the device is offline OR the Convex WebSocket is
 * disconnected. Used to disable write actions when the backend is
 * unreachable, since the app's offline mode is read-only.
 *
 * The hook stays optimistic until the Convex client has connected at
 * least once. This prevents the "Offline" UI from flickering on
 * during the initial WebSocket bootstrap (which is otherwise reported
 * as `isWebSocketConnected: false` until the handshake completes).
 */
export function useIsOffline(): boolean {
  const connection = useConvexConnectionState();
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    function check() {
      setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    }
    window.addEventListener("online", check);
    window.addEventListener("offline", check);
    return () => {
      window.removeEventListener("online", check);
      window.removeEventListener("offline", check);
    };
  }, []);

  if (!online) return true;
  // Until the client has connected at least once, stay optimistic so we
  // don't surface "offline" during the initial WebSocket bootstrap.
  if (!connection.hasEverConnected) return false;
  return !connection.isWebSocketConnected;
}
