import { useMemo } from "react";
import { MapPin } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MemberDot } from "@/components/MemberDot";
import { formatRange } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Member, Sidequest } from "@/lib/useScheduleData";
import type { Id } from "../../../convex/_generated/dataModel";
import { SidequestPopover } from "./SidequestPopover";

interface Props {
  sidequest: Sidequest;
  membersById: Map<string, Member>;
  myMemberId: Id<"members"> | null;
  onEdit?: (sidequest: Sidequest) => void;
  /**
   * Optional dense layout for tight grid columns. Compact hides the
   * member-dots row when there's no room for it.
   */
  compact?: boolean;
  className?: string;
}

/**
 * One sidequest rendered as a clickable button. On click, opens a
 * popover detail view with Join/Leave + (creator) Edit/Delete actions.
 *
 * Visually styled with the creator's accent color so people can scan
 * "who proposed this" at a glance.
 */
export function SidequestBlock({
  sidequest,
  membersById,
  myMemberId,
  onEdit,
  compact,
  className,
}: Props) {
  const creator = membersById.get(sidequest.createdByMemberId);
  const accent = creator?.color ?? "#a78bfa";

  const participants = useMemo(() => {
    const out: Member[] = [];
    for (const id of sidequest.participantMemberIds) {
      const m = membersById.get(id);
      if (m) out.push(m);
    }
    return out;
  }, [sidequest.participantMemberIds, membersById]);

  // Show the creator's dot first so the proposer is identifiable, then
  // the rest of the joiners in order.
  const orderedDots = useMemo(() => {
    const creatorId = sidequest.createdByMemberId;
    const sorted = [...participants].sort((a, b) => {
      if (a._id === creatorId && b._id !== creatorId) return -1;
      if (b._id === creatorId && a._id !== creatorId) return 1;
      return 0;
    });
    return sorted;
  }, [participants, sidequest.createdByMemberId]);

  const visibleDots = orderedDots.slice(0, compact ? 4 : 6);
  const overflow = orderedDots.length - visibleDots.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "group flex h-full w-full flex-col gap-1 overflow-hidden rounded-md border-l-[3px] bg-background/70 px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-background/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
          style={{ borderLeftColor: accent, color: "rgb(229 231 235)" }}
          aria-label={`Sidequest: ${sidequest.title}`}
        >
          <div className="flex items-baseline justify-between gap-1">
            <span className="truncate font-semibold leading-tight">
              {sidequest.title}
            </span>
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {formatRange(sidequest.startMs, sidequest.endMs)}
          </span>
          {sidequest.location && (
            <span className="flex items-center gap-1 truncate text-[10px] text-muted-foreground">
              <MapPin className="size-2.5 shrink-0" />
              <span className="truncate">{sidequest.location}</span>
            </span>
          )}
          {orderedDots.length > 0 && (
            <div className="mt-auto flex items-center gap-1">
              {visibleDots.map((m) => (
                <span
                  key={m._id}
                  title={m.name}
                  className="inline-flex"
                  aria-hidden="true"
                >
                  <MemberDot color={m.color} size="xs" />
                </span>
              ))}
              {overflow > 0 && (
                <span className="text-[9px] text-muted-foreground">
                  +{overflow}
                </span>
              )}
            </div>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 max-h-[min(80dvh,32rem)] overflow-y-auto p-3"
      >
        <SidequestPopover
          sidequest={sidequest}
          membersById={membersById}
          myMemberId={myMemberId}
          onEdit={onEdit}
        />
      </PopoverContent>
    </Popover>
  );
}
