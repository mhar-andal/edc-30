import { useMemo, useState } from "react";
import { CalendarDays, ChevronRight, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCachedQuery } from "@/lib/useCachedQuery";
import { useScheduleData } from "@/lib/useScheduleData";
import { useMemberSession } from "@/lib/useMemberSession";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { DAY_LABELS, DAYS, formatTime, type DayKey } from "@/lib/time";
import { MemberChip } from "@/components/MemberChip";
import { MeetupBadges } from "@/components/coordinate/MeetupBadges";
import { MeetupDetailDialog } from "@/components/coordinate/MeetupDetailDialog";
import {
  buildJourney,
  deriveConvergenceContext,
} from "@/lib/coordinate";
import { getStagePalette } from "@/lib/colors";

export default function Meetups() {
  const data = useScheduleData();
  const allMeetups = useCachedQuery(api.meetups.listAll) ?? [];
  const session = useMemberSession();
  const myMemberId = session.status === "authed" ? session.memberId : null;

  const meetupsByDay = useMemo(() => {
    const map = new Map<DayKey, Doc<"meetups">[]>([
      ["day_1", []],
      ["day_2", []],
      ["day_3", []],
    ]);
    for (const m of allMeetups) {
      const arr = map.get(m.day);
      if (!arr) continue;
      if (!m.label) continue;
      arr.push(m);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const aT = a.meetupStartMs ?? a.windowStartMs;
        const bT = b.meetupStartMs ?? b.windowStartMs;
        return aT - bT;
      });
    }
    return map;
  }, [allMeetups]);

  if (data.loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  const totalCount = Array.from(meetupsByDay.values()).reduce(
    (s, arr) => s + arr.length,
    0,
  );

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Meetups</h2>
        <p className="text-sm text-muted-foreground">
          {totalCount === 0
            ? "No meetups saved yet — you'll see them here once anyone sets one in Coordinate."
            : `${totalCount} meetup${totalCount === 1 ? "" : "s"} planned across the weekend.`}
        </p>
      </header>

      <Tabs defaultValue="day_1">
        <TabsList>
          {DAYS.map((d) => {
            const count = meetupsByDay.get(d)?.length ?? 0;
            return (
              <TabsTrigger key={d} value={d} className="gap-1.5">
                <span>
                  {DAY_LABELS[d].short} {DAY_LABELS[d].date}
                </span>
                {count > 0 && (
                  <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-medium text-primary">
                    {count}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {DAYS.map((d) => {
          const meetups = meetupsByDay.get(d) ?? [];
          return (
            <TabsContent key={d} value={d} className="space-y-2">
              {meetups.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
                  <CalendarDays className="mx-auto mb-2 size-5 opacity-50" />
                  No meetups planned for {DAY_LABELS[d].full} yet.
                </div>
              ) : (
                meetups.map((m) => (
                  <MeetupSummaryCard
                    key={m._id}
                    meetup={m}
                    membersById={data.membersById}
                    myMemberId={myMemberId}
                    selectionsByMember={data.selectionsByMember}
                    artistsByDay={data.artistsByDay}
                  />
                ))
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

function MeetupSummaryCard({
  meetup,
  membersById,
  myMemberId,
  selectionsByMember,
  artistsByDay,
}: {
  meetup: Doc<"meetups">;
  membersById: Map<string, Doc<"members">>;
  myMemberId: Id<"members"> | null;
  selectionsByMember: Map<string, Set<string>>;
  artistsByDay: Map<DayKey, import("@/lib/useScheduleData").Artist[]>;
}) {
  const [open, setOpen] = useState(false);
  const memberA = membersById.get(meetup.memberAId);
  const memberB = membersById.get(meetup.memberBId);

  const ctx = useMemo(() => {
    const journeyA = memberA
      ? buildJourney(
          meetup.memberAId,
          meetup.day,
          selectionsByMember.get(meetup.memberAId) ?? new Set<string>(),
          artistsByDay,
        )
      : null;
    const journeyB = memberB
      ? buildJourney(
          meetup.memberBId,
          meetup.day,
          selectionsByMember.get(meetup.memberBId) ?? new Set<string>(),
          artistsByDay,
        )
      : null;
    return deriveConvergenceContext(meetup, journeyA, journeyB);
  }, [meetup, memberA, memberB, selectionsByMember, artistsByDay]);

  const toPalette = ctx.toArtist ? getStagePalette(ctx.toArtist.stage) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full flex-col gap-2 rounded-lg border border-border/60 bg-card/40 p-3 text-left transition-colors hover:bg-card/60"
      >
        <div className="flex items-start justify-between gap-2">
          <MeetupBadges
            size="md"
            label={meetup.label}
            fallbackStartMs={meetup.windowStartMs}
            fallbackEndMs={meetup.windowEndMs}
            meetupStartMs={meetup.meetupStartMs}
            meetupEndMs={meetup.meetupEndMs}
          />
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </div>
        {ctx.toArtist && toPalette && (
          <div
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
            style={{
              backgroundColor: `rgb(${toPalette.rgb} / 0.12)`,
              color: `rgb(${toPalette.rgb})`,
            }}
          >
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: `rgb(${toPalette.rgb})` }}
            />
            <span className="font-semibold">{ctx.toArtist.name}</span>
            <span className="opacity-80">· {ctx.toArtist.stage}</span>
            <span className="ml-auto text-[10px] tabular-nums opacity-80">
              {formatTime(ctx.toArtist.startMs)}
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Between</span>
          {memberA && (
            <MemberChip
              name={memberA.name}
              color={memberA.color}
              size="xs"
              isYou={memberA._id === myMemberId}
              truncate
            />
          )}
          <span>and</span>
          {memberB && (
            <MemberChip
              name={memberB.name}
              color={memberB.color}
              size="xs"
              isYou={memberB._id === myMemberId}
              truncate
            />
          )}
        </div>
      </button>
      <MeetupDetailDialog
        open={open}
        onOpenChange={setOpen}
        meetup={meetup}
        membersById={membersById}
        fromArtistA={ctx.fromArtistA}
        fromArtistB={ctx.fromArtistB}
        toArtist={ctx.toArtist}
      />
    </>
  );
}
