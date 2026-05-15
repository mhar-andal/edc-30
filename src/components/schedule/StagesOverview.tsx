import { useMemo } from "react";
import { ChevronDown, Clock } from "lucide-react";
import { ArtistCard } from "./ArtistCard";
import { getStagePalette } from "@/lib/colors";
import type { Id } from "../../../convex/_generated/dataModel";
import { formatHour, formatTime, localHour } from "@/lib/time";
import type { Artist, Member } from "@/lib/useScheduleData";
import { cn } from "@/lib/utils";

interface Props {
  artists: Artist[];
  selectionsByArtist: Map<string, Array<Id<"members">>>;
  membersById: Map<string, Member>;
  myMemberId: Id<"members"> | null;
  myOverlapsByArtist: Map<string, Artist[]>;
  /**
   * Hour anchors (top-of-hour ms timestamps) that the user has
   * collapsed. Lifted to the parent so the schedule toolbar can
   * render a "Collapse all / Expand all" affordance on the same
   * row as the layout switcher.
   */
  collapsedHours: Set<number>;
  onToggleHour: (hourMs: number) => void;
}

export interface HourBucket {
  hourMs: number;
  artists: Artist[];
}

/**
 * Pure bucketing of artists into top-of-the-local-hour groups.
 * Exported so the parent can compute the same buckets to drive
 * the "Collapse all" toolbar without duplicating the logic.
 */
export function bucketArtistsByHour(artists: Artist[]): HourBucket[] {
  if (artists.length === 0) return [];
  const sorted = [...artists].sort((a, b) => a.startMs - b.startMs);
  const map = new Map<number, HourBucket>();
  for (const a of sorted) {
    const d = new Date(a.startMs);
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
  collapsedHours,
  onToggleHour,
}: Props) {
  const buckets = useMemo<HourBucket[]>(
    () => bucketArtistsByHour(artists),
    [artists],
  );

  if (buckets.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
        No sets scheduled.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {buckets.map((bucket) => {
        const isCollapsed = collapsedHours.has(bucket.hourMs);
        return (
          <section key={bucket.hourMs} className="space-y-1.5">
            <button
              type="button"
              onClick={() => onToggleHour(bucket.hourMs)}
              aria-expanded={!isCollapsed}
              aria-controls={`hour-bucket-${bucket.hourMs}`}
              className="sticky top-0 z-10 flex w-full items-center justify-between gap-2 rounded-md border border-primary/30 border-l-4 border-l-primary bg-gradient-to-r from-primary/15 via-primary/5 to-transparent px-3 py-2.5 text-left shadow-sm shadow-primary/10 backdrop-blur transition-colors supports-backdrop-filter:from-primary/20 supports-backdrop-filter:via-primary/10 hover:from-primary/25 hover:via-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <span className="flex items-center gap-2 tabular-nums">
                <Clock className="size-4 shrink-0 text-primary" />
                <span className="text-base font-bold leading-none text-foreground">
                  {formatHour(bucket.hourMs)}
                </span>
                <span className="text-sm font-medium leading-none text-muted-foreground">
                  – {nextHourLabel(bucket.hourMs)}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-primary ring-1 ring-primary/30">
                  {bucket.artists.length} set
                  {bucket.artists.length === 1 ? "" : "s"}
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 text-primary/80 transition-transform duration-200",
                    isCollapsed && "-rotate-90",
                  )}
                  aria-hidden
                />
              </span>
            </button>

            {!isCollapsed && (
              <div
                id={`hour-bucket-${bucket.hourMs}`}
                className="space-y-1.5"
              >
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
            )}
          </section>
        );
      })}
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
