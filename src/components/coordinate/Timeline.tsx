import { MemberChip } from "@/components/MemberChip";
import { getStagePalette } from "@/lib/colors";
import { FESTIVAL_DAY_RANGE_MS, formatHour, type DayKey } from "@/lib/time";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import type { MemberJourney } from "@/lib/coordinate";

interface Props {
  day: DayKey;
  journeys: MemberJourney[];
  membersById: Map<string, Doc<"members">>;
  myMemberId: Id<"members"> | null;
}

export function Timeline({
  day,
  journeys,
  membersById,
  myMemberId,
}: Props) {
  const range = FESTIVAL_DAY_RANGE_MS[day];
  const totalMs = range.end - range.start;
  const slotCount = 13;

  function pct(ms: number): number {
    return Math.max(0, Math.min(100, ((ms - range.start) / totalMs) * 100));
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border/60 bg-card/40">
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="relative h-7 border-b border-border/60 pl-44">
            {Array.from({ length: slotCount }, (_, i) => {
              const ms = range.start + i * 60 * 60 * 1000;
              return (
                <div
                  key={i}
                  className="absolute top-0 -translate-x-1/2 px-1 text-[10px] tabular-nums text-muted-foreground"
                  style={{ left: `calc(176px + (100% - 176px) * ${pct(ms) / 100})` }}
                >
                  {formatHour(ms)}
                </div>
              );
            })}
          </div>

          {journeys.map((j) => {
            const m = membersById.get(j.memberId);
            if (!m) return null;
            const isMine = j.memberId === myMemberId;
            return (
              <div
                key={j.memberId}
                className="relative flex h-12 items-center border-b border-border/40 last:border-b-0"
              >
                <div className="z-10 flex w-44 shrink-0 items-center gap-2 border-r border-border/60 px-2 py-1 text-xs">
                  <MemberChip
                    name={m.name}
                    color={m.color}
                    size="sm"
                    isYou={isMine}
                    truncate
                  />
                </div>
                <div className="relative h-full flex-1">
                  {j.buffers.map((b, i) => (
                    <div
                      key={`b-${i}`}
                      className="absolute top-1 bottom-1 rounded-sm border border-dashed border-amber-400/30 bg-amber-500/5"
                      style={{
                        left: `${pct(b.start)}%`,
                        width: `${pct(b.end) - pct(b.start)}%`,
                      }}
                      title={`Buffer · ${formatHour(b.start)}–${formatHour(b.end)}`}
                    />
                  ))}
                  {j.artists.map((a) => {
                    const palette = getStagePalette(a.stage);
                    return (
                      <div
                        key={a._id}
                        className="absolute top-2 bottom-2 overflow-hidden rounded-md border text-[10px] font-medium"
                        style={{
                          left: `${pct(a.startMs)}%`,
                          width: `${Math.max(1, pct(a.endMs) - pct(a.startMs))}%`,
                          backgroundColor: `rgb(${palette.rgb} / 0.35)`,
                          borderColor: `rgb(${palette.rgb})`,
                          color: `rgb(${palette.rgb})`,
                        }}
                        title={`${a.name} · ${a.stage}`}
                      >
                        <div className="truncate px-1.5 leading-7">
                          {a.name}
                        </div>
                      </div>
                    );
                  })}
                  {j.artists.length === 0 && (
                    <div className="absolute inset-0 flex items-center px-3 text-[11px] italic text-muted-foreground">
                      No picks for this day
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
