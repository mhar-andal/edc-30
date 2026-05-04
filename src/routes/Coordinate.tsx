import { useMemo, useState } from "react";
import { Compass, Loader2, MapPin, Sparkles } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ConvergenceCard } from "@/components/coordinate/ConvergenceCard";
import { useScheduleData } from "@/lib/useScheduleData";
import { useCachedQuery } from "@/lib/useCachedQuery";
import { useMemberSession } from "@/lib/useMemberSession";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { DAY_LABELS, DAYS, type DayKey } from "@/lib/time";
import {
  buildJourney,
  findConvergences,
  meetupKey,
  type Convergence,
} from "@/lib/coordinate";

type Mode = "mine" | "everyone";

export default function Coordinate() {
  const session = useMemberSession();
  const data = useScheduleData();
  const allMeetups = useCachedQuery(api.meetups.listAll) ?? [];

  const myMemberId = session.status === "authed" ? session.memberId : null;
  const [day, setDay] = useState<DayKey>("day_1");
  const [mode, setMode] = useState<Mode>("mine");

  const journeys = useMemo(() => {
    return data.members
      .map((m) => {
        const ids = data.selectionsByMember.get(m._id) ?? new Set<string>();
        return buildJourney(m._id, day, ids, data.artistsByDay);
      })
      .filter((j) => j.artists.length > 0);
  }, [data.members, data.selectionsByMember, data.artistsByDay, day]);

  const allConvergences = useMemo(
    () => findConvergences(journeys, day),
    [journeys, day],
  );

  const myConvergences = useMemo(() => {
    if (!myMemberId) return [] as Convergence[];
    return allConvergences.filter((c) => c.memberIds.includes(myMemberId));
  }, [allConvergences, myMemberId]);

  const visibleConvergences =
    mode === "mine" ? myConvergences : allConvergences;

  const meetupsForDay = useMemo(
    () => allMeetups.filter((m) => m.day === day),
    [allMeetups, day],
  );
  const meetupsByKey = useMemo(() => {
    const m = new Map<string, (typeof meetupsForDay)[number]>();
    for (const r of meetupsForDay) {
      m.set(
        meetupKey(r.day, r.windowStartMs, r.windowEndMs, r.destinationStage),
        r,
      );
    }
    return m;
  }, [meetupsForDay]);

  const myHasPicksToday = useMemo(() => {
    if (!myMemberId) return false;
    const set = data.selectionsByMember.get(myMemberId);
    if (!set || set.size === 0) return false;
    const todays = data.artistsByDay.get(day) ?? [];
    return todays.some((a) => set.has(a._id));
  }, [data.selectionsByMember, data.artistsByDay, day, myMemberId]);

  if (data.loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Your meetup opportunities</h2>
          <p className="text-sm text-muted-foreground">
            Times you're at a different stage from a friend but heading to the
            same one next.
          </p>
        </div>
        <Tabs value={day} onValueChange={(v) => setDay(v as DayKey)}>
          <TabsList>
            {DAYS.map((d) => (
              <TabsTrigger key={d} value={d}>
                {DAY_LABELS[d].short} {DAY_LABELS[d].date}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>

      <Body
        mode={mode}
        myMemberId={myMemberId}
        myHasPicksToday={myHasPicksToday}
        visibleConvergences={visibleConvergences}
        allConvergences={allConvergences}
        myConvergences={myConvergences}
        membersById={data.membersById}
        meetupsByKey={meetupsByKey}
        day={day}
        onSwitchToEveryone={() => setMode("everyone")}
        onSwitchToMine={() => setMode("mine")}
      />
    </div>
  );
}

function Body({
  mode,
  myMemberId,
  myHasPicksToday,
  visibleConvergences,
  allConvergences,
  myConvergences,
  membersById,
  meetupsByKey,
  day,
  onSwitchToEveryone,
  onSwitchToMine,
}: {
  mode: Mode;
  myMemberId: Id<"members"> | null;
  myHasPicksToday: boolean;
  visibleConvergences: Convergence[];
  allConvergences: Convergence[];
  myConvergences: Convergence[];
  membersById: Map<string, import("../../convex/_generated/dataModel").Doc<"members">>;
  meetupsByKey: Map<string, import("../../convex/_generated/dataModel").Doc<"meetups">>;
  day: DayKey;
  onSwitchToEveryone: () => void;
  onSwitchToMine: () => void;
}) {
  const dayLabel = `${DAY_LABELS[day].short} ${DAY_LABELS[day].date}`;

  if (mode === "mine" && !myHasPicksToday) {
    return (
      <EmptyState
        icon={<Sparkles className="size-5" />}
        title={`You haven't picked any artists for ${dayLabel}.`}
        body="Head to the Schedule tab to add some — once you have a couple of picks, we'll surface meetup opportunities here."
      />
    );
  }

  if (mode === "mine" && myConvergences.length === 0) {
    return (
      <EmptyState
        icon={<Compass className="size-5" />}
        title={`No matching transitions for you on ${dayLabel}.`}
        body="A meetup opportunity appears when you and a friend are at different stages and heading to the same one next."
        action={
          allConvergences.length > 0 && (
            <Button variant="outline" size="sm" onClick={onSwitchToEveryone}>
              See {allConvergences.length} opportunit
              {allConvergences.length === 1 ? "y" : "ies"} between others
            </Button>
          )
        }
      />
    );
  }

  if (mode === "everyone" && allConvergences.length === 0) {
    return (
      <EmptyState
        icon={<Compass className="size-5" />}
        title={`No convergences anywhere on ${dayLabel} yet.`}
        body="Once people's selections start overlapping in time across different stages, opportunities will show up here."
      />
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <MapPin className="size-4 text-emerald-300" />
          {visibleConvergences.length} opportunit
          {visibleConvergences.length === 1 ? "y" : "ies"} ·{" "}
          {mode === "mine" ? "for you" : "for everyone"}
        </div>
        {mode === "mine" && allConvergences.length > myConvergences.length ? (
          <Button variant="ghost" size="sm" onClick={onSwitchToEveryone}>
            Show all {allConvergences.length}
          </Button>
        ) : mode === "everyone" ? (
          <Button variant="ghost" size="sm" onClick={onSwitchToMine}>
            Show only mine
          </Button>
        ) : null}
      </div>
      <div className="grid gap-3">
        {visibleConvergences.map((c, i) => {
          const key = meetupKey(
            day,
            c.windowStart,
            c.windowEnd,
            c.destinationStage,
          );
          return (
            <ConvergenceCard
              key={`${key}-${i}`}
              day={day}
              conv={c}
              membersById={membersById}
              meetupsByKey={meetupsByKey}
              myMemberId={myMemberId}
              meetupKey={key}
            />
          );
        })}
      </div>
    </section>
  );
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 px-6 py-10 text-center">
      <div className="grid size-10 place-items-center rounded-full bg-secondary text-muted-foreground">
        {icon}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{body}</p>
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
