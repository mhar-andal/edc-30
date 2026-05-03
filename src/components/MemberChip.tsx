import { cn } from "@/lib/utils";

interface Props {
  name: string;
  color: string;
  size?: "xs" | "sm" | "md";
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  truncate?: boolean;
  isYou?: boolean;
  title?: string;
}

const SIZE_CLASS = {
  xs: "h-5 px-1.5 text-[10px] gap-1",
  sm: "h-6 px-2 text-xs gap-1",
  md: "h-7 px-2.5 text-sm gap-1.5",
} as const;

const DOT_SIZE = {
  xs: "size-1.5",
  sm: "size-2",
  md: "size-2.5",
} as const;

export function MemberChip({
  name,
  color,
  size = "sm",
  selected,
  onClick,
  className,
  truncate,
  isYou,
  title,
}: Props) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={title ?? name}
      className={cn(
        "inline-flex items-center rounded-full border bg-card/60 font-medium whitespace-nowrap transition-all",
        SIZE_CLASS[size],
        onClick && "cursor-pointer hover:bg-card active:scale-95",
        selected
          ? "border-foreground/80 ring-2 ring-foreground/30"
          : "border-border/60",
        truncate && "max-w-[14ch] truncate",
        className,
      )}
    >
      <span
        className={cn("shrink-0 rounded-full", DOT_SIZE[size])}
        style={{ backgroundColor: color }}
      />
      <span className={cn(truncate && "truncate")}>{name}</span>
      {isYou && (
        <span className="ml-1 rounded-sm bg-primary/15 px-1 text-[9px] uppercase tracking-wide text-primary">
          you
        </span>
      )}
    </Tag>
  );
}
