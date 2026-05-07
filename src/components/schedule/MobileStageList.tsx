import { useEffect, useMemo, useState } from "react";
import { ArtistCard } from "./ArtistCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STAGE_NAMES, getStagePalette } from "@/lib/colors";
import type { Id } from "../../../convex/_generated/dataModel";
import { formatTime, isLateNight } from "@/lib/time";
import type { Artist, Member } from "@/lib/useScheduleData";

interface Props {
  artists: Artist[];
  selectionsByArtist: Map<string, Array<Id<"members">>>;
  membersById: Map<string, Member>;
  myMemberId: Id<"members"> | null;
  myOverlapsByArtist: Map<string, Artist[]>;
  /** When true, ignore the stage selector and show a flat chronological list across all stages. */
  flatten?: boolean;
}

export function MobileStageList({
  artists,
  selectionsByArtist,
  membersById,
  myMemberId,
  myOverlapsByArtist,
  flatten,
}: Props) {
  const visibleStages = useMemo(() => [...STAGE_NAMES], []);
  const [stage, setStage] = useState<string>(visibleStages[0] ?? STAGE_NAMES[0]);

  const countsByStage = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of artists) m.set(a.stage, (m.get(a.stage) ?? 0) + 1);
    return m;
  }, [artists]);

  // Auto-jump to a stage with results if the current one is empty after search/filter.
  useEffect(() => {
    if (flatten) return;
    if (artists.length === 0) return;
    const hasOnCurrent = (countsByStage.get(stage) ?? 0) > 0;
    if (!hasOnCurrent) {
      const fallback = visibleStages.find(
        (s) => (countsByStage.get(s) ?? 0) > 0,
      );
      if (fallback) setStage(fallback);
    }
  }, [artists.length, countsByStage, stage, flatten, visibleStages]);

  if (flatten) {
    if (artists.length === 0) {
      return (
        <div className="rounded-md border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
          No artists match.
        </div>
      );
    }
    return (
      <div className="space-y-1.5">
        {artists.map((a) => {
          const palette = getStagePalette(a.stage);
          const picked = selectionsByArtist.get(a._id) ?? [];
          return (
            <div key={a._id} className="flex items-stretch gap-2">
              <div
                className="flex w-14 flex-col items-end justify-center text-right text-[10px] tabular-nums"
                style={{ color: `rgb(${palette.rgb})` }}
              >
                <span className="font-semibold">{formatTime(a.startMs)}</span>
                <span className="text-muted-foreground">
                  {formatTime(a.endMs)}
                  {isLateNight(a.endMs) && a.crossesMidnight ? "+" : ""}
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
    );
  }

  const stageArtists = artists.filter((a) => a.stage === stage);
  const palette = getStagePalette(stage);

  return (
    <div className="space-y-2">
      <Select value={stage} onValueChange={setStage}>
        <SelectTrigger
          aria-label="Stage"
          className="h-10 w-full border-border/60 bg-card/40 font-medium"
          style={{
            color: `rgb(${palette.rgb})`,
          }}
        >
          <SelectValue>
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: `rgb(${palette.rgb})` }}
              />
              <span className="truncate">{stage}</span>
              <span className="text-[11px] font-normal text-muted-foreground tabular-nums">
                · {countsByStage.get(stage) ?? 0}
              </span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {visibleStages.map((s) => {
            const p = getStagePalette(s);
            const count = countsByStage.get(s) ?? 0;
            return (
              <SelectItem key={s} value={s}>
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: `rgb(${p.rgb})` }}
                  />
                  <span style={{ color: `rgb(${p.rgb})` }}>{s}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {count}
                  </span>
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      <div className="min-w-0 space-y-1.5">
        {stageArtists.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
            No sets on {stage}.
          </div>
        ) : (
          stageArtists.map((a) => {
            const picked = selectionsByArtist.get(a._id) ?? [];
            return (
              <div key={a._id} className="flex items-stretch gap-1.5">
                <div
                  className="flex w-12 flex-col items-end justify-center text-right text-[10px] tabular-nums"
                  style={{ color: `rgb(${palette.rgb})` }}
                >
                  <span className="font-semibold">{formatTime(a.startMs)}</span>
                  <span className="text-muted-foreground">
                    {formatTime(a.endMs)}
                    {isLateNight(a.endMs) && a.crossesMidnight ? "+" : ""}
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
                  showTime={false}
                  className="flex-1"
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
