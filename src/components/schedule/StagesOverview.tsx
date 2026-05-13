import { useMemo } from "react";
import { ArtistCard } from "./ArtistCard";
import { getStagePalette } from "@/lib/colors";
import type { Id } from "../../../convex/_generated/dataModel";
import { formatHour, formatTime, localHour } from "@/lib/time";
import type { Artist, Member } from "@/lib/useScheduleData";

interface Props {
  artists: Artist[];
  selectionsByArtist: Map<string, Array<Id<"members">>>;
  membersById: Map<string, Member>;
  myMemberId: Id<"members"> | null;
  myOverlapsByArtist: Map<string, Artist[]>;
}

interface HourBucket {
  hourMs: number;
  artists: Artist[];
}

/**
 * "All shows by time" overview. Every set on the active day, across
 * every stage, in a single chronological list — bucketed under
 * sticky hour headers so the user can scan to a specific time
 * window without losing context as they scroll.
 *
 * Reuses `ArtistCard` so picks, attendees and overlaps render
 * identically to every other Schedule surface.
 *
 * Hour buckets are anchored to the start of the local hour each set
 * begins in. Late-night sets that cross midnight stay on the same
 * day's list (the schedule data already filters by festival day).
 */
export function StagesOverview({
  artists,
  selectionsByArtist,
  membersById,
  myMemberId,
  myOverlapsByArtist,
}: Props) {
  const buckets = useMemo<HourBucket[]>(() => {
    if (artists.length === 0) return [];
    const sorted = [...artists].sort((a, b) => a.startMs - b.startMs);
    const map = new Map<number, HourBucket>();
    for (const a of sorted) {
      const d = new Date(a.startMs);
      // Snap to the top of the hour the set starts in, in the user's
      // local timezone. Same hour in local time is always the same
      // anchor regardless of DST or which festival day we're on.
      const hourAnchor = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        d.getHours(),
        0,
        0,
        0,
      ).getTime();
      const bucket = map.get(hourAnchor);
      if (bucket) {
        bucket.artists.push(a);
      } else {
        map.set(hourAnchor, { hourMs: hourAnchor, artists: [a] });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.hourMs - b.hourMs);
  }, [artists]);

  if (buckets.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
        No sets scheduled.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {buckets.map((bucket) => (
        <section key={bucket.hourMs} className="space-y-1.5">
          <header className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-md border border-border/60 bg-card/85 px-3 py-2 backdrop-blur supports-backdrop-filter:bg-card/70">
            <span className="flex items-center gap-2 text-sm font-semibold tabular-nums">
              <span className="text-foreground">
                {formatHour(bucket.hourMs)}
              </span>
              <span className="text-muted-foreground">
                – {nextHourLabel(bucket.hourMs)}
              </span>
            </span>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {bucket.artists.length} set
              {bucket.artists.length === 1 ? "" : "s"}
            </span>
          </header>

          <div className="space-y-1.5">
            {bucket.artists.map((a) => {
              const palette = getStagePalette(a.stage);
              const picked = selectionsByArtist.get(a._id) ?? [];
              return (
                <div key={a._id} className="flex items-stretch gap-1.5">
                  <div
                    className="flex w-12 shrink-0 flex-col items-end justify-center text-right text-[10px] tabular-nums"
                    style={{ color: `rgb(${palette.rgb})` }}
                  >
                    <span className="font-semibold">
                      {formatTime(a.startMs)}
                    </span>
                    <span className="text-muted-foreground">
                      {formatTime(a.endMs)}
                    </span>
                  </div>
                  <ArtistCard
                    artist={a}
                    pickedByMemberIds={picked}
                    membersById={membersById}
                    myMemberId={myMemberId}
                    myOverlapping={myOverlapsByArtist.get(a._id)}
                    dayArtists={artists}
                    selectionsByArtist={selectionsByArtist}
                    showStageBadge
                    showTime={false}
                    className="flex-1"
                  />
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * Returns the formatted label for the hour after `hourMs`, e.g.
 * "10pm" given a 9pm anchor. Used as the right side of the bucket
 * header range ("9pm – 10pm").
 */
function nextHourLabel(hourMs: number): string {
  const next = hourMs + 60 * 60 * 1000;
  const h = localHour(next);
  if (Number.isNaN(h)) return "";
  return formatHour(next);
}
