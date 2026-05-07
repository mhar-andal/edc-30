import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { MemberChip } from "@/components/MemberChip";
import { CommentsSection } from "@/components/comments/CommentsSection";
import {
  MeetupSpotPicker,
  type MeetTimeContext,
} from "./MeetupSpotPicker";
import { convergenceOwnerId } from "@/lib/convergenceKey";
import { formatRange, formatTime, type DayKey } from "@/lib/time";
import { getStagePalette } from "@/lib/colors";
import { cn } from "@/lib/utils";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import type { Convergence } from "@/lib/coordinate";

interface Props {
  day: DayKey;
  conv: Convergence;
  membersById: Map<string, Doc<"members">>;
  meetupsByKey: Map<string, Doc<"meetups">>;
  myMemberId: Id<"members"> | null;
  meetupKey: string;
  /** When true, the card pulses with a primary-colored ring to draw the eye. */
  highlighted?: boolean;
}

const OUTSIDE_LABEL = "Start of day";

export function ConvergenceCard({
  day,
  conv,
  membersById,
  meetupsByKey,
  myMemberId,
  meetupKey,
  highlighted,
}: Props) {
  const existing = meetupsByKey.get(meetupKey);
  const toArtist = conv.destinationArtist;
  const toPalette = getStagePalette(toArtist.stage);

  // Group members by their origin stage for the layout the user
  // requested. Origins are ordered by earliest buffer start so the
  // visual order has some temporal sense to it.
  const groups = groupMembersByOrigin(conv, membersById);

  // Reference info for the meet-time dialog: each distinct origin set
  // (with its end time) and the destination set (with its start time),
  // so the user has the relevant timing context while picking a time.
  const timeContext = useMemo<MeetTimeContext>(() => {
    const byArtist = new Map<
      string,
      MeetTimeContext["origins"][number]
    >();
    for (const [memberId, buffer] of conv.byMember) {
      const member = membersById.get(memberId);
      if (!member) continue;
      const origin = buffer.fromArtist;
      if (!origin) continue;
      const existing = byArtist.get(origin._id);
      const memberEntry = {
        id: member._id,
        name: member.name,
        color: member.color,
        isYou: member._id === myMemberId,
      };
      if (existing) {
        if (!existing.members.some((m) => m.id === memberEntry.id)) {
          existing.members.push(memberEntry);
        }
      } else {
        byArtist.set(origin._id, {
          artistName: origin.name,
          stage: origin.stage,
          endMs: origin.endMs,
          members: [memberEntry],
        });
      }
    }
    return {
      destinationArtistName: conv.destinationArtist.name,
      destinationStage: conv.destinationStage,
      destinationStartMs: conv.destinationArtist.startMs,
      origins: Array.from(byArtist.values()).sort(
        (a, b) => a.endMs - b.endMs,
      ),
    };
  }, [conv, membersById, myMemberId]);

  return (
    <div
      data-meetup-key={meetupKey}
      className={cn(
        "rounded-xl border border-border/60 bg-card/40 p-4 shadow-sm transition-all duration-300",
        highlighted &&
          "border-primary bg-primary/10 ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
    >
      <ConvergenceTimeHeader
        windowStart={conv.windowStart}
        windowEnd={conv.windowEnd}
        meetMs={existing?.meetMs}
        meetEndMs={existing?.meetEndMs}
      />
      <div
        className="mt-2 flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-sm"
        style={{
          backgroundColor: `rgb(${toPalette.rgb} / 0.12)`,
          color: `rgb(${toPalette.rgb})`,
          boxShadow: `inset 0 0 0 1px rgb(${toPalette.rgb} / 0.4)`,
        }}
      >
        <span className="text-[11px] uppercase tracking-wide opacity-80">
          Heading to
        </span>
        <span className="font-semibold">{toArtist.name}</span>
        <span className="opacity-80">· {toArtist.stage}</span>
        <span className="ml-auto text-[11px] font-normal tabular-nums opacity-70">
          {formatTime(toArtist.startMs)}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {groups.map((g) => (
          <OriginGroupRow
            key={g.originKey}
            group={g}
            myMemberId={myMemberId}
          />
        ))}
      </div>

      <div className="mt-3 rounded-lg border border-border/60 bg-background/30 p-3">
        <MeetupSpotPicker
          day={day}
          windowStart={conv.windowStart}
          windowEnd={conv.windowEnd}
          destinationStage={conv.destinationStage}
          existing={existing}
          myMemberId={myMemberId}
          timeContext={timeContext}
        />
      </div>

      <div className="mt-3 rounded-lg border border-border/60 bg-background/30 p-3">
        <CommentsSection
          ownerType="convergence"
          ownerId={convergenceOwnerId({
            day,
            windowStartMs: conv.windowStart,
            windowEndMs: conv.windowEnd,
            destinationStage: conv.destinationStage,
          })}
          myMemberId={myMemberId}
          membersById={membersById}
        />
      </div>
    </div>
  );
}

function ConvergenceTimeHeader({
  windowStart,
  windowEnd,
  meetMs,
  meetEndMs,
}: {
  windowStart: number;
  windowEnd: number;
  meetMs: number | undefined;
  meetEndMs: number | undefined;
}) {
  const hasMeetStart = typeof meetMs === "number";
  const hasMeetRange =
    hasMeetStart && typeof meetEndMs === "number" && meetEndMs > (meetMs as number);
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "text-sm font-semibold tabular-nums",
            hasMeetStart ? "text-emerald-200" : "text-foreground",
          )}
        >
          {hasMeetRange
            ? `${formatTime(meetMs as number)} – ${formatTime(meetEndMs as number)}`
            : hasMeetStart
              ? `Gather ${formatTime(meetMs as number)}`
              : formatRange(windowStart, windowEnd)}
        </span>
        {hasMeetStart && (
          <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300">
            Meet window
          </span>
        )}
      </div>
      {hasMeetStart && (
        <span className="text-[11px] tabular-nums text-muted-foreground">
          Available {formatRange(windowStart, windowEnd)}
        </span>
      )}
    </div>
  );
}

interface OriginGroup {
  originKey: string;
  originLabel: string;
  originStage: string | null;
  earliestStart: number;
  members: Array<{
    member: Doc<"members">;
    bufferStart: number;
    bufferEnd: number;
  }>;
}

function groupMembersByOrigin(
  conv: Convergence,
  membersById: Map<string, Doc<"members">>,
): OriginGroup[] {
  const map = new Map<string, OriginGroup>();
  for (const [memberId, buffer] of conv.byMember) {
    const member = membersById.get(memberId);
    if (!member) continue;
    const originStage = buffer.fromArtist?.stage ?? null;
    const originLabel = buffer.fromArtist?.stage ?? OUTSIDE_LABEL;
    const originKey = originStage ?? "__outside";
    const existing = map.get(originKey);
    const entry = {
      member,
      bufferStart: buffer.start,
      bufferEnd: buffer.end,
    };
    if (existing) {
      existing.members.push(entry);
      existing.earliestStart = Math.min(
        existing.earliestStart,
        buffer.start,
      );
    } else {
      map.set(originKey, {
        originKey,
        originLabel,
        originStage,
        earliestStart: buffer.start,
        members: [entry],
      });
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => a.earliestStart - b.earliestStart,
  );
}

function OriginGroupRow({
  group,
  myMemberId,
}: {
  group: OriginGroup;
  myMemberId: Id<"members"> | null;
}) {
  const palette = group.originStage ? getStagePalette(group.originStage) : null;
  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-2.5">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          From
        </span>
        {palette ? (
          <span
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium"
            style={{
              backgroundColor: `rgb(${palette.rgb} / 0.2)`,
              color: `rgb(${palette.rgb})`,
            }}
          >
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: `rgb(${palette.rgb})` }}
            />
            {group.originLabel}
          </span>
        ) : (
          <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {OUTSIDE_LABEL}
          </span>
        )}
        <ArrowRight className="size-3 text-muted-foreground" />
        <div className="flex flex-wrap items-center gap-1">
          {group.members.map(({ member }) => (
            <MemberChip
              key={member._id}
              name={member.name}
              color={member.color}
              size="xs"
              isYou={member._id === myMemberId}
              truncate
            />
          ))}
        </div>
      </div>
    </div>
  );
}
