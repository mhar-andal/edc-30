import { useState } from "react";
import { Check, CheckCheck, ChevronDown, Info, X } from "lucide-react";
import { MemberChip } from "@/components/MemberChip";
import { Button } from "@/components/ui/button";
import type { Member } from "@/lib/useScheduleData";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface Props {
  members: Member[];
  selected: ReadonlyArray<Id<"members">>;
  onChange: (next: Id<"members">[]) => void;
  myMemberId: Id<"members"> | null;
  className?: string;
  label?: string;
  emptyHint?: string;
  /** Default to collapsed when there are at least this many members. */
  collapseThreshold?: number;
  /**
   * Builds the small badge shown in the header when something is selected.
   * Defaults to a "N selected" pill.
   */
  selectedBadge?: (count: number, total: number) => string;
  /** Hint text shown above the chip strip while expanded. */
  hint?: (selectedCount: number) => string;
}

export function MemberFilter({
  members,
  selected,
  onChange,
  myMemberId,
  className,
  label = "Members",
  emptyHint,
  collapseThreshold = 6,
  selectedBadge,
  hint,
}: Props) {
  const [open, setOpen] = useState(() => members.length < collapseThreshold);
  const selectedSet = new Set(selected);
  const allSelected =
    members.length > 0 && selected.length === members.length;

  function toggle(id: Id<"members">) {
    if (selectedSet.has(id)) {
      onChange(selected.filter((x) => x !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  if (members.length === 0) {
    return emptyHint ? (
      <span className="text-xs text-muted-foreground">{emptyHint}</span>
    ) : null;
  }

  const badgeText =
    selected.length > 0
      ? selectedBadge
        ? selectedBadge(selected.length, members.length)
        : `${selected.length} selected`
      : null;

  return (
    <div
      className={cn(
        "rounded-lg border border-border/60 bg-card/30",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-secondary/30"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {members.length}
          </span>
          {!open && selected.length > 0 && (
            <SelectedPreview
              members={members.filter((m) => selectedSet.has(m._id))}
              myMemberId={myMemberId}
            />
          )}
        </span>
        <span className="flex items-center gap-2">
          {badgeText && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
              <Check className="size-3" />
              {badgeText}
            </span>
          )}
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border/40 px-3 py-2">
          {hint && (
            <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 size-3 shrink-0" />
              <span>{hint(selected.length)}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => (
              <MemberChip
                key={m._id}
                name={m.name}
                color={m.color}
                size="sm"
                isYou={m._id === myMemberId}
                selected={selectedSet.has(m._id)}
                onClick={() => toggle(m._id)}
                truncate
              />
            ))}
          </div>
          {members.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {!allSelected && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={() => onChange(members.map((m) => m._id))}
                >
                  <CheckCheck className="size-3" /> Select all
                </Button>
              )}
              {selected.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={() => onChange([])}
                >
                  <X className="size-3" /> Deselect all
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SelectedPreview({
  members,
  myMemberId,
}: {
  members: Member[];
  myMemberId: Id<"members"> | null;
}) {
  const visible = members.slice(0, 3);
  const overflow = members.length - visible.length;
  return (
    <span className="flex items-center gap-1">
      {visible.map((m) => (
        <span
          key={m._id}
          className="inline-flex h-2 w-2 rounded-full"
          style={{ backgroundColor: m.color }}
          title={m._id === myMemberId ? `${m.name} (you)` : m.name}
        />
      ))}
      {overflow > 0 && (
        <span className="text-[10px] text-muted-foreground">
          +{overflow}
        </span>
      )}
    </span>
  );
}
