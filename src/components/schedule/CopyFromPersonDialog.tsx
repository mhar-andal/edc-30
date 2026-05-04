import { useMemo, useState } from "react";
import { Copy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MemberDot } from "@/components/MemberDot";
import { CopyDayPicksButton } from "./CopyDayPicksButton";
import { DAY_LABELS, type DayKey } from "@/lib/time";
import type { Member } from "@/lib/useScheduleData";
import type { Id } from "../../../convex/_generated/dataModel";
import { useIsOffline } from "@/lib/useIsOffline";

interface Props {
  members: Member[];
  myMemberId: Id<"members"> | null;
  day: DayKey;
  /**
   * `selectionsByMember.get(memberId).size` for each member. Used to
   * filter out the source member's day-pick count and show "X picks"
   * next to each row.
   */
  pickCountForDay: (memberId: Id<"members">) => number;
}

export function CopyFromPersonDialog({
  members,
  myMemberId,
  day,
  pickCountForDay,
}: Props) {
  const [open, setOpen] = useState(false);
  const offline = useIsOffline();

  const others = useMemo(
    () => members.filter((m) => m._id !== myMemberId),
    [members, myMemberId],
  );

  if (!myMemberId || others.length === 0) return null;

  const dayLabel = `${DAY_LABELS[day].full}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={offline}
          title={offline ? "Offline — reconnect to copy picks" : undefined}
        >
          <Copy className="size-4" />
          Copy picks
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Copy someone&apos;s picks for {dayLabel}</DialogTitle>
          <DialogDescription>
            Adds their picks for this day to your own. Duplicates are skipped.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="-mx-1 max-h-[60vh] rounded-md border border-border/60">
          <div className="grid gap-1 p-1.5">
            {others.length === 0 ? (
              <div className="flex items-center gap-2 px-2 py-4 text-xs text-muted-foreground">
                <Users className="size-4" />
                No other people yet.
              </div>
            ) : (
              others.map((m) => {
                const count = pickCountForDay(m._id);
                return (
                  <div
                    key={m._id}
                    className="flex items-center justify-between gap-3 rounded-md p-2 transition-colors hover:bg-secondary/40"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <MemberDot color={m.color} size="md" />
                      <span className="truncate text-sm font-medium">
                        {m.name}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        · {count} pick{count === 1 ? "" : "s"}
                      </span>
                    </div>
                    <CopyDayPicksButton
                      sourceMemberId={m._id}
                      sourceMemberName={m.name}
                      targetMemberId={myMemberId}
                      day={day}
                      sourceDayPickCount={count}
                    />
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
