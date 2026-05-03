import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { DAY_LABELS, type DayKey } from "@/lib/time";

interface Props {
  day: DayKey;
  lateNight?: boolean;
  className?: string;
  size?: "xs" | "sm";
}

export function DayBadge({ day, lateNight, className, size = "sm" }: Props) {
  const label = DAY_LABELS[day];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        size === "xs" ? "h-5 px-1.5 text-[10px]" : "h-6 px-2 text-xs",
        lateNight
          ? "bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-500/30"
          : "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/25",
        className,
      )}
    >
      {lateNight ? <Moon className="size-3" /> : <Sun className="size-3" />}
      <span>
        {label.short}
        {lateNight ? " · late" : ""}
      </span>
    </span>
  );
}
