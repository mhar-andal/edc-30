import { useMemo } from "react";
import { CalendarDays, Clock, Loader2, MapPin } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCachedQuery } from "@/lib/useCachedQuery";
import { useScheduleData } from "@/lib/useScheduleData";
import { useMemberSession } from "@/lib/useMemberSession";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import {
  DAY_LABELS,
  DAYS,
  formatRange,
  formatTime,
  type DayKey,
} from "@/lib/time";
import { MemberChip } from "@/components/MemberChip";
import {
  buildJourney,
  findConvergences,
  meetupKey,
  type Convergence,
} from "@/lib/coordinate";
import { getStagePalette } from "@/lib/colors";

export default function Meetups() {
  const data = useScheduleData();
  const allMeetups = useCachedQuery(api.meetups.listAll) ?? [];
  const session = useMemberSession();
  const myMemberId = session.status === "authed" ? session.memberId : null;

  // For each day, compute the live convergences and the lookup of
  // saved meet-spots keyed by the same convergence identity.
  const dayState = useMemo(() => {
    const out = new Map<
      DayKey,
      {
        convergences: Convergence[];
        spotByKey: Map<string, Doc<"meetups">>;
      }
    >();
    for (const day of DAYS) {
      const journeys = data.members
        .map((m) => {
          const ids = data.selectionsByMember.get(m._id) ?? new Set<string>();
          return buildJourney(m._id, day, ids, data.artistsByDay);
        })
        .filter((j) => j.artists.length > 0);
      const convergences = findConvergences(journeys, day);
      const spotByKey = new Map<string, Doc<"meetups">>();
      for (const m of allMeetups) {
        if (m.day !== day) continue;
        spotByKey.set(
          meetupKey(m.day, m.windowStartMs, m.windowEndMs, m.destinationStage),
          m,
        );
      }
      out.set(day, { convergences, spotByKey });
    }
    return out;
  }, [data.members, data.selectionsByMember, data.artistsByDay, allMeetups]);

  if (data.loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Your meetups</h2>
        <p className="text-sm text-muted-foreground">
          Every convergence that involves you, in time order. Open the
          Coordinate tab to set or change a meet spot.
        </p>
      </header>

      <Tabs defaultValue="day_1">
        <TabsList>
          {DAYS.map((d) => {
            const mine = (dayState.get(d)?.convergences ?? []).filter((c) =>
              myMemberId ? c.memberIds.includes(myMemberId) : false,
            );
            return (
              <TabsTrigger key={d} value={d} className="gap-1.5">
                <span>
                  {DAY_LABELS[d].short} {DAY_LABELS[d].date}
                </span>
                {mine.length > 0 && (
                  <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-medium text-primary">
                    {mine.length}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {DAYS.map((d) => {
          const state = dayState.get(d);
          const myConvergences = (state?.convergences ?? []).filter((c) =>
            myMemberId ? c.memberIds.includes(myMemberId) : false,
          );
          return (
            <TabsContent key={d} value={d} className="space-y-2">
              {!myMemberId ? (
                <EmptyMessage text="Sign in on Onboarding to see your meetups." />
              ) : myConvergences.length === 0 ? (
                <EmptyMessage
                  text={`No convergences for you on ${DAY_LABELS[d].full} yet. Add picks on the Schedule tab to surface them.`}
                />
              ) : (
                myConvergences.map((conv) => {
                  const key = meetupKey(
                    d,
                    conv.windowStart,
                    conv.windowEnd,
                    conv.destinationStage,
                  );
                  const spot = state?.spotByKey.get(key);
                  return (
                    <MeetupCard
                      key={key}
                      conv={conv}
                      spot={spot}
                      membersById={data.membersById}
                      myMemberId={myMemberId}
                    />
                  );
                })
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
      <CalendarDays className="mx-auto mb-2 size-5 opacity-50" />
      {text}
    </div>
  );
}

function MeetupCard({
  conv,
  spot,
  membersById,
  myMemberId,
}: {
  conv: Convergence;
  spot: Doc<"meetups"> | undefined;
  membersById: Map<string, Doc<"members">>;
  myMemberId: import("../../convex/_generated/dataModel").Id<"members"> | null;
}) {
  const palette = getStagePalette(conv.destinationStage);
  const others = conv.memberIds
    .filter((id) => id !== myMemberId)
    .map((id) => membersById.get(id))
    .filter((m): m is Doc<"members"> => Boolean(m));

  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-card/40 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums">
          {formatRange(conv.windowStart, conv.windowEnd)}
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {formatTime(conv.destinationArtist.startMs)}
        </span>
      </div>

      <div
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
        style={{
          backgroundColor: `rgb(${palette.rgb} / 0.12)`,
          color: `rgb(${palette.rgb})`,
        }}
      >
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: `rgb(${palette.rgb})` }}
        />
        <span className="font-semibold">{conv.destinationArtist.name}</span>
        <span className="opacity-80">· {conv.destinationStage}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {spot?.label ? (
          <div className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-200 ring-1 ring-emerald-500/40">
            <MapPin className="size-3" />
            {spot.label}
          </div>
        ) : (
          <div className="inline-flex items-center gap-1 rounded-md border border-dashed border-border/60 px-2 py-1 text-[11px] text-muted-foreground">
            <MapPin className="size-3" />
            No spot picked yet
          </div>
        )}
        {spot?.meetMs !== undefined && spot.meetMs !== null ? (
          <div className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-medium tabular-nums text-emerald-200 ring-1 ring-emerald-500/40">
            <Clock className="size-3" />
            {formatTime(spot.meetMs)}
          </div>
        ) : null}
      </div>

      {others.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {others.map((m) => (
            <MemberChip
              key={m._id}
              name={m.name}
              color={m.color}
              size="xs"
              truncate
            />
          ))}
        </div>
      )}
    </div>
  );
}
