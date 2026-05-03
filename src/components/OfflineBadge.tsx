import { CloudOff } from "lucide-react";
import { useIsOffline } from "@/lib/useIsOffline";
import { cn } from "@/lib/utils";

export function OfflineBadge({ className }: { className?: string }) {
  const offline = useIsOffline();
  if (!offline) return null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-300 ring-1 ring-amber-500/30",
        className,
      )}
      title="You're offline. Editing is disabled until you reconnect."
    >
      <CloudOff className="size-3" />
      <span>Offline · read-only</span>
    </div>
  );
}
