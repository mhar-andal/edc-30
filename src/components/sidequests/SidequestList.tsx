import { useMemo } from "react";
import { CalendarPlus, MapPin } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MemberDot } from "@/components/MemberDot";
import { SidequestPopover } from "./SidequestPopover";
import { formatRange } from "@/lib/time";
import type { Member, Sidequest } from "@/lib/useScheduleData";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface Props {
  sidequests: Sidequest[];
  membersById: Map<string, Member>;
  myMemberId: Id<"members"> | null;
  onCreate: () => void;
  onEdit: (sidequest: Sidequest) => void;
}

/**
 * Mobile vertical list of sidequests for a given day. Each row is
 * tap-to-open with a popover detail; create lives on a sticky CTA at
 * the top (the floating + FAB elsewhere is the primary entry point).
 */
export function SidequestList({
  sidequests,
  membersById,
  myMemberId,
  onCreate,
  onEdit,
}: Props) {
  if (sidequests.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border/60 px-6 py-10 text-center">
        <div className="grid size-10 place-items-center rounded-full bg-violet-500/10 text-violet-300">
          <CalendarPlus className="size-5" />
        </div>
        <p className="text-sm font-semibold">No sidequests yet</p>
        <p className="text-xs text-muted-foreground">
          Tap the “+” button to plan a non-set adventure — tacos, ferris
          wheel, sunset photo. Anyone can join.
        </p>
        {myMemberId && (
          <button
            type="button"
            onClick={onCreate}
            className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-md bg-violet-500 px-3 text-xs font-semibold text-white shadow-sm hover:bg-violet-500/90"
          >
            <CalendarPlus className="size-3.5" />
            Create sidequest
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sidequests.map((sq) => (
        <SidequestRow
          key={sq._id}
          sidequest={sq}
          membersById={membersById}
          myMemberId={myMemberId}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}

function SidequestRow({
  sidequest,
  membersById,
  myMemberId,
  onEdit,
}: {
  sidequest: Sidequest;
  membersById: Map<string, Member>;
  myMemberId: Id<"members"> | null;
  onEdit: (s: Sidequest) => void;
}) {
  const creator = membersById.get(sidequest.createdByMemberId);
  const accent = creator?.color ?? "#a78bfa";

  const orderedDots = useMemo(() => {
    const out: Member[] = [];
    for (const id of sidequest.participantMemberIds) {
      const m = membersById.get(id);
      if (m) out.push(m);
    }
    out.sort((a, b) => {
      if (a._id === sidequest.createdByMemberId) return -1;
      if (b._id === sidequest.createdByMemberId) return 1;
      return 0;
    });
    return out;
  }, [sidequest.participantMemberIds, sidequest.createdByMemberId, membersById]);

  const visibleDots = orderedDots.slice(0, 6);
  const overflow = orderedDots.length - visibleDots.length;
  const iJoined =
    !!myMemberId &&
    sidequest.participantMemberIds.some((id) => id === myMemberId);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-stretch gap-3 rounded-md border bg-card/40 px-3 py-2.5 text-left transition-colors hover:bg-card/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            iJoined ? "border-violet-500/50" : "border-border/60",
          )}
        >
          <div
            className="w-1 shrink-0 rounded-full"
            style={{ backgroundColor: accent }}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-semibold">
                {sidequest.title}
              </span>
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {formatRange(sidequest.startMs, sidequest.endMs)}
              </span>
            </div>
            {sidequest.location && (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">{sidequest.location}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                {visibleDots.map((m) => (
                  <span key={m._id} title={m.name} className="inline-flex">
                    <MemberDot color={m.color} size="xs" />
                  </span>
                ))}
                {overflow > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{overflow}
                  </span>
                )}
                {orderedDots.length === 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    No one in yet
                  </span>
                )}
              </div>
              {iJoined && (
                <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-200">
                  You're in
                </span>
              )}
            </div>
          </div>
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
