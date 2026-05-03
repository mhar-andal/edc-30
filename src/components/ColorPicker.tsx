import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface TakenColor {
  color: string;
  name: string;
}

interface Props {
  value: string;
  onChange: (color: string) => void;
  palette: ReadonlyArray<{ name: string; value: string }>;
  takenBy?: ReadonlyArray<TakenColor>;
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
}

export function ColorPicker({
  value,
  onChange,
  palette,
  takenBy,
  disabled,
  disabledReason,
  className,
}: Props) {
  const ownerByColor = new Map<string, string>();
  for (const t of takenBy ?? []) {
    ownerByColor.set(t.color.toLowerCase(), t.name);
  }

  const [openOwnerKey, setOpenOwnerKey] = useState<string | null>(null);

  return (
    <TooltipProvider delayDuration={200} disableHoverableContent>
      <div className={cn("flex flex-wrap gap-2", className)}>
        {palette.map((c) => {
          const key = c.value.toLowerCase();
          const isActive = key === value.toLowerCase();
          const ownerName = ownerByColor.get(key);
          const isTaken = !!ownerName && !isActive;
          const isOpen = isTaken && openOwnerKey === key;

          return (
            <Tooltip
              key={c.value}
              open={isTaken ? isOpen : undefined}
              onOpenChange={
                isTaken
                  ? (next) => setOpenOwnerKey(next ? key : null)
                  : undefined
              }
            >
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={disabled && !isActive}
                  aria-disabled={isTaken || disabled || undefined}
                  aria-label={
                    isTaken
                      ? `${c.name} — taken by ${ownerName}`
                      : c.name
                  }
                  onClick={() => {
                    if (disabled) return;
                    if (isTaken) {
                      setOpenOwnerKey((cur) => (cur === key ? null : key));
                      return;
                    }
                    onChange(c.value);
                  }}
                  className={cn(
                    "relative size-8 rounded-full transition-all",
                    isActive &&
                      "ring-2 ring-offset-2 ring-offset-background ring-foreground",
                    isTaken && "opacity-30 cursor-help",
                    disabled && !isActive && "opacity-30 cursor-not-allowed",
                    !isTaken && !isActive && !disabled && "hover:scale-110",
                  )}
                  style={{ backgroundColor: c.value }}
                >
                  {isActive && (
                    <Check className="absolute inset-0 m-auto size-4 text-foreground drop-shadow" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {disabled && disabledReason ? (
                  disabledReason
                ) : isTaken ? (
                  <span>
                    Taken by{" "}
                    <span className="font-medium">{ownerName}</span>
                  </span>
                ) : (
                  c.name
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
