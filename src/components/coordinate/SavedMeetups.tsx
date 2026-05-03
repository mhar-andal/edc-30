import { useMutation } from "convex/react";
import { History, Trash2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { MemberChip } from "@/components/MemberChip";
import { MeetupBadges } from "./MeetupBadges";
import { formatRange, formatTime, type DayKey } from "@/lib/time";
import { useIsOffline } from "@/lib/useIsOffline";

interface Props {
  day: DayKey;
  meetups: Doc<"meetups">[];
  membersById: Map<string, Doc<"members">>;
}

export function SavedMeetups({ day, meetups, membersById }: Props) {
  const clear = useMutation(api.meetups.clear);
  const offline = useIsOffline();
  if (meetups.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <History className="size-4" />
        Saved meetups (no longer in a live window)
      </div>
      <div className="space-y-2">
        {meetups.map((m) => {
          const memberA = membersById.get(m.memberAId);
          const memberB = membersById.get(m.memberBId);
          const editor = membersById.get(m.editedByMemberId);
          return (
            <div
              key={m._id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-dashed border-border/60 bg-background/30 p-3"
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold tabular-nums text-muted-foreground">
                    Buffer {formatRange(m.windowStartMs, m.windowEndMs)}
                  </span>
                  {memberA && (
                    <MemberChip
                      name={memberA.name}
                      color={memberA.color}
                      size="xs"
                      truncate
                    />
                  )}
                  <span className="text-muted-foreground">×</span>
                  {memberB && (
                    <MemberChip
                      name={memberB.name}
                      color={memberB.color}
                      size="xs"
                      truncate
                    />
                  )}
                </div>
                {m.label && (
                  <MeetupBadges
                    size="sm"
                    label={m.label}
                    fallbackStartMs={m.windowStartMs}
                    fallbackEndMs={m.windowEndMs}
                    meetupStartMs={m.meetupStartMs}
                    meetupEndMs={m.meetupEndMs}
                  />
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>
                  set by {editor?.name ?? "—"} at {formatTime(m.editedAt)}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  disabled={offline}
                  onClick={() => {
                    if (offline) return;
                    void clear({
                      day,
                      windowStartMs: m.windowStartMs,
                      windowEndMs: m.windowEndMs,
                      memberAId: m.memberAId,
                      memberBId: m.memberBId,
                    });
                  }}
                  title={
                    offline
                      ? "Offline — reconnect to delete"
                      : "Delete saved meetup"
                  }
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
