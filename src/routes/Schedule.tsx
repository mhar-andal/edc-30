import { useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { DesktopGrid } from "@/components/schedule/DesktopGrid";
import { MobileStageList } from "@/components/schedule/MobileStageList";
import { CopyFromPersonDialog } from "@/components/schedule/CopyFromPersonDialog";
import { useScheduleData } from "@/lib/useScheduleData";
import { useMemberSession } from "@/lib/useMemberSession";
import { DAY_LABELS, DAYS, type DayKey } from "@/lib/time";
import type { Id } from "../../convex/_generated/dataModel";

export default function Schedule() {
  const session = useMemberSession();
  const data = useScheduleData();
  const [day, setDay] = useState<DayKey>("day_1");
  const [search, setSearch] = useState("");

  const myMemberId = session.status === "authed" ? session.memberId : null;

  const matchedArtistIds = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return null;
    const set = new Set<string>();
    for (const a of data.artists) {
      if (a.name.toLowerCase().includes(term)) set.add(a._id);
    }
    return set;
  }, [search, data.artists]);

  const dayArtists = useMemo(() => {
    const all = data.artistsByDay.get(day) ?? [];
    if (!matchedArtistIds) return all;
    return all.filter((a) => matchedArtistIds.has(a._id));
  }, [data.artistsByDay, day, matchedArtistIds]);

  const pickCountForDay = useMemo(() => {
    return (memberId: Id<"members">) => {
      const memberPicks = data.selectionsByMember.get(memberId);
      if (!memberPicks || memberPicks.size === 0) return 0;
      const dayList = data.artistsByDay.get(day) ?? [];
      let count = 0;
      for (const a of dayList) {
        if (memberPicks.has(a._id)) count++;
      }
      return count;
    };
  }, [data.selectionsByMember, data.artistsByDay, day]);

  if (data.loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={day} onValueChange={(v) => setDay(v as DayKey)}>
          <TabsList>
            {DAYS.map((d) => (
              <TabsTrigger key={d} value={d}>
                <span className="hidden sm:inline">{DAY_LABELS[d].full}</span>
                <span className="sm:hidden">
                  {DAY_LABELS[d].short} {DAY_LABELS[d].date}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <CopyFromPersonDialog
          members={data.members}
          myMemberId={myMemberId}
          day={day}
          pickCountForDay={pickCountForDay}
        />
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search artists…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 pl-8 pr-8"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      {search && (
        <p className="text-[11px] text-muted-foreground">
          {dayArtists.length === 0
            ? `No matches for "${search}" on ${DAY_LABELS[day].short} ${DAY_LABELS[day].date}.`
            : `${dayArtists.length} match${dayArtists.length === 1 ? "" : "es"} on ${DAY_LABELS[day].short} ${DAY_LABELS[day].date} for "${search}".`}
        </p>
      )}

      <div className="md:hidden">
        <MobileStageList
          artists={dayArtists}
          selectionsByArtist={data.selectionsByArtist}
          membersById={data.membersById}
          myMemberId={myMemberId}
          myOverlapsByArtist={data.myOverlapsByArtist}
          flatten={!!search.trim()}
        />
      </div>
      <div className="hidden md:block">
        <DesktopGrid
          day={day}
          artists={dayArtists}
          selectionsByArtist={data.selectionsByArtist}
          membersById={data.membersById}
          myMemberId={myMemberId}
          myOverlapsByArtist={data.myOverlapsByArtist}
        />
      </div>
    </div>
  );
}
