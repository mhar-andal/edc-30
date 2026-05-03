import { useEffect, useMemo, useState } from "react";
import { ArtistCard } from "./ArtistCard";
import { STAGE_NAMES, getStagePalette } from "@/lib/colors";
import type { Id } from "../../../convex/_generated/dataModel";
import { formatTime, isLateNight } from "@/lib/time";
import type { Artist, Member } from "@/lib/useScheduleData";
import { cn } from "@/lib/utils";

interface Props {
  artists: Artist[];
  selectionsByArtist: Map<string, Array<Id<"members">>>;
  membersById: Map<string, Member>;
  myMemberId: Id<"members"> | null;
  myOverlapsByArtist: Map<string, Artist[]>;
  /** When true, ignore the stage rail and show a flat chronological list across all stages. */
  flatten?: boolean;
}

const STAGE_LABELS: Record<string, string> = {
  "Kinetic Field": "Kinetic",
  "Circuit Grounds": "Circuit",
  "Cosmic Meadow": "Cosmic",
  Basspod: "Basspod",
  "Neon Garden": "Neon",
  "Quantum Valley": "Quantum",
  Stereobloom: "Stereo",
  Wasteland: "Wasteland",
  "Bionic Jungle": "Bionic",
};

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
    <div className="flex gap-2">
      <nav
        aria-label="Stages"
        className="sticky top-14 flex h-fit w-20 shrink-0 flex-col gap-0.5 self-start rounded-lg border border-border/60 bg-card/30 p-1"
      >
        {visibleStages.map((s) => {
          const p = getStagePalette(s);
          const active = stage === s;
          const dim = !active && (countsByStage.get(s) ?? 0) === 0;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStage(s)}
              className={cn(
                "flex items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] font-medium leading-tight transition-colors",
                active
                  ? "bg-secondary/70"
                  : dim
                    ? "text-muted-foreground/50"
                    : "text-muted-foreground hover:bg-secondary/30 hover:text-foreground",
              )}
              style={{
                color: active ? `rgb(${p.rgb})` : undefined,
              }}
            >
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: `rgb(${p.rgb})` }}
              />
              <span className="min-w-0 flex-1 truncate">
                {STAGE_LABELS[s] ?? s}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div
          className="flex items-center gap-2 rounded-md px-2 py-1 text-xs font-semibold"
          style={{
            color: `rgb(${palette.rgb})`,
            backgroundColor: `rgb(${palette.rgb} / 0.12)`,
          }}
        >
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: `rgb(${palette.rgb})` }}
          />
          {stage}
        </div>
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
