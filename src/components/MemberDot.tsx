import { cn } from "@/lib/utils";

interface Props {
  color: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  ring?: boolean;
}

const SIZE_CLASS = {
  xs: "size-2",
  sm: "size-2.5",
  md: "size-3",
  lg: "size-3.5",
} as const;

export function MemberDot({ color, size = "sm", className, ring }: Props) {
  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded-full",
        SIZE_CLASS[size],
        ring && "ring-2 ring-background",
        className,
      )}
      style={{ backgroundColor: color }}
    />
  );
}
