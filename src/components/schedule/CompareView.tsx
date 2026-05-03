import { useMemo } from "react";
import { ArtistCard } from "./ArtistCard";
import { MemberChip } from "@/components/MemberChip";
import {
  FESTIVAL_DAY_RANGE_MS,
  FESTIVAL_DAY_HOURS,
  formatHour,
  type DayKey,
} from "@/lib/time";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import type { Artist } from "@/lib/useScheduleData";
import { cn } from "@/lib/utils";

interface Props {
  day: DayKey;
  memberIds: ReadonlyArray<Id<"members">>;
  membersById: Map<string, Doc<"members">>;
  selectionsByMember: Map<string, Set<string>>;
  selectionsByArtist: Map<string, Array<Id<"members">>>;
  artistsByDay: Map<DayKey, Artist[]>;
  myMemberId: Id<"members"> | null;
  myOverlapsByArtist: Map<string, Artist[]>;
}

const PIXELS_PER_HOUR = 90;

export function CompareView({
  day,
  memberIds,
  membersById,
  selectionsByMember,
  selectionsByArtist,
  artistsByDay,
  myMemberId,
  myOverlapsByArtist,
}: Props) {
  const range = FESTIVAL_DAY_RANGE_MS[day];
  const totalHeight = FESTIVAL_DAY_HOURS * PIXELS_PER_HOUR;
  const members = memberIds
    .map((id) => membersById.get(id))
    .filter((m): m is Doc<"members"> => Boolean(m));
  const dayArtists = artistsByDay.get(day) ?? [];

  const perMemberArtists = useMemo(() => {
    const map = new Map<string, Artist[]>();
    for (const m of members) {
      const ids = selectionsByMember.get(m._id);
      if (!ids) {
        map.set(m._id, []);
        continue;
      }
      const list = dayArtists.filter((a) => ids.has(a._id));
      map.set(m._id, list);
    }
    return map;
  }, [members, selectionsByMember, dayArtists]);

  const conflictHourSet = useMemo(() => {
    if (members.length < 2) return new Set<number>();
    const hourSet = new Set<number>();
    const segments = new Map<string, Artist[]>();
    for (const m of members) segments.set(m._id, perMemberArtists.get(m._id) ?? []);
    for (let h = 0; h < Math.ceil(FESTIVAL_DAY_HOURS); h++) {
      const probe = range.start + h * 3600000 + 1800000;
      const stagesAtTime = new Set<string>();
      for (const arr of segments.values()) {
        const a = arr.find((x) => x.startMs <= probe && x.endMs > probe);
        if (a) stagesAtTime.add(a.stage);
      }
      if (stagesAtTime.size >= 2) hourSet.add(h);
    }
    return hourSet;
  }, [members, perMemberArtists, range.start]);

  const hourMarkers = useMemo(() => {
    const markers: Array<{ ms: number; label: string; topPx: number; idx: number }> = [];
    const slots = Math.ceil(FESTIVAL_DAY_HOURS) + 1;
    for (let i = 0; i < slots; i++) {
      const ms = range.start + i * 60 * 60 * 1000;
      markers.push({ ms, label: formatHour(ms), topPx: i * PIXELS_PER_HOUR, idx: i });
    }
    return markers;
  }, [range.start]);

  return (
    <div className="overflow-hidden rounded-lg border border-border/60 bg-card/40">
      <div className="overflow-x-auto md:overflow-x-visible">
        <div
          className="relative"
          style={{
            display: "grid",
            gridTemplateColumns: `64px repeat(${members.length}, minmax(80vw, 1fr))`,
          }}
        >
          <div className="sticky top-0 z-30 bg-card/95 px-2 py-2 text-[10px] uppercase tracking-wide text-muted-foreground backdrop-blur">
            Time
          </div>
          {members.map((m) => {
            const isMe = m._id === myMemberId;
            return (
              <div
                key={m._id}
                className="sticky top-0 z-30 border-l border-border/60 bg-card/95 px-3 py-2 backdrop-blur"
              >
                <MemberChip
                  name={m.name}
                  color={m.color}
                  size="sm"
                  isYou={isMe}
                  truncate
                />
              </div>
            );
          })}

          <div
            className="sticky left-0 z-20 border-r border-border/60 bg-card/95 backdrop-blur"
            style={{ height: totalHeight, gridColumn: 1 }}
          >
            {hourMarkers.map((m) => (
              <div
                key={m.ms}
                className={cn(
                  "absolute -translate-y-1/2 px-2 text-[10px] tabular-nums",
                  conflictHourSet.has(m.idx)
                    ? "font-semibold text-amber-300"
                    : "text-muted-foreground",
                )}
                style={{ top: m.topPx }}
              >
                {m.label}
              </div>
            ))}
          </div>

          {members.map((m, columnIdx) => {
            const list = perMemberArtists.get(m._id) ?? [];
            return (
              <div
                key={m._id}
                className="relative border-l border-border/60"
                style={{ height: totalHeight, gridColumn: columnIdx + 2 }}
              >
                {hourMarkers.slice(0, -1).map((mk) => (
                  <div
                    key={mk.ms}
                    className={cn(
                      "absolute left-0 right-0 border-t",
                      conflictHourSet.has(mk.idx)
                        ? "border-amber-500/30 bg-amber-500/5"
                        : "border-dashed border-border/30",
                    )}
                    style={{ top: mk.topPx, height: PIXELS_PER_HOUR }}
                  />
                ))}
                {list.map((a) => {
                  const startOffset = Math.max(
                    0,
                    ((a.startMs - range.start) / 3600000) * PIXELS_PER_HOUR,
                  );
                  const heightPx = Math.max(
                    36,
                    ((a.endMs - a.startMs) / 3600000) * PIXELS_PER_HOUR,
                  );
                  const picked = selectionsByArtist.get(a._id) ?? [];
                  return (
                    <div
                      key={a._id}
                      className="absolute left-2 right-2"
                      style={{ top: startOffset, height: heightPx }}
                    >
                      <ArtistCard
                        artist={a}
                        pickedByMemberIds={picked}
                        membersById={membersById}
                        myMemberId={myMemberId}
                        myOverlapping={myOverlapsByArtist.get(a._id)}
                        dayArtists={dayArtists}
                        selectionsByArtist={selectionsByArtist}
                        density="normal"
                        showStageBadge
                        showTime
                        className="h-full"
                      />
                    </div>
                  );
                })}
                {list.length === 0 && (
                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-4 text-center text-xs text-muted-foreground">
                    No picks yet for this day.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
