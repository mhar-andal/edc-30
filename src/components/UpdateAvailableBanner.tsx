import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { applyUpdate, useNeedRefresh } from "@/pwa/register-sw";
import { Button } from "@/components/ui/button";

/**
 * Sticky bottom-right banner shown when a new build is waiting to
 * activate. Tapping **Refresh** calls into the service-worker
 * registration to skipWaiting + reload, swapping the running JS for
 * the new build in one shot.
 *
 * The banner is dismissable, but the same flag flips back on next
 * page load if the new SW is still waiting, so dismissing only buys
 * a few minutes of quiet.
 */
export function UpdateAvailableBanner() {
  const needRefresh = useNeedRefresh();
  const [applying, setApplying] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (!needRefresh) return null;
  if (dismissed) return null;

  async function refresh() {
    setApplying(true);
    try {
      await applyUpdate();
      // applyUpdate triggers a reload, but if it doesn't (e.g. the
      // SW lifecycle stalls), nudge the page so the user isn't stuck
      // staring at a spinner forever.
      setTimeout(() => {
        if (typeof window !== "undefined") window.location.reload();
      }, 1500);
    } catch {
      setApplying(false);
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[max(1rem,calc(env(safe-area-inset-bottom)+5rem))] sm:pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-lg border border-primary/30 bg-card/95 px-3 py-2.5 text-sm shadow-lg shadow-primary/10 backdrop-blur">
        <RefreshCw className="size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="font-medium leading-tight">Update available</div>
          <div className="text-xs text-muted-foreground">
            A new version of the app is ready.
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setDismissed(true)}
          disabled={applying}
          className="text-xs text-muted-foreground"
        >
          Later
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={refresh}
          disabled={applying}
          className="text-xs"
        >
          {applying ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Refreshing
            </>
          ) : (
            "Refresh"
          )}
        </Button>
      </div>
    </div>
  );
}
