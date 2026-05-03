import { useMemo } from "react";
import { ArtistCard } from "./ArtistCard";
import { STAGE_NAMES, getStagePalette } from "@/lib/colors";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  FESTIVAL_DAY_RANGE_MS,
  FESTIVAL_DAY_HOURS,
  formatHour,
  type DayKey,
} from "@/lib/time";
import type { Artist, Member } from "@/lib/useScheduleData";

interface Props {
  day: DayKey;
  artists: Artist[];
  selectionsByArtist: Map<string, Array<Id<"members">>>;
  membersById: Map<string, Member>;
  myMemberId: Id<"members"> | null;
  myOverlapsByArtist: Map<string, Artist[]>;
}

const PIXELS_PER_HOUR = 80;

export function DesktopGrid({
  day,
  artists,
  selectionsByArtist,
  membersById,
  myMemberId,
  myOverlapsByArtist,
}: Props) {
  const range = FESTIVAL_DAY_RANGE_MS[day];
  const totalHeight = FESTIVAL_DAY_HOURS * PIXELS_PER_HOUR;

  const visibleStages = STAGE_NAMES;

  const hourMarkers = useMemo(() => {
    const markers: Array<{ ms: number; label: string; topPx: number }> = [];
    const slots = Math.ceil(FESTIVAL_DAY_HOURS) + 1;
    for (let i = 0; i < slots; i++) {
      const ms = range.start + i * 60 * 60 * 1000;
      markers.push({
        ms,
        label: formatHour(ms),
        topPx: i * PIXELS_PER_HOUR,
      });
    }
    return markers;
  }, [range.start]);

  return (
    <div className="rounded-lg border border-border/60 bg-card/40">
      <div className="overflow-x-auto">
        <div className="relative" style={{ minWidth: visibleStages.length * 200 + 64 }}>
          <div
            className="sticky top-0 z-20 grid items-stretch border-b border-border/60 bg-card/95 backdrop-blur"
            style={{
              gridTemplateColumns: `64px repeat(${visibleStages.length}, minmax(180px, 1fr))`,
            }}
          >
            <div className="border-r border-border/60 px-2 py-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              Time
            </div>
            {visibleStages.map((stage) => {
              const palette = getStagePalette(stage);
              return (
                <div
                  key={stage}
                  className="border-r border-border/60 px-2 py-2 text-xs font-semibold last:border-r-0"
                  style={{ color: `rgb(${palette.rgb})` }}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: `rgb(${palette.rgb})` }}
                    />
                    {stage}
                  </span>
                </div>
              );
            })}
          </div>

          <div
            className="relative grid"
            style={{
              gridTemplateColumns: `64px repeat(${visibleStages.length}, minmax(180px, 1fr))`,
              height: totalHeight,
            }}
          >
            <div className="relative border-r border-border/60">
              {hourMarkers.map((m) => (
                <div
                  key={m.ms}
                  className="absolute -translate-y-1/2 px-2 text-[10px] tabular-nums text-muted-foreground"
                  style={{ top: m.topPx }}
                >
                  {m.label}
                </div>
              ))}
            </div>

            {visibleStages.map((stage) => (
              <div
                key={stage}
                className="relative border-r border-border/60 last:border-r-0"
              >
                {hourMarkers.slice(1).map((m) => (
                  <div
                    key={m.ms}
                    className="absolute left-0 right-0 border-t border-dashed border-border/30"
                    style={{ top: m.topPx }}
                  />
                ))}

                {artists
                  .filter((a) => a.stage === stage)
                  .map((a) => {
                    const startOffset = Math.max(
                      0,
                      ((a.startMs - range.start) / 3600000) * PIXELS_PER_HOUR,
                    );
                    const heightPx = Math.max(
                      28,
                      ((a.endMs - a.startMs) / 3600000) * PIXELS_PER_HOUR,
                    );
                    const picked = selectionsByArtist.get(a._id) ?? [];
                    return (
                      <div
                        key={a._id}
                        className="absolute left-1 right-1"
                        style={{ top: startOffset, height: heightPx }}
                      >
                        <ArtistCard
                          artist={a}
                          pickedByMemberIds={picked}
                          membersById={membersById}
                          myMemberId={myMemberId}
                          myOverlapping={myOverlapsByArtist.get(a._id)}
                          density="compact"
                          showTime={false}
                          className="h-full"
                        />
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
