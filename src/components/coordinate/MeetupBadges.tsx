import { Clock, MapPin } from "lucide-react";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

interface Props {
  label?: string;
  /** Buffer-window time used as a fallback when no specific meetup time is set. */
  fallbackStartMs: number;
  fallbackEndMs: number;
  meetupStartMs?: number;
  meetupEndMs?: number;
  size?: "sm" | "md";
  className?: string;
}

export function MeetupBadges({
  label,
  fallbackStartMs,
  fallbackEndMs,
  meetupStartMs,
  meetupEndMs,
  size = "md",
  className,
}: Props) {
  const startMs = meetupStartMs ?? fallbackStartMs;
  const endMs = meetupEndMs ?? fallbackEndMs;
  const isCustomTime =
    meetupStartMs !== undefined || meetupEndMs !== undefined;

  const sizeClass =
    size === "sm" ? "h-5 px-1.5 text-[10px]" : "h-6 px-2 text-xs";
  const iconSize = size === "sm" ? "size-2.5" : "size-3";

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {label && (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md bg-emerald-500/15 font-medium text-emerald-200 ring-1 ring-inset ring-emerald-500/40",
            sizeClass,
          )}
        >
          <MapPin className={iconSize} />
          <span className="max-w-[24ch] truncate">{label}</span>
        </span>
      )}
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md font-medium tabular-nums ring-1 ring-inset",
          sizeClass,
          isCustomTime
            ? "bg-sky-500/15 text-sky-200 ring-sky-500/40"
            : "bg-secondary text-foreground ring-border/60",
        )}
      >
        <Clock className={iconSize} />
        {formatTime(startMs)} – {formatTime(endMs)}
      </span>
    </div>
  );
}
